import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Firebase modular SDK to inspect queries and limits
let capturedQueries = [];
let countQueries = [];

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    collection: vi.fn((_db, name) => ({ type: "collection", name })),
    doc: vi.fn((_db, name, id) => ({ type: "doc", name, id })),
    where: vi.fn((field, op, val) => ({ type: "where", field, op, val })),
    limit: vi.fn((n) => ({ type: "limit", limit: n })),
    query: vi.fn((col, ...constraints) => ({
      type: "query",
      col,
      constraints
    })),
    getCountFromServer: vi.fn(async (q) => {
      countQueries.push(q);
      return {
        data: () => ({ count: 60 })
      };
    }),
  };
});

let boundRefs = [];
vi.mock("@/store/firestore-bind", () => {
  return {
    firestoreAction: (fn) => (context, payload) => {
      const bindFirestoreRef = vi.fn((key, q, options) => {
        boundRefs.push({ key, query: q, options });
        return Promise.resolve([]);
      });
      const unbindFirestoreRef = vi.fn();
      return fn({ ...context, bindFirestoreRef, unbindFirestoreRef }, payload);
    }
  };
});

const { DEFAULT_ACTIONS_LIMIT, default: actionsModule } = await import("@/store/store-actions");

describe("MIPA-10: Bounded Actions Query and Pagination", () => {
  beforeEach(() => {
    capturedQueries = [];
    countQueries = [];
    boundRefs = [];
  });

  it("exports DEFAULT_ACTIONS_LIMIT as 50", () => {
    expect(DEFAULT_ACTIONS_LIMIT).toBe(50);
  });

  it("bindActions applies default limit(50) and issues getCountFromServer", async () => {
    const commit = vi.fn();
    const actionFn = actionsModule.actions.bindActions;

    await actionFn({ commit }, "org-test-123");

    expect(boundRefs).toHaveLength(1);
    const bound = boundRefs[0];
    expect(bound.key).toBe("actions");
    expect(bound.options.maxRefDepth).toBeUndefined(); // maxRefDepth removed

    // Check limit constraint in query
    const limitConstraint = bound.query.constraints.find((c) => c.type === "limit");
    expect(limitConstraint).toBeDefined();
    expect(limitConstraint.limit).toBe(50);

    // Check getCountFromServer was called and count committed
    expect(countQueries).toHaveLength(1);
    expect(commit).toHaveBeenCalledWith("setActionsTotalCount", 60);
  });

  it("bindActions respects custom limit when provided in payload object", async () => {
    const commit = vi.fn();
    const actionFn = actionsModule.actions.bindActions;

    await actionFn({ commit }, { orgId: "org-test-123", limit: 25 });

    expect(boundRefs).toHaveLength(1);
    const bound = boundRefs[0];
    const limitConstraint = bound.query.constraints.find((c) => c.type === "limit");
    expect(limitConstraint).toBeDefined();
    expect(limitConstraint.limit).toBe(25);
  });

  it("bindMatchingActions applies default limit(50), preserves filters, and issues getCountFromServer", async () => {
    const commit = vi.fn();
    const actionFn = actionsModule.actions.bindMatchingActions;

    const payload = {
      orgId: "org-test-456",
      actionStatesToSearch: ["approved", "eligible"],
      responsiblePersonToSearch: "user-abc",
      accountablePersonToSearch: null
    };

    await actionFn({ commit }, payload);

    expect(boundRefs).toHaveLength(1);
    const bound = boundRefs[0];
    expect(bound.key).toBe("matchingActions");
    expect(bound.options.maxRefDepth).toBeUndefined(); // maxRefDepth removed

    // Check filters preserved
    const whereConstraints = bound.query.constraints.filter((c) => c.type === "where");
    expect(whereConstraints.some((w) => w.field === "orgId" && w.val === "org-test-456")).toBe(true);
    expect(whereConstraints.some((w) => w.field === "actionMchState.value" && Array.isArray(w.val))).toBe(true);
    expect(whereConstraints.some((w) => w.field === "responsiblePerson" && w.val === "user-abc")).toBe(true);

    // Check limit constraint
    const limitConstraint = bound.query.constraints.find((c) => c.type === "limit");
    expect(limitConstraint).toBeDefined();
    expect(limitConstraint.limit).toBe(50);

    // Check count query committed
    expect(countQueries).toHaveLength(1);
    expect(commit).toHaveBeenCalledWith("setMatchingActionsTotalCount", 60);
  });

  it("bindMatchingActions supports pagination window expansion with custom limit", async () => {
    const commit = vi.fn();
    const actionFn = actionsModule.actions.bindMatchingActions;

    const payload = {
      orgId: "org-test-456",
      actionStatesToSearch: ["approved"],
      limit: 100
    };

    await actionFn({ commit }, payload);

    const bound = boundRefs[0];
    const limitConstraint = bound.query.constraints.find((c) => c.type === "limit");
    expect(limitConstraint).toBeDefined();
    expect(limitConstraint.limit).toBe(100);
  });

  it("bindCurrentAction does not request maxRefDepth: 1", () => {
    const actionFn = actionsModule.actions.bindCurrentAction;
    actionFn({}, "action-789");

    expect(boundRefs).toHaveLength(1);
    const bound = boundRefs[0];
    expect(bound.key).toBe("currentAction");
    expect(bound.options.maxRefDepth).toBeUndefined();
  });

  it("store mutations update total counts and limit state", () => {
    const state = {
      actionsTotalCount: null,
      matchingActionsTotalCount: null,
      actionsLimit: 50
    };

    actionsModule.mutations.setActionsTotalCount(state, 120);
    expect(state.actionsTotalCount).toBe(120);

    actionsModule.mutations.setMatchingActionsTotalCount(state, 85);
    expect(state.matchingActionsTotalCount).toBe(85);

    actionsModule.mutations.setActionsLimit(state, 150);
    expect(state.actionsLimit).toBe(150);
  });
});
