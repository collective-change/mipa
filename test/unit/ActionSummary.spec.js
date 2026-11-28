import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createPinia, setActivePinia } from "pinia";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import ActionSummary from "@/components/Actions/ActionSummary.vue";
import { useOrgsStore } from "@/store/store-orgs";
import { useUiStore } from "@/store/store-ui";
import { useModelStore } from "@/store/store-model";
import { useCalcResultsStore } from "@/store/store-calcResults";
import { useActionsStore } from "@/store/store-actions";
import { useUiActionStore } from "@/store/store-uiAction";

vi.mock("@/api/idb", () => ({
  default: {
    getSaveResultsOnDeviceForAction: vi.fn().mockResolvedValue(false),
    setSaveResultsOnDeviceForAction: vi.fn().mockResolvedValue(undefined),
    getResultsOfAction: vi.fn().mockResolvedValue(null)
  }
}));

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

function mountActionSummary(actionOverrides = {}, locale = "en-us") {
  const initialAction = {
    id: "action-1",
    title: "Solar Panel Installation",
    actionMchState: { value: "initiating" },
    actionLeverage: 15.5,
    totalRoi: 4.2,
    estEffortHrs: 100,
    effortCompletionPercentage: 40,
    estSpending: 50000,
    spentAmount: 20000,
    dueDate: "2026-12-31",
    effortCostPerHrType: "use_average",
    impacts: [],
    ...actionOverrides
  };

  const store = createPinia();
  setActivePinia(store);
  useOrgsStore(store).$patch({
    currentOrg: { id: "org-1", name: "Clean Energy Org", nameSlug: "clean-energy", currency: "USD" }
  });
  useUiStore(store).$patch({ selectedActionId: "action-1" });
  const model = useModelStore(store);
  model.$patch({
    currentModel: { id: "model-1", roleNodes: { averageEffortCostPerHour: "node-cost" } },
    nodes: [
      { id: "node-cost", name: "Average Hourly Cost", unit: "USD", symbolFormula: "30", isHourlyCost: true }
    ]
  });
  model.bindCurrentModel = vi.fn();
  model.bindNodes = vi.fn();
  const calcResults = useCalcResultsStore(store);
  calcResults.$patch({
    resultsOfAction: {},
    baseline: { nodesValues: { "node-cost": [30] } }
  });
  // The old Vuex mock store had no such actions, so these were no-ops.
  calcResults.loadResultsOfAction = vi.fn();
  const actions = useActionsStore(store);
  actions.$patch({ matchingActions: [] });
  actions.updateAction = vi.fn();
  const uiActionStore = useUiActionStore(store);
  uiActionStore.$patch({
    uiAction: { ...initialAction },
    uiActionChanged: false,
    uiActionChangedFields: []
  });
  uiActionStore.addNodeIdsToChart = vi.fn();
  uiActionStore.setNodeIdsToChart = vi.fn();

  const wrapper = mount(ActionSummary, {
    props: {
      action: initialAction
    },
    global: {
      plugins: [
        [Quasar, { components, directives: { ClosePopup: All.ClosePopup } }],
        store,
        createI18n({ legacy: true, locale, messages })
      ],
      mocks: {
        $route: { params: { actionId: "action-1", orgId: "org-1" } }
      },
      stubs: {
        "calculator-ui": true,
        "export-calc-results": true,
        impacts: true,
        "action-relationships": true,
        simpleCostsAndImpacts: true,
        "q-chart": true,
        "actions-chart": true,
        chat: true,
        "select-user": true,
        "explain-ranking-modal": true,
        "decision-brief-modal": true,
        "sroi-impact-map-modal": true
      }
    }
  });

  return { wrapper, store };
}

describe("ActionSummary.vue - Consolidated Progress & Actuals Tracker", () => {
  it("renders the Progress & Actuals tracker card with dual progress indicators", () => {
    const { wrapper } = mountActionSummary();
    expect(wrapper.text()).toContain("Execution Progress & Actuals");
    expect(wrapper.text()).toContain("Work hours completed");
    expect(wrapper.text()).toContain("Budget spent");
  });

  it("calculates work hours completion progress accurately", () => {
    const { wrapper } = mountActionSummary({
      estEffortHrs: 80,
      effortCompletionPercentage: 50
    });
    // 80 hrs * 50% = 40 hrs completed
    expect(wrapper.vm.completedWorkHours).toBe(40);
    expect(wrapper.vm.hoursProgressRatio).toBe(0.5);
    expect(wrapper.vm.progressChipColor).toBe("primary");
  });

  it("calculates spending ratio and displays remaining budget when under budget", () => {
    const { wrapper } = mountActionSummary({
      estSpending: 10000,
      spentAmount: 6000
    });
    expect(wrapper.vm.spendingProgressRatio).toBe(0.6);
    expect(wrapper.vm.isOverBudget).toBe(false);
    expect(wrapper.vm.budgetVarianceColor).toBe("positive");
    expect(wrapper.vm.budgetVarianceText).toContain("Remaining budget");
    expect(wrapper.vm.budgetVarianceText).toContain("4K");
  });

  it("detects budget overrun and highlights in warning/negative styling", () => {
    const { wrapper } = mountActionSummary({
      estSpending: 10000,
      spentAmount: 13500
    });
    expect(wrapper.vm.spendingProgressRatio).toBe(1.35);
    expect(wrapper.vm.isOverBudget).toBe(true);
    expect(wrapper.vm.budgetVarianceColor).toBe("negative");
    expect(wrapper.vm.budgetVarianceText).toContain("Budget exceeded");
    expect(wrapper.vm.budgetVarianceText).toContain("3.5K");
  });

  it("provides milestone target completion date input", () => {
    const { wrapper } = mountActionSummary({
      dueDate: "2026-11-30"
    });
    expect(wrapper.vm.dueDate).toBe("2026-11-30");
  });

  it("renders the SROI analysis card and computes ratio from inputs", () => {
    const { wrapper } = mountActionSummary({
      marginalWorldBenefitNpv: 200000,
      marginalWorldCostNpv: 10000,
      outstandingDirectCosts: 50000,
      deadweight: 10,
      attribution: 10,
      displacement: 0
    });
    expect(wrapper.text()).toContain("Social Return on Investment (SROI)");
    expect(wrapper.text()).toContain("Gross Present Social Benefit");
    expect(wrapper.vm.actionSroiMetrics.sroiRatio).toBeDefined();
    // 200k * 0.9 * 0.9 = 162k - 10k = 152k / 50k = 3.04
    expect(wrapper.vm.actionSroiMetrics.sroiRatio).toBeCloseTo(3.04, 1);
  });

  it("renders in English with zero Chinese characters", () => {
    const { wrapper } = mountActionSummary({}, "en-us");
    const html = wrapper.html();
    const chineseRegex = /[\u4e00-\u9fff]/;
    expect(chineseRegex.test(html)).toBe(false);
  });

  it("renders the Climate Pressure card and manages climatePressure field (MIPA-30)", () => {
    const { wrapper } = mountActionSummary({
      climatePressure: {
        activityQuantity: 10000,
        activityUnit: "kWh",
        pressureValue: 4.95,
        pressureUnit: "tCO2e",
        scope: 2,
        authority: "Bureau of Energy, MOEA & IPCC AR6"
      }
    });

    expect(wrapper.text()).toContain("Climate Pressure");
    expect(wrapper.vm.climatePressure).toBeDefined();
    expect(wrapper.vm.climatePressure.pressureValue).toBe(4.95);
  });

  it("manages effort cost choice and hourly cost calculation for factor, custom, and average types", () => {
    const { wrapper } = mountActionSummary({
      effortCostPerHrType: "use_average"
    });

    expect(wrapper.vm.effortCostChoice).toBe("use_average");
    expect(wrapper.vm.effortCostPerHourInUse).toBe(30);

    wrapper.vm.effortCostChoice = "use_custom";
    wrapper.vm.customEffortCostPerHr = 75;
    expect(wrapper.vm.effortCostPerHrType).toBe("use_custom");
    expect(wrapper.vm.effortCostPerHourInUse).toBe(75);

    wrapper.vm.effortCostChoice = "factor:node-cost";
    expect(wrapper.vm.effortCostPerHrType).toBe("use_factor");
    expect(wrapper.vm.effortCostNodeId).toBe("node-cost");
    expect(wrapper.vm.effortCostChoice).toBe("factor:node-cost");
    expect(wrapper.vm.effortCostPerHourInUse).toBe(30);
  });

  it("computes progressChipColor across 0%, partial, and 100% completion", () => {
    const { wrapper } = mountActionSummary({ effortCompletionPercentage: 0 });
    expect(wrapper.vm.progressChipColor).toBe("grey-6");

    const { wrapper: wrapperPartial } = mountActionSummary({ effortCompletionPercentage: 50 });
    expect(wrapperPartial.vm.progressChipColor).toBe("primary");

    const { wrapper: wrapperFull } = mountActionSummary({ effortCompletionPercentage: 100 });
    expect(wrapperFull.vm.progressChipColor).toBe("positive");
  });

  it("handles departmentOptions and availableSdgOptions", () => {
    const { wrapper } = mountActionSummary();
    expect(wrapper.vm.departmentOptions.length).toBeGreaterThan(0);
    expect(wrapper.vm.availableSdgOptions.length).toBeGreaterThan(0);
  });

  it("handles SROI adjustments and counterfactual updates", () => {
    const { wrapper, store } = mountActionSummary();
    const actionsStore = useActionsStore(store);

    wrapper.vm.onSroiAdjustmentsUpdated({
      deadweight: 15,
      attribution: 20,
      displacement: 5
    });
    expect(wrapper.vm.deadweight).toBe(15);
    expect(wrapper.vm.attribution).toBe(20);
    expect(wrapper.vm.displacement).toBe(5);

    wrapper.vm.onSaveCounterfactual({ method: "control_group", notes: "tested" });
    expect(wrapper.vm.counterfactual).toEqual({ method: "control_group", notes: "tested" });
    expect(actionsStore.updateAction).toHaveBeenCalledWith({
      id: "action-1",
      updates: { counterfactual: { method: "control_group", notes: "tested" } }
    });
  });

  it("submits action updates stripping derived properties", () => {
    const { wrapper, store } = mountActionSummary({
      actionLeverage: 10,
      totalRoi: 2.5
    });
    const actionsStore = useActionsStore(store);
    const uiActionStore = useUiActionStore(store);

    wrapper.vm.submitAction();
    expect(actionsStore.updateAction).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "action-1",
        updates: expect.not.objectContaining({
          actionLeverage: expect.anything(),
          totalRoi: expect.anything()
        })
      })
    );
    expect(uiActionStore.uiActionChanged).toBe(false);
  });

  it("adds role cost factor via dialog method", async () => {
    const { wrapper, store } = mountActionSummary();
    const modelStore = useModelStore(store);
    modelStore.addHourlyCostFactor = vi.fn().mockResolvedValue("node-role-cost");

    wrapper.vm.openAddRoleCost();
    expect(wrapper.vm.showAddRoleCost).toBe(true);
    expect(wrapper.vm.newRoleCost).toEqual({ name: "", cost: null });

    wrapper.vm.newRoleCost = { name: "Senior Engineer", cost: 60 };
    await wrapper.vm.addRoleCost();

    expect(modelStore.addHourlyCostFactor).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Senior Engineer",
        cost: 60
      })
    );
    expect(wrapper.vm.effortCostChoice).toBe("factor:node-role-cost");
    expect(wrapper.vm.showAddRoleCost).toBe(false);
  });

  it("handles unmounted cleanup and setSaveResultsOnDeviceForAction", async () => {
    const idb = (await import("@/api/idb")).default;
    const { wrapper } = mountActionSummary();

    wrapper.vm.setSaveResultsOnDeviceForAction("action-1", true);
    expect(idb.setSaveResultsOnDeviceForAction).toHaveBeenCalledWith("action-1", true);

    wrapper.unmount();
  });
});
