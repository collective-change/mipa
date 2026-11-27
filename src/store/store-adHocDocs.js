import { defineStore } from "pinia";
import { firebaseDb } from "@/boot/firebase";
import { doc } from "firebase/firestore";
import { firestoreAction } from "./firestore-bind";

export const useAdHocDocsStore = defineStore("adHocDocs", {
  state: () => ({
    appSummary: null,
    exchangeRates: null
  }),

  actions: {
    bindAppSummary: firestoreAction(({ bindFirestoreRef }) => {
      return bindFirestoreRef(
        "appSummary",
        doc(firebaseDb, "adHocDocs", "appSummary"),
        {
          wait: true // this also forces reset: false
        }
      );
    }),

    unbindAppSummary: firestoreAction(({ unbindFirestoreRef }) => {
      unbindFirestoreRef("appSummary", false); // don't reset data when unbinding
    }),

    bindExchangeRates: firestoreAction(({ bindFirestoreRef }) => {
      return bindFirestoreRef(
        "exchangeRates",
        doc(firebaseDb, "adHocDocs", "exchangeRates"),
        {
          wait: true // this also forces reset: false
        }
      );
    }),

    unbindExchangeRates: firestoreAction(({ unbindFirestoreRef }) => {
      unbindFirestoreRef("exchangeRates", false); // don't reset data when unbinding
    })
  }
});

export default useAdHocDocsStore;
