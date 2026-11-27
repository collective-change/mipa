// node --test lib/ops/opsWriteGate.test.js
import { test } from "node:test";
import * as assert from "node:assert/strict";
import type { Request, Response } from "firebase-functions/v2/https";
import type { Firestore } from "firebase-admin/firestore";
import {
  OPS_PATHS,
  OpsGateError,
  authenticateOpsCaller,
  createOpsWriteGateHandler,
  isValidOpsDocId,
  readOpsDigest
} from "./opsWriteGate";
import {
  OpsGateHttpError,
  OpsGateOfflineError,
  pollOpsDigestViaGate,
  writeViaOpsGate,
  writeViaOpsGateWithRetry
} from "./opsGateClient";

function makeMockRes() {
  const state: { statusCode: number; body: unknown } = { statusCode: 0, body: undefined };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return {
        json(payload: unknown) {
          state.body = payload;
        },
        send(payload: unknown) {
          state.body = payload;
        }
      };
    }
  } as unknown as Response;
  return { res, state };
}

test("isValidOpsDocId accepts valid ids and rejects path traversal or empty values", () => {
  assert.equal(isValidOpsDocId("todo281"), true);
  assert.equal(isValidOpsDocId("MIPA-12"), true);
  assert.equal(isValidOpsDocId("a1b2.c3:d4_e5-f6"), true);
  assert.equal(isValidOpsDocId("550e8400-e29b-41d4-a716-446655440000"), true);

  assert.equal(isValidOpsDocId(""), false);
  assert.equal(isValidOpsDocId("   "), false);
  assert.equal(isValidOpsDocId(null), false);
  assert.equal(isValidOpsDocId(123), false);
  assert.equal(isValidOpsDocId("../orgs/victim"), false);
  assert.equal(isValidOpsDocId("items/todo281"), false);
  assert.equal(isValidOpsDocId("__proto__"), false);
  assert.equal(isValidOpsDocId("."), false);
  assert.equal(isValidOpsDocId(".."), false);
  assert.equal(isValidOpsDocId("a".repeat(129)), false);
});

test("authenticateOpsCaller fails closed for unauthenticated and normal users, allows token and ops claims", async () => {
  // Missing credentials -> 401
  await assert.rejects(
    () => authenticateOpsCaller({}, { expectedToken: "secret-token" }),
    (err: unknown) => err instanceof OpsGateError && err.code === "OPS_UNAUTHORIZED" && err.httpStatus === 401
  );

  // Wrong gate token -> 401
  await assert.rejects(
    () => authenticateOpsCaller({ "x-ops-gate-token": "wrong-token" }, { expectedToken: "secret-token" }),
    (err: unknown) => err instanceof OpsGateError && err.code === "OPS_UNAUTHORIZED" && err.httpStatus === 401
  );

  // Unconfigured expectedToken with x-ops-gate-token -> still fails closed (401)
  await assert.rejects(
    () => authenticateOpsCaller({ "x-ops-gate-token": "anything" }, { expectedToken: "" }),
    (err: unknown) => err instanceof OpsGateError && err.code === "OPS_UNAUTHORIZED" && err.httpStatus === 401
  );

  // Normal Firebase user without opsAdmin / opsOperator claim -> 403
  await assert.rejects(
    () =>
      authenticateOpsCaller(
        { authorization: "Bearer user-jwt" },
        {
          expectedToken: "secret-token",
          verifyIdToken: async () => ({ uid: "normal-user-1" })
        }
      ),
    (err: unknown) => err instanceof OpsGateError && err.code === "OPS_FORBIDDEN" && err.httpStatus === 403
  );

  // Invalid JWT -> 401
  await assert.rejects(
    () =>
      authenticateOpsCaller(
        { authorization: "Bearer bad-jwt" },
        {
          expectedToken: "secret-token",
          verifyIdToken: async () => {
            throw new Error("expired");
          }
        }
      ),
    (err: unknown) => err instanceof OpsGateError && err.code === "OPS_UNAUTHORIZED" && err.httpStatus === 401
  );

  // Valid X-Ops-Gate-Token derives actor strictly from credential (ignores x-ops-actor header)
  const byHeader = await authenticateOpsCaller(
    { "x-ops-gate-token": "secret-token", "x-ops-actor": "spoofed-header-actor" },
    { expectedTokens: { xin: "secret-token" } }
  );
  assert.deepEqual(byHeader, { authenticated: true, actor: "operator:xin", method: "gate_token" });

  // Valid Bearer single gate token derives deterministic credential fingerprint actor (never payload/header)
  const byBearerToken = await authenticateOpsCaller(
    { authorization: "Bearer secret-token", "x-ops-actor": "spoofed" },
    { expectedToken: "secret-token" }
  );
  assert.equal(byBearerToken.authenticated, true);
  assert.equal(byBearerToken.method, "gate_token");
  assert.match(byBearerToken.actor, /^operator:token:[0-9a-f]{8}$/);

  // Valid Firebase claim (opsOperator / opsAdmin) derives actor strictly from verified JWT
  const byClaim = await authenticateOpsCaller(
    { authorization: "Bearer op-jwt", "x-ops-actor": "spoofed" },
    {
      expectedToken: "",
      verifyIdToken: async () => ({ uid: "op-1", opsOperator: true })
    }
  );
  assert.deepEqual(byClaim, { authenticated: true, actor: "uid:op-1", method: "firebase_claim" });
});

test("createOpsWriteGateHandler enforces HTTP methods, auth order, and request validation", async () => {
  const docGets: string[] = [];
  const fakeDb = {
    doc(docPath: string) {
      return {
        async get() {
          docGets.push(docPath);
          return { exists: false, data: () => undefined };
        }
      };
    }
  } as unknown as Firestore;

  const handler = createOpsWriteGateHandler({
    db: fakeDb,
    expectedToken: "test-gate-secret",
    verifyIdToken: async (token) => {
      if (token === "normal-jwt") return { uid: "u-normal" };
      throw new Error("bad token");
    },
    now: () => new Date("2026-11-28T04:00:00.000Z")
  });

  // Unsupported HTTP method -> 405
  {
    const { res, state } = makeMockRes();
    await handler({ method: "DELETE", headers: {} } as Request, res);
    assert.equal(state.statusCode, 405);
    assert.equal((state.body as { error: { code: string } }).error.code, "OPS_METHOD_NOT_ALLOWED");
  }

  // Unauthenticated POST even with missing body -> 401 (never leaks validation before auth)
  {
    const { res, state } = makeMockRes();
    await handler({ method: "POST", headers: {}, body: undefined } as Request, res);
    assert.equal(state.statusCode, 401);
    assert.equal((state.body as { error: { code: string } }).error.code, "OPS_UNAUTHORIZED");
  }

  // Normal Firebase user -> 403
  {
    const { res, state } = makeMockRes();
    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer normal-jwt" },
        body: { op: "put_item", idempotencyKey: "k1", itemId: "todo281", fields: { status: "done" } }
      } as unknown as Request,
      res
    );
    assert.equal(state.statusCode, 403);
    assert.equal((state.body as { error: { code: string } }).error.code, "OPS_FORBIDDEN");
  }

  // Missing idempotencyKey -> 400
  {
    const { res, state } = makeMockRes();
    await handler(
      {
        method: "POST",
        headers: { "x-ops-gate-token": "test-gate-secret" },
        body: { op: "put_item", itemId: "todo281", fields: { status: "in_progress" } }
      } as unknown as Request,
      res
    );
    assert.equal(state.statusCode, 400);
    assert.equal((state.body as { error: { code: string } }).error.code, "OPS_INVALID_ARGUMENT");
  }

  // Unsupported/transition-mutation op -> 400 OPS_INVALID_OPERATION
  {
    const { res, state } = makeMockRes();
    await handler(
      {
        method: "POST",
        headers: { "x-ops-gate-token": "test-gate-secret" },
        body: { op: "delete_transition", idempotencyKey: "k1" }
      } as unknown as Request,
      res
    );
    assert.equal(state.statusCode, 400);
    assert.equal((state.body as { error: { code: string } }).error.code, "OPS_INVALID_OPERATION");
  }

  // close_item missing evidence or readBack -> 400
  {
    const { res, state } = makeMockRes();
    await handler(
      {
        method: "POST",
        headers: { "x-ops-gate-token": "test-gate-secret" },
        body: { op: "close_item", idempotencyKey: "k2", itemId: "todo281", evidence: "ok", readBack: "   " }
      } as unknown as Request,
      res
    );
    assert.equal(state.statusCode, 400);
    assert.equal((state.body as { error: { code: string } }).error.code, "OPS_INVALID_ARGUMENT");
  }

  // add_relation invalid relationType -> 400
  {
    const { res, state } = makeMockRes();
    await handler(
      {
        method: "POST",
        headers: { "x-ops-gate-token": "test-gate-secret" },
        body: {
          op: "add_relation",
          idempotencyKey: "k3",
          fromId: "todo281",
          toId: "todo282",
          relationType: "bogus"
        }
      } as unknown as Request,
      res
    );
    assert.equal(state.statusCode, 400);
    assert.equal((state.body as { error: { code: string } }).error.code, "OPS_INVALID_ARGUMENT");
  }

  // GET digest issues exactly 1 Firestore doc read for ops/digest
  {
    docGets.length = 0;
    const { res, state } = makeMockRes();
    await handler(
      {
        method: "GET",
        headers: { "x-ops-gate-token": "test-gate-secret" }
      } as unknown as Request,
      res
    );
    assert.equal(state.statusCode, 200);
    assert.deepEqual(docGets, [OPS_PATHS.DIGEST_DOC]);
    const poll = state.body as { ok: boolean; reads: number; exists: boolean; digest: { revision: number } };
    assert.equal(poll.ok, true);
    assert.equal(poll.reads, 1);
    assert.equal(poll.exists, false);
    assert.equal(poll.digest.revision, 0);
  }

  // Direct readOpsDigest also issues 1 read
  docGets.length = 0;
  const direct = await readOpsDigest(fakeDb);
  assert.deepEqual(docGets, [OPS_PATHS.DIGEST_DOC]);
  assert.equal(direct.reads, 1);
});

test("opsGateClient surfaces OpsGateOfflineError when offline and reuses idempotencyKey on retry", async () => {
  await assert.rejects(
    () =>
      writeViaOpsGate({
        endpoint: "http://127.0.0.1:59999/opsWriteGate",
        gateToken: "t",
        op: "comment_item",
        idempotencyKey: "idem-offline-1",
        payload: { itemId: "todo281", note: "hi" },
        fetchImpl: async () => {
          const err = new TypeError("fetch failed") as TypeError & { cause?: { code: string } };
          err.cause = { code: "ECONNREFUSED" };
          throw err;
        }
      }),
    (err: unknown) =>
      err instanceof OpsGateOfflineError &&
      err.name === "OpsGateOfflineError" &&
      err.code === "OPS_GATE_OFFLINE" &&
      err.idempotencyKey === "idem-offline-1"
  );

  // Retry reuses the EXACT same idempotencyKey across offline + 503 failures and succeeds on attempt 3
  const seenKeys: string[] = [];
  let attempt = 0;
  const result = await writeViaOpsGateWithRetry({
    endpoint: "https://example.invalid/opsWriteGate",
    gateToken: "t",
    op: "comment_item",
    idempotencyKey: "idem-retry-1",
    payload: { itemId: "todo281", note: "retry me" },
    maxAttempts: 3,
    backoffMs: 1,
    fetchImpl: async (_url, init) => {
      attempt += 1;
      const parsed = JSON.parse(String(init?.body)) as { idempotencyKey: string };
      seenKeys.push(parsed.idempotencyKey);
      if (attempt === 1) {
        const err = new Error("socket hang up") as Error & { code: string };
        err.code = "ECONNRESET";
        throw err;
      }
      if (attempt === 2) {
        return new globalThis.Response("<html>503 Service Unavailable</html>", { status: 503 });
      }
      return new globalThis.Response(
        JSON.stringify({
          ok: true,
          deduplicated: true,
          idempotencyKey: parsed.idempotencyKey,
          op: "comment_item",
          targetId: "todo281",
          transitionId: parsed.idempotencyKey,
          digestRevision: 2,
          result: {}
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
  });

  assert.equal(attempt, 3);
  assert.deepEqual(seenKeys, ["idem-retry-1", "idem-retry-1", "idem-retry-1"]);
  assert.equal(result.ok, true);
  assert.equal(result.deduplicated, true);

  // 4xx validation/auth errors are NOT retried
  let clientErrorAttempts = 0;
  await assert.rejects(
    () =>
      writeViaOpsGateWithRetry({
        endpoint: "https://example.invalid/opsWriteGate",
        gateToken: "bad",
        op: "comment_item",
        idempotencyKey: "idem-403",
        maxAttempts: 3,
        backoffMs: 1,
        fetchImpl: async () => {
          clientErrorAttempts += 1;
          return new globalThis.Response(
            JSON.stringify({ ok: false, error: { code: "OPS_FORBIDDEN", message: "Forbidden" } }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          );
        }
      }),
    (err: unknown) => err instanceof OpsGateHttpError && err.code === "OPS_FORBIDDEN" && err.status === 403
  );
  assert.equal(clientErrorAttempts, 1);

  // pollOpsDigestViaGate converts disconnect to OpsGateOfflineError
  await assert.rejects(
    () =>
      pollOpsDigestViaGate({
        endpoint: "https://example.invalid/opsWriteGate",
        gateToken: "t",
        fetchImpl: async () => {
          throw new TypeError("fetch failed");
        }
      }),
    (err: unknown) => err instanceof OpsGateOfflineError && err.code === "OPS_GATE_OFFLINE"
  );
});
