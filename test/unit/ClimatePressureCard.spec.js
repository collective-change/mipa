import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import ClimatePressureCard from "@/components/Actions/ClimatePressureCard.vue";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

describe("ClimatePressureCard.vue component (MIPA-30)", () => {
  const defaultMocks = {
    $t: (msg) => msg
  };

  function mountCard(props = {}) {
    return mount(ClimatePressureCard, {
      props,
      global: {
        plugins: [[Quasar, { components }]],
        mocks: defaultMocks
      }
    });
  }

  it("renders attach button when modelValue is null", () => {
    const wrapper = mountCard({ modelValue: null });
    expect(wrapper.text()).toContain("climatePressure");
    expect(wrapper.text()).toContain("attachClimatePressure");
  });

  it("renders active factor details and provenance when modelValue is provided", () => {
    const modelValue = {
      factorId: "elec-grid-tw-2023",
      factorName: "Electricity Grid Mix (Taiwan)",
      activityQuantity: 10000,
      activityUnit: "kWh",
      pressureValue: 4.95,
      pressureUnit: "tCO2e",
      scope: 2,
      authority: "Bureau of Energy, MOEA & IPCC AR6",
      citationUrl: "https://www.moeaea.gov.tw",
      licence: "Open Government Data Licence v1.0",
      version: "AR6-2023v1",
      geography: "TW"
    };

    const wrapper = mountCard({ modelValue });

    const text = wrapper.text();
    expect(text).toContain("4.95 tCO2e (Scope 2)");
    expect(text).toContain("Bureau of Energy, MOEA & IPCC AR6");
    expect(text).toContain("Open Government Data Licence v1.0");
    expect(text).toContain("https://www.moeaea.gov.tw");
  });

  it("displays unit mismatch notice when user enters incompatible activity unit (criterion d)", async () => {
    const wrapper = mountCard({ modelValue: null });

    await wrapper.vm.startAttaching();
    wrapper.vm.selectedFactorId = "elec-grid-tw-2023"; // Expected unit is kWh
    wrapper.vm.quantity = 500;
    wrapper.vm.activityUnit = "litres"; // Mismatched unit!

    await wrapper.vm.recalculate();

    expect(wrapper.vm.unitMismatch).toBe(true);
    expect(wrapper.vm.unitMismatchMessage).toContain("Expected: 'kWh'");
    expect(wrapper.vm.unitMismatchMessage).toContain("got: 'litres'");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("calculates accurate pressure and emits update:modelValue when valid", async () => {
    const wrapper = mountCard({ modelValue: null });

    await wrapper.vm.startAttaching();
    wrapper.vm.selectedFactorId = "elec-grid-tw-2023";
    wrapper.vm.activityUnit = "kWh";
    wrapper.vm.quantity = 10000;

    await wrapper.vm.recalculate();

    expect(wrapper.vm.unitMismatch).toBe(false);
    expect(wrapper.emitted("update:modelValue")).toBeDefined();
    const emitted = wrapper.emitted("update:modelValue")[0][0];
    expect(emitted.pressureValue).toBe(4.95);
    expect(emitted.pressureUnit).toBe("tCO2e");
    expect(emitted.scope).toBe(2);
    expect(emitted.authority).toBe("Bureau of Energy, MOEA & IPCC AR6");
  });

  it("emits null when onRemove is called", async () => {
    const modelValue = {
      factorId: "elec-grid-tw-2023",
      pressureValue: 4.95
    };
    const wrapper = mountCard({ modelValue });

    await wrapper.vm.onRemove();
    expect(wrapper.emitted("update:modelValue")).toBeDefined();
    expect(wrapper.emitted("update:modelValue")[0][0]).toBeNull();
  });
});
