// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import {
  OPS_PATHS,
  createOpsWriteGateHandler,
  readOpsDigest
} from "../../functions/src/ops/opsWriteGate";
import {
  OpsGateOfflineError,
  pollOpsDigestViaGate,
  writeViaOpsGate,
  writeViaOpsGateWithRetry
} from "../../functions/src/ops/opsGateClient";

const requireFromFunctions = createRequire(
  path.resolve(__dirname, "../../functions/package.json")
);

function startGateHttpServer(handler) {
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", async () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (raw) {
        try {
          req.body = JSON.parse(raw);
        } catch {
          req.body = raw;
        }
      } else {
        req.body = undefined;
      }

      const expressRes = {
        status(code) {
          res.statusCode = code;
          return {
            json(payload) {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(payload));
            },
            send(payload) {
              res.end(typeof payload === "string" ? payload : JSON.stringify(payload));
            }
          };
        }
      };

      await handler(req, expressRes);
    });
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, port: addr.port, url: `http://127.0.0.1:${addr.port}/opsWriteGate` });
    });
  });
}

function createFaultInjectingTcpProxy(targetPort) {
  let remainingMidflightDrops = 0;
  const openSockets = new Set();

  const proxy = net.createServer((clientSocket) => {
    openSockets.add(clientSocket);
    const upstream = net.createConnection({ host: "127.0.0.1", port: targetPort });
    openSockets.add(upstream);

    let dropped = false;

    clientSocket.on("data", (chunk) => {
      if (!upstream.destroyed) upstream.write(chunk);
    });

    upstream.on("data", (chunk) => {
      if (dropped) return;
      if (remainingMidflightDrops > 0) {
        remainingMidflightDrops -= 1;
        dropped = true;
        // Server has already written its HTTP response (post-Firestore-commit):
        // sever TCP before the client receives the response.
        upstream.destroy();
        clientSocket.destroy();
        return;
      }
      if (!clientSocket.destroyed) clientSocket.write(chunk);
    });

    const cleanup = () => {
      openSockets.delete(clientSocket);
      openSockets.delete(upstream);
      if (!clientSocket.destroyed) clientSocket.destroy();
      if (!upstream.destroyed) upstream.destroy();
    };

    clientSocket.on("error", cleanup);
    upstream.on("error", cleanup);
    clientSocket.on("close", cleanup);
    upstream.on("close", cleanup);
  });

  return new Promise((resolve, reject) => {
    proxy.on("error", reject);
    proxy.listen(0, "127.0.0.1", () => {
      const addr = proxy.address();
      resolve({
        port: addr.port,
        url: `http://127.0.0.1:${addr.port}/opsWriteGate`,
        dropNextResponses(count) {
          remainingMidflightDrops = count;
        },
        async close() {
          for (const sock of openSockets) {
            if (!sock.destroyed) sock.destroy();
          }
          await new Promise((r) => proxy.close(() => r()));
        }
      });
    });
  });
}

function instrumentFirestoreReads(db) {
  const origRequest = db.request;
  const origRequestStream = db.requestStream;
  const stats = {
    rpcCount: 0,
    docsRead: 0,
    calls: []
  };

  db.request = async function (methodName, request, requestTag, retryCodes) {
    stats.rpcCount += 1;
    stats.calls.push({
      kind: "request",
      methodName,
      documents: Array.isArray(request?.documents) ? [...request.documents] : []
    });
    return origRequest.call(this, methodName, request, requestTag, retryCodes);
  };

  db.requestStream = async function (methodName, bidirectional, request, requestTag) {
    stats.rpcCount += 1;
    stats.calls.push({
      kind: "requestStream",
      methodName,
      documents: Array.isArray(request?.documents) ? [...request.documents] : []
    });
    const stream = await origRequestStream.call(this, methodName, bidirectional, request, requestTag);
    const origEmit = stream.emit;
    stream.emit = function (event, ...args) {
      if (event === "data" && args[0]) {
        const chunk = args[0];
        if (chunk.found || chunk.missing || chunk.document) {
          stats.docsRead += 1;
        }
      }
      return origEmit.apply(this, [event, ...args]);
    };
    return stream;
  };

  return {
    reset() {
      stats.rpcCount = 0;
      stats.docsRead = 0;
      stats.calls = [];
    },
    snapshot() {
      return {
        rpcCount: stats.rpcCount,
        docsRead: stats.docsRead,
        calls: stats.calls.map((c) => ({ ...c, documents: [...c.documents] }))
      };
    },
    restore() {
      db.request = origRequest;
      db.requestStream = origRequestStream;
    }
  };
}

async function expectRuleDenied(label, promise) {
  let caught = null;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught, `${label} should be rejected by Firestore security rules`).toBeTruthy();
  expect(caught.code, `${label} expected permission-denied, got ${caught?.code}`).toBe("permission-denied");
  return { label, code: caught.code };
}

describe("todo281: Ops Write Gate, Server-Only Rules, Single-Read Digest & Exactly-Once Durability (Emulator Verified)", { timeout: 90000 }, () => {
  let testEnv;
  let adminApp;
  let adminDb;
  let deleteAdminApp;
  let gateServer;
  let proxy;
  let runId;
  let gateToken;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:5002";
    runId = `${Date.now()}`;
    gateToken = `ops-gate-secret-${runId}`;

    const rules = fs.readFileSync(path.resolve(__dirname, "../../firestore.rules"), "utf8");
    testEnv = await initializeTestEnvironment({
      projectId: "demo-mipa",
      firestore: {
        host: "127.0.0.1",
        port: 5002,
        rules
      }
    });

    const { initializeApp, deleteApp } = requireFromFunctions("firebase-admin/app");
    const { getFirestore } = requireFromFunctions("firebase-admin/firestore");
    deleteAdminApp = deleteApp;
    adminApp = initializeApp({ projectId: "demo-mipa" }, `ops-gate-spec-${runId}`);
    adminDb = getFirestore(adminApp);

    const handler = createOpsWriteGateHandler({
      db: adminDb,
      expectedTokens: { antigravity: gateToken },
      verifyIdToken: async (token) => {
        if (token === `normal-user-jwt-${runId}`) {
          return { uid: `normal-user-${runId}` };
        }
        if (token === `ops-op-jwt-${runId}`) {
          return { uid: `ops-op-${runId}`, opsOperator: true };
        }
        throw new Error("Invalid token");
      }
    });

    gateServer = await startGateHttpServer(handler);
    proxy = await createFaultInjectingTcpProxy(gateServer.port);
  }, 60000);

  afterAll(async () => {
    if (proxy) {
      await proxy.close();
    }
    if (gateServer) {
      await new Promise((r) => gateServer.server.close(() => r()));
    }
    if (testEnv) {
      await testEnv.cleanup();
    }
    if (adminApp && deleteAdminApp) {
      await deleteAdminApp(adminApp);
    }
  }, 30000);

  it("Acceptance 1: denies all direct client reads and writes to ops/ for unauthenticated, normal user, and product org admin", async () => {
    const itemId = `todo281-acc1-${runId}`;
    const transId = `tr-acc1-${runId}`;
    const relId = `${itemId}__blocks__todo282-${runId}`;
    const orgId = `org-acc1-${runId}`;
    const orgAdminUid = `org-admin-${runId}`;
    const normalUid = `normal-user-${runId}`;

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `${OPS_PATHS.ITEMS_COLLECTION}/${itemId}`), {
        id: itemId,
        title: "Protected Ops Card",
        status: "todo"
      });
      await setDoc(doc(db, `${OPS_PATHS.TRANSITIONS_COLLECTION}/${transId}`), {
        id: transId,
        op: "put_item"
      });
      await setDoc(doc(db, `${OPS_PATHS.RELATIONS_COLLECTION}/${relId}`), {
        id: relId,
        fromId: itemId,
        toId: `todo282-${runId}`,
        relationType: "blocks"
      });
      await setDoc(doc(db, OPS_PATHS.DIGEST_DOC), {
        schemaVersion: 1,
        revision: 1
      });
      await setDoc(doc(db, `orgs/${orgId}`), {
        name: "Product Org",
        users: [orgAdminUid, normalUid],
        superAdmins: [orgAdminUid]
      });
    });

    const actors = [
      { name: "unauthenticated", db: testEnv.unauthenticatedContext().firestore() },
      {
        name: "normal-user",
        db: testEnv.authenticatedContext(normalUid, { email: "user@example.org" }).firestore()
      },
      {
        name: "product-org-superAdmin",
        db: testEnv.authenticatedContext(orgAdminUid, { email: "admin@example.org" }).firestore()
      }
    ];

    const proofs = [];
    for (const actor of actors) {
      proofs.push(await expectRuleDenied(`${actor.name} set ops/items/all/forged`, setDoc(doc(actor.db, `${OPS_PATHS.ITEMS_COLLECTION}/forged-${runId}`), { title: "forged" })));
      proofs.push(await expectRuleDenied(`${actor.name} update ops/items/all/${itemId}`, updateDoc(doc(actor.db, `${OPS_PATHS.ITEMS_COLLECTION}/${itemId}`), { status: "done" })));
      proofs.push(await expectRuleDenied(`${actor.name} delete ops/items/all/${itemId}`, deleteDoc(doc(actor.db, `${OPS_PATHS.ITEMS_COLLECTION}/${itemId}`))));
      proofs.push(await expectRuleDenied(`${actor.name} read ops/items/all/${itemId}`, getDoc(doc(actor.db, `${OPS_PATHS.ITEMS_COLLECTION}/${itemId}`))));
      proofs.push(await expectRuleDenied(`${actor.name} set ops/digest`, setDoc(doc(actor.db, OPS_PATHS.DIGEST_DOC), { revision: 999 })));
      proofs.push(await expectRuleDenied(`${actor.name} read ops/digest`, getDoc(doc(actor.db, OPS_PATHS.DIGEST_DOC))));
      proofs.push(await expectRuleDenied(`${actor.name} set ops/transitions/all`, setDoc(doc(actor.db, `${OPS_PATHS.TRANSITIONS_COLLECTION}/forged-${runId}`), { op: "forged" })));
      proofs.push(await expectRuleDenied(`${actor.name} delete ops/transitions/all`, deleteDoc(doc(actor.db, `${OPS_PATHS.TRANSITIONS_COLLECTION}/${transId}`))));
      proofs.push(await expectRuleDenied(`${actor.name} set ops/relations/all`, setDoc(doc(actor.db, `${OPS_PATHS.RELATIONS_COLLECTION}/forged-${runId}`), { relationType: "blocks" })));
      proofs.push(await expectRuleDenied(`${actor.name} nested ops/items/all/.../comments`, setDoc(doc(actor.db, `${OPS_PATHS.ITEMS_COLLECTION}/${itemId}/comments/c1`), { note: "forged" })));
    }

    expect(proofs.length).toBe(30);
    console.info("[todo281][Acceptance 1] Verified 30/30 direct client ops/ operations denied with code=permission-denied across unauthenticated, normal-user, and product-org-superAdmin.");
  });

  it("Acceptance 2: opsWriteGate is the exclusive writer and refuses unauthenticated/normal callers while performing atomic writes for authorized operators", async () => {
    const itemId = `todo281-acc2-${runId}`;
    const otherId = `todo282-acc2-${runId}`;

    // Pre-seed a live card field (acceptance_criteria) via Admin SDK to verify non-destructive merge
    await adminDb.doc(`${OPS_PATHS.ITEMS_COLLECTION}/${itemId}`).set({
      id: itemId,
      title: "Original Card Title",
      status: "todo",
      acceptance_criteria: ["- [ ] Keep existing field intact"]
    });

    // Direct client write fails with permission-denied
    const normalClientDb = testEnv.authenticatedContext(`normal-user-${runId}`).firestore();
    await expectRuleDenied(
      "direct client write before gate",
      setDoc(doc(normalClientDb, `${OPS_PATHS.ITEMS_COLLECTION}/${itemId}`), { status: "hacked" })
    );

    // Unauthenticated call to opsWriteGate fails with 401 OPS_UNAUTHORIZED
    await expect(
      writeViaOpsGate({
        endpoint: gateServer.url,
        op: "put_item",
        idempotencyKey: `unauth-${runId}`,
        payload: { itemId, fields: { status: "in_progress" } }
      })
    ).rejects.toMatchObject({ name: "OpsGateHttpError", code: "OPS_UNAUTHORIZED", status: 401 });

    // Normal authenticated Firebase user call to opsWriteGate fails with 403 OPS_FORBIDDEN
    await expect(
      writeViaOpsGate({
        endpoint: gateServer.url,
        bearerToken: `normal-user-jwt-${runId}`,
        op: "put_item",
        idempotencyKey: `normal-${runId}`,
        payload: { itemId, fields: { status: "in_progress" } }
      })
    ).rejects.toMatchObject({ name: "OpsGateHttpError", code: "OPS_FORBIDDEN", status: 403 });

    // Authorized operator via gate token succeeds, preserves pre-existing fields,
    // and derives actor strictly from credential even when payload/header attempt spoofing.
    const spoofRes = await fetch(gateServer.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Ops-Gate-Token": gateToken,
        "X-Ops-Actor": "spoofed-header-actor"
      },
      body: JSON.stringify({
        op: "put_item",
        idempotencyKey: `put-${runId}`,
        itemId,
        actor: "spoofed-payload-actor",
        fields: {
          status: "in_progress",
          marker: "CLAIMED",
          updatedBy: "spoofed-field-actor",
          createdBy: "spoofed-creator"
        }
      })
    });
    const putRes = await spoofRes.json();
    expect(putRes.ok).toBe(true);
    expect(putRes.deduplicated).toBe(false);

    const itemAfterPut = (await adminDb.doc(`${OPS_PATHS.ITEMS_COLLECTION}/${itemId}`).get()).data();
    expect(itemAfterPut.title).toBe("Original Card Title");
    expect(itemAfterPut.status).toBe("in_progress");
    expect(itemAfterPut.marker).toBe("CLAIMED");
    expect(itemAfterPut.acceptance_criteria).toEqual(["- [ ] Keep existing field intact"]);
    expect(itemAfterPut.updatedBy).toBe("operator:antigravity");
    expect(itemAfterPut.createdBy).toBe("operator:antigravity");

    const putTransition = (await adminDb.doc(`${OPS_PATHS.TRANSITIONS_COLLECTION}/put-${runId}`).get()).data();
    expect(putTransition.actor).toBe("operator:antigravity");

    // Authorized operator via Firebase opsOperator claim adds a comment
    const commentRes = await writeViaOpsGate({
      endpoint: gateServer.url,
      bearerToken: `ops-op-jwt-${runId}`,
      op: "comment_item",
      idempotencyKey: `comment-${runId}`,
      payload: { itemId, note: "Claimed and started work" }
    });
    expect(commentRes.ok).toBe(true);
    expect(commentRes.result.commentCount).toBe(1);

    // Add relation + close item + remove relation
    const relRes = await writeViaOpsGate({
      endpoint: gateServer.url,
      gateToken,
      op: "add_relation",
      idempotencyKey: `rel-add-${runId}`,
      payload: { fromId: itemId, toId: otherId, relationType: "blocks" }
    });
    expect(relRes.ok).toBe(true);
    expect(relRes.result.relationId).toBe(`${itemId}__blocks__${otherId}`);

    const closeRes = await writeViaOpsGate({
      endpoint: gateServer.url,
      gateToken,
      op: "close_item",
      idempotencyKey: `close-${runId}`,
      payload: {
        itemId,
        evidence: "emulator tests green",
        readBack: "verified in firestore"
      }
    });
    expect(closeRes.ok).toBe(true);
    expect(closeRes.result.status).toBe("closed");

    // Verify transition log entries are written in ops/transitions/all
    const closeTransition = await adminDb.doc(`${OPS_PATHS.TRANSITIONS_COLLECTION}/close-${runId}`).get();
    expect(closeTransition.exists).toBe(true);
    expect(closeTransition.data().op).toBe("close_item");
    expect(closeTransition.data().targetId).toBe(itemId);

    // Unsupported mutation of transition log is refused
    await expect(
      writeViaOpsGate({
        endpoint: gateServer.url,
        gateToken,
        op: "delete_transition",
        idempotencyKey: `bad-op-${runId}`,
        payload: { transitionId: `close-${runId}` }
      })
    ).rejects.toMatchObject({ name: "OpsGateHttpError", code: "OPS_INVALID_OPERATION", status: 400 });

    console.info("[todo281][Acceptance 2] Exclusive write gate verified: direct write refused (permission-denied), unauth=401, normal user=403, authorized gate mutations succeeded atomically.");
  });

  it("Acceptance 3: digest poll issues EXACTLY ONE Firestore read even with 314+ items in ops/items/all", async () => {
    // Seed 314 items in ops/items/all to match live mipa-2 queue size
    const batch = adminDb.batch();
    for (let i = 1; i <= 314; i++) {
      const id = `seed314-${runId}-${String(i).padStart(3, "0")}`;
      batch.set(adminDb.doc(`${OPS_PATHS.ITEMS_COLLECTION}/${id}`), {
        id,
        title: `Seeded card ${i}`,
        status: i % 3 === 0 ? "done" : "todo",
        updatedAtIso: "2026-11-28T04:00:00.000Z"
      });
    }
    await batch.commit();

    // Rebuild coarse-grained ops/digest from live collection via opsWriteGate
    const rebuildRes = await writeViaOpsGate({
      endpoint: gateServer.url,
      gateToken,
      op: "rebuild_digest",
      idempotencyKey: `rebuild-${runId}`
    });
    expect(rebuildRes.ok).toBe(true);
    expect(rebuildRes.result.totalItems).toBeGreaterThanOrEqual(314);

    // Instrument @google-cloud/firestore wire RPC layer on adminDb
    const meter = instrumentFirestoreReads(adminDb);
    try {
      // Positive control: scanning ops/items/all returns >= 314 docs on wire
      meter.reset();
      const scanSnap = await adminDb.collection(OPS_PATHS.ITEMS_COLLECTION).limit(500).get();
      const controlStats = meter.snapshot();
      expect(scanSnap.size).toBeGreaterThanOrEqual(314);
      expect(controlStats.docsRead).toBeGreaterThanOrEqual(314);

      // Measured poll 1: HTTP GET via pollOpsDigestViaGate
      meter.reset();
      const httpPoll = await pollOpsDigestViaGate({
        endpoint: gateServer.url,
        gateToken
      });
      const httpPollStats = meter.snapshot();

      expect(httpPoll.ok).toBe(true);
      expect(httpPoll.exists).toBe(true);
      expect(httpPoll.reads).toBe(1);
      expect(httpPoll.digest.counts.totalItems).toBeGreaterThanOrEqual(314);
      expect(httpPollStats.rpcCount).toBe(1);
      expect(httpPollStats.docsRead).toBe(1);
      expect(httpPollStats.calls[0].methodName).toBe("batchGetDocuments");
      expect(httpPollStats.calls[0].documents).toHaveLength(1);
      expect(httpPollStats.calls[0].documents[0]).toMatch(/\/documents\/ops\/views\/all\/digest$/);

      // Measured poll 2: direct server readOpsDigest
      meter.reset();
      const directPoll = await readOpsDigest(adminDb);
      const directPollStats = meter.snapshot();

      expect(directPoll.reads).toBe(1);
      expect(directPollStats.rpcCount).toBe(1);
      expect(directPollStats.docsRead).toBe(1);
      expect(directPollStats.calls[0].documents[0]).toMatch(/\/documents\/ops\/views\/all\/digest$/);

      console.info(
        `[todo281][Acceptance 3] Control scan read ${controlStats.docsRead} docs; ops/views/all/digest HTTP poll issued rpcCount=${httpPollStats.rpcCount}, docsRead=${httpPollStats.docsRead}, method=${httpPollStats.calls[0].methodName}, path=${httpPollStats.calls[0].documents[0]} (totalItems=${httpPoll.digest.counts.totalItems}).`
      );
    } finally {
      meter.restore();
    }
  });

  it("Acceptance 4: offline write fails with named OpsGateOfflineError, and forced disconnect/reconnect lands EXACTLY ONCE with zero duplicates", async () => {
    const itemId = `todo281-acc4-${runId}`;
    await writeViaOpsGate({
      endpoint: gateServer.url,
      gateToken,
      op: "put_item",
      idempotencyKey: `setup-acc4-${runId}`,
      payload: { itemId, fields: { title: "Offline durability target", status: "todo" } }
    });

    // 4A: Offline before reaching gate (unbound port) -> named OpsGateOfflineError + 0 writes
    const closedPortServer = net.createServer();
    await new Promise((r) => closedPortServer.listen(0, "127.0.0.1", r));
    const unusedPort = closedPortServer.address().port;
    await new Promise((r) => closedPortServer.close(r));

    const offlineKey = `idem-offline-${runId}`;
    let offlineErr = null;
    try {
      await writeViaOpsGate({
        endpoint: `http://127.0.0.1:${unusedPort}/opsWriteGate`,
        gateToken,
        op: "comment_item",
        idempotencyKey: offlineKey,
        payload: { itemId, note: "sent while offline" },
        timeoutMs: 2000
      });
    } catch (err) {
      offlineErr = err;
    }

    expect(offlineErr).toBeInstanceOf(OpsGateOfflineError);
    expect(offlineErr.name).toBe("OpsGateOfflineError");
    expect(offlineErr.code).toBe("OPS_GATE_OFFLINE");
    expect(offlineErr.idempotencyKey).toBe(offlineKey);
    expect((await adminDb.doc(`${OPS_PATHS.TRANSITIONS_COLLECTION}/${offlineKey}`).get()).exists).toBe(false);

    // Reconnect and submit with the same idempotencyKey -> lands once
    const afterOfflineRes = await writeViaOpsGate({
      endpoint: proxy.url,
      gateToken,
      op: "comment_item",
      idempotencyKey: offlineKey,
      payload: { itemId, note: "sent while offline" }
    });
    expect(afterOfflineRes.ok).toBe(true);
    expect(afterOfflineRes.deduplicated).toBe(false);

    // 4B: Forced mid-flight TCP disconnect AFTER Firestore commit, BEFORE HTTP response returns
    const digestBeforeMidflight = (await readOpsDigest(adminDb)).digest.revision;
    const midflightKey = `idem-midflight-${runId}`;

    // Arm proxy to kill TCP socket mid-response for 1 connection, then heal automatically
    proxy.dropNextResponses(1);

    let midflightErr = null;
    try {
      await writeViaOpsGate({
        endpoint: proxy.url,
        gateToken,
        op: "comment_item",
        idempotencyKey: midflightKey,
        payload: { itemId, note: "midflight disconnect note" }
      });
    } catch (err) {
      midflightErr = err;
    }

    expect(midflightErr).toBeInstanceOf(OpsGateOfflineError);
    expect(midflightErr.name).toBe("OpsGateOfflineError");
    expect(midflightErr.code).toBe("OPS_GATE_OFFLINE");
    expect(midflightErr.idempotencyKey).toBe(midflightKey);

    // Reconnect and replay with the exact same idempotencyKey -> deduplicates cleanly
    const replayOutcome = await writeViaOpsGate({
      endpoint: proxy.url,
      gateToken,
      op: "comment_item",
      idempotencyKey: midflightKey,
      payload: { itemId, note: "midflight disconnect note" }
    });
    expect(replayOutcome.ok).toBe(true);
    expect(replayOutcome.deduplicated).toBe(true);

    // Verify LIVE Firestore state has ZERO duplicates:
    const itemAfterMidflight = (await adminDb.doc(`${OPS_PATHS.ITEMS_COLLECTION}/${itemId}`).get()).data();
    const matchingComments = (itemAfterMidflight.comments || []).filter((c) => c.id === midflightKey);
    expect(matchingComments).toHaveLength(1);

    const transitionSnap = await adminDb
      .collection(OPS_PATHS.TRANSITIONS_COLLECTION)
      .where("idempotencyKey", "==", midflightKey)
      .get();
    expect(transitionSnap.size).toBe(1);

    const digestAfterMidflight = (await readOpsDigest(adminDb)).digest.revision;
    expect(digestAfterMidflight - digestBeforeMidflight).toBe(1);

    // 4B-auto: Automatic retry wrapper across forced mid-flight disconnect also lands once
    const autoRetryKey = `idem-auto-retry-${runId}`;
    const digestBeforeAutoRetry = digestAfterMidflight;
    proxy.dropNextResponses(1);

    const autoRetryOutcome = await writeViaOpsGateWithRetry({
      endpoint: proxy.url,
      gateToken,
      op: "comment_item",
      idempotencyKey: autoRetryKey,
      payload: { itemId, note: "auto retry across disconnect" },
      maxAttempts: 3,
      backoffMs: 25
    });
    expect(autoRetryOutcome.ok).toBe(true);
    expect(autoRetryOutcome.deduplicated).toBe(true);

    const itemAfterAutoRetry = (await adminDb.doc(`${OPS_PATHS.ITEMS_COLLECTION}/${itemId}`).get()).data();
    expect((itemAfterAutoRetry.comments || []).filter((c) => c.id === autoRetryKey)).toHaveLength(1);
    const digestAfterAutoRetry = (await readOpsDigest(adminDb)).digest.revision;
    expect(digestAfterAutoRetry - digestBeforeAutoRetry).toBe(1);

    // 4C: Concurrent duplicate burst (5 simultaneous callers with same idempotencyKey) -> exactly 1 write
    const burstKey = `idem-burst-${runId}`;
    const digestBeforeBurst = digestAfterAutoRetry;
    const burstResults = await Promise.all(
      Array.from({ length: 5 }, () =>
        writeViaOpsGate({
          endpoint: proxy.url,
          gateToken,
          op: "comment_item",
          idempotencyKey: burstKey,
          payload: { itemId, note: "concurrent burst" }
        })
      )
    );

    expect(burstResults.every((r) => r.ok === true)).toBe(true);
    expect(burstResults.filter((r) => r.deduplicated === false)).toHaveLength(1);
    expect(burstResults.filter((r) => r.deduplicated === true)).toHaveLength(4);

    const itemAfterBurst = (await adminDb.doc(`${OPS_PATHS.ITEMS_COLLECTION}/${itemId}`).get()).data();
    expect((itemAfterBurst.comments || []).filter((c) => c.id === burstKey)).toHaveLength(1);

    const digestAfterBurst = (await readOpsDigest(adminDb)).digest.revision;
    expect(digestAfterBurst - digestBeforeBurst).toBe(1);

    console.info(
      `[todo281][Acceptance 4] Offline threw ${offlineErr.name} (${offlineErr.code}); mid-flight disconnect threw ${midflightErr.name} (${midflightErr.code}) and after reconnect produced comments=${matchingComments.length}, transitions=${transitionSnap.size}, digestDelta=${digestAfterMidflight - digestBeforeMidflight}; auto-retry digestDelta=${digestAfterAutoRetry - digestBeforeAutoRetry}; 5x concurrent burst produced comments=1, digestDelta=${digestAfterBurst - digestBeforeBurst}.`
    );
  });
});
