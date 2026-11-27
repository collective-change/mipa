import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStore } from "vuex";
import uiActionModule from "@/store/store-uiAction";

function makeTestStore() {
  const updateActionSpy = vi.fn();

  Object.assign(uiActionModule.state, {
    uiAction: {},
    uiActionChanged: false,
    uiActionChangedFields: []
  });

  const store = createStore({
    modules: {
      uiAction: uiActionModule,
      actions: {
        namespaced: true,
        actions: {
          updateAction: updateActionSpy
        }
      }
    }
  });

  return { store, updateActionSpy };
}

describe("store-uiAction characterization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("setUiAction initializes missing newly-added properties and nodeIdsToChart, while preserving existing values and resetting dirty flags", async () => {
    const { store } = makeTestStore();
    store.commit("uiAction/setUiActionChanged", true);

    await store.dispatch("uiAction/setUiAction", {
      id: "act-1",
      title: "Install Heat Pumps",
      impacts: [],
      departmentTag: "engineering"
    });

    const ua = store.state.uiAction.uiAction;
    expect(ua.id).toBe("act-1");
    expect(ua.title).toBe("Install Heat Pumps");
    expect(ua.nodeIdsToChart).toEqual([]);
    expect(ua.departmentTag).toBe("engineering"); // existing value preserved
    expect(ua.useSimpleEstimateMethod).toBe(false);
    expect(ua.simpleEstimateTotalBenefit).toBeNull();
    expect(ua.simpleEstimateTotalBenefitNotes).toBeNull();
    expect(ua.simpleEstimateOtherCosts).toBeNull();
    expect(ua.simpleEstimateOtherCostsNotes).toBeNull();
    expect(ua.effortCostNodeId).toBeNull();
    expect(ua.climatePressure).toBeNull();
    expect(ua.sdgTargets).toEqual([]);
    expect(ua.counterfactual).toBeNull();
    expect(store.state.uiAction.uiActionChanged).toBe(false);
    expect(store.state.uiAction.uiActionChangedFields).toEqual([]);
  });

  it("updateUiActionField ignores updates when uiAction has no id, marks user edits dirty, and ignores computed/machine fields for dirty tracking", async () => {
    const { store } = makeTestStore();

    // No id yet -> no-op
    store.commit("uiAction/updateUiActionField", { path: "uiAction.title", value: "Ignored" });
    expect(store.state.uiAction.uiAction.title).toBeUndefined();
    expect(store.state.uiAction.uiActionChanged).toBe(false);

    await store.dispatch("uiAction/setUiAction", { id: "act-2", title: "Original", impacts: [] });

    // Ignored fields update value without setting uiActionChanged
    const ignoredFields = [
      "actionMchState",
      "ownDirectCost",
      "outstandingDirectCost",
      "sunkenDirectCost",
      "outstandingDirectEffortHrs",
      "outstandingDirectEffortCost",
      "outstandingSpending"
    ];
    for (const field of ignoredFields) {
      store.commit("uiAction/updateUiActionField", { path: `uiAction.${field}`, value: 123 });
    }
    expect(store.state.uiAction.uiAction.ownDirectCost).toBe(123);
    expect(store.state.uiAction.uiActionChanged).toBe(false);
    expect(store.state.uiAction.uiActionChangedFields).toEqual([]);

    // User-edited fields mark uiActionChanged = true and deduplicate uiActionChangedFields
    store.commit("uiAction/updateUiActionField", { path: "uiAction.title", value: "Edited Title" });
    store.commit("uiAction/updateUiActionField", { path: "uiAction.title", value: "Edited Title 2" });
    store.commit("uiAction/updateUiActionField", { path: "uiAction.estEffortHrs", value: 40 });

    expect(store.state.uiAction.uiAction.title).toBe("Edited Title 2");
    expect(store.state.uiAction.uiAction.estEffortHrs).toBe(40);
    expect(store.state.uiAction.uiActionChanged).toBe(true);
    expect(store.state.uiAction.uiActionChangedFields).toEqual(["title", "estEffortHrs"]);
  });

  it("mergeNewActionToUiAction keeps locally changed fields while accepting fresh server values for untouched fields", async () => {
    const { store } = makeTestStore();
    await store.dispatch("uiAction/setUiAction", {
      id: "act-3",
      title: "Initial Title",
      notes: "Initial Notes",
      actionLeverage: 2.5,
      impacts: []
    });

    // User edits title locally, leaving notes and actionLeverage untouched
    store.commit("uiAction/updateUiActionField", { path: "uiAction.title", value: "User Unsaved Title" });

    store.commit("uiAction/mergeNewActionToUiAction", {
      id: "act-3",
      title: "Server Old Title",
      notes: "Updated Server Notes",
      actionLeverage: 9.8
    });

    expect(store.state.uiAction.uiAction.id).toBe("act-3");
    expect(store.state.uiAction.uiAction.title).toBe("User Unsaved Title");
    expect(store.state.uiAction.uiAction.notes).toBe("Updated Server Notes");
    expect(store.state.uiAction.uiAction.actionLeverage).toBe(9.8);
  });

  it("setActionMchState clones state object and impact mutations manage impacts and dirty tracking", async () => {
    const { store } = makeTestStore();
    await store.dispatch("uiAction/setUiAction", {
      id: "act-4",
      title: "Action 4",
      impacts: []
    });

    const rawMch = { value: "approved" };
    store.commit("uiAction/setActionMchState", rawMch);
    expect(store.state.uiAction.uiAction.actionMchState).toEqual({ value: "approved" });
    expect(store.state.uiAction.uiAction.actionMchState).not.toBe(rawMch);

    // Add impact
    store.commit("uiAction/addImpact", { id: "imp-1", nodeId: "n1", operation: "+", operand: "10" });
    expect(store.state.uiAction.uiAction.impacts).toHaveLength(1);
    expect(store.state.uiAction.uiActionChanged).toBe(true);
    expect(store.state.uiAction.uiActionChangedFields).toEqual(["impacts"]);

    // Update impact
    store.commit("uiAction/updateImpact", { id: "imp-1", nodeId: "n1", operation: "+", operand: "25" });
    expect(store.state.uiAction.uiAction.impacts[0].operand).toBe("25");
    expect(store.state.uiAction.uiActionChangedFields).toEqual(["impacts"]);

    // Delete impact
    store.commit("uiAction/setUiActionChanged", false);
    store.commit("uiAction/deleteImpact", "imp-1");
    expect(store.state.uiAction.uiAction.impacts).toEqual([]);
    expect(store.state.uiAction.uiActionChanged).toBe(true);
  });

  it("manages nodeIdsToChart actions and dispatches actions/updateAction only when needed", async () => {
    const { store, updateActionSpy } = makeTestStore();
    await store.dispatch("uiAction/setUiAction", {
      id: "act-5",
      title: "Charted Action",
      impacts: [],
      nodeIdsToChart: ["n1"]
    });

    // Adding an existing nodeId does not dispatch updateAction
    await store.dispatch("uiAction/addNodeIdToChart", "n1");
    expect(updateActionSpy).not.toHaveBeenCalled();

    // Adding a new nodeId appends and dispatches updateAction
    await store.dispatch("uiAction/addNodeIdToChart", "n2");
    expect(store.state.uiAction.uiAction.nodeIdsToChart).toEqual(["n1", "n2"]);
    expect(updateActionSpy).toHaveBeenCalledTimes(1);
    expect(updateActionSpy.mock.calls[0][1]).toEqual({
      id: "act-5",
      updates: { nodeIdsToChart: ["n1", "n2"] }
    });

    // Batch adding already-present nodeIds does not dispatch
    updateActionSpy.mockClear();
    await store.dispatch("uiAction/addNodeIdsToChart", ["n1", "n2"]);
    expect(updateActionSpy).not.toHaveBeenCalled();

    // Batch adding with at least one new nodeId appends unique IDs and dispatches once
    await store.dispatch("uiAction/addNodeIdsToChart", ["n2", "n3"]);
    expect(store.state.uiAction.uiAction.nodeIdsToChart).toEqual(["n1", "n2", "n3"]);
    expect(updateActionSpy).toHaveBeenCalledTimes(1);

    // Reordering via setNodeIdsToChart updates array and dispatches; non-array is ignored
    updateActionSpy.mockClear();
    await store.dispatch("uiAction/setNodeIdsToChart", ["n3", "n1"]);
    expect(store.state.uiAction.uiAction.nodeIdsToChart).toEqual(["n3", "n1"]);
    expect(updateActionSpy).toHaveBeenCalledTimes(1);

    await store.dispatch("uiAction/setNodeIdsToChart", null);
    expect(store.state.uiAction.uiAction.nodeIdsToChart).toEqual(["n3", "n1"]);

    // Removing a nodeId splices it and dispatches updateAction
    updateActionSpy.mockClear();
    await store.dispatch("uiAction/removeNodeIdToChart", "n3");
    expect(store.state.uiAction.uiAction.nodeIdsToChart).toEqual(["n1"]);
    expect(updateActionSpy).toHaveBeenCalledTimes(1);
  });
});
