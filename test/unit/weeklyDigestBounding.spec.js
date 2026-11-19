import { describe, it, expect } from "vitest";
import {
  isActionPending,
  groupActionsByUser,
  DEFAULT_ACTION_CAP,
  DEFAULT_USER_CAP,
  DEFAULT_ORG_CAP
} from "../../functions/src/notifications/weeklyDigest";

describe("MIPA-37: Weekly Digest Query Bounding & Truncation Visibility", () => {
  it("declares reasonable and documented default query caps", () => {
    expect(DEFAULT_ACTION_CAP).toBe(1000);
    expect(DEFAULT_USER_CAP).toBe(1000);
    expect(DEFAULT_ORG_CAP).toBe(500);
  });

  it("filters inactive or completed initiatives from grouping", () => {
    expect(isActionPending({ actionMchState: "completed" })).toBe(false);
    expect(isActionPending({ actionMchState: "archived" })).toBe(false);
    expect(isActionPending({ isDeleted: true })).toBe(false);
    expect(isActionPending({ state: "in_progress" })).toBe(true);
  });

  it("groups actions strictly by referenced users without reading extra user records", () => {
    const rawActions = [
      {
        id: "act-1",
        title: "Disaster Risk Assessment",
        responsiblePerson: "user-alpha",
        orgId: "org-1",
        actionLeverage: 18.5,
        totalRoi: 4.2
      },
      {
        id: "act-2",
        title: "Volunteer Training Module",
        responsiblePerson: "user-alpha",
        orgId: "org-1",
        actionLeverage: 6.0,
        totalRoi: 2.1
      }
    ];

    const usersMap = new Map([
      [
        "user-alpha",
        {
          id: "user-alpha",
          email: "coordinator@tzuchi.org.tw",
          displayName: "Tzu Chi Coordinator",
          locale: "zh-tw"
        }
      ]
    ]);

    const orgsMap = new Map([["org-1", "Tzu Chi Foundation"]]);

    const digestMap = groupActionsByUser(rawActions, usersMap, orgsMap);

    expect(digestMap.size).toBe(1);
    const userDigest = digestMap.get("user-alpha");
    expect(userDigest).toBeDefined();
    expect(userDigest.actions.length).toBe(2);
    // Highest leverage initiative must be first
    expect(userDigest.actions[0].actionLeverage).toBe(18.5);
    expect(userDigest.actions[1].actionLeverage).toBe(6.0);
    expect(userDigest.highLeverageCount).toBe(2);
  });
});
