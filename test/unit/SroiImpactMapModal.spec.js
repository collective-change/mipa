import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createStore } from "vuex";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import SroiImpactMapModal from "@/components/Actions/Modals/SroiImpactMapModal.vue";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

const sampleAction = {
  id: "act_water",
  title: "Community Well Installation",
  marginalWorldBenefitNpv: 300000,
  marginalWorldCostNpv: 10000,
  outstandingDirectCosts: 50000,
  deadweight: 10,
  attribution: 15,
  displacement: 5,
  impacts: [
    {
      id: "imp_1",
      nodeId: "node_water",
      operand: 10000,
      operation: "+"
    }
  ]
};

const sampleNodes = [
  { id: "node_water", name: "Clean Water Output", unit: "gallons" }
];

function createTestWrapper(locale = "en-us") {
  const store = createStore({
    modules: {
      orgs: {
        namespaced: true,
        state: () => ({ currentOrg: { id: "org1", name: "Water For All", currency: "USD" } })
      },
      model: {
        namespaced: true,
        state: () => ({ nodes: sampleNodes })
      }
    }
  });

  const i18n = createI18n({
    legacy: false,
    locale,
    messages
  });

  const wrapper = mount(SroiImpactMapModal, {
    props: {
      modelValue: true,
      action: sampleAction
    },
    global: {
      plugins: [[Quasar, { components }], store, i18n],
      directives: {
        ClosePopup: {}
      },
      stubs: {
        QDialog: { template: "<div class='q-dialog-stub'><slot /></div>" }
      },
      mocks: {
        $q: { notify: vi.fn() }
      }
    }
  });

  return { wrapper };
}

describe("SroiImpactMapModal.vue", () => {
  it("renders with SROI ratio and financial summary", () => {
    const { wrapper } = createTestWrapper();
    expect(wrapper.exists()).toBe(true);

    // dw: 10%, attr: 15%, disp: 5% -> 0.9 * 0.85 * 0.95 = 0.72675
    // gross: 300,000 -> adj: 218,025 -> net: 208,025 -> ratio: 208,025 / 50,000 = 4.16:1
    expect(wrapper.vm.sroiMetrics.sroiRatio).toBeCloseTo(4.16, 1);
    expect(wrapper.text()).toContain("4.16:1");
    expect(wrapper.text()).toContain("Community Well Installation");
  });

  it("updates live metrics when sliders change", async () => {
    const { wrapper } = createTestWrapper();
    wrapper.vm.localDeadweight = 30;
    wrapper.vm.onDeductionsChanged();

    expect(wrapper.emitted().updateAdjustments).toBeTruthy();
    expect(wrapper.emitted().updateAdjustments[0][0].deadweight).toBe(30);

    // dw: 30%, attr: 15%, disp: 5% -> 0.7 * 0.85 * 0.95 = 0.56525
    // gross: 300,000 -> adj: 169,575 -> net: 159,575 -> ratio: 159,575 / 50,000 = 3.19:1
    expect(wrapper.vm.sroiMetrics.sroiRatio).toBeCloseTo(3.19, 1);
  });

  it("renders SROI Impact Map table with mapped factor", () => {
    const { wrapper } = createTestWrapper();
    expect(wrapper.vm.impactMapRows).toHaveLength(1);
    expect(wrapper.vm.impactMapRows[0].factorName).toBe("Clean Water Output");
    expect(wrapper.text()).toContain("Clean Water Output");
  });

  it("renders in English with zero Chinese characters", () => {
    const { wrapper } = createTestWrapper("en-us");
    const html = wrapper.html();
    const chineseRegex = /[\u4e00-\u9fff]/;
    expect(chineseRegex.test(html)).toBe(false);
  });
});
