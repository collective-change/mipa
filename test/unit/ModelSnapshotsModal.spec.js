import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import ModelSnapshotsModal from "../../src/components/Model/Modals/ModelSnapshotsModal.vue";
import { createI18n } from "vue-i18n";
import enUs from "../../src/i18n/en-us";
import { createModelSnapshot, saveSnapshotToStorage } from "../../src/utils/modelSnapshots";

describe("ModelSnapshotsModal.vue", () => {
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

  it("renders the modal header and snapshot creation button", () => {
    const wrapper = mount(ModelSnapshotsModal, {
      props: {
        modelValue: true,
        model: { id: "test-model-1", name: "Strategic Logistics" },
        nodes: [
          { id: "n1", symbol: "A", name: "Factor A", formula: "100", initialValue: 100 }
        ]
      },
      global: {
        plugins: [i18n],
        stubs: {
          "q-dialog": { template: "<div><slot /></div>" },
          "q-card": { template: "<div><slot /></div>" },
          "q-card-section": { template: "<div><slot /></div>" },
          "q-card-actions": { template: "<div><slot /></div>" },
          "q-tabs": { template: "<div><slot /></div>" },
          "q-tab": { template: "<div><slot /></div>" },
          "q-btn": { template: "<button><slot /></button>" },
          "q-icon": { template: "<i></i>" },
          "q-chip": { template: "<span><slot /></span>" },
          "q-badge": { template: "<span><slot /></span>" },
          "q-separator": { template: "<hr />" },
          "q-tooltip": { template: "<span style='display:none'><slot /></span>" },
          "q-select": { template: "<select><slot /></select>" },
          "q-table": { template: "<table><slot /></table>" },
          "q-td": { template: "<td><slot /></td>" },
          "q-input": { template: "<input />" }
        }
      }
    });

    expect(wrapper.text()).toContain(enUs.modelSnapshotsModalTitle);
    expect(wrapper.text()).toContain(enUs.takeSnapshotBtn);
  });

  it("displays existing snapshots and lets user view diffs", () => {
    const model = { id: "test-model-diff", name: "Disaster Model" };
    const initialNodes = [
      { id: "n1", symbol: "VC", name: "Volunteer Capacity", formula: "50", initialValue: 50 }
    ];

    const snapshot = createModelSnapshot(model, initialNodes, {
      note: "Board Baseline Q1"
    });
    saveSnapshotToStorage(model.id, snapshot);

    const updatedNodes = [
      { id: "n1", symbol: "VC", name: "Volunteer Capacity", formula: "75", initialValue: 75 }
    ];

    const wrapper = mount(ModelSnapshotsModal, {
      props: {
        modelValue: true,
        model,
        nodes: updatedNodes
      },
      global: {
        plugins: [i18n],
        stubs: {
          "q-dialog": { template: "<div><slot /></div>" },
          "q-card": { template: "<div><slot /></div>" },
          "q-card-section": { template: "<div><slot /></div>" },
          "q-card-actions": { template: "<div><slot /></div>" },
          "q-tabs": { template: "<div><slot /></div>" },
          "q-tab": { template: "<div><slot /></div>" },
          "q-btn": { template: "<button><slot /></button>" },
          "q-icon": { template: "<i></i>" },
          "q-chip": { template: "<span><slot /></span>" },
          "q-badge": { template: "<span><slot /></span>" },
          "q-separator": { template: "<hr />" },
          "q-tooltip": { template: "<span style='display:none'><slot /></span>" },
          "q-select": { template: "<select><slot /></select>" },
          "q-table": { template: "<table><slot /></table>" },
          "q-td": { template: "<td><slot /></td>" },
          "q-input": { template: "<input />" }
        }
      }
    });

    expect(wrapper.text()).toContain("Board Baseline Q1");
    expect(wrapper.text()).toContain("SHA-256:");
  });

  it("renders in English with zero Chinese characters", () => {
    const wrapper = mount(ModelSnapshotsModal, {
      props: {
        modelValue: true,
        model: { id: "test-m", name: "English Model" },
        nodes: []
      },
      global: {
        plugins: [i18n],
        stubs: {
          "q-dialog": { template: "<div><slot /></div>" },
          "q-card": { template: "<div><slot /></div>" },
          "q-card-section": { template: "<div><slot /></div>" },
          "q-card-actions": { template: "<div><slot /></div>" },
          "q-tabs": { template: "<div><slot /></div>" },
          "q-tab": { template: "<div><slot /></div>" },
          "q-btn": { template: "<button><slot /></button>" },
          "q-icon": { template: "<i></i>" },
          "q-chip": { template: "<span><slot /></span>" },
          "q-badge": { template: "<span><slot /></span>" },
          "q-separator": { template: "<hr />" },
          "q-tooltip": { template: "<span style='display:none'><slot /></span>" },
          "q-select": { template: "<select><slot /></select>" },
          "q-table": { template: "<table><slot /></table>" },
          "q-td": { template: "<td><slot /></td>" },
          "q-input": { template: "<input />" }
        }
      }
    });

    const text = wrapper.text();
    const chineseChars = text.match(/[\u4e00-\u9fff]/g);
    expect(chineseChars).toBeNull();
  });
});
