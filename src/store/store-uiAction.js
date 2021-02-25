import { getField, updateField } from "vuex-map-fields";

const fieldsToTriggerRecalculation = [
  "estEffortHrs",
  "effortCompletionPercentage",
  "estSpending",
  "spentAmount"
];

const fieldsToIgnoreForUiActionChanged = [
  "actionMchState",
  "saveFullResults", //a temporary field that's not saved
  "ownDirectCost", //a computed field
  "outstandingDirectCost", //a computed field
  "sunkenDirectCost", //a computed field
  "outstandingDirectEffortHrs", //a computed field
  "outstandingDirectEffortCost", //a computed field
  "outstandingSpending" //a computed field
];

const state = {
  uiAction: {},
  uiActionChanged: false
};

const mutations = {
  setUiAction(state, action) {
    state.uiAction = action;
    state.uiActionChanged = false;
  },
  updateUiActionField(state, field) {
    if (state.uiAction.id == undefined) return;
    let fieldName = field.path.replace("uiAction.", "");
    updateField(state, field);
    //console.log("updated ", fieldName, "to", state.uiAction[fieldName]);
    if (!fieldsToIgnoreForUiActionChanged.includes(fieldName)) {
      state.uiActionChanged = true;
      //console.log("uiActionChanged due to ", fieldName);
    }
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
    state.uiActionChanged = true;
  },
  updateImpact(state, impact) {
    let index = state.uiAction.impacts.map(imp => imp.id).indexOf(impact.id);
    state.uiAction.impacts[index] = impact;
    state.uiActionChanged = true;
  },
  deleteImpact(state, impactId) {
    state.uiAction.impacts = state.uiAction.impacts.filter(impact => {
      return impact.id != impactId;
    });
    state.uiActionChanged = true;
  }
};

const actions = {
  setUiAction({ commit }, action) {
    if (action) action.saveFullResults = false; //add this non-persisted flag
    commit("setUiAction", action);
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
