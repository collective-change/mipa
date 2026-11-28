import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createPinia, setActivePinia } from "pinia";
import { useModelStore } from "@/store/store-model";
import { useCalcResultsStore } from "@/store/store-calcResults";
import { useUiStore } from "@/store/store-ui";
import { useOrgsStore } from "@/store/store-orgs";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import GettingStarted from "@/components/Model/GettingStarted.vue";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

// Mock firestore
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  limit: vi.fn(),
  query: vi.fn(),
  where: vi.fn()
}));

vi.mock("@/boot/firebase", () => ({
  firebaseDb: {}
}));

// Stubbed at mount anyway; mocked so this spec does not depend on its store wiring.
vi.mock("@/components/Calc/CalculatorUi.vue", () => ({
  default: { name: "CalculatorUi", template: "<button />" }
}));

describe("MIPA-56: GettingStarted.vue - Step 3 Close the Model & Named Limits", () => {
  let store;
  let mockSetSelectedNodeId;
  let mockPush;

  beforeEach(() => {
    mockSetSelectedNodeId = vi.fn();
    mockPush = vi.fn();
  });

  function createTestStore({
    nodes = [],
    roleNodes = {
      averageEffortCostPerHour: "role_hourly",
      orgBenefit: "role_org_benefit",
      orgCost: "role_org_cost",
      worldBenefit: "role_world_benefit",
      worldCost: "role_world_cost"
    },
    baseline = null,
    orgs = null
  } = {}) {
    const pinia = createPinia();
    setActivePinia(pinia);
    const model = useModelStore(pinia);
    model.$patch({
      currentModel: {
        id: "test_m1",
        name: "Test Strategy Model",
        isOrgMainModel: true,
        roleNodes,
        simulationParams: { finalTimeNumber: 120, finalTimeUnit: "months" }
      },
      nodes
    });
    useCalcResultsStore(pinia).$patch({ baseline });
    useUiStore(pinia).setSelectedNodeId = mockSetSelectedNodeId;
    const orgsStore = useOrgsStore(pinia);
    // Without an orgs fixture there is no sample org and no way to create one.
    orgsStore.createSampleOrg = undefined;
    if (orgs) {
      orgsStore.$patch({
        orgs: orgs.orgs || [],
        currentOrg: orgs.currentOrg || null
      });
      if (orgs.actions && orgs.actions.createSampleOrg) {
        orgsStore.createSampleOrg = orgs.actions.createSampleOrg;
      }
    }
    return pinia;
  }

  function mountComponent(storeInstance, locale = "en-us") {
    const i18n = createI18n({ legacy: true, locale, messages });
    return mount(GettingStarted, {
      global: {
        plugins: [[Quasar, { components }], storeInstance, i18n],
        mocks: {
          $route: {
            params: { orgId: "test_org", modelId: "test_m1", orgNameSlug: "test-org" }
          },
          $router: {
            push: mockPush
          }
        },
        stubs: {
          "calculator-ui": {
            template: "<button class='calc-btn'>Calculate</button>"
          }
        }
      }
    });
  }

  describe("1. Starter / Brand-New Model State", () => {
    it("renders Step 3 as 'Close the model' and marks it NOT done when default factors are unlinked", () => {
      // 7 starter nodes unlinked
      const starterNodes = [
        { id: "role_hourly", symbol: "hourly", name: "Hourly Cost", isNew: true, class: "unlinked" },
        { id: "role_org_benefit", symbol: "orgBenefit", name: "Org Benefit", class: "unlinked", influencers: [], influencees: [] },
        { id: "role_org_cost", symbol: "orgCost", name: "Org Cost", class: "unlinked", influencers: [], influencees: [] },
        { id: "role_world_benefit", symbol: "worldBenefit", name: "World Benefit", class: "unlinked", influencers: [], influencees: [] },
        { id: "role_world_cost", symbol: "worldCost", name: "World Cost", class: "unlinked", influencers: [], influencees: [] },
        { id: "n_weight1", symbol: "orgWeight", name: "Org Weight", class: "unlinked" },
        { id: "n_weight2", symbol: "worldWeight", name: "World Weight", class: "unlinked" }
      ];

      store = createTestStore({ nodes: starterNodes });
      const wrapper = mountComponent(store);

      const stepItems = wrapper.findAll(".q-list .q-item");
      expect(stepItems.length).toBe(6);

      const step3 = wrapper.vm.steps[2];
      expect(step3.key).toBe("closeModel");
      expect(step3.done).toBe(false);

      const text = wrapper.text();
      expect(text).toContain("3. Close the model");
      expect(text).toContain("No balancing limits detected yet");
      expect(text).toContain("Default factors still unconnected");
    });
  });

  describe("2. Unbounded Growth & Balancing Loop Pairing", () => {
    it("keeps Step 3 incomplete when reinforcing loop exists without a bounding balancing loop", () => {
      // R loop: a -> b -> a
      const nodesWithRLoop = [
        { id: "role_hourly", symbol: "hourly", isNew: false, class: "input" },
        { id: "role_org_benefit", symbol: "orgBenefit", class: "state", influencers: ["a"], influencees: [] },
        { id: "role_org_cost", symbol: "orgCost", class: "state", influencers: ["b"], influencees: [] },
        { id: "role_world_benefit", symbol: "worldBenefit", class: "state", influencers: ["a"], influencees: [] },
        { id: "role_world_cost", symbol: "worldCost", class: "state", influencers: ["b"], influencees: [] },
        { id: "a", symbol: "A", name: "Reinforcing Growth A", formula: "B * 1.2", influencers: ["b"], influencees: ["b", "role_org_benefit", "role_world_benefit"], class: "state" },
        { id: "b", symbol: "B", name: "Reinforcing Growth B", formula: "A * 1.1", influencers: ["a"], influencees: ["a", "role_org_cost", "role_world_cost"], class: "state" }
      ];

      store = createTestStore({ nodes: nodesWithRLoop });
      const wrapper = mountComponent(store);

      const step3 = wrapper.vm.steps[2];
      expect(step3.key).toBe("closeModel");
      expect(step3.done).toBe(false);
      expect(wrapper.vm.namedLimitNames.length).toBe(0);
    });

    it("marks Step 3 done and shows limits by name when balancing limits bound growth and defaults are connected", () => {
      // Model with reinforcing loop and bounding balancing loop:
      // R: meals -> reputation -> meals
      // B: meals -> capacity_used -> meals (negative feedback / limit)
      const closedModelNodes = [
        { id: "role_hourly", symbol: "hourly", name: "Hourly Cost", isNew: false, class: "input" },
        { id: "role_org_benefit", symbol: "orgBenefit", name: "Org Benefit", class: "output", influencers: ["meals"], influencees: [] },
        { id: "role_org_cost", symbol: "orgCost", name: "Org Cost", class: "output", influencers: ["capacity"], influencees: [] },
        { id: "role_world_benefit", symbol: "worldBenefit", name: "World Benefit", class: "output", influencers: ["meals"], influencees: [] },
        { id: "role_world_cost", symbol: "worldCost", name: "World Cost", class: "output", influencers: ["capacity"], influencees: [] },
        {
          id: "meals",
          symbol: "meals",
          name: "Meals Distributed",
          formula: "reputation * 10 - capacity * 2",
          influencers: ["reputation", "capacity"],
          influencees: ["reputation", "capacity", "role_org_benefit", "role_world_benefit"],
          class: "state"
        },
        {
          id: "reputation",
          symbol: "rep",
          name: "Community Reputation",
          formula: "meals * 0.05",
          influencers: ["meals"],
          influencees: ["meals"],
          class: "state"
        },
        {
          id: "capacity",
          symbol: "kitchenCap",
          name: "Kitchen Capacity",
          formula: "meals * 0.1",
          influencers: ["meals"],
          influencees: ["meals", "role_org_cost", "role_world_cost"],
          class: "state"
        }
      ];

      store = createTestStore({ nodes: closedModelNodes });
      const wrapper = mountComponent(store);

      const step3 = wrapper.vm.steps[2];
      expect(step3.key).toBe("closeModel");
      expect(step3.done).toBe(true);

      const text = wrapper.text();
      expect(text).toContain("This model says your limits are:");
      expect(text).toContain("Kitchen Capacity");
      expect(text).not.toContain("Default factors still unconnected");
    });
  });

  describe("3. Navigation & Node Selection", () => {
    it("selects unconnected default factor when clicked if any remain unconnected", async () => {
      const nodes = [
        { id: "role_hourly", symbol: "hourly", name: "Hourly Cost", isNew: false, class: "input" },
        { id: "role_org_benefit", symbol: "orgBenefit", name: "Org Benefit", class: "unlinked", influencers: [], influencees: [] },
        { id: "role_org_cost", symbol: "orgCost", name: "Org Cost", class: "unlinked", influencers: [], influencees: [] },
        { id: "role_world_benefit", symbol: "worldBenefit", name: "World Benefit", class: "unlinked", influencers: [], influencees: [] },
        { id: "role_world_cost", symbol: "worldCost", name: "World Cost", class: "unlinked", influencers: [], influencees: [] }
      ];

      store = createTestStore({ nodes });
      const wrapper = mountComponent(store);

      const step3 = wrapper.vm.steps[2];
      step3.go();

      // First unconnected default is role_org_benefit
      expect(mockSetSelectedNodeId).toHaveBeenCalledWith("role_org_benefit");
    });

    it("selects worldBenefit factor when clicked after default factors are connected", () => {
      const nodes = [
        { id: "role_hourly", symbol: "hourly", name: "Hourly Cost", isNew: false, class: "input" },
        { id: "role_org_benefit", symbol: "orgBenefit", name: "Org Benefit", class: "output", influencers: ["a"], influencees: [] },
        { id: "role_org_cost", symbol: "orgCost", name: "Org Cost", class: "output", influencers: ["a"], influencees: [] },
        { id: "role_world_benefit", symbol: "worldBenefit", name: "World Benefit", class: "output", influencers: ["a"], influencees: [] },
        { id: "role_world_cost", symbol: "worldCost", name: "World Cost", class: "output", influencers: ["a"], influencees: [] },
        { id: "a", symbol: "A", name: "A", influencers: [], influencees: ["role_org_benefit", "role_org_cost", "role_world_benefit", "role_world_cost"] }
      ];

      store = createTestStore({ nodes });
      const wrapper = mountComponent(store);

      const step3 = wrapper.vm.steps[2];
      step3.go();

      expect(mockSetSelectedNodeId).toHaveBeenCalledWith("role_world_benefit");
    });
  });

  describe("4. Multilingual Coverage (All 5 Locales)", () => {
    const closedNodes = [
      { id: "role_hourly", symbol: "hourly", name: "Hourly Cost", isNew: false, class: "input" },
      { id: "role_org_benefit", symbol: "orgBenefit", name: "Org Benefit", class: "output", influencers: ["meals"], influencees: [] },
      { id: "role_org_cost", symbol: "orgCost", name: "Org Cost", class: "output", influencers: ["capacity"], influencees: [] },
      { id: "role_world_benefit", symbol: "worldBenefit", name: "World Benefit", class: "output", influencers: ["meals"], influencees: [] },
      { id: "role_world_cost", symbol: "worldCost", name: "World Cost", class: "output", influencers: ["capacity"], influencees: [] },
      {
        id: "meals",
        symbol: "meals",
        name: "Meals Distributed",
        formula: "-capacity * 2",
        influencers: ["capacity"],
        influencees: ["capacity", "role_org_benefit", "role_world_benefit"],
        class: "state"
      },
      {
        id: "capacity",
        symbol: "kitchenCap",
        name: "Kitchen Capacity",
        formula: "meals * 0.1",
        influencers: ["meals"],
        influencees: ["meals", "role_org_cost", "role_world_cost"],
        class: "state"
      }
    ];

    it("renders in English with zero Chinese characters", () => {
      store = createTestStore({ nodes: closedNodes });
      const wrapper = mountComponent(store, "en-us");
      const text = wrapper.text();

      expect(text).toContain("3. Close the model");
      expect(text).toContain("This model says your limits are: Kitchen Capacity");

      const chineseMatches = text.match(/[\u4e00-\u9fff]/g);
      expect(chineseMatches).toBeNull();
    });

    it("renders in Traditional Chinese with 閉合模型 and 此模型認定的限制為", () => {
      store = createTestStore({ nodes: closedNodes });
      const wrapper = mountComponent(store, "zh-tw");
      const text = wrapper.text();

      expect(text).toContain("3. 閉合模型");
      expect(text).toContain("此模型認定的限制為：Kitchen Capacity");
    });

    it("renders in Simplified Chinese with 闭合模型 and 此模型认定的限制为", () => {
      store = createTestStore({ nodes: closedNodes });
      const wrapper = mountComponent(store, "zh-cn");
      const text = wrapper.text();

      expect(text).toContain("3. 闭合模型");
      expect(text).toContain("此模型认定的限制为：Kitchen Capacity");
    });

    it("renders in Spanish with Cerrar el modelo and Este modelo indica que sus límites son", () => {
      store = createTestStore({ nodes: closedNodes });
      const wrapper = mountComponent(store, "es");
      const text = wrapper.text();

      expect(text).toContain("3. Cerrar el modelo");
      expect(text).toContain("Este modelo indica que sus límites son: Kitchen Capacity");
    });

    it("renders in Japanese with モデルを閉合する and このモデルが示す制約要素", () => {
      store = createTestStore({ nodes: closedNodes });
      const wrapper = mountComponent(store, "ja");
      const text = wrapper.text();

      expect(text).toContain("3. モデルを閉合する");
      expect(text).toContain("このモデルが示す制約要素：Kitchen Capacity");
    });
  });

  describe("5. Finished Example Link (MIPA-57)", () => {
    const exampleNodes = [
      { id: "role_hourly", symbol: "hourly", name: "Hourly Cost", isNew: false, class: "input" },
      { id: "role_org_benefit", symbol: "orgBenefit", name: "Org Benefit", class: "output", influencers: [], influencees: [] },
      { id: "role_org_cost", symbol: "orgCost", name: "Org Cost", class: "output", influencers: [], influencees: [] },
      { id: "role_world_benefit", symbol: "worldBenefit", name: "World Benefit", class: "output", influencers: [], influencees: [] },
      { id: "role_world_cost", symbol: "worldCost", name: "World Cost", class: "output", influencers: [], influencees: [] }
    ];

    it("renders exactly one <a> link on the GettingStarted card pointing to an Actions view", () => {
      store = createTestStore({
        nodes: exampleNodes,
        orgs: {
          orgs: [{ id: "sample_org_1", nameSlug: "sample-food-pantry", isSample: true }]
        }
      });
      const wrapper = mountComponent(store, "en-us");

      const links = wrapper.findAll("a");
      expect(links).toHaveLength(1);
      expect(links[0].attributes("data-testid")).toBe("finished-example-link");
      expect(links[0].text()).toBe("See a finished example");
      expect(links[0].attributes("href")).toBe("/org/sample-food-pantry/ideate/actions/sample_org_1");
    });

    it("navigates directly to existing sample org Actions view when clicked", async () => {
      const createSampleOrg = vi.fn();
      store = createTestStore({
        nodes: exampleNodes,
        orgs: {
          orgs: [{ id: "sample_org_1", nameSlug: "sample-food-pantry", isSample: true }],
          actions: { createSampleOrg }
        }
      });
      const wrapper = mountComponent(store, "en-us");

      await wrapper.get("[data-testid='finished-example-link']").trigger("click");

      expect(createSampleOrg).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith({
        name: "actions",
        params: { orgNameSlug: "sample-food-pantry", orgId: "sample_org_1" }
      });
    });

    it("creates a sample org and routes to its Actions view when user has no sample org yet", async () => {
      const createSampleOrg = vi.fn().mockResolvedValue({
        orgId: "created_sample_1",
        nameSlug: "created-sample-slug"
      });
      store = createTestStore({
        nodes: exampleNodes,
        orgs: {
          orgs: [{ id: "test_org", nameSlug: "test-org", isSample: false }],
          actions: { createSampleOrg }
        }
      });
      const wrapper = mountComponent(store, "en-us");

      await wrapper.get("[data-testid='finished-example-link']").trigger("click");

      expect(createSampleOrg).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith({
        name: "actions",
        params: { orgNameSlug: "created-sample-slug", orgId: "created_sample_1" }
      });
    });

    it("renders gsSeeFinishedExample cleanly in all five locales without English leaking", () => {
      const expectedByLocale = {
        "en-us": "See a finished example",
        "zh-tw": "查看完成的範例",
        "zh-cn": "查看完成的范例",
        es: "Ver un ejemplo terminado",
        ja: "完成した例を見る"
      };
      for (const [locale, expectedText] of Object.entries(expectedByLocale)) {
        store = createTestStore({ nodes: exampleNodes });
        const wrapper = mountComponent(store, locale);
        const link = wrapper.get("[data-testid='finished-example-link']");
        expect(link.text()).toBe(expectedText);
        if (locale !== "en-us") {
          expect(link.text()).not.toContain("See a finished example");
        }
      }
    });
  });
});
