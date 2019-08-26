import Vue from "vue";
import { uid, Notify } from "quasar";
import { firebase, firebaseDb, firebaseAuth } from "boot/firebase";
import { firestoreAction } from "vuexfire";
import { showErrorMessage } from "src/functions/function-show-error-message";

const state = {
  calculatorIsRunning: false,
  calculationRequestPending: false,
  lastBaselineCalculationStartTime: null,
  lastBaselineCalculationEndedWithoutError: null,
  lastBaselineCalculationEndTime: null
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
  }
};

const actions = {
  calculateBaseline({ commit }) {
    console.log("calculateBaseline");
    // if already running
    if (state.calculatorIsRunning) {
      commit("setCalculationRequestPending", true);
      return;
    }
    commit("setCalculatorIsRunning", true);
    commit("setCalculationRequestPending", false);
    commit("setLastBaselineCalculationStartTime", new Date());
    //initialize variables
    //for time points
    //for each dependency level from 0
    //for each variable node
    //calculate value at time point
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
