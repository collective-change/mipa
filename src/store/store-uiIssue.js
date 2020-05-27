import { getField, updateField } from "vuex-map-fields";

const state = {
  uiIssue: {
    title: "test title"
  }
};

const mutations = {
  setUiIssue(state, issue) {
    state.uiIssue = issue;
  },
  updateField
};
const actions = {
  setUiIssue({ commit }, issue) {
    commit("setUiIssue", issue);
  }
};

const getters = { getField };

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters
};
