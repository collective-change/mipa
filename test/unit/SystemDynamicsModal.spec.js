import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import SystemDynamicsModal from "../../src/components/Model/Modals/SystemDynamicsModal.vue";
import { createI18n } from "vue-i18n";
import messages from "../../src/i18n";
import enUs from "../../src/i18n/en-us";

describe("SystemDynamicsModal.vue", () => {
  let i18n;

  beforeEach(() => {
    i18n = createI18n({
      legacy: true,
      locale: "en-us",
      messages: {
        "en-us": enUs
      }
    });
  });

  const stubComponents = {
    "q-dialog": { template: "<div><slot /></div>" },
    "q-card": { template: "<div><slot /></div>" },
    "q-card-section": { template: "<div><slot /></div>" },
    "q-tabs": { template: "<div><slot /></div>" },
    "q-tab": { props: ["label"], template: "<div>{{ label }}<slot /></div>" },
    "q-btn": { template: "<button><slot /></button>" },
    "q-icon": { template: "<i></i>" },
    "q-chip": { template: "<span><slot /></span>" },
    "q-badge": { template: "<span><slot /></span>" },
    "q-table": { template: "<div><slot /></div>" },
    "q-td": { template: "<div><slot /></div>" }
  };

  it("renders header and tabs properly with English strings", () => {
    const wrapper = mount(SystemDynamicsModal, {
      props: {
        modelValue: true,
        model: { id: "m1", name: "Relief Operations" },
        nodes: [
          { id: "n1", symbol: "reserves", name: "Cash Reserves", formula: "100" }
        ]
      },
      global: {
        plugins: [i18n],
        stubs: stubComponents
      }
    });

    expect(wrapper.text()).toContain(enUs.systemDynamicsModalTitle);
    expect(wrapper.text()).toContain(enUs.feedbackLoopsTab);
    expect(wrapper.text()).toContain(enUs.systemArchetypesTab);
    expect(wrapper.text()).toContain(enUs.meadowsHierarchyTab);
  });

  it("identifies reinforcing loops and renders them on the loops tab", () => {
    const cyclingNodes = [
      { id: "a", symbol: "trust", name: "Public Trust", formula: "impact * 2", influencers: ["b"] },
      { id: "b", symbol: "impact", name: "Community Impact", formula: "trust * 1.5", influencers: ["a"] }
    ];

    const wrapper = mount(SystemDynamicsModal, {
      props: {
        modelValue: true,
        model: { id: "m1", name: "Trust Model" },
        nodes: cyclingNodes
      },
      global: {
        plugins: [i18n],
        stubs: stubComponents
      }
    });

    expect(wrapper.vm.reinforcingLoops.length).toBe(1);
    expect(wrapper.vm.reinforcingLoops[0].code).toBe("R1");
    expect(wrapper.text()).toContain("R1 (Reinforcing Loop)");
  });

  it("switches to meadows tab and displays the 12 leverage points", async () => {
    const wrapper = mount(SystemDynamicsModal, {
      props: {
        modelValue: true,
        model: { id: "m1", name: "Policy Model" },
        nodes: []
      },
      global: {
        plugins: [i18n],
        stubs: stubComponents
      }
    });

    await wrapper.setData({ activeTab: "meadows" });
    expect(wrapper.vm.meadowsLevels).toHaveLength(12);
    expect(wrapper.text()).toContain("Donella Meadows");
  });

  it("displays Shifting the Burden details and explicit missing-loop guidance when incomplete", async () => {
    const partialShiftingNodes = [
      { id: "symp", symbol: "backlog", name: "Service Backlog", formula: "max(0, 50 - quickFix - fundCap)", influencers: ["quickFix", "fundCap"] },
      { id: "quickFix", symbol: "quickFix", name: "Emergency Temp Dispatch", formula: "backlog * 0.6", influencers: ["symp"] },
      { id: "fundCap", symbol: "fundCap", name: "Volunteer Captain Capacity", formula: "delay(fundCap, dt, 10) + backlog * 0.4", influencers: ["symp"] }
    ];

    const wrapper = mount(SystemDynamicsModal, {
      props: {
        modelValue: true,
        model: { id: "m1", name: "Community Food Pantry" },
        nodes: partialShiftingNodes
      },
      global: {
        plugins: [i18n],
        stubs: stubComponents
      }
    });

    await wrapper.setData({ activeTab: "archetypes" });
    const text = wrapper.text();
    expect(text).toContain("Shifting the Burden");
    expect(text).toContain(enUs.archetypeStatusPartial);
    expect(text).toContain(enUs.archetypeLooksLikeLabel);
    expect(text).toContain(enUs.archetypeImpliesLabel);
    expect(text).toContain(enUs.archetypeMissingLoopLabel);
    expect(wrapper.get("[data-testid='archetype-missing-loop']").text()).toContain("reinforcing side-effect loop");
  });

  it("renders archetype diagnostics cleanly across all five locales with zero English leaking", async () => {
    const completeShiftingNodes = [
      { id: "symp", symbol: "backlog", name: "Backlog", formula: "max(0, 50 - quickFix - fundCap)", influencers: ["quickFix", "fundCap"] },
      { id: "quickFix", symbol: "quickFix", name: "Quick Fix", formula: "backlog * 0.6", influencers: ["symp"] },
      { id: "fundCap", symbol: "fundCap", name: "Fundamental Cap", formula: "delay(fundCap, dt, 10) + backlog * 0.4 - quickFix * 0.5", influencers: ["symp", "quickFix"] }
    ];

    const expectations = {
      "en-us": { name: "Shifting the Burden", status: "Complete pattern" },
      "zh-tw": { name: "捨本逐末", status: "完整基模" },
      "zh-cn": { name: "舍本逐末", status: "完整基模" },
      es: { name: "Desplazamiento de la Carga", status: "Patrón completo" },
      ja: { name: "問題のすり替え", status: "完全な構造" }
    };

    for (const [locale, expected] of Object.entries(expectations)) {
      const locI18n = createI18n({ legacy: true, locale, messages });
      const wrapper = mount(SystemDynamicsModal, {
        props: {
          modelValue: true,
          model: { id: "m1", name: "Model" },
          nodes: completeShiftingNodes
        },
        global: {
          plugins: [locI18n],
          stubs: stubComponents
        }
      });

      await wrapper.setData({ activeTab: "archetypes" });
      const text = wrapper.text();
      expect(text).toContain(expected.name);
      expect(text).toContain(expected.status);
      if (locale !== "en-us") {
        expect(text).not.toContain("Shifting the Burden");
        expect(text).not.toContain("What it looks like");
      }
    }
  });
});
