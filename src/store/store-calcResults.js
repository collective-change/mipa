const state = {
  baseline: null
};

const mutations = {
  setBaseline(state, baseline) {
    state.baseline = baseline;
  }
};
const actions = {
  setBaseline({ commit }, baseline) {
    commit("setBaseline", baseline);
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
