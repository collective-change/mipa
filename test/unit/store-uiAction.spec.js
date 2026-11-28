import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const updateActionSpy = vi.fn();
vi.mock("@/store/store-actions", () => ({
  useActionsStore: () => ({
    updateAction: (...args) => updateActionSpy(...args)
  })
}));

const { useUiActionStore } = await import("@/store/store-uiAction");

describe("store-uiAction (Pinia)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it("setUiAction initializes missing newly-added properties and nodeIdsToChart, while preserving existing values and resetting dirty flags", () => {
    const store = useUiActionStore();
    store.setUiActionChanged(true);

    store.setUiAction({
      id: "act-1",
      title: "Install Heat Pumps",
      impacts: [],
      departmentTag: "engineering"
    });

    const ua = store.uiAction;
    expect(ua.id).toBe("act-1");
    expect(ua.title).toBe("Install Heat Pumps");
    expect(ua.nodeIdsToChart).toEqual([]);
    expect(ua.departmentTag).toBe("engineering");
    expect(ua.useSimpleEstimateMethod).toBe(false);
    expect(ua.simpleEstimateTotalBenefit).toBeNull();
    expect(ua.simpleEstimateTotalBenefitNotes).toBeNull();
    expect(ua.simpleEstimateOtherCosts).toBeNull();
    expect(ua.simpleEstimateOtherCostsNotes).toBeNull();
    expect(ua.effortCostNodeId).toBeNull();
    expect(ua.climatePressure).toBeNull();
    expect(ua.sdgTargets).toEqual([]);
    expect(ua.counterfactual).toBeNull();
    expect(store.uiActionChanged).toBe(false);
    expect(store.uiActionChangedFields).toEqual([]);

    store.setUiAction(null);
    expect(store.uiAction).toEqual({});
  });

  it("updateUiActionField ignores updates when uiAction has no id, marks user edits dirty, and ignores computed/machine fields for dirty tracking", () => {
    const store = useUiActionStore();

    store.updateUiActionField({ path: "uiAction.title", value: "Ignored" });
    expect(store.uiAction.title).toBeUndefined();
    expect(store.uiActionChanged).toBe(false);

    store.setUiAction({ id: "act-2", title: "Original", impacts: [] });

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
      store.updateUiActionField({ path: `uiAction.${field}`, value: 123 });
    }
    expect(store.uiAction.ownDirectCost).toBe(123);
    expect(store.uiActionChanged).toBe(false);
    expect(store.uiActionChangedFields).toEqual([]);

    store.updateUiActionField({ path: "uiAction.title", value: "Edited Title" });
    store.updateUiActionField({ path: "uiAction.title", value: "Edited Title 2" });
    store.updateUiActionField({ path: "uiAction.estEffortHrs", value: 40 });

    expect(store.uiAction.title).toBe("Edited Title 2");
    expect(store.uiAction.estEffortHrs).toBe(40);
    expect(store.uiActionChanged).toBe(true);
    expect(store.uiActionChangedFields).toEqual(["title", "estEffortHrs"]);
  });

  it("mergeNewActionToUiAction keeps locally changed fields while accepting fresh server values for untouched fields", () => {
    const store = useUiActionStore();
    store.setUiAction({
      id: "act-3",
      title: "Initial Title",
      notes: "Initial Notes",
      actionLeverage: 2.5,
      impacts: []
    });

    store.updateUiActionField({ path: "uiAction.title", value: "User Unsaved Title" });

    store.mergeNewActionToUiAction({
      id: "act-3",
      title: "Server Old Title",
      notes: "Updated Server Notes",
      actionLeverage: 9.8
    });

    expect(store.uiAction.id).toBe("act-3");
    expect(store.uiAction.title).toBe("User Unsaved Title");
    expect(store.uiAction.notes).toBe("Updated Server Notes");
    expect(store.uiAction.actionLeverage).toBe(9.8);
  });

  it("setActionMchState clones state object and impact actions manage impacts and dirty tracking", () => {
    const store = useUiActionStore();
    store.setUiAction({
      id: "act-4",
      title: "Action 4",
      impacts: []
    });

    const rawMch = { value: "approved" };
    store.setActionMchState(rawMch);
    expect(store.uiAction.actionMchState).toEqual({ value: "approved" });
    expect(store.uiAction.actionMchState).not.toBe(rawMch);

    store.addImpact({ id: "imp-1", nodeId: "n1", operation: "+", operand: "10" });
    expect(store.uiAction.impacts).toHaveLength(1);
    expect(store.uiActionChanged).toBe(true);
    expect(store.uiActionChangedFields).toEqual(["impacts"]);

    store.updateImpact({ id: "imp-1", nodeId: "n1", operation: "+", operand: "25" });
    expect(store.uiAction.impacts[0].operand).toBe("25");
    expect(store.uiActionChangedFields).toEqual(["impacts"]);

    store.setUiActionChanged(false);
    store.deleteImpact("imp-1");
    expect(store.uiAction.impacts).toEqual([]);
    expect(store.uiActionChanged).toBe(true);
  });

  it("manages nodeIdsToChart actions and calls actionsStore.updateAction only when needed", async () => {
    const store = useUiActionStore();
    store.setUiAction({
      id: "act-5",
      title: "Charted Action",
      impacts: [],
      nodeIdsToChart: ["n1"]
    });

    await store.addNodeIdToChart("n1");
    expect(updateActionSpy).not.toHaveBeenCalled();

    await store.addNodeIdToChart("n2");
    expect(store.uiAction.nodeIdsToChart).toEqual(["n1", "n2"]);
    expect(updateActionSpy).toHaveBeenCalledTimes(1);
    expect(updateActionSpy).toHaveBeenCalledWith({
      id: "act-5",
      updates: { nodeIdsToChart: ["n1", "n2"] }
    });

    updateActionSpy.mockClear();
    await store.addNodeIdsToChart(["n1", "n2"]);
    expect(updateActionSpy).not.toHaveBeenCalled();

    await store.addNodeIdsToChart(["n2", "n3"]);
    expect(store.uiAction.nodeIdsToChart).toEqual(["n1", "n2", "n3"]);
    expect(updateActionSpy).toHaveBeenCalledTimes(1);

    updateActionSpy.mockClear();
    await store.setNodeIdsToChart(["n3", "n1"]);
    expect(store.uiAction.nodeIdsToChart).toEqual(["n3", "n1"]);
    expect(updateActionSpy).toHaveBeenCalledTimes(1);

    await store.setNodeIdsToChart(null);
    expect(store.uiAction.nodeIdsToChart).toEqual(["n3", "n1"]);

    updateActionSpy.mockClear();
    await store.removeNodeIdToChart("n3");
    expect(store.uiAction.nodeIdsToChart).toEqual(["n1"]);
    expect(updateActionSpy).toHaveBeenCalledTimes(1);
  });

  it("updateUiActionField writes nested and bracketed paths, creating missing objects, and tracks the root field", () => {
    const store = useUiActionStore();
    store.setUiAction({
      id: "act-6",
      impacts: [{ id: "imp-1", operand: "1" }]
    });

    store.updateUiActionField({ path: "uiAction.counterfactualDetails.source.name", value: "Census" });
    expect(store.uiAction.counterfactualDetails).toEqual({ source: { name: "Census" } });

    store.updateUiActionField({ path: "uiAction.impacts[0].operand", value: "7" });
    expect(store.uiAction.impacts[0]).toEqual({ id: "imp-1", operand: "7" });

    expect(store.uiActionChanged).toBe(true);
    expect(store.uiActionChangedFields).toEqual(["counterfactualDetails", "impacts"]);
  });

  it("updateImpact and deleteImpact mark impacts as changed when nothing was changed before", () => {
    const store = useUiActionStore();
    store.setUiAction({
      id: "act-7",
      impacts: [
        { id: "imp-1", operand: "1" },
        { id: "imp-2", operand: "2" }
      ]
    });

    store.updateImpact({ id: "imp-2", operand: "20" });
    expect(store.uiAction.impacts.map((i) => i.operand)).toEqual(["1", "20"]);
    expect(store.uiActionChanged).toBe(true);
    expect(store.uiActionChangedFields).toEqual(["impacts"]);

    store.setUiAction({
      id: "act-8",
      impacts: [{ id: "imp-1", operand: "1" }]
    });
    expect(store.uiActionChangedFields).toEqual([]);
    store.deleteImpact("imp-1");
    expect(store.uiAction.impacts).toEqual([]);
    expect(store.uiActionChanged).toBe(true);
    expect(store.uiActionChangedFields).toEqual(["impacts"]);
  });

  it("removeNodeIdToChart still persists when the factor was not charted", async () => {
    const store = useUiActionStore();
    store.setUiAction({ id: "act-9", impacts: [], nodeIdsToChart: ["n1"] });
    await store.removeNodeIdToChart("missing");
    expect(store.uiAction.nodeIdsToChart).toEqual(["n1"]);
    expect(updateActionSpy).toHaveBeenCalledWith({
      id: "act-9",
      updates: { nodeIdsToChart: ["n1"] }
    });
  });
});
