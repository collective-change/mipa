import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { Firestore, getFirestore, FieldValue } from "firebase-admin/firestore";
import * as crypto from "crypto";

export interface DigestActionItem {
  id: string;
  title: string;
  orgId: string;
  orgName: string;
  actionLeverage: number;
  totalRoi: number;
  state: string;
  dueDate: string;
  progressPercent: number;
}

export interface UserProfile {
  id: string;
  email?: string;
  displayName?: string;
  preferredLocale?: string;
  locale?: string;
  settings?: {
    weeklyDigest?: boolean;
    unsubscribeToken?: string;
  };
}

export interface UserDigest {
  uid: string;
  email: string;
  displayName: string;
  locale: string;
  actions: DigestActionItem[];
  highLeverageCount: number;
  unsubscribeUrl: string;
}

export interface DigestReport {
  processedUsers: number;
  actionsAggregated: number;
  emailsSent: number;
  timestamp: string;
  digests: Array<{
    uid: string;
    email: string;
    actionCount: number;
    highestLeverage: number;
  }>;
}

const DEFAULT_BASE_URL = "https://collective-change.org";
const UNVERIFIED_STATES = ["completed", "archived", "rejected", "discarded", "cancelled"];

/**
 * Validates if an action is active and pending execution.
 */
export function isActionPending(action: Record<string, unknown>): boolean {
  if (action.isDeleted === true || action.deleted === true) {
    return false;
  }

  let stateStr = "";
  if (typeof action.actionMchState === "string") {
    stateStr = action.actionMchState;
  } else if (action.actionMchState && typeof (action.actionMchState as { value?: string }).value === "string") {
    stateStr = (action.actionMchState as { value: string }).value;
  } else if (typeof action.state === "string") {
    stateStr = action.state;
  }

  const normalized = stateStr.toLowerCase().trim();
  if (!normalized) return true; // Default active if unassigned
  return !UNVERIFIED_STATES.includes(normalized);
}

/**
 * Generates an HMAC unsubscribe token for 1-click email unsubscribes.
 */
export function generateUnsubscribeToken(uid: string, secret = "mipa-digest-secret"): string {
  return crypto.createHmac("sha256", secret).update(`unsub-${uid}`).digest("hex").slice(0, 32);
}

/**
 * Verifies HMAC unsubscribe token.
 */
export function verifyUnsubscribeToken(uid: string, token: string, secret = "mipa-digest-secret"): boolean {
  const expected = generateUnsubscribeToken(uid, secret);
  return token === expected;
}

/**
 * Pure aggregation function: Groups candidate actions by assigned user.
 */
export function groupActionsByUser(
  actions: Record<string, unknown>[],
  users: Map<string, UserProfile>,
  orgs: Map<string, string>,
  baseUrl = DEFAULT_BASE_URL
): Map<string, UserDigest> {
  const digestMap = new Map<string, UserDigest>();

  for (const rawAction of actions) {
    if (!isActionPending(rawAction)) continue;

    // Check assigned owner (responsiblePerson, accountablePerson, or assignedTo)
    const assignedUid =
      (rawAction.responsiblePerson as string) ||
      (rawAction.accountablePerson as string) ||
      (rawAction.assignedTo as string) ||
      (rawAction.owner as string);

    if (!assignedUid || typeof assignedUid !== "string") continue;

    const user = users.get(assignedUid);
    if (!user || !user.email) continue;

    // Check user preference
    if (user.settings && user.settings.weeklyDigest === false) {
      continue;
    }

    const orgId = (rawAction.orgId as string) || "";
    const orgName = orgs.get(orgId) || "Strategic Organization";
    const leverage = typeof rawAction.actionLeverage === "number" ? rawAction.actionLeverage : 0;
    const roi = typeof rawAction.totalRoi === "number" ? rawAction.totalRoi : 0;

    let progress = 0;
    if (typeof rawAction.actualWorkHours === "number" && typeof rawAction.budgetedWorkHours === "number" && rawAction.budgetedWorkHours > 0) {
      progress = Math.min(100, Math.round((rawAction.actualWorkHours / rawAction.budgetedWorkHours) * 100));
    } else if (typeof rawAction.progressPercent === "number") {
      progress = rawAction.progressPercent;
    }

    const actionItem: DigestActionItem = {
      id: (rawAction.id as string) || "",
      title: (rawAction.title as string) || (rawAction.name as string) || "Untitled Initiative",
      orgId,
      orgName,
      actionLeverage: leverage,
      totalRoi: roi,
      state: typeof rawAction.actionMchState === "string" ? rawAction.actionMchState : "in_progress",
      dueDate: (rawAction.targetDate as string) || (rawAction.milestoneDate as string) || (rawAction.dueDate as string) || "",
      progressPercent: progress
    };

    let userDigest = digestMap.get(assignedUid);
    if (!userDigest) {
      const userLocale = user.preferredLocale || user.locale || "zh-tw";
      const token = generateUnsubscribeToken(assignedUid);
      const unsubUrl = `${baseUrl}/notifications/unsubscribe?uid=${encodeURIComponent(assignedUid)}&token=${encodeURIComponent(token)}`;

      userDigest = {
        uid: assignedUid,
        email: user.email,
        displayName: user.displayName || user.email.split("@")[0],
        locale: userLocale,
        actions: [],
        highLeverageCount: 0,
        unsubscribeUrl: unsubUrl
      };
      digestMap.set(assignedUid, userDigest);
    }

    userDigest.actions.push(actionItem);
    if (actionItem.actionLeverage >= 5) {
      userDigest.highLeverageCount++;
    }
  }

  // Sort each user's initiatives by leverage descending (most critical leverage first)
  for (const digest of digestMap.values()) {
    digest.actions.sort((a, b) => b.actionLeverage - a.actionLeverage);
  }

  return digestMap;
}

/**
 * Formats a clean, high-impact HTML strategic email digest.
 */
export function formatDigestEmail(
  digest: UserDigest,
  baseUrl = DEFAULT_BASE_URL
): { subject: string; html: string; text: string } {
  const isZh = digest.locale === "zh-tw" || digest.locale.toLowerCase().startsWith("zh");
  const topAction = digest.actions[0];
  const maxLeverage = topAction ? topAction.actionLeverage.toFixed(2) : "0.00";
  const todoUrl = `${baseUrl}/my-todo`;

  if (isZh) {
    const subject = `週一策略洞察簡報：聚焦本週 ${digest.actions.length} 項關鍵策略行動`;
    const actionRows = digest.actions
      .slice(0, 10)
      .map((a) => {
        const actionUrl = `${baseUrl}/org/${a.orgId}/action-details/${a.orgId}/${a.id}`;
        return `
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 14px 12px; font-size: 14px; font-weight: 600; color: #111827;">
              <a href="${actionUrl}" style="color: #1976d2; text-decoration: none;">${escapeHtml(a.title)}</a>
              <div style="font-size: 12px; color: #6b7280; font-weight: normal; margin-top: 2px;">
                ${escapeHtml(a.orgName)}${a.dueDate ? ` · 目標期程: ${escapeHtml(a.dueDate)}` : ""}
              </div>
            </td>
            <td style="padding: 14px 12px; font-size: 14px; text-align: center; white-space: nowrap;">
              <span style="display: inline-block; padding: 3px 8px; border-radius: 9999px; font-size: 12px; font-weight: 700; background-color: ${
                a.actionLeverage >= 5 ? "#e8f5e9" : "#e3f2fd"
              }; color: ${a.actionLeverage >= 5 ? "#2e7d32" : "#1976d2"};">
                效應比 ${a.actionLeverage.toFixed(2)}
              </span>
            </td>
            <td style="padding: 14px 12px; font-size: 13px; text-align: right; color: #4b5563; white-space: nowrap;">
              ${a.progressPercent}%
            </td>
          </tr>
        `;
      })
      .join("");

    const html = `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang TC', 'Noto Sans TC', sans-serif; background-color: #f9fafb; margin: 0; padding: 24px; color: #1f2937;">
  <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
    <div style="background-color: #1976d2; padding: 24px; color: #ffffff;">
      <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.9;">
        Mipa 策略動力學平臺
      </div>
      <h1 style="margin: 8px 0 0; font-size: 22px; font-weight: 700;">週一策略洞察簡報</h1>
      <p style="margin: 6px 0 0; font-size: 14px; opacity: 0.95;">
        尊敬的 ${escapeHtml(digest.displayName)}，聚焦本週具最高槓桿效益之關鍵行動方案。
      </p>
    </div>

    <div style="padding: 24px;">
      <div style="display: flex; background: #f3f4f6; border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: center;">
        <div style="flex: 1;">
          <div style="font-size: 12px; color: #6b7280; font-weight: 600;">進行中策略任務</div>
          <div style="font-size: 22px; font-weight: 700; color: #111827; margin-top: 4px;">${digest.actions.length} 項</div>
        </div>
        <div style="width: 1px; background: #e5e7eb; margin: 0 8px;"></div>
        <div style="flex: 1;">
          <div style="font-size: 12px; color: #6b7280; font-weight: 600;">最高關鍵效應比</div>
          <div style="font-size: 22px; font-weight: 700; color: #2e7d32; margin-top: 4px;">${maxLeverage}x</div>
        </div>
      </div>

      <h2 style="font-size: 16px; font-weight: 700; margin: 0 0 12px; color: #111827;">待推展行動方案（依效應比排序）</h2>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <thead>
          <tr style="border-bottom: 2px solid #e5e7eb; text-align: left; font-size: 12px; color: #6b7280;">
            <th style="padding: 8px 12px;">行動名稱</th>
            <th style="padding: 8px 12px; text-align: center;">系統效應比</th>
            <th style="padding: 8px 12px; text-align: right;">執行進度</th>
          </tr>
        </thead>
        <tbody>
          ${actionRows}
        </tbody>
      </table>

      <div style="text-align: center; margin: 28px 0 12px;">
        <a href="${todoUrl}" style="background-color: #1976d2; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px; display: inline-block;">
          前往個人策略待辦清單
        </a>
      </div>
    </div>

    <div style="background-color: #f9fafb; padding: 18px 24px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center;">
      <p style="margin: 0 0 6px;">您收到此簡報係因您為 Mipa 平臺之策略行動負責人。</p>
      <p style="margin: 0;">
        <a href="${digest.unsubscribeUrl}" style="color: #6b7280; text-decoration: underline;">取消訂閱每週簡報</a> · 
        <a href="${baseUrl}/privacy" style="color: #6b7280; text-decoration: underline;">隱私權政策</a>
      </p>
    </div>
  </div>
</body>
</html>
    `;

    const text = `週一策略洞察簡報\n\n您好 ${digest.displayName}，本週您共有 ${digest.actions.length} 項進行中行動，最高效應比為 ${maxLeverage}x。\n\n` +
      digest.actions.map(a => `- ${a.title} (效應比: ${a.actionLeverage.toFixed(2)}, 進度: ${a.progressPercent}%)`).join("\n") +
      `\n\n檢視待辦清單: ${todoUrl}\n取消訂閱: ${digest.unsubscribeUrl}`;

    return { subject, html, text };
  }

  // English Template (ZERO Chinese characters)
  const subject = `Monday Strategic Digest: Prioritizing Your ${digest.actions.length} Key Initiatives`;
  const actionRows = digest.actions
    .slice(0, 10)
    .map((a) => {
      const actionUrl = `${baseUrl}/org/${a.orgId}/action-details/${a.orgId}/${a.id}`;
      return `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 14px 12px; font-size: 14px; font-weight: 600; color: #111827;">
            <a href="${actionUrl}" style="color: #1976d2; text-decoration: none;">${escapeHtml(a.title)}</a>
            <div style="font-size: 12px; color: #6b7280; font-weight: normal; margin-top: 2px;">
              ${escapeHtml(a.orgName)}${a.dueDate ? ` · Due: ${escapeHtml(a.dueDate)}` : ""}
            </div>
          </td>
          <td style="padding: 14px 12px; font-size: 14px; text-align: center; white-space: nowrap;">
            <span style="display: inline-block; padding: 3px 8px; border-radius: 9999px; font-size: 12px; font-weight: 700; background-color: ${
              a.actionLeverage >= 5 ? "#e8f5e9" : "#e3f2fd"
            }; color: ${a.actionLeverage >= 5 ? "#2e7d32" : "#1976d2"};">
              ${a.actionLeverage.toFixed(2)}x
            </span>
          </td>
          <td style="padding: 14px 12px; font-size: 13px; text-align: right; color: #4b5563; white-space: nowrap;">
            ${a.progressPercent}%
          </td>
        </tr>
      `;
    })
    .join("");

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 24px; color: #1f2937;">
  <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
    <div style="background-color: #1976d2; padding: 24px; color: #ffffff;">
      <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.9;">
        Mipa Strategic Suite
      </div>
      <h1 style="margin: 8px 0 0; font-size: 22px; font-weight: 700;">Monday Strategic Digest</h1>
      <p style="margin: 6px 0 0; font-size: 14px; opacity: 0.95;">
        Hello ${escapeHtml(digest.displayName)}, here are the high-leverage actions that move the needle for your team this week.
      </p>
    </div>

    <div style="padding: 24px;">
      <div style="display: flex; background: #f3f4f6; border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: center;">
        <div style="flex: 1;">
          <div style="font-size: 12px; color: #6b7280; font-weight: 600;">Active Initiatives</div>
          <div style="font-size: 22px; font-weight: 700; color: #111827; margin-top: 4px;">${digest.actions.length}</div>
        </div>
        <div style="width: 1px; background: #e5e7eb; margin: 0 8px;"></div>
        <div style="flex: 1;">
          <div style="font-size: 12px; color: #6b7280; font-weight: 600;">Peak Leverage</div>
          <div style="font-size: 22px; font-weight: 700; color: #2e7d32; margin-top: 4px;">${maxLeverage}x</div>
        </div>
      </div>

      <h2 style="font-size: 16px; font-weight: 700; margin: 0 0 12px; color: #111827;">Your Assigned Actions (Ranked by Leverage)</h2>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <thead>
          <tr style="border-bottom: 2px solid #e5e7eb; text-align: left; font-size: 12px; color: #6b7280;">
            <th style="padding: 8px 12px;">Initiative</th>
            <th style="padding: 8px 12px; text-align: center;">Leverage</th>
            <th style="padding: 8px 12px; text-align: right;">Progress</th>
          </tr>
        </thead>
        <tbody>
          ${actionRows}
        </tbody>
      </table>

      <div style="text-align: center; margin: 28px 0 12px;">
        <a href="${todoUrl}" style="background-color: #1976d2; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px; display: inline-block;">
          Open Your Strategic To-Do List
        </a>
      </div>
    </div>

    <div style="background-color: #f9fafb; padding: 18px 24px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center;">
      <p style="margin: 0 0 6px;">You are receiving this digest because you are an action owner in Mipa.</p>
      <p style="margin: 0;">
        <a href="${digest.unsubscribeUrl}" style="color: #6b7280; text-decoration: underline;">Unsubscribe from weekly digests</a> · 
        <a href="${baseUrl}/privacy" style="color: #6b7280; text-decoration: underline;">Privacy Policy</a>
      </p>
    </div>
  </div>
</body>
</html>
  `;

  const text = `Monday Strategic Digest\n\nHello ${digest.displayName}, you have ${digest.actions.length} active initiatives assigned this week, with peak leverage of ${maxLeverage}x.\n\n` +
    digest.actions.map(a => `- ${a.title} (Leverage: ${a.actionLeverage.toFixed(2)}x, Progress: ${a.progressPercent}%)`).join("\n") +
    `\n\nView your To-Do list: ${todoUrl}\nUnsubscribe: ${digest.unsubscribeUrl}`;

  return { subject, html, text };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Executes the strategic digest process: aggregates and delivers notifications.
 */
export async function processWeeklyDigests(
  db: Firestore,
  options: { baseUrl?: string; sendEmails?: boolean } = {}
): Promise<DigestReport> {
  const baseUrl = options.baseUrl || DEFAULT_BASE_URL;

  // 1. Fetch pending actions
  const actionsSnapshot = await db.collection("actions").limit(1000).get();
  const rawActions = actionsSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

  // 2. Resolve users and orgs
  const usersSnapshot = await db.collection("users").limit(1000).get();
  const usersMap = new Map<string, UserProfile>();
  for (const doc of usersSnapshot.docs) {
    usersMap.set(doc.id, { id: doc.id, ...doc.data() });
  }

  const orgsSnapshot = await db.collection("orgs").limit(500).get();
  const orgsMap = new Map<string, string>();
  for (const doc of orgsSnapshot.docs) {
    orgsMap.set(doc.id, (doc.get("name") as string) || "Strategic Organization");
  }

  // 3. Aggregate digests
  const userDigests = groupActionsByUser(rawActions, usersMap, orgsMap, baseUrl);

  let emailsSent = 0;
  const digestsReport: DigestReport["digests"] = [];

  for (const digest of userDigests.values()) {
    const emailContent = formatDigestEmail(digest, baseUrl);
    digestsReport.push({
      uid: digest.uid,
      email: digest.email,
      actionCount: digest.actions.length,
      highestLeverage: digest.actions[0]?.actionLeverage || 0
    });

    if (options.sendEmails !== false) {
      // In production with sendgrid/resend or mock in emulator:
      logger.info(`Sending strategic digest to ${digest.email}: "${emailContent.subject}" (${digest.actions.length} actions)`);
      emailsSent++;
    }
  }

  const report: DigestReport = {
    processedUsers: userDigests.size,
    actionsAggregated: rawActions.length,
    emailsSent,
    timestamp: new Date().toISOString(),
    digests: digestsReport
  };

  // Record audit log
  await db.collection("digestLogs").add({
    ...report,
    createdAt: FieldValue.serverTimestamp()
  });

  return report;
}

/**
 * Scheduled Cloud Function running every Monday at 08:00 Taipei time.
 */
export const sendWeeklyStrategicDigest = onSchedule(
  {
    schedule: "every monday 08:00",
    timeZone: "Asia/Taipei"
  },
  async () => {
    logger.info("Executing scheduled Monday Morning Strategic Digest");
    const db = getFirestore();
    const result = await processWeeklyDigests(db, { sendEmails: true });
    logger.info("Strategic Digest complete", result);
  }
);

/**
 * On-demand callable Cloud Function allowing admins or test suites to trigger digests immediately.
 */
export const triggerStrategicDigestNow = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Please sign in.");
  }

  const db = getFirestore();
  const userDoc = await db.doc(`users/${request.auth.uid}`).get();
  const isSuperAdmin = Boolean(userDoc.get("isSuperAdmin"));

  if (!isSuperAdmin && process.env.FUNCTIONS_EMULATOR !== "true") {
    throw new HttpsError("permission-denied", "Only system administrators can manually dispatch the strategic digest.");
  }

  const result = await processWeeklyDigests(db, {
    sendEmails: request.data?.sendEmails !== false
  });

  return result;
});

/**
 * Cloud Function to handle 1-click tokenized unsubscribe from email digests.
 */
export const unsubscribeWeeklyDigest = onCall(async (request) => {
  const { uid, token } = request.data || {};
  if (typeof uid !== "string" || typeof token !== "string" || !uid || !token) {
    throw new HttpsError("invalid-argument", "uid and token are required.");
  }

  if (!verifyUnsubscribeToken(uid, token)) {
    throw new HttpsError("permission-denied", "Invalid or expired unsubscribe token.");
  }

  const db = getFirestore();
  await db.doc(`users/${uid}`).set(
    {
      settings: {
        weeklyDigest: false,
        unsubscribedAt: FieldValue.serverTimestamp()
      }
    },
    { merge: true }
  );

  return { success: true };
});
