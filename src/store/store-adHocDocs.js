import { firebaseDb, firebaseAuth } from "boot/firebase";
import { firestoreAction } from "vuexfire";

const state = {
  exchangeRates: []
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

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters
};
