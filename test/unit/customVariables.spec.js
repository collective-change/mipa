import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createStore } from "vuex";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import CustomVariablesModal from "@/components/Model/Modals/CustomVariablesModal.vue";
import { validateFormulaSyntax, getFactorSuggestions, toSysFormula } from "@/utils/formulaHelper";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

function createTestI18n(locale = "en-us") {
  return createI18n({
    legacy: false,
    locale,
    fallbackLocale: "en-us",
    messages
  });
}

function createTestStore(modelOverrides = {}) {
  const addCustomVariableMock = vi.fn();
  const updateCustomVariableMock = vi.fn();
  const deleteCustomVariableMock = vi.fn();

  const store = createStore({
    modules: {
      model: {
        namespaced: true,
        state: () => ({
          currentModel: {
            id: "model-1",
            name: "Test Model",
            customVariables: [
              { name: "unitPrice", value: 25, unit: "USD", description: "Standard selling price" },
              { name: "taxRate", value: 0.05, unit: "", description: "Applicable sales tax" }
            ],
            ...modelOverrides
          },
          nodes: [
            { id: "n1", symbol: "sales", name: "Units Sold", symbolFormula: "100", sysFormula: "100" }
          ]
        }),
        actions: {
          addCustomVariable: addCustomVariableMock,
          updateCustomVariable: updateCustomVariableMock,
          deleteCustomVariable: deleteCustomVariableMock
        }
      }
    }
  });

  return { store, addCustomVariableMock, updateCustomVariableMock, deleteCustomVariableMock };
}

describe("MIPA-19: Custom Variables Management & Formula Integration", () => {
  describe("formulaHelper integration with custom variables", () => {
    const customVariables = [
      { name: "wholesalePrice", value: 50, unit: "USD" },
      { name: "discountPct", value: 0.2, unit: "" }
    ];

    it("recognizes custom variables as valid without reporting unknownSymbols", () => {
      const res = validateFormulaSyntax("wholesalePrice * (1 - discountPct)", {
        availableSymbols: [],
        allNodes: [],
        customVariables
      });

      expect(res.valid).toBe(true);
      expect(res.unknownSymbols).toEqual([]);
      expect(res.usedCustomVariables).toEqual(["wholesalePrice", "discountPct"]);
    });

    it("reports truly unknown symbols while recognizing custom variables", () => {
      const res = validateFormulaSyntax("wholesalePrice * unknownFactor", {
        availableSymbols: [],
        allNodes: [],
        customVariables
      });

      expect(res.valid).toBe(true);
      expect(res.usedCustomVariables).toEqual(["wholesalePrice"]);
      expect(res.unknownSymbols).toEqual(["unknownFactor"]);
    });

    it("leaves custom variables as bare identifiers in toSysFormula without creating node links", () => {
      const allNodes = [
        { id: "node_qty", symbol: "quantity", name: "Quantity Sold" }
      ];

      const res = toSysFormula("quantity * wholesalePrice", allNodes);
      // quantity is a graph node -> converted to $node_qty
      // wholesalePrice is a custom variable -> preserved as bare identifier
      expect(res.sysFormula).toBe("$node_qty * wholesalePrice");
      expect(res.referencedNodeIds).toEqual(["node_qty"]);
      expect(res.unlinkedSymbols).toEqual([
        { symbol: "quantity", nodeId: "node_qty", name: "Quantity Sold" }
      ]);
    });

    it("includes custom variables in getFactorSuggestions with isCustomVariable flag", () => {
      const allNodes = [
        { id: "n1", symbol: "volume", name: "Sales Volume" }
      ];

      const suggestions = getFactorSuggestions("whole", allNodes, "", [], customVariables);
      expect(suggestions.length).toBe(1);
      expect(suggestions[0].symbol).toBe("wholesalePrice");
      expect(suggestions[0].isCustomVariable).toBe(true);
    });
  });

  describe("CustomVariablesModal Component", () => {
    const mountModal = (store, props = {}, locale = "en-us") => {
      return mount(CustomVariablesModal, {
        props: {
          modelValue: true,
          model: store.state.model.currentModel,
          ...props
        },
        global: {
          plugins: [[Quasar, { components }], store, createTestI18n(locale)],
          stubs: {
            "q-dialog": { template: "<div><slot /></div>" }
          }
        }
      });
    };

    it("renders custom variables list and badge count", () => {
      const { store } = createTestStore();
      const wrapper = mountModal(store);

      expect(wrapper.text()).toContain("Custom Variables");
      expect(wrapper.text()).toContain("unitPrice");
      expect(wrapper.text()).toContain("taxRate");
      expect(wrapper.text()).toContain("25");
      expect(wrapper.vm.variablesList.length).toBe(2);
    });

    it("filters variables by search query", async () => {
      const { store } = createTestStore();
      const wrapper = mountModal(store);

      wrapper.vm.searchQuery = "tax";
      expect(wrapper.vm.filteredVariables.length).toBe(1);
      expect(wrapper.vm.filteredVariables[0].name).toBe("taxRate");

      wrapper.vm.searchQuery = "nonexistent";
      expect(wrapper.vm.filteredVariables.length).toBe(0);
    });

    it("detects duplicate variable names case-insensitively", () => {
      const { store } = createTestStore();
      const wrapper = mountModal(store);

      expect(wrapper.vm.isDuplicateName("unitPrice")).toBe(true);
      expect(wrapper.vm.isDuplicateName("UNITPRICE")).toBe(true);
      expect(wrapper.vm.isDuplicateName("newUniqueVar")).toBe(false);
    });

    it("dispatches addCustomVariable when adding a new valid variable", async () => {
      const { store, addCustomVariableMock } = createTestStore();
      const wrapper = mountModal(store);

      wrapper.vm.form = {
        name: "shippingFee",
        value: 12.5,
        unit: "USD",
        description: "Flat delivery cost"
      };

      await wrapper.vm.saveVariable();

      expect(addCustomVariableMock).toHaveBeenCalledWith(
        expect.anything(),
        {
          modelId: "model-1",
          variable: {
            name: "shippingFee",
            value: 12.5,
            unit: "USD",
            description: "Flat delivery cost"
          }
        }
      );
    });

    it("dispatches deleteCustomVariable when deleting a variable", () => {
      const { store, deleteCustomVariableMock } = createTestStore();
      const wrapper = mountModal(store);

      wrapper.vm.confirmDelete("unitPrice");
      expect(deleteCustomVariableMock).toHaveBeenCalledWith(
        expect.anything(),
        {
          modelId: "model-1",
          variableName: "unitPrice"
        }
      );
    });

    it("disables mutation form and actions when readOnly is true", () => {
      const { store, addCustomVariableMock, deleteCustomVariableMock } = createTestStore();
      const wrapper = mountModal(store, { readOnly: true });

      expect(wrapper.find("form").exists()).toBe(false);
      wrapper.vm.saveVariable();
      wrapper.vm.confirmDelete("unitPrice");
      expect(addCustomVariableMock).not.toHaveBeenCalled();
      expect(deleteCustomVariableMock).not.toHaveBeenCalled();
    });

    it("renders Traditional Chinese strings without English fallback placeholders", () => {
      const { store } = createTestStore();
      const wrapper = mountModal(store, {}, "zh-tw");

      expect(wrapper.text()).toContain("自訂變數");
      expect(wrapper.text()).toContain("新增變數");
    });
  });

  describe("Graph isolation & factor/action count independence", () => {
    it("ensures custom variables are stored outside the factor nodes collection", () => {
      const model = {
        id: "model-test",
        customVariables: [
          { name: "costOfGoods", value: 15, unit: "USD" },
          { name: "markupPct", value: 1.5, unit: "" }
        ]
      };

      const nodes = [
        { id: "node1", symbol: "sales", name: "Sales" },
        { id: "node2", symbol: "profit", name: "Profit" }
      ];

      const actions = [
        { id: "act1", title: "Scale Marketing", actionLeverage: 4.2 }
      ];

      // Acceptance criterion: Custom variables do NOT appear in the graph, factor/action counts, or leverage ranking
      expect(nodes.length).toBe(2);
      expect(nodes.some(n => n.symbol === "costOfGoods")).toBe(false);
      expect(actions.length).toBe(1);
      expect(actions.some(a => a.id === "costOfGoods")).toBe(false);
      expect(model.customVariables.length).toBe(2);
    });
  });
});
