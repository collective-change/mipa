import { defineStore } from "pinia";

const fieldsToIgnoreForUiActionChanged = [
  "actionMchState",
  "ownDirectCost",
  "outstandingDirectCost",
  "sunkenDirectCost",
  "outstandingDirectEffortHrs",
  "outstandingDirectEffortCost",
  "outstandingSpending"
];

function initializeNewlyAddedProperties(uiAction) {
  const newProperties = {
    useSimpleEstimateMethod: false,
    simpleEstimateTotalBenefit: null,
    simpleEstimateTotalBenefitNotes: null,
    simpleEstimateOtherCosts: null,
    simpleEstimateOtherCostsNotes: null,
    effortCostNodeId: null,
    departmentTag: null,
    climatePressure: null,
    sdgTargets: [],
    counterfactual: null
  };
  for (const newProperty in newProperties) {
    if (!Object.prototype.hasOwnProperty.call(uiAction, newProperty)) {
      const defaultVal = newProperties[newProperty];
      uiAction[newProperty] = Array.isArray(defaultVal) ? [...defaultVal] : defaultVal;
    }
  }
}

function setFieldByPath(target, pathStr, value) {
  const segments = pathStr
    .replace(/\[(\w+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let cur = target;
  for (let i = 0; i < segments.length - 1; i++) {
    if (cur[segments[i]] == null) {
      cur[segments[i]] = {};
    }
    cur = cur[segments[i]];
  }
  if (segments.length > 0) {
    cur[segments[segments.length - 1]] = value;
  }
}

export const useUiActionStore = defineStore("uiAction", {
  state: () => ({
    uiAction: {},
    uiActionChanged: false,
    uiActionChangedFields: []
  }),

  actions: {
    setUiAction(action) {
      if (!action) {
        this.uiAction = {};
        this.uiActionChanged = false;
        this.uiActionChangedFields = [];
        return;
      }
      if (action.nodeIdsToChart == undefined) {
        action.nodeIdsToChart = [];
      }
      this.uiAction = action;
      initializeNewlyAddedProperties(this.uiAction);
      this.uiActionChanged = false;
      this.uiActionChangedFields = [];
    },

    mergeNewActionToUiAction(newAction) {
      const tempUiAction = {
        id: this.uiAction.id
      };
      for (const property in newAction) {
        if (this.uiActionChangedFields.includes(property)) {
          tempUiAction[property] = this.uiAction[property];
        } else {
          tempUiAction[property] = newAction[property];
        }
      }
      this.uiAction = tempUiAction;
    },

    updateUiActionField(field) {
      if (!this.uiAction || this.uiAction.id == undefined) return;
      const fieldName = field.path.replace(/^uiAction\./, "");
      const rootField = fieldName.split(/[.[]/)[0];
      setFieldByPath(this.uiAction, fieldName, field.value);
      if (!fieldsToIgnoreForUiActionChanged.includes(rootField)) {
        this.uiActionChanged = true;
        if (!this.uiActionChangedFields.includes(rootField)) {
          this.uiActionChangedFields.push(rootField);
        }
      }
    },

    setUiActionChanged(value) {
      this.uiActionChanged = value;
    },

    setActionMchState(actionMchState) {
      this.uiAction.actionMchState = Object.assign({}, actionMchState);
    },

    addImpact(impact) {
      this.uiAction.impacts.push(impact);
      if (!this.uiActionChangedFields.includes("impacts")) {
        this.uiActionChangedFields.push("impacts");
      }
      this.uiActionChanged = true;
    },

    updateImpact(impact) {
      const index = this.uiAction.impacts.map((imp) => imp.id).indexOf(impact.id);
      this.uiAction.impacts[index] = impact;
      if (!this.uiActionChangedFields.includes("impacts")) {
        this.uiActionChangedFields.push("impacts");
      }
      this.uiActionChanged = true;
    },

    deleteImpact(impactId) {
      this.uiAction.impacts = this.uiAction.impacts.filter(
        (impact) => impact.id != impactId
      );
      if (!this.uiActionChangedFields.includes("impacts")) {
        this.uiActionChangedFields.push("impacts");
      }
      this.uiActionChanged = true;
    },

    async _persistNodeIdsToChart() {
      const actionsMod = await import("./store-actions");
      if (actionsMod.useActionsStore) {
        actionsMod.useActionsStore(this.$pinia).updateAction({
          id: this.uiAction.id,
          updates: { nodeIdsToChart: this.uiAction.nodeIdsToChart }
        });
      }
    },

    async addNodeIdToChart(nodeId) {
      if (this.uiAction.nodeIdsToChart.indexOf(nodeId) === -1) {
        this.uiAction.nodeIdsToChart.push(nodeId);
        await this._persistNodeIdsToChart();
      }
    },

    async removeNodeIdToChart(nodeId) {
      const index = this.uiAction.nodeIdsToChart.indexOf(nodeId);
      if (index > -1) {
        this.uiAction.nodeIdsToChart.splice(index, 1);
      }
      await this._persistNodeIdsToChart();
    },

    async addNodeIdsToChart(nodeIds) {
      let needToAdd = false;
      nodeIds.forEach((nodeId) => {
        if (this.uiAction.nodeIdsToChart.indexOf(nodeId) === -1) {
          needToAdd = true;
          this.uiAction.nodeIdsToChart.push(nodeId);
        }
      });
      if (needToAdd) {
        await this._persistNodeIdsToChart();
      }
    },

    async setNodeIdsToChart(nodeIds) {
      if (Array.isArray(nodeIds)) {
        this.uiAction.nodeIdsToChart = nodeIds;
        await this._persistNodeIdsToChart();
      }
    }
  }
});

export default useUiActionStore;
