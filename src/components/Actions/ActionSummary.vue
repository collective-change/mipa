<template>
  <div v-if="uiAction && uiAction.actionMchState">
    <q-form @submit.prevent="submitForm">
      <div class="row items-center">
        <div
          v-bind:class="{ 'col-12 col-md-4': !embedded, 'col-12': embedded }"
        >
          <q-input
            class="text-h6"
            v-model="title"
            :rules="[(val) => !!val || 'Field is required']"
            ref="actionTitle"
          >
            <template v-slot:prepend>
              <q-chip square color="primary" text-color="white">
                {{ $t(uiAction.actionMchState.value) }}
              </q-chip>
            </template>
            <template v-slot:after v-if="embedded">
              <q-btn
                dense
                label="details"
                color="primary"
                @click="
                  $router.push(
                    `/org/${currentOrg.nameSlug}/action-details/${currentOrg.id}/${uiAction.id}`
                  )
                "
              />
            </template>
          </q-input>
        </div>

        <div
          v-bind:class="{ 'col-12 col-md-2': !embedded, 'col-12': embedded }"
        >
          <div class="q-px-xs q-gutter-xs">
            <q-chip outline color="primary"
              >Leverage {{ formatNumber(uiAction.actionLeverage, 2) }}</q-chip
            >
            <q-chip outline color="primary"
              >Total ROI {{ formatNumber(uiAction.totalRoi, 2) }}</q-chip
            >
          </div>
        </div>

        <div
          v-bind:class="{ 'col-12 col-md-6': !embedded, 'col-12': embedded }"
        >
          <div class="row q-pa-sm q-gutter-sm">
            <calculator-ui
              calculationType="uiAction"
              buttonLabel="Recalculate"
              :uiAction="{ ...uiAction, saveFullResults, saveResultsOnDevice }"
            />

            <q-checkbox
              v-model="saveResultsOnDevice"
              label="Save results for charting on this device"
              @input="
                setSaveResultsOnDeviceForAction(action.id, saveResultsOnDevice)
              "
            />
            <q-checkbox
              v-model="saveFullResults"
              label="Save full results for export (next run only)"
            />

            <export-calc-results
              data-source="resultsOfAction"
              :actionId="uiAction.id"
              :actionTitle="uiAction.title"
              buttonLabel="Export results TSV"
            />
            <q-btn-group v-if="uiAction.actionMchState.value == 'initiating'">
              <q-btn
                :label="$t('Cancel')"
                @click="actionService.send('CANCEL')"
                color="primary"
              />
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

            <q-btn-group v-if="uiAction.actionMchState.value == 'to_approve'">
              <q-btn
                :label="$t('Approve')"
                @click="actionService.send('APPROVE')"
                color="primary"
              />
              <q-btn
                :label="$t('Reject')"
                @click="actionService.send('REJECT')"
                color="primary"
              />
            </q-btn-group>

            <q-btn-group v-if="uiAction.actionMchState.value == 'rejected'">
              <q-btn
                :label="$t('Request approval')"
                @click="actionService.send('REQUEST_APPROVAL')"
                color="primary"
              />
            </q-btn-group>

            <q-btn-group v-if="uiAction.actionMchState.value == 'eligible'">
              <q-btn
                :label="$t('Approval needed')"
                @click="actionService.send('APPROVAL_NEEDED')"
                color="primary"
              />
              <q-btn
                :label="$t('Cancel')"
                @click="actionService.send('CANCEL')"
                color="primary"
              />
              <q-btn
                :label="$t('Mark as done')"
                @click="actionService.send('FINISH')"
                color="primary"
              />
            </q-btn-group>

            <q-btn-group v-if="uiAction.actionMchState.value == 'approved'">
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

            <q-btn-group v-if="uiAction.actionMchState.value == 'done'">
              <q-btn
                :label="$t('Revert to eligible')"
                @click="actionService.send('REVERT_FINISH')"
                color="primary"
              />
            </q-btn-group>

            <q-btn-group
              v-if="uiAction.actionMchState.value == 'cancellation_requested'"
            >
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

            <q-btn-group v-if="uiAction.actionMchState.value == 'canceled'">
              <q-btn
                :label="$t('Revive')"
                @click="actionService.send('REVIVE')"
                color="primary"
              />
            </q-btn-group>

            <!-- <q-btn color="primary" label="Meet about this" /> -->
          </div>
        </div>
      </div>

      <div class="row q-col-gutter-md">
        <div
          v-bind:class="{ 'col-12 col-md-6': !embedded, 'col-12': embedded }"
        >
          <q-input v-model="notes" :label="$t('Notes')" filled autogrow />
          <q-card-actions align="right">
            <q-btn label="Save" color="primary" type="submit" />
          </q-card-actions>

          <div class="text-h6 q-mt-md">Impact estimates</div>
          <!--
          <div class="q-gutter-sm">
            <q-checkbox
              v-model="useSimpleEstimateMethod"
              label="Use simple method"
            />
          </div>

          <div
            v-if="useSimpleEstimateMethod"
            class="row q-gutter-md items-start"
          >
            <q-input
              v-model.number="simpleEstimateTotalBenefit"
              :label="$t('simpleEstimateTotalBenefit')"
              type="number"
              step="any"
              :suffix="currentOrg.currency"
              :rules="[
                (val) => val == null || val >= 0 || 'Should be at least 0',
              ]"
              filled
              class="col-3"
              style="max-width: 150px"
              debounce="500"
            />
            <q-input
              class="col-8"
              v-model="simpleEstimateTotalBenefitNotes"
              :label="$t('simpleEstimateTotalBenefitNotes')"
              filled
              autogrow
            />
            simpleEstimateTotalBenefit simpleEstimateTotalBenefitNotes
            simpleEstimateOtherCosts simpleEstimatseOtherCostsNotes
          </div>
          <impacts v-else /> -->
          <impacts />

          <div class="text-h6 q-mt-md">Action costs and progress</div>
          <div class="row q-gutter-md items-start">
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
                (val) => val == null || val >= 0 || 'Should be at least 0',
              ]"
              filled
              style="max-width: 150px"
              debounce="500"
            />
            <q-input
              v-model.number="estEffortHrs"
              :label="$t('estEffortHrs')"
              type="number"
              step="any"
              suffix="hours"
              :rules="[
                (val) => val == null || val >= 0 || 'Should be at least 0',
              ]"
              filled
              style="max-width: 150px"
              debounce="500"
            />
            <q-input
              v-model.number="effortCompletionPercentage"
              type="number"
              step="any"
              :suffix="$t('percentDone')"
              :rules="[
                (val) => val == null || val >= 0 || 'Should be at least 0',
              ]"
              filled
              style="max-width: 150px"
              debounce="500"
            />

            <q-slider
              :value="effortCompletionPercentage"
              @change="
                (val) => {
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
              step="any"
              :suffix="currentOrg.currency"
              :rules="[
                (val) => val == null || val >= 0 || 'Should be at least 0',
              ]"
              filled
              style="max-width: 150px"
              debounce="500"
            />
            <q-input
              v-model.number="spentAmount"
              :label="$t('spentAmount')"
              type="number"
              step="any"
              :suffix="currentOrg.currency"
              :rules="[
                (val) => val == null || val >= 0 || 'Should be at least 0',
              ]"
              filled
              style="max-width: 150px"
              debounce="500"
            />
          </div>
          <q-card-actions align="right">
            <q-btn label="Save" color="primary" type="submit" />
          </q-card-actions>
        </div>

        <div v-bind:class="{ 'col-6 col-md-3': !embedded, 'col-12': embedded }">
          <!-- middle column -->
          <div class="text-h6">Relationships</div>
          <div class="q-pa-sm q-gutter-sm">
            <action-relationships></action-relationships>
          </div>
          <div class="text-h6">Computed</div>
          <q-list bordered separator class="rounded-borders">
            <q-expansion-item
              label="Impacts from related actions"
              header-class="text-weight-medium"
            >
              <simpleCostsAndImpacts
                :costsAndImpacts="
                  uiAction.effectiveChainedCostsAndImpactsExcludingSelf
                "
              >
                <!-- <template v-slot:header>Direct costs</template> -->
              </simpleCostsAndImpacts>
            </q-expansion-item>
            <q-expansion-item
              label="Aggregated results"
              header-class="text-weight-medium"
            >
              <q-markup-table flat separator="none">
                <thead>
                  <tr>
                    <th class="text-left">Item</th>
                    <th class="text-right">
                      NPV ({{ currentOrg ? currentOrg.currency : "" }})
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Outstanding direct costs</td>
                    <td class="text-right">
                      {{ formatNumber(uiAction.outstandingDirectCosts, 3) }}
                    </td>
                  </tr>
                  <tr>
                    <td>Raw benefit to organization</td>
                    <td class="text-right">
                      {{ formatNumber(uiAction.rawMarginalOrgBenefitNpv, 3) }}
                    </td>
                  </tr>
                  <tr>
                    <td>Raw cost to organization</td>
                    <td class="text-right">
                      {{ formatNumber(uiAction.rawMarginalOrgCostNpv, 3) }}
                    </td>
                  </tr>
                  <tr>
                    <td>Adjusted benefit to organization</td>
                    <td class="text-right">
                      {{ formatNumber(uiAction.marginalOrgBenefitNpv, 3) }}
                    </td>
                  </tr>
                  <tr>
                    <td>Adjusted cost to organization</td>
                    <td class="text-right">
                      {{ formatNumber(uiAction.marginalOrgCostNpv, 3) }}
                    </td>
                  </tr>
                  <tr>
                    <td>Raw benefit to world</td>
                    <td class="text-right">
                      {{ formatNumber(uiAction.rawMarginalWorldBenefitNpv, 3) }}
                    </td>
                  </tr>
                  <tr>
                    <td>Raw cost to world</td>
                    <td class="text-right">
                      {{ formatNumber(uiAction.rawMarginalWorldCostNpv, 3) }}
                    </td>
                  </tr>
                  <tr>
                    <td>Adjusted benefit to world</td>
                    <td class="text-right">
                      {{ formatNumber(uiAction.marginalWorldBenefitNpv, 3) }}
                    </td>
                  </tr>
                  <tr>
                    <td>Adjusted cost to world</td>
                    <td class="text-right">
                      {{ formatNumber(uiAction.marginalWorldCostNpv, 3) }}
                    </td>
                  </tr>

                  <tr>
                    <td>Total benefit</td>
                    <td class="text-right">
                      {{ formatNumber(uiAction.marginalTotalBenefitNpv, 3) }}
                    </td>
                  </tr>
                  <tr>
                    <td>Total cost</td>
                    <td class="text-right">
                      {{ formatNumber(uiAction.marginalTotalCostNpv, 3) }}
                    </td>
                  </tr>
                  <tr>
                    <td>Net total benefit</td>
                    <td class="text-right">
                      {{ formatNumber(uiAction.marginalNetTotalBenefitNpv, 3) }}
                    </td>
                  </tr>
                </tbody>
              </q-markup-table>
            </q-expansion-item>
          </q-list>
        </div>
        <div v-bind:class="{ 'col-6 col-md-3': !embedded, 'col-12': embedded }">
          <select-user
            label="Responsible"
            v-model="uiAction.responsiblePerson"
          />
          <select-user
            label="Accountable"
            v-model="uiAction.accountablePerson"
          />
          <q-card-actions align="right">
            <q-btn label="Save" color="primary" type="submit" />
          </q-card-actions>
          <div class="text-h6">Chat</div>
          <chat
            :chatId="uiAction.chatId"
            subjectDocType="action"
            :subjectDocLineage="{ actionId: uiAction.id }"
            :subjectDocTitle="uiAction.title"
          />
        </div>
      </div>
      <div v-if="!embedded" class="text-h6">Simulation results</div>
      <div v-if="!embedded">
        <action-sim-charts />
      </div>
    </q-form>
  </div>
</template>

<script>
import { firebaseAuth } from "boot/firebase";
import { mapActions, mapMutations, mapGetters, mapState } from "vuex";
import { createHelpers, mapMultiRowFields } from "vuex-map-fields";
import { interpret } from "xstate";
import { actionMachine } from "src/state-machines/machine-action";
import { formatNumber } from "src/utils/util-formatNumber";
import idb from "src/api/idb";

const { mapFields } = createHelpers({
  getterType: "uiAction/getField",
  mutationType: "uiAction/updateUiActionField",
});

export default {
  components: {
    /*"modal-save-button": require("components/Shared/ModalComponents/ModalSaveButton.vue")
      .default,*/
    impacts: require("components/Impacts/Impacts.vue").default,
    simpleCostsAndImpacts: require("components/Impacts/SimpleCostsAndImpacts.vue")
      .default,
    "calculator-ui": require("components/Calc/CalculatorUi.vue").default,
    "export-calc-results": require("components/Calc/ExportCalcResults.vue")
      .default,
    "action-relationships": require("components/Actions/Relationships/ActionRelationships.vue")
      .default,
    "select-user": require("components/Users/SelectUser.vue").default,
    "action-sim-charts": require("components/Charts/ActionSimCharts.vue")
      .default,
    chat: require("components/Chats/Chat.vue").default,
  },

  props: ["action"],

  data() {
    return {
      //embedded: false, //whether this component is embedded or a full page
      actionId: null,
      saveFullResults: false,
      saveResultsOnDevice: false,
      effortCostPerHrTypeOptions: [
        {
          label: "use average effort cost per hour",
          value: "use_average",
        },
        {
          label: "use custom effort cost per hour",
          value: "use_custom",
        },
      ],
      actionService: interpret(actionMachine),
      actionStateContext: null,
    };
  },

  computed: {
    ...mapState("orgs", ["currentOrg"]),
    ...mapState("ui", ["selectedActionId"]),
    ...mapState("model", ["currentModel"]),
    ...mapGetters("model", ["nodes"]),
    ...mapState("calcResults", ["resultsOfAction"]),
    //...mapState("actions", ["currentAction"]),
    ...mapState("actions", ["matchingActions"]),
    //fields calculated in the uiAction store, for display only
    //(do not modify their values in the component)
    ...mapState("uiAction", [
      "uiAction",
      "uiActionChanged",
      "uiActionChangedFields",
    ]),
    //fields for 2-way sync between component and store
    ...mapFields([
      "uiAction.title",
      "uiAction.actionMchState",
      "uiAction.useSimpleEstimateMethod",
      "uiAction.simpleEstimateTotalBenefit",
      "uiAction.simpleEstimateTotalBenefitNotes",
      "uiAction.simpleEstimateOtherCosts",
      "uiAction.simpleEstimatseOtherCostsNotes",
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
      "uiAction.responsiblePerson",
      "uiAction.accountablePerson",
      "uiAction.chatId",
    ]),
    ...mapMultiRowFields(["uiAction.impacts"]),

    embedded() {
      let that = this;
      if (this.$route.params.actionId) {
        return false;
      } else if (this.selectedActionId) {
        return true;
      }
    },

    averageEffortCostPerHourNode() {
      return this.nodes.find(
        (node) =>
          node.id == this.currentModel.roleNodes.averageEffortCostPerHour
      );
    },

    directCost() {
      if (this.currentModel == null || this.nodes.length == 0) return;
      let averageEffortCostPerHourNode = this.nodes.find(
        (node) =>
          node.id == this.currentModel.roleNodes.averageEffortCostPerHour
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
        outstandingSpending,
      };
      return directCost;
    },
  },

  methods: {
    ...mapActions("model", ["updateAction"]),
    ...mapMutations("uiAction", ["mergeNewActionToUiAction"]),
    formatNumber,

    async loadAction(newAction) {
      // Start with the machine's initial context
      this.actionStateContext = actionMachine.context;

      //start actionService
      this.actionService
        .onTransition((state) => {
          // Update the current state component data property with the next state
          this.actionMchState = state;
          this.$store.commit("uiAction/setActionMchState", state);

          // Update the context component data property with the updated context
          this.actionStateContext = state.context;
        })
        .start();
      this.$store.dispatch("uiAction/setUiAction", {
        id: newAction.id,
        ...newAction,
      });
      this.saveResultsOnDevice = await idb.getSaveResultsOnDeviceForAction(
        newAction.id
      );

      // Start with saved state or the machine's initial state
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
    submitForm() {
      this.$refs.actionTitle.validate();
      if (!this.$refs.actionTitle.hasError) {
        this.submitAction();
      }
    },
    submitAction() {
      //remove fields not meant to be updated
      let updates = JSON.parse(JSON.stringify(this.uiAction));
      let propertiesToDelete = [
        "actionLeverage",
        "actionRoi",
        "totalRoi",
        "blockeeActionIds",
        "blockerActionIds",
        "childrenActionIds",
        "parentActionId",
        "effectiveChainedCostsAndImpacts",
        "effectiveChainedCostsAndImpactsExcludingSelf",
      ];
      propertiesToDelete.forEach(
        (propertyName) => delete updates[propertyName]
      );

      let payload = {
        id: this.action.id,
        updates,
      };
      this.$store.dispatch("actions/updateAction", payload);
      this.$store.commit("uiAction/setUiActionChanged", false);
    },
    setSaveResultsOnDeviceForAction(actionId, val) {
      idb.setSaveResultsOnDeviceForAction(actionId, val);
    },
  },

  created() {
    (async () => {
      while (
        !firebaseAuth.currentUser // define the condition as you like
      ) {
        //console.log("waiting for currentUser to be defined");
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      let orgId = this.$route.params.orgId;
      let modelId = this.$route.params.orgId;
      this.$store.dispatch("model/bindCurrentModel", modelId);
      this.$store.dispatch("model/bindNodes", modelId);
    })();
  },

  mounted() {
    this.loadAction(this.action);
  },

  destroyed() {
    this.actionService.stop();
  },
  watch: {
    action: {
      deep: true,
      handler(newAction, oldAction) {
        if (
          //action first loaded OR changed from another action
          (newAction && !oldAction) ||
          (newAction && newAction.id != oldAction.id)
        ) {
          this.loadAction(newAction);
          this.saveFullResults = false;
        } else if (newAction) {
          //same action, just refreshed
          this.$store.commit("uiAction/mergeNewActionToUiAction", newAction);
        } else this.$store.dispatch("uiAction/setUiAction", null); //no new action
      },
    },

    directCost: function () {
      if (typeof this.directCost == "undefined") return;
      this.ownDirectCost = this.directCost.own;
      this.outstandingDirectCost = this.directCost.outstanding;
      this.sunkenDirectCost = this.directCost.sunken;
      this.outstandingDirectEffortHrs = this.directCost.outstandingDirectEffortHrs;
      this.outstandingDirectEffortCost = this.directCost.outstandingDirectEffortCost;
      this.outstandingSpending = this.directCost.outstandingSpending;
    },
  },
};
</script>
