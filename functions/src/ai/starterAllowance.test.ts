import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
  evaluateAiAllowance,
  getSystemAiProvider,
  verifyAndConsumeAiCredit,
  refundAiCredit,
  withAiCreditProtection,
  createAuditRecord,
  backfillAuditRecord,
  AuditOutcome,
  STARTER_VERIFIED_ALLOWANCE,
  STARTER_UNVERIFIED_TEASER,
  TIER_AI_ALLOWANCES,
  computeMarginGuardCeiling,
  computeCurrentMrr,
  resolveGlobalMonthlyCeiling,
  DEFAULT_AI_CEILING_FLOOR,
  DEFAULT_AI_CEILING_ABSOLUTE_CAP,
  DEFAULT_AI_MARGIN_PCT,
  DEFAULT_AI_UNIT_COST_USD
} from "./starterAllowance";
import {
  DEFAULT_SYSTEM_ANTHROPIC_MODEL,
  DEFAULT_SYSTEM_OPENAI_MODEL,
  RECOMMENDED_CLAUDE_MODELS,
  RECOMMENDED_OPENAI_MODELS,
  ProviderReplyError,
  adapterFor
} from "./providers";
import { draftModelWithCreditProtection } from "./draftModel";
import { draftActionWithCreditProtection } from "./draftAction";
import { DraftReply, DraftActionReply } from "./schema";

test("evaluateAiAllowance: BYO API keys bypass all starter allowances and quotas", () => {
  const result = evaluateAiAllowance({
    userCreditsUsed: 50,
    orgCreditsUsed: 5000,
    isEmailVerified: false,
    subscriptionTier: "community",
    hasByoKey: true
  });

  assert.equal(result.allowed, true);
  assert.equal(result.maxCredits, Infinity);
  assert.equal(result.creditsRemaining, Infinity);
  assert.equal(result.source, "byo");
});

test("evaluateAiAllowance: Verified OAuth accounts receive 10 starter AI credits", () => {
  // Brand new verified account
  const fresh = evaluateAiAllowance({
    userCreditsUsed: 0,
    orgCreditsUsed: 0,
    isEmailVerified: true,
    subscriptionTier: "community",
    hasByoKey: false
  });
  assert.equal(fresh.allowed, true);
  assert.equal(fresh.maxCredits, STARTER_VERIFIED_ALLOWANCE);
  assert.equal(fresh.creditsRemaining, 10);
  assert.equal(fresh.source, "starter_verified");

  // Account with 9 credits used (1 remaining)
  const nineUsed = evaluateAiAllowance({
    userCreditsUsed: 9,
    orgCreditsUsed: 9,
    isEmailVerified: true,
    subscriptionTier: "community",
    hasByoKey: false
  });
  assert.equal(nineUsed.allowed, true);
  assert.equal(nineUsed.creditsRemaining, 1);

  // Account with 10 credits used (quota exhausted)
  const exhausted = evaluateAiAllowance({
    userCreditsUsed: 10,
    orgCreditsUsed: 10,
    isEmailVerified: true,
    subscriptionTier: "community",
    hasByoKey: false
  });
  assert.equal(exhausted.allowed, false);
  assert.equal(exhausted.creditsRemaining, 0);
  assert.ok(exhausted.reason?.includes("used all 10 starter AI credits"));
});

test("evaluateAiAllowance: Unverified email accounts receive 2 teaser calls before requiring verification", () => {
  // Brand new unverified account
  const fresh = evaluateAiAllowance({
    userCreditsUsed: 0,
    orgCreditsUsed: 0,
    isEmailVerified: false,
    subscriptionTier: "community",
    hasByoKey: false
  });
  assert.equal(fresh.allowed, true);
  assert.equal(fresh.maxCredits, STARTER_UNVERIFIED_TEASER);
  assert.equal(fresh.creditsRemaining, 2);
  assert.equal(fresh.source, "starter_teaser");

  // 1 teaser credit used (1 remaining)
  const oneUsed = evaluateAiAllowance({
    userCreditsUsed: 1,
    orgCreditsUsed: 1,
    isEmailVerified: false,
    subscriptionTier: "community",
    hasByoKey: false
  });
  assert.equal(oneUsed.allowed, true);
  assert.equal(oneUsed.creditsRemaining, 1);

  // 2 teaser credits used (prompt email verification)
  const teaserDone = evaluateAiAllowance({
    userCreditsUsed: 2,
    orgCreditsUsed: 2,
    isEmailVerified: false,
    subscriptionTier: "community",
    hasByoKey: false
  });
  assert.equal(teaserDone.allowed, false);
  assert.equal(teaserDone.creditsRemaining, 0);
  assert.ok(teaserDone.reason?.includes("verify your email address"));
});

test("evaluateAiAllowance: Tiered paid organizations access pooled monthly allowances", () => {
  for (const [tier, limit] of Object.entries(TIER_AI_ALLOWANCES)) {
    // Within quota
    const within = evaluateAiAllowance({
      userCreditsUsed: 20, // Even if user used > 10 starter credits
      orgCreditsUsed: limit - 1,
      isEmailVerified: true,
      subscriptionTier: tier,
      hasByoKey: false
    });
    assert.equal(within.allowed, true, `Tier ${tier} should be allowed within quota`);
    assert.equal(within.maxCredits, limit);
    assert.equal(within.creditsRemaining, 1);
    assert.equal(within.source, "tier_pooled");

    // Quota reached
    const reached = evaluateAiAllowance({
      userCreditsUsed: 20,
      orgCreditsUsed: limit,
      isEmailVerified: true,
      subscriptionTier: tier,
      hasByoKey: false
    });
    assert.equal(reached.allowed, false, `Tier ${tier} should be blocked when limit reached`);
    assert.equal(reached.creditsRemaining, 0);
    assert.ok(reached.reason?.includes(`${limit} operations/month`));
  }
});

test("getSystemAiProvider: Resolves system backend provider appropriately", () => {
  const origEmulator = process.env.FUNCTIONS_EMULATOR;
  const origAnthropic = process.env.ANTHROPIC_API_KEY;
  const origOpenAi = process.env.OPENAI_API_KEY;
  const origSystem = process.env.SYSTEM_AI_API_KEY;

  try {
    // 1. With Anthropic key
    delete process.env.SYSTEM_AI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    const anthropicProvider = getSystemAiProvider();
    assert.ok(anthropicProvider);
    assert.equal(anthropicProvider.settings.provider, "anthropic");
    assert.equal(anthropicProvider.settings.model, DEFAULT_SYSTEM_ANTHROPIC_MODEL);
    assert.equal(anthropicProvider.settings.model, "claude-haiku-5-5");
    assert.ok(RECOMMENDED_CLAUDE_MODELS.includes(anthropicProvider.settings.model));
    assert.equal(anthropicProvider.apiKey, "test-anthropic-key");

    // 2. With OpenAI key only
    delete process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = "test-openai-key";
    const openaiProvider = getSystemAiProvider();
    assert.ok(openaiProvider);
    assert.equal(openaiProvider.settings.provider, "openai-compatible");
    assert.equal(openaiProvider.settings.model, DEFAULT_SYSTEM_OPENAI_MODEL);
    assert.equal(openaiProvider.settings.model, "gpt-4o-mini");
    assert.ok(RECOMMENDED_OPENAI_MODELS.includes(openaiProvider.settings.model));
    assert.equal(openaiProvider.apiKey, "test-openai-key");

    // 3. In emulator mode
    delete process.env.OPENAI_API_KEY;
    process.env.FUNCTIONS_EMULATOR = "true";
    const emulatorProvider = getSystemAiProvider();
    assert.ok(emulatorProvider);
    assert.equal(emulatorProvider.apiKey, "emulator-mock-key");

    // 4. Without any key or emulator
    delete process.env.FUNCTIONS_EMULATOR;
    assert.equal(getSystemAiProvider(), null);
  } finally {
    process.env.FUNCTIONS_EMULATOR = origEmulator;
    process.env.ANTHROPIC_API_KEY = origAnthropic;
    process.env.OPENAI_API_KEY = origOpenAi;
    process.env.SYSTEM_AI_API_KEY = origSystem;
  }
});

test("getSystemAiProvider: Starter models are valid, tested names in providers list", () => {
  assert.equal(DEFAULT_SYSTEM_ANTHROPIC_MODEL, "claude-haiku-5-5");
  assert.ok(RECOMMENDED_CLAUDE_MODELS.includes(DEFAULT_SYSTEM_ANTHROPIC_MODEL));
  assert.equal(DEFAULT_SYSTEM_OPENAI_MODEL, "gpt-4o-mini");
  assert.ok(RECOMMENDED_OPENAI_MODELS.includes(DEFAULT_SYSTEM_OPENAI_MODEL));
  // Prohibit retired Claude 3 / 3.5 names
  assert.ok(!RECOMMENDED_CLAUDE_MODELS.includes("claude-3-5-haiku-20241022"));
  assert.ok(!RECOMMENDED_CLAUDE_MODELS.includes("claude-3.5-sonnet"));
});

test("adapterFor: Successfully instantiates adapter for system starter provider", () => {
  const anthropicAdapter = adapterFor({
    provider: "anthropic",
    model: DEFAULT_SYSTEM_ANTHROPIC_MODEL
  }, "test-key");
  assert.ok(anthropicAdapter);

  const openaiAdapter = adapterFor({
    provider: "openai-compatible",
    model: DEFAULT_SYSTEM_OPENAI_MODEL,
    baseUrl: "https://api.openai.com/v1"
  }, "test-key");
  assert.ok(openaiAdapter);
});

test("end-to-end starter draft resolution: brand new user accesses claude-haiku-5-5 without 404", () => {
  // 1. New verified user allowance check
  const allowance = evaluateAiAllowance({
    userCreditsUsed: 0,
    orgCreditsUsed: 0,
    isEmailVerified: true,
    subscriptionTier: "community",
    hasByoKey: false
  });
  assert.equal(allowance.allowed, true);
  assert.equal(allowance.source, "starter_verified");
  assert.equal(allowance.creditsRemaining, 10);

  // 2. System provider resolution with Anthropic system key
  const origKey = process.env.SYSTEM_AI_PROVIDER_KEY;
  try {
    process.env.SYSTEM_AI_PROVIDER_KEY = "sk-ant-system-live-key";
    const systemProvider = getSystemAiProvider();
    assert.ok(systemProvider);
    assert.equal(systemProvider.settings.provider, "anthropic");
    // Must be the live, non-retired model
    assert.equal(systemProvider.settings.model, "claude-haiku-5-5");
    assert.notEqual(systemProvider.settings.model, "claude-3-5-haiku-20241022");
    assert.ok(RECOMMENDED_CLAUDE_MODELS.includes(systemProvider.settings.model));

    // 3. Adapter instantiation with verified model
    const adapter = adapterFor(systemProvider.settings, systemProvider.apiKey);
    assert.ok(adapter);
  } finally {
    process.env.SYSTEM_AI_PROVIDER_KEY = origKey;
  }
});

interface MockDatabaseOptions {
  userStore?: Record<string, unknown>;
  orgStore?: Record<string, unknown>;
  globalStore?: Record<string, unknown>;
  auditLogs?: Record<string, unknown>[];
  orgsCollection?: Record<string, unknown>[];
  onTransactionThrow?: () => void;
  throwOnOrgsQuery?: boolean;
}

function incrementDelta(value: unknown): number | null {
  if (typeof value === "object" && value !== null && "operand" in value) {
    const operand = (value as { operand?: unknown }).operand;
    if (typeof operand === "number") return operand;
  }
  return null;
}

function applyMockMerge(target: Record<string, unknown>, data: Record<string, unknown>) {
  for (const [key, val] of Object.entries(data)) {
    const delta = incrementDelta(val);
    if (key.includes(".")) {
      const [parentKey, childKey] = key.split(".", 2);
      const rawParent = target[parentKey];
      const existingParent =
        typeof rawParent === "object" && rawParent !== null
          ? { ...(rawParent as Record<string, unknown>) }
          : {};
      if (delta !== null) {
        const currentChild = typeof existingParent[childKey] === "number" ? existingParent[childKey] : 0;
        existingParent[childKey] = currentChild + delta;
      } else {
        existingParent[childKey] = val;
      }
      target[parentKey] = existingParent;
      continue;
    }

    if (delta !== null) {
      const current = typeof target[key] === "number" ? target[key] : 0;
      target[key] = current + delta;
    } else {
      target[key] = val;
    }
  }
}

function getMockField(store: Record<string, unknown>, field: string): unknown {
  if (field in store) return store[field];
  if (field.includes(".")) {
    const [parentKey, childKey] = field.split(".", 2);
    const parent = store[parentKey];
    if (typeof parent === "object" && parent !== null) {
      return (parent as Record<string, unknown>)[childKey];
    }
  }
  return undefined;
}

function createTransactionalMockDb(options: MockDatabaseOptions = {}) {
  const userStore = options.userStore || {};
  const orgStore = options.orgStore || {};
  const globalStore = options.globalStore || {};
  const auditLogs = options.auditLogs || [];
  let nextAuditSeq = 1;
  let storeVersion = 0;

  const upsertAudit = (docId: string, data: Record<string, unknown>, merge?: boolean) => {
    const existingIndex = auditLogs.findIndex((l) => l.auditKey === docId);
    if (existingIndex >= 0) {
      if (merge) {
        applyMockMerge(auditLogs[existingIndex], data);
      } else {
        auditLogs[existingIndex] = { ...data, auditKey: docId };
      }
    } else {
      auditLogs.push({ ...data, auditKey: docId });
    }
  };

  const readDocByPath = (path: string) => {
    if (path.startsWith("users/")) return { get: (f: string) => getMockField(userStore, f) };
    if (path.startsWith("orgs/")) return { get: (f: string) => getMockField(orgStore, f) };
    if (path.startsWith("systemUsage/")) return { get: (f: string) => getMockField(globalStore, f) };
    if (path.startsWith("systemAuditLogs/")) {
      const docId = path.slice("systemAuditLogs/".length);
      const found = auditLogs.find((l) => l.auditKey === docId);
      return {
        exists: !!found,
        data: () => (found ? { ...found } : undefined),
        get: (f: string) => (found ? getMockField(found, f) : undefined)
      };
    }
    return { get: () => undefined };
  };

  const writeDocByPath = (path: string, data: Record<string, unknown>, opts?: { merge?: boolean }) => {
    if (path.startsWith("users/")) applyMockMerge(userStore, data);
    if (path.startsWith("orgs/")) applyMockMerge(orgStore, data);
    if (path.startsWith("systemUsage/")) applyMockMerge(globalStore, data);
    if (path.startsWith("systemAuditLogs/")) {
      const docId = path.slice("systemAuditLogs/".length);
      upsertAudit(docId, data, opts?.merge);
    }
  };

  return {
    doc: (path: string) => ({
      path,
      get: async () => readDocByPath(path),
      set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
        writeDocByPath(path, data, opts);
      }
    }),
    collection: (name: string) => ({
      where: (field: string, op: string, value: unknown) => ({
        get: async () => {
          if (options.throwOnOrgsQuery) {
            throw new Error("Simulated Firestore read failure");
          }
          if (name === "orgs") {
            const orgs = options.orgsCollection || [];
            const filtered = orgs.filter((org) => {
              if (op === "==") return org[field] === value;
              return true;
            });
            return {
              docs: filtered.map((docData, idx) => ({
                id: (docData.id as string) || `org-${idx}`,
                data: () => docData
              }))
            };
          }
          return { docs: [] };
        }
      }),
      doc: (id?: string) => {
        const docId = id || `audit-${nextAuditSeq++}`;
        const docPath = `${name}/${docId}`;
        return {
          id: docId,
          path: docPath,
          get: async () => readDocByPath(docPath),
          set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
            if (name === "systemAuditLogs") {
              upsertAudit(docId, data, opts?.merge);
            }
          }
        };
      }
    }),
    runTransaction: async <R>(cb: (tx: unknown) => Promise<R>): Promise<R> => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const readVersion = storeVersion;
        // Buffer transactional writes so if cb throws, rollback clears all staged mutations
        const stagedWrites: Array<() => void> = [];
        const txMock = {
          get: async (ref: { path: string }) => readDocByPath(ref.path),
          set: (ref: { path: string }, data: Record<string, unknown>, opts?: { merge?: boolean }) => {
            stagedWrites.push(() => {
              writeDocByPath(ref.path, data, opts);
            });
          }
        };

        try {
          const result = await cb(txMock);
          if (stagedWrites.length > 0 && readVersion !== storeVersion) {
            continue;
          }
          if (stagedWrites.length > 0) {
            for (const commit of stagedWrites) {
              commit();
            }
            storeVersion++;
          }
          return result;
        } catch (err) {
          // Transaction threw: roll back all staged writes (do NOT apply them)
          if (options.onTransactionThrow) options.onTransactionThrow();
          throw err;
        }
      }
      throw new Error("Mock transaction contention retry limit exceeded");
    }
  } as unknown as import("firebase-admin/firestore").Firestore;
}

test("verifyAndConsumeAiCredit: Atomically checks and decrements allowance", async () => {
  const mockUserStore: Record<string, unknown> = {
    aiCreditsUsed: 3
  };
  const mockOrgStore: Record<string, unknown> = {
    aiCreditsUsed: 5,
    subscriptionTier: "community",
    monthlyAiUsage: { "2026-11": 10 }
  };
  const mockGlobalStore: Record<string, unknown> = {
    creditsUsed: 150
  };

  const auditLogs: Record<string, unknown>[] = [];
  const mockDb = createTransactionalMockDb({
    userStore: mockUserStore,
    orgStore: mockOrgStore,
    globalStore: mockGlobalStore,
    auditLogs
  });

  // Consume credit with verified email
  const result = await verifyAndConsumeAiCredit(mockDb, "uid-123", "org-456", {
    token: { email_verified: true }
  }, {
    yearMonth: "2026-11",
    globalMonthlyCeiling: 5000,
    orgMonthlyCeiling: 50
  });

  assert.equal(result.allowed, true);
  assert.equal(result.source, "starter_verified");
  assert.ok(mockUserStore.lastAiUsedAt !== undefined);
  assert.ok(mockOrgStore.lastAiUsedAt !== undefined);
  assert.ok(mockGlobalStore.lastUsedAt !== undefined);
  assert.equal(mockGlobalStore.yearMonth, "2026-11");

  // Verify audit log outcome was recorded as success
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].outcome, "success");
  assert.ok(auditLogs[0].auditKey !== undefined);
});

test("verifyAndConsumeAiCredit: Global monthly ceiling refusal logs audit and throws resource-exhausted", async () => {
  const mockUserStore: Record<string, unknown> = { aiCreditsUsed: 1 };
  const mockOrgStore: Record<string, unknown> = { aiCreditsUsed: 1, subscriptionTier: "community" };
  const mockGlobalStore: Record<string, unknown> = { creditsUsed: 5000 }; // At ceiling

  const auditLogs: Record<string, unknown>[] = [];
  const mockDb = createTransactionalMockDb({
    userStore: mockUserStore,
    orgStore: mockOrgStore,
    globalStore: mockGlobalStore,
    auditLogs
  });

  await assert.rejects(
    async () => {
      await verifyAndConsumeAiCredit(mockDb, "uid-1", "org-1", {
        token: { email_verified: true }
      }, {
        yearMonth: "2026-11",
        globalMonthlyCeiling: 5000,
        orgMonthlyCeiling: 50
      });
    },
    (err: unknown) => {
      const httpsErr = err as { code?: string; message?: string; details?: { reason?: string } };
      assert.equal(httpsErr.code, "resource-exhausted");
      assert.ok(httpsErr.message?.includes("System AI monthly capacity ceiling reached"));
      assert.equal(httpsErr.details?.reason, "global-ceiling-reached");
      return true;
    }
  );

  // Assert audit event was written outside the rolled-back transaction
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].event, "ai_ceiling_reached");
  assert.equal(auditLogs[0].type, "global");
  assert.equal(auditLogs[0].ceiling, 5000);
  assert.equal(auditLogs[0].outcome, "failure");
  assert.ok(auditLogs[0].auditKey !== undefined);
});

test("verifyAndConsumeAiCredit: Per-organization starter ceiling refusal logs audit and throws resource-exhausted", async () => {
  const mockUserStore: Record<string, unknown> = { aiCreditsUsed: 1 };
  const mockOrgStore: Record<string, unknown> = {
    aiCreditsUsed: 50,
    subscriptionTier: "community",
    monthlyAiUsage: { "2026-11": 50 } // Org reached 50 free credits
  };
  const mockGlobalStore: Record<string, unknown> = { creditsUsed: 100 }; // Global has room

  const auditLogs: Record<string, unknown>[] = [];
  const mockDb = createTransactionalMockDb({
    userStore: mockUserStore,
    orgStore: mockOrgStore,
    globalStore: mockGlobalStore,
    auditLogs
  });

  await assert.rejects(
    async () => {
      await verifyAndConsumeAiCredit(mockDb, "uid-2", "org-abuse", {
        token: { email_verified: true }
      }, {
        yearMonth: "2026-11",
        globalMonthlyCeiling: 5000,
        orgMonthlyCeiling: 50
      });
    },
    (err: unknown) => {
      const httpsErr = err as { code?: string; message?: string; details?: { reason?: string } };
      assert.equal(httpsErr.code, "resource-exhausted");
      assert.ok(httpsErr.message?.includes("Organization monthly starter AI quota reached"));
      assert.equal(httpsErr.details?.reason, "org-ceiling-reached");
      return true;
    }
  );

  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].event, "ai_ceiling_reached");
  assert.equal(auditLogs[0].type, "org");
  assert.equal(auditLogs[0].orgId, "org-abuse");
  assert.equal(auditLogs[0].outcome, "failure");
});

test("MIPA-13: Audit record survives throwing transaction rollback", async () => {
  const mockUserStore: Record<string, unknown> = { aiCreditsUsed: 10 };
  const mockOrgStore: Record<string, unknown> = {
    aiCreditsUsed: 20,
    subscriptionTier: "community",
    monthlyAiUsage: { "2026-11": 50 } // Hits org starter ceiling
  };
  const mockGlobalStore: Record<string, unknown> = { creditsUsed: 200 };
  const auditLogs: Record<string, unknown>[] = [];

  let transactionRolledBack = false;
  const mockDb = createTransactionalMockDb({
    userStore: mockUserStore,
    orgStore: mockOrgStore,
    globalStore: mockGlobalStore,
    auditLogs,
    onTransactionThrow: () => {
      transactionRolledBack = true;
    }
  });

  // Force transaction to throw
  await assert.rejects(async () => {
    await verifyAndConsumeAiCredit(mockDb, "uid-throw-test", "org-throw-test", {
      token: { email_verified: true }
    }, {
      yearMonth: "2026-11",
      globalMonthlyCeiling: 5000,
      orgMonthlyCeiling: 50
    });
  });

  // 1. Assert transaction rolled back and staged counter increments were discarded
  assert.equal(transactionRolledBack, true, "Transaction rollback must have been triggered");
  assert.equal(mockUserStore.aiCreditsUsed, 10, "User credits counter must NOT be incremented upon rollback");
  assert.equal(mockOrgStore.aiCreditsUsed, 20, "Org credits counter must NOT be incremented upon rollback");

  // 2. Assert and RECORD that the audit record is present despite transaction rollback
  assert.equal(auditLogs.length, 1, "Audit record must be present in systemAuditLogs store");
  const auditRecord = auditLogs[0];
  assert.ok(auditRecord.auditKey, "Audit record must have an auditKey");
  assert.equal(auditRecord.outcome, "failure", "Audit outcome must be recorded as 'failure'");
  assert.equal(auditRecord.type, "org");
  assert.equal(auditRecord.uid, "uid-throw-test");
  assert.equal(auditRecord.orgId, "org-throw-test");
});

test("MIPA-13: Outcome field is three-valued (success, failure, unknown)", async () => {
  const auditLogs: Record<string, unknown>[] = [];
  const mockDb = createTransactionalMockDb({ auditLogs });

  // 1. Verify 'unknown' - initial state written upfront before transaction resolution
  const { ref: unknownRef, auditKey } = await createAuditRecord(mockDb, {
    auditKey: "key-unknown-state",
    event: "ai_credit_evaluation",
    outcome: "unknown",
    yearMonth: "2026-11",
    orgId: "org-test",
    uid: "uid-test"
  });

  assert.equal(auditKey, "key-unknown-state");
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].auditKey, "key-unknown-state");
  assert.equal(auditLogs[0].outcome, "unknown" as AuditOutcome, "Initial outcome must be 'unknown'");

  // 2. Verify 'success' - back-filling after successful outcome
  await backfillAuditRecord(unknownRef, {
    outcome: "success",
    creditsUsed: 1
  });
  assert.equal(auditLogs[0].outcome, "success" as AuditOutcome, "Resolved outcome must transition to 'success'");

  // 3. Verify 'failure' - separate failure record
  const { ref: failRef } = await createAuditRecord(mockDb, {
    auditKey: "key-failure-state",
    event: "ai_credit_evaluation",
    outcome: "unknown",
    yearMonth: "2026-11",
    orgId: "org-test",
    uid: "uid-test"
  });
  await backfillAuditRecord(failRef, {
    outcome: "failure",
    reason: "quota_exceeded"
  });

  const failDoc = auditLogs.find((l) => l.auditKey === "key-failure-state");
  assert.ok(failDoc);
  assert.equal(failDoc.outcome, "failure" as AuditOutcome, "Failed outcome must transition to 'failure'");
  assert.equal(failDoc.reason, "quota_exceeded");
});

test("MIPA-13: Audit record carries key that can be back-filled once outcome is known", async () => {
  const auditLogs: Record<string, unknown>[] = [];
  const mockDb = createTransactionalMockDb({ auditLogs });

  const customKey = "custom-audit-key-2026";
  const { ref, auditKey } = await createAuditRecord(mockDb, {
    auditKey: customKey,
    event: "ai_credit_evaluation",
    outcome: "unknown",
    yearMonth: "2026-11",
    orgId: "org-backfill-test",
    uid: "uid-backfill-test"
  });

  assert.equal(auditKey, customKey);
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].auditKey, customKey);
  assert.equal(auditLogs[0].outcome, "unknown");

  // Backfill with execution details
  await backfillAuditRecord(ref, {
    outcome: "success",
    creditsUsed: 5,
    reason: "verified_tier_approval"
  });

  const record = auditLogs.find((l) => l.auditKey === customKey);
  assert.ok(record);
  assert.equal(record.auditKey, customKey);
  assert.equal(record.outcome, "success");
  assert.equal(record.creditsUsed, 5);
  assert.equal(record.reason, "verified_tier_approval");
  assert.equal(record.orgId, "org-backfill-test");
  assert.equal(record.uid, "uid-backfill-test");
});

test("evaluateAiAllowance: Independent per-org and global ceiling evaluation", () => {
  // Global ceiling reached refusal
  const globalRefused = evaluateAiAllowance({
    userCreditsUsed: 1,
    orgCreditsUsed: 1,
    isEmailVerified: true,
    subscriptionTier: "community",
    hasByoKey: false,
    globalMonthlyUsed: 5000,
    globalMonthlyCeiling: 5000
  });
  assert.equal(globalRefused.allowed, false);
  assert.ok(globalRefused.reason?.includes("System AI monthly capacity ceiling reached"));

  // Per-org ceiling reached refusal
  const orgRefused = evaluateAiAllowance({
    userCreditsUsed: 1,
    orgCreditsUsed: 50,
    isEmailVerified: true,
    subscriptionTier: "community",
    hasByoKey: false,
    globalMonthlyUsed: 200,
    globalMonthlyCeiling: 5000,
    orgMonthlyUsed: 50,
    orgMonthlyCeiling: 50
  });
  assert.equal(orgRefused.allowed, false);
  assert.ok(orgRefused.reason?.includes("Organization monthly starter AI quota reached"));

  // BYO key bypasses even if both global and org ceilings are at capacity
  const byoBypass = evaluateAiAllowance({
    userCreditsUsed: 50,
    orgCreditsUsed: 5000,
    isEmailVerified: true,
    subscriptionTier: "community",
    hasByoKey: true,
    globalMonthlyUsed: 10000,
    globalMonthlyCeiling: 5000,
    orgMonthlyUsed: 500,
    orgMonthlyCeiling: 50
  });
  assert.equal(byoBypass.allowed, true);
  assert.equal(byoBypass.source, "byo");
  assert.equal(byoBypass.maxCredits, Infinity);
});

test("MIPA-27: computeMarginGuardCeiling clamps to floor, scales with margin, and respects absolute cap", () => {
  assert.equal(DEFAULT_AI_MARGIN_PCT, 0.10);
  assert.equal(DEFAULT_AI_UNIT_COST_USD, 0.005);

  // Case 1: Pre-revenue ($0 MRR) -> floor of 5,000 ops
  const zeroRev = computeMarginGuardCeiling({ revenueBasis: 0 });
  assert.equal(zeroRev.ceilingOps, DEFAULT_AI_CEILING_FLOOR);
  assert.equal(zeroRev.revenueBasis, 0);

  // Case 2: Low revenue ($29 MRR for 1 starter) -> 29 * 0.10 / 0.005 = 580 ops -> clamped to floor 5,000 ops
  const starterRev = computeMarginGuardCeiling({ revenueBasis: 29 });
  assert.equal(starterRev.ceilingOps, 5000);

  // Case 3: Normal revenue ($1,000 MRR) -> 1,000 * 0.10 / 0.005 = 20,000 ops
  const normalRev = computeMarginGuardCeiling({ revenueBasis: 1000 });
  assert.equal(normalRev.ceilingOps, 20000);

  // Case 4: Enterprise scale ($10,000 MRR) -> 10,000 * 0.10 / 0.005 = 200,000 ops -> clamped to absolute cap 100,000 ops
  const enterpriseRev = computeMarginGuardCeiling({ revenueBasis: 10000 });
  assert.equal(enterpriseRev.ceilingOps, DEFAULT_AI_CEILING_ABSOLUTE_CAP);

  // Case 5: Custom parameters
  const custom = computeMarginGuardCeiling({
    revenueBasis: 500,
    marginPct: 0.20,
    unitCostUsd: 0.002,
    floor: 2000,
    absoluteCap: 80000
  });
  // 500 * 0.20 / 0.002 = 50,000 ops
  assert.equal(custom.ceilingOps, 50000);
});

test("MIPA-27: computeCurrentMrr aggregates active subscriptions with stored amounts and fallbacks", async () => {
  const activeOrgs = [
    // 1. Starter monthly with stored cents (2900 cents = $29)
    {
      id: "org-1",
      subscriptionStatus: "active",
      subscriptionTier: "starter",
      billingCycle: "monthly",
      paidAmount: 2900
    },
    // 2. Growth monthly with fallback pricing (no stored amount -> $79)
    {
      id: "org-2",
      subscriptionStatus: "active",
      subscriptionTier: "growth",
      billingCycle: "monthly"
    },
    // 3. Pro annual with fallback pricing ($1990/year -> $165.83/mo)
    {
      id: "org-3",
      subscriptionStatus: "active",
      subscriptionTier: "pro",
      billingCycle: "annual"
    },
    // 4. Inactive org (should be excluded)
    {
      id: "org-4",
      subscriptionStatus: "cancelled",
      subscriptionTier: "enterprise",
      billingCycle: "monthly",
      paidAmount: 49900
    },
    // 5. Community org (should be excluded)
    {
      id: "org-5",
      subscriptionStatus: "active",
      subscriptionTier: "community",
      billingCycle: "monthly"
    }
  ];

  const mockDb = createTransactionalMockDb({ orgsCollection: activeOrgs });
  const mrr = await computeCurrentMrr(mockDb as unknown as import("firebase-admin/firestore").Firestore);

  // Expected MRR: 29 + 79 + (1990 / 12 = 165.8333) = 273.83
  assert.ok(Math.abs(mrr - 273.83) < 0.05);
});

test("MIPA-27 Fixture Cases: revenue 0 (floor), normal revenue (10%), and revenue read failure (fail closed)", async () => {
  // Fixture Case 1: Revenue 0 (Floor)
  const emptyDb = createTransactionalMockDb({ orgsCollection: [] });
  const floorCeiling = await resolveGlobalMonthlyCeiling(emptyDb as unknown as import("firebase-admin/firestore").Firestore);
  assert.equal(floorCeiling, 5000, "Revenue 0 must evaluate to the floor (5000 ops)");

  // Fixture Case 2: Normal Revenue (10% conversion)
  // MRR = $1,000 -> 1000 * 0.10 / 0.005 = 20,000 ops
  const normalCeiling = await resolveGlobalMonthlyCeiling(
    emptyDb as unknown as import("firebase-admin/firestore").Firestore,
    { revenueBasis: 1000 }
  );
  assert.equal(normalCeiling, 20000, "MRR of $1000 with 10% margin at $0.005 must evaluate to 20,000 ops");

  // Fixture Case 3: Revenue read failure (Fails closed to floor)
  const failingDb = createTransactionalMockDb({ throwOnOrgsQuery: true });
  const failedReadMrr = await computeCurrentMrr(failingDb as unknown as import("firebase-admin/firestore").Firestore);
  assert.equal(failedReadMrr, 0, "Revenue read failure must fail closed to 0 MRR");

  const failClosedCeiling = await resolveGlobalMonthlyCeiling(failingDb as unknown as import("firebase-admin/firestore").Firestore);
  assert.equal(failClosedCeiling, 5000, "Revenue read failure must evaluate to floor (5000 ops), not throw or maximize");

  // Test that verifyAndConsumeAiCredit succeeds and applies floor ceiling when revenue read fails
  const mockUserStore: Record<string, unknown> = { aiCreditsUsed: 0 };
  const mockOrgStore: Record<string, unknown> = { aiCreditsUsed: 0, subscriptionTier: "community" };
  const mockGlobalStore: Record<string, unknown> = { creditsUsed: 100 }; // Room under 5000
  const auditLogs: Record<string, unknown>[] = [];

  const failingQueryDb = createTransactionalMockDb({
    userStore: mockUserStore,
    orgStore: mockOrgStore,
    globalStore: mockGlobalStore,
    auditLogs,
    throwOnOrgsQuery: true
  });

  const consumeResult = await verifyAndConsumeAiCredit(
    failingQueryDb as unknown as import("firebase-admin/firestore").Firestore,
    "uid-fail-closed",
    "org-fail-closed",
    { token: { email_verified: true } }
  );
  assert.equal(consumeResult.allowed, true);
  assert.equal(consumeResult.source, "starter_verified");
});

const SAMPLE_DRAFT_REPLY: DraftReply = {
  kind: "questions",
  message: "Need details",
  questions: [{ question: "What is your monthly volume?", why: "Scale baseline" }],
  summary: "",
  groups: [],
  factors: [],
  changesToExisting: []
};

const SAMPLE_ACTION_REPLY: DraftActionReply = {
  title: "Volunteer outreach",
  summary: "Expand volunteer base",
  estEffortHrs: 4,
  effortReasoning: "Half day setup",
  estSpending: 0,
  spendingReasoning: "No direct spend",
  currency: "USD",
  impacts: [],
  notes: ""
};

const SAMPLE_USAGE = {
  inputTokens: 120,
  outputTokens: 60,
  cacheReadTokens: 0,
  cacheWriteTokens: 0
};

test("MIPA-47 (draftModel): provider throw leaves aiCreditsUsed unchanged via compensating refund", async () => {
  const mockUserStore: Record<string, unknown> = { aiCreditsUsed: 3 };
  const mockOrgStore: Record<string, unknown> = {
    aiCreditsUsed: 5,
    subscriptionTier: "community",
    monthlyAiUsage: { "2026-11": 10 }
  };
  const mockGlobalStore: Record<string, unknown> = { creditsUsed: 150 };
  const auditLogs: Record<string, unknown>[] = [];

  const mockDb = createTransactionalMockDb({
    userStore: mockUserStore,
    orgStore: mockOrgStore,
    globalStore: mockGlobalStore,
    auditLogs
  });

  await assert.rejects(
    () =>
      draftModelWithCreditProtection({
        db: mockDb,
        uid: "uid-draft-err",
        orgId: "org-draft-err",
        auth: { token: { email_verified: true } },
        useSystemFallback: true,
        creditOptions: { yearMonth: "2026-11", globalMonthlyCeiling: 5000, orgMonthlyCeiling: 50 },
        turns: [{ role: "user", text: "Help draft my model" }],
        mustDraft: false,
        adapter: {
          draft: async () => {
            throw new Error("503 Service Unavailable from upstream AI");
          }
        }
      }),
    /503 Service Unavailable/
  );

  assert.equal(mockUserStore.aiCreditsUsed, 3, "user aiCreditsUsed must be restored after provider throw");
  assert.equal(mockOrgStore.aiCreditsUsed, 5, "org aiCreditsUsed must be restored after provider throw");
  assert.equal(
    (mockOrgStore.monthlyAiUsage as Record<string, number>)["2026-11"],
    10,
    "org monthly usage must be restored after provider throw"
  );
  assert.equal(mockGlobalStore.creditsUsed, 150, "global monthly usage must be restored after provider throw");
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].outcome, "refunded");
  assert.equal(auditLogs[0].refunded, true);
});

test("MIPA-47 (draftModel): too-long, refusal, and exhausted invalid-reply refund credit; transient retry charges once", async () => {
  const mockUserStore: Record<string, unknown> = { aiCreditsUsed: 2 };
  const mockOrgStore: Record<string, unknown> = {
    aiCreditsUsed: 2,
    subscriptionTier: "community",
    monthlyAiUsage: { "2026-11": 2 }
  };
  const mockGlobalStore: Record<string, unknown> = { creditsUsed: 20 };
  const auditLogs: Record<string, unknown>[] = [];
  const mockDb = createTransactionalMockDb({
    userStore: mockUserStore,
    orgStore: mockOrgStore,
    globalStore: mockGlobalStore,
    auditLogs
  });

  // 1. too-long failure refunds credit
  await assert.rejects(
    () =>
      draftModelWithCreditProtection({
        db: mockDb,
        uid: "uid-model-reply",
        orgId: "org-model-reply",
        auth: { token: { email_verified: true } },
        useSystemFallback: true,
        creditOptions: { yearMonth: "2026-11", globalMonthlyCeiling: 5000, orgMonthlyCeiling: 50 },
        turns: [{ role: "user", text: "Draft" }],
        mustDraft: true,
        adapter: {
          draft: async () => {
            throw new ProviderReplyError("Output truncated", "too-long");
          }
        }
      }),
    /Output truncated/
  );
  assert.equal(mockUserStore.aiCreditsUsed, 2);

  // 2. refusal failure refunds credit
  await assert.rejects(
    () =>
      draftModelWithCreditProtection({
        db: mockDb,
        uid: "uid-model-reply",
        orgId: "org-model-reply",
        auth: { token: { email_verified: true } },
        useSystemFallback: true,
        creditOptions: { yearMonth: "2026-11", globalMonthlyCeiling: 5000, orgMonthlyCeiling: 50 },
        turns: [{ role: "user", text: "Draft" }],
        mustDraft: true,
        adapter: {
          draft: async () => {
            throw new ProviderReplyError("Refused request", "refusal");
          }
        }
      }),
    /Refused request/
  );
  assert.equal(mockUserStore.aiCreditsUsed, 2);

  // 3. invalid-reply surviving the single retry refunds credit
  let failBothAttempts = 0;
  await assert.rejects(
    () =>
      draftModelWithCreditProtection({
        db: mockDb,
        uid: "uid-model-reply",
        orgId: "org-model-reply",
        auth: { token: { email_verified: true } },
        useSystemFallback: true,
        creditOptions: { yearMonth: "2026-11", globalMonthlyCeiling: 5000, orgMonthlyCeiling: 50 },
        turns: [{ role: "user", text: "Draft" }],
        mustDraft: true,
        adapter: {
          draft: async () => {
            failBothAttempts++;
            throw new ProviderReplyError("Malformed JSON", "invalid-reply");
          }
        }
      }),
    /Malformed JSON/
  );
  assert.equal(failBothAttempts, 2, "must attempt once plus single retry before throwing");
  assert.equal(mockUserStore.aiCreditsUsed, 2, "exhausted retry must refund credit");
  assert.equal(auditLogs.length, 3);
  assert.ok(auditLogs.every((l) => l.outcome === "refunded" && l.refunded === true));

  // 4. invalid-reply on first attempt that succeeds on retry charges exactly 1 credit
  let retryAttempts = 0;
  const succeeded = await draftModelWithCreditProtection({
    db: mockDb,
    uid: "uid-model-reply",
    orgId: "org-model-reply",
    auth: { token: { email_verified: true } },
    useSystemFallback: true,
    creditOptions: { yearMonth: "2026-11", globalMonthlyCeiling: 5000, orgMonthlyCeiling: 50 },
    turns: [{ role: "user", text: "Draft" }],
    mustDraft: false,
    adapter: {
      draft: async () => {
        retryAttempts++;
        if (retryAttempts === 1) {
          throw new ProviderReplyError("Transient bad schema", "invalid-reply");
        }
        return { reply: SAMPLE_DRAFT_REPLY, usage: SAMPLE_USAGE };
      }
    }
  });
  assert.equal(retryAttempts, 2);
  assert.equal(succeeded.requests, 2);
  assert.equal(succeeded.reply.kind, "questions");
  assert.equal(mockUserStore.aiCreditsUsed, 3, "successful retry must consume 1 credit");
  assert.equal(auditLogs[3].outcome, "success");
});

test("MIPA-47 (draftAction): provider failure refunds credit; BYO skips starter allowance", async () => {
  const mockUserStore: Record<string, unknown> = { aiCreditsUsed: 4 };
  const mockOrgStore: Record<string, unknown> = {
    aiCreditsUsed: 6,
    subscriptionTier: "community",
    monthlyAiUsage: { "2026-11": 8 }
  };
  const mockGlobalStore: Record<string, unknown> = { creditsUsed: 90 };
  const auditLogs: Record<string, unknown>[] = [];
  const mockDb = createTransactionalMockDb({
    userStore: mockUserStore,
    orgStore: mockOrgStore,
    globalStore: mockGlobalStore,
    auditLogs
  });

  await assert.rejects(
    () =>
      draftActionWithCreditProtection({
        db: mockDb,
        uid: "uid-action",
        orgId: "org-action",
        auth: { token: { email_verified: true } },
        useSystemFallback: true,
        creditOptions: { yearMonth: "2026-11", globalMonthlyCeiling: 5000, orgMonthlyCeiling: 50 },
        userPrompt: "Launch neighborhood pantry",
        adapter: {
          draftAction: async () => {
            throw new ProviderReplyError("Rate limited", "unavailable");
          }
        }
      }),
    /Rate limited/
  );

  assert.equal(mockUserStore.aiCreditsUsed, 4);
  assert.equal(mockOrgStore.aiCreditsUsed, 6);
  assert.equal((mockOrgStore.monthlyAiUsage as Record<string, number>)["2026-11"], 8);
  assert.equal(mockGlobalStore.creditsUsed, 90);
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].outcome, "refunded");

  // BYO key path leaves starter allowance untouched even when failing or succeeding
  const byoSuccess = await draftActionWithCreditProtection({
    db: mockDb,
    uid: "uid-action",
    orgId: "org-action",
    auth: { token: { email_verified: true } },
    useSystemFallback: false,
    userPrompt: "Launch neighborhood pantry",
    adapter: {
      draftAction: async () => ({ reply: SAMPLE_ACTION_REPLY, usage: SAMPLE_USAGE })
    }
  });
  assert.equal(byoSuccess.allowance, null);
  assert.equal(mockUserStore.aiCreditsUsed, 4);
  assert.equal(auditLogs.length, 1);
});

test("MIPA-47 safety: double-refund idempotency, underflow clamping, and non-success audit guards", async () => {
  const mockUserStore: Record<string, unknown> = { aiCreditsUsed: 0 };
  const mockOrgStore: Record<string, unknown> = {
    aiCreditsUsed: 1,
    subscriptionTier: "community",
    monthlyAiUsage: { "2026-11": 1 }
  };
  const mockGlobalStore: Record<string, unknown> = { creditsUsed: 5 };
  const auditLogs: Record<string, unknown>[] = [];
  const mockDb = createTransactionalMockDb({
    userStore: mockUserStore,
    orgStore: mockOrgStore,
    globalStore: mockGlobalStore,
    auditLogs
  });

  const reserved = await verifyAndConsumeAiCredit(
    mockDb,
    "uid-idem",
    "org-idem",
    { token: { email_verified: true } },
    { yearMonth: "2026-11", globalMonthlyCeiling: 5000, orgMonthlyCeiling: 50 }
  );
  assert.equal(mockUserStore.aiCreditsUsed, 1);
  assert.equal(mockOrgStore.aiCreditsUsed, 2);

  // Concurrent double-refund race must decrement exactly once
  const [r1, r2] = await Promise.all([
    refundAiCredit(mockDb, "uid-idem", "org-idem", reserved, "network-timeout"),
    refundAiCredit(mockDb, "uid-idem", "org-idem", reserved, "network-timeout")
  ]);
  const refundedCount = [r1, r2].filter((r) => r.refunded).length;
  assert.equal(refundedCount, 1, "only one concurrent refund call may succeed");
  assert.equal(mockUserStore.aiCreditsUsed, 0);
  assert.equal(mockOrgStore.aiCreditsUsed, 1);
  assert.equal(mockGlobalStore.creditsUsed, 5);

  // Subsequent refund is also a no-op
  const r3 = await refundAiCredit(mockDb, "uid-idem", "org-idem", reserved, "duplicate");
  assert.equal(r3.refunded, false);
  assert.equal(r3.reason, "already-refunded");

  // Clamping at 0 even if audit shows success while counters are already 0
  await mockDb.doc("systemAuditLogs/audit-clamp").set({
    auditKey: "audit-clamp",
    outcome: "success",
    uid: "uid-idem",
    orgId: "org-idem",
    yearMonth: "2026-11"
  });
  const clampRes = await refundAiCredit(
    mockDb,
    "uid-idem",
    "org-idem",
    { auditKey: "audit-clamp", yearMonth: "2026-11" },
    "clamp-check"
  );
  assert.equal(clampRes.refunded, true);
  assert.equal(mockUserStore.aiCreditsUsed, 0, "user credits must never underflow below 0");

  // Failed transaction audit cannot be refunded
  await mockDb.doc("systemAuditLogs/audit-failed").set({
    auditKey: "audit-failed",
    outcome: "failure",
    uid: "uid-idem",
    orgId: "org-idem",
    yearMonth: "2026-11"
  });
  const failedAuditRefund = await refundAiCredit(
    mockDb,
    "uid-idem",
    "org-idem",
    { auditKey: "audit-failed", yearMonth: "2026-11" },
    "should-not-refund"
  );
  assert.equal(failedAuditRefund.refunded, false);
  assert.equal(failedAuditRefund.reason, "outcome-failure");
});

test("MIPA-47 safety: atomic reserve prevents double-spend at ration boundary and frees slot on failure", async () => {
  const mockUserStore: Record<string, unknown> = { aiCreditsUsed: STARTER_VERIFIED_ALLOWANCE - 1 };
  const mockOrgStore: Record<string, unknown> = {
    aiCreditsUsed: 9,
    subscriptionTier: "community",
    monthlyAiUsage: { "2026-11": 9 }
  };
  const mockGlobalStore: Record<string, unknown> = { creditsUsed: 50 };
  const auditLogs: Record<string, unknown>[] = [];
  const mockDb = createTransactionalMockDb({
    userStore: mockUserStore,
    orgStore: mockOrgStore,
    globalStore: mockGlobalStore,
    auditLogs
  });

  // Two parallel requests when user has 9/10 credits: only one can pass the reserve transaction
  let callIndex = 0;
  let blockedWorkerRan = false;
  const settled = await Promise.allSettled([
    withAiCreditProtection(
      mockDb,
      "uid-race",
      "org-race",
      { token: { email_verified: true } },
      true,
      async () => {
        callIndex++;
        throw new Error(`Provider failed #${callIndex}`);
      },
      { creditOptions: { yearMonth: "2026-11", globalMonthlyCeiling: 5000, orgMonthlyCeiling: 50 } }
    ),
    withAiCreditProtection(
      mockDb,
      "uid-race",
      "org-race",
      { token: { email_verified: true } },
      true,
      async () => {
        blockedWorkerRan = true;
        return "unexpected-second-success";
      },
      { creditOptions: { yearMonth: "2026-11", globalMonthlyCeiling: 5000, orgMonthlyCeiling: 50 } }
    )
  ]);

  assert.equal(settled[0].status, "rejected");
  assert.equal(settled[1].status, "rejected");
  assert.equal(blockedWorkerRan, false, "concurrent second request must be blocked before calling AI provider");
  assert.equal(
    mockUserStore.aiCreditsUsed,
    STARTER_VERIFIED_ALLOWANCE - 1,
    "failed winner refunded slot back to 9 while concurrent second request was blocked at 10"
  );

  // Now test two concurrent SUCCEEDING requests at 9/10 credits: strictly one can pass
  let winnersInvoked = 0;
  const concurrentSuccess = await Promise.allSettled([
    draftModelWithCreditProtection({
      db: mockDb,
      uid: "uid-race",
      orgId: "org-race",
      auth: { token: { email_verified: true } },
      useSystemFallback: true,
      creditOptions: { yearMonth: "2026-11", globalMonthlyCeiling: 5000, orgMonthlyCeiling: 50 },
      turns: [{ role: "user", text: "Retry after outage A" }],
      mustDraft: true,
      adapter: {
        draft: async () => {
          winnersInvoked++;
          return { reply: SAMPLE_DRAFT_REPLY, usage: SAMPLE_USAGE };
        }
      }
    }),
    draftModelWithCreditProtection({
      db: mockDb,
      uid: "uid-race",
      orgId: "org-race",
      auth: { token: { email_verified: true } },
      useSystemFallback: true,
      creditOptions: { yearMonth: "2026-11", globalMonthlyCeiling: 5000, orgMonthlyCeiling: 50 },
      turns: [{ role: "user", text: "Retry after outage B" }],
      mustDraft: true,
      adapter: {
        draft: async () => {
          winnersInvoked++;
          return { reply: SAMPLE_DRAFT_REPLY, usage: SAMPLE_USAGE };
        }
      }
    })
  ]);
  const fulfilled = concurrentSuccess.filter((r) => r.status === "fulfilled");
  const rejected = concurrentSuccess.filter((r) => r.status === "rejected");
  assert.equal(fulfilled.length, 1, "exactly one concurrent request at 9/10 credits succeeds");
  assert.equal(rejected.length, 1, "second concurrent request is rejected by quota");
  assert.equal(winnersInvoked, 1, "blocked request must never invoke the AI provider");
  assert.equal(fulfilled[0].value.allowance?.creditsRemaining, 1);
  assert.equal(mockUserStore.aiCreditsUsed, STARTER_VERIFIED_ALLOWANCE);
});
