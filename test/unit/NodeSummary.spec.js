import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createPinia, setActivePinia } from "pinia";
import { useModelStore } from "@/store/store-model";
import { useUiStore } from "@/store/store-ui";
import { useCalcResultsStore } from "@/store/store-calcResults";
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

  const store = createPinia();
  setActivePinia(store);
  const model = useModelStore(store);
  model.$patch({
    currentModel: { id: "test-model-1", roleNodes: {} },
    nodes: currentMockNodes
  });
  Object.assign(model, actions);
  const ui = useUiStore(store);
  ui.$patch({
    selectedNodeId: selectedId,
    uiNodeChanged: false,
    uiNodeChangedFields: []
  });
  Object.assign(ui, uiActions, {
    setUiNodeChanged: vi.fn(),
    addUiNodeChangedFields: vi.fn()
  });
  useCalcResultsStore(store).$patch({
    baseline: { timeSPoints: [], nodesValues: {} }
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

  it("exposes data provenance, accounting categories, and freshness evaluation", () => {
    const { wrapper } = mountNodeSummary("node_meals", "en-us");
    expect(wrapper.vm.accountingCategoryOptions.length).toBeGreaterThan(0);
    expect(wrapper.vm.factorFreshness).toBeDefined();
    expect(wrapper.vm.factorFreshness.status).toBeDefined();

    // Verify updating provenance fields
    wrapper.vm.nodeToSubmit.costCategory = "direct_program";
    wrapper.vm.nodeToSubmit.reportingPeriod = "FY2025";
    wrapper.vm.nodeToSubmit.effectiveDate = "2025-12-31";
    wrapper.vm.nodeToSubmit.sourceCitation = "2025 Annual Financial Report";

    expect(wrapper.vm.nodeToSubmit.costCategory).toBe("direct_program");
    expect(wrapper.vm.nodeToSubmit.sourceCitation).toBe("2025 Annual Financial Report");
  });

  it("resolves bare factor short names into $<nodeId> on typing and save (MIPA-8)", async () => {
    const { wrapper } = mountNodeSummary("node_volunteers");
    // node_volunteers has symbol "volunteers" and no initial influencers
    // User types formula referencing "totalBudget" (matching node_budget)
    wrapper.vm.nodeToSubmit.symbolFormula = "totalBudget * 0.1";
    await wrapper.vm.$nextTick();

    // Watched recalculation resolves sysFormula to $<nodeId>
    expect(wrapper.vm.nodeToSubmit.sysFormula).toBe("$node_budget * 0.1");
  });

  it("auto-links referenced factors as inputs on save so manual linking is not required (MIPA-8)", async () => {
    const { wrapper, actions } = mountNodeSummary("node_volunteers");
    wrapper.vm.nodeToSubmit.symbolFormula = "totalBudget * 0.1";
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.nodeToSubmit.influencers).not.toContain("node_budget");

    wrapper.vm.submitNode();

    // 1. Auto-links node_budget into influencers
    expect(wrapper.vm.nodeToSubmit.influencers).toContain("node_budget");
    // 2. Dispatches addLink for the auto-linked factor
    expect(actions.addLink).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "test-model-1",
        link: expect.objectContaining({
          sourceNodeId: "node_volunteers",
          targetNodeId: "node_budget",
          targetType: "influencer"
        })
      })
    );
    // 3. updateNode receives sysFormula with $<nodeId>
    expect(actions.updateNode).toHaveBeenCalledWith(
      expect.objectContaining({
        updates: expect.objectContaining({
          sysFormula: "$node_budget * 0.1",
          influencers: expect.arrayContaining(["node_budget"])
        })
      })
    );
  });

  describe("Formula validation and $ factor references (MIPA-25)", () => {
    it("allows $ in formula characters and reports offending characters by name", () => {
      const { wrapper } = mountNodeSummary("node_meals", "en-us");

      // Valid formula with $
      expect(wrapper.vm.isAllowedInFormula("$node_volunteers * 2")).toBe(true);
      expect(wrapper.vm.validateFormulaCharacters("$node_volunteers * 2")).toBe(true);

      // Invalid character: names the offending character in error message
      expect(wrapper.vm.isAllowedInFormula("volunteers @ 2")).toBe(false);
      const errSingle = wrapper.vm.validateFormulaCharacters("volunteers @ 2");
      expect(errSingle).toContain("@");
      expect(errSingle).toBe("This character can't be used in a formula: @");

      // Multiple invalid characters: lists all of them
      const errMulti = wrapper.vm.validateFormulaCharacters("volunteers # 2 & 5");
      expect(errMulti).toContain("#, &");
      expect(errMulti).toBe("This character can't be used in a formula: #, &");
    });

    it("names offending character in Traditional Chinese locale", () => {
      const { wrapper } = mountNodeSummary("node_meals", "zh-tw");
      const err = wrapper.vm.validateFormulaCharacters("volunteers @ 2");
      expect(err).toBe("公式中不能使用這個字元：@");
    });

    it("can open, edit and re-save a formula containing $ without losing meaning", async () => {
      const { wrapper, actions } = mountNodeSummary("node_meals");
      // Node loaded with a formula containing $
      wrapper.vm.nodeToSubmit.symbolFormula = "$node_volunteers * 15";
      await wrapper.vm.$nextTick();

      // Passes character validation
      expect(wrapper.vm.validateFormulaCharacters(wrapper.vm.nodeToSubmit.symbolFormula)).toBe(true);
      // Passes syntax validation
      expect(wrapper.vm.formulaValidation.valid).toBe(true);

      // Submit node
      wrapper.vm.submitNode();

      expect(actions.updateNode).toHaveBeenCalledWith(
        expect.objectContaining({
          updates: expect.objectContaining({
            symbolFormula: "$node_volunteers * 15",
            sysFormula: "$node_volunteers * 15",
            influencers: expect.arrayContaining(["node_volunteers"])
          })
        })
      );
    });

    it("ensures validator and rankingSensitivity agree on $ factor references", () => {
      const { wrapper } = mountNodeSummary("node_budget");
      // node_budget has formula: "10000" (constant numeric value factor, no influencers)
      wrapper.vm.nodeToSubmit.influencers = [];
      wrapper.vm.nodeToSubmit.symbolFormula = "10000";
      // Constant value factor has sensitivity analysis
      expect(wrapper.vm.nodeToSubmit.symbolFormula.includes("$")).toBe(false);

      // When formula contains $, it references a factor and is NOT a constant value factor
      wrapper.vm.nodeToSubmit.symbolFormula = "$node_volunteers * 2";
      expect(wrapper.vm.rankingSensitivity).toBeNull();
      // But the formula validator accepts it as valid
      expect(wrapper.vm.validateFormulaCharacters(wrapper.vm.nodeToSubmit.symbolFormula)).toBe(true);
      expect(wrapper.vm.formulaValidation.valid).toBe(true);
    });

    it("displays advisory delay warning for delay(..., best_guess) without blocking save (MIPA-32)", async () => {
      const { wrapper, actions } = mountNodeSummary("node_meals");
      // node_volunteers currently has no latestValue and no series
      wrapper.vm.nodeToSubmit.symbolFormula = "delay(volunteers, dt, best_guess)";
      await wrapper.vm.$nextTick();

      // No unrecognized symbols warning
      expect(wrapper.vm.formulaValidation.unknownSymbols).toEqual([]);
      // Advisory warning is present
      expect(wrapper.vm.formulaValidation.delayWarnings.length).toBe(1);
      expect(wrapper.vm.formulaValidation.delayWarnings[0].type).toBe("no_fallback");
      expect(wrapper.vm.formulaValidation.delayWarnings[0].factorName).toBe("Active Volunteers");

      // Valid remains true (advisory, not a blocking gate)
      expect(wrapper.vm.formulaValidation.valid).toBe(true);
      expect(wrapper.text()).toContain('Factor "Active Volunteers" in delay(..., best_guess) has no current value');

      // Saving succeeds
      wrapper.vm.submitNode();
      expect(actions.updateNode).toHaveBeenCalled();
    });
  });
});
