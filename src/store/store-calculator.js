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
    console.log("calculateBaseline");
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

function calculateDependencyLevels(nodes) {
  console.log("calculateDependencyLevels");
  //if a node has an influencer, increase dependencyLevel number to one above influencer
  let depLevsChanging = true;
  let depLevs = {};
  let tempDepLevs = {};
  let influencerTempDepLev = 0;

  //loop until dependency levels don't change anymore
  let whileLoopCount = 0;
  while (depLevsChanging) {
    whileLoopCount++;
    let nodeCount = 0;
    depLevsChanging = false;
    nodes.forEach(function(node) {
      nodeCount++;
      console.log(
        "whileLoopCount:",
        whileLoopCount,
        "nodeCount: ",
        nodeCount,
        "node.name: ",
        node.name
      );
      //if a node has an influencer, increase dependencyLevel number to one above influencer
      tempDepLevs[node.id] = 0;
      if (node.influencers) {
        node.influencers.forEach(function(influencer) {
          influencerTempDepLev =
            typeof tempDepLevs[influencer] === "undefined"
              ? 0
              : tempDepLevs[influencer];
          tempDepLevs[node.id] =
            influencerTempDepLev >= tempDepLevs[node.id]
              ? influencerTempDepLev + 1
              : tempDepLevs[node.id];
        });
      }

      //if dependencyLevel has changed from previous iteration
      if (tempDepLevs[node.id] != depLevs[node.id]) {
        //save tempDepLevs into depLevs
        depLevs[node.id] = tempDepLevs[node.id];
        depLevsChanging = true;
      }
    }, this);
  }
  //todo: if node has no influencers, then set dependencyLevel to lowest influencee dependencyLevel - 1
  nodes.forEach(function(node) {
    //get influencees of node (which nodes have this node as influencer?)
    //if (!node.influencers) depLevs[node.id] = null;
  });

  console.log("depLevs: ", depLevs);
  return depLevs;
}

const getters = {};

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters
};
