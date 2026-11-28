import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";

// Mock Firebase modular SDK to inspect queries and limits
let countQueries = [];

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    collection: vi.fn((_db, ...parts) => ({ type: "collection", path: parts.join("/") })),
    doc: vi.fn((_db, ...parts) => ({ type: "doc", path: parts.join("/") })),
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
        data: () => ({ count: 120 })
      };
    }),
  };
});

let boundRefs = [];
vi.mock("@/store/firestore-bind", () => {
  return {
    firestoreAction: (fn) =>
      function (...args) {
        const isPinia = Boolean(this && typeof this.$id === "string" && this.$state);
        const bindFirestoreRef = vi.fn((key, q, options) => {
          boundRefs.push({ key, query: q, options });
          return Promise.resolve([]);
        });
        const unbindFirestoreRef = vi.fn();
        if (isPinia) {
          return fn.call(
            this,
            { state: this.$state, store: this, bindFirestoreRef, unbindFirestoreRef },
            args[0]
          );
        }
        const [context, payload] = args;
        return fn.call(this, { ...context, bindFirestoreRef, unbindFirestoreRef }, payload);
      }
  };
});

vi.mock("@/boot/firebase", () => ({
  firebaseDb: {},
  firebaseAuth: { currentUser: { uid: "test-user-123" } }
}));

const { DEFAULT_NODES_LIMIT, useModelStore } = await import("@/store/store-model");
const { useChatsStore } = await import("@/store/store-chats");
const { useUsersStore } = await import("@/store/store-users");

function makeModelStore() {
  const store = useModelStore(createPinia());
  vi.spyOn(store, "setNodesTotalCount");
  return store;
}

describe("MIPA-23: Bounded Nodes Query and Model Graph Pagination", () => {
  beforeEach(() => {
    countQueries = [];
    boundRefs = [];
  });

  it("exports DEFAULT_NODES_LIMIT as 50", () => {
    expect(DEFAULT_NODES_LIMIT).toBe(50);
  });

  it("bindNodes applies default limit(50) and issues getCountFromServer when called with string modelId", async () => {
    const store = makeModelStore();

    await store.bindNodes("model-test-123");

    expect(boundRefs).toHaveLength(1);
    const bound = boundRefs[0];
    expect(bound.key).toBe("nodes");
    expect(bound.options.maxRefDepth).toBeUndefined(); // maxRefDepth removed

    // Check limit constraint in query
    const limitConstraint = bound.query.constraints.find((c) => c.type === "limit");
    expect(limitConstraint).toBeDefined();
    expect(limitConstraint.limit).toBe(50);

    // Check getCountFromServer was called and count committed
    expect(countQueries).toHaveLength(1);
    expect(store.setNodesTotalCount).toHaveBeenCalledWith(120);
    expect(store.nodesTotalCount).toBe(120);
  });

  it("bindNodes applies default limit(50) when called with object without limit", async () => {
    const store = makeModelStore();

    await store.bindNodes({ modelId: "model-test-456" });

    expect(boundRefs).toHaveLength(1);
    const bound = boundRefs[0];
    const limitConstraint = bound.query.constraints.find((c) => c.type === "limit");
    expect(limitConstraint).toBeDefined();
    expect(limitConstraint.limit).toBe(50);
  });

  it("bindNodes respects custom limit when provided in payload object", async () => {
    const store = makeModelStore();

    await store.bindNodes({ modelId: "model-test-123", limit: 25 });

    expect(boundRefs).toHaveLength(1);
    const bound = boundRefs[0];
    const limitConstraint = bound.query.constraints.find((c) => c.type === "limit");
    expect(limitConstraint).toBeDefined();
    expect(limitConstraint.limit).toBe(25);
  });

  it("bindNodes supports unbounding when limit is null or 'all'", async () => {
    const store = makeModelStore();

    await store.bindNodes({ modelId: "model-test-123", limit: null });

    expect(boundRefs).toHaveLength(1);
    const bound = boundRefs[0];
    // When unbounded, query is the raw collection reference without limit constraints
    expect(bound.query.type).toBe("collection");
  });

  it("bindCurrentModel does not request maxRefDepth: 1", () => {
    makeModelStore().bindCurrentModel("model-test-123");

    expect(boundRefs).toHaveLength(1);
    const bound = boundRefs[0];
    expect(bound.key).toBe("currentModel");
    expect(bound.options.maxRefDepth).toBeUndefined();
  });

  it("store-chats binds do not request maxRefDepth: 1", () => {
    setActivePinia(createPinia());
    const chatsStore = useChatsStore();
    chatsStore.bindUnreadChats("user-1");
    chatsStore.bindCurrentChat("chat-1");

    expect(boundRefs).toHaveLength(2);
    expect(boundRefs[0].options.maxRefDepth).toBeUndefined();
    expect(boundRefs[1].options.maxRefDepth).toBeUndefined();
  });

  it("store-users binds do not request maxRefDepth: 1", () => {
    setActivePinia(createPinia());
    const usersStore = useUsersStore();
    usersStore.bindCurrentUser();
    usersStore.bindCurrentOrgUsers("org-1");

    expect(boundRefs).toHaveLength(2);
    expect(boundRefs[0].options.maxRefDepth).toBeUndefined();
    expect(boundRefs[1].options.maxRefDepth).toBeUndefined();
  });

  it("store mutations update total counts and limit state", () => {
    const store = makeModelStore();
    store.$patch({
      nodesTotalCount: null,
      nodesLimit: 50
    });

    store.setNodesTotalCount(462);
    expect(store.nodesTotalCount).toBe(462);

    store.setNodesLimit(100);
    expect(store.nodesLimit).toBe(100);
  });
});
