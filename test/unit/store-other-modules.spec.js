import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { createStore } from "vuex";

const mockNotifyCreate = vi.fn();
const mockShowErrorMessage = vi.fn();
let addDocCalls = [];
let setDocCalls = [];
let updateDocCalls = [];
let deleteDocCalls = [];
let batchInstances = [];
let transactionDocs = new Map();
let transactionUpdates = [];

vi.mock("quasar", () => ({
  uid: () => "uid_test",
  LocalStorage: { set: vi.fn(), getItem: vi.fn() },
  Loading: { show: vi.fn(), hide: vi.fn() },
  Notify: { create: (...args) => mockNotifyCreate(...args) }
}));

vi.mock("@/utils/util-show-error-message", () => ({
  showErrorMessage: (...args) => mockShowErrorMessage(...args)
}));

vi.mock("@/boot/i18n", () => ({
  i18n: {
    global: {
      locale: "en-us",
      t: (key) => key
    }
  }
}));

vi.mock("@/boot/firebase", () => ({
  firebaseDb: {},
  firebaseAuth: { currentUser: { uid: "user-1", email: "user1@example.com" } },
  firebaseFunctions: {},
  firebaseConfig: { projectId: "demo-mipa" },
  useEmulators: true
}));

vi.mock("firebase/firestore", () => {
  class DocumentReference {
    constructor(path, id) {
      this.path = path;
      this.id = id;
    }
  }
  return {
    DocumentReference,
    collection: (_db, ...segments) => ({ type: "collection", path: segments.join("/") }),
    collectionGroup: (_db, name) => ({ type: "collectionGroup", path: name }),
    doc: (first, ...rest) => {
      if (first && first.type === "collection") {
        const id = rest[0] || "auto_id";
        return new DocumentReference(`${first.path}/${id}`, id);
      }
      const id = rest[rest.length - 1];
      return new DocumentReference(rest.join("/"), id);
    },
    query: (col, ...constraints) => ({ type: "query", col, constraints }),
    where: (field, op, val) => ({ type: "where", field, op, val }),
    orderBy: (field, dir) => ({ type: "orderBy", field, dir }),
    limit: (n) => ({ type: "limit", n }),
    serverTimestamp: () => "SERVER_TS",
    deleteField: () => "__DELETE_FIELD__",
    arrayUnion: (...items) => ({ __op: "arrayUnion", items }),
    arrayRemove: (...items) => ({ __op: "arrayRemove", items }),
    getCountFromServer: async () => ({ data: () => ({ count: 10 }) }),
    getDocs: async () => ({ docs: [], forEach: () => {} }),
    getDoc: async () => ({ exists: () => false, data: () => ({}) }),
    addDoc: vi.fn(async (col, data) => {
      addDocCalls.push({ path: col.path, data: structuredClone(data) });
      return { id: "new_chat_id", path: `${col.path}/new_chat_id` };
    }),
    setDoc: vi.fn(async (ref, data, options) => {
      setDocCalls.push({ path: ref.path, data: structuredClone(data), options });
    }),
    updateDoc: vi.fn(async (ref, data) => {
      updateDocCalls.push({ path: ref.path, data: structuredClone(data) });
    }),
    deleteDoc: vi.fn(async (ref) => {
      deleteDocCalls.push({ path: ref.path });
    }),
    writeBatch: vi.fn(() => {
      const ops = [];
      const b = {
        ops,
        set: (ref, data) => ops.push({ type: "set", path: ref.path, data }),
        update: (ref, data) => ops.push({ type: "update", path: ref.path, data }),
        commit: async () => {}
      };
      batchInstances.push(b);
      return b;
    }),
    runTransaction: vi.fn(async (_db, fn) => {
      const tx = {
        get: async (ref) => ({
          exists: () => transactionDocs.has(ref.path),
          data: () => structuredClone(transactionDocs.get(ref.path))
        }),
        update: (ref, data) => transactionUpdates.push({ path: ref.path, data })
      };
      return fn(tx);
    }),
    onSnapshot: () => () => {}
  };
});

const { default: createRootStore, createPiniaInstance } = await import("@/store/index");
const calculatorModule = (await import("@/store/store-calculator")).default;
const chatsModule = (await import("@/store/store-chats")).default;
const { useUsersStore } = await import("@/store/store-users");
const actionsModule = (await import("@/store/store-actions")).default;

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 15));

describe("store-index, store-users, store-chats, store-calculator & store-actions characterization", () => {
  const originalWorker = window.Worker;

  beforeEach(() => {
    vi.clearAllMocks();
    addDocCalls = [];
    setDocCalls = [];
    updateDocCalls = [];
    deleteDocCalls = [];
    batchInstances = [];
    transactionDocs = new Map();
    transactionUpdates = [];
  });

  afterEach(() => {
    window.Worker = originalWorker;
  });

  it("store-users updates user profile and exposes orgUsers with enumerable id", async () => {
    setActivePinia(createPinia());
    const usersStore = useUsersStore();
    const rawUser = { email: "alice@example.com", displayName: "Alice" };
    Object.defineProperty(rawUser, "id", { value: "u1", enumerable: false });
    usersStore.currentOrgUsers = [rawUser];

    expect(usersStore.orgUsers).toEqual([
      { id: "u1", email: "alice@example.com", displayName: "Alice" }
    ]);

    usersStore.updateUser({ id: "u1", updates: { displayName: "Alice Updated" } });
    await flushMicrotasks();
    expect(setDocCalls[0]).toEqual({
      path: "users/u1",
      data: { displayName: "Alice Updated" },
      options: { merge: true }
    });
  });

  it("store-chats creates chats, manages members/messages/unread counts, and sorts unreadChats descending", async () => {
    const updateActionSpy = vi.fn();
    const updateNodeSpy = vi.fn();
    chatsModule.state.currentChat = {
      id: "c1",
      members: ["user-1", "user-2"],
      unreadCounts: { "user-2": 2 },
      unreadBy: { "user-2": true }
    };
    chatsModule.state.unreadChats = [
      { id: "old", updateTime: 100 },
      { id: "new", updateTime: 500 }
    ];

    const store = createStore({
      modules: {
        chats: chatsModule,
        actions: { namespaced: true, actions: { updateAction: updateActionSpy } },
        model: { namespaced: true, actions: { updateNode: updateNodeSpy } }
      }
    });

    expect(store.getters["chats/unreadChats"].map((c) => c.id)).toEqual(["new", "old"]);

    const chatId = await store.dispatch("chats/fsAddChat", {
      orgId: "org-1",
      orgName: "Org 1",
      orgNameSlug: "org-1",
      members: ["user-1"],
      subjectDocType: "action",
      subjectDocLineage: { actionId: "act-1" },
      subjectDocTitle: "Action 1"
    });
    expect(chatId).toBe("new_chat_id");
    expect(updateActionSpy).toHaveBeenCalledTimes(1);

    await store.dispatch("chats/fsAddChat", {
      orgId: "org-1",
      orgName: "Org 1",
      orgNameSlug: "org-1",
      members: ["user-1"],
      subjectDocType: "node",
      subjectDocLineage: { modelId: "m1", nodeId: "n1" },
      subjectDocTitle: "Node 1"
    });
    expect(updateNodeSpy).toHaveBeenCalledTimes(1);

    store.dispatch("chats/fsAddMessage", {
      chatId: "c1",
      message: { text: "Hello", from: "user-1" }
    });
    expect(updateDocCalls.at(-1).data.unreadCounts["user-2"]).toBe(3);
    expect(updateDocCalls.at(-1).data.unreadBy["user-2"]).toBe(true);

    store.dispatch("chats/fsResetReadCount", { chatId: "c1", userId: "user-2" });
    expect(updateDocCalls.at(-1).data["unreadCounts.user-2"]).toBe(0);

    store.dispatch("chats/fsAddChatMember", { chatId: "c1", memberId: "user-3" });
    store.dispatch("chats/fsRemoveChatMember", { chatId: "c1", memberId: "user-3" });
    await flushMicrotasks();
    expect(mockNotifyCreate).toHaveBeenCalledWith("toastChatMemberAdded");
    expect(mockNotifyCreate).toHaveBeenCalledWith("toastChatMemberRemoved");
  });

  it("store-calculator handles worker lifecycle, progress updates, baseline/actions completion, and circular/eval errors", async () => {
    let lastWorker = null;
    window.Worker = class FakeWorker {
      constructor() {
        this.messages = [];
        this.terminated = false;
        this.onmessage = null;
        lastWorker = this;
      }
      postMessage(msg) {
        this.messages.push(msg);
      }
      terminate() {
        this.terminated = true;
      }
    };

    const saveBaselineSpy = vi.fn().mockResolvedValue(undefined);
    const loadBaselineSpy = vi.fn().mockResolvedValue(undefined);
    const loadResultsOfActionSpy = vi.fn().mockResolvedValue(undefined);
    const updateActionsResultsSpy = vi.fn().mockResolvedValue(undefined);
    const setCircularNodeIdsSpy = vi.fn();
    const setSelectedNodeIdSpy = vi.fn().mockResolvedValue(undefined);

    const store = createStore({
      modules: {
        calculator: calculatorModule,
        calcResults: {
          namespaced: true,
          actions: {
            saveBaseline: saveBaselineSpy,
            loadBaseline: loadBaselineSpy,
            loadResultsOfAction: loadResultsOfActionSpy
          }
        },
        actions: {
          namespaced: true,
          actions: {
            updateActionsResults: updateActionsResultsSpy
          }
        },
        ui: {
          namespaced: true,
          actions: {
            setCircularNodeIds: setCircularNodeIdsSpy,
            setSelectedNodeId: setSelectedNodeIdSpy
          }
        }
      }
    });

    await store.dispatch("calculator/calculate", {
      calculationType: "baseline",
      orgId: "org-1",
      modelId: "m1",
      nodes: [{ id: "n1", symbol: "a", sysFormula: "$n2", influencers: ["n2"] }, { id: "n2", symbol: "b" }],
      exchangeRates: {},
      simulationParams: {},
      roleNodes: {},
      orgCurrency: "USD"
    });

    expect(store.state.calculator.calculatorIsRunning).toBe(true);
    expect(lastWorker.messages).toHaveLength(1);

    // Busy guard while running
    const busyRes = await store.dispatch("calculator/getNewCalcWorker");
    expect(busyRes).toBeUndefined();
    expect(mockShowErrorMessage).toHaveBeenCalled();

    // Progress message
    await lastWorker.onmessage({ data: { progressValue: 0.65 } });
    expect(store.state.calculator.calculationProgress).toBe(0.65);

    // Baseline result finishes and terminates worker
    await lastWorker.onmessage({
      data: { resultsType: "baseline", calcTimeMs: 120, calcTimeStages: {} }
    });
    expect(saveBaselineSpy).toHaveBeenCalledTimes(1);
    expect(loadBaselineSpy).toHaveBeenCalledWith(expect.anything(), "m1");
    expect(lastWorker.terminated).toBe(true);
    expect(store.state.calculator.calculatorIsRunning).toBe(false);
    expect(store.state.calculator.calculationProgress).toBe(0);

    // Circular dependency error path
    await store.dispatch("calculator/calculate", {
      calculationType: "actions",
      orgId: "org-1",
      modelId: "m1",
      nodes: [],
      actions: [{ id: "act-1" }]
    });
    await lastWorker.onmessage({
      data: {
        errorType: "Circular dependency detected",
        errorMessage: "Loop A -> B -> A",
        errorData: [{ id: "n1" }, { id: "n2" }]
      }
    });
    expect(setCircularNodeIdsSpy).toHaveBeenCalledWith(expect.anything(), ["n1", "n2"]);
    expect(store.state.calculator.calculatorIsRunning).toBe(false);
  });

  it("store-actions manages CRUD, updateActionsResults significance threshold, relationships, and getters", async () => {
    actionsModule.state.actions = [
      {
        id: "a1",
        name: "Beta",
        title: "Beta",
        completed: false,
        blockerActionIds: ["a2"],
        effectiveResultsNumbers: {
          actionLeverage: 10,
          marginalNetTotalBenefitNpv: 1000,
          marginalTotalCostNpv: 100
        }
      },
      {
        id: "a2",
        name: "Alpha",
        title: "Alpha",
        completed: true,
        blockeeActionIds: ["a1"],
        effectiveResultsNumbers: {
          actionLeverage: 5,
          marginalNetTotalBenefitNpv: 500,
          marginalTotalCostNpv: 100
        }
      }
    ];
    actionsModule.state.matchingActions = [...actionsModule.state.actions];

    const setSelectedActionIdSpy = vi.fn();
    const store = createStore({
      modules: {
        actions: actionsModule,
        ui: { namespaced: true, actions: { setSelectedActionId: setSelectedActionIdSpy } },
        uiAction: { namespaced: true, state: () => ({ uiAction: { id: "a1" } }) }
      }
    });

    expect(store.getters["actions/actions"]).toHaveLength(2);
    expect(store.getters["actions/blockingRelationships"]).toEqual([{ blockerId: "a2", blockeeId: "a1" }]);
    expect(store.getters["actions/blockingRelationshipsOfMatchingActions"]).toEqual([
      { blockerId: "a2", blockeeId: "a1" }
    ]);

    // updateActionsResults: unchanged within 0.1% is skipped; changed > 0.1% is batch-updated
    store.dispatch("actions/updateActionsResults", {
      actionsResults: [
        {
          id: "a1",
          effectiveResultsNumbers: {
            actionLeverage: 10.0001,
            marginalNetTotalBenefitNpv: 1000,
            marginalTotalCostNpv: 100
          }
        },
        {
          id: "a2",
          effectiveResultsNumbers: {
            actionLeverage: 12,
            marginalNetTotalBenefitNpv: 1200,
            marginalTotalCostNpv: 100
          }
        }
      ]
    });
    await flushMicrotasks();
    expect(batchInstances[0].ops).toHaveLength(1);
    expect(batchInstances[0].ops[0].path).toBe("actions/a2");

    // Nesting & blocking relationships via transactions
    transactionDocs.set("actions/p1", { title: "Parent" });
    transactionDocs.set("actions/a1", { title: "Child" });
    store.dispatch("actions/addParent", "p1");
    await flushMicrotasks();
    expect(transactionUpdates).toHaveLength(2);

    store.dispatch("actions/deleteRelationship", { type: "nesting", parent: "p1", child: "a1" });
    store.dispatch("actions/deleteRelationship", { type: "blocking", blocker: "a2", blockee: "a1" });
    store.dispatch("actions/deleteRelationship", { type: "unknown" });
    await flushMicrotasks();
    expect(mockShowErrorMessage).toHaveBeenCalledWith("Error deleting relationship", '"unknown" not recognized');
  });

  it("src/store/index.js creates Pinia and transitional Vuex store", () => {
    const pinia = createPiniaInstance({ replace: vi.fn() });
    const usersStore = useUsersStore(pinia);
    expect(usersStore.$id).toBe("users");
    expect(usersStore.$router).toBeDefined();
    const store = createRootStore();
    expect(store).toBeDefined();
  });
});
