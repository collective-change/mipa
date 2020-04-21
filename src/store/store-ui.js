const state = {
  selectedNodeId: null,
  selectedIssueId: null,
};

const mutations = {
  setSelectedNodeId(state, nodeId) {
    state.selectedNodeId = nodeId;
  },
  setSelectedIssueId(state, issueId) {
    state.selectedIssueId = issueId;
  },
};
const actions = {
  setSelectedNodeId({ commit }, nodeId) {
    commit("setSelectedNodeId", nodeId);
  },
  setSelectedIssueId({ commit }, issueId) {
    commit("setSelectedIssueId", issueId);
  },
};

const getters = {};

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters,
};
