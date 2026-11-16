import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import PageModelDossier from "@/pages/PageModelDossier.vue";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

// Mock Firestore getDoc and getDocs
const mockGetActions = vi.fn();

vi.mock("@/boot/firebase", () => ({
  firebaseDb: {},
  firebaseFunctions: {}
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: vi.fn(() => (...args) => mockGetActions(...args))
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  getDoc: vi.fn(async () => ({
    exists: () => true,
    id: "test-model-public",
    data: () => ({
      name: "Emergency Mobile Health Model",
      description: "Regional preventative clinic coverage and medical supply surge simulation."
    })
  })),
  collection: vi.fn(),
  getDocs: vi.fn(async () => ({
    docs: [
      { id: "n1", data: () => ({ symbol: "MC", name: "Mobile Clinics", initialValue: 10, units: "clinics" }) },
      { id: "n2", data: () => ({ symbol: "PT", name: "Patients Treated", initialValue: 500, units: "people" }) }
    ]
  }))
}));

function mountDossier(locale = "en-us") {
  return mount(PageModelDossier, {
    global: {
      plugins: [
        [Quasar, { components }],
        createI18n({ legacy: true, locale, messages })
      ],
      mocks: {
        $route: { params: { modelId: "test-model-public" } }
      },
      stubs: {
        "q-page": { template: "<div class='q-page'><slot /></div>" },
        "q-slider": { props: ["modelValue"], template: "<input type='range' class='q-slider' />" },
        "q-table": {
          props: ["rows", "columns"],
          template: "<div class='q-table'><slot name='body-cell-leverage' :value='3.45' /></div>"
        }
      }
    }
  });
}

describe("PageModelDossier.vue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActions.mockResolvedValue({ data: { actions: [] } });
  });

  it("MIPA-14: loads actions through the public callable and ranks them by leverage", async () => {
    mockGetActions.mockResolvedValue({
      data: {
        actions: [
          { id: "a1", title: "Low action", actionLeverage: 1.5 },
          { id: "a2", title: "Top action", actionLeverage: 12.25 }
        ]
      }
    });
    const wrapper = mountDossier("en-us");
    await wrapper.vm.fetchDossierData();

    expect(mockGetActions).toHaveBeenCalledWith({ modelId: "test-model-public" });
    expect(wrapper.vm.rawActions).toHaveLength(2);
    expect(wrapper.vm.dossier.actionsCount).toBe(2);
    expect(wrapper.vm.dossier.rankedActions[0].title).toBe("Top action");
    expect(wrapper.vm.topLeverageFormatted).toBe("12.25x");
  });

  it("MIPA-14: a failed actions read leaves the dossier rendering with zero actions", async () => {
    mockGetActions.mockRejectedValue(new Error("not-found"));
    const wrapper = mountDossier("en-us");
    await wrapper.vm.fetchDossierData();

    expect(wrapper.vm.dossier.actionsCount).toBe(0);
    expect(wrapper.vm.dossier.factorsCount).toBe(2);
    expect(wrapper.vm.topLeverageFormatted).toBe("-");
  });

  it("MIPA-14 (measured): a slider changes the factor's displayed value but not the ranking", async () => {
    mockGetActions.mockResolvedValue({
      data: {
        actions: [
          { id: "a1", title: "B", actionLeverage: 2 },
          { id: "a2", title: "A", actionLeverage: 8 }
        ]
      }
    });
    const wrapper = mountDossier("en-us");
    await wrapper.vm.fetchDossierData();
    const before = wrapper.vm.dossier;
    expect(before.factors[0].perturbedValue).toBe(10);

    wrapper.vm.perturbations["n1"] = 50;
    const after = wrapper.vm.dossier;
    expect(after.factors[0].perturbedValue).toBe(15);
    expect(after.rankedActions.map((a) => a.actionLeverage)).toEqual(
      before.rankedActions.map((a) => a.actionLeverage)
    );
  });

  it("renders the public dossier in English with zero Chinese characters", async () => {
    const wrapper = mountDossier("en-us");
    await wrapper.vm.fetchDossierData();

    const text = wrapper.text();
    expect(text).toContain("Public Strategic Dossier");
    expect(text).toContain("Emergency Mobile Health Model");
    expect(text).toContain("System Factors");
    expect(text).toContain("Strategic Actions");
    expect(text).toContain("Print / Export PDF");

    const chineseMatches = text.match(/[\u4e00-\u9fff]/g);
    expect(chineseMatches).toBeNull();
  });

  it("renders in Traditional Chinese with elegant phrasing and 效應比", async () => {
    const wrapper = mountDossier("zh-tw");
    await wrapper.vm.fetchDossierData();

    const text = wrapper.text();
    expect(text).toContain("公開策略決策檔案");
    expect(text).toContain("訪客唯讀模擬沙盒");
    expect(text).toContain("系統因素");
    expect(text).toContain("策略行動方案");
    expect(text).toContain("最高效應比");
  });

  it("resets factor perturbations when requested", async () => {
    const wrapper = mountDossier("en-us");
    await wrapper.vm.fetchDossierData();

    wrapper.vm.perturbations["n1"] = 30;
    expect(wrapper.vm.perturbations["n1"]).toBe(30);

    wrapper.vm.resetPerturbations();
    expect(wrapper.vm.perturbations["n1"]).toBe(0);
  });
});
