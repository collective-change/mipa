import { defineStore } from "pinia";

export const useUiStore = defineStore("ui", {
  state: () => ({
    selectedNodeId: null,
    selectedNodeGroupId: null,
    uiNodeChanged: false,
    uiNodeChangedFields: [],
    selectedIssueId: null,
    selectedActionId: null,
    selectedSituationId: null,
    expandedNodeGroups: null,
    circularNodeIds: null
  }),

  actions: {
    setSelectedNodeId(nodeId) {
      if (
        this.selectedNodeId != null &&
        this.$router?.currentRoute?.value?.params?.nodeId != nodeId &&
        this.selectedNodeId != nodeId
      ) {
        this.$router.replace({
          name: "model-node",
          params: {
            nodeId
          }
        });
      }
      this.selectedNodeId = nodeId;
      this.uiNodeChanged = false;
      this.uiNodeChangedFields = [];
    },

    setSelectedNodeGroupId(nodeGroupId) {
      this.selectedNodeGroupId = nodeGroupId;
    },

    setExpandedNodeGroups(expandedNodeGroups) {
      this.expandedNodeGroups = expandedNodeGroups;
    },

    setUiNodeChanged(value) {
      this.uiNodeChanged = value;
      if (value == false) {
        this.uiNodeChangedFields = [];
      }
    },

    addUiNodeChangedFields(differences) {
      const jointArray = [...this.uiNodeChangedFields, ...differences];
      this.uiNodeChangedFields = jointArray.filter(
        (item, index) => jointArray.indexOf(item) === index
      );
    },

    setSelectedIssueId(issueId) {
      this.selectedIssueId = issueId;
    },

    setSelectedActionId(actionId) {
      this.selectedActionId = actionId;
    },

    setSelectedSituationId(situationId) {
      this.selectedSituationId = situationId;
    },

    setCircularNodeIds(nodeIds) {
      this.circularNodeIds = nodeIds;
    }
  }
});

export default useUiStore;
