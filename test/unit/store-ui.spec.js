import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStore } from "vuex";
import uiModule from "@/store/store-ui";

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

  // Reset module state before each test since Vuex module state in store-ui.js is an object literal
  Object.assign(uiModule.state, {
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

  const store = createStore({
    modules: {
      ui: uiModule
    }
  });
  store.$router = router;
  return { store, router };
}

describe("store-ui characterization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with expected default UI selection and dirty flags", () => {
    const { store } = makeTestStore();
    expect(store.state.ui).toEqual({
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

  it("setSelectedNodeId selects initial node without router.replace, and calls router.replace when switching from an already-selected node", async () => {
    const { store, router } = makeTestStore("node-1");

    // Initial selection when selectedNodeId is null: does not call router.replace
    await store.dispatch("ui/setSelectedNodeId", "node-1");
    expect(store.state.ui.selectedNodeId).toBe("node-1");
    expect(router.replace).not.toHaveBeenCalled();

    // Mark dirty before switching nodes
    store.commit("ui/setUiNodeChanged", true);
    store.commit("ui/addUiNodeChangedFields", ["name", "unit"]);
    expect(store.state.ui.uiNodeChanged).toBe(true);
    expect(store.state.ui.uiNodeChangedFields).toEqual(["name", "unit"]);

    // Switching from node-1 to node-2 when route param is still node-1 calls router.replace and resets dirty state
    await store.dispatch("ui/setSelectedNodeId", "node-2");
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith({
      name: "model-node",
      params: { nodeId: "node-2" }
    });
    expect(store.state.ui.selectedNodeId).toBe("node-2");
    expect(store.state.ui.uiNodeChanged).toBe(false);
    expect(store.state.ui.uiNodeChangedFields).toEqual([]);

    // Selecting the same node again does not call router.replace
    router.replace.mockClear();
    await store.dispatch("ui/setSelectedNodeId", "node-2");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("setUiNodeChanged(false) clears uiNodeChangedFields while true preserves them, and addUiNodeChangedFields deduplicates", () => {
    const { store } = makeTestStore();

    store.commit("ui/addUiNodeChangedFields", ["name", "symbol"]);
    store.commit("ui/addUiNodeChangedFields", ["symbol", "symbolFormula"]);
    store.commit("ui/setUiNodeChanged", true);

    expect(store.state.ui.uiNodeChanged).toBe(true);
    expect(store.state.ui.uiNodeChangedFields).toEqual(["name", "symbol", "symbolFormula"]);

    store.commit("ui/setUiNodeChanged", false);
    expect(store.state.ui.uiNodeChanged).toBe(false);
    expect(store.state.ui.uiNodeChangedFields).toEqual([]);
  });

  it("updates node groups, circularNodeIds, and selected action/issue/situation IDs", async () => {
    const { store } = makeTestStore();

    store.commit("ui/setSelectedNodeGroupId", "grp-1");
    store.commit("ui/setExpandedNodeGroups", ["grp-1", "grp-2"]);
    await store.dispatch("ui/setSelectedIssueId", "iss-1");
    await store.dispatch("ui/setSelectedActionId", "act-1");
    await store.dispatch("ui/setSelectedSituationId", "sit-1");
    await store.dispatch("ui/setCircularNodeIds", ["n1", "n2"]);

    expect(store.state.ui.selectedNodeGroupId).toBe("grp-1");
    expect(store.state.ui.expandedNodeGroups).toEqual(["grp-1", "grp-2"]);
    expect(store.state.ui.selectedIssueId).toBe("iss-1");
    expect(store.state.ui.selectedActionId).toBe("act-1");
    expect(store.state.ui.selectedSituationId).toBe("sit-1");
    expect(store.state.ui.circularNodeIds).toEqual(["n1", "n2"]);
  });
});
