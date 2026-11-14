import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import SystemDynamicsModal from "../../src/components/Model/Modals/SystemDynamicsModal.vue";
import { createI18n } from "vue-i18n";
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
});
