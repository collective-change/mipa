import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";

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
    })
  };
});

let boundRefs = [];
vi.mock("@/store/firestore-bind", () => {
  return {
    firestoreAction: (fn) =>
      function (...args) {
        const bindFirestoreRef = vi.fn((key, q, options) => {
          boundRefs.push({ key, query: q, options });
          return Promise.resolve([]);
        });
        const unbindFirestoreRef = vi.fn();
        return fn.call(
          this,
          { state: this.$state, store: this, bindFirestoreRef, unbindFirestoreRef },
          args[0]
        );
      }
  };
});

const { DEFAULT_ACTIONS_LIMIT, useActionsStore } = await import("@/store/store-actions");

describe("MIPA-10: Bounded Actions Query and Pagination", () => {
  beforeEach(() => {
    countQueries = [];
    boundRefs = [];
    setActivePinia(createPinia());
  });

  it("exports DEFAULT_ACTIONS_LIMIT as 50", () => {
    expect(DEFAULT_ACTIONS_LIMIT).toBe(50);
  });

  it("bindActions applies default limit(50) and issues getCountFromServer", async () => {
    const store = useActionsStore();
    await store.bindActions("org-test-123");

    expect(boundRefs).toHaveLength(1);
    const bound = boundRefs[0];
    expect(bound.key).toBe("actions");
    expect(bound.options.maxRefDepth).toBeUndefined();

    const limitConstraint = bound.query.constraints.find((c) => c.type === "limit");
    expect(limitConstraint).toBeDefined();
    expect(limitConstraint.limit).toBe(50);

    expect(countQueries).toHaveLength(1);
    expect(store.actionsTotalCount).toBe(60);
  });

  it("bindActions respects custom limit when provided in payload object", async () => {
    const store = useActionsStore();
    await store.bindActions({ orgId: "org-test-123", limit: 25 });

    expect(boundRefs).toHaveLength(1);
    const bound = boundRefs[0];
    const limitConstraint = bound.query.constraints.find((c) => c.type === "limit");
    expect(limitConstraint).toBeDefined();
    expect(limitConstraint.limit).toBe(25);
  });

  it("bindMatchingActions applies default limit(50), preserves filters, and issues getCountFromServer", async () => {
    const store = useActionsStore();
    const payload = {
      orgId: "org-test-456",
      actionStatesToSearch: ["approved", "eligible"],
      responsiblePersonToSearch: "user-abc",
      accountablePersonToSearch: null
    };

    await store.bindMatchingActions(payload);

    expect(boundRefs).toHaveLength(1);
    const bound = boundRefs[0];
    expect(bound.key).toBe("matchingActions");
    expect(bound.options.maxRefDepth).toBeUndefined();

    const whereConstraints = bound.query.constraints.filter((c) => c.type === "where");
    expect(whereConstraints.some((w) => w.field === "orgId" && w.val === "org-test-456")).toBe(true);
    expect(whereConstraints.some((w) => w.field === "actionMchState.value" && Array.isArray(w.val))).toBe(true);
    expect(whereConstraints.some((w) => w.field === "responsiblePerson" && w.val === "user-abc")).toBe(true);

    const limitConstraint = bound.query.constraints.find((c) => c.type === "limit");
    expect(limitConstraint).toBeDefined();
    expect(limitConstraint.limit).toBe(50);

    expect(countQueries).toHaveLength(1);
    expect(store.matchingActionsTotalCount).toBe(60);
  });

  it("bindMatchingActions supports pagination window expansion with custom limit", async () => {
    const store = useActionsStore();
    await store.bindMatchingActions({
      orgId: "org-test-456",
      actionStatesToSearch: ["approved"],
      limit: 100
    });

    const bound = boundRefs[0];
    const limitConstraint = bound.query.constraints.find((c) => c.type === "limit");
    expect(limitConstraint).toBeDefined();
    expect(limitConstraint.limit).toBe(100);
  });

  it("bindCurrentAction does not request maxRefDepth: 1", () => {
    const store = useActionsStore();
    store.bindCurrentAction("action-789");

    expect(boundRefs).toHaveLength(1);
    const bound = boundRefs[0];
    expect(bound.key).toBe("currentAction");
    expect(bound.options.maxRefDepth).toBeUndefined();
  });

  it("store setter actions update total counts and limit state", () => {
    const store = useActionsStore();

    store.setActionsTotalCount(120);
    expect(store.actionsTotalCount).toBe(120);

    store.setMatchingActionsTotalCount(85);
    expect(store.matchingActionsTotalCount).toBe(85);

    store.setActionsLimit(150);
    expect(store.actionsLimit).toBe(150);
  });
});
