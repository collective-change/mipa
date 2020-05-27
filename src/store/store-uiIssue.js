import { getField, updateField } from "vuex-map-fields";
//import store from ".";

const fieldsToTriggerRecalculation = [
  "estTotalBenefitXdr",
  "estEffortCostXdr",
  "effortCompletionPercentage"
];

const state = {
  uiIssue: {}
};

const mutations = {
  setUiIssue(state, issue) {
    state.uiIssue = issue;
  },
  updateUiIssueField(state, field) {
    let fieldName = field.path.replace("uiIssue.", "");
    updateField(state, field);
    if (fieldsToTriggerRecalculation.includes(fieldName)) recalculate(state);
    else
      throw "Unrecognized field " +
        fieldName +
        " passed to updateUiIssueField.";
  }
};

function recalculate(state) {
  console.log("recalculating");
  let uiIssue = state.uiIssue;
  uiIssue.estEffortCostXdr = uiIssue.estEffortCostXdr
    ? uiIssue.estEffortCostXdr
    : 0;
  uiIssue.estPurchaseCostXdr = uiIssue.estPurchaseCostXdr
    ? uiIssue.estPurchaseCostXdr
    : 0;
  uiIssue.estTotalCostXdr =
    uiIssue.estEffortCostXdr + uiIssue.estPurchaseCostXdr;
  uiIssue.effortCompletionPercentage = uiIssue.effortCompletionPercentage
    ? uiIssue.effortCompletionPercentage
    : 0;
  uiIssue.outstandingEffortCost =
    uiIssue.estEffortCostXdr * (1 - uiIssue.effortCompletionPercentage / 100);
  uiIssue.purchasedAmount = uiIssue.purchasedAmount
    ? uiIssue.purchasedAmount
    : 0;
  uiIssue.outstandingPurchaseCost = Math.max(
    0,
    uiIssue.estPurchaseCostXdr - uiIssue.purchasedAmount
  );
  uiIssue.outstandingCostXdr =
    uiIssue.outstandingEffortCost + uiIssue.outstandingPurchaseCost;
  uiIssue.estRoi =
    (uiIssue.estTotalBenefitXdr - uiIssue.outstandingCostXdr) /
    uiIssue.outstandingCostXdr;
}

const actions = {
  setUiIssue({ commit }, issue) {
    commit("setUiIssue", issue);
  }
};

const getters = { getField };

/*store.subscribe((mutation, state) => {
  if (mutation.type == "uiIssue") {
    //do your stuff here
    console.log(mutation.type);
    console.log(mutation.payload);
  }
});*/

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters
};
