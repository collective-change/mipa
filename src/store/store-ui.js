const state = {
  selectedNodeId: null,
  selectedNodeGroup: null,
  uiNodeChanged: false,
  uiNodeChangedFields: [],
  selectedIssueId: null,
  selectedActionId: null,
  selectedSituationId: null,
  expandedNodeGroups: null,
  circularNodeIds: null
};

const mutations = {
  setSelectedNodeId(state, nodeId) {
    state.selectedNodeId = nodeId;
    state.uiNodeChanged = false;
    state.uiNodeChangedFields = [];
  },
  setSelectedNodeGroup(state, nodeGroup) {
    state.selectedNodeGroup = nodeGroup;
  },
  setExpandedNodeGroups(state, expandedNodeGroups) {
    state.expandedNodeGroups = expandedNodeGroups;
  },
  setUiNodeChanged(state, value) {
    state.uiNodeChanged = value;
    if (value == false) state.uiNodeChangedFields = [];
  },
  addUiNodeChangedFields(state, differences) {
    let jointArray = [];
    jointArray = [...state.uiNodeChangedFields, ...differences];
    let uniqueArray = jointArray.filter(
      (item, index) => jointArray.indexOf(item) === index
    );
    state.uiNodeChangedFields = uniqueArray;
  },
  setSelectedIssueId(state, issueId) {
    state.selectedIssueId = issueId;
  },
  setSelectedActionId(state, actionId) {
    state.selectedActionId = actionId;
  },
  setSelectedSituationId(state, situationId) {
    state.selectedSituationId = situationId;
  },
  setCircularNodeIds(state, nodeIds) {
    state.circularNodeIds = nodeIds;
  }
};
const actions = {
  setSelectedNodeId({ commit }, nodeId) {
    commit("setSelectedNodeId", nodeId);
  },
  setSelectedIssueId({ commit }, issueId) {
    commit("setSelectedIssueId", issueId);
  },
  setSelectedActionId({ commit }, actionId) {
    commit("setSelectedActionId", actionId);
  },
  setSelectedSituationId({ commit }, situationId) {
    commit("setSelectedSituationId", situationId);
  },
  setCircularNodeIds({ commit }, nodeIds) {
    commit("setCircularNodeIds", nodeIds);
  }
};

const getters = {};

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters
};
