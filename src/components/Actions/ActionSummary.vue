<template>
  <div>
    <div v-if="selectedAction">
      <q-form @submit.prevent="submitForm">
        <div class="row items-center">
          <div v-bind:class="{ 'col-12 col-md-4': !embedded, 'col-12': embedded }">
            <q-input
              class="text-h6"
              v-model="title"
              :rules="[val => !!val || 'Field is required']"
              ref="actionTitle"
            >
              <template v-slot:prepend>
                <q-chip square color="primary" text-color="white">
                  {{
                  $t(uiAction.actionMchState.value)
                  }}
                </q-chip>
              </template>
              <template v-slot:after v-if="embedded">
                <q-btn
                  dense
                  label="details"
                  color="primary"
                  @click="
                    $router.push(
                      `/org/${currentOrg.name}/action/${currentOrg.id}/${selectedActionId}`
                    )
                  "
                />
              </template>
            </q-input>
          </div>

          <div v-bind:class="{ 'col-12 col-md-2': !embedded, 'col-12': embedded }">
            <div class="q-px-xs q-gutter-xs">
              <q-chip
                outline
                color="primary"
              >Leverage {{ formatNumber(uiAction.actionLeverage, 2) }}</q-chip>
              <q-chip outline color="primary">Total ROI {{ formatNumber(uiAction.totalRoi, 2) }}</q-chip>
            </div>
          </div>

          <div v-bind:class="{ 'col-12 col-md-6': !embedded, 'col-12': embedded }">
            <div class="row q-pa-sm q-gutter-sm">
              <calculator-ui
                calculationType="uiAction"
                buttonLabel="Recalculate"
                :uiAction="uiAction"
              />
              <q-checkbox v-model="saveFullResults" label="Save full results for export" />
              <export-calc-results
                data-source="resultsOfAction"
                :actionId="uiAction.id"
                :actionTitle="uiAction.title"
                buttonLabel="Export results TSV"
              />
              <q-btn-group v-if="uiAction.actionMchState.value=='initiating'">
                <q-btn
                  :label="$t('Request approval')"
                  @click="actionService.send('REQUEST_APPROVAL')"
                  color="primary"
                />
                <q-btn
                  :label="$t('Approval not needed')"
                  @click="actionService.send('APPROVAL_NOT_NEEDED')"
                  color="primary"
                />
              </q-btn-group>

              <q-btn-group v-if="uiAction.actionMchState.value=='to_approve'">
                <q-btn
                  :label="$t('Approve')"
                  @click="actionService.send('APPROVE')"
                  color="primary"
                />
                <q-btn :label="$t('Reject')" @click="actionService.send('REJECT')" color="primary" />
              </q-btn-group>

              <q-btn-group v-if="uiAction.actionMchState.value=='rejected'">
                <q-btn
                  :label="$t('Request approval')"
                  @click="actionService.send('REQUEST_APPROVAL')"
                  color="primary"
                />
              </q-btn-group>

              <q-btn-group v-if="uiAction.actionMchState.value=='eligible'">
                <q-btn
                  :label="$t('Approval needed')"
                  @click="actionService.send('APPROVAL_NEEDED')"
                  color="primary"
                />
                <q-btn :label="$t('Cancel')" @click="actionService.send('CANCEL')" color="primary" />
                <q-btn
                  :label="$t('Mark as done')"
                  @click="actionService.send('FINISH')"
                  color="primary"
                />
              </q-btn-group>

              <q-btn-group v-if="uiAction.actionMchState.value=='approved'">
                <q-btn
                  :label="$t('Re-approval needed')"
                  @click="actionService.send('APPROVAL_NEEDED')"
                  color="primary"
                />
                <q-btn
                  :label="$t('Request to cancel')"
                  @click="actionService.send('REQUEST_CANCELLATION')"
                  color="primary"
                />
                <q-btn
                  :label="$t('Mark as done')"
                  @click="actionService.send('FINISH')"
                  color="primary"
                />
              </q-btn-group>

              <q-btn-group v-if="uiAction.actionMchState.value=='done'">
                <q-btn
                  :label="$t('Revert to eligible')"
                  @click="actionService.send('REVERT_FINISH')"
                  color="primary"
                />
              </q-btn-group>

              <q-btn-group v-if="uiAction.actionMchState.value=='cancellation_requested'">
                <q-btn
                  :label="$t('Reject cancellation')"
                  @click="actionService.send('REJECT_CANCELLATION')"
                  color="primary"
                />
                <q-btn
                  :label="$t('Approve cancellation')"
                  @click="actionService.send('APPROVE_CANCELLATION')"
                  color="primary"
                />
              </q-btn-group>

              <q-btn-group v-if="uiAction.actionMchState.value=='canceled'">
                <q-btn :label="$t('Revive')" @click="actionService.send('REVIVE')" color="primary" />
              </q-btn-group>

              <q-btn color="primary" label="Meet about this" />
            </div>
          </div>
        </div>

        <div class="row q-col-gutter-md">
          <div v-bind:class="{ 'col-12 col-md-6': !embedded, 'col-12': embedded }">
            <q-input v-model="notes" :label="$t('Notes')" filled autogrow />

            <impacts />

            <div class="row q-gutter-md q-mt-md items-start">
              <q-select
                v-model="effortCostPerHrType"
                :label="$t('effortCostPerHour')"
                :options="effortCostPerHrTypeOptions"
                emit-value
                map-options
                filled
              />
              <q-input
                v-if="effortCostPerHrType == 'use_custom'"
                v-model.number="customEffortCostPerHr"
                :label="$t('customEffortCostPerHr')"
                type="number"
                :suffix="
                  averageEffortCostPerHourNode
                    ? averageEffortCostPerHourNode.unit
                    : ''
                "
                :rules="[
                  val => val == null || val >= 0 || 'Should be at least 0'
                ]"
                filled
                style="max-width: 150px;"
                debounce="500"
              />
              <q-input
                v-model.number="estEffortHrs"
                :label="$t('estEffortHrs')"
                type="number"
                suffix="hours"
                :rules="[
                  val => val == null || val >= 0 || 'Should be at least 0'
                ]"
                filled
                style="max-width: 150px;"
                debounce="500"
              />
              <q-input
                v-model.number="effortCompletionPercentage"
                type="number"
                :suffix="$t('percentDone')"
                :rules="[
                  val => val == null || val >= 0 || 'Should be at least 0'
                ]"
                filled
                style="max-width: 150px;"
                debounce="500"
              />

              <q-slider
                :value="effortCompletionPercentage"
                @change="
                  val => {
                    effortCompletionPercentage = val;
                  }
                "
                :min="0"
                :max="100"
                label
              />
            </div>

            <div class="q-gutter-md q-mt-md row items-start">
              <q-input
                v-model.number="estSpending"
                :label="$t('estSpending')"
                type="number"
                :suffix="currentOrg.currency"
                :rules="[
                  val => val == null || val >= 0 || 'Should be at least 0'
                ]"
                filled
                style="max-width: 150px;"
                debounce="500"
              />
              <q-input
                v-model.number="spentAmount"
                :label="$t('spentAmount')"
                type="number"
                :suffix="currentOrg.currency"
                :rules="[
                  val => val == null || val >= 0 || 'Should be at least 0'
                ]"
                filled
                style="max-width: 150px;"
                debounce="500"
              />
            </div>
            <modal-save-button />
          </div>

          <div v-bind:class="{ 'col-6 col-md-3': !embedded, 'col-12': embedded }">
            <!-- middle column -->
            <div class="q-pa-sm q-gutter-sm">
              <action-relationships></action-relationships>
            </div>
            <simpleCostsAndImpacts
              :costsAndImpacts="
                uiAction.effectiveChainedCostsAndImpactsExcludingSelf
              "
            >
              <template v-slot:header>Other effective impacts</template>
            </simpleCostsAndImpacts>
          </div>
          <div v-bind:class="{ 'col-6 col-md-3': !embedded, 'col-12': embedded }">
            <q-markup-table flat bordered>
              <thead>
                <tr>
                  <th class="text-left">Aggregated results</th>
                  <th class="text-right">NPV ({{ currentOrg ? currentOrg.currency : "" }})</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Outstanding direct costs</td>
                  <td class="text-right">{{ formatNumber(uiAction.outstandingDirectCosts, 3) }}</td>
                </tr>
                <tr>
                  <td>Raw benefit to organization</td>
                  <td class="text-right">{{ formatNumber(uiAction.rawMarginalOrgBenefitNpv, 3) }}</td>
                </tr>
                <tr>
                  <td>Raw cost to organization</td>
                  <td class="text-right">{{ formatNumber(uiAction.rawMarginalOrgCostNpv, 3) }}</td>
                </tr>
                <tr>
                  <td>Adjusted benefit to organization</td>
                  <td class="text-right">{{ formatNumber(uiAction.marginalOrgBenefitNpv, 3) }}</td>
                </tr>
                <tr>
                  <td>Adjusted cost to organization</td>
                  <td class="text-right">{{ formatNumber(uiAction.marginalOrgCostNpv, 3) }}</td>
                </tr>
                <tr>
                  <td>Raw benefit to world</td>
                  <td class="text-right">{{ formatNumber(uiAction.rawMarginalWorldBenefitNpv, 3) }}</td>
                </tr>
                <tr>
                  <td>Raw cost to world</td>
                  <td class="text-right">{{ formatNumber(uiAction.rawMarginalWorldCostNpv, 3) }}</td>
                </tr>
                <tr>
                  <td>Adjusted benefit to world</td>
                  <td class="text-right">{{ formatNumber(uiAction.marginalWorldBenefitNpv, 3) }}</td>
                </tr>
                <tr>
                  <td>Adjusted cost to world</td>
                  <td class="text-right">{{ formatNumber(uiAction.marginalWorldCostNpv, 3) }}</td>
                </tr>

                <tr>
                  <td>Total benefit</td>
                  <td class="text-right">{{ formatNumber(uiAction.marginalTotalBenefitNpv, 3) }}</td>
                </tr>
                <tr>
                  <td>Total cost</td>
                  <td class="text-right">{{ formatNumber(uiAction.marginalTotalCostNpv, 3) }}</td>
                </tr>
                <tr>
                  <td>Net total benefit</td>
                  <td class="text-right">{{ formatNumber(uiAction.marginalNetTotalBenefitNpv, 3) }}</td>
                </tr>
              </tbody>
            </q-markup-table>
          </div>
        </div>
        <div v-if="!embedded" class="row q-gutter-y-lg">
          <div class="column q-gutter-md" v-for="chart in chartsArr" :key="chart.nodeId">
            <gchart type="LineChart" :data="chart.chartData" :options="chart.chartOptions" />
            <div class="row justify-center q-gutter-x-md">
              <q-btn-toggle
                v-model="chart.chartOptions.series"
                action-color="primary"
                size="xs"
                :options="[
                    {
                      label: 'difference',
                      value: showDifferenceConfig
                    },
                    {
                      label: 'values',
                      value: showValuesConfig
                    }
                  ]"
              />

              <q-btn-toggle
                v-model="chart.chartOptions.vAxis.scaleType"
                action-color="primary"
                size="xs"
                :options="[
                    { label: 'linear', value: 'linear' },
                    { label: 'log', value: 'mirrorLog' }
                  ]"
              />
            </div>
          </div>
        </div>
      </q-form>
    </div>
  </div>
</template>

<script>
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";
import { mapActions, mapGetters, mapState } from "vuex";
import { createHelpers, mapMultiRowFields } from "vuex-map-fields";
import { interpret } from "xstate";
import { actionMachine } from "src/state-machines/machine-action";
import { formatNumber } from "src/utils/util-formatNumber";
import { GChart } from "vue-google-charts";

const { mapFields } = createHelpers({
  getterType: "uiAction/getField",
  mutationType: "uiAction/updateUiActionField"
});

export default {
  components: {
    "modal-save-button": require("components/Shared/ModalComponents/ModalSaveButton.vue")
      .default,
    impacts: require("components/Impacts/Impacts.vue").default,
    simpleCostsAndImpacts: require("components/Impacts/SimpleCostsAndImpacts.vue")
      .default,
    "calculator-ui": require("components/Calc/CalculatorUi.vue").default,
    "export-calc-results": require("components/Calc/ExportCalcResults.vue")
      .default,
    "action-relationships": require("components/Actions/Relationships/ActionRelationships.vue")
      .default,
    gchart: GChart
  },

  data() {
    return {
      embedded: false, //whether this component is embedded or a full page
      actionId: null,
      chartsArr: [],
      effortCostPerHrTypeOptions: [
        {
          label: "use average effort cost per hour",
          value: "use_average"
        },
        {
          label: "use custom effort cost per hour",
          value: "use_custom"
        }
      ],
      showValuesConfig: {
        0: { lineWidth: 5, visibleInLegend: true },
        1: { lineWidth: 2, visibleInLegend: true },
        2: { lineWidth: 2, visibleInLegend: true },
        3: { lineWidth: 0, visibleInLegend: false }
      },
      showDifferenceConfig: {
        0: { lineWidth: 0, visibleInLegend: false },
        1: { lineWidth: 0, visibleInLegend: false },
        2: { lineWidth: 0, visibleInLegend: false },
        3: { lineWidth: 2, visibleInLegend: true }
      },
      actionService: interpret(actionMachine),

      actionStateContext: null
    };
  },

  computed: {
    ...mapState("orgs", ["currentOrg"]),
    ...mapState("ui", ["selectedActionId"]),
    ...mapState("model", ["currentModel"]),
    ...mapGetters("model", ["nodes"]),
    ...mapState("calcResults", ["resultsOfAction"]),
    ...mapGetters("actions", ["actions"]),
    //fields calculated in the uiAction store, for display only
    //(do not modify their values in the component)
    ...mapState("uiAction", ["uiAction", "uiActionChanged"]),
    //fields for 2-way sync between component and store
    ...mapFields([
      "uiAction.title",
      "uiAction.actionMchState",
      "uiAction.estEffortHrs",
      "uiAction.effortCompletionPercentage",
      "uiAction.effortCostPerHrType",
      "uiAction.customEffortCostPerHr",
      "uiAction.estSpending",
      "uiAction.spentAmount",
      "uiAction.ownDirectCost",
      "uiAction.outstandingDirectCost",
      "uiAction.sunkenDirectCost",
      "uiAction.outstandingDirectEffortHrs",
      "uiAction.outstandingDirectEffortCost",
      "uiAction.outstandingSpending",
      "uiAction.dueDate",
      "uiAction.notes",
      "uiAction.saveFullResults"
    ]),
    ...mapMultiRowFields(["uiAction.impacts"]),

    selectedAction() {
      let that = this;
      if (this.$route.params.actionId) {
        this.actionId = this.$route.params.actionId;
        this.embedded = false;
      } else if (that.selectedActionId) {
        this.actionId = that.selectedActionId;
        this.embedded = true;
      }
      let actionId = this.actionId;

      if (actionId) {
        //TODO: if embedded, get and return action from firestore
        return this.actions.find(function(action) {
          return action.id == actionId;
        });
      } else {
        return null;
      }
    },

    averageEffortCostPerHourNode() {
      return this.nodes.find(
        node => node.id == this.currentModel.roleNodes.averageEffortCostPerHour
      );
    },

    directCost() {
      if (this.currentModel == null || this.nodes.length == 0) return;
      let averageEffortCostPerHourNode = this.nodes.find(
        node => node.id == this.currentModel.roleNodes.averageEffortCostPerHour
      );
      let effortCostPerHour = averageEffortCostPerHourNode.symbolFormula;
      let directEffortCost =
        (isNaN(this.estEffortHrs) ? 0 : this.estEffortHrs) * effortCostPerHour;
      let outstandingDirectEffortHrs =
        (isNaN(this.estEffortHrs) ? 0 : this.estEffortHrs) *
        (100 -
          (isNaN(this.effortCompletionPercentage)
            ? 0
            : this.effortCompletionPercentage)) *
        0.01;
      let outstandingDirectEffortCost =
        outstandingDirectEffortHrs * effortCostPerHour;
      let outstandingSpending =
        (isNaN(this.estSpending) ? 0 : this.estSpending) -
        (isNaN(this.spentAmount) ? 0 : this.spentAmount);
      let ownDirectCost =
        directEffortCost + (isNaN(this.estSpending) ? 0 : this.estSpending);
      let outstandingDirectCost =
        outstandingDirectEffortCost + outstandingSpending;
      let directCost = {
        own: ownDirectCost,
        outstanding: outstandingDirectCost,
        sunken: ownDirectCost - outstandingDirectCost,
        outstandingDirectEffortHrs,
        outstandingDirectEffortCost,
        outstandingSpending
      };
      return directCost;
    }
  },

  methods: {
    ...mapActions("model", ["updateAction"]),
    formatNumber,

    submitForm() {
      this.$refs.actionTitle.validate();
      if (!this.$refs.actionTitle.hasError) {
        this.submitAction();
      }
    },
    submitAction() {
      //remove fields calculated elsewhere from updates
      let updates = JSON.parse(JSON.stringify(this.uiAction));
      let propertiesToDelete = [
        "actionLeverage",
        "blockeeActionIds",
        "blockerActionIds",
        "childrenActionIds",
        "parentActionId",
        "effectiveChainedCostsAndImpacts",
        "effectiveChainedCostsAndImpactsExcludingSelf",
        "saveFullResults"
        //"impacts"
      ];
      propertiesToDelete.forEach(propertyName => delete updates[propertyName]);

      console.log(updates);
      let payload = {
        id: this.actionId,
        updates
      };
      this.$store.dispatch("actions/updateAction", payload);
      this.$store.commit("uiAction/setUiActionChanged", false);
    },

    updateChartDataForNode(nodeId) {
      //console.log(this.resultsOfAction.timeSPoints);

      // if baseline.nodes contains the selected node then load baseline for this nde
      if (
        this.resultsOfAction !== undefined &&
        this.resultsOfAction.timeSPoints !== undefined &&
        this.resultsOfAction.timeSPoints.length
      ) {
        let timeSPoints = this.resultsOfAction.timeSPoints;
        let baselineValues = this.resultsOfAction.baselineNodesValues[nodeId];
        let ifNotDoneValues = this.resultsOfAction.ifNotDoneNodesValues[nodeId];
        let ifDoneValues = this.resultsOfAction.ifDoneNodesValues[nodeId];
        //if nodeId does not exist in chartsDataArr then create it
        let chart = this.chartsArr.find(chart => chart.nodeId == nodeId);
        if (typeof chart == "undefined") {
          console.log("existing chart not found");
          let unit = (chart = {
            nodeId: nodeId,
            chartData: [],
            chartOptions: {
              title: this.getNodeName(nodeId),
              vAxis: {
                title: this.getNodeUnit(nodeId),
                scaleType: "linear",
                format: "short"
              },
              legend: { position: "bottom" },
              series: this.showDifferenceConfig,
              width: 360,
              height: 240
              //explorer: {}
            }
          });
          this.chartsArr.push(chart);
        } else {
          console.log("existing chart found");
          chart.chartData = [];
        }
        if (ifDoneValues.length > 0) {
          chart.chartData.push([
            "time",
            "baseline",
            "if done",
            "if not done",
            "done minus not done"
          ]);
          for (var i = 0; i < timeSPoints.length; i++) {
            chart.chartData.push([
              new Date(timeSPoints[i] * 1000),
              baselineValues[i],
              ifDoneValues[i],
              ifNotDoneValues[i],
              ifDoneValues[i] - ifNotDoneValues[i]
            ]);
          }
        }
      } else {
        this.chartsArr = [];
      }
    },
    updateDefaultChartsArr() {
      if (!this.currentModel || typeof this.uiAction.impacts == "undefined")
        return;
      console.log("updateDefaultChartsArr");
      let defaultNodesToChart = [];
      //add impacted nodes
      this.uiAction.impacts.forEach(function(impact) {
        defaultNodesToChart.push(impact.nodeId);
      });
      //add combinedBenefit and combinedCost nodes
      defaultNodesToChart.push(this.currentModel.roleNodes.orgBenefit);
      defaultNodesToChart.push(this.currentModel.roleNodes.orgCost);
      defaultNodesToChart.push(this.currentModel.roleNodes.worldBenefit);
      defaultNodesToChart.push(this.currentModel.roleNodes.worldCost);
      //defaultNodesToChart.push(this.currentModel.roleNodes.effort);
      //defaultNodesToChart.push(this.currentModel.roleNodes.spending);

      //load data into each node
      defaultNodesToChart.forEach(nodeId =>
        this.updateChartDataForNode(nodeId)
      );
    },
    getNodeName(nodeId) {
      const found = this.nodes.find(node => node.id == nodeId);
      if (found) return found.name;
      else return nodeId;
    },
    getNodeUnit(nodeId) {
      const found = this.nodes.find(node => node.id == nodeId);
      if (found) return found.unit;
      else return "";
    }
  },

  created() {
    (async () => {
      while (
        !firebaseAuth.currentUser // define the condition as you like
      ) {
        //console.log("waiting for currentUser to be defined");
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      let orgId = this.$route.params.orgId;
      let modelId = this.$route.params.orgId;
      this.$store.dispatch("model/bindCurrentModel", modelId);
      this.$store.dispatch("model/bindNodes", modelId);
    })();
  },
  destroyed() {
    this.actionService.stop();
  },
  watch: {
    nodes: function() {
      /*if (this.embedded == false)*/ this.updateDefaultChartsArr();
    },
    resultsOfAction: function() {
      /*if (this.embedded == false)*/ this.updateDefaultChartsArr();
    },
    selectedAction: function(newAction, oldAction) {
      if (newAction && oldAction && newAction.id == oldAction.id) return;

      // Start with the machine's initial context
      this.actionStateContext = actionMachine.context;

      //start actionService
      this.actionService
        .onTransition(state => {
          // Update the current state component data property with the next state
          this.actionMchState = state;
          this.$store.commit("uiAction/setActionMchState", state);
          //console.log("set state: ", this.uiAction.actionMchState);

          // Update the context component data property with the updated context
          this.actionStateContext = state.context;
        })
        .start();

      let action = {};
      Object.assign(action, this.selectedAction);
      this.$store.dispatch("uiAction/setUiAction", action);
      if (this.embedded == false) {
        this.$store.dispatch("calcResults/loadResultsOfAction", action.id);
      } else {
        this.$store.dispatch("calcResults/clearResultsOfAction");
      }

      // Start with saved state or the machine's initial state
      //console.log(this.uiAction.actionMchState);
      if (!this.uiAction.actionMchState.hasOwnProperty("value")) {
        this.$store.commit(
          "uiAction/setActionMchState",
          actionMachine.initialState
        );
        //console.log("set to initial state: ", this.uiAction.actionMchState);
      } else {
        //console.log("existing state: ", this.uiAction.actionMchState);
      }
    },

    directCost: function() {
      if (typeof this.directCost == "undefined") return;
      this.ownDirectCost = this.directCost.own;
      this.outstandingDirectCost = this.directCost.outstanding;
      this.sunkenDirectCost = this.directCost.sunken;
      this.outstandingDirectEffortHrs = this.directCost.outstandingDirectEffortHrs;
      this.outstandingDirectEffortCost = this.directCost.outstandingDirectEffortCost;
      this.outstandingSpending = this.directCost.outstandingSpending;
    }
  }
};
</script>
