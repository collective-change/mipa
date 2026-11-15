import { Firestore, FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ProviderSettings } from "./providers";
import { systemAiProviderKey } from "./keyBox";

export interface AllowanceEvaluationParams {
  userCreditsUsed: number;
  orgCreditsUsed: number;
  isEmailVerified: boolean;
  subscriptionTier?: string;
  hasByoKey: boolean;
  globalMonthlyUsed?: number;
  globalMonthlyCeiling?: number;
  orgMonthlyUsed?: number;
  orgMonthlyCeiling?: number;
}

export interface AllowanceResult {
  allowed: boolean;
  maxCredits: number;
  creditsUsed: number;
  creditsRemaining: number;
  source: "byo" | "tier_pooled" | "starter_verified" | "starter_teaser";
  reason?: string;
}

export interface SystemProviderInfo {
  settings: ProviderSettings;
  apiKey: string;
}

export const TIER_AI_ALLOWANCES: Record<string, number> = {
  starter: 100,
  growth: 500,
  pro: 1500,
  enterprise: 5000
};

export const STARTER_VERIFIED_ALLOWANCE = 10;
export const STARTER_UNVERIFIED_TEASER = 2;

// Business plan stated monthly spend ceiling: ~$25/month total LLM spend.
// At ~$0.005/turn on lightweight models, 5,000 operations/month = $25.
export const DEFAULT_GLOBAL_MONTHLY_AI_CEILING = 5000;
export const DEFAULT_ORG_STARTER_MONTHLY_CEILING = 50;

export function getGlobalMonthlyCeiling(): number {
  const envVal = process.env.GLOBAL_AI_MONTHLY_CEILING;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_GLOBAL_MONTHLY_AI_CEILING;
}

export function getOrgStarterMonthlyCeiling(): number {
  const envVal = process.env.ORG_STARTER_MONTHLY_CEILING;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_ORG_STARTER_MONTHLY_CEILING;
}

export function getCurrentYearMonth(d: Date = new Date(), timeZone = "Asia/Taipei"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit"
  }).format(d);
}

/**
 * Pure evaluation function for AI credit allowance.
 */
export function evaluateAiAllowance(params: AllowanceEvaluationParams): AllowanceResult {
  // 1. If organization has brought their own API key, bypass starter quota and all ceilings
  if (params.hasByoKey) {
    return {
      allowed: true,
      maxCredits: Infinity,
      creditsUsed: params.userCreditsUsed,
      creditsRemaining: Infinity,
      source: "byo"
    };
  }

  // 2. Global hard monthly ceiling check (if provided in params)
  if (
    params.globalMonthlyUsed !== undefined &&
    params.globalMonthlyCeiling !== undefined &&
    params.globalMonthlyUsed >= params.globalMonthlyCeiling
  ) {
    return {
      allowed: false,
      maxCredits: params.globalMonthlyCeiling,
      creditsUsed: params.globalMonthlyUsed,
      creditsRemaining: 0,
      source: "tier_pooled",
      reason:
        "System AI monthly capacity ceiling reached for this month ($25 limit). To continue immediately, please connect your organization's own Anthropic or OpenAI API key in AI Settings."
    };
  }

  // 3. If organization has a paid subscription tier, check pooled tier allowance
  const tier = (params.subscriptionTier || "community").toLowerCase();
  if (tier !== "community" && TIER_AI_ALLOWANCES[tier]) {
    const tierLimit = TIER_AI_ALLOWANCES[tier];
    const used = params.orgCreditsUsed || 0;
    const allowed = used < tierLimit;
    return {
      allowed,
      maxCredits: tierLimit,
      creditsUsed: used,
      creditsRemaining: Math.max(0, tierLimit - used),
      source: "tier_pooled",
      reason: allowed
        ? undefined
        : `Organizational AI quota (${tierLimit} operations/month) reached for the ${tier} tier. Please connect a custom API key in AI Settings or upgrade.`
    };
  }

  // 4. Per-Organization Monthly Ceiling for community/free tier (if provided in params)
  if (
    params.orgMonthlyUsed !== undefined &&
    params.orgMonthlyCeiling !== undefined &&
    params.orgMonthlyUsed >= params.orgMonthlyCeiling
  ) {
    return {
      allowed: false,
      maxCredits: params.orgMonthlyCeiling,
      creditsUsed: params.orgMonthlyUsed,
      creditsRemaining: 0,
      source: "starter_verified",
      reason: `Organization monthly starter AI quota reached (${params.orgMonthlyCeiling} operations/month). Please connect your own API key in AI Settings or upgrade.`
    };
  }

  // 5. Community / Free tier: User Starter Allowance
  const userUsed = params.userCreditsUsed || 0;

  if (params.isEmailVerified) {
    const allowed = userUsed < STARTER_VERIFIED_ALLOWANCE;
    return {
      allowed,
      maxCredits: STARTER_VERIFIED_ALLOWANCE,
      creditsUsed: userUsed,
      creditsRemaining: Math.max(0, STARTER_VERIFIED_ALLOWANCE - userUsed),
      source: "starter_verified",
      reason: allowed
        ? undefined
        : `You have used all ${STARTER_VERIFIED_ALLOWANCE} starter AI credits. To continue drafting models, please connect your organization's Anthropic or OpenAI API key in AI Settings.`
    };
  }

  // Unverified email / teaser mode (max 2 calls)
  const teaserAllowed = userUsed < STARTER_UNVERIFIED_TEASER;
  return {
    allowed: teaserAllowed,
    maxCredits: STARTER_UNVERIFIED_TEASER,
    creditsUsed: userUsed,
    creditsRemaining: Math.max(0, STARTER_UNVERIFIED_TEASER - userUsed),
    source: "starter_teaser",
    reason: teaserAllowed
      ? undefined
      : "Please verify your email address to unlock your full 10 complimentary starter AI credits."
  };
}

/**
 * Safely reads the system AI provider key from Secret Manager at runtime,
 * falling back to environment or emulator mock key.
 */
export function readSystemApiKey(): string {
  if (process.env.SYSTEM_AI_PROVIDER_KEY) {
    return process.env.SYSTEM_AI_PROVIDER_KEY;
  }
  if (process.env.SYSTEM_AI_API_KEY) {
    return process.env.SYSTEM_AI_API_KEY;
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }
  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY;
  }

  try {
    if (systemAiProviderKey && typeof systemAiProviderKey.value === "function") {
      const val = systemAiProviderKey.value();
      if (val) return val;
    }
  } catch {
    // Secret not available in environment
  }

  return process.env.FUNCTIONS_EMULATOR ? "emulator-mock-key" : "";
}

/**
 * Resolves system backend AI provider for starter credits when BYO key is not configured.
 */
export function getSystemAiProvider(): SystemProviderInfo | null {
  const apiKey = readSystemApiKey();

  if (!apiKey) {
    return null;
  }

  if (process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY && !process.env.SYSTEM_AI_PROVIDER_KEY) {
    return {
      settings: {
        provider: "openai-compatible",
        model: "gpt-4o-mini",
        baseUrl: "https://api.openai.com/v1"
      },
      apiKey
    };
  }

  return {
    settings: {
      provider: "anthropic",
      model: "claude-3-5-haiku-20241022"
    },
    apiKey
  };
}

/**
 * Verifies and atomically consumes 1 AI credit in Firestore for user, org, and global ceiling.
 */
export async function verifyAndConsumeAiCredit(
  db: Firestore,
  uid: string,
  orgId: string,
  auth: { token?: { email_verified?: boolean } },
  options: {
    yearMonth?: string;
    globalMonthlyCeiling?: number;
    orgMonthlyCeiling?: number;
  } = {}
): Promise<AllowanceResult> {
  const yearMonth = options.yearMonth || getCurrentYearMonth();
  const globalCeiling = options.globalMonthlyCeiling ?? getGlobalMonthlyCeiling();
  const orgStarterCeiling = options.orgMonthlyCeiling ?? getOrgStarterMonthlyCeiling();

  const userRef = db.doc(`users/${uid}`);
  const orgRef = db.doc(`orgs/${orgId}`);
  const globalUsageRef = db.doc(`systemUsage/${yearMonth}`);

  return await db.runTransaction(async (tx) => {
    const [userDoc, orgDoc, globalDoc] = await Promise.all([
      tx.get(userRef),
      tx.get(orgRef),
      tx.get(globalUsageRef)
    ]);

    const userCreditsUsed = (userDoc.get("aiCreditsUsed") as number) || 0;
    const orgCreditsUsed = (orgDoc.get("aiCreditsUsed") as number) || 0;
    const subscriptionTier = (orgDoc.get("subscriptionTier") as string) || "community";
    const isEmailVerified = Boolean(auth.token?.email_verified);

    // Monthly usage counters
    const globalMonthlyUsed = (globalDoc.get("creditsUsed") as number) || 0;
    const monthlyUsageMap = (orgDoc.get("monthlyAiUsage") as Record<string, number>) || {};
    const orgMonthlyUsed = monthlyUsageMap[yearMonth] || 0;

    // 1. Check Global Spend Ceiling ($25 monthly spend cap)
    if (globalMonthlyUsed >= globalCeiling) {
      console.warn(`[AI Spend Ceiling] Global ceiling reached: ${globalMonthlyUsed}/${globalCeiling} in ${yearMonth}`);
      const auditRef = db.collection("systemAuditLogs").doc();
      tx.set(auditRef, {
        event: "ai_ceiling_reached",
        type: "global",
        yearMonth,
        creditsUsed: globalMonthlyUsed,
        ceiling: globalCeiling,
        orgId,
        uid,
        timestamp: FieldValue.serverTimestamp()
      });
      throw new HttpsError(
        "resource-exhausted",
        `System AI monthly capacity ceiling reached for this month ($25 limit). To continue drafting models immediately, please connect your organization's own Anthropic or OpenAI API key in AI Settings.`,
        { reason: "global-ceiling-reached", degraded: true, yearMonth, globalMonthlyUsed, globalCeiling }
      );
    }

    // 2. Check Per-Organization Monthly Ceiling for free tier
    const isCommunity = subscriptionTier.toLowerCase() === "community";
    if (isCommunity && orgMonthlyUsed >= orgStarterCeiling) {
      console.warn(`[AI Spend Ceiling] Org ceiling reached for ${orgId}: ${orgMonthlyUsed}/${orgStarterCeiling} in ${yearMonth}`);
      const auditRef = db.collection("systemAuditLogs").doc();
      tx.set(auditRef, {
        event: "ai_ceiling_reached",
        type: "org",
        yearMonth,
        creditsUsed: orgMonthlyUsed,
        ceiling: orgStarterCeiling,
        orgId,
        uid,
        timestamp: FieldValue.serverTimestamp()
      });
      throw new HttpsError(
        "resource-exhausted",
        `Organization monthly starter AI quota reached (${orgStarterCeiling} operations for ${yearMonth}). Please connect your own API key in AI Settings or upgrade.`,
        { reason: "org-ceiling-reached", degraded: true, yearMonth, orgMonthlyUsed, orgStarterCeiling }
      );
    }

    // 3. User & Paid Tier Allowance Check
    const evaluation = evaluateAiAllowance({
      userCreditsUsed,
      orgCreditsUsed,
      isEmailVerified,
      subscriptionTier,
      hasByoKey: false,
      globalMonthlyUsed,
      globalMonthlyCeiling: globalCeiling,
      orgMonthlyUsed,
      orgMonthlyCeiling: orgStarterCeiling
    });

    if (!evaluation.allowed) {
      throw new HttpsError("failed-precondition", evaluation.reason || "AI credit limit reached.", {
        reason: isEmailVerified ? "quota-exceeded" : "verify-email",
        creditsUsed: evaluation.creditsUsed,
        maxCredits: evaluation.maxCredits
      });
    }

    // 4. Atomically increment all counters
    tx.set(
      userRef,
      {
        aiCreditsUsed: FieldValue.increment(1),
        lastAiUsedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    tx.set(
      orgRef,
      {
        aiCreditsUsed: FieldValue.increment(1),
        [`monthlyAiUsage.${yearMonth}`]: FieldValue.increment(1),
        lastAiUsedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    tx.set(
      globalUsageRef,
      {
        yearMonth,
        creditsUsed: FieldValue.increment(1),
        lastUsedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    return evaluation;
  });
}

/**
 * Callable endpoint to inspect the current AI allowance status for a user/org.
 */
export const getAiAllowanceStatus = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Please sign in.");
  const uid = request.auth.uid;
  const { orgId } = request.data || {};
  if (typeof orgId !== "string" || !orgId) {
    throw new HttpsError("invalid-argument", "orgId is required.");
  }
  const db = getFirestore();
  const yearMonth = getCurrentYearMonth();
  const [userDoc, orgDoc, settingsDoc, globalDoc] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`orgs/${orgId}`).get(),
    db.doc(`orgAiSettings/${orgId}`).get(),
    db.doc(`systemUsage/${yearMonth}`).get()
  ]);

  const hasByoKey = Boolean(settingsDoc.exists && settingsDoc.get("provider"));
  const userCreditsUsed = (userDoc.get("aiCreditsUsed") as number) || 0;
  const orgCreditsUsed = (orgDoc.get("aiCreditsUsed") as number) || 0;
  const subscriptionTier = (orgDoc.get("subscriptionTier") as string) || "community";
  const isEmailVerified = Boolean(request.auth.token?.email_verified);

  const globalMonthlyUsed = (globalDoc.get("creditsUsed") as number) || 0;
  const monthlyUsageMap = (orgDoc.get("monthlyAiUsage") as Record<string, number>) || {};
  const orgMonthlyUsed = monthlyUsageMap[yearMonth] || 0;

  return evaluateAiAllowance({
    userCreditsUsed,
    orgCreditsUsed,
    isEmailVerified,
    subscriptionTier,
    hasByoKey,
    globalMonthlyUsed,
    globalMonthlyCeiling: getGlobalMonthlyCeiling(),
    orgMonthlyUsed,
    orgMonthlyCeiling: getOrgStarterMonthlyCeiling()
  });
});

