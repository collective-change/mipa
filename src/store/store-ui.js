const state = {
  selectedNodeId: null,
  selectedIssueId: null,
  selectedActionId: null,
  selectedSituationId: null
};

const mutations = {
  setSelectedNodeId(state, nodeId) {
    state.selectedNodeId = nodeId;
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
