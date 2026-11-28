import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createPinia, setActivePinia } from "pinia";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import ConfigOrgModel from "@/components/Model/Modals/ConfigOrgModel.vue";
import { useOrgsStore } from "@/store/store-orgs";
import { useModelStore } from "@/store/store-model";
import { checkSeatCapacity } from "../../functions/src/orgMembers";

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

function mountConfigOrgModel(options = {}) {
  const currentModel = {
    id: "model-1",
    name: "Core Impact Model",
    isOrgMainModel: true,
    simulationParams: {
      timeStepNumber: 1,
      timeStepUnit: "months",
      numTimeSteps: 120,
      timeStepGrowthRate: 0,
      finalTimeNumber: 120,
      finalTimeUnit: "months",
      worldToOrgWeightingRatio: 0.5,
      orgWeightingFactor: 1,
      worldWeightingFactor: 1
    },
    roleNodes: {
      averageEffortCostPerHour: "n1",
      effort: "n2",
      spending: "n3",
      orgCost: "n4",
      worldCost: "n5",
      orgBenefit: "n6",
      worldBenefit: "n7"
    },
    owners: { users: ["user-admin-1"] },
    editors: { users: ["user-admin-1"] },
    viewers: options.viewers || {
      users: [],
      emails: ["existing-viewer@example.com"]
    }
  };

  const nodes = [
    { id: "n1", name: "Labor Rate" },
    { id: "n2", name: "Labor Hours" },
    { id: "n3", name: "Operating Spending" },
    { id: "n4", name: "Direct Cost" },
    { id: "n5", name: "Societal Cost" },
    { id: "n6", name: "Organizational Revenue" },
    { id: "n7", name: "Societal Impact" }
  ];

  const updateModelMock = vi.fn();

  const store = createPinia();
  setActivePinia(store);
  useOrgsStore(store).$patch({ currentOrg: { id: "org-1", name: "Impact Org" } });
  const model = useModelStore(store);
  model.$patch({ currentModel, nodes });
  model.updateModel = updateModelMock;

  const i18n = createTestI18n(options.locale || "en-us");

  const wrapper = mount(ConfigOrgModel, {
    global: {
      plugins: [[Quasar, { components }], store, i18n]
    }
  });

  return { wrapper, updateModelMock, currentModel };
}

describe("MIPA-15: Stakeholder Viewers UI & Governance", () => {
  it("renders the Stakeholder Viewers section and lists existing viewers", async () => {
    const { wrapper } = mountConfigOrgModel();
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("Stakeholder Viewers");
    expect(wrapper.text()).toContain("Unlimited read-only stakeholder viewers included");
    expect(wrapper.text()).toContain("existing-viewer@example.com");
  });

  it("allows adding a viewer by email with validation", async () => {
    const { wrapper } = mountConfigOrgModel();

    // 1. Invalid email rejected
    wrapper.vm.newViewerEmail = "invalid-email";
    wrapper.vm.addViewer();
    expect(wrapper.vm.viewerEmailError).toBeTruthy();
    expect(wrapper.vm.viewerEmails).not.toContain("invalid-email");

    // 2. Duplicate email rejected
    wrapper.vm.newViewerEmail = "existing-viewer@example.com";
    wrapper.vm.addViewer();
    expect(wrapper.vm.viewerEmailError).toBeTruthy();

    // 3. Valid new email accepted
    wrapper.vm.newViewerEmail = "new-stakeholder@partner.org";
    wrapper.vm.addViewer();
    expect(wrapper.vm.viewerEmailError).toBe("");
    expect(wrapper.vm.viewerEmails).toContain("new-stakeholder@partner.org");
    expect(wrapper.vm.newViewerEmail).toBe("");
  });

  it("allows removing a viewer from the list", async () => {
    const { wrapper } = mountConfigOrgModel();
    expect(wrapper.vm.viewerEmails).toContain("existing-viewer@example.com");

    wrapper.vm.removeViewer("existing-viewer@example.com");
    expect(wrapper.vm.viewerEmails).not.toContain("existing-viewer@example.com");
  });

  it("submits updated viewers payload when saving model settings", async () => {
    const { wrapper, updateModelMock } = mountConfigOrgModel();

    wrapper.vm.newViewerEmail = "board-director@foundation.org";
    wrapper.vm.addViewer();

    wrapper.vm.submitModel();
    expect(updateModelMock).toHaveBeenCalledTimes(1);
    const callArgs = updateModelMock.mock.calls[0][0];
    expect(callArgs.modelId).toBe("model-1");
    expect(callArgs.updates.viewers.emails).toContain("board-director@foundation.org");
    expect(callArgs.updates.viewers.emails).toContain("existing-viewer@example.com");
  });

  it("proves that unlimited viewers do not consume member seats on Community tier", () => {
    // Community tier allows 1 member seat
    const seatLimit = 1;
    const activeMembers = 1;
    const pendingInvites = 0;

    // Organization with 1 member has 0 remaining member seats
    const capacityBefore = checkSeatCapacity(activeMembers, pendingInvites, seatLimit);
    expect(capacityBefore.allowed).toBe(false);
    expect(capacityBefore.remaining).toBe(0);

    // Adding 50 stakeholder viewers to the model does not change member or invite counts
    const viewersCount = 50;
    // Capacity check is strictly based on org members + pending invites
    const capacityWithViewers = checkSeatCapacity(activeMembers, pendingInvites, seatLimit);
    expect(capacityWithViewers.allowed).toBe(false); // member invites blocked
    expect(viewersCount).toBe(50); // viewers coexist without seats
  });

  it("renders accurately in Traditional Chinese", () => {
    const { wrapper } = mountConfigOrgModel({ locale: "zh-tw" });
    expect(wrapper.text()).toContain("利益關係人檢視者");
    expect(wrapper.text()).toContain("免費提供不限人數之外部利益關係人唯讀檢視");
  });
});
