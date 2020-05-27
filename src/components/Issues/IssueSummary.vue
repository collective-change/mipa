<template>
  <div>
    <div v-if="selectedIssue">
      <q-form @submit.prevent="submitForm">
        <div class="row">
          <div
            v-bind:class="{ 'col-12 col-md-6': !embedded, 'col-12': embedded }"
          >
            <q-input
              class="text-h6"
              v-model="title"
              :rules="[val => !!val || 'Field is required']"
              ref="issueTitle"
            >
              <template v-slot:after v-if="embedded">
                <q-btn
                  dense
                  label="details"
                  color="primary"
                  @click="
                    $router.push(
                      `/org/${currentOrg.name}/issue/${currentOrg.id}/${selectedIssueId}`
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
                >Total benefit {{ uiIssue.estTotalBenefitXdr }} XDR</q-chip
              >
              <q-chip outline color="primary"
                >Outstanding cost {{ uiIssue.outstandingCostXdr }} XDR</q-chip
              >
              <q-chip color="primary" text-color="white"
                >ROI {{ uiIssue.estRoi }}</q-chip
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

        <div class="row">
          <div
            v-bind:class="{ 'col-12 col-md-6': !embedded, 'col-12': embedded }"
          >
            <div class="text-h6">Impacts</div>
            <q-list bordered padding>
              <q-item tag="label" v-ripple>
                <q-item-section>
                  <q-item-label>Battery too low</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-toggle color="blue" v-model="notif1" val="battery" />
                </q-item-section>
              </q-item>
            </q-list>
            <div class="q-gutter-md row items-start">
              <q-input
                v-model.number="estTotalBenefitXdr"
                label="預估總效益"
                type="number"
                suffix="XDR"
                filled
                style="max-width: 150px;"
              />

              <q-input
                v-model.number="uiIssue.estTotalCostXdr"
                label="預估總成本"
                type="number"
                suffix="XDR"
                style="max-width: 150px;"
                readonly
              />

              <q-input
                v-model.number="uiIssue.outstandingCostXdr"
                label="需再付出成本"
                type="number"
                suffix="XDR"
                style="max-width: 150px;"
                readonly
              />

              <q-input
                v-model.number="uiIssue.estRoi"
                label="估計 SROI"
                type="number"
                style="max-width: 150px;"
                readonly
              />
            </div>

            <div class="q-gutter-md q-mt-md row items-start">
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
              />
              <q-slider
                v-model="effortCompletionPercentage"
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
              />
            </div>
            <div class="q-gutter-md q-mt-md items-start">
              <q-input
                v-model="dueDate"
                filled
                type="date"
                label="截止日期"
                style="max-width: 160px;"
              />

              <q-input v-model="notes" label="筆記" type="textarea" filled />
            </div>

            <modal-buttons />
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
import { mapActions, mapGetters, mapState } from "vuex";
//import { mapFields } from 'vuex-map-fields';
import { createHelpers } from "vuex-map-fields";

const { mapFields } = createHelpers({
  getterType: "uiIssue/getField",
  mutationType: "uiIssue/updateField"
});

export default {
  components: {
    "modal-buttons": require("components/Shared/ModalComponents/ModalButtons.vue")
      .default
  },

  data() {
    return {
      embedded: false, //whether this component is embedded or a full page
      issueId: null,
      //issue: {},
      estimatedRoi: null
    };
  },

  computed: {
    ...mapState("orgs", ["currentOrg"]),
    ...mapState("ui", ["selectedIssueId"]),
    ...mapState("issues", ["issues"]),
    //fields calculated in the uiIssue store, for display only
    //(do not modify their values in the component)
    ...mapState("uiIssue", ["uiIssue"]),
    //fields for 2-way sync between component and store
    ...mapFields([
      "uiIssue.title",
      "uiIssue.estTotalBenefitXdr",
      "uiIssue.estEffortCostXdr",
      "uiIssue.effortCompletionPercentage",
      "uiIssue.estPurchaseCostXdr",
      "uiIssue.purchasedAmount",
      "uiIssue.dueDate",
      "uiIssue.notes"
    ]),

    selectedIssue() {
      let that = this;
      if (this.$route.params.issueId) {
        this.issueId = this.$route.params.issueId;
        this.embedded = false;
      } else if (that.selectedIssueId) {
        this.issueId = that.selectedIssueId;
        this.embedded = true;
      }
      let issueId = this.issueId;
      return this.issues.find(function(issue) {
        return issue.id == issueId;
      });
    },

    estTotalCostXdr() {
      let estEffortCostXdr = this.uiIssue.estEffortCostXdr
        ? this.uiIssue.estEffortCostXdr
        : 0;
      let estPurchaseCostXdr = this.uiIssue.estPurchaseCostXdr
        ? this.uiIssue.estPurchaseCostXdr
        : 0;
      let estTotalCostXdr = estEffortCostXdr + estPurchaseCostXdr;
      return estTotalCostXdr;
    },

    outstandingCostXdr() {
      let effortCompletionPercentage = this.uiIssue.effortCompletionPercentage
        ? this.uiIssue.effortCompletionPercentage
        : 0;
      let outstandingEffortCost =
        this.uiIssue.estEffortCostXdr * (1 - effortCompletionPercentage / 100);

      let estPurchaseCostXdr = this.uiIssue.estPurchaseCostXdr
        ? this.uiIssue.estPurchaseCostXdr
        : 0;

      let purchasedAmount = this.uiIssue.purchasedAmount
        ? this.uiIssue.purchasedAmount
        : 0;

      let outstandingPurchaseCost = Math.max(
        0,
        estPurchaseCostXdr - purchasedAmount
      );
      let outstandingCostXdr = outstandingEffortCost + outstandingPurchaseCost;
      return Math.round(outstandingCostXdr);
    },

    estRoi() {
      let outstandingCostXdr = this.outstandingCostXdr;
      let benefit = this.uiIssue.estTotalBenefitXdr
        ? this.uiIssue.estTotalBenefitXdr
        : 0;
      let roi = (benefit - outstandingCostXdr) / outstandingCostXdr;
      return Number(roi.toPrecision(2));
    }

    /*class6() {
      return this.embedded ? 'col-xs-12 col-sm-6' : 'col-xs-6 col-sm-3'
    }*/
  },

  methods: {
    ...mapActions("model", ["updateIssue"]),
    submitForm() {
      this.$refs.issueTitle.validate();
      if (!this.$refs.issueTitle.hasError) {
        this.submitIssue();
      }
    },
    submitIssue() {
      let payload = {
        id: this.issueId,
        updates: this.uiIssue
      };
      this.$store.dispatch("issues/updateIssue", payload);
    }
  },

  watch: {
    selectedIssue: function(newIssue, oldIssue) {
      //this.issue = Object.assign({}, this.selectedIssue);
      this.$store.dispatch("uiIssue/setUiIssue", this.selectedIssue);
    }
    /*
    estTotalCostXdr: function() {
      //this.issue.estTotalCostXdr = this.estTotalCostXdr;
      this.$store.dispatch("uiIssue/setEstTotalCostXdr", this.estTotalCostXdr);
    },
    outstandingCostXdr: function() {
      //this.issue.outstandingCostXdr = this.outstandingCostXdr;
      this.$store.dispatch(
        "uiIssue/setOutstandingCostXdr",
        this.outstandingCostXdr
      );
    },
    estRoi: function(newValue, oldValue) {
      //this.issue.estRoi = this.estRoi;
      this.$store.dispatch("uiIssue/setEstRoi", this.estRoi);
    } */
  }
};
</script>
