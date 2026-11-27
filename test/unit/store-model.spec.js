import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStore } from "vuex";

const mockNotifyCreate = vi.fn();
const mockShowErrorMessage = vi.fn();
let autoIdCounter = 0;

let setDocCalls = [];
let addDocCalls = [];
let updateDocCalls = [];
let deleteDocCalls = [];
let batchInstances = [];
let querySnapshotDocs = [];
let transactionDocs = new Map();
let transactionUpdates = [];
let countResult = 42;
let shouldFailSetDoc = false;
let shouldFailDeleteDoc = false;
let shouldFailUpdateDoc = false;
let shouldFailBatchCommit = false;
let shouldFailCount = false;
let shouldFailTransaction = false;
let mockCurrentUser = { uid: "user-123", email: "user@example.com" };
let listeners = [];

vi.mock("quasar", () => ({
  uid: () => `uid_${++autoIdCounter}`,
  Notify: {
    create: (...args) => mockNotifyCreate(...args)
  }
}));

vi.mock("@/utils/util-show-error-message", () => ({
  showErrorMessage: (...args) => mockShowErrorMessage(...args)
}));

vi.mock("@/boot/i18n", () => ({
  i18n: {
    global: {
      t: (key) => key
    }
  }
}));

vi.mock("@/boot/firebase", () => ({
  firebaseDb: {},
  firebaseAuth: {
    get currentUser() {
      return mockCurrentUser;
    }
  }
}));

const cloneData = (val) => (val === undefined ? undefined : JSON.parse(JSON.stringify(val)));

vi.mock("firebase/firestore", () => {
  class DocumentReference {
    constructor(path, id) {
      this.path = path;
      this.id = id;
    }
  }
  return {
    DocumentReference,
    collection: (_db, ...segments) => ({
      type: "collection",
      path: segments.join("/")
    }),
    doc: (first, ...rest) => {
      if (first && first.type === "collection") {
        const id = rest[0] || `doc_${++autoIdCounter}`;
        return new DocumentReference(`${first.path}/${id}`, id);
      }
      const id = rest[rest.length - 1];
      return new DocumentReference(rest.join("/"), id);
    },
    limit: (n) => ({ type: "limit", n }),
    query: (col, ...constraints) => ({ type: "query", col, constraints }),
    serverTimestamp: () => "SERVER_TS",
    arrayUnion: (...items) => ({ __op: "arrayUnion", items }),
    arrayRemove: (...items) => ({ __op: "arrayRemove", items }),
    getCountFromServer: vi.fn(async () => {
      if (shouldFailCount) throw new Error("count failed");
      return { data: () => ({ count: countResult }) };
    }),
    getDocs: vi.fn(async () => ({
      docs: querySnapshotDocs,
      forEach: (cb) => querySnapshotDocs.forEach(cb)
    })),
    setDoc: vi.fn(async (ref, data, options) => {
      if (shouldFailSetDoc) throw new Error("setDoc failed");
      setDocCalls.push({ ref, data: cloneData(data), options });
    }),
    addDoc: vi.fn(async (colRef, data) => {
      const id = `added_${++autoIdCounter}`;
      addDocCalls.push({ id, path: colRef.path, data: cloneData(data) });
      return { id, path: `${colRef.path}/${id}` };
    }),
    updateDoc: vi.fn(async (ref, data) => {
      if (shouldFailUpdateDoc) throw new Error("updateDoc failed");
      updateDocCalls.push({ ref, data: cloneData(data) });
    }),
    deleteDoc: vi.fn(async (ref) => {
      if (shouldFailDeleteDoc) throw new Error("deleteDoc failed");
      deleteDocCalls.push({ ref });
    }),
    writeBatch: vi.fn(() => {
      const ops = [];
      const batch = {
        ops,
        set: (ref, data, options) => ops.push({ type: "set", ref, data: cloneData(data), options }),
        update: (ref, data) => ops.push({ type: "update", ref, data: cloneData(data) }),
        delete: (ref) => ops.push({ type: "delete", ref }),
        commit: async () => {
          if (shouldFailBatchCommit) throw new Error("batch commit failed");
        }
      };
      batchInstances.push(batch);
      return batch;
    }),
    runTransaction: vi.fn(async (_db, fn) => {
      if (shouldFailTransaction) throw new Error("tx failed");
      const tx = {
        get: async (ref) => {
          const stored = transactionDocs.get(ref.path);
          return {
            exists: () => stored !== undefined,
            data: () => (stored ? cloneData(stored) : undefined)
          };
        },
        update: (ref, data) => {
          transactionUpdates.push({ path: ref.path, data: cloneData(data) });
        }
      };
      return fn(tx);
    }),
    onSnapshot: (ref, next, error) => {
      const l = { ref, next, error, unsubscribed: false };
      listeners.push(l);
      return () => {
        l.unsubscribed = true;
      };
    }
  };
});

const { firestoreMutations } = await import("@/store/firestore-bind");
const modelModule = (await import("@/store/store-model")).default;
const { DEFAULT_NODES_LIMIT } = await import("@/store/store-model");

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 15));

function makeTestStore({ currentModel = null, nodes = [], orgCurrency = "USD" } = {}) {
  Object.assign(modelModule.state, {
    currentModel,
    nodes,
    nodesTotalCount: null,
    nodesLimit: DEFAULT_NODES_LIMIT
  });

  return createStore({
    mutations: { ...firestoreMutations },
    modules: {
      model: modelModule,
      orgs: {
        namespaced: true,
        state: () => ({
          currentOrg: { id: "org-1", currency: orgCurrency }
        })
      }
    }
  });
}

describe("store-model characterization (current behavior)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    autoIdCounter = 0;
    setDocCalls = [];
    addDocCalls = [];
    updateDocCalls = [];
    deleteDocCalls = [];
    batchInstances = [];
    querySnapshotDocs = [];
    transactionDocs = new Map();
    transactionUpdates = [];
    countResult = 42;
    shouldFailSetDoc = false;
    shouldFailDeleteDoc = false;
    shouldFailUpdateDoc = false;
    shouldFailBatchCommit = false;
    shouldFailCount = false;
    shouldFailTransaction = false;
    mockCurrentUser = { uid: "user-123", email: "user@example.com" };
    listeners = [];
  });

  describe("addOrgMainModel, createInitialNodes, updateModel & deleteModel", () => {
    it("addOrgMainModel writes main model document and creates 7 starter role factors unless withoutStarterNodes is set", async () => {
      const store = makeTestStore();
      const starterSymbols = [
        "averageEffortCostPerHour",
        "oneTimeEffort",
        "oneTimeSpending",
        "costToOrganizationDuringInterval",
        "costToWorldDuringInterval",
        "benefitToOrganizationDuringInterval",
        "benefitToWorldDuringInterval"
      ];
      querySnapshotDocs = starterSymbols.map((symbol, idx) => ({
        id: `role_${idx + 1}`,
        data: () => ({ symbol })
      }));

      await store.dispatch("model/addOrgMainModel", {
        orgId: "org-1",
        modelId: "model-1",
        currency: "TWD"
      });
      await flushMicrotasks();

      // 1. Main model created
      expect(setDocCalls[0].ref.path).toBe("models/model-1");
      expect(setDocCalls[0].data).toMatchObject({
        isPublic: false,
        orgId: "org-1",
        isOrgMainModel: true,
        name: "Main",
        owners: { users: ["user-123"] },
        editors: { users: ["user-123"] }
      });

      // 2. 7 starter factors written via writeBatch
      expect(batchInstances).toHaveLength(1);
      expect(batchInstances[0].ops).toHaveLength(7);
      const hourlyOp = batchInstances[0].ops.find((o) => o.data.symbol === "averageEffortCostPerHour");
      const effortOp = batchInstances[0].ops.find((o) => o.data.symbol === "oneTimeEffort");
      const benefitOp = batchInstances[0].ops.find((o) => o.data.symbol === "benefitToOrganizationDuringInterval");
      expect(hourlyOp.data.isNew).toBe(true);
      expect(hourlyOp.data.symbolFormula).toBe("10");
      expect(hourlyOp.data.unit).toBe("TWD");
      expect(effortOp.data.unit).toBe("workhours");
      expect(benefitOp.data.unit).toBe("TWD");

      // 3. Silent updateModel sets roleNodes without showing toastModelUpdated
      expect(setDocCalls[1].ref.path).toBe("models/model-1");
      expect(setDocCalls[1].data.roleNodes).toEqual({
        averageEffortCostPerHour: "role_1",
        effort: "role_2",
        spending: "role_3",
        orgCost: "role_4",
        worldCost: "role_5",
        orgBenefit: "role_6",
        worldBenefit: "role_7"
      });
      expect(mockNotifyCreate).not.toHaveBeenCalledWith("toastModelUpdated");
    });

    it("addOrgMainModel skips starter nodes when withoutStarterNodes is true and surfaces setDoc errors", async () => {
      const store = makeTestStore();
      await store.dispatch("model/addOrgMainModel", {
        orgId: "org-sample",
        modelId: "org-sample",
        currency: "USD",
        withoutStarterNodes: true
      });
      expect(setDocCalls).toHaveLength(1);
      expect(batchInstances).toHaveLength(0);

      shouldFailSetDoc = true;
      await store.dispatch("model/addOrgMainModel", {
        orgId: "org-fail",
        modelId: "org-fail",
        currency: "USD"
      });
      expect(mockShowErrorMessage).toHaveBeenCalledWith("Error creating model", "setDoc failed");
    });

    it("updateModel notifies toast when not silent and handles errors; deleteModel deletes doc or reports error", async () => {
      const store = makeTestStore({ currentModel: { id: "m1" } });
      await store.dispatch("model/updateModel", {
        modelId: "m1",
        updates: { name: "Renamed Model" }
      });
      expect(mockNotifyCreate).toHaveBeenCalledWith("toastModelUpdated");

      shouldFailSetDoc = true;
      await store.dispatch("model/updateModel", {
        modelId: "m1",
        updates: { name: "Will Fail" }
      });
      expect(mockShowErrorMessage).toHaveBeenCalledWith("Error updating model", "setDoc failed");

      store.dispatch("model/deleteModel", "m1");
      await flushMicrotasks();
      expect(deleteDocCalls).toHaveLength(1);
      expect(mockNotifyCreate).toHaveBeenCalledWith("toastModelDeleted");

      shouldFailDeleteDoc = true;
      store.dispatch("model/deleteModel", "m1");
      await flushMicrotasks();
      expect(mockShowErrorMessage).toHaveBeenCalledWith("Error deleting model", "deleteDoc failed");
    });
  });

  describe("customVariables actions", () => {
    it("supports setCustomVariables, addCustomVariable, updateCustomVariable, and deleteCustomVariable", async () => {
      const store = makeTestStore({
        currentModel: {
          id: "m1",
          customVariables: [{ name: "taxRate", value: 0.05 }]
        }
      });

      await store.dispatch("model/addCustomVariable", {
        modelId: "m1",
        variable: { name: "unitPrice", value: 25 }
      });
      expect(setDocCalls.at(-1).data.customVariables).toEqual([
        { name: "taxRate", value: 0.05 },
        { name: "unitPrice", value: 25 }
      ]);

      store.state.model.currentModel.customVariables = setDocCalls.at(-1).data.customVariables;
      await store.dispatch("model/updateCustomVariable", {
        modelId: "m1",
        variableName: "unitPrice",
        updates: { value: 30 }
      });
      expect(setDocCalls.at(-1).data.customVariables[1].value).toBe(30);

      // Non-existent variable does not write
      const prevCount = setDocCalls.length;
      await store.dispatch("model/updateCustomVariable", {
        modelId: "m1",
        variableName: "missingVar",
        updates: { value: 99 }
      });
      expect(setDocCalls).toHaveLength(prevCount);

      await store.dispatch("model/deleteCustomVariable", {
        modelId: "m1",
        variableName: "taxRate"
      });
      expect(setDocCalls.at(-1).data.customVariables).toEqual([
        { name: "unitPrice", value: 25 }
      ]);

      await store.dispatch("model/setCustomVariables", {
        modelId: "m1",
        variables: []
      });
      expect(setDocCalls.at(-1).data.customVariables).toEqual([]);
    });
  });

  describe("bindCurrentModel, bindNodes & unbind actions", () => {
    it("binds model and nodes, falls back to null count when getCountFromServer throws, and resets on unbind", async () => {
      const store = makeTestStore();

      const pModel = store.dispatch("model/bindCurrentModel", "m1");
      listeners[0].next({
        id: "m1",
        exists: () => true,
        data: () => ({ name: "Main" })
      });
      await pModel;
      expect(store.state.model.currentModel).toEqual({ name: "Main" });

      const pNodes = store.dispatch("model/bindNodes", "m1");
      await flushMicrotasks();
      listeners[1].next({
        docs: [
          { id: "n1", exists: () => true, data: () => ({ name: "Factor 1", symbol: "f1" }) }
        ]
      });
      await pNodes;
      expect(store.state.model.nodesTotalCount).toBe(42);
      expect(store.getters["model/nodesTotalCount"]).toBe(42);
      expect(store.getters["model/nodesLimit"]).toBe(50);
      expect(store.getters["model/nodes"]).toEqual([
        { id: "n1", name: "Factor 1", symbol: "f1" }
      ]);

      // Count failure sets nodesTotalCount to null
      shouldFailCount = true;
      const pNodes2 = store.dispatch("model/bindNodes", { modelId: "m1", limit: "all" });
      await flushMicrotasks();
      listeners[2].next({ docs: [] });
      await pNodes2;
      expect(store.state.model.nodesTotalCount).toBeNull();

      store.dispatch("model/unbindNodes");
      store.dispatch("model/unbindCurrentModel");
      expect(store.state.model.nodes).toEqual([]);
      expect(store.state.model.currentModel).toBeNull();
    });
  });

  describe("addHourlyCostFactor, addNode, importCountryModel, updateNode & deleteNode", () => {
    it("addHourlyCostFactor camelizes ASCII names, deduplicates collisions, and falls back to hourlyCost for non-ASCII", async () => {
      const store = makeTestStore({
        nodes: [
          { id: "n1", symbol: "seniorNursePerHour" },
          { id: "n2", symbol: "hourlyCost" }
        ]
      });

      const id1 = await store.dispatch("model/addHourlyCostFactor", {
        modelId: "m1",
        name: "Senior Nurse",
        cost: 45,
        unit: "USD"
      });
      expect(id1).toBe("added_1");
      expect(addDocCalls[0].data).toMatchObject({
        isHourlyCost: true,
        symbol: "seniorNursePerHour2",
        symbolFormula: "45",
        sysFormula: "45",
        unit: "USD"
      });

      const id2 = await store.dispatch("model/addHourlyCostFactor", {
        modelId: "m1",
        name: "資深護理師",
        cost: "not-a-number"
      });
      expect(id2).toBe("added_2");
      expect(addDocCalls[1].data.symbol).toBe("hourlyCost2");
      expect(addDocCalls[1].data.symbolFormula).toBe("0");
    });

    it("addNode supports stableId via setDoc and auto-id via addDoc, dispatches addLink for influencer/influencee roles, and handles errors", async () => {
      const store = makeTestStore({
        currentModel: { id: "m1", currency: "USD", roleNodes: { orgBenefit: "stable_ben" } },
        nodes: [{ id: "src", symbol: "src", influencers: [], influencees: [] }]
      });

      mockCurrentUser = null; // exercises fallback createdBy: "system"
      const stableRes = await store.dispatch("model/addNode", {
        modelId: "m1",
        node: { id: "stable_ben", name: "Org Benefit", symbol: "benefitToOrganizationDuringInterval", unit: "EUR" },
        sourceNodeId: "src",
        newNodeRole: "influencee"
      });
      expect(stableRes).toBe("stable_ben");
      expect(setDocCalls[0].data.unit).toBe("USD");
      expect(setDocCalls[0].data.createdBy).toBe("system");
      expect(batchInstances).toHaveLength(1); // addLink batch executed

      mockCurrentUser = { uid: "user-123" };
      const addedRes = await store.dispatch("model/addNode", {
        modelId: "m1",
        node: { name: "Driver", symbol: "driver", unit: "people" },
        sourceNodeId: "src",
        newNodeRole: "influencer"
      });
      expect(addedRes).toBe("added_1");
      expect(batchInstances).toHaveLength(2);

      shouldFailSetDoc = true;
      await store.dispatch("model/addNode", {
        modelId: "m1",
        nodeId: "fail_id",
        node: { name: "Fail", symbol: "fail" }
      });
      expect(mockShowErrorMessage).toHaveBeenCalledWith("Error adding node", "setDoc failed");
    });

    it("importCountryModel guards missing modelId and adds/updates shipped country factors", async () => {
      const emptyStore = makeTestStore({ currentModel: null });
      const missingRes = await emptyStore.dispatch("model/importCountryModel", {});
      expect(missingRes).toBeUndefined();
      expect(mockShowErrorMessage).toHaveBeenCalledWith("No active model found to import country model into.");

      const store = makeTestStore({
        currentModel: { id: "m1", currency: "USD" },
        nodes: [{ id: "world_country_usa_sp_pop_totl", symbol: "world_usa_population" }]
      });
      const res = await store.dispatch("model/importCountryModel", {
        countryCode: "USA",
        version: "1.0.0"
      });
      expect(res.updatedCount).toBe(1);
      expect(res.addedCount).toBe(11);
      expect(res.addedCount + res.updatedCount).toBe(12);
    });

    it("updateNode resolves sysFormula & influencers, triggers influencee reclassification when latestValue/symbol changes, and deleteNode deletes", async () => {
      const store = makeTestStore({
        currentModel: { id: "m1", currency: "USD", roleNodes: {} },
        nodes: [
          {
            id: "n_in",
            name: "Volunteers",
            symbol: "volunteers",
            influencees: ["n_out"],
            influencers: []
          },
          {
            id: "n_out",
            name: "Meals",
            symbol: "meals",
            symbolFormula: "volunteers * 5",
            sysFormula: "$n_in * 5",
            influencers: ["n_in"],
            influencees: []
          }
        ]
      });

      store.dispatch("model/updateNode", {
        modelId: "m1",
        updates: {
          id: "n_in",
          symbol: "activeVolunteers",
          symbolFormula: "20"
        },
        symbolChanged: true
      });
      await flushMicrotasks();

      expect(setDocCalls.length).toBeGreaterThanOrEqual(2); // n_in + reclassified n_out
      expect(setDocCalls[1].ref.id).toBe("n_out");
      expect(setDocCalls[1].data).toHaveProperty("unusedInfluencers");
      expect(setDocCalls[1].data).toHaveProperty("blockingInfluencers");

      // Also test formula auto-referencing in updateNode
      setDocCalls = [];
      store.dispatch("model/updateNode", {
        modelId: "m1",
        updates: {
          id: "n_out",
          symbolFormula: "volunteers * 10"
        }
      });
      await flushMicrotasks();
      expect(setDocCalls[0].data.sysFormula).toBe("$n_in * 10");
      expect(setDocCalls[0].data.influencers).toContain("n_in");

      // Error branch on updateNode
      shouldFailSetDoc = true;
      store.dispatch("model/updateNode", {
        modelId: "m1",
        updates: { id: "n_out", name: "Broken" },
        errorTitle: "Custom Error Title"
      });
      await flushMicrotasks();
      expect(mockShowErrorMessage).toHaveBeenCalledWith("Custom Error Title", "setDoc failed");

      // deleteNode success and error
      store.dispatch("model/deleteNode", { modelId: "m1", node: { id: "n_out" } });
      await flushMicrotasks();
      expect(mockNotifyCreate).toHaveBeenCalledWith("toastFactorDeleted");

      shouldFailDeleteDoc = true;
      store.dispatch("model/deleteNode", { modelId: "m1", node: { id: "n_out" } });
      await flushMicrotasks();
      expect(mockShowErrorMessage).toHaveBeenCalledWith("Error deleting node", "deleteDoc failed");
    });
  });

  describe("links, relax/restore, reDetermineNodeClass, node groups, batch updateNodes & getters", () => {
    it("addLink validates self-link & targetType, deleteLink mutates state and removes arrays, and relax/restore manage strengthFactor", async () => {
      const store = makeTestStore({
        currentModel: {
          id: "m1",
          relaxedLinks: [{ influencerNodeId: "a", influenceeNodeId: "b", strengthFactor: 0.1 }]
        },
        nodes: [
          {
            id: "a",
            name: "A",
            symbol: "a",
            sysFormula: "10",
            influencers: ["b"],
            influencees: ["b"],
            blockingInfluencers: [],
            unusedInfluencers: ["b"]
          },
          {
            id: "b",
            name: "B",
            symbol: "b",
            sysFormula: "$a * 2",
            influencers: ["a"],
            influencees: ["a"],
            blockingInfluencers: ["a"],
            unusedInfluencers: []
          }
        ]
      });

      // Getters.links characterization
      const links = store.getters["model/links"];
      expect(links).toHaveLength(2);
      const aToB = links.find((l) => l.source === "a" && l.target === "b");
      const bToA = links.find((l) => l.source === "b" && l.target === "a");
      expect(aToB).toEqual({
        source: "a",
        target: "b",
        hasReciprocal: true,
        isBlocking: true,
        isUnused: false,
        strengthFactor: 0.1
      });
      expect(bToA.strengthFactor).toBe(1);
      expect(bToA.isUnused).toBe(true);

      // Validation errors on addLink
      expect(() =>
        store.dispatch("model/addLink", {
          modelId: "m1",
          link: { sourceNodeId: "a", targetNodeId: "a", targetType: "influencer" }
        })
      ).toThrow("Source node and target node cannot be the same node!");

      expect(() =>
        store.dispatch("model/addLink", {
          modelId: "m1",
          link: { sourceNodeId: "a", targetNodeId: "b", targetType: "invalid" }
        })
      ).toThrow("Link target type not recognized.");

      // relaxLink, relaxLinkMore, restoreLinkForce
      const relaxed = await store.dispatch("model/relaxLink", {
        link: { influencerNodeId: "b", influenceeNodeId: "a" }
      });
      expect(relaxed).toEqual({
        influencerNodeId: "b",
        influenceeNodeId: "a",
        strengthFactor: 0.1
      });

      await store.dispatch("model/relaxLinkMore", {
        link: { influencerNodeId: "a", influenceeNodeId: "b" }
      });
      expect(updateDocCalls.at(-1).data.relaxedLinks[0].strengthFactor).toBeCloseTo(0.01, 5);

      await store.dispatch("model/restoreLinkForce", {
        link: { influencerNodeId: "a", influenceeNodeId: "b" }
      });
      expect(updateDocCalls.at(-1).data.relaxedLinks).toEqual([]);

      // deleteLink mutates local state immediately and commits arrayRemove batch
      store.dispatch("model/deleteLink", {
        modelId: "m1",
        link: { influencerNodeId: "a", influenceeNodeId: "b" }
      });
      await flushMicrotasks();
      expect(store.state.model.nodes[0].influencees).not.toContain("b");
      expect(store.state.model.nodes[1].influencers).not.toContain("a");
      expect(mockNotifyCreate).toHaveBeenCalledWith("toastLinkDeleted");
    });

    it("reDetermineNodeClass assigns unlinked, input, output, state, performs dummy write when unchanged, and handles missing doc", async () => {
      const store = makeTestStore();

      transactionDocs.set("models/m1/nodes/unlinked_node", { class: "state", influencers: [], influencees: [] });
      transactionDocs.set("models/m1/nodes/input_node", { class: "unlinked", influencers: [], influencees: ["x"] });
      transactionDocs.set("models/m1/nodes/output_node", { class: "unlinked", influencers: ["x"], influencees: [] });
      transactionDocs.set("models/m1/nodes/state_node", { class: "input", influencers: ["x"], influencees: ["y"] });
      transactionDocs.set("models/m1/nodes/unchanged_node", { class: "input", influencers: [], influencees: ["x"] });

      for (const nodeId of ["unlinked_node", "input_node", "output_node", "state_node", "unchanged_node", "missing_node"]) {
        store.dispatch("model/reDetermineNodeClass", { modelId: "m1", nodeId });
      }
      await flushMicrotasks();

      expect(transactionUpdates).toEqual([
        { path: "models/m1/nodes/unlinked_node", data: { class: "unlinked" } },
        { path: "models/m1/nodes/input_node", data: { class: "input" } },
        { path: "models/m1/nodes/output_node", data: { class: "output" } },
        { path: "models/m1/nodes/state_node", data: { class: "state" } },
        { path: "models/m1/nodes/unchanged_node", data: {} }
      ]);
    });

    it("createNodeGroup, addToNodeGroup, and removeNodeFromGroup manage group membership and nested parentId", async () => {
      const store = makeTestStore({ currentModel: { id: "m1" } });

      const created = await store.dispatch("model/createNodeGroup", {
        groupName: "Operations",
        nodeId: "n1"
      });
      expect(created).toEqual({
        id: "uid_1",
        name: "Operations",
        nodeIds: ["n1"]
      });

      transactionDocs.set("models/m1", {
        nodeGroups: [
          { id: "parent_g", name: "Parent", nodeIds: [] },
          { id: "child_g", name: "Child", nodeIds: ["n1"] }
        ]
      });

      await store.dispatch("model/addToNodeGroup", {
        nodeId: "child_g",
        nodeIsGroupNode: true,
        nodeGroupId: "parent_g"
      });
      expect(transactionUpdates.at(-1).data.nodeGroups).toEqual([
        { id: "parent_g", name: "Parent", nodeIds: ["child_g"] },
        { id: "child_g", name: "Child", nodeIds: ["n1"], parentId: "parent_g" }
      ]);

      transactionDocs.set("models/m1", {
        nodeGroups: structuredClone(transactionUpdates.at(-1).data.nodeGroups)
      });

      await store.dispatch("model/removeNodeFromGroup", {
        nodeId: "child_g",
        nodeIsGroupNode: true,
        nodeGroupId: "parent_g"
      });
      const afterRemove = transactionUpdates.at(-1).data.nodeGroups;
      expect(afterRemove[0].nodeIds).toEqual([]);
      expect("parentId" in afterRemove[1]).toBe(false);
    });

    it("updateNodes chunks writes across multiple batches when > 499 nodes change and refreshes classifications", async () => {
      const nodes = Array.from({ length: 502 }, (_, idx) => ({
        id: `n_${idx}`,
        name: `Factor ${idx}`,
        symbol: `f_${idx}`,
        unit: "items",
        influencees: []
      }));
      const store = makeTestStore({
        currentModel: { id: "m1", currency: "USD", roleNodes: {} },
        nodes
      });

      const changedNodes = nodes.map((n, idx) => ({
        id: n.id,
        changes: { latestValue: idx },
        latestValueExistenceChanged: idx === 0
      }));

      await store.dispatch("model/updateNodes", {
        modelId: "m1",
        changedNodes
      });

      // 502 updates -> 1st batch has 499 ops, 2nd batch has 3 ops
      expect(batchInstances).toHaveLength(2);
      expect(batchInstances[0].ops).toHaveLength(499);
      expect(batchInstances[1].ops).toHaveLength(3);
      expect(mockNotifyCreate).toHaveBeenCalledWith("toastFactorsUpdated");
    });
  });
});
