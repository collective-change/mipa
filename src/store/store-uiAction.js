import { getField, updateField } from "vuex-map-fields";

const fieldsToTriggerRecalculation = [
  "estEffortHrs",
  "effortCompletionPercentage",
  "estSpending",
  "spentAmount"
];

const fieldsToIgnoreForUiActionChanged = [
  "actionMchState",
  //"saveFullResults", //a temporary field that's not saved
  "ownDirectCost", //a computed field
  "outstandingDirectCost", //a computed field
  "sunkenDirectCost", //a computed field
  "outstandingDirectEffortHrs", //a computed field
  "outstandingDirectEffortCost", //a computed field
  "outstandingSpending" //a computed field
];

const state = {
  uiAction: {},
  uiActionChanged: false,
  uiActionChangedFields: []
};

const mutations = {
  setUiAction(state, action) {
    state.uiAction = action;
    state.uiActionChanged = false;
    state.uiActionChangedFields = [];
  },
  mergeNewActionToUiAction(state, newAction) {
    let tempUiAction = {};
    for (const property in newAction) {
      //if property name is in changedFields, then keep user's changes
      // else set uiAction's property to new value
      if (state.uiActionChangedFields.includes(property)) {
        tempUiAction[property] = state.uiAction[property];
      } else tempUiAction[property] = newAction[property];
    }
    //add in property that's not persisted
    //tempUiAction.saveFullResults = state.uiAction.saveFullResults;
    state.uiAction = tempUiAction;
  },
  updateUiActionField(state, field) {
    if (state.uiAction.id == undefined) return;
    let fieldName = field.path.replace("uiAction.", "");
    updateField(state, field);
    if (!fieldsToIgnoreForUiActionChanged.includes(fieldName)) {
      state.uiActionChanged = true;
      if (!state.uiActionChangedFields.includes(fieldName))
        state.uiActionChangedFields.push(fieldName);
      //console.log("uiActionChanged due to field", fieldName);
    }
    //console.log(state.uiAction.saveFullResults);
  },

  setUiActionChanged(state, value) {
    state.uiActionChanged = value;
  },
  setActionMchState(state, actionMchState) {
    state.uiAction.actionMchState = Object.assign({}, actionMchState);
    //console.log(state.uiAction.actionMchState);
  },
  addImpact(state, impact) {
    state.uiAction.impacts.push(impact);
    if (!state.uiActionChangedFields.includes("impacts"))
      state.uiActionChangedFields.push("impacts");
    state.uiActionChanged = true;
  },
  updateImpact(state, impact) {
    let index = state.uiAction.impacts.map(imp => imp.id).indexOf(impact.id);
    state.uiAction.impacts[index] = impact;
    if (!state.uiActionChangedFields.includes("impacts"))
      state.uiActionChangedFields.push("impacts");
    state.uiActionChanged = true;
  },
  deleteImpact(state, impactId) {
    state.uiAction.impacts = state.uiAction.impacts.filter(impact => {
      return impact.id != impactId;
    });
    if (!state.uiActionChangedFields.includes("impacts"))
      state.uiActionChangedFields.push("impacts");
    state.uiActionChanged = true;
  },
  addNodeIdToChart(state, nodeId) {
    if (state.uiAction.nodeIdsToChart.indexOf(nodeId) === -1)
      state.uiAction.nodeIdsToChart.push(nodeId);
  },
  removeNodeIdToChart(state, nodeId) {
    const index = state.uiAction.nodeIdsToChart.indexOf(nodeId);
    if (index > -1) state.uiAction.nodeIdsToChart.splice(index, 1);
  },
  addNodeIdsToChart(state, nodeIds) {
    nodeIds.forEach(nodeId => {
      if (state.uiAction.nodeIdsToChart.indexOf(nodeId) === -1)
        state.uiAction.nodeIdsToChart.push(nodeId);
    });
  },
  setNodeIdsToChart(state, nodeIds) {
    if (Array.isArray(nodeIds)) state.uiAction.nodeIdsToChart = nodeIds;
  }
};

const actions = {
  setUiAction({ commit }, action) {
    //if (action) action.saveFullResults = false; //add this non-persisted flag
    if (action.nodeIdsToChart == undefined) action.nodeIdsToChart = [];
    commit("setUiAction", action);
  },
  addNodeIdToChart({ commit, dispatch }, nodeId) {
    if (state.uiAction.nodeIdsToChart.indexOf(nodeId) === -1) {
      commit("addNodeIdToChart", nodeId);
      dispatch(
        "actions/updateAction",
        {
          id: state.uiAction.id,
          updates: { nodeIdsToChart: state.uiAction.nodeIdsToChart }
        },
        { root: true }
      );
    }
  },
  removeNodeIdToChart({ commit, dispatch }, nodeId) {
    commit("removeNodeIdToChart", nodeId);
    dispatch(
      "actions/updateAction",
      {
        id: state.uiAction.id,
        updates: { nodeIdsToChart: state.uiAction.nodeIdsToChart }
      },
      { root: true }
    );
  },
  addNodeIdsToChart({ commit, dispatch }, nodeIds) {
    //check if nodeIds already exist in nodeIdsToChart
    let needToAdd = false;
    nodeIds.forEach(nodeId => {
      if (state.uiAction.nodeIdsToChart.indexOf(nodeId) === -1)
        needToAdd = true;
    });
    if (needToAdd) {
      commit("addNodeIdsToChart", nodeIds);
      dispatch(
        "actions/updateAction",
        {
          id: state.uiAction.id,
          updates: { nodeIdsToChart: state.uiAction.nodeIdsToChart }
        },
        { root: true }
      );
    }
  },
  setNodeIdsToChart({ commit, dispatch }, nodeIds) {
    if (Array.isArray(nodeIds)) {
      commit("setNodeIdsToChart", nodeIds);
      dispatch(
        "actions/updateAction",
        {
          id: state.uiAction.id,
          updates: { nodeIdsToChart: state.uiAction.nodeIdsToChart }
        },
        { root: true }
      );
    }
  }
};

const getters = { getField };

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters
};
