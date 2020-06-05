import { firebaseDb, firebaseAuth } from "boot/firebase";
import { firestoreAction } from "vuexfire";

const state = {
  exchangeRates: []
};

const mutations = {
  //synchronous
  clearIssues(state) {
    state.issues = {};
  },
  setSearch(state, value) {
    state.search = value;
  },
  setSort(state, value) {
    state.sort = value;
  },
  setIssuesDownloaded(state, value) {
    state.issuesDownloaded = value;
  }
};

const actions = {
  bindExchangeRates: firestoreAction(({ bindFirestoreRef }) => {
    return bindFirestoreRef(
      "exchangeRates",
      firebaseDb.collection("adHocDocs").doc("exchangeRates"),
      {
        maxRefDepth: 1,
        reset: false,
        wait: true
      }
    );
  }),
  unbindExchangeRates: firestoreAction(({ unbindFirestoreRef }) => {
    unbindFirestoreRef("exchangeRates", false); //don't reset data when unbinding
  })
};

const getters = {};

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters
};
