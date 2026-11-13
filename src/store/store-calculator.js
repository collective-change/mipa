import { uid, Notify } from "quasar";
import { showErrorMessage } from "@/utils/util-show-error-message";
import { toPlain } from "@/utils/util-toPlain";
import { i18n } from "@/boot/i18n";
import { firebaseAuth, firebaseConfig, useEmulators } from "@/boot/firebase";

// Plain-language titles and advice for the calculator's error types
// (the types themselves stay as the worker sends them).
const FRIENDLY_ERRORS = {
  "Unit mismatch": { title: "errUnitTitle", advice: "errUnitAdvice" },
  "Circular dependency detected": { title: "errLoopTitle", advice: "errLoopAdvice" },
  "Parse error": { title: "errParseTitle", advice: "errParseAdvice" },
  "Evaluation error": { title: "errEvalTitle", advice: "errEvalAdvice" },
  "Unit loading error": { title: "errUnknownUnitTitle", advice: "errUnknownUnitAdvice" },
  "Latest value loading error": { title: "errValueTitle", advice: "errValueAdvice" }
};

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
  getNewCalcWorker({ state, commit }) {
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

    return new Worker(new URL("../workers/calcWorker.js", import.meta.url), {
      type: "module"
    });
  },

  async calculate({ commit, dispatch }, payload) {
    let done = false;
    let calcWorker = await dispatch("getNewCalcWorker");
    calcWorker.postMessage(toPlain({
      firebaseConfig,
      useEmulators,
      calculationType: payload.calculationType,
      orgId: payload.orgId,
      modelId: payload.modelId,
      modelNodes: payload.nodes,
      exchangeRates: payload.exchangeRates,
      simulationParams: payload.simulationParams,
      roleNodes: payload.roleNodes,
      actions: payload.actions ? payload.actions : null,
      currentUserId: firebaseAuth.currentUser.uid
    }));
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
        const friendly = FRIENDLY_ERRORS[data.errorType];
        showErrorMessage(
          friendly ? i18n.global.t(friendly.title) : data.errorType,
          friendly
            ? `${i18n.global.t(friendly.advice)}<br/><br/><small>${i18n.global.t("Details")}: ${data.errorMessage || ""}</small>`
            : data.errorMessage,
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
            await dispatch("ui/setSelectedNodeId", null, {
              root: true
            });
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
            console.log(e.data);
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
          Notify.create({
            type: "positive",
            message: i18n.global.t("Calculation finished"),
            timeout: 2000
          });
          console.log("Calculation time", e.data.calcTimeMs / 1000, "s");
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
