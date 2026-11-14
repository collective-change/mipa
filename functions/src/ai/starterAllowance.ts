import { Firestore, FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ProviderSettings } from "./providers";

export interface AllowanceEvaluationParams {
  userCreditsUsed: number;
  orgCreditsUsed: number;
  isEmailVerified: boolean;
  subscriptionTier?: string;
  hasByoKey: boolean;
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

/**
 * Pure evaluation function for AI credit allowance.
 */
export function evaluateAiAllowance(params: AllowanceEvaluationParams): AllowanceResult {
  // 1. If organization has brought their own API key, bypass starter quota
  if (params.hasByoKey) {
    return {
      allowed: true,
      maxCredits: Infinity,
      creditsUsed: params.userCreditsUsed,
      creditsRemaining: Infinity,
      source: "byo"
    };
  }

  // 2. If organization has a paid subscription tier, check pooled tier allowance
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

  // 3. Community / Free tier: User Starter Allowance
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
 * Resolves system backend AI provider for starter credits when BYO key is not configured.
 */
export function getSystemAiProvider(): SystemProviderInfo | null {
  const apiKey =
    process.env.SYSTEM_AI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    (process.env.FUNCTIONS_EMULATOR ? "emulator-mock-key" : "");

  if (!apiKey) {
    return null;
  }

  if (process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
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
 * Verifies and atomically consumes 1 AI credit in Firestore for user or org.
 */
export async function verifyAndConsumeAiCredit(
  db: Firestore,
  uid: string,
  orgId: string,
  auth: { token?: { email_verified?: boolean } }
): Promise<AllowanceResult> {
  const userRef = db.doc(`users/${uid}`);
  const orgRef = db.doc(`orgs/${orgId}`);

  return await db.runTransaction(async (tx) => {
    const [userDoc, orgDoc] = await Promise.all([tx.get(userRef), tx.get(orgRef)]);

    const userCreditsUsed = (userDoc.get("aiCreditsUsed") as number) || 0;
    const orgCreditsUsed = (orgDoc.get("aiCreditsUsed") as number) || 0;
    const subscriptionTier = (orgDoc.get("subscriptionTier") as string) || "community";
    const isEmailVerified = Boolean(auth.token?.email_verified);

    const evaluation = evaluateAiAllowance({
      userCreditsUsed,
      orgCreditsUsed,
      isEmailVerified,
      subscriptionTier,
      hasByoKey: false
    });

    if (!evaluation.allowed) {
      throw new HttpsError("failed-precondition", evaluation.reason || "AI credit limit reached.", {
        reason: isEmailVerified ? "quota-exceeded" : "verify-email",
        creditsUsed: evaluation.creditsUsed,
        maxCredits: evaluation.maxCredits
      });
    }

    // Atomically increment credits
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
        lastAiUsedAt: FieldValue.serverTimestamp()
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
  const [userDoc, orgDoc, settingsDoc] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`orgs/${orgId}`).get(),
    db.doc(`orgAiSettings/${orgId}`).get()
  ]);

  const hasByoKey = Boolean(settingsDoc.exists && settingsDoc.get("provider"));
  const userCreditsUsed = (userDoc.get("aiCreditsUsed") as number) || 0;
  const orgCreditsUsed = (orgDoc.get("aiCreditsUsed") as number) || 0;
  const subscriptionTier = (orgDoc.get("subscriptionTier") as string) || "community";
  const isEmailVerified = Boolean(request.auth.token?.email_verified);

  return evaluateAiAllowance({
    userCreditsUsed,
    orgCreditsUsed,
    isEmailVerified,
    subscriptionTier,
    hasByoKey
  });
});
