import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import CounterfactualCard from "@/components/Actions/CounterfactualCard.vue";
import enMessages from "@/i18n/en-us/index.js";
import zhTwMessages from "@/i18n/zh-tw/index.js";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

describe("CounterfactualCard.vue component (MIPA-40)", () => {
  function mountCard(action, locale = "en-us") {
    const dict = locale === "zh-tw" ? zhTwMessages : enMessages;
    return mount(CounterfactualCard, {
      props: { action },
      global: {
        plugins: [[Quasar, { components }]],
        mocks: {
          $t: (key) => dict[key] || key
        }
      }
    });
  }

  it("renders declared baseline state by default with clear explanation", () => {
    const action = {
      id: "act1",
      title: "Clinic Expansion",
      counterfactual: null
    };

    const wrapper = mountCard(action);
    expect(wrapper.text()).toContain("Declared Baseline");
    expect(wrapper.text()).toContain(
      "Counterfactual derived directly from baseline trajectory. Upgradable to measured where empirical comparison data exists."
    );
  });

  it("renders measured state with canonical statement, assumptions, limits and data table", () => {
    const action = {
      id: "act2",
      title: "Nutrition Program",
      counterfactual: {
        armType: "measured",
        method: "difference_in_differences",
        attributionDate: "2026-11-18",
        assumptions: "Parallel trends held in pre-treatment years across regional health centers",
        limits: "Cross-district patient mobility; small cluster count",
        series: [
          {
            date: "2026-01-01",
            value: 45.5,
            type: "measured",
            provenance: "District Survey",
            citation: "MOH-2026-01"
          }
        ]
      }
    };

    const wrapper = mountCard(action);
    const text = wrapper.text();

    expect(text).toContain("Measured");
    expect(text).toContain("Difference-in-Differences (DiD)");
    expect(text).toContain(
      "The counterfactual is observed, chosen by Difference-in-Differences (DiD), on 2026-11-18."
    );
    expect(text).toContain("Parallel trends held in pre-treatment years across regional health centers");
    expect(text).toContain("Cross-district patient mobility; small cluster count");
    expect(text).toContain("District Survey");
    expect(text).toContain("MOH-2026-01");
    expect(text).toContain("45.5");
  });

  it("allows switching to measured, adding a data point, and emits save", async () => {
    const action = {
      id: "act3",
      title: "Community Outreach",
      counterfactual: {
        armType: "declared"
      }
    };

    const wrapper = mountCard(action);
    await wrapper.vm.startEditing();
    expect(wrapper.vm.isEditing).toBe(true);

    wrapper.vm.editForm.armType = "measured";
    wrapper.vm.editForm.method = "matched_cohort";
    wrapper.vm.editForm.attributionDate = "2026-10-01";
    wrapper.vm.editForm.assumptions = "Propensity score matching on household income";
    wrapper.vm.editForm.limits = "Unobserved migrant worker population";

    wrapper.vm.addSeriesPoint();
    expect(wrapper.vm.editForm.series).toHaveLength(1);
    wrapper.vm.editForm.series[0].date = "2026-10-01";
    wrapper.vm.editForm.series[0].value = 88;
    wrapper.vm.editForm.series[0].citation = "NGO Survey 2026";

    wrapper.vm.saveChanges();
    expect(wrapper.vm.isEditing).toBe(false);

    const emitted = wrapper.emitted("save");
    expect(emitted).toBeDefined();
    expect(emitted[0][0]).toMatchObject({
      armType: "measured",
      method: "matched_cohort",
      attributionDate: "2026-10-01",
      assumptions: "Propensity score matching on household income",
      limits: "Unobserved migrant worker population"
    });
    expect(emitted[0][0].series[0].value).toBe(88);
  });

  it("renders in English with zero Chinese characters", () => {
    const action = {
      id: "act4",
      title: "Water Filtration",
      counterfactual: {
        armType: "measured",
        method: "synthetic_control",
        attributionDate: "2026-09-01",
        assumptions: "Synthetic donor pool convex hull covers pre-intervention period",
        limits: "Sparse donor pool size",
        series: [{ date: "2026-09-01", value: 12, type: "measured" }]
      }
    };

    const wrapper = mountCard(action, "en-us");
    const text = wrapper.text();
    const chineseChars = text.match(/[\u4e00-\u9fff]/g);
    expect(chineseChars).toBeNull();
  });

  it("renders in Traditional Chinese with elegant terminology", () => {
    const action = {
      id: "act5",
      title: "環保教育",
      counterfactual: {
        armType: "measured",
        method: "difference_in_differences",
        attributionDate: "2026-11-18",
        assumptions: "平行趨勢假設成立",
        limits: "外溢效應可能存在",
        series: [{ date: "2026-11-18", value: 30, type: "measured" }]
      }
    };

    const wrapper = mountCard(action, "zh-tw");
    const text = wrapper.text();
    expect(text).toContain("對照組與歸屬設計");
    expect(text).toContain("實測");
    expect(text).toContain("雙重差分法");
    expect(text).toContain("方法假設");
    expect(text).toContain("方法限制");
  });
});
