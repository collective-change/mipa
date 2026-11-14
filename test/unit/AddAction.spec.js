import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createStore } from "vuex";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import AddAction from "@/components/Actions/Modals/AddAction.vue";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

function mountAddAction(options = {}) {
  const actions = {
    addAction: vi.fn(),
  };

  const sampleNodes = [
    {
      id: "node-elec",
      name: "每月用電費用",
      symbol: "electricityCost",
      unit: "TWD",
      formula: "25000"
    },
    {
      id: "node-vol",
      name: "志工參與人數",
      symbol: "activeVolunteers",
      unit: "people",
      formula: "100"
    }
  ];

  const store = createStore({
    modules: {
      actions: {
        namespaced: true,
        actions,
      },
      model: {
        namespaced: true,
        state: {
          nodes: sampleNodes,
          currentModel: { id: "model-1", name: "Main Model" }
        },
        getters: {
          nodes: () => sampleNodes
        }
      },
      orgs: {
        namespaced: true,
        state: {
          currentOrg: { id: "org-1", name: "Test Org", currency: "TWD" }
        }
      }
    },
  });

  const wrapper = mount(AddAction, {
    global: {
      plugins: [
        [Quasar, { components, directives: { ClosePopup: All.ClosePopup } }],
        store,
        createI18n({ legacy: true, locale: options.locale || "zh-tw", messages }),
      ],
      mocks: {
        $route: { params: { orgId: "org-1", modelId: "model-1" } },
        $q: {
          notify: vi.fn()
        }
      },
      stubs: {
        "q-dialog": { template: "<div><slot /></div>" }
      }
    },
  });

  return { wrapper, actions, sampleNodes };
}

describe("AddAction.vue", () => {
  it("renders with AI smart draft tab as default", () => {
    const { wrapper } = mountAddAction();
    expect(wrapper.vm.activeTab).toBe("aiDraft");
    expect(wrapper.vm.proposal).toBeNull();
  });

  it("switches tabs between smart draft and manual entry", async () => {
    const { wrapper } = mountAddAction();
    wrapper.vm.activeTab = "manual";
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.activeTab).toBe("manual");
  });

  it("generates action proposal from idea text", async () => {
    const { wrapper } = mountAddAction();
    wrapper.vm.ideaText = "在花蓮環保站安裝太陽能板降低電費支出";
    await wrapper.vm.generateProposal();

    expect(wrapper.vm.proposal).not.toBeNull();
    expect(wrapper.vm.proposal.title).toContain("安裝太陽能板");
    expect(wrapper.vm.proposal.estEffortHrs).toBeGreaterThan(0);
    expect(wrapper.vm.proposal.estSpending).toBeGreaterThan(0);
    expect(wrapper.vm.proposal.impacts.length).toBeGreaterThanOrEqual(1);
  });

  it("allows adding, modifying, and removing factor impacts", async () => {
    const { wrapper } = mountAddAction();
    wrapper.vm.ideaText = "招募並培訓志工";
    await wrapper.vm.generateProposal();

    const initialCount = wrapper.vm.proposal.impacts.length;
    wrapper.vm.addEmptyImpact();
    expect(wrapper.vm.proposal.impacts.length).toBe(initialCount + 1);

    wrapper.vm.removeImpact(0);
    expect(wrapper.vm.proposal.impacts.length).toBe(initialCount);
  });

  it("submits compiled draft action to store and emits close", async () => {
    const { wrapper, actions } = mountAddAction();
    wrapper.vm.ideaText = "安裝太陽能板";
    await wrapper.vm.generateProposal();

    // Adjust title and spending
    wrapper.vm.proposal.title = "自建太陽能光電系統";
    wrapper.vm.proposal.estSpending = 500000;

    await wrapper.vm.saveDraftAction();

    expect(actions.addAction).toHaveBeenCalled();
    const submitted = actions.addAction.mock.calls[0][1];
    expect(submitted.title).toBe("自建太陽能光電系統");
    expect(submitted.estSpending).toBe(500000);
    expect(submitted.orgId).toBe("org-1");
    expect(submitted.impacts).toBeDefined();

    expect(wrapper.emitted().close).toBeTruthy();
  });

  it("resets proposal when clicking start over", async () => {
    const { wrapper } = mountAddAction();
    wrapper.vm.ideaText = "測試方案";
    await wrapper.vm.generateProposal();
    expect(wrapper.vm.proposal).not.toBeNull();

    wrapper.vm.resetProposal();
    expect(wrapper.vm.proposal).toBeNull();
  });
});
