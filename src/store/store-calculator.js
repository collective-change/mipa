import { uid, Notify } from "quasar";
import { showErrorMessage } from "src/utils/util-show-error-message";
import { /*firebase, firebaseDb,*/ firebaseAuth } from "boot/firebase";
//import { firestoreAction } from "vuexfire";

const state = {
  calculatorIsRunning: false,
  calculationProgress: 0
};

const mutations = {
  setCalculatorIsRunning(state, value) {
    state.calculatorIsRunning = value;
  },
  setCalculationProgress(state, value) {
    state.calculationProgress = value;
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

    return new Worker("js/calcWorker.js");
  },

  async calculate({ commit, dispatch }, payload) {
    let firebaseConfig = {
      apiKey: process.env.apiKey,
      authDomain: process.env.authDomain,
      databaseURL: process.env.databaseURL,
      projectId: process.env.projectId,
      storageBucket: process.env.storageBucket,
      messagingSenderId: process.env.messagingSenderId,
      appId: process.env.appId
    };
    let done = false;
    let calcWorker = await dispatch("getNewCalcWorker");
    calcWorker.postMessage({
      firebaseConfig,
      calculationType: payload.calculationType,
      orgId: payload.orgId,
      modelId: payload.modelId,
      modelNodes: payload.nodes,
      exchangeRates: payload.exchangeRates,
      simulationParams: payload.simulationParams,
      roleNodes: payload.roleNodes,
      actions: payload.actions ? payload.actions : null,
      currentUserId: firebaseAuth.currentUser.uid
    });
    //console.log("Message posted to worker");

    calcWorker.onmessage = async function(e) {
      let payload2;
      //console.log(e.data);
      if (typeof e.data == "string") {
        showErrorMessage("Calculation error", e.data);
        //clear circularNodeIds
        dispatch("ui/setCircularNodeIds", [], {
          root: true
        });
      } else if ("errorType" in e.data) {
        let data = e.data;
        showErrorMessage(
          data.errorType,
          data.errorMessage,
          true //useHtml
        );
        calcWorker.terminate();
        commit("setCalculatorIsRunning", false);
        if (data.errorType == "Circular dependency detected") {
          dispatch(
            "ui/setCircularNodeIds",
            data.errorData.map(node => node.id),
            { root: true }
          );
        } else {
          //clear circularNodeIds
          dispatch("ui/setCircularNodeIds", [], { root: true });
          //select affected node
          if (data.errorData && data.errorData.nodeId) {
            dispatch("ui/setSelectedNodeId", data.errorData.nodeId, {
              root: true
            });
          }
        }
      } else if ("resultsType" in e.data) {
        //clear circularNodeIds
        dispatch("ui/setCircularNodeIds", [], { root: true });
        switch (e.data.resultsType) {
          case "baseline":
            await dispatch("calcResults/saveBaseline", e.data, { root: true });
            if (payload.calculationType == "baseline") {
              dispatch("calcResults/loadBaseline", payload.modelId, {
                root: true
              });
              done = true;
            }
            break;
          case "actions":
            await dispatch("actions/updateActionsResults", e.data, {
              root: true
            });
            //console.log(e.data);
            if (payload.calculationType == "actions") {
              if (e.data.actionsResults.length == 1)
                dispatch(
                  "calcResults/loadResultsOfAction",
                  e.data.actionsResults[0].id,
                  { root: true }
                );

              done = true;
            }
            break;
        }

        if (done) {
          calcWorker.terminate();
          commit("setCalculatorIsRunning", false);
          commit("setCalculationProgress", 0);
          Notify.create(
            "Calculation time " + e.data.calcTimeMs / 1000 + " seconds."
          );
          console.table(e.data.calcTimeStages);
        }
      } else if ("progressValue" in e.data) {
        commit("setCalculationProgress", e.data.progressValue);
      } else {
        //clear circularNodeIds
        dispatch("ui/setCircularNodeIds", [], { root: true });
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
