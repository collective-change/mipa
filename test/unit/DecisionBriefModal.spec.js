import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createStore } from "vuex";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import DecisionBriefModal from "@/components/Actions/Modals/DecisionBriefModal.vue";
import ExplainRankingModal from "@/components/Actions/Modals/ExplainRankingModal.vue";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

const sampleActions = [
  {
    id: "act-1",
    title: "Expand Volunteer Capacity",
    actionLeverage: 35.8,
    marginalNetTotalBenefitNpv: 95000,
    outstandingDirectCosts: 1000,
    estEffortHrs: 40,
    totalRoi: 18.5,
    impacts: []
  },
  {
    id: "act-2",
    title: "Food Surplus Partnership",
    actionLeverage: 14.2,
    marginalNetTotalBenefitNpv: 30000,
    outstandingDirectCosts: 2000,
    estEffortHrs: 60,
    totalRoi: 7.2,
    impacts: []
  }
];

function createMockStore() {
  return createStore({
    modules: {
      actions: {
        namespaced: true,
        state: {
          matchingActions: sampleActions
        }
      },
      orgs: {
        namespaced: true,
        state: {
          currentOrg: { id: "org-1", name: "Impact Network", currency: "USD" }
        }
      },
      model: {
        namespaced: true,
        state: {
          currentModel: { id: "mod-1", name: "Operations Model" },
          nodes: []
        },
        getters: {
          nodes: () => []
        }
      }
    }
  });
}

const mountOptions = (store, i18n) => ({
  global: {
    plugins: [[Quasar, { components }], store, i18n],
    directives: {
      "close-popup": () => {}
    },
    stubs: {
      "q-dialog": { template: "<div class='q-dialog-stub'><slot /></div>" }
    }
  }
});

describe("DecisionBriefModal.vue", () => {
  it("renders decision brief in English with 5 sections and zero Chinese characters", () => {
    const store = createMockStore();
    const i18n = createI18n({ legacy: true, locale: "en-us", messages });

    const wrapper = mount(DecisionBriefModal, {
      props: {
        modelValue: true,
        initialActions: sampleActions
      },
      ...mountOptions(store, i18n)
    });

    const text = wrapper.text();
    expect(text).toContain("Decision brief");
    expect(text).toContain("Expand Volunteer Capacity");
    expect(text).toContain("Food Surplus Partnership");
    expect(text).toContain("Verified against simulation results");

    // Strict constraint: no Chinese characters in English view
    expect(/[\u4e00-\u9fff]/.test(text)).toBe(false);
  });

  it("renders decision brief in Traditional Chinese with elegant phrasing and 效應比", () => {
    const store = createMockStore();
    const i18n = createI18n({ legacy: true, locale: "zh-tw", messages });

    const wrapper = mount(DecisionBriefModal, {
      props: {
        modelValue: true,
        initialActions: sampleActions
      },
      ...mountOptions(store, i18n)
    });

    const text = wrapper.text();
    expect(text).toContain("決策備忘錄");
    expect(text).toContain("效應比");
    expect(text).toContain("數值全數經模擬推演驗證無誤");
    expect(text).toContain("決策主旨與備選方案");
    expect(text).toContain("模擬推演綜合數據表");
  });
});

describe("ExplainRankingModal.vue", () => {
  it("renders comparative delta in English with zero Chinese characters", () => {
    const store = createMockStore();
    const i18n = createI18n({ legacy: true, locale: "en-us", messages });

    const wrapper = mount(ExplainRankingModal, {
      props: {
        modelValue: true,
        action: sampleActions[0]
      },
      ...mountOptions(store, i18n)
    });

    const text = wrapper.text();
    expect(text).toContain("Why is this action ranked here?");
    expect(text).toContain("Expand Volunteer Capacity");
    expect(/[\u4e00-\u9fff]/.test(text)).toBe(false);
  });

  it("renders comparative delta in Traditional Chinese with 效應比", () => {
    const store = createMockStore();
    const i18n = createI18n({ legacy: true, locale: "zh-tw", messages });

    const wrapper = mount(ExplainRankingModal, {
      props: {
        modelValue: true,
        action: sampleActions[0]
      },
      ...mountOptions(store, i18n)
    });

    const text = wrapper.text();
    expect(text).toContain("方案排序原因解析");
    expect(text).toContain("效應比");
    expect(text).toContain("製作決策備忘錄");
  });
});
