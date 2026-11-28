import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createPinia, setActivePinia } from "pinia";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import FactorSeriesModal from "@/components/Model/Modals/FactorSeriesModal.vue";
import IngestDataDialog from "@/components/Model/Modals/IngestDataDialog.vue";
import { useAuthStore } from "@/store/store-auth";
import { useOrgsStore } from "@/store/store-orgs";
import { useModelStore } from "@/store/store-model";
import {
  parseTimeSeriesData,
  mergeTimeSeries,
  normalizeSeriesDate,
  SAMPLE_TIME_SERIES
} from "@/utils/dataIngestion";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

function createTestI18n(locale = "en-us") {
  return createI18n({
    legacy: false,
    locale,
    fallbackLocale: "en-us",
    messages
  });
}

function createTestStore(nodes = []) {
  const updateNodeMock = vi.fn().mockResolvedValue({});
  const addNodeMock = vi.fn().mockResolvedValue({ id: "new_id" });

  const store = createPinia();
  setActivePinia(store);
  useAuthStore(store).$patch({ user: { email: "tester@example.com" } });
  useOrgsStore(store).$patch({ currentOrg: { id: "org-1", currency: "USD" } });
  const model = useModelStore(store);
  model.$patch({ currentModel: { id: "model-1" }, nodes });
  model.updateNode = updateNodeMock;
  model.addNode = addNodeMock;

  return { store, updateNodeMock, addNodeMock };
}

describe("MIPA-20: Factor Time Series Ingestion & UI Governance", () => {
  describe("FactorSeriesModal Component", () => {
    it("renders empty state when factor has no time series", () => {
      const i18n = createTestI18n();
      const { store } = createTestStore();

      const wrapper = mount(FactorSeriesModal, {
        props: {
          modelValue: true,
          factor: { id: "f1", name: "Community Outreach", symbol: "outreach", unit: "people" }
        },
        global: {
          plugins: [Quasar, store, i18n],
          components,
          stubs: {
            "q-dialog": { template: "<div><slot /></div>" }
          }
        }
      });

      expect(wrapper.text()).toContain("Community Outreach");
      expect(wrapper.text()).toContain("No time series data attached");
      expect(wrapper.text()).toContain("Import Series");
    });

    it("displays existing series points and provenance summary", () => {
      const i18n = createTestI18n();
      const { store } = createTestStore();

      const sampleSeries = [
        { date: "2024-01-01", value: 120, isPredicted: false, sourceCitation: "Audit 2024" },
        { date: "2025-01-01", value: 150, isPredicted: false, sourceCitation: "Audit 2025" },
        { date: "2026-01-01", value: 190, isPredicted: true, sourceCitation: "Target 2026" }
      ];

      const wrapper = mount(FactorSeriesModal, {
        props: {
          modelValue: true,
          factor: {
            id: "f1",
            name: "Donation Volume",
            symbol: "donations",
            unit: "USD",
            timeSeries: sampleSeries,
            seriesProvenance: {
              sourceCitation: "Donor Management Ledger 2024-2026",
              startDate: "2024-01-01",
              endDate: "2026-01-01"
            }
          }
        },
        global: {
          plugins: [Quasar, store, i18n],
          components,
          stubs: {
            "q-dialog": { template: "<div><slot /></div>" }
          }
        }
      });

      expect(wrapper.text()).toContain("3 data points");
      expect(wrapper.text()).toContain("2 Historical");
      expect(wrapper.text()).toContain("1 Predicted / Forecast");
      expect(wrapper.text()).toContain("Donor Management Ledger");
      expect(wrapper.text()).toContain("2024-01-01 → 2026-01-01");
    });

    it("enforces non-silent overwrite guard with replace and merge choices", async () => {
      const i18n = createTestI18n();
      const { store } = createTestStore();

      const existingSeries = [
        { date: "2024-01-01", value: 100, isPredicted: false }
      ];

      const wrapper = mount(FactorSeriesModal, {
        props: {
          modelValue: true,
          factor: {
            id: "f1",
            name: "Sales",
            symbol: "sales",
            timeSeries: existingSeries,
            seriesProvenance: { sourceCitation: "Prior Year Audit" }
          }
        },
        global: {
          plugins: [Quasar, store, i18n],
          components,
          stubs: {
            "q-dialog": { template: "<div><slot /></div>" }
          }
        }
      });

      // Switch to import tab and paste new data
      wrapper.vm.activeTab = "import";
      await wrapper.vm.$nextTick();

      wrapper.vm.rawInput = `Date,Value,Type\n2024-01-01,105,historical\n2025-01-01,140,predicted`;
      await wrapper.vm.$nextTick();

      // Overwrite warning banner must be visible
      expect(wrapper.text()).toContain("Existing Time Series Detected");
      expect(wrapper.text()).toContain("This factor already has 1 data points from 'Prior Year Audit'");

      // Test Replace mode
      wrapper.vm.saveMode = "replace";
      wrapper.vm.commitSeries();
      expect(wrapper.emitted("save-series")).toBeTruthy();
      const emittedReplace = wrapper.emitted("save-series")[0][0];
      expect(emittedReplace.timeSeries.length).toBe(2);
      expect(emittedReplace.timeSeries[0].value).toBe(105);

      // Re-enter input to test Merge mode
      wrapper.vm.rawInput = `Date,Value,Type\n2024-01-01,105,historical\n2025-01-01,140,predicted`;
      await wrapper.vm.$nextTick();

      // Test Merge mode
      wrapper.vm.saveMode = "merge";
      wrapper.vm.commitSeries();
      const emittedMerge = wrapper.emitted("save-series")[1][0];
      expect(emittedMerge.timeSeries.length).toBe(2);
      expect(emittedMerge.seriesProvenance.pointCount).toBe(2);
      expect(emittedMerge.seriesProvenance.historicalCount).toBe(1);
      expect(emittedMerge.seriesProvenance.predictedCount).toBe(1);
    });

    it("hides editing controls when readOnly is true for stakeholder viewers", () => {
      const i18n = createTestI18n();
      const { store } = createTestStore();

      const wrapper = mount(FactorSeriesModal, {
        props: {
          modelValue: true,
          readOnly: true,
          factor: {
            id: "f1",
            name: "Protected Metrics",
            timeSeries: [{ date: "2024-01-01", value: 50 }]
          }
        },
        global: {
          plugins: [Quasar, store, i18n],
          components,
          stubs: {
            "q-dialog": { template: "<div><slot /></div>" }
          }
        }
      });

      // Import tab and clear buttons should not exist
      expect(wrapper.find('q-tab[name="import"]').exists()).toBe(false);
      expect(wrapper.text()).not.toContain("Clear Series");
    });
  });

  describe("IngestDataDialog Time Series Tab", () => {
    it("renders the time series tab and populates factor selection", () => {
      const i18n = createTestI18n();
      const mockNodes = [
        { id: "node1", name: "Outreach Costs", symbol: "outreachCost", unit: "USD" },
        { id: "node2", name: "Beneficiaries", symbol: "beneficiaries", unit: "people" }
      ];
      const { store } = createTestStore(mockNodes);

      const wrapper = mount(IngestDataDialog, {
        props: { modelValue: true },
        global: {
          plugins: [Quasar, store, i18n],
          components,
          stubs: {
            "q-dialog": { template: "<div><slot /></div>" }
          }
        }
      });

      expect(wrapper.text()).toContain("Time Series Data");
      expect(wrapper.vm.factorOptions.length).toBe(2);
      expect(wrapper.vm.factorOptions[0].label).toContain("Outreach Costs ($outreachCost)");
    });

    it("attaches time series to a selected factor via updateNode", async () => {
      const i18n = createTestI18n();
      const mockNodes = [
        { id: "node1", name: "Outreach Costs", symbol: "outreachCost", unit: "USD" }
      ];
      const { store, updateNodeMock } = createTestStore(mockNodes);

      const wrapper = mount(IngestDataDialog, {
        props: { modelValue: true },
        global: {
          plugins: [Quasar, store, i18n],
          components,
          stubs: {
            "q-dialog": { template: "<div><slot /></div>" }
          }
        }
      });

      wrapper.vm.targetFactorId = "node1";
      wrapper.vm.rawTimeSeriesText = `Date,Value,Type,Source\n2024-01-01,500,historical,FY24 Audit\n2025-01-01,750,predicted,FY25 Plan`;
      wrapper.vm.tsSourceCitation = "Outreach Finance Plan";
      await wrapper.vm.$nextTick();

      expect(wrapper.vm.parsedTimeSeriesPoints.length).toBe(2);
      await wrapper.vm.attachTimeSeriesToFactor();

      expect(updateNodeMock).toHaveBeenCalledTimes(1);
      const callPayload = updateNodeMock.mock.calls[0][0];
      expect(callPayload.updates.id).toBe("node1");
      expect(callPayload.updates.timeSeries.length).toBe(2);
      expect(callPayload.updates.seriesProvenance.sourceCitation).toBe("Outreach Finance Plan");
      expect(callPayload.updates.seriesProvenance.historicalCount).toBe(1);
      expect(callPayload.updates.seriesProvenance.predictedCount).toBe(1);
    });
  });
});
