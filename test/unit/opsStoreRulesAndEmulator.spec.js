import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  disableNetwork,
  enableNetwork
} from "firebase/firestore";
import { scanSourceForUnboundedReads } from "@/utils/unboundedReadsGuard";
import { instrumentFirestoreReadCounter } from "../../scripts/provision-ops-store.mjs";

const reqFromFunctions = createRequire(path.resolve(process.cwd(), "functions/package.json"));
const { initializeApp: initAdminApp, deleteApp: deleteAdminApp } = reqFromFunctions("firebase-admin/app");
const { getFirestore: getAdminFirestore } = reqFromFunctions("firebase-admin/firestore");

// Ensure Admin SDK targets the local Firestore Emulator on port 5002
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:5002";

describe("todo281: Ops Issue Store Security Rules, Write Gate, Idempotent Migration & Offline Semantics (Emulator Verified)", { timeout: 60000 }, () => {
  let testEnv;
  let adminApp;
  let adminDb;
  let opsModule;

  beforeAll(async () => {
    const rules = fs.readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf8");
    testEnv = await initializeTestEnvironment({
      projectId: "demo-mipa",
      firestore: {
        host: "127.0.0.1",
        port: 5002,
        rules
      }
    });

    adminApp = initAdminApp({ projectId: "demo-mipa" }, `ops-admin-test-${Date.now()}`);
    adminDb = getAdminFirestore(adminApp);
    opsModule = await import("../../functions/src/ops/opsStoreManager.ts");
  }, 60000);

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
    if (adminApp) {
      await deleteAdminApp(adminApp);
    }
  }, 30000);

  it("AC1: denies ALL client reads and writes to ops/ for unauthenticated, normal authenticated, and org superAdmin users", async () => {
    await testEnv.clearFirestore();

    const orgId = `org-ops-${Date.now()}`;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `orgs/${orgId}`), {
        name: "Product Org",
        users: ["normal-user-1", "org-admin-1"],
        superAdmins: ["org-admin-1"]
      });
      await setDoc(doc(db, "ops/items/all/todo_seed_1"), {
        code: "todo_seed_1",
        title: "Server-only ops card",
        marker: "TODO"
      });
      await setDoc(doc(db, "ops/transitions/log/tx_seed_1"), {
        code: "todo_seed_1",
        from: null,
        to: "TODO"
      });
      await setDoc(doc(db, "ops/relations/edges/todo_seed_1__blocks__todo_seed_2"), {
        from: "todo_seed_1",
        type: "blocks",
        to: "todo_seed_2"
      });
      await setDoc(doc(db, "ops/board/cards/todo_seed_1"), {
        lane_id: "eng",
        order: 1
      });
      await setDoc(doc(db, "ops/views/meta/digest"), {
        schema_version: 1,
        revision: 1,
        digest_sha: "abc123"
      });
    });

    const unauthDb = testEnv.unauthenticatedContext().firestore();
    const normalUserDb = testEnv.authenticatedContext("normal-user-1", {
      email: "user@example.org",
      email_verified: true
    }).firestore();
    const orgAdminDb = testEnv.authenticatedContext("org-admin-1", {
      email: "admin@example.org",
      email_verified: true
    }).firestore();

    const protectedPaths = [
      "ops/items/all/todo_seed_1",
      "ops/transitions/log/tx_seed_1",
      "ops/relations/edges/todo_seed_1__blocks__todo_seed_2",
      "ops/board/cards/todo_seed_1",
      "ops/views/meta/digest"
    ];

    for (const clientDb of [unauthDb, normalUserDb, orgAdminDb]) {
      for (const existingPath of protectedPaths) {
        const readErr = await assertFails(getDoc(doc(clientDb, existingPath)));
        expect(readErr.code).toContain("permission-denied");

        const updateErr = await assertFails(updateDoc(doc(clientDb, existingPath), { tampered: true }));
        expect(updateErr.code).toContain("permission-denied");

        const deleteErr = await assertFails(deleteDoc(doc(clientDb, existingPath)));
        expect(deleteErr.code).toContain("permission-denied");
      }

      // Attempt new document creation across every ops/ collection
      const createErr = await assertFails(
        setDoc(doc(clientDb, "ops/items/all/forged_item"), { code: "forged_item", title: "Forged" })
      );
      expect(createErr.code).toContain("permission-denied");

      const digestForgeErr = await assertFails(
        setDoc(doc(clientDb, "ops/views/meta/digest"), { digest_sha: "forged" })
      );
      expect(digestForgeErr.code).toContain("permission-denied");
    }
  });

  it("AC2 & AC4: migrates items idempotently on real Firestore Emulator and preserves published board counts", async () => {
    await testEnv.clearFirestore();

    const legacySeeds = [
      {
        code: "todo201",
        title: "Provision ops rules",
        marker: "TODO",
        lane: "eng",
        source: "backlog",
        relations: { blocks: ["todo202"] }
      },
      {
        code: "todo202",
        title: "Wire ops digest poller",
        marker: "BLOCKED",
        lane: "eng",
        source: "backlog",
        fields: { "depends on": "todo201" }
      },
      {
        code: "A10",
        title: "Entity setup decision",
        marker: "DONE",
        lane: "closed",
        source: "inbox",
        evidence: { command: "verify-entity", read_back: "registered" }
      }
    ];

    // Run 1
    const mig1 = await opsModule.migrateOpsItems(adminDb, { items: legacySeeds });
    const counts1 = await opsModule.readBackOpsCounts(adminDb);

    expect(mig1.itemsCreated).toBe(3);
    expect(mig1.transitionsCreated).toBe(3);
    expect(mig1.relationsCreated).toBe(1);
    expect(mig1.boardCardsCreated).toBe(3);
    expect(counts1).toMatchObject({
      items: 3,
      transitions: 3,
      relations: 1,
      board_cards: 3,
      digest_exists: true,
      board_meta_card_count: 3
    });

    // Run 2 (idempotence check: 0 items/transitions/relations/cards added, identical counts & digest_sha)
    const mig2 = await opsModule.migrateOpsItems(adminDb, { items: legacySeeds });
    const counts2 = await opsModule.readBackOpsCounts(adminDb);

    expect(mig2.itemsCreated).toBe(0);
    expect(mig2.transitionsCreated).toBe(0);
    expect(mig2.relationsCreated).toBe(0);
    expect(mig2.boardCardsCreated).toBe(0);
    expect(mig2.digestUpdated).toBe(false);
    expect(counts2).toEqual(counts1);

    // Published board view matches pre-migration counts (2 eng, 1 closed, 3 total)
    const boardView = await opsModule.readPublishedBoardView(adminDb);
    expect(boardView.cards).toHaveLength(3);
    expect(boardView.meta.card_count).toBe(3);
    expect(boardView.meta.counts).toContain("ENGINEERING:2");
    expect(boardView.meta.counts).toContain("RECENTLY CLOSED:1");
  });

  it("AC3: polls the digest in EXACTLY ONE Firestore document read and detects write-gate updates", async () => {
    await testEnv.clearFirestore();

    const seeds = Array.from({ length: 15 }, (_, idx) => ({
      code: `todo_d_${idx + 1}`,
      title: `Seed card ${idx + 1}`,
      marker: "TODO",
      lane: "eng"
    }));
    await opsModule.migrateOpsItems(adminDb, { items: seeds });

    const { db: countedDb, metrics } = instrumentFirestoreReadCounter(adminDb);

    // Poll 1: initial read -> 1 document read
    const poll1 = await opsModule.pollOpsDigest(countedDb);
    expect(poll1.exists).toBe(true);
    expect(poll1.readsIssued).toBe(1);
    expect(metrics.docGets).toBe(1);
    expect(metrics.collectionQueries).toBe(0);
    expect(metrics.pathsRead).toEqual(["ops/views/meta/digest"]);

    // Poll 2 with same digest_sha -> changed: false, 1 document read
    const poll2 = await opsModule.pollOpsDigest(countedDb, poll1.digest.digest_sha);
    expect(poll2.changed).toBe(false);
    expect(metrics.docGets).toBe(2);
    expect(metrics.collectionQueries).toBe(0);

    // Mutate store via Cloud Function write gate (`handleOpsCallable`)
    await opsModule.handleOpsCallable(
      {
        auth: { uid: "op-1", token: { opsOperator: true, email: "op@example.org" } },
        data: {
          op: "put",
          idempotencyKey: "gate-write-1",
          code: "todo_d_16",
          title: "Added through write gate",
          provenance: { discovered_from: "test:ac3" }
        }
      },
      adminDb
    );

    // Poll 3 with previous digest_sha -> changed: true in 1 document read!
    const poll3 = await opsModule.pollOpsDigest(countedDb, poll1.digest.digest_sha);
    expect(poll3.changed).toBe(true);
    expect(poll3.digest.counts.items).toBe(16);
    expect(metrics.docGets).toBe(3);
    expect(metrics.collectionQueries).toBe(0);
  });

  it("AC5: offline write either fails with NAMED OpsWriteOfflineError or retries across forced disconnect/reconnect and lands EXACTLY ONCE", async () => {
    await testEnv.clearFirestore();

    // 1. Real Firebase client SDK forced offline via disableNetwork -> fails with named FirebaseError / OpsWriteOfflineError
    const clientDb = testEnv.unauthenticatedContext().firestore();
    await disableNetwork(clientDb);
    try {
      await expect(
        opsModule.invokeOpsWriteWithRetry(
          async () => {
            await getDoc(doc(clientDb, "ops/views/meta/digest"));
            return { ok: true };
          },
          {
            op: "put",
            idempotencyKey: "offline-failfast-1",
            code: "todo_off_fail",
            title: "Fail fast while offline",
            provenance: { discovered_from: "test:ac5" }
          },
          { retryOnOffline: false }
        )
      ).rejects.toMatchObject({
        name: "OpsWriteOfflineError",
        code: "functions/unavailable"
      });
    } finally {
      await enableNetwork(clientDb);
    }

    // 2. Forced disconnect/reconnect during write-gate submission with real Firestore Emulator persistence:
    //    - Attempt 1: disconnected before reaching server
    //    - Attempt 2: server transaction commits to Emulator, then connection drops before ack
    //    - Attempt 3: reconnects and replays same idempotencyKey -> deduplicated!
    const countsBefore = await opsModule.readBackOpsCounts(adminDb);
    expect(countsBefore.items).toBe(0);
    expect(countsBefore.transitions).toBe(0);

    let networkAttempt = 0;
    const writeRes = await opsModule.invokeOpsWriteWithRetry(
      async (payload) => {
        networkAttempt += 1;
        if (networkAttempt === 1) {
          throw new opsModule.OpsWriteOfflineError("Forced disconnect: network unreachable");
        }
        const committed = await opsModule.handleOpsCallable(
          {
            auth: { uid: "op-1", token: { opsOperator: true, email: "op@example.org" } },
            data: payload
          },
          adminDb
        );
        if (networkAttempt === 2) {
          throw new Error("ECONNRESET: forced disconnect after server commit before client ack");
        }
        return committed;
      },
      {
        op: "put",
        idempotencyKey: "reconnect-exact-once-key-42",
        code: "todo_reconnect_1",
        title: "Lands once across disconnect/reconnect",
        provenance: { discovered_from: "test:ac5-reconnect" },
        relations: { part_of: ["todo281"] }
      },
      { retryOnOffline: true, maxAttempts: 4, initialBackoffMs: 5 }
    );

    expect(writeRes.ok).toBe(true);
    expect(writeRes.attempts).toBe(3);
    expect(writeRes.deduplicated).toBe(true);

    const countsAfter = await opsModule.readBackOpsCounts(adminDb);
    expect(countsAfter.items).toBe(1);
    expect(countsAfter.transitions).toBe(1);
    expect(countsAfter.relations).toBe(1);
    expect(countsAfter.board_cards).toBe(1);
  });

  it("passes the MIPA-45 unbounded Firestore read static guard with zero violations", () => {
    const sourcePath = path.resolve(process.cwd(), "functions/src/ops/opsStoreManager.ts");
    const source = fs.readFileSync(sourcePath, "utf8");
    const scan = scanSourceForUnboundedReads(source, "functions/src/ops/opsStoreManager.ts", []);
    expect(scan.violations).toEqual([]);
  });
});
