import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createStore } from "vuex";
import { createI18n } from "vue-i18n";
import { getField, updateField } from "vuex-map-fields";
import messages from "@/i18n";
import ActionSummary from "@/components/Actions/ActionSummary.vue";

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

  const store = createStore({
    modules: {
      orgs: {
        namespaced: true,
        state: {
          currentOrg: { id: "org-1", name: "Clean Energy Org", nameSlug: "clean-energy", currency: "USD" }
        }
      },
      ui: {
        namespaced: true,
        state: {
          selectedActionId: "action-1"
        }
      },
      model: {
        namespaced: true,
        state: {
          currentModel: { id: "model-1", roleNodes: { averageEffortCostPerHour: "node-cost" } },
          nodes: [
            { id: "node-cost", name: "Average Hourly Cost", unit: "USD", symbolFormula: "30", isHourlyCost: true }
          ]
        },
        getters: {
          nodes: () => [
            { id: "node-cost", name: "Average Hourly Cost", unit: "USD", symbolFormula: "30", isHourlyCost: true }
          ]
        },
        actions: {
          bindCurrentModel: vi.fn(),
          bindNodes: vi.fn()
        }
      },
      calcResults: {
        namespaced: true,
        state: {
          resultsOfAction: {},
          baseline: { nodesValues: { "node-cost": [30] } }
        }
      },
      actions: {
        namespaced: true,
        state: {
          matchingActions: []
        },
        actions: {
          updateAction: vi.fn()
        }
      },
      uiAction: {
        namespaced: true,
        state: {
          uiAction: { ...initialAction },
          uiActionChanged: false,
          uiActionChangedFields: []
        },
        getters: {
          getField
        },
        mutations: {
          updateField,
          updateUiActionField: updateField,
          setActionMchState(state, val) {
            state.uiAction.actionMchState = val;
          },
          mergeNewActionToUiAction(state, newAction) {
            Object.assign(state.uiAction, newAction);
          },
          setUiAction(state, newAction) {
            state.uiAction = newAction ? { ...newAction } : {};
          }
        },
        actions: {
          setUiAction({ commit }, act) {
            commit("setUiAction", act);
          }
        }
      }
    }
  });

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
});
