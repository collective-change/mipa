<template>
  <div>
    <div v-if="selectedAction">
      <q-form @submit.prevent="submitForm">
        <div class="row">
          <div
            v-bind:class="{ 'col-12 col-md-6': !embedded, 'col-12': embedded }"
          >
            <q-input
              class="text-h6"
              v-model="title"
              :rules="[val => !!val || 'Field is required']"
              ref="actionTitle"
            >
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

          <div
            v-bind:class="{ 'col-6 col-md-3': !embedded, 'col-6': embedded }"
          >
            <div class="q-pa-xs q-gutter-xs">
              <q-chip outline color="primary"
                >Benefit
                {{ formatNumber(uiAction.estTotalBenefitXdr) }} XDR</q-chip
              >
              <q-chip outline color="primary"
                >Cost
                {{ formatNumber(uiAction.outstandingCostXdr, 3) }}
                XDR</q-chip
              >
              <q-chip color="primary" text-color="white"
                >ROI {{ formatNumber(uiAction.estRoi, 2) }}</q-chip
              >
            </div>
          </div>

          <div
            v-bind:class="{ 'col-6 col-md-3': !embedded, 'col-6': embedded }"
          >
            <div class="q-pa-sm q-gutter-sm">
              <q-btn color="primary" label="Meet about this" />
              <q-btn color="primary" label="Mark as resolved" />
            </div>
          </div>
        </div>

        <div class="row ">
          <div
            v-bind:class="{ 'col-12 col-md-6': !embedded, 'col-12': embedded }"
          >
            <q-input v-model="notes" label="筆記" filled autogrow />

            <impacts />

            <div class="row q-gutter-md q-mt-md items-start">
              <q-input
                v-model.number="estTotalBenefitXdr"
                label="預估總效益"
                type="number"
                suffix="XDR"
                filled
                style="max-width: 150px;"
                debounce="500"
              />

              <q-input
                v-bind:value="uiAction.estTotalCostXdr"
                label="預估總成本"
                type="number"
                suffix="XDR"
                style="max-width: 150px;"
                readonly
              />

              <q-input
                v-bind:value="formatNumber(uiAction.outstandingCostXdr, 3)"
                label="需再付出成本"
                type="number"
                suffix="XDR"
                style="max-width: 150px;"
                readonly
              />

              <q-input
                v-bind:value="formatNumber(uiAction.estRoi, 2)"
                label="估計 SROI"
                style="max-width: 150px;"
                readonly
              />
            </div>

            <div class="row q-gutter-md q-mt-md items-start">
              <q-input
                v-model.number="estEffortCostXdr"
                label="預估人力成本"
                type="number"
                suffix="XDR"
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
                suffix="% 完成"
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
                v-model.number="estPurchaseCostXdr"
                label="預估採購金額"
                type="number"
                suffix="XDR"
                :rules="[
                  val => val == null || val >= 0 || 'Should be at least 0'
                ]"
                filled
                style="max-width: 150px;"
                debounce="500"
              />
              <q-input
                v-model.number="purchasedAmount"
                label="已採購金額"
                type="number"
                suffix="XDR"
                :rules="[
                  val => val == null || val >= 0 || 'Should be at least 0'
                ]"
                filled
                style="max-width: 150px;"
                debounce="500"
              />
            </div>
            <!--<div class="q-gutter-md q-mt-md items-start">
              <q-input
                v-model="dueDate"
                filled
                type="date"
                label="截止日期"
                style="max-width: 160px;"
                debounce="500"
              />
            </div> -->

            <modal-save-button />
          </div>
          <div
            v-bind:class="{ 'col-6 col-md-3': !embedded, 'col-12': embedded }"
          >
            middle column
          </div>
          <div
            v-bind:class="{ 'col-6 col-md-3': !embedded, 'col-12': embedded }"
          >
            right column
          </div>
        </div>
      </q-form>
    </div>
  </div>
</template>

<script>
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";
import { mapActions, mapGetters, mapState } from "vuex";
//import { mapFields } from 'vuex-map-fields';
import { createHelpers, mapMultiRowFields } from "vuex-map-fields";
import { formatNumber } from "src/utils/util-formatNumber";

const { mapFields } = createHelpers({
  getterType: "uiAction/getField",
  mutationType: "uiAction/updateUiActionField"
});

export default {
  components: {
    "modal-save-button": require("components/Shared/ModalComponents/ModalSaveButton.vue")
      .default,
    impacts: require("components/Impacts/Impacts.vue").default
  },

  data() {
    return {
      embedded: false, //whether this component is embedded or a full page
      actionId: null,
      //action: {},
      estimatedRoi: null
    };
  },

  computed: {
    ...mapState("orgs", ["currentOrg"]),
    ...mapState("ui", ["selectedActionId"]),
    ...mapState("actions", ["actions"]),
    //fields calculated in the uiAction store, for display only
    //(do not modify their values in the component)
    ...mapState("uiAction", ["uiAction", "uiActionChanged"]),
    //fields for 2-way sync between component and store
    ...mapFields([
      "uiAction.title",
      "uiAction.estTotalBenefitXdr",
      "uiAction.estEffortCostXdr",
      "uiAction.effortCompletionPercentage",
      "uiAction.estPurchaseCostXdr",
      "uiAction.purchasedAmount",
      "uiAction.dueDate",
      "uiAction.notes"
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
      return this.actions.find(function(action) {
        return action.id == actionId;
      });
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
      let payload = {
        id: this.actionId,
        updates: this.uiAction
      };
      this.$store.dispatch("actions/updateAction", payload);
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
  watch: {
    selectedAction: function(newAction, oldAction) {
      let action = {};
      Object.assign(action, this.selectedAction);
      this.$store.dispatch("uiAction/setUiAction", action);
    }
  }
};
</script>
