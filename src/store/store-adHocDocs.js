import { firebaseDb } from "@/boot/firebase";
import { doc } from "firebase/firestore";
import { firestoreAction } from "./firestore-bind";

const state = {
  appSummary: null,
  exchangeRates: null
};

const mutations = {};

const actions = {
  bindAppSummary: firestoreAction(({ bindFirestoreRef }) => {
    return bindFirestoreRef(
      "appSummary",
      doc(firebaseDb, "adHocDocs", "appSummary"),
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
      doc(firebaseDb, "adHocDocs", "exchangeRates"),
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
