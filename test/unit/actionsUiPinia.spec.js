import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createPinia, setActivePinia } from "pinia";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import ActionRelationships from "@/components/Actions/Relationships/ActionRelationships.vue";
import Impacts from "@/components/Impacts/Impacts.vue";
import SimpleCostsAndImpacts from "@/components/Impacts/SimpleCostsAndImpacts.vue";
import { useActionsStore } from "@/store/store-actions";
import { useModelStore } from "@/store/store-model";
import { useUiStore } from "@/store/store-ui";
import { useUiActionStore } from "@/store/store-uiAction";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

const sampleActions = [
  { id: "a1", title: "Plant trees" },
  { id: "a2", title: "Build school" },
  { id: "a3", title: "Train volunteers" }
];
const sampleNodes = [
  { id: "n1", name: "Forest cover", unit: "ha" },
  { id: "n2", name: "Literacy", unit: "%" }
];

function setupPinia(uiAction) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const actions = useActionsStore(pinia);
  actions.$patch({ actions: sampleActions });
  ["addParent", "addChild", "addBlocker", "addBlockee", "deleteRelationship"].forEach(
    (name) => {
      actions[name] = vi.fn();
    }
  );
  useModelStore(pinia).$patch({ nodes: sampleNodes });
  useUiStore(pinia).$patch({ selectedActionId: "a1" });
  const uiActionStore = useUiActionStore(pinia);
  uiActionStore.$patch({ uiAction });
  return { pinia, actions, uiActionStore };
}

function mountWith(Comp, pinia, { props = {}, dialog } = {}) {
  return mount(Comp, {
    props,
    global: {
      plugins: [
        [Quasar, { components }],
        pinia,
        createI18n({ legacy: true, locale: "en-us", messages })
      ],
      mocks: {
        $q: { dialog: dialog || (() => ({ onOk: (cb) => cb() })) }
      },
      stubs: {
        "q-dialog": { template: "<div><slot /></div>" },
        "add-edit-impact": true
      }
    }
  });
}

describe("ActionRelationships.vue with Pinia", () => {
  const relUiAction = () => ({
    id: "a1",
    title: "Plant trees",
    parentActionId: "a2",
    childrenActionIds: ["a3"],
    blockerActionIds: ["a2"],
    blockeeActionIds: ["missing"]
  });

  it("renders related action titles from the actions store and excludes the selected action from options", () => {
    const { pinia } = setupPinia(relUiAction());
    const wrapper = mountWith(ActionRelationships, pinia);
    const text = wrapper.text();
    expect(text).toContain("Build school");
    expect(text).toContain("Train volunteers");
    // unknown related ids fall back to the generic label
    expect(wrapper.vm.getActionTitle("missing")).toBe("(some action)");
    expect(wrapper.vm.actionOptions).toEqual([
      { label: "Build school", value: "a2" },
      { label: "Train volunteers", value: "a3" }
    ]);
    expect(wrapper.vm.filteredActionOptions).toEqual(wrapper.vm.actionOptions);
  });

  it("filters the action options by the typed text", () => {
    const { pinia } = setupPinia(relUiAction());
    const wrapper = mountWith(ActionRelationships, pinia);
    wrapper.vm.filterFn("TRAIN", (fn) => fn());
    expect(wrapper.vm.filteredActionOptions).toEqual([
      { label: "Train volunteers", value: "a3" }
    ]);
    wrapper.vm.filterFn("", (fn) => fn());
    expect(wrapper.vm.filteredActionOptions).toHaveLength(2);
    expect(wrapper.vm.abortFilterFn()).toBeUndefined();
  });

  it("reads and writes relationship fields through the uiAction store", () => {
    const { pinia, uiActionStore } = setupPinia(relUiAction());
    const wrapper = mountWith(ActionRelationships, pinia);
    expect(wrapper.vm.childrenActionIds).toEqual(["a3"]);
    expect(wrapper.vm.parentActionId).toBe("a2");
    wrapper.vm.childrenActionIds = ["a2", "a3"];
    expect(uiActionStore.uiAction.childrenActionIds).toEqual(["a2", "a3"]);
    expect(uiActionStore.uiActionChanged).toBe(true);
    expect(uiActionStore.uiActionChangedFields).toContain("childrenActionIds");
  });

  it("deletes each relationship type with the right payload after confirmation", () => {
    const { pinia, actions } = setupPinia(relUiAction());
    const wrapper = mountWith(ActionRelationships, pinia);
    wrapper.vm.promptToDelete("a2", "parent-child");
    wrapper.vm.promptToDelete("a2", "child-parent");
    wrapper.vm.promptToDelete("a3", "blockee-blocker");
    wrapper.vm.promptToDelete("a3", "blocker-blockee");
    expect(actions.deleteRelationship.mock.calls.map((c) => c[0])).toEqual([
      { type: "nesting", parent: "a1", child: "a2" },
      { type: "nesting", child: "a1", parent: "a2" },
      { type: "blocking", blockee: "a1", blocker: "a3" },
      { type: "blocking", blocker: "a1", blockee: "a3" }
    ]);
    expect(() => wrapper.vm.promptToDelete("a3", "sideways")).toThrow(
      "Delete relationship type sideways not found."
    );
  });

  it("does not delete when the confirmation is not accepted", () => {
    const { pinia, actions } = setupPinia(relUiAction());
    const wrapper = mountWith(ActionRelationships, pinia, {
      dialog: () => ({ onOk: () => {} })
    });
    wrapper.vm.promptToDelete("a2", "parent-child");
    expect(actions.deleteRelationship).not.toHaveBeenCalled();
  });

  it("adds a child through the actions store when the add button is clicked", async () => {
    const { pinia, actions } = setupPinia({ ...relUiAction(), parentActionId: null });
    const wrapper = mountWith(ActionRelationships, pinia);
    wrapper.vm.childToAdd = "a3";
    await wrapper.vm.$nextTick();
    const addButton = wrapper.findAll("button").find((b) => b.text() === "add");
    await addButton.trigger("click");
    expect(actions.addChild).toHaveBeenCalledWith("a3");
    expect(wrapper.vm.childToAdd).toBeNull();
  });
});

describe("Impacts.vue with Pinia", () => {
  const impactsUiAction = () => ({
    id: "a1",
    title: "Plant trees",
    impacts: [
      {
        id: 11,
        impactType: "if_done",
        hasDeadline: false,
        nodeId: "n1",
        operation: "+",
        operand: "1500",
        durationType: "for_period",
        durationNumber: 6,
        durationUnit: "months"
      },
      {
        id: 12,
        impactType: "if_not_done",
        hasDeadline: true,
        deadline: "2027-01-01",
        nodeId: "unknown-node",
        operation: "*",
        operand: "2",
        durationType: "forever"
      }
    ]
  });

  it("lists the uiAction impacts with factor names, symbols and durations", () => {
    const { pinia } = setupPinia(impactsUiAction());
    const wrapper = mountWith(Impacts, pinia);
    const text = wrapper.text();
    expect(text).toContain("If done");
    expect(text).toContain("Forest cover");
    expect(text).toContain("1,500");
    expect(text).toContain("for period of");
    expect(text).toContain("months");
    expect(text).toContain("if not done");
    expect(text).toContain("by deadline");
    expect(text).toContain("unknown-node");
    expect(text).toContain("×");
    expect(wrapper.vm.title).toBe("Plant trees");
  });

  it("finds the impact to edit by id", async () => {
    const { pinia } = setupPinia(impactsUiAction());
    const wrapper = mountWith(Impacts, pinia);
    expect(wrapper.vm.impactToEdit).toBeNull();
    wrapper.vm.editImpactId = 12;
    expect(wrapper.vm.impactToEdit.operand).toBe("2");
  });

  it("deletes an impact from the uiAction store after confirmation", () => {
    const { pinia, uiActionStore } = setupPinia(impactsUiAction());
    const wrapper = mountWith(Impacts, pinia);
    wrapper.vm.promptToDelete(11);
    expect(uiActionStore.uiAction.impacts.map((i) => i.id)).toEqual([12]);
    expect(uiActionStore.uiActionChanged).toBe(true);
    expect(uiActionStore.uiActionChangedFields).toContain("impacts");
  });

  it("writes title and impacts through updateUiActionField", () => {
    const { pinia, uiActionStore } = setupPinia(impactsUiAction());
    const wrapper = mountWith(Impacts, pinia);
    wrapper.vm.title = "Plant more trees";
    wrapper.vm.impacts = [];
    expect(uiActionStore.uiAction.title).toBe("Plant more trees");
    expect(uiActionStore.uiAction.impacts).toEqual([]);
    expect(uiActionStore.uiActionChangedFields).toEqual(
      expect.arrayContaining(["title", "impacts"])
    );
  });

  it("opens the edit dialog state when the edit button is clicked", async () => {
    const { pinia } = setupPinia(impactsUiAction());
    const wrapper = mountWith(Impacts, pinia);
    const editBtn = wrapper.findAll("button").find((b) => b.text().includes("edit"));
    await editBtn.trigger("click");
    expect(wrapper.vm.editImpactId).toBe(11);
    expect(wrapper.vm.showEditImpact).toBe(true);
  });
});

describe("SimpleCostsAndImpacts.vue with Pinia", () => {
  const costsAndImpacts = {
    includedActionIds: ["a2", "zz"],
    impacts: [
      {
        id: 1,
        impactType: "if_done",
        hasDeadline: false,
        nodeId: "n2",
        operation: "-",
        operand: 3,
        durationType: "with_half_life",
        durationNumber: 2,
        durationUnit: "years"
      }
    ],
    outstandingDirectEffortHrs: 10,
    estEffortHrs: 20,
    outstandingDirectEffortCosts: 300,
    estEffortCosts: 600,
    outstandingSpending: 1000,
    estSpending: 2500,
    outstandingDirectCosts: 1300,
    estDirectCosts: 3100
  };

  it("renders included actions, impacts and cost totals from the stores and props", () => {
    const { pinia } = setupPinia({ id: "a1" });
    const wrapper = mountWith(SimpleCostsAndImpacts, pinia, { props: { costsAndImpacts } });
    const text = wrapper.text();
    expect(text).toContain("Build school");
    expect(text).toContain("zz");
    expect(text).toContain("Literacy");
    expect(text).toContain("with half life of");
    expect(text).toContain("years");
    expect(text).toContain("Outstanding effort:");
    expect(text).toContain("Outstanding direct costs:");
    expect(wrapper.vm.getImpactTypeIfClause("if_not_done")).toBe("if not done");
    expect(wrapper.vm.getNodeName("nope")).toBe("nope");
  });

  it("renders nothing without costs and impacts", () => {
    const { pinia } = setupPinia({ id: "a1" });
    const wrapper = mountWith(SimpleCostsAndImpacts, pinia, { props: { costsAndImpacts: null } });
    expect(wrapper.text()).toBe("");
  });
});
