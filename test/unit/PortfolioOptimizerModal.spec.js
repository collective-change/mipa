import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createStore } from "vuex";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import PortfolioOptimizerModal from "@/components/Actions/Modals/PortfolioOptimizerModal.vue";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

const mockActions = [
  {
    id: "act_1",
    title: "Leadership Initiative",
    marginalNetTotalBenefitNpv: 100000,
    outstandingDirectCosts: 10000,
    estEffortHrs: 50,
    departmentTag: "executive",
    actionLeverage: 10
  },
  {
    id: "act_2",
    title: "Field Deployment",
    marginalNetTotalBenefitNpv: 200000,
    outstandingDirectCosts: 20000,
    estEffortHrs: 120,
    departmentTag: "fieldwork",
    actionLeverage: 10
  }
];

function mountModal(props = {}, locale = "en-us") {
  const store = createStore({
    modules: {
      orgs: {
        namespaced: true,
        state: { currentOrg: { currency: "USD" } }
      }
    }
  });

  const wrapper = mount(PortfolioOptimizerModal, {
    props: {
      modelValue: true,
      actions: mockActions,
      ...props
    },
    global: {
      plugins: [
        [Quasar, { components }],
        store,
        createI18n({ legacy: true, locale, messages })
      ],
      stubs: {
        QDialog: {
          template: "<div class='q-dialog-stub'><slot /></div>"
        }
      }
    }
  });

  return wrapper;
}

describe("PortfolioOptimizerModal.vue", () => {
  it("renders the modal header and resource constraints section", () => {
    const wrapper = mountModal();
    expect(wrapper.text()).toContain("Portfolio Resource & Capacity Optimizer");
    expect(wrapper.text()).toContain("Resource & Capacity Constraints");
  });

  it("calculates and displays recommended portfolio metrics", () => {
    const wrapper = mountModal();
    // With default constraints (100% capacity), both actions fit
    expect(wrapper.text()).toContain("Leadership Initiative");
    expect(wrapper.text()).toContain("Field Deployment");
    expect(wrapper.text()).toContain("300K"); // total benefit formatted with abbreviation
  });

  it("emits open-brief event with selected actions when clicking apply", async () => {
    const wrapper = mountModal();
    await wrapper.vm.applyToBrief();

    expect(wrapper.emitted("open-brief")).toBeTruthy();
    const emittedActions = wrapper.emitted("open-brief")[0][0];
    expect(emittedActions.length).toBe(2);
    expect(wrapper.emitted("update:modelValue")[0][0]).toBe(false);
  });

  it("renders with zero Chinese characters in English locale", () => {
    const wrapper = mountModal({}, "en-us");
    const text = wrapper.text();
    const chineseRegex = /[\u4e00-\u9fa5]/;
    expect(chineseRegex.test(text)).toBe(false);
  });

  it("renders correctly in Traditional Chinese locale", () => {
    const wrapper = mountModal({}, "zh-tw");
    const text = wrapper.text();
    expect(text).toContain("專案組合資源與容量最佳化");
    expect(text).toContain("資源與人力容量限制");
  });
});
