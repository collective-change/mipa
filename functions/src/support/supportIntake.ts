/**
 * Support Intake & In-App Customer Service (MIPA-36)
 *
 * Provides structured customer support intake with stated response expectations
 * and persists tickets directly into Firestore supportTickets collection.
 * (Note: docs/BACKLOG.md filing was retired on 2026-11-26 in favor of the Firestore ops-store).
 */

import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

export type SupportCategory = "defect" | "billing" | "modeling" | "feature_request" | "general";
export type CustomerTier = "community" | "starter" | "growth" | "pro" | "enterprise";

export interface StatedResponseExpectation {
  hours: number;
  displayText: string;
  guaranteed: boolean;
}

/**
 * Stated response expectations per tier (§2 business plan alignment).
 */
export const SUPPORT_RESPONSE_EXPECTATIONS: Record<CustomerTier, StatedResponseExpectation> = {
  community: {
    hours: 0,
    displayText: "Community support via public GitHub Issues (no guaranteed SLA)",
    guaranteed: false
  },
  starter: {
    hours: 48,
    displayText: "48 business hours response expectation",
    guaranteed: true
  },
  growth: {
    hours: 24,
    displayText: "24 business hours response expectation",
    guaranteed: true
  },
  pro: {
    hours: 12,
    displayText: "12 business hours response expectation (priority)",
    guaranteed: true
  },
  enterprise: {
    hours: 4,
    displayText: "4 business hours SLA (mission-critical response)",
    guaranteed: true
  }
};

/**
 * Finds the highest MIPA-<n> identifier in a task string or backlog content.
 */
export function findHighestMipaId(content: string): number {
  const matches = content.matchAll(/MIPA-(\d+)/g);
  let highest = 0;
  for (const m of matches) {
    const num = parseInt(m[1], 10);
    if (!isNaN(num) && num > highest) {
      highest = num;
    }
  }
  return highest;
}

/**
 * Automatically appends a support ticket as a board task.
 * (Retired: The markdown queue docs/BACKLOG.md was retired on 2026-11-26;
 * support tickets are persisted to the Firestore supportTickets collection).
 */
export function fileSupportBoardTask(
  ticketId: string,
  subject: string,
  message?: string,
  email?: string,
  orgId?: string,
  tier?: CustomerTier,
  backlogPath?: string
): { success: boolean; taskTitle: string; taskId?: string } {
  // Retired: The markdown queue (docs/BACKLOG.md) was retired on 2026-11-26.
  // Tickets are persisted directly to Firestore supportTickets.
  void ticketId;
  void message;
  void email;
  void orgId;
  void tier;
  void backlogPath;
  return {
    success: false,
    taskTitle: `Support: ${subject}`
  };
}

/**
 * Callable Cloud Function: In-app support ticket intake.
 * Validates requester and persists ticket in Firestore supportTickets collection.
 */
export const submitSupportTicket = onCall(async (request: CallableRequest) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Please sign in to submit a support request.");
  }

  const subject = (request.data?.subject || "").trim();
  const message = (request.data?.message || "").trim();
  const category = (request.data?.category || "general") as SupportCategory;
  const orgId = (request.data?.orgId || "").trim();

  if (!subject) {
    throw new HttpsError("invalid-argument", "Subject is required.");
  }
  if (!message || message.length < 10) {
    throw new HttpsError("invalid-argument", "Message must be at least 10 characters.");
  }

  const email = request.auth.token.email || "unknown@user";
  const uid = request.auth.uid;
  const db = getFirestore();

  // Resolve customer tier
  let tier: CustomerTier = "community";
  if (orgId) {
    try {
      const orgDoc = await db.doc(`orgs/${orgId}`).get();
      if (orgDoc.exists) {
        tier = (orgDoc.get("subscriptionTier") || "community") as CustomerTier;
      }
    } catch {
      // Fallback to community if read fails
      tier = "community";
    }
  }

  const expectation = SUPPORT_RESPONSE_EXPECTATIONS[tier] || SUPPORT_RESPONSE_EXPECTATIONS.community;
  const ticketId = `TICK-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // 1. Record ticket in Firestore
  await db.collection("supportTickets").doc(ticketId).set({
    ticketId,
    uid,
    email,
    orgId: orgId || null,
    tier,
    category,
    subject,
    message,
    status: "open",
    responseExpectationHours: expectation.hours,
    createdAt: FieldValue.serverTimestamp(),
    isoTime: new Date().toISOString()
  });

  // 2. Board filing (retired on 2026-11-26; tickets are stored in Firestore supportTickets)
  let boardFilingResult: { success: boolean; taskTitle: string; taskId?: string } = {
    success: false,
    taskTitle: subject
  };

  try {
    boardFilingResult = fileSupportBoardTask(ticketId, subject, message, email, orgId, tier);
  } catch (err) {
    console.warn("[Support] Automatic backlog filing note:", err);
  }

  return {
    success: true,
    ticketId,
    tier,
    responseExpectation: expectation.displayText,
    responseHours: expectation.hours,
    boardFiled: boardFilingResult.success,
    boardTaskId: boardFilingResult.taskId || null
  };
});
