import Vue from "vue";
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
  calculateBaseline({ commit, dispatch }, payload) {
    if (!window.Worker) {
      showErrorMessage(
        "Web worker not supported by browser. Aborting calculations.",
        ""
      );

      console.log(
        "Web worker not supported by browser. Aborting calculations."
      );
      return;
    }
    // if already running
    if (state.calculatorIsRunning) {
      showErrorMessage(
        "Error updating Calculator is currently busy. Please retry in a bit, or reload the page if you believe the calculator has crashed.",
        ""
      );
      //Notify.create("Calculator is currently busy. Please retry in a bit.");
      return;
    }
    commit("setCalculatorIsRunning", true);
    commit("setCalculationProgress", 0);
    commit("setCalculationProgressLabel", "0%");
    let startTime = new Date();

    let baselineCalcWorker = new Worker("statics/js/baselineCalcWorker.js");
    baselineCalcWorker.postMessage({
      modelNodes: payload.nodes
    });
    //console.log("Message posted to worker");

    baselineCalcWorker.onmessage = function(e) {
      //console.log(e.data);
      if (typeof e.data == "string") {
        console.log("Error message received from worker: ", e.data);
        showErrorMessage("Calculation error", e.data);
      } else if ("errorType" in e.data) {
        let data = e.data;
        //replace $nodeIds in error message with node name
        showErrorMessage(
          "Calculation error: " + data.errorType,
          data.errorMessage
        );
        baselineCalcWorker.terminate();
        commit("setCalculatorIsRunning", false);
        //let endTime = new Date();
        //let calcDurationSec = (endTime - startTime) / 1000;
        //Notify.create("Calculation took " + calcDurationSec + " seconds.");
      } else if ("timeSPoints" in e.data) {
        let payload2 = {
          modelId: payload.modelId,
          data: e.data
        };

        dispatch("calcResults/setBaseline", payload2, { root: true });

        baselineCalcWorker.terminate();
        commit("setCalculatorIsRunning", false);
        let endTime = new Date();
        let calcDurationSec = (endTime - startTime) / 1000;
        Notify.create("Calculation took " + calcDurationSec + " seconds.");
      } else if ("progressValue" in e.data) {
        commit("setCalculationProgress", e.data.progressValue);
        commit("setCalculationProgressLabel", e.data.progressValue * 100 + "%");
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
