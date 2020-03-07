import Vue from "vue";
import { uid, Notify } from "quasar";
import { firebase, firebaseDb, firebaseAuth } from "boot/firebase";
import { firestoreAction } from "vuexfire";
import { calculateDependencyLevels } from "src/utils/function-calculateDependencyLevels";

const state = {
  calculatorIsRunning: false,
  calculationRequestPending: false,
  lastBaselineCalculationStartTime: null,
  lastBaselineCalculationEndedWithoutError: null,
  lastBaselineCalculationEndTime: null,
  calculationProgress: 0
};

const mutations = {
  setCalculatorIsRunning(state, value) {
    state.calculatorIsRunning = value;
  },
  setCalculationRequestPending(state, value) {
    state.calculationRequestPending = value;
  },
  setLastBaselineCalculationStartTime(state, value) {
    state.lastBaselineCalculationStartTime = value;
  },
  setLastBaselineCalculationEndedWithoutError(state, value) {
    state.lastBaselineCalculationEndedWithoutError = value;
  },
  setLastBaselineCalculationEndTime(state, value) {
    state.lastBaselineCalculationEndTime = value;
  },
  setCalculationProgress(state, value) {
    state.calculationProgress = value;
  }
};

const actions = {
  calculateBaseline({ rootState, commit }, teamId) {
    //console.log("calculateBaseline");
    // if already running
    if (state.calculatorIsRunning) {
      commit("setCalculationRequestPending", true);
      return;
    }
    commit("setCalculatorIsRunning", true);
    commit("setCalculationRequestPending", false);
    commit("setLastBaselineCalculationStartTime", new Date());

    //parse formula of all nodes

    //calculate dependency level of each node
    let depLevs = calculateDependencyLevels(rootState.model.nodes);
    // save dependency level of each node if it has changed

    //for time points

    //for each dependency level from 0
    //for each variable node
    //calculate value at time point
    //update progress bar
    //save results to nodeValuesShards
    commit("setLastBaselineCalculationEndTime", new Date());
    commit("setLastBaselineCalculationEndedWithoutError", true);
    commit("setCalculatorIsRunning", false);
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
