<template>
  <div>
    <div v-if="selectedIssue">
      <q-form @submit.prevent="submitForm">
        <q-input
          class="text-h6"
          v-model="issue.name"
          :rules="[(val) => !!val || 'Field is required']"
          ref="issueName"
        />
        <div class="q-gutter-md row items-start">
          <q-input
            v-model.number="issue.estTotalBenefitXdr"
            label="Est. total benefit"
            type="number"
            suffix="XDR"
            :rules="[(val) => val >= 0 || 'Should be at least 0']"
            filled
            style="max-width: 150px;"
          />

          <q-input
            v-model.number="issue.outstandingCost"
            label="Outstanding cost"
            type="number"
            suffix="XDR"
            :rules="[(val) => val >= 0 || 'Should be at least 0']"
            filled
            style="max-width: 150px;"
            readonly
          />

          <q-input
            v-model.number="issue.estRoi"
            label="Est. ROI"
            type="number"
            filled
            style="max-width: 150px;"
            readonly
          />
        </div>

        <div class="q-gutter-md q-mt-md row items-start">
          <q-input
            v-model.number="issue.estEffortCostXdr"
            label="Est. effort cost"
            type="number"
            suffix="XDR"
            :rules="[(val) => val >= 0 || 'Should be at least 0']"
            filled
            style="max-width: 150px;"
          />
          <q-input
            v-model.number="issue.effortCompletionPercentage"
            type="number"
            suffix="% complete"
            :rules="[(val) => val >= 0 || 'Should be at least 0']"
            filled
            style="max-width: 150px;"
          />
          <q-slider
            v-model="issue.effortCompletionPercentage"
            :min="0"
            :max="100"
            label
          />
        </div>

        <div class="q-gutter-md q-mt-md row items-start">
          <q-input
            v-model.number="issue.estPurchaseCostXdr"
            label="Est. purchase cost"
            type="number"
            suffix="XDR"
            :rules="[(val) => val >= 0 || 'Should be at least 0']"
            filled
            style="max-width: 150px;"
          />
          <q-input
            v-model.number="issue.purchasedAmount"
            label="Purchased amount"
            type="number"
            suffix="XDR"
            :rules="[(val) => val >= 0 || 'Should be at least 0']"
            filled
            style="max-width: 150px;"
          />
        </div>

        <q-input
          v-model="issue.details"
          label="Details"
          type="textarea"
          filled
        />

        <modal-buttons />
      </q-form>
    </div>
    <p>selectedIssueId: {{ selectedIssueId }}</p>
    <pre>{{ selectedIssue }}</pre>
  </div>
</template>

<script>
import { mapActions, mapGetters, mapState } from "vuex";

export default {
  components: {
    "modal-buttons": require("components/Shared/ModalComponents/ModalButtons.vue")
      .default,
  },

  data() {
    return {
      issue: {},
      estimatedRoi: null,
      //model: null
    };
  },

  computed: {
    ...mapState("ui", ["selectedIssueId"]),
    ...mapState("issues", ["issues"]),

    selectedIssue() {
      let that = this;
      return this.issues.find(function (issue) {
        return issue.id == that.selectedIssueId;
      });
    },

    outstandingCost() {
      let effortCompletionPercentage = this.issue.effortCompletionPercentage
        ? this.issue.effortCompletionPercentage
        : 0;
      let outstandingEffortCost =
        this.issue.estEffortCostXdr * (1 - effortCompletionPercentage / 100);

      let outstandingPurchaseCost = Math.max(
        0,
        this.issue.estPurchaseCostXdr - this.issue.purchasedAmount
      );
      let outstandingCost = outstandingEffortCost + outstandingPurchaseCost;
      return outstandingCost;
    },

    estRoi() {
      let outstandingCost = this.outstandingCost;
      let benefit = this.issue.estTotalBenefitXdr;
      let roi = (benefit - outstandingCost) / outstandingCost;
      let precision = Math.ceil(Math.log10(Math.abs(roi)));
      let roundedRoi = (roi / 10 ** precision).toFixed(2) * 10 ** precision;
      return roundedRoi;
    },
  },

  methods: {
    ...mapActions("model", ["updateIssue"]),
    submitForm() {
      this.$refs.issueName.validate();
      if (!this.$refs.issueName.hasError) {
        this.submitIssue();
      }
    },
    submitIssue() {
      let payload = {
        id: this.selectedIssueId,
        updates: this.issue,
      };
      this.$store.dispatch("issues/updateIssue", payload);
      /*this.updateIssue({
        modelId: this.$route.params.modelId,
        updates: this.issue
      });*/
      //this.$emit("close");
    },
  },

  mounted() {},

  watch: {
    selectedIssue: function (newIssue, oldIssue) {
      this.issue = Object.assign({}, this.selectedIssue);
    },
    outstandingCost: function () {
      this.issue.outstandingCost = this.outstandingCost;
    },
    estRoi: function (newValue, oldValue) {
      this.issue.estRoi = this.estRoi;
    },
  },
};
</script>
