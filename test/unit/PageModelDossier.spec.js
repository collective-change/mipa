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
vi.mock("@/boot/firebase", () => ({
  firebaseDb: {}
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
