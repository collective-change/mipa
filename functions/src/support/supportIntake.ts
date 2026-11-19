/**
 * Support Intake & Automatic Board Filing (MIPA-36)
 *
 * Provides structured customer support intake with stated response expectations
 * and automatically files board items into docs/BACKLOG.md so that paying customers
 * enter the delivery pipeline without requiring human sales touch.
 */

import fs from "fs";
import path from "path";
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
 * Finds the highest MIPA-<n> identifier in a backlog file string.
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
 * Automatically appends a support ticket as a board task in docs/BACKLOG.md.
 * Fulfills the Backlog Protocol: stable ID, explicit criteria, anchored heading.
 */
export function fileSupportBoardTask(
  ticketId: string,
  subject: string,
  message: string,
  email: string,
  orgId: string,
  tier: CustomerTier,
  backlogPath?: string
): { success: boolean; taskTitle: string; taskId?: string } {
  const targetPath = backlogPath || path.resolve(__dirname, "../../../docs/BACKLOG.md");

  if (!fs.existsSync(targetPath)) {
    return {
      success: false,
      taskTitle: `Support: ${subject}`
    };
  }

  const content = fs.readFileSync(targetPath, "utf8");
  const highestId = findHighestMipaId(content);
  const nextId = `MIPA-${highestId + 1}`;
  const responseExpectation = SUPPORT_RESPONSE_EXPECTATIONS[tier];

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);

  const taskTitle = `${nextId}: Support Ticket: ${subject.trim()} (${tier.toUpperCase()} - ${ticketId})`;

  const taskBlock = [
    `### [TODO] ${taskTitle}`,
    ``,
    `- **Date**: ${dateStr}`,
    `- **Ticket ID**: \`${ticketId}\``,
    `- **Submitted by**: ${email}`,
    `- **Organization**: \`${orgId || "individual"}\``,
    `- **Customer Tier**: **${tier.toUpperCase()}** (${responseExpectation.displayText})`,
    `- **Message**:`,
    `  > ${message.replace(/\n/g, "\n  > ")}`,
    `- **Acceptance Criteria**:`,
    `  - [ ] Customer response sent within ${responseExpectation.hours || 48} hours (${email})`,
    `  - [ ] Root cause identified and remediated in production`,
    `  - [ ] Ticket closed with resolved status in Firestore supportTickets`
  ].join("\n");

  const queueHeaderRegex = /^## Queue \(Priority Order\)\s*$/m;
  const match = content.match(queueHeaderRegex);

  if (!match || match.index === undefined) {
    throw new Error('Could not find "## Queue (Priority Order)" in BACKLOG.md');
  }

  const headerEnd = match.index + match[0].length;
  const updatedContent = content.slice(0, headerEnd) + "\n\n" + taskBlock + "\n" + content.slice(headerEnd);

  fs.writeFileSync(targetPath, updatedContent, "utf8");

  return {
    success: true,
    taskTitle,
    taskId: nextId
  };
}

/**
 * Callable Cloud Function: In-app support ticket intake.
 * Validates requester, persists ticket in Firestore, and auto-files a board task.
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

  // 2. Automatically file a board task in BACKLOG.md
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
    boardTaskId: boardFilingResult.taskId
  };
});
