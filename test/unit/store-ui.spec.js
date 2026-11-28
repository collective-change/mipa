import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPiniaInstance } from "@/store/index";
import { useUiStore } from "@/store/store-ui";

function makeTestStore(routeNodeId = undefined) {
  const router = {
    currentRoute: {
      value: {
        params: {
          nodeId: routeNodeId
        }
      }
    },
    replace: vi.fn()
  };
  const pinia = createPiniaInstance(router);
  const store = useUiStore(pinia);
  return { store, router };
}

describe("store-ui (Pinia)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with expected default UI selection and dirty flags", () => {
    const { store } = makeTestStore();
    expect(store.$state).toEqual({
      selectedNodeId: null,
      selectedNodeGroupId: null,
      uiNodeChanged: false,
      uiNodeChangedFields: [],
      selectedIssueId: null,
      selectedActionId: null,
      selectedSituationId: null,
      expandedNodeGroups: null,
      circularNodeIds: null
    });
  });

  it("setSelectedNodeId selects initial node without router.replace, and calls router.replace when switching from an already-selected node", () => {
    const { store, router } = makeTestStore("node-1");

    store.setSelectedNodeId("node-1");
    expect(store.selectedNodeId).toBe("node-1");
    expect(router.replace).not.toHaveBeenCalled();

    store.setUiNodeChanged(true);
    store.addUiNodeChangedFields(["name", "unit"]);
    expect(store.uiNodeChanged).toBe(true);
    expect(store.uiNodeChangedFields).toEqual(["name", "unit"]);

    store.setSelectedNodeId("node-2");
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith({
      name: "model-node",
      params: { nodeId: "node-2" }
    });
    expect(store.selectedNodeId).toBe("node-2");
    expect(store.uiNodeChanged).toBe(false);
    expect(store.uiNodeChangedFields).toEqual([]);

    router.replace.mockClear();
    store.setSelectedNodeId("node-2");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("setUiNodeChanged(false) clears uiNodeChangedFields while true preserves them, and addUiNodeChangedFields deduplicates", () => {
    const { store } = makeTestStore();

    store.addUiNodeChangedFields(["name", "symbol"]);
    store.addUiNodeChangedFields(["symbol", "symbolFormula"]);
    store.setUiNodeChanged(true);

    expect(store.uiNodeChanged).toBe(true);
    expect(store.uiNodeChangedFields).toEqual(["name", "symbol", "symbolFormula"]);

    store.setUiNodeChanged(false);
    expect(store.uiNodeChanged).toBe(false);
    expect(store.uiNodeChangedFields).toEqual([]);
  });

  it("updates node groups, circularNodeIds, and selected action/issue/situation IDs", () => {
    const { store } = makeTestStore();

    store.setSelectedNodeGroupId("grp-1");
    store.setExpandedNodeGroups(["grp-1", "grp-2"]);
    store.setSelectedIssueId("iss-1");
    store.setSelectedActionId("act-1");
    store.setSelectedSituationId("sit-1");
    store.setCircularNodeIds(["n1", "n2"]);

    expect(store.selectedNodeGroupId).toBe("grp-1");
    expect(store.expandedNodeGroups).toEqual(["grp-1", "grp-2"]);
    expect(store.selectedIssueId).toBe("iss-1");
    expect(store.selectedActionId).toBe("act-1");
    expect(store.selectedSituationId).toBe("sit-1");
    expect(store.circularNodeIds).toEqual(["n1", "n2"]);
  });
});
