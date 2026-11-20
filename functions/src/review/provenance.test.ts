// node --test lib/review/provenance.test.js (npm test)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  METHODOLOGY_VERSION,
  PROVENANCE_SCHEMA_VERSION,
  ProvenanceError,
  assessModelPin,
  buildProvenance,
  canonicalJson,
  inputHash,
  reproducibilityKey,
  versionDrift,
  runReview,
  verifyReproduction,
  memoryReviewStore,
  firestoreReviewStore,
  Reviewer,
  ReviewDocDb,
} from "./provenance";

const AT = new Date("2026-11-20T01:02:03.000Z");

// --- pinning -------------------------------------------------------------

test("floating aliases are refused", () => {
  for (const id of ["chatgpt-4o-latest", "claude-3-5-sonnet-latest", "gemini-pro:latest", "auto", "", "  "]) {
    assert.equal(assessModelPin(id).status, "floating", id);
  }
});

test("dated snapshots and numbered revisions are pinned", () => {
  for (const id of [
    "claude-3-5-sonnet-20241022",
    "gpt-4o-2024-08-06",
    "claude-3-5-sonnet@20240620",
    "gemini-1.5-pro-002",
    "text-bison@001",
  ]) {
    assert.equal(assessModelPin(id).status, "pinned", id);
  }
});

test("an identifier with no snapshot marker is flagged unverified, not called pinned", () => {
  for (const id of ["claude-opus-5-5", "gpt-4o-mini", "llama-3.1-70b-instruct"]) {
    const pin = assessModelPin(id);
    assert.equal(pin.status, "unverified", id);
    assert.match(pin.reason, /cannot confirm/);
  }
});

// --- provenance ----------------------------------------------------------

test("every review stores provider, exact model, methodology version and timestamp", () => {
  const p = buildProvenance({
    provider: "anthropic",
    requestedModel: "claude-3-5-sonnet-20241022",
    methodologyVersion: "1.2.0",
    reviewedAt: AT,
  });
  assert.deepEqual({ ...p }, {
    schemaVersion: PROVENANCE_SCHEMA_VERSION,
    provider: "anthropic",
    model: "claude-3-5-sonnet-20241022",
    requestedModel: "claude-3-5-sonnet-20241022",
    pinStatus: "pinned",
    methodologyVersion: "1.2.0",
    reviewedAt: "2026-11-20T01:02:03.000Z",
  });
  assert.ok(Object.isFrozen(p));
});

test("the model the provider reports serving is the one stored", () => {
  const p = buildProvenance({
    provider: "openai-compatible",
    requestedModel: "gpt-4o",
    resolvedModel: "gpt-4o-2024-08-06",
    methodologyVersion: METHODOLOGY_VERSION,
    reviewedAt: AT,
  });
  assert.equal(p.model, "gpt-4o-2024-08-06");
  assert.equal(p.requestedModel, "gpt-4o");
  assert.equal(p.pinStatus, "pinned");
});

test("a floating model is refused even if the provider resolved it to a snapshot", () => {
  assert.throws(
    () =>
      buildProvenance({
        provider: "openai-compatible",
        requestedModel: "chatgpt-4o-latest",
        resolvedModel: "gpt-4o-2024-08-06",
        methodologyVersion: "1.0.0",
        reviewedAt: AT,
      }),
    (e: unknown) => e instanceof ProvenanceError && e.reason === "floating-model"
  );
});

test("missing or malformed fields are refused", () => {
  const ok = { provider: "anthropic", requestedModel: "claude-opus-5-5", methodologyVersion: "1.0.0", reviewedAt: AT };
  const bad: [Partial<typeof ok> & Record<string, unknown>, string][] = [
    [{ provider: "" }, "missing-field"],
    [{ provider: "acme" }, "invalid-field"],
    [{ requestedModel: "" }, "missing-field"],
    [{ methodologyVersion: "" }, "missing-field"],
    [{ methodologyVersion: "v1" }, "invalid-field"],
    [{ reviewedAt: new Date("nope") }, "invalid-field"],
  ];
  for (const [patch, reason] of bad) {
    assert.throws(
      () => buildProvenance({ ...ok, ...patch } as typeof ok),
      (e: unknown) => e instanceof ProvenanceError && e.reason === reason,
      JSON.stringify(patch)
    );
  }
});

// --- hashing -------------------------------------------------------------

test("input hashing ignores key order and is version-sensitive in the key", () => {
  assert.equal(canonicalJson({ b: 1, a: [1, { d: 2, c: 3 }] }), '{"a":[1,{"c":3,"d":2}],"b":1}');
  assert.equal(inputHash({ a: 1, b: 2 }), inputHash({ b: 2, a: 1 }));
  const h = inputHash({ a: 1 });
  const v = { provider: "anthropic", model: "m-20240101", methodologyVersion: "1.0.0" };
  assert.equal(reproducibilityKey(h, v), reproducibilityKey(h, { ...v }));
  assert.notEqual(reproducibilityKey(h, v), reproducibilityKey(h, { ...v, model: "m-20250101" }));
  assert.notEqual(reproducibilityKey(h, v), reproducibilityKey(h, { ...v, methodologyVersion: "1.0.1" }));
});

// --- reproducibility -----------------------------------------------------

const dossier = { modelId: "m1", factors: [{ id: "f1", formula: "a+b" }], leverage: 12.5 };

test("two reviews of the same input under the same stored version produce the same conclusion", async () => {
  // A reviewer that would answer differently on every call: the stored record,
  // not the model's mood, is what makes the second run agree with the first.
  let calls = 0;
  const flaky: Reviewer<typeof dossier, { score: number }> = async () => ({ conclusion: { score: ++calls } });
  const store = memoryReviewStore<{ score: number }>();
  const args = { input: dossier, provider: "anthropic", model: "claude-3-5-sonnet-20241022", methodologyVersion: "1.0.0" };

  const first = await runReview({ reviewer: flaky, store, now: () => AT }, args);
  const second = await runReview({ reviewer: flaky, store }, { ...args, input: JSON.parse(JSON.stringify(dossier)) });

  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
  assert.deepEqual(second.record.conclusion, first.record.conclusion);
  assert.equal(second.record.conclusionHash, first.record.conclusionHash);
  assert.equal(calls, 1, "the model is not called again for a stored input and version");
});

test("a deterministic reviewer reproduces its stored conclusion; a drifting one is detected", async () => {
  const deterministic: Reviewer<typeof dossier, { pass: boolean }> = async (input, s) => {
    assert.equal(s.temperature, 0);
    return { conclusion: { pass: input.leverage > 10 } };
  };
  const store = memoryReviewStore<{ pass: boolean }>();
  const { record } = await runReview(
    { reviewer: deterministic, store, now: () => AT },
    { input: dossier, provider: "anthropic", model: "claude-3-5-sonnet-20241022" }
  );
  assert.deepEqual(await verifyReproduction(record, dossier, deterministic), {
    reproduced: true,
    inputMatches: true,
    conclusionHash: record.conclusionHash,
  });

  const drifted: Reviewer<typeof dossier, { pass: boolean }> = async () => ({ conclusion: { pass: false } });
  const check = await verifyReproduction(record, dossier, drifted);
  assert.equal(check.reproduced, false);
  assert.deepEqual(store.records.get(record.reproducibilityKey), record, "the stored record is untouched");

  const other = await verifyReproduction(record, { ...dossier, leverage: 1 }, deterministic);
  assert.equal(other.inputMatches, false);
});

test("an old review keeps its version after the model is upgraded, and drift says so", async () => {
  let n = 0;
  const reviewer: Reviewer<typeof dossier, { run: number }> = async () => ({ conclusion: { run: ++n } });
  const store = memoryReviewStore<{ run: number }>();
  const old = await runReview(
    { reviewer, store, now: () => AT },
    { input: dossier, provider: "anthropic", model: "claude-3-5-sonnet-20240620", methodologyVersion: "1.0.0" }
  );
  const upgraded = await runReview(
    { reviewer, store, now: () => new Date("2027-01-01T00:00:00Z") },
    { input: dossier, provider: "anthropic", model: "claude-3-5-sonnet-20241022", methodologyVersion: "1.1.0" }
  );

  assert.equal(upgraded.replayed, false);
  assert.notEqual(upgraded.record.reproducibilityKey, old.record.reproducibilityKey);
  assert.equal(store.records.size, 2);
  const kept = store.records.get(old.record.reproducibilityKey)!;
  assert.equal(kept.provenance.model, "claude-3-5-sonnet-20240620");
  assert.equal(kept.provenance.methodologyVersion, "1.0.0");
  assert.equal(kept.provenance.reviewedAt, AT.toISOString());

  assert.deepEqual(
    versionDrift(kept.provenance, { provider: "anthropic", model: "claude-3-5-sonnet-20241022", methodologyVersion: "1.1.0" }),
    [
      { field: "model", stored: "claude-3-5-sonnet-20240620", current: "claude-3-5-sonnet-20241022" },
      { field: "methodologyVersion", stored: "1.0.0", current: "1.1.0" },
    ]
  );
  assert.deepEqual(versionDrift(kept.provenance, { ...kept.provenance }), []);
});

test("a floating model is refused before the model is called or anything is stored", async () => {
  let called = false;
  const reviewer: Reviewer<typeof dossier, string> = async () => {
    called = true;
    return { conclusion: "x" };
  };
  const store = memoryReviewStore<string>();
  await assert.rejects(
    runReview({ reviewer, store }, { input: dossier, provider: "anthropic", model: "claude-3-5-sonnet-latest" }),
    (e: unknown) => e instanceof ProvenanceError && e.reason === "floating-model"
  );
  assert.equal(called, false);
  assert.equal(store.records.size, 0);
});

test("a provider that resolves a pinned request to a floating name is refused and nothing is stored", async () => {
  const reviewer: Reviewer<typeof dossier, string> = async () => ({ conclusion: "x", resolvedModel: "gpt-4o-latest" });
  const store = memoryReviewStore<string>();
  await assert.rejects(
    runReview({ reviewer, store }, { input: dossier, provider: "openai-compatible", model: "gpt-4o-2024-08-06" }),
    (e: unknown) => e instanceof ProvenanceError && e.reason === "floating-model"
  );
  assert.equal(store.records.size, 0);
});

test("stores are write-once", async () => {
  const store = memoryReviewStore<string>();
  const reviewer: Reviewer<typeof dossier, string> = async () => ({ conclusion: "ok" });
  const { record } = await runReview({ reviewer, store }, { input: dossier, provider: "anthropic", model: "claude-opus-5-5" });
  assert.equal(record.provenance.pinStatus, "unverified");
  await assert.rejects(store.create(record), (e: unknown) => e instanceof ProvenanceError && e.reason === "already-recorded");
});

test("the Firestore store writes once at orgs/{orgId}/reviews/{key}", async () => {
  const docs = new Map<string, unknown>();
  const db: ReviewDocDb = {
    doc(path) {
      return {
        async get() {
          return { exists: docs.has(path), data: () => docs.get(path) };
        },
        async create(data) {
          if (docs.has(path)) throw Object.assign(new Error("exists"), { code: 6 });
          docs.set(path, data);
        },
      };
    },
  };
  const store = firestoreReviewStore<string>(db, "org1");
  const reviewer: Reviewer<typeof dossier, string> = async () => ({ conclusion: "ok" });
  const args = { input: dossier, provider: "anthropic", model: "claude-3-5-sonnet-20241022" };
  const first = await runReview({ reviewer, store }, args);
  assert.ok(docs.has(`orgs/org1/reviews/${first.record.reproducibilityKey}`));
  assert.equal((await runReview({ reviewer, store }, args)).replayed, true);
  await assert.rejects(store.create(first.record), (e: unknown) => e instanceof ProvenanceError && e.reason === "already-recorded");
  assert.throws(() => firestoreReviewStore(db, "a/b"), ProvenanceError);
});
