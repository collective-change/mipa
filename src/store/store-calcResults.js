import { uid, Notify } from "quasar";
import { firebase, firebaseDb, firebaseAuth } from "boot/firebase";
import { firestoreAction } from "vuexfire";
import { showErrorMessage } from "src/utils/util-show-error-message";
import idb from "src/api/idb";

const state = {
  baseline: {}
};

const mutations = {
  setBaseline(state, baseline) {
    state.baseline = baseline;
  }
};

const actions = {
  async saveBaseline({ dispatch }, baseline) {
    await idb.saveBaseline(baseline);
  },

  async loadBaseline({ commit }, id) {
    commit("setBaseline", await idb.getBaseline(id));
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
