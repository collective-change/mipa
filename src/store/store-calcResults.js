import { uid, Notify } from "quasar";
import { firebase, firebaseDb, firebaseAuth } from "boot/firebase";
import { firestoreAction } from "vuexfire";
import { showErrorMessage } from "src/utils/util-show-error-message";
import idb from "src/api/idb";

const state = {
  baseline: {},
  resultsOfAction: {}
};

const mutations = {
  setBaseline(state, baseline) {
    state.baseline = baseline;
  },
  setResultsOfAction(state, resultsOfAction) {
    state.resultsOfAction = resultsOfAction;
  },
  clearResultsOfAction(state) {
    state.resultsOfAction = {};
  }
};

const actions = {
  async saveBaseline({ dispatch }, baseline) {
    await idb.saveBaseline(baseline);
  },

  async loadBaseline({ commit }, modelId) {
    commit("setBaseline", await idb.getBaseline(modelId));
  },

  async loadResultsOfAction({ commit }, actionId) {
    commit("setResultsOfAction", await idb.getResultsOfAction(actionId));
  },

  clearResultsOfAction({ commit }, actionId) {
    commit("clearResultsOfAction");
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
