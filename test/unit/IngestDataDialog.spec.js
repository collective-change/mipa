import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createStore } from "vuex";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import IngestDataDialog, { SAMPLE_FINANCIAL_TABLE } from "@/components/Model/Modals/IngestDataDialog.vue";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

const mockNodes = [
  {
    id: "factor_admin",
    symbol: "adminExpenses",
    name: "General Administration Overhead",
    latestValue: 80000,
    unit: "USD",
    costCategory: "overhead",
    reportingPeriod: "FY2024",
    effectiveDate: "2024-12-31",
    sourceCitation: "2024 Audit Note 4"
  },
  {
    id: "factor_clean_water",
    symbol: "cleanWaterProjects",
    name: "Clean Water Initiatives",
    latestValue: 50000,
    unit: "USD",
    costCategory: "direct_program",
    reportingPeriod: "FY2026",
    effectiveDate: new Date().toISOString().slice(0, 10),
    sourceCitation: "2026 Q1 Ledger"
  }
];

function createTestWrapper(nodes = mockNodes) {
  const modelActions = {
    addNode: vi.fn().mockResolvedValue({ id: "new_node_id" }),
    updateNode: vi.fn().mockResolvedValue({})
  };

  const store = createStore({
    modules: {
      orgs: {
        namespaced: true,
        state: () => ({ currentOrg: { id: "org1", currency: "USD" } })
      },
      model: {
        namespaced: true,
        state: () => ({ currentModel: { id: "model1" } }),
        getters: {
          nodes: () => nodes
        },
        actions: modelActions
      },
      auth: {
        namespaced: true,
        state: () => ({ userEmail: "analyst@example.org" })
      }
    }
  });

  const i18n = createI18n({
    legacy: false,
    locale: "en-us",
    messages
  });

  const wrapper = mount(IngestDataDialog, {
    props: {
      modelValue: true
    },
    global: {
      plugins: [[Quasar, { components }], store, i18n],
      directives: {
        ClosePopup: {}
      },
      mocks: {
        $route: { params: { modelId: "model1" } },
        $q: { notify: vi.fn() }
      }
    }
  });

  return { wrapper, modelActions };
}

describe("IngestDataDialog", () => {
  it("renders with tabs and initial empty proposals", () => {
    const { wrapper } = createTestWrapper();
    expect(wrapper.exists()).toBe(true);
    expect(wrapper.vm.activeTab).toBe("ingest");
    expect(wrapper.vm.parsedProposals).toHaveLength(0);
    expect(wrapper.vm.selectedCount).toBe(0);
  });

  it("loads sample financial table and parses proposals", async () => {
    const { wrapper } = createTestWrapper();
    wrapper.vm.loadSampleTable();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.rawTableText).toBe(SAMPLE_FINANCIAL_TABLE);
    expect(wrapper.vm.parsedProposals.length).toBeGreaterThan(0);
    expect(wrapper.vm.selectedCount).toBe(wrapper.vm.parsedProposals.length);

    // Verify first parsed proposal details
    const first = wrapper.vm.parsedProposals[0];
    expect(first.name).toBe("Direct Program Expenses");
    expect(first.latestValue).toBe(420000);
    expect(first.costCategory).toBe("direct_program");
  });

  it("toggles proposal selection", async () => {
    const { wrapper } = createTestWrapper();
    wrapper.vm.loadSampleTable();
    await wrapper.vm.$nextTick();

    wrapper.vm.toggleSelectAll(false);
    expect(wrapper.vm.selectedCount).toBe(0);

    wrapper.vm.toggleSelectAll(true);
    expect(wrapper.vm.selectedCount).toBe(wrapper.vm.parsedProposals.length);
  });

  it("imports selected factors updating existing ones and adding new ones", async () => {
    const { wrapper, modelActions } = createTestWrapper();
    wrapper.vm.loadSampleTable();
    await wrapper.vm.$nextTick();

    // General Administration Overhead is in mockNodes (existing)
    // Direct Program Expenses is new
    await wrapper.vm.importSelectedFactors();

    expect(modelActions.updateNode).toHaveBeenCalled();
    expect(modelActions.addNode).toHaveBeenCalled();
    expect(wrapper.emitted()["update:modelValue"][0]).toEqual([false]);
  });

  it("correctly evaluates freshness across existing factors", () => {
    const { wrapper } = createTestWrapper();
    const audited = wrapper.vm.auditedFactors;
    expect(audited).toHaveLength(2);

    const staleItem = audited.find((f) => f.id === "factor_admin");
    expect(staleItem.freshness.status).toBe("stale");

    const freshItem = audited.find((f) => f.id === "factor_clean_water");
    expect(freshItem.freshness.status).toBe("fresh");

    expect(wrapper.vm.freshCount).toBe(1);
    expect(wrapper.vm.staleFactorsCount).toBe(1);
  });

  it("groups factors into accounting categories", () => {
    const { wrapper } = createTestWrapper();
    const grouped = wrapper.vm.groupedFactors;
    expect(grouped.overhead).toHaveLength(1);
    expect(grouped.direct_program).toHaveLength(1);
    expect(grouped.capital || []).toHaveLength(0);
  });
});
