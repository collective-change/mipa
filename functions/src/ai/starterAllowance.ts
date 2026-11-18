import { Firestore, FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  ProviderSettings,
  DEFAULT_SYSTEM_ANTHROPIC_MODEL,
  DEFAULT_SYSTEM_OPENAI_MODEL
} from "./providers";
import { systemAiProviderKey } from "./keyBox";
import { FALLBACK_TIER_PRICES } from "../billing/lemonSqueezy";

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

// Margin guard AI spend ceiling configuration (MIPA-27)
// ceiling_ops = clamp(floor, revenue_basis * MARGIN_PCT / UNIT_COST_USD, absolute_cap)
export const DEFAULT_AI_MARGIN_PCT = 0.10;
export const DEFAULT_AI_UNIT_COST_USD = 0.005;
export const DEFAULT_AI_CEILING_FLOOR = 5000;
export const DEFAULT_AI_CEILING_ABSOLUTE_CAP = 100000;

export const DEFAULT_GLOBAL_MONTHLY_AI_CEILING = DEFAULT_AI_CEILING_FLOOR;

// Note: DEFAULT_ORG_STARTER_MONTHLY_CEILING = 50 can never fire in normal practice
// because the user's lifetime 10 credits bind first. We retain this constant as an
// organizational backstop against potential abuse.
export const DEFAULT_ORG_STARTER_MONTHLY_CEILING = 50;

export function getMarginPct(): number {
  const envVal = process.env.AI_MARGIN_PCT || process.env.MARGIN_PCT;
  if (envVal) {
    const parsed = parseFloat(envVal);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_AI_MARGIN_PCT;
}

export function getUnitCostUsd(): number {
  const envVal = process.env.AI_UNIT_COST_USD || process.env.UNIT_COST_USD;
  if (envVal) {
    const parsed = parseFloat(envVal);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_AI_UNIT_COST_USD;
}

export function getCeilingFloor(): number {
  const envVal = process.env.AI_CEILING_FLOOR || process.env.GLOBAL_AI_MONTHLY_CEILING_FLOOR || process.env.GLOBAL_AI_MONTHLY_CEILING;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_AI_CEILING_FLOOR;
}

export function getCeilingAbsoluteCap(): number {
  const envVal = process.env.AI_CEILING_ABSOLUTE_CAP || process.env.GLOBAL_AI_MONTHLY_CEILING_CAP;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_AI_CEILING_ABSOLUTE_CAP;
}

export function getOrgStarterMonthlyCeiling(): number {
  const envVal = process.env.ORG_STARTER_MONTHLY_CEILING;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_ORG_STARTER_MONTHLY_CEILING;
}

export function getGlobalMonthlyCeiling(): number {
  return getCeilingFloor();
}

export interface CeilingComputationResult {
  ceilingOps: number;
  revenueBasis: number;
  marginPct: number;
  unitCostUsd: number;
  floor: number;
  absoluteCap: number;
}

/**
 * Computes dynamic margin guard AI ceiling:
 * ceiling_ops = clamp(floor, revenue_basis * MARGIN_PCT / UNIT_COST_USD, absolute_cap)
 */
export function computeMarginGuardCeiling(params: {
  revenueBasis: number;
  marginPct?: number;
  unitCostUsd?: number;
  floor?: number;
  absoluteCap?: number;
}): CeilingComputationResult {
  const marginPct = params.marginPct ?? getMarginPct();
  const unitCostUsd = params.unitCostUsd ?? getUnitCostUsd();
  const floor = params.floor ?? getCeilingFloor();
  const absoluteCap = params.absoluteCap ?? getCeilingAbsoluteCap();
  const revenueBasis = Math.max(0, params.revenueBasis || 0);

  const allocatedBudgetUsd = revenueBasis * marginPct;
  const rawOps = unitCostUsd > 0 ? allocatedBudgetUsd / unitCostUsd : 0;
  const ceilingOps = Math.min(absoluteCap, Math.max(floor, Math.round(rawOps)));

  return {
    ceilingOps,
    revenueBasis,
    marginPct,
    unitCostUsd,
    floor,
    absoluteCap
  };
}

/**
 * Reads active subscriptions from Firestore to determine current MRR (revenue basis).
 * If revenue read fails, fails closed to 0 MRR (which yields the floor ceiling).
 */
export async function computeCurrentMrr(db: Firestore): Promise<number> {
  try {
    if (typeof db.collection !== "function") return 0;
    const orgsColl = db.collection("orgs");
    if (!("where" in orgsColl) || typeof orgsColl.where !== "function") return 0;

    const snapshot = await orgsColl.where("subscriptionStatus", "==", "active").get();
    let totalMrr = 0;

    for (const doc of snapshot.docs) {
      const data = typeof doc.data === "function" ? doc.data() : (doc as unknown as Record<string, unknown>);
      const tier = String(data.subscriptionTier || "community").toLowerCase();
      if (tier === "community") continue;

      const cycle: "monthly" | "annual" =
        String(data.billingCycle || "monthly").toLowerCase() === "annual" ? "annual" : "monthly";

      const rawAmount = data.paidAmount ?? data.subscriptionPaidAmount ?? data.total ?? data.subtotal;

      if (typeof rawAmount === "number" && rawAmount > 0) {
        // Lemon Squeezy amounts in cents (e.g. 2900 cents = $29, 29000 cents = $290).
        // If rawAmount >= 1000, convert cents to dollars.
        const dollars = rawAmount >= 1000 ? rawAmount / 100 : rawAmount;
        const orgMrr = cycle === "annual" ? dollars / 12 : dollars;
        totalMrr += orgMrr;
      } else {
        const fallbackTable = FALLBACK_TIER_PRICES[tier] || FALLBACK_TIER_PRICES.starter;
        const fallbackNominal = fallbackTable[cycle] ?? fallbackTable.monthly;
        const fallbackMrr = cycle === "annual" ? fallbackNominal / 12 : fallbackNominal;
        console.log(
          `[AI Margin Guard] Using fallback price for org ${doc.id}: tier=${tier}, billingCycle=${cycle}, fallbackMRR=$${fallbackMrr.toFixed(2)}`
        );
        totalMrr += fallbackMrr;
      }
    }

    return Math.round(totalMrr * 100) / 100;
  } catch (err) {
    console.error("[AI Margin Guard] Failed to read subscription revenue from Firestore, failing closed to 0 MRR:", err);
    return 0;
  }
}

/**
 * Resolves the dynamic global monthly ceiling in operations.
 * Logs computed revenue_basis, percentage, unit cost, and resulting ceiling without secrets.
 */
export async function resolveGlobalMonthlyCeiling(
  db?: Firestore,
  options?: { revenueBasis?: number; globalMonthlyCeiling?: number }
): Promise<number> {
  if (options?.globalMonthlyCeiling !== undefined) {
    return options.globalMonthlyCeiling;
  }

  let revenueBasis = options?.revenueBasis;
  if (revenueBasis === undefined) {
    revenueBasis = db ? await computeCurrentMrr(db) : 0;
  }

  const guard = computeMarginGuardCeiling({ revenueBasis });

  console.log(
    `[AI Margin Guard] Evaluated dynamic ceiling: revenue_basis=$${guard.revenueBasis.toFixed(2)}, margin_pct=${(guard.marginPct * 100).toFixed(1)}%, unit_cost=$${guard.unitCostUsd}, resulting_ceiling=${guard.ceilingOps} ops (floor=${guard.floor}, cap=${guard.absoluteCap})`
  );

  return guard.ceilingOps;
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
        "System AI monthly capacity ceiling reached for this month. To continue immediately, please connect your organization's own Anthropic or OpenAI API key in AI Settings."
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
        model: DEFAULT_SYSTEM_OPENAI_MODEL,
        baseUrl: "https://api.openai.com/v1"
      },
      apiKey
    };
  }

  return {
    settings: {
      provider: "anthropic",
      model: DEFAULT_SYSTEM_ANTHROPIC_MODEL
    },
    apiKey
  };
}

export type AuditOutcome = "success" | "failure" | "unknown";

export interface SystemAuditLogData {
  auditKey: string;
  event: string;
  outcome: AuditOutcome;
  yearMonth: string;
  orgId: string;
  uid: string;
  type?: "global" | "org" | "user" | "system";
  creditsUsed?: number;
  ceiling?: number;
  reason?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

function cleanUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as Partial<T>;
}

/**
 * Creates an audit record outside of the transaction boundary with initial outcome 'unknown'.
 * The resulting record carries an auditKey that can be back-filled once the transaction outcome is known.
 */
export async function createAuditRecord(
  db: Firestore,
  params: {
    auditKey?: string;
    event?: string;
    outcome?: AuditOutcome;
    yearMonth: string;
    orgId: string;
    uid: string;
    type?: "global" | "org" | "user" | "system";
    creditsUsed?: number;
    ceiling?: number;
    reason?: string;
  }
): Promise<{ ref: import("firebase-admin/firestore").DocumentReference; auditKey: string }> {
  const docRef = params.auditKey
    ? db.collection("systemAuditLogs").doc(params.auditKey)
    : db.collection("systemAuditLogs").doc();
  const auditKey = docRef.id;

  await docRef.set(
    cleanUndefined({
      auditKey,
      event: params.event || "ai_credit_evaluation",
      outcome: params.outcome || "unknown",
      yearMonth: params.yearMonth,
      orgId: params.orgId,
      uid: params.uid,
      type: params.type,
      creditsUsed: params.creditsUsed,
      ceiling: params.ceiling,
      reason: params.reason,
      createdAt: FieldValue.serverTimestamp()
    })
  );

  return { ref: docRef, auditKey };
}

/**
 * Back-fills an existing audit record with its final verdict outcome ('success' or 'failure').
 */
export async function backfillAuditRecord(
  auditRef: import("firebase-admin/firestore").DocumentReference,
  updates: Partial<SystemAuditLogData>
): Promise<void> {
  await auditRef.set(
    cleanUndefined({
      ...updates,
      updatedAt: FieldValue.serverTimestamp()
    }),
    { merge: true }
  );
}

/**
 * Verifies and atomically consumes 1 AI credit in Firestore for user, org, and global ceiling.
 * Audit logging is handled outside the transaction boundary to ensure audit records survive transaction rollback.
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
    auditKey?: string;
    revenueBasis?: number;
  } = {}
): Promise<AllowanceResult> {
  const yearMonth = options.yearMonth || getCurrentYearMonth();
  const globalCeiling = options.globalMonthlyCeiling ?? (await resolveGlobalMonthlyCeiling(db, { revenueBasis: options.revenueBasis }));
  const orgStarterCeiling = options.orgMonthlyCeiling ?? getOrgStarterMonthlyCeiling();

  // 1. Create audit record OUTSIDE transaction blast radius with outcome: 'unknown'
  const { ref: auditRef } = await createAuditRecord(db, {
    auditKey: options.auditKey,
    event: "ai_credit_evaluation",
    outcome: "unknown",
    yearMonth,
    orgId,
    uid
  });

  const userRef = db.doc(`users/${uid}`);
  const orgRef = db.doc(`orgs/${orgId}`);
  const globalUsageRef = db.doc(`systemUsage/${yearMonth}`);

  try {
    const evaluation = await db.runTransaction(async (tx) => {
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

      // 1. Check Global Spend Ceiling (Margin guard dynamic spend cap)
      if (globalMonthlyUsed >= globalCeiling) {
        console.warn(`[AI Spend Ceiling] Global ceiling reached: ${globalMonthlyUsed}/${globalCeiling} in ${yearMonth}`);
        throw new HttpsError(
          "resource-exhausted",
          `System AI monthly capacity ceiling reached for this month. To continue drafting models immediately, please connect your organization's own Anthropic or OpenAI API key in AI Settings.`,
          { reason: "global-ceiling-reached", degraded: true, yearMonth, globalMonthlyUsed, globalCeiling }
        );
      }

      // 2. Check Per-Organization Monthly Ceiling for free tier
      const isCommunity = subscriptionTier.toLowerCase() === "community";
      if (isCommunity && orgMonthlyUsed >= orgStarterCeiling) {
        console.warn(`[AI Spend Ceiling] Org ceiling reached for ${orgId}: ${orgMonthlyUsed}/${orgStarterCeiling} in ${yearMonth}`);
        throw new HttpsError(
          "resource-exhausted",
          `Organization monthly starter AI quota reached (${orgStarterCeiling} operations for ${yearMonth}). Please connect your own API key in AI Settings or upgrade.`,
          { reason: "org-ceiling-reached", degraded: true, yearMonth, orgMonthlyUsed, orgStarterCeiling }
        );
      }

      // 3. User & Paid Tier Allowance Check
      const evalResult = evaluateAiAllowance({
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

      if (!evalResult.allowed) {
        throw new HttpsError("failed-precondition", evalResult.reason || "AI credit limit reached.", {
          reason: isEmailVerified ? "quota-exceeded" : "verify-email",
          creditsUsed: evalResult.creditsUsed,
          maxCredits: evalResult.maxCredits
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

      return evalResult;
    });

    // 2. Transaction succeeded: backfill outcome = 'success'
    await backfillAuditRecord(auditRef, {
      outcome: "success",
      creditsUsed: evaluation.creditsUsed
    });

    return evaluation;
  } catch (error) {
    // 3. Transaction failed or threw: backfill outcome = 'failure'
    const details = (error instanceof HttpsError ? error.details : {}) as Record<string, unknown> | undefined;
    const isCeiling = details?.reason === "global-ceiling-reached" || details?.reason === "org-ceiling-reached";
    const ceilingType = details?.reason === "global-ceiling-reached" ? "global" : "org";

    await backfillAuditRecord(auditRef, {
      outcome: "failure",
      event: isCeiling ? "ai_ceiling_reached" : "ai_credit_evaluation",
      type: isCeiling ? ceilingType : "user",
      creditsUsed: typeof details?.globalMonthlyUsed === "number" ? details.globalMonthlyUsed
        : typeof details?.orgMonthlyUsed === "number" ? details.orgMonthlyUsed
        : typeof details?.creditsUsed === "number" ? details.creditsUsed : undefined,
      ceiling: typeof details?.globalCeiling === "number" ? details.globalCeiling
        : typeof details?.orgStarterCeiling === "number" ? details.orgStarterCeiling : undefined,
      reason: (details?.reason as string) || (error instanceof Error ? error.message : "transaction_failed")
    });

    throw error;
  }
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
  const dynamicGlobalCeiling = await resolveGlobalMonthlyCeiling(db);

  return evaluateAiAllowance({
    userCreditsUsed,
    orgCreditsUsed,
    isEmailVerified,
    subscriptionTier,
    hasByoKey,
    globalMonthlyUsed,
    globalMonthlyCeiling: dynamicGlobalCeiling,
    orgMonthlyUsed,
    orgMonthlyCeiling: getOrgStarterMonthlyCeiling()
  });
});

