import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
  evaluateAiAllowance,
  getSystemAiProvider,
  verifyAndConsumeAiCredit,
  STARTER_VERIFIED_ALLOWANCE,
  STARTER_UNVERIFIED_TEASER,
  TIER_AI_ALLOWANCES
} from "./starterAllowance";

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
    assert.equal(anthropicProvider.apiKey, "test-anthropic-key");

    // 2. With OpenAI key only
    delete process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = "test-openai-key";
    const openaiProvider = getSystemAiProvider();
    assert.ok(openaiProvider);
    assert.equal(openaiProvider.settings.provider, "openai-compatible");
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

test("verifyAndConsumeAiCredit: Atomically checks and decrements allowance", async () => {
  const mockUserStore: Record<string, unknown> = {
    aiCreditsUsed: 3
  };
  const mockOrgStore: Record<string, unknown> = {
    aiCreditsUsed: 5,
    subscriptionTier: "community"
  };

  const userDocMock = {
    get: (field: string) => mockUserStore[field]
  };
  const orgDocMock = {
    get: (field: string) => mockOrgStore[field]
  };

  const mockDb = {
    doc: (path: string) => ({
      path
    }),
    runTransaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      const txMock = {
        get: async (ref: { path: string }) => {
          if (ref.path.startsWith("users/")) return userDocMock;
          if (ref.path.startsWith("orgs/")) return orgDocMock;
          return { get: () => undefined };
        },
        set: (ref: { path: string }, data: Record<string, unknown>) => {
          if (ref.path.startsWith("users/")) Object.assign(mockUserStore, data);
          if (ref.path.startsWith("orgs/")) Object.assign(mockOrgStore, data);
        }
      };
      return await cb(txMock);
    }
  } as unknown as import("firebase-admin/firestore").Firestore;

  // Consume credit with verified email
  const result = await verifyAndConsumeAiCredit(mockDb, "uid-123", "org-456", {
    token: { email_verified: true }
  });

  assert.equal(result.allowed, true);
  assert.equal(result.source, "starter_verified");
  assert.ok(mockUserStore.lastAiUsedAt !== undefined);
  assert.ok(mockOrgStore.lastAiUsedAt !== undefined);
});
