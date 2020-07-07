const state = {
  selectedNodeId: null,
  selectedNodeGroup: null,
  uiNodeChanged: false,
  uiNodeChangedFields: [],
  selectedIssueId: null,
  selectedActionId: null,
  selectedSituationId: null,
  visibilityOfNodeGroups: null
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
  setVisibilityOfNodeGroups(state, visibilityOfNodeGroups) {
    state.visibilityOfNodeGroups = visibilityOfNodeGroups;
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
