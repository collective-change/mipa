import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createStore } from "vuex";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import NodeSummary from "@/components/Model/NodeSummary.vue";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

const mockNodes = [
  {
    id: "node_meals",
    symbol: "mealsServed",
    name: "Meals Served",
    unit: "meals",
    symbolFormula: "volunteers * 10",
    sysFormula: "$node_volunteers * 10",
    influencers: ["node_volunteers"],
    blockingInfluencers: [],
    unusedInfluencers: []
  },
  {
    id: "node_volunteers",
    symbol: "volunteers",
    name: "Active Volunteers",
    unit: "people",
    symbolFormula: "",
    sysFormula: "",
    influencers: [],
    blockingInfluencers: [],
    unusedInfluencers: []
  },
  {
    id: "node_budget",
    symbol: "totalBudget",
    name: "Total Budget",
    unit: "USD",
    symbolFormula: "10000",
    sysFormula: "10000",
    influencers: [],
    blockingInfluencers: [],
    unusedInfluencers: []
  }
];

function mountNodeSummary(selectedId = "node_meals", locale = "en-us") {
  const currentMockNodes = JSON.parse(JSON.stringify(mockNodes));
  const actions = {
    updateNode: vi.fn(),
    addLink: vi.fn(),
    reDetermineNodeClass: vi.fn(),
    updateClassifiedInfluencersOf: vi.fn()
  };
  const uiActions = {
    setSelectedNodeId: vi.fn()
  };

  const store = createStore({
    modules: {
      model: {
        namespaced: true,
        state: {
          currentModel: { id: "test-model-1", roleNodes: {} },
          nodes: currentMockNodes
        },
        getters: {
          nodes: () => currentMockNodes,
          links: () => []
        },
        actions
      },
      ui: {
        namespaced: true,
        state: {
          selectedNodeId: selectedId,
          uiNodeChanged: false,
          uiNodeChangedFields: []
        },
        actions: uiActions,
        mutations: {
          setUiNodeChanged: vi.fn(),
          addUiNodeChangedFields: vi.fn()
        }
      },
      calcResults: {
        namespaced: true,
        state: {
          baseline: { timeSPoints: [], nodesValues: {} }
        }
      }
    }
  });

  const wrapper = mount(NodeSummary, {
    global: {
      plugins: [
        [Quasar, { components, directives: { ClosePopup: All.ClosePopup } }],
        store,
        createI18n({ legacy: true, locale, messages })
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
        "delete-node": true
      }
    }
  });

  return { wrapper, actions, uiActions };
}

describe("NodeSummary.vue - Formula Autocomplete & Syntax Helpers", () => {
  it("renders formula helper primitive chips", () => {
    const { wrapper } = mountNodeSummary();
    const chips = wrapper.findAll(".q-chip");
    expect(chips.length).toBeGreaterThanOrEqual(4);
    const chipTexts = chips.map((c) => c.text());
    expect(chipTexts.some((t) => t.includes("delay()"))).toBe(true);
    expect(chipTexts.some((t) => t.includes("min()"))).toBe(true);
  });

  it("inserts primitive snippet on chip click", async () => {
    const { wrapper } = mountNodeSummary();
    wrapper.vm.nodeToSubmit.symbolFormula = "";
    wrapper.vm.formulaCursorPos = 0;

    const delayChip = wrapper.vm.formulaPrimitives.find((p) => p.id === "delay");
    wrapper.vm.insertPrimitive(delayChip);

    expect(wrapper.vm.nodeToSubmit.symbolFormula).toBe("delay(mealsServed, dt, 0)");
  });

  it("suggests matching factors and shows autocomplete options", async () => {
    const { wrapper } = mountNodeSummary();
    wrapper.vm.currentFormulaToken = "bud";
    expect(wrapper.vm.autocompleteSuggestions.length).toBe(1);
    expect(wrapper.vm.autocompleteSuggestions[0].symbol).toBe("totalBudget");
    expect(wrapper.vm.autocompleteSuggestions[0].name).toBe("Total Budget");
  });

  it("inserts factor symbol from autocomplete and links influencer", async () => {
    const { wrapper, actions } = mountNodeSummary();
    wrapper.vm.nodeToSubmit.symbolFormula = "volunteers * 10 + ";
    wrapper.vm.formulaCursorPos = wrapper.vm.nodeToSubmit.symbolFormula.length;

    const budgetFactor = mockNodes.find((n) => n.id === "node_budget");
    wrapper.vm.insertFactor(budgetFactor);

    expect(wrapper.vm.nodeToSubmit.symbolFormula).toContain("totalBudget");
    expect(wrapper.vm.nodeToSubmit.influencers).toContain("node_budget");
    expect(actions.addLink).toHaveBeenCalled();
  });

  it("detects syntax error and prevents submitForm", async () => {
    const { wrapper, actions } = mountNodeSummary();
    wrapper.vm.nodeToSubmit.symbolFormula = "volunteers + * 10";

    expect(wrapper.vm.formulaValidation.valid).toBe(false);

    wrapper.vm.submitForm();
    expect(actions.updateNode).not.toHaveBeenCalled();
  });

  it("identifies unlinked factors in formula", async () => {
    const { wrapper } = mountNodeSummary();
    // totalBudget is not an influencer of mealsServed initially
    wrapper.vm.nodeToSubmit.symbolFormula = "volunteers + totalBudget";

    expect(wrapper.vm.formulaValidation.valid).toBe(true);
    expect(wrapper.vm.formulaValidation.unlinkedSymbols.length).toBe(1);
    expect(wrapper.vm.formulaValidation.unlinkedSymbols[0].symbol).toBe("totalBudget");
  });

  it("renders in English with zero Chinese characters", () => {
    const { wrapper } = mountNodeSummary("node_meals", "en-us");
    const html = wrapper.html();
    const chineseRegex = /[\u4e00-\u9fff]/;
    expect(chineseRegex.test(html)).toBe(false);
  });
});
