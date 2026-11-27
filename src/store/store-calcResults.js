import { defineStore } from "pinia";
import idb from "@/api/idb";

export const useCalcResultsStore = defineStore("calcResults", {
  state: () => ({
    baseline: {},
    resultsOfAction: {}
  }),

  actions: {
    setBaseline(baseline) {
      this.baseline = baseline;
    },

    setResultsOfAction(resultsOfAction) {
      this.resultsOfAction = resultsOfAction;
    },

    async saveBaseline(baseline) {
      await idb.saveBaseline(baseline);
    },

    async loadBaseline(modelId) {
      this.setBaseline(await idb.getBaseline(modelId));
    },

    async loadResultsOfAction(actionId) {
      this.setResultsOfAction(await idb.getResultsOfAction(actionId));
    },

    clearResultsOfAction() {
      this.resultsOfAction = {};
    }
  }
});

export default useCalcResultsStore;
