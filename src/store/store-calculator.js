import { uid, Notify } from "quasar";
import { showErrorMessage } from "src/utils/util-show-error-message";
//import { firebase, firebaseDb, firebaseAuth } from "boot/firebase";
//import { firestoreAction } from "vuexfire";

const state = {
  calculatorIsRunning: false,
  calculationProgress: 0,
  calculationProgressLabel: ""
};

const mutations = {
  setCalculatorIsRunning(state, value) {
    state.calculatorIsRunning = value;
  },
  setCalculationProgress(state, value) {
    state.calculationProgress = value;
  },
  setCalculationProgressLabel(state, value) {
    state.calculationProgressLabel = value;
  }
};

const actions = {
  getNewCalcWorker({ commit }) {
    if (!window.Worker) {
      showErrorMessage(
        "Web worker not supported by browser. Aborting calculations.",
        ""
      );
      return;
    }
    // if already running
    if (state.calculatorIsRunning) {
      showErrorMessage(
        "Error updating Calculator is currently busy. Please retry in a bit, or reload the page if you believe the calculator has crashed.",
        ""
      );
      return;
    }
    commit("setCalculatorIsRunning", true);
    commit("setCalculationProgress", 0);
    commit("setCalculationProgressLabel", "0%");

    return new Worker("statics/js/calcWorker.js");
  },

  async calculate({ commit, dispatch }, payload) {
    //TODO: add in blocked and children issues
    let done = false;
    let calcWorker = await dispatch("getNewCalcWorker");
    calcWorker.postMessage({
      calculationType: payload.calculationType,
      orgId: payload.orgId,
      modelId: payload.modelId,
      modelNodes: payload.nodes,
      exchangeRates: payload.exchangeRates,
      simulationParams: payload.simulationParams,
      roleNodes: payload.roleNodes,
      actions: payload.actions ? payload.actions : null
    });
    //console.log("Message posted to worker");

    calcWorker.onmessage = function(e) {
      let payload2;
      //console.log(e.data);
      if (typeof e.data == "string") {
        showErrorMessage("Calculation error", e.data);
      } else if ("errorType" in e.data) {
        let data = e.data;
        showErrorMessage(
          data.errorType,
          data.errorMessage,
          true //useHtml
        );
        calcWorker.terminate();
        commit("setCalculatorIsRunning", false);
      } else if ("resultsType" in e.data) {
        switch (e.data.resultsType) {
          case "baseline":
            dispatch("calcResults/saveBaseline", e.data, { root: true });
            if (payload.calculationType == "baseline") {
              dispatch("calcResults/loadBaseline", payload.modelId, {
                root: true
              });
              done = true;
            }
            break;
          case "actions":
            dispatch("actions/updateActionsRoiResults", e.data, { root: true });
            if (payload.calculationType == "actions") done = true;
            break;
        }

        if (done) {
          //calcWorker.terminate();
          commit("setCalculatorIsRunning", false);
          Notify.create(
            "Calculation time " + e.data.calcTimeMs / 1000 + " seconds."
          );
          console.table(e.data.calcTimeStages);
        }
      } else if ("progressValue" in e.data) {
        commit("setCalculationProgress", e.data.progressValue);
        commit(
          "setCalculationProgressLabel",
          Math.round(e.data.progressValue * 100) + "%"
        );
      } else {
        console.log("Error message received from worker: ", e.data);
        showErrorMessage(
          "Error message received from worker. Please see console log.",
          ""
        );
      }
    };
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
