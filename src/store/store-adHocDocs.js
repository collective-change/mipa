import { firebaseDb, firebaseAuth } from "boot/firebase";
import { firestoreAction } from "vuexfire";

const state = {
  appSummary: null,
  exchangeRates: null
};

const mutations = {};

const actions = {
  bindAppSummary: firestoreAction(({ bindFirestoreRef }) => {
    return bindFirestoreRef(
      "appSummary",
      firebaseDb.collection("adHocDocs").doc("appSummary"),
      {
        maxRefDepth: 1,
        wait: true //this also forces reset: false
      }
    );
  }),
  unbindAppSummary: firestoreAction(({ unbindFirestoreRef }) => {
    unbindFirestoreRef("appSummary", false); //don't reset data when unbinding
  }),

  bindExchangeRates: firestoreAction(({ bindFirestoreRef }) => {
    return bindFirestoreRef(
      "exchangeRates",
      firebaseDb.collection("adHocDocs").doc("exchangeRates"),
      {
        maxRefDepth: 1,
        wait: true //this also forces reset: false
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
