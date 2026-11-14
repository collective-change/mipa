import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
  isActionPending,
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
  groupActionsByUser,
  formatDigestEmail,
  processWeeklyDigests,
  UserProfile
} from "./weeklyDigest";

test("isActionPending correctly identifies active vs completed or discarded initiatives", () => {
  assert.equal(isActionPending({ actionMchState: "approved" }), true);
  assert.equal(isActionPending({ actionMchState: { value: "initiating" } }), true);
  assert.equal(isActionPending({ state: "in_progress" }), true);
  assert.equal(isActionPending({}), true);

  // Inactive states
  assert.equal(isActionPending({ actionMchState: "completed" }), false);
  assert.equal(isActionPending({ actionMchState: { value: "archived" } }), false);
  assert.equal(isActionPending({ state: "discarded" }), false);
  assert.equal(isActionPending({ isDeleted: true }), false);
  assert.equal(isActionPending({ deleted: true }), false);
});

test("generateUnsubscribeToken & verifyUnsubscribeToken validates HMAC tokens", () => {
  const uid = "user_abc_789";
  const token = generateUnsubscribeToken(uid);
  assert.ok(token);
  assert.equal(typeof token, "string");
  assert.equal(verifyUnsubscribeToken(uid, token), true);

  // Tampered or incorrect tokens
  assert.equal(verifyUnsubscribeToken(uid, "invalid-token-123"), false);
  assert.equal(verifyUnsubscribeToken("another_user", token), false);
});

test("groupActionsByUser aggregates initiatives and orders them by leverage descending", () => {
  const users = new Map<string, UserProfile>([
    [
      "u1",
      {
        id: "u1",
        email: "alice@example.com",
        displayName: "Alice Chen",
        locale: "zh-tw"
      }
    ],
    [
      "u2",
      {
        id: "u2",
        email: "bob@example.com",
        displayName: "Bob Smith",
        locale: "en-us",
        settings: { weeklyDigest: false } // Opted out
      }
    ]
  ]);

  const orgs = new Map<string, string>([["org1", "Riverside Food Bank"]]);

  const actions = [
    {
      id: "act-low",
      title: "Routine Administrative Filing",
      orgId: "org1",
      responsiblePerson: "u1",
      actionLeverage: 1.2,
      actualWorkHours: 10,
      budgetedWorkHours: 20
    },
    {
      id: "act-high",
      title: "Supermarket Surplus Food Partnership",
      orgId: "org1",
      responsiblePerson: "u1",
      actionLeverage: 14.8,
      actualWorkHours: 5,
      budgetedWorkHours: 10
    },
    {
      id: "act-mid",
      title: "Volunteer Coordination Overhaul",
      orgId: "org1",
      responsiblePerson: "u1",
      actionLeverage: 6.5,
      progressPercent: 40
    },
    {
      id: "act-bob",
      title: "Bob's Initiative",
      orgId: "org1",
      responsiblePerson: "u2",
      actionLeverage: 8.0
    },
    {
      id: "act-completed",
      title: "Old Completed Work",
      orgId: "org1",
      responsiblePerson: "u1",
      actionMchState: "completed"
    }
  ];

  const digests = groupActionsByUser(actions, users, orgs);

  // Bob opted out, so only Alice has a digest
  assert.equal(digests.size, 1);
  const aliceDigest = digests.get("u1");
  assert.ok(aliceDigest);
  assert.equal(aliceDigest.email, "alice@example.com");
  assert.equal(aliceDigest.actions.length, 3); // act-high, act-mid, act-low (completed filtered out)

  // Verify sorting by leverage descending: 14.8 -> 6.5 -> 1.2
  assert.equal(aliceDigest.actions[0].id, "act-high");
  assert.equal(aliceDigest.actions[0].actionLeverage, 14.8);
  assert.equal(aliceDigest.actions[0].progressPercent, 50); // 5/10 hours = 50%

  assert.equal(aliceDigest.actions[1].id, "act-mid");
  assert.equal(aliceDigest.actions[1].actionLeverage, 6.5);
  assert.equal(aliceDigest.actions[1].progressPercent, 40);

  assert.equal(aliceDigest.actions[2].id, "act-low");
  assert.equal(aliceDigest.actions[2].actionLeverage, 1.2);
});

test("formatDigestEmail generates Traditional Chinese template with 效應比 and elegant phrasing", () => {
  const digest = {
    uid: "u1",
    email: "partner@collective-change.org",
    displayName: "王經理",
    locale: "zh-tw",
    actions: [
      {
        id: "act-1",
        title: "建置冷鏈蔬果轉運站",
        orgId: "org-1",
        orgName: "社區惜食基金會",
        actionLeverage: 12.45,
        totalRoi: 4.8,
        state: "in_progress",
        dueDate: "2026-12-01",
        progressPercent: 65
      }
    ],
    highLeverageCount: 1,
    unsubscribeUrl: "https://collective-change.org/unsub?token=xyz"
  };

  const { subject, html, text } = formatDigestEmail(digest);

  assert.ok(subject.includes("週一策略洞察簡報"));
  assert.ok(html.includes("效應比 12.45"));
  assert.ok(html.includes("建置冷鏈蔬果轉運站"));
  assert.ok(html.includes("社區惜食基金會"));
  assert.ok(html.includes("前往個人策略待辦清單"));
  assert.ok(text.includes("最高效應比為 12.45x"));
});

test("formatDigestEmail generates English template with ZERO Chinese characters", () => {
  const digest = {
    uid: "u2",
    email: "leader@collective-change.org",
    displayName: "Executive Director",
    locale: "en-us",
    actions: [
      {
        id: "act-2",
        title: "Expand Emergency Logistics Network",
        orgId: "org-2",
        orgName: "Global Relief Initiative",
        actionLeverage: 8.75,
        totalRoi: 3.2,
        state: "approved",
        dueDate: "2026-11-30",
        progressPercent: 30
      }
    ],
    highLeverageCount: 1,
    unsubscribeUrl: "https://collective-change.org/unsub?token=abc"
  };

  const { subject, html, text } = formatDigestEmail(digest);

  assert.ok(subject.includes("Monday Strategic Digest"));
  assert.ok(html.includes("Expand Emergency Logistics Network"));
  assert.ok(html.includes("8.75x"));
  assert.ok(html.includes("Open Your Strategic To-Do List"));

  // Strict regex check: ZERO Chinese characters in English template
  const chineseInHtml = html.match(/[\u4e00-\u9fff]/g);
  const chineseInText = text.match(/[\u4e00-\u9fff]/g);
  assert.equal(chineseInHtml, null, "English HTML template must contain ZERO Chinese characters");
  assert.equal(chineseInText, null, "English text template must contain ZERO Chinese characters");
});

test("processWeeklyDigests scans Firestore and records audit log", async () => {
  const mockActions = [
    {
      id: "a1",
      data: () => ({
        title: "Solar Grid Installation",
        responsiblePerson: "user-1",
        orgId: "org-1",
        actionLeverage: 9.5,
        progressPercent: 70
      })
    }
  ];

  const mockUsers = [
    {
      id: "user-1",
      data: () => ({
        email: "solar@energy.org",
        displayName: "Solar Lead",
        locale: "en-us"
      })
    }
  ];

  const mockOrgs = [
    {
      id: "org-1",
      get: () => "Clean Energy NGO"
    }
  ];

  const addedLogs: Record<string, unknown>[] = [];

  const mockDb = {
    collection: (name: string) => {
      if (name === "actions") {
        return {
          limit: () => ({
            get: async () => ({ docs: mockActions })
          })
        };
      }
      if (name === "users") {
        return {
          limit: () => ({
            get: async () => ({ docs: mockUsers })
          })
        };
      }
      if (name === "orgs") {
        return {
          limit: () => ({
            get: async () => ({ docs: mockOrgs })
          })
        };
      }
      if (name === "digestLogs") {
        return {
          add: async (data: Record<string, unknown>) => {
            addedLogs.push(data);
            return { id: "log-123" };
          }
        };
      }
      return {};
    }
  } as unknown as import("firebase-admin/firestore").Firestore;

  const report = await processWeeklyDigests(mockDb, { sendEmails: false });

  assert.equal(report.processedUsers, 1);
  assert.equal(report.actionsAggregated, 1);
  assert.equal(report.digests[0].email, "solar@energy.org");
  assert.equal(addedLogs.length, 1);
  assert.equal(addedLogs[0].processedUsers, 1);
});
