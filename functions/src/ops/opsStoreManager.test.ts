import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { Firestore } from "firebase-admin/firestore";
import {
  OPS_ITEMS_COLLECTION,
  OPS_TRANSITIONS_COLLECTION,
  OPS_RELATIONS_COLLECTION,
  OPS_BOARD_CARDS_COLLECTION,
  OPS_DIGEST_DOC_PATH,
  OPS_BOARD_META_DOC_PATH,
  OpsWriteOfflineError,
  handleOpsCallable,
  pollOpsDigest,
  readBackOpsCounts,
  readPublishedBoardView,
  migrateOpsItems,
  provisionOpsStore,
  invokeOpsWriteWithRetry
} from "./opsStoreManager.js";

/**
 * Deterministic in-memory Firestore double with full transactional semantics,
 * strict `create` collision checking, cursor pagination, and read counters.
 */
class InMemoryFirestore {
  public readonly store = new Map<string, Record<string, unknown>>();
  public docGetReads = 0;
  public queryReads = 0;

  resetReadCounters(): void {
    this.docGetReads = 0;
    this.queryReads = 0;
  }

  private clone<T>(val: T): T {
    return JSON.parse(
      JSON.stringify(val, (_k, v) => {
        if (v && typeof v === "object" && v.constructor && v.constructor.name.includes("Timestamp")) {
          return { _serverTs: true };
        }
        return v;
      })
    );
  }

  doc(docPath: string) {
    const clean = docPath.replace(/^\/+|\/+$/g, "");
    return {
      path: clean,
      id: clean.split("/").pop() || "",
      get: async () => {
        this.docGetReads += 1;
        const exists = this.store.has(clean);
        const raw = exists ? this.clone(this.store.get(clean)!) : undefined;
        return {
          id: clean.split("/").pop() || "",
          exists,
          data: () => raw,
          get: (field: string) => (raw ? raw[field] : undefined)
        };
      },
      set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
        const next = opts?.merge && this.store.has(clean)
          ? { ...this.store.get(clean)!, ...this.clone(data) }
          : this.clone(data);
        this.store.set(clean, next);
      },
      create: async (data: Record<string, unknown>) => {
        if (this.store.has(clean)) {
          throw new Error(`ALREADY_EXISTS: document ${clean} already exists`);
        }
        this.store.set(clean, this.clone(data));
      },
      delete: async () => {
        this.store.delete(clean);
      }
    };
  }

  collection(colPath: string) {
    const prefix = colPath.replace(/^\/+|\/+$/g, "") + "/";
    const listMatching = () => {
      const entries: Array<{ id: string; path: string; data: Record<string, unknown> }> = [];
      for (const [k, v] of this.store.entries()) {
        if (k.startsWith(prefix)) {
          const rest = k.slice(prefix.length);
          if (!rest.includes("/")) {
            entries.push({ id: rest, path: k, data: this.clone(v) });
          }
        }
      }
      entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      return entries;
    };

    const buildQuery = (opts: {
      whereField?: string;
      whereVal?: unknown;
      afterId?: string;
      cap?: number;
    }) => ({
      orderBy: () => buildQuery(opts),
      where: (field: string, _op: string, val: unknown) =>
        buildQuery({ ...opts, whereField: field, whereVal: val }),
      startAfter: (cursorId: string) => buildQuery({ ...opts, afterId: cursorId }),
      limit: (n: number) => buildQuery({ ...opts, cap: n }),
      count: () => ({
        get: async () => ({
          data: () => ({ count: listMatching().length })
        })
      }),
      get: async () => {
        this.queryReads += 1;
        let rows = listMatching();
        if (opts.whereField !== undefined) {
          rows = rows.filter((r) => r.data[opts.whereField!] === opts.whereVal);
        }
        if (opts.afterId !== undefined) {
          rows = rows.filter((r) => r.id > opts.afterId!);
        }
        if (opts.cap !== undefined) {
          rows = rows.slice(0, opts.cap);
        }
        return {
          size: rows.length,
          docs: rows.map((r) => ({
            id: r.id,
            data: () => r.data
          }))
        };
      }
    });

    return {
      ...buildQuery({}),
      doc: (id: string) => this.doc(`${colPath}/${id}`)
    };
  }

  async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    const stagedSets = new Map<string, Record<string, unknown>>();
    const stagedCreates = new Map<string, Record<string, unknown>>();
    const stagedDeletes = new Set<string>();

    const tx = {
      get: async (ref: { path: string }) => {
        return this.doc(ref.path).get();
      },
      set: (ref: { path: string }, data: Record<string, unknown>) => {
        stagedDeletes.delete(ref.path);
        stagedSets.set(ref.path, this.clone(data));
      },
      create: (ref: { path: string }, data: Record<string, unknown>) => {
        if (this.store.has(ref.path) || stagedCreates.has(ref.path) || stagedSets.has(ref.path)) {
          throw new Error(`ALREADY_EXISTS: transition/doc ${ref.path} is immutable`);
        }
        stagedDeletes.delete(ref.path);
        stagedCreates.set(ref.path, this.clone(data));
      },
      delete: (ref: { path: string }) => {
        stagedSets.delete(ref.path);
        stagedCreates.delete(ref.path);
        stagedDeletes.add(ref.path);
      }
    };

    const result = await fn(tx);
    for (const delPath of stagedDeletes) {
      this.store.delete(delPath);
    }
    for (const [k, v] of stagedCreates.entries()) {
      if (this.store.has(k)) {
        throw new Error(`ALREADY_EXISTS: ${k}`);
      }
      this.store.set(k, v);
    }
    for (const [k, v] of stagedSets.entries()) {
      this.store.set(k, v);
    }
    return result;
  }
}

function makeOperatorReq(data: unknown, uid = "operator-1"): CallableRequest {
  return {
    data,
    auth: {
      uid,
      token: {
        opsOperator: true,
        email: "operator@example.org"
      }
    }
  } as unknown as CallableRequest;
}

describe("todo281: Ops Issue Store Manager & Write Gate", () => {
  it("rejects unauthenticated and non-operator callers at the write gate", async () => {
    const mem = new InMemoryFirestore();
    const db = mem as unknown as Firestore;

    // 1. Unauthenticated caller
    await assert.rejects(
      () =>
        handleOpsCallable(
          { data: { op: "poll_digest" }, auth: undefined } as unknown as CallableRequest,
          db
        ),
      (err: unknown) => err instanceof HttpsError && err.code === "unauthenticated"
    );

    // 2. Signed-in normal product user without opsOperator custom claim
    await assert.rejects(
      () =>
        handleOpsCallable(
          {
            data: {
              op: "put",
              idempotencyKey: "k1",
              code: "todo900",
              title: "Unauthorized write",
              provenance: { discovered_from: "test:1" }
            },
            auth: { uid: "normal-user-1", token: { email: "member@example.org" } }
          } as unknown as CallableRequest,
          db
        ),
      (err: unknown) => err instanceof HttpsError && err.code === "permission-denied"
    );
  });

  it("enforces all §2 invariants (provenance, close evidence, MIPA-66 blocked condition, waiting_on_Ted options)", async () => {
    const mem = new InMemoryFirestore();
    const db = mem as unknown as Firestore;

    // 1. Missing provenance.discovered_from on intake -> refused
    await assert.rejects(
      () =>
        handleOpsCallable(
          makeOperatorReq({
            op: "put",
            idempotencyKey: "inv-1",
            code: "todo901",
            title: "Missing provenance"
          }),
          db
        ),
      (err: unknown) =>
        err instanceof HttpsError &&
        err.code === "invalid-argument" &&
        err.message.includes("provenance.discovered_from")
    );

    // Create a valid item
    await handleOpsCallable(
      makeOperatorReq({
        op: "put",
        idempotencyKey: "inv-create",
        code: "todo901",
        title: "Valid ops item",
        provenance: { discovered_from: "audit:todo281" },
        relations: { blocks: ["todo902"] }
      }),
      db
    );

    // 2. Close without evidence.command / evidence.read_back -> refused naming missing field
    await assert.rejects(
      () =>
        handleOpsCallable(
          makeOperatorReq({
            op: "close",
            idempotencyKey: "inv-close-bad",
            code: "todo901",
            evidence: { command: "npm test", read_back: "" }
          }),
          db
        ),
      (err: unknown) =>
        err instanceof HttpsError &&
        err.code === "failed-precondition" &&
        err.message.includes("evidence.read_back")
    );

    // 3. BLOCKED with prose-only unblock condition -> refused quoting MIPA-66
    await assert.rejects(
      () =>
        handleOpsCallable(
          makeOperatorReq({
            op: "transition",
            idempotencyKey: "inv-block-prose",
            code: "todo901",
            toMarker: "BLOCKED",
            why: "waiting until things settle down someday",
            modifiers: {
              blocked: {
                reason: "Unclear timing",
                unblock_when: "later when ready"
              }
            }
          }),
          db
        ),
      (err: unknown) =>
        err instanceof HttpsError &&
        err.code === "failed-precondition" &&
        err.message.includes("MIPA-66")
    );

    // BLOCKED with machine-checkable unblock condition -> accepted
    await handleOpsCallable(
      makeOperatorReq({
        op: "transition",
        idempotencyKey: "inv-block-ok",
        code: "todo901",
        toMarker: "BLOCKED",
        why: "gated on todo900",
        modifiers: {
          blocked: {
            reason: "Upstream dependency",
            unblock_when: "card:todo900"
          }
        }
      }),
      db
    );

    // 4. waiting_on_Ted with empty options -> refused
    await assert.rejects(
      () =>
        handleOpsCallable(
          makeOperatorReq({
            op: "put",
            idempotencyKey: "inv-ted-bad",
            code: "todo903",
            title: "Ask Ted without options",
            lane: "ted",
            need: true,
            ask: "Should we proceed?",
            provenance: { discovered_from: "shift:2026-11-28" },
            modifiers: {
              waiting_on_Ted: {
                question: "Should we proceed?",
                options: [],
                recommendation: "Option A"
              }
            }
          }),
          db
        ),
      (err: unknown) =>
        err instanceof HttpsError &&
        err.code === "failed-precondition" &&
        err.message.includes("waiting_on_Ted.options")
    );

    // Close with complete evidence -> accepted
    const closeRes = (await handleOpsCallable(
      makeOperatorReq({
        op: "close",
        idempotencyKey: "inv-close-ok",
        code: "todo901",
        evidence: {
          command: "npm --prefix functions test",
          read_back: "pass 130, fail 0"
        }
      }),
      db
    )) as { ok: boolean; digest: { counts: { items: number; transitions: number; relations: number } } };

    assert.equal(closeRes.ok, true);
    assert.equal(closeRes.digest.counts.items, 1);
    assert.equal(closeRes.digest.counts.transitions, 3);
    assert.equal(closeRes.digest.counts.relations, 1);
    assert.equal(mem.store.has(`${OPS_RELATIONS_COLLECTION}/todo901__blocks__todo902`), true);
    assert.equal(mem.store.has(`${OPS_BOARD_CARDS_COLLECTION}/todo901`), true);
  });

  it("migrates items idempotently: running twice leaves all counts and digest_sha unchanged", async () => {
    const mem = new InMemoryFirestore();
    const db = mem as unknown as Firestore;

    const seedItems = [
      {
        code: "todo101",
        title: "First migrated backlog item",
        marker: "TODO" as const,
        lane: "eng" as const,
        source: "backlog",
        relations: { blocks: ["todo102"] }
      },
      {
        code: "todo102",
        title: "Second migrated backlog item",
        marker: "DONE" as const,
        lane: "closed" as const,
        source: "backlog",
        evidence: { command: "vitest run", read_back: "all green" }
      },
      {
        code: "inbox1",
        title: "Migrated inbox decision",
        marker: "TODO" as const,
        lane: "ted" as const,
        need: true,
        ask: "Approve launch window?",
        source: "inbox"
      }
    ];

    const run1 = await migrateOpsItems(db, { items: seedItems });
    const countsAfterRun1 = await readBackOpsCounts(db);

    assert.equal(run1.itemsCreated, 3);
    assert.equal(run1.transitionsCreated, 3);
    assert.equal(run1.relationsCreated, 1);
    assert.equal(run1.boardCardsCreated, 3);
    assert.equal(countsAfterRun1.items, 3);
    assert.equal(countsAfterRun1.transitions, 3);
    assert.equal(countsAfterRun1.relations, 1);
    assert.equal(countsAfterRun1.board_cards, 3);
    assert.equal(countsAfterRun1.board_meta_card_count, 3);
    assert.equal(countsAfterRun1.digest_exists, true);

    // Run migration a SECOND time with identical inputs -> 0 mutations, identical counts & digest_sha
    const run2 = await migrateOpsItems(db, { items: seedItems });
    const countsAfterRun2 = await readBackOpsCounts(db);

    assert.equal(run2.itemsCreated, 0);
    assert.equal(run2.transitionsCreated, 0);
    assert.equal(run2.relationsCreated, 0);
    assert.equal(run2.boardCardsCreated, 0);
    assert.equal(run2.digestUpdated, false);
    assert.deepEqual(countsAfterRun2, countsAfterRun1);

    // Also verify published board view reads back matching counts
    const boardView = await readPublishedBoardView(db);
    assert.equal(boardView.cards.length, 3);
    assert.equal(boardView.meta?.card_count, 3);

    // Provision run on already-provisioned store is also a zero-write idempotent no-op
    const provAgain = await provisionOpsStore(db, { dryRun: false });
    assert.equal(provAgain.digestUpdated, false);
    assert.equal(provAgain.relationsSynced, 0);
    assert.equal(provAgain.digestSha, countsAfterRun1.digest_sha);
  });

  it("polls the coarse-grained digest in EXACTLY ONE document read regardless of item count", async () => {
    const mem = new InMemoryFirestore();
    const db = mem as unknown as Firestore;

    const seeds = Array.from({ length: 40 }, (_, i) => ({
      code: `todo_poll_${i + 1}`,
      title: `Item ${i + 1}`,
      marker: (i % 2 === 0 ? "TODO" : "DONE") as "TODO" | "DONE",
      lane: (i % 2 === 0 ? "eng" : "closed") as "eng" | "closed",
      ...(i % 2 === 1 ? { evidence: { command: "test", read_back: "ok" } } : {})
    }));
    await migrateOpsItems(db, { items: seeds });
    assert.equal(mem.store.has(OPS_DIGEST_DOC_PATH), true);
    assert.equal(mem.store.has(OPS_BOARD_META_DOC_PATH), true);

    mem.resetReadCounters();
    const firstPoll = await pollOpsDigest(db);
    assert.equal(firstPoll.exists, true);
    assert.equal(firstPoll.changed, true);
    assert.equal(firstPoll.readsIssued, 1);
    assert.equal(mem.docGetReads, 1, "pollOpsDigest must issue exactly 1 doc get");
    assert.equal(mem.queryReads, 0, "pollOpsDigest must issue 0 collection queries");

    // Polling again with unchanged digest_sha -> changed: false, still 1 doc read
    mem.resetReadCounters();
    const secondPoll = await pollOpsDigest(db, firstPoll.digest!.digest_sha);
    assert.equal(secondPoll.changed, false);
    assert.equal(secondPoll.readsIssued, 1);
    assert.equal(mem.docGetReads, 1);
    assert.equal(mem.queryReads, 0);
  });

  it("handles offline writes: fails with NAMED OpsWriteOfflineError when retry disabled, or retries across disconnect/reconnect and lands EXACTLY ONCE", async () => {
    const mem = new InMemoryFirestore();
    const db = mem as unknown as Firestore;

    const payload = {
      op: "put" as const,
      idempotencyKey: "offline-drill-key-001",
      code: "todo_offline_1",
      title: "Created across forced disconnect",
      provenance: { discovered_from: "test:offline-drill" }
    };

    // Case A: Caller offline with retryOnOffline: false -> fails with NAMED OpsWriteOfflineError
    await assert.rejects(
      () =>
        invokeOpsWriteWithRetry(
          async () => {
            const netErr = new Error("fetch failed: ECONNRESET network disconnected");
            throw netErr;
          },
          payload,
          { retryOnOffline: false }
        ),
      (err: unknown) =>
        err instanceof OpsWriteOfflineError &&
        err.name === "OpsWriteOfflineError" &&
        err.code === "functions/unavailable"
    );

    // Case B: Forced disconnect (1st call fails offline before reaching server;
    // 2nd call commits on server BUT drops connection before client receives ack;
    // 3rd call after reconnect replays with same idempotencyKey) -> lands EXACTLY ONCE!
    let transportCallCount = 0;
    const retryResult = await invokeOpsWriteWithRetry(
      async (reqPayload) => {
        transportCallCount += 1;
        if (transportCallCount === 1) {
          throw new OpsWriteOfflineError("Simulated offline disconnect before request");
        }
        const serverRes = (await handleOpsCallable(makeOperatorReq(reqPayload), db)) as {
          ok: true;
          deduplicated: boolean;
          transitionId: string;
        };
        if (transportCallCount === 2) {
          // Committed on server, then socket dropped before client got reply!
          throw new Error("ECONNRESET: socket dropped after server commit");
        }
        return serverRes;
      },
      payload,
      { retryOnOffline: true, maxAttempts: 5, initialBackoffMs: 2 }
    );

    assert.equal(transportCallCount, 3);
    assert.equal(retryResult.attempts, 3);
    assert.equal(retryResult.ok, true);
    assert.equal(retryResult.deduplicated, true, "3rd attempt after server commit must be deduplicated");

    const finalCounts = await readBackOpsCounts(db);
    assert.equal(finalCounts.items, 1, "item must land EXACTLY ONCE");
    assert.equal(finalCounts.transitions, 1, "transition must land EXACTLY ONCE");
    assert.equal(mem.store.has(`${OPS_ITEMS_COLLECTION}/todo_offline_1`), true);
    assert.equal(mem.store.has(`${OPS_TRANSITIONS_COLLECTION}/${retryResult.transitionId}`), true);
  });
});
