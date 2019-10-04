const state = {
  selectedNodeId: null
};

const mutations = {
  setSelectedNodeId(state, nodeId) {
    state.selectedNodeId = nodeId;
  }
};
const actions = {
  setSelectedNodeId({ commit }, nodeId) {
    commit("setSelectedNodeId", nodeId);
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
