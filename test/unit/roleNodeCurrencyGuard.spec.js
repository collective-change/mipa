import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createPinia, setActivePinia } from "pinia";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import {
  ROLE_SYMBOLS,
  CURRENCY_ROLE_KEYS,
  CURRENCY_ROLE_SYMBOLS,
  isCurrencyRoleNode,
  coerceRoleNodeCurrency
} from "@/utils/util-model-draft";
import NodeSummary from "@/components/Model/NodeSummary.vue";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

// Mocks for store tests
let writtenNodeUpdates = {};
let batchUpdates = [];

vi.mock("firebase/firestore", () => ({
  doc: (...args) => ({ path: args.slice(1).join("/"), id: args[args.length - 1] }),
  collection: (...args) => ({ path: args.slice(1).join("/") }),
  addDoc: async (_ref, data) => ({ id: "new_doc_id", ...data }),
  setDoc: async (docRef, data) => {
    writtenNodeUpdates[docRef.id || "last"] = data;
    return Promise.resolve();
  },
  updateDoc: async (docRef, data) => {
    writtenNodeUpdates[docRef.id || "last"] = data;
    return Promise.resolve();
  },
  writeBatch: () => ({
    update: (docRef, changes) => {
      batchUpdates.push({ id: docRef.id, ...changes });
    },
    commit: async () => Promise.resolve()
  }),
  deleteDoc: async () => Promise.resolve(),
  getDocs: async () => ({ docs: [], forEach: () => {} }),
  serverTimestamp: () => "MOCK_TIMESTAMP",
  arrayRemove: () => ({}),
  arrayUnion: () => ({}),
  getFirestore: () => ({}),
  connectFirestoreEmulator: () => {},
  query: () => ({}),
  where: () => ({}),
  orderBy: () => ({}),
  onSnapshot: () => () => {},
  DocumentReference: class {}
}));

vi.mock("firebase/app", () => ({
  initializeApp: () => ({})
}));

vi.mock("firebase/auth", () => ({
  getAuth: () => ({ authStateReady: async () => {}, currentUser: { uid: "test-user-123" } }),
  connectAuthEmulator: () => {}
}));

const mockHttpsCallable = vi.fn(() => vi.fn().mockResolvedValue({}));
vi.mock("firebase/functions", () => ({
  httpsCallable: (...args) => mockHttpsCallable(...args)
}));

vi.mock("@/boot/firebase", () => ({
  firebaseDb: {},
  firebaseAuth: { currentUser: { uid: "test-user-123", email: "test@example.com" } },
  firebaseFunctions: {}
}));

vi.mock("quasar", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    Notify: { create: vi.fn() }
  };
});

vi.mock("@/utils/util-show-error-message", () => ({
  showErrorMessage: vi.fn()
}));

const { useModelStore } = await import("@/store/store-model.js");
const { useOrgsStore } = await import("@/store/store-orgs.js");
const { useUiStore } = await import("@/store/store-ui.js");
const { useCalcResultsStore } = await import("@/store/store-calcResults.js");
const { useActionsStore } = await import("@/store/store-actions.js");

// A fresh Pinia with the org (rootState.orgs in the old Vuex tests) and the
// model state set up; returns the model store.
function createModelStore(state, rootState) {
  const pinia = createPinia();
  setActivePinia(pinia);
  if (rootState && rootState.orgs) {
    useOrgsStore(pinia).$patch({ currentOrg: rootState.orgs.currentOrg });
  }
  const model = useModelStore(pinia);
  model.$patch(state);
  return model;
}

describe("MIPA-22: Role Nodes Currency Coercion Guard", () => {
  beforeEach(() => {
    writtenNodeUpdates = {};
    batchUpdates = [];
  });

  describe("Utility functions: isCurrencyRoleNode & coerceRoleNodeCurrency", () => {
    it("recognizes all standard currency role symbols", () => {
      const currencySymbols = [
        "averageEffortCostPerHour",
        "oneTimeSpending",
        "costToOrganizationDuringInterval",
        "costToWorldDuringInterval",
        "benefitToOrganizationDuringInterval",
        "benefitToWorldDuringInterval"
      ];

      currencySymbols.forEach((symbol) => {
        expect(isCurrencyRoleNode({ id: `id_${symbol}`, symbol })).toBe(true);
      });
    });

    it("recognizes nodes assigned via roleNodes mapping even with custom symbols", () => {
      const roleNodes = {
        orgBenefit: "custom_benefit_id",
        orgCost: "custom_cost_id",
        worldBenefit: "custom_world_ben_id",
        worldCost: "custom_world_cost_id",
        spending: "custom_spending_id",
        averageEffortCostPerHour: "custom_rate_id"
      };

      expect(isCurrencyRoleNode({ id: "custom_benefit_id", symbol: "salesBoost" }, roleNodes)).toBe(true);
      expect(isCurrencyRoleNode({ id: "custom_cost_id", symbol: "officeRent" }, roleNodes)).toBe(true);
      expect(isCurrencyRoleNode({ id: "unrelated_id", symbol: "salesBoost" }, roleNodes)).toBe(false);
    });

    it("does NOT classify effort (oneTimeEffort) as a currency role node (measured in workhours)", () => {
      const roleNodes = { effort: "effort_id" };
      expect(isCurrencyRoleNode({ id: "effort_id", symbol: "oneTimeEffort" }, roleNodes)).toBe(false);
      expect(isCurrencyRoleNode({ id: "other_effort", symbol: "oneTimeEffort" })).toBe(false);
    });

    it("does NOT classify arbitrary non-role factors as currency role nodes", () => {
      expect(isCurrencyRoleNode({ id: "n1", symbol: "mealsServed" })).toBe(false);
      expect(isCurrencyRoleNode({ id: "n2", symbol: "activeVolunteers" })).toBe(false);
      expect(isCurrencyRoleNode({ id: "n3", symbol: "treeCanopyArea" })).toBe(false);
    });

    it("coerces currency role node unit to org currency while leaving others untouched", () => {
      const orgBenefitNode = { id: "ob_1", symbol: "benefitToOrganizationDuringInterval", unit: "EUR" };
      const effortNode = { id: "eff_1", symbol: "oneTimeEffort", unit: "workhours" };
      const generalNode = { id: "gen_1", symbol: "volunteers", unit: "people" };

      expect(coerceRoleNodeCurrency(orgBenefitNode, "USD")).toEqual({
        id: "ob_1",
        symbol: "benefitToOrganizationDuringInterval",
        unit: "USD"
      });

      expect(coerceRoleNodeCurrency(effortNode, "USD")).toEqual({
        id: "eff_1",
        symbol: "oneTimeEffort",
        unit: "workhours"
      });

      expect(coerceRoleNodeCurrency(generalNode, "USD")).toEqual({
        id: "gen_1",
        symbol: "volunteers",
        unit: "people"
      });
    });
  });

  describe("Model Store Guard (store-model.js)", () => {
    it("updateNode: coerces currency role node unit to org currency when user attempts to change it", async () => {
      const mockState = {
        currentModel: {
          id: "model_1",
          currency: "USD",
          roleNodes: { orgBenefit: "node_org_benefit" }
        },
        nodes: [
          {
            id: "node_org_benefit",
            symbol: "benefitToOrganizationDuringInterval",
            name: "Org Benefit",
            unit: "USD"
          }
        ]
      };

      const mockRootState = {
        orgs: {
          currentOrg: { id: "org_1", currency: "USD" }
        }
      };

      const payload = {
        modelId: "model_1",
        updates: {
          id: "node_org_benefit",
          unit: "EUR" // User attempts to diverge currency
        }
      };

      await createModelStore(mockState, mockRootState).updateNode(payload);

      // Assert unit was coerced back to org default currency (USD)
      expect(payload.updates.unit).toBe("USD");
      expect(writtenNodeUpdates["node_org_benefit"].unit).toBe("USD");
    });

    it("updateNode: allows non-role factor unit to be updated freely", async () => {
      const mockState = {
        currentModel: {
          id: "model_1",
          currency: "USD",
          roleNodes: { orgBenefit: "node_org_benefit" }
        },
        nodes: [
          {
            id: "node_meals",
            symbol: "mealsServed",
            name: "Meals Served",
            unit: "meals"
          }
        ]
      };

      const mockRootState = {
        orgs: {
          currentOrg: { id: "org_1", currency: "USD" }
        }
      };

      const payload = {
        modelId: "model_1",
        updates: {
          id: "node_meals",
          unit: "boxes" // Free update
        }
      };

      await createModelStore(mockState, mockRootState).updateNode(payload);

      expect(payload.updates.unit).toBe("boxes");
      expect(writtenNodeUpdates["node_meals"].unit).toBe("boxes");
    });

    it("updateNodes: batch update coerces role nodes to org default currency", async () => {
      const mockState = {
        currentModel: {
          id: "model_1",
          currency: "TWD",
          roleNodes: {
            orgCost: "node_cost",
            spending: "node_spending"
          }
        },
        nodes: [
          { id: "node_cost", symbol: "costToOrganizationDuringInterval", unit: "USD" },
          { id: "node_spending", symbol: "oneTimeSpending", unit: "USD" },
          { id: "node_trees", symbol: "treesPlanted", unit: "trees" }
        ]
      };

      const mockRootState = {
        orgs: {
          currentOrg: { id: "org_1", currency: "TWD" }
        }
      };

      const payload = {
        modelId: "model_1",
        changedNodes: [
          { id: "node_cost", changes: { unit: "EUR" } },
          { id: "node_spending", changes: { unit: "JPY" } },
          { id: "node_trees", changes: { unit: "saplings" } }
        ]
      };

      await createModelStore(mockState, mockRootState).updateNodes(payload);

      const costUpdate = batchUpdates.find((b) => b.id === "node_cost");
      const spendingUpdate = batchUpdates.find((b) => b.id === "node_spending");
      const treesUpdate = batchUpdates.find((b) => b.id === "node_trees");

      expect(costUpdate.unit).toBe("TWD");
      expect(spendingUpdate.unit).toBe("TWD");
      expect(treesUpdate.unit).toBe("saplings");
    });

    it("updateModel: reassigning role nodes automatically aligns target node units to org currency", async () => {
      const mockDispatch = vi.fn();
      const mockState = {
        currentModel: {
          id: "model_1",
          currency: "USD",
          roleNodes: {}
        },
        nodes: [
          { id: "node_custom_ben", symbol: "customBenefit", unit: "bananas" }
        ]
      };

      const mockRootState = {
        orgs: {
          currentOrg: { id: "org_1", currency: "USD" }
        }
      };

      const payload = {
        modelId: "model_1",
        updates: {
          roleNodes: {
            orgBenefit: "node_custom_ben"
          }
        }
      };

      const model = createModelStore(mockState, mockRootState);
      model.updateNodes = mockDispatch;
      await model.updateModel(payload);

      expect(mockDispatch).toHaveBeenCalledWith({
        modelId: "model_1",
        changedNodes: [{ id: "node_custom_ben", changes: { unit: "USD" } }],
        orgCurrency: "USD"
      });
    });
  });

  describe("Orgs Store Guard (store-orgs.js)", () => {
    it("updateOrg: changing organization currency propagates to all role nodes in the current model", async () => {
      const mockDispatch = vi.fn();
      const mockRootState = {
        model: {
          currentModel: {
            id: "model_1",
            roleNodes: {
              orgBenefit: "node_ob",
              orgCost: "node_oc"
            }
          },
          nodes: [
            { id: "node_ob", symbol: "benefitToOrganizationDuringInterval", unit: "USD" },
            { id: "node_oc", symbol: "costToOrganizationDuringInterval", unit: "USD" },
            { id: "node_vol", symbol: "volunteers", unit: "people" }
          ]
        }
      };

      const payload = {
        id: "org_1",
        updates: {
          name: "European Mission",
          currency: "EUR"
        }
      };

      const model = createModelStore(mockRootState.model);
      model.updateNodes = mockDispatch;
      useOrgsStore().updateOrg(payload);

      // Wait a microtask for setDoc promise then
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockDispatch).toHaveBeenCalledWith(
        {
          modelId: "model_1",
          changedNodes: [
            { id: "node_ob", changes: { unit: "EUR" } },
            { id: "node_oc", changes: { unit: "EUR" } }
          ],
          orgCurrency: "EUR"
        }
      );
    });

    it("clearOrgs resets the orgs collection to null", () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const orgsStore = useOrgsStore(pinia);
      orgsStore.orgs = [{ id: "o1" }];
      orgsStore.clearOrgs();
      expect(orgsStore.orgs).toBeNull();
    });

    it("addOrg creates organization document, member record, and main model", async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const orgsStore = useOrgsStore(pinia);
      const modelStore = useModelStore(pinia);
      const addOrgMainModelSpy = vi.spyOn(modelStore, "addOrgMainModel").mockResolvedValue(undefined);

      await orgsStore.addOrg({ name: "New Charity Org", currency: "USD" });
      expect(addOrgMainModelSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: "USD"
        })
      );
    });

    it("deleteOrg calls callable cloud function and triggers model deletion", async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const orgsStore = useOrgsStore(pinia);
      const modelStore = useModelStore(pinia);
      const deleteModelSpy = vi.spyOn(modelStore, "deleteModel").mockResolvedValue(undefined);

      await orgsStore.deleteOrg("org_delete_me");
      expect(deleteModelSpy).toHaveBeenCalledWith("org_delete_me");
    });

    it("deleteOrg falls back to direct document deletion if callable fails", async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const orgsStore = useOrgsStore(pinia);
      const modelStore = useModelStore(pinia);
      const deleteModelSpy = vi.spyOn(modelStore, "deleteModel").mockResolvedValue(undefined);

      mockHttpsCallable.mockReturnValueOnce(() => Promise.reject(new Error("callable-failed")));

      await orgsStore.deleteOrg("org_fallback");
      expect(deleteModelSpy).toHaveBeenCalledWith("org_fallback");
    });

    it("bindOrgs, unbindOrgs, bindCurrentOrg, and unbindCurrentOrg manage listeners", () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const orgsStore = useOrgsStore(pinia);

      orgsStore.bindOrgs();
      orgsStore.unbindOrgs();
      orgsStore.bindCurrentOrg("org_test");
      orgsStore.unbindCurrentOrg();
    });
  });

  describe("UI Guard (NodeSummary.vue)", () => {
    function mountNodeSummaryWithNode(node, orgCurrency = "USD", locale = "en-us") {
      const store = createPinia();
      setActivePinia(store);
      const ui = useUiStore(store);
      ui.$patch({
        selectedNodeId: node.id,
        uiNodeChanged: false,
        uiNodeChangedFields: []
      });
      // The Vuex test store stubbed these mutations (addUiNodeChangedFields
      // was not registered, so committing it was a no-op).
      ui.setUiNodeChanged = vi.fn();
      ui.addUiNodeChangedFields = vi.fn();
      useOrgsStore(store).$patch({
        currentOrg: { id: "org_1", currency: orgCurrency, users: [] }
      });
      const model = useModelStore(store);
      model.$patch({
        currentModel: {
          id: "model_1",
          currency: orgCurrency,
          roleNodes: {
            orgBenefit: "node_org_benefit",
            orgCost: "node_org_cost"
          }
        },
        nodes: [node]
      });
      model.updateNode = vi.fn();
      model.addLink = vi.fn();
      useCalcResultsStore(store).$patch({ baseline: {} });
      useActionsStore(store).$patch({ matchingActions: [], actions: [] });

      const i18n = createI18n({
        legacy: true,
        locale,
        messages
      });

      return mount(NodeSummary, {
        global: {
          plugins: [
            store,
            i18n,
            [Quasar, { components, directives: { ClosePopup: All.ClosePopup } }]
          ],
          mocks: {
            $route: { params: { modelId: "test-model-1" } }
          },
          stubs: {
            "latex-formula": true,
            gchart: true,
            chat: true,
            "select-user": true,
            "modal-buttons": true,
            "add-node": true,
            "add-link": true,
            "delete-node": true,
            "factor-series-modal": true
          }
        }
      });
    }

    it("locks and disables the Unit field for a currency role node, showing lock hint", async () => {
      const roleNode = {
        id: "node_org_benefit",
        symbol: "benefitToOrganizationDuringInterval",
        name: "Benefit to Organization",
        unit: "USD",
        symbolFormula: "0",
        sysFormula: "0",
        influencers: [],
        blockingInfluencers: [],
        unusedInfluencers: []
      };

      const wrapper = mountNodeSummaryWithNode(roleNode, "USD", "en-us");

      expect(wrapper.vm.isCurrencyRoleNode).toBe(true);
      expect(wrapper.vm.orgCurrency).toBe("USD");

      // Find Unit input
      const unitInputs = wrapper.findAllComponents({ name: "QInput" });
      const unitInput = unitInputs.find((w) => w.props("label") === "Unit");
      expect(unitInput).toBeDefined();

      // Assert unit input is disabled and readonly
      expect(unitInput.props("disable")).toBe(true);
      expect(unitInput.props("readonly")).toBe(true);

      // Assert hint mentions the org currency
      expect(unitInput.props("hint")).toContain("USD");
      expect(unitInput.props("hint")).toBe("Key role factors must use the organization's default currency (USD)");
    });

    it("displays Traditional Chinese hint properly without interpolation errors", async () => {
      const roleNode = {
        id: "node_org_benefit",
        symbol: "benefitToOrganizationDuringInterval",
        name: "組織效益",
        unit: "TWD",
        symbolFormula: "0",
        sysFormula: "0",
        influencers: [],
        blockingInfluencers: [],
        unusedInfluencers: []
      };

      const wrapper = mountNodeSummaryWithNode(roleNode, "TWD", "zh-tw");

      expect(wrapper.vm.isCurrencyRoleNode).toBe(true);
      expect(wrapper.vm.orgCurrency).toBe("TWD");

      const unitInputs = wrapper.findAllComponents({ name: "QInput" });
      const unitInput = unitInputs.find((w) => w.props("label") === "單位");
      expect(unitInput).toBeDefined();
      expect(unitInput.props("hint")).toBe("關鍵角色要素必須使用組織的預設貨幣（TWD）");
    });

    it("leaves the Unit field editable for non-role factors", async () => {
      const generalNode = {
        id: "node_meals",
        symbol: "mealsServed",
        name: "Meals Served",
        unit: "meals",
        symbolFormula: "0",
        sysFormula: "0",
        influencers: [],
        blockingInfluencers: [],
        unusedInfluencers: []
      };

      const wrapper = mountNodeSummaryWithNode(generalNode, "USD", "en-us");

      expect(wrapper.vm.isCurrencyRoleNode).toBe(false);

      const unitInputs = wrapper.findAllComponents({ name: "QInput" });
      const unitInput = unitInputs.find((w) => w.props("label") === "Unit");
      expect(unitInput).toBeDefined();

      expect(unitInput.props("disable")).toBe(false);
      expect(unitInput.props("readonly")).toBe(false);
      expect(unitInput.props("hint")).not.toContain("Key role factors");
    });
  });

  describe("Worker Guard (calcWorker.js)", () => {
    it("coerces currency role node units to orgCurrency before evaluating expected units", async () => {
      const { runCalc, node, message } = await import("./calc/harness.js");
      const testNodes = [
        node("ob", "1000", {
          symbol: "benefitToOrganizationDuringInterval",
          unit: "EUR" // Mismatched currency
        }),
        node("eff", "10", {
          symbol: "oneTimeEffort",
          unit: "workhours"
        })
      ];

      const msg = message(testNodes, {
        orgCurrency: "USD",
        roleNodes: { orgBenefit: "ob", effort: "eff" }
      });

      const { results, error } = await runCalc(msg);
      expect(error).toBeUndefined();
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].resultsType).toBe("baseline");
    });
  });
});
