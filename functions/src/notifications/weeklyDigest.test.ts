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
  assert.equal(addedLogs[0].actionsAggregated, 1);
  assert.equal(addedLogs[0].emailsSent, 0);
  assert.equal(addedLogs[0].truncated, false);
});

test("MIPA-37: Bounded by construction - only users and orgs referenced in candidate actions are fetched", async () => {
  const queriedUserIds: string[] = [];
  const queriedOrgIds: string[] = [];

  const mockActions = [
    {
      id: "act-1",
      data: () => ({
        title: "Community Outreach",
        responsiblePerson: "user-target-1",
        orgId: "org-target-1",
        actionLeverage: 12.0
      })
    },
    {
      id: "act-2",
      data: () => ({
        title: "Disaster Relief Supply",
        responsiblePerson: "user-target-2",
        orgId: "org-target-1",
        actionLeverage: 8.5
      })
    }
  ];

  const mockDb = {
    collection: (colName: string) => ({
      where: () => ({
        orderBy: () => ({
          count: () => ({ get: async () => ({ data: () => ({ count: 2 }) }) }),
          limit: () => ({ get: async () => ({ docs: mockActions }) })
        })
      }),
      orderBy: () => ({
        limit: () => ({ get: async () => ({ empty: true, docs: [] }) })
      }),
      doc: (id: string) => {
        if (colName === "users") {
          queriedUserIds.push(id);
          return {
            id,
            parent: { id: "users" },
            get: async () => ({
              id,
              exists: true,
              data: () => ({ email: `${id}@example.org`, displayName: `User ${id}`, locale: "en-us" })
            })
          };
        }
        if (colName === "orgs") {
          queriedOrgIds.push(id);
          return {
            id,
            parent: { id: "orgs" },
            get: async () => ({
              id,
              exists: true,
              data: () => ({ name: `Org ${id}` })
            })
          };
        }
        return { id, parent: { id: colName }, get: async () => ({ exists: false }) };
      },
      add: async () => ({ id: "log-audit-id" })
    }),
    getAll: async (...refs: Array<{ id: string; parent: { id: string } }>) => {
      return refs.map((ref) => {
        const isUser = ref.parent?.id === "users";
        if (isUser) queriedUserIds.push(ref.id);
        else queriedOrgIds.push(ref.id);
        return {
          id: ref.id,
          exists: true,
          data: () =>
            isUser
              ? { email: `${ref.id}@example.org`, displayName: `User ${ref.id}`, locale: "en-us" }
              : { name: `Org ${ref.id}` }
        };
      });
    }
  } as unknown as import("firebase-admin/firestore").Firestore;

  const report = await processWeeklyDigests(mockDb, { sendEmails: false });

  assert.equal(report.processedUsers, 2);
  assert.equal(report.actionsAggregated, 2);
  // Verify that ONLY user-target-1, user-target-2 and org-target-1 were queried
  assert.deepEqual(Array.from(new Set(queriedUserIds)).sort(), ["user-target-1", "user-target-2"]);
  assert.deepEqual(Array.from(new Set(queriedOrgIds)), ["org-target-1"]);
});

test("MIPA-37: Truncation visibility - flags truncated: true and capsHit when actions exceed cap", async () => {
  const seededActions = Array.from({ length: 15 }, (_, i) => ({
    id: `act-${i + 1}`,
    data: () => ({
      title: `Action ${i + 1}`,
      responsiblePerson: "user-1",
      orgId: "org-1",
      actionLeverage: 10.0 - i * 0.2
    })
  }));

  const addedLogs: Record<string, unknown>[] = [];

  const mockDb = {
    collection: (name: string) => {
      if (name === "actions") {
        return {
          where: () => ({
            orderBy: () => ({
              count: () => ({ get: async () => ({ data: () => ({ count: 15 }) }) }),
              limit: (limitNum: number) => ({
                get: async () => ({ docs: seededActions.slice(0, limitNum) })
              })
            })
          })
        };
      }
      if (name === "users") {
        return {
          doc: (id: string) => ({
            get: async () => ({
              id,
              exists: true,
              data: () => ({ email: "u1@example.org", displayName: "User 1" })
            })
          })
        };
      }
      if (name === "orgs") {
        return {
          doc: (id: string) => ({
            get: async () => ({
              id,
              exists: true,
              data: () => ({ name: "Org 1" })
            })
          })
        };
      }
      if (name === "digestLogs") {
        return {
          orderBy: () => ({
            limit: () => ({ get: async () => ({ empty: true, docs: [] }) })
          }),
          add: async (data: Record<string, unknown>) => {
            addedLogs.push(data);
            return { id: "log-trunc" };
          }
        };
      }
      return {};
    }
  } as unknown as import("firebase-admin/firestore").Firestore;

  // Run with actionCap = 10 (seededActions has 15)
  const report = await processWeeklyDigests(mockDb, {
    actionCap: 10,
    sendEmails: false
  });

  assert.equal(report.truncated, true);
  assert.deepEqual(report.capsHit, ["actions"]);
  assert.equal(report.actionsAggregated, 10);
  assert.equal(report.queryStats?.actionsMatching, 15);
  assert.equal(report.queryStats?.actionsFetched, 10);
  assert.equal(report.queryStats?.actionCap, 10);

  // Assert audit record persisted in digestLogs has identical visibility
  assert.equal(addedLogs.length, 1);
  assert.equal(addedLogs[0].truncated, true);
  assert.deepEqual(addedLogs[0].capsHit, ["actions"]);
});

test("MIPA-37: Explicit failure on truncation - fails loudly when collection exceeds query capacity", async () => {
  const seededActions = Array.from({ length: 25 }, (_, i) => ({
    id: `act-${i + 1}`,
    data: () => ({
      title: `Action ${i + 1}`,
      responsiblePerson: "user-1",
      orgId: "org-1",
      actionLeverage: 5.0
    })
  }));

  const mockDb = {
    collection: (name: string) => {
      if (name === "actions") {
        return {
          where: () => ({
            orderBy: () => ({
              count: () => ({ get: async () => ({ data: () => ({ count: 25 }) }) }),
              limit: (limitNum: number) => ({
                get: async () => ({ docs: seededActions.slice(0, limitNum) })
              })
            })
          })
        };
      }
      if (name === "digestLogs") {
        return {
          orderBy: () => ({
            limit: () => ({ get: async () => ({ empty: true, docs: [] }) })
          })
        };
      }
      return {};
    }
  } as unknown as import("firebase-admin/firestore").Firestore;

  await assert.rejects(
    async () => {
      await processWeeklyDigests(mockDb, {
        actionCap: 10,
        failOnTruncation: true,
        sendEmails: false
      });
    },
    (err: Error) => {
      assert.match(err.message, /COLLECTION_TRUNCATED/);
      assert.match(err.message, /25/);
      assert.match(err.message, /10/);
      return true;
    }
  );
});

test("MIPA-37: Preserves instrumentation metrics in audit record", async () => {
  const addedLogs: Record<string, unknown>[] = [];
  const mockDb = {
    collection: (name: string) => {
      if (name === "actions") {
        return {
          where: () => ({
            orderBy: () => ({
              count: () => ({ get: async () => ({ data: () => ({ count: 0 }) }) }),
              limit: () => ({ get: async () => ({ docs: [] }) })
            })
          })
        };
      }
      if (name === "digestLogs") {
        return {
          orderBy: () => ({
            limit: () => ({ get: async () => ({ empty: true, docs: [] }) })
          }),
          add: async (data: Record<string, unknown>) => {
            addedLogs.push(data);
            return { id: "log-inst" };
          }
        };
      }
      return {};
    }
  } as unknown as import("firebase-admin/firestore").Firestore;

  const report = await processWeeklyDigests(mockDb, { sendEmails: false });

  assert.equal(typeof report.processedUsers, "number");
  assert.equal(typeof report.actionsAggregated, "number");
  assert.equal(typeof report.emailsSent, "number");
  assert.equal(typeof report.timestamp, "string");

  assert.equal(addedLogs.length, 1);
  assert.equal(addedLogs[0].processedUsers, 0);
  assert.equal(addedLogs[0].actionsAggregated, 0);
  assert.equal(addedLogs[0].emailsSent, 0);
  assert.equal(addedLogs[0].truncated, false);
});
