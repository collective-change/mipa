import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createPinia, setActivePinia } from "pinia";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import FactorSeriesModal from "@/components/Model/Modals/FactorSeriesModal.vue";
import { useAuthStore } from "@/store/store-auth";
import { SAMPLE_TIME_SERIES } from "@/utils/dataIngestion";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

const CSV = "Date,Value,Type\n2024-01-01,105,historical\n2025-01-01,140,predicted";

function mountModal({ withPinia = true, user = null, props = {}, mocks = {} } = {}) {
  const plugins = [Quasar];
  if (withPinia) {
    const pinia = createPinia();
    setActivePinia(pinia);
    useAuthStore(pinia).$patch({ user });
    plugins.push(pinia);
  }
  plugins.push(createI18n({ legacy: false, locale: "en-us", fallbackLocale: "en-us", messages }));
  return mount(FactorSeriesModal, {
    props: {
      modelValue: true,
      factor: { id: "f1", name: "Sales", symbol: "sales" },
      ...props
    },
    global: {
      plugins,
      components,
      mocks,
      stubs: { "q-dialog": { template: "<div><slot /></div>" } }
    }
  });
}

describe("FactorSeriesModal - signed-in user email from the Pinia auth store", () => {
  it("records the signed-in user's email as importer when Pinia has a user", async () => {
    const wrapper = mountModal({ user: { email: "analyst@example.org" } });
    expect(wrapper.vm.authUserEmail).toBe("analyst@example.org");

    wrapper.vm.rawInput = CSV;
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.parsedResult.provenance.importedBy).toBe("analyst@example.org");

    wrapper.vm.commitSeries();
    const [payload] = wrapper.emitted("save-series")[0];
    expect(payload.seriesProvenance.importedBy).toBe("analyst@example.org");
    expect(payload.timeSeries).toHaveLength(2);
    expect(wrapper.emitted("update:modelValue")[0]).toEqual([false]);
    expect(wrapper.vm.rawInput).toBe("");
    expect(wrapper.vm.isSaving).toBe(false);
  });

  it("falls back to 'user' when Pinia is installed but nobody is signed in", async () => {
    const wrapper = mountModal({ user: null });
    expect(wrapper.vm.authUserEmail).toBeUndefined();

    wrapper.vm.rawInput = CSV;
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.parsedResult.provenance.importedBy).toBe("user");

    wrapper.vm.commitSeries();
    expect(wrapper.emitted("save-series")[0][0].seriesProvenance.importedBy).toBe("user");
  });

  it("tolerates being mounted without Pinia and falls back to 'user'", async () => {
    const wrapper = mountModal({ withPinia: false });
    expect(wrapper.vm.$pinia).toBeUndefined();
    expect(wrapper.vm.authUserEmail).toBeUndefined();

    wrapper.vm.rawInput = CSV;
    await wrapper.vm.$nextTick();
    wrapper.vm.commitSeries();
    expect(wrapper.emitted("save-series")[0][0].seriesProvenance.importedBy).toBe("user");
  });
});

describe("FactorSeriesModal - other behaviour", () => {
  it("does not emit anything when there are no parsed points", () => {
    const wrapper = mountModal();
    wrapper.vm.commitSeries();
    expect(wrapper.emitted("save-series")).toBeUndefined();
    expect(wrapper.vm.isSaving).toBe(false);
  });

  it("loadSample fills the sample data and only sets a citation when none exists", () => {
    const wrapper = mountModal();
    wrapper.vm.loadSample();
    expect(wrapper.vm.rawInput).toBe(SAMPLE_TIME_SERIES);
    expect(wrapper.vm.sourceCitation).toBe("Sample Organization Ledger (Historical & Predictions)");

    wrapper.vm.sourceCitation = "My ledger";
    wrapper.vm.loadSample();
    expect(wrapper.vm.sourceCitation).toBe("My ledger");
  });

  it("opening the dialog picks the tab and citation from the factor", async () => {
    const wrapper = mountModal({
      props: {
        modelValue: false,
        factor: {
          id: "f1",
          name: "Sales",
          timeSeries: [{ date: "2024-01-01", value: 1 }],
          seriesProvenance: { sourceCitation: "Prior audit" }
        }
      }
    });
    await wrapper.setProps({ modelValue: true });
    expect(wrapper.vm.activeTab).toBe("current");
    expect(wrapper.vm.sourceCitation).toBe("Prior audit");

    const empty = mountModal({ props: { modelValue: false, factor: { id: "f2", name: "X" } } });
    await empty.setProps({ modelValue: true });
    expect(empty.vm.activeTab).toBe("import");
    expect(empty.vm.sourceCitation).toBe("");
  });

  it("filters existing points by date, citation or notes", async () => {
    const wrapper = mountModal({
      props: {
        factor: {
          id: "f1",
          name: "Sales",
          series: [
            { date: "2024-01-01", value: 1, sourceCitation: "Audit A" },
            { date: "2025-01-01", value: 2, notes: "forecast note", isPredicted: true }
          ]
        }
      }
    });
    const key = "filteredCurrentPoints";
    expect(wrapper.vm[key]).toHaveLength(2);
    wrapper.vm.searchFilter = "audit";
    expect(wrapper.vm[key]).toHaveLength(1);
    wrapper.vm.searchFilter = "forecast";
    expect(wrapper.vm[key].map(p => p.date)).toEqual(["2025-01-01"]);
    wrapper.vm.searchFilter = "2024";
    expect(wrapper.vm[key].map(p => p.date)).toEqual(["2024-01-01"]);
    expect(wrapper.vm.historicalCount).toBe(1);
    expect(wrapper.vm.predictedCount).toBe(1);
  });

  it("clearing the series asks for confirmation then emits an empty series", () => {
    let onOk;
    const dialog = vi.fn(() => ({ onOk: cb => { onOk = cb; } }));
    const wrapper = mountModal({ mocks: { $q: { dialog } } });
    wrapper.vm.confirmClearSeries();
    expect(dialog).toHaveBeenCalledWith(expect.objectContaining({ cancel: true, persistent: true }));
    expect(wrapper.emitted("save-series")).toBeUndefined();
    onOk();
    expect(wrapper.emitted("save-series")[0][0]).toEqual({ timeSeries: [], seriesProvenance: null });
  });
});
