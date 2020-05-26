<template>
  <div>
    <div v-if="selectedIssue">
      <q-form @submit.prevent="submitForm">
        <q-input
          class="text-h6"
          v-model="issue.title"
          :rules="[(val) => !!val || 'Field is required']"
          ref="issueTitle"
        >
          <template v-slot:after v-if="$route.name!='issueDetails'">
            <q-btn
              dense
              label="details"
              color="primary"
              @click="$router.push(`/org/${currentOrg.name}/issue/${currentOrg.id}/${selectedIssueId}`)"
            />
          </template>
        </q-input>
        <div class="q-gutter-md row items-start">
          <q-input
            v-model.number="issue.estTotalBenefitXdr"
            label="預估總效益"
            type="number"
            suffix="XDR"
            filled
            style="max-width: 150px;"
          />

          <q-input
            v-model.number="issue.estTotalCostXdr"
            label="預估總成本"
            type="number"
            suffix="XDR"
            style="max-width: 150px;"
            readonly
          />

          <q-input
            v-model.number="issue.outstandingCostXdr"
            label="需再付出成本"
            type="number"
            suffix="XDR"
            style="max-width: 150px;"
            readonly
          />

          <q-input
            v-model.number="issue.estRoi"
            label="估計 SROI"
            type="number"
            style="max-width: 150px;"
            readonly
          />
        </div>

        <div class="q-gutter-md q-mt-md row items-start">
          <q-input
            v-model.number="issue.estEffortCostXdr"
            label="預估人力成本"
            type="number"
            suffix="XDR"
            :rules="[
              (val) => val == null || val >= 0 || 'Should be at least 0',
            ]"
            filled
            style="max-width: 150px;"
          />
          <q-input
            v-model.number="issue.effortCompletionPercentage"
            type="number"
            suffix="% 完成"
            :rules="[
              (val) => val == null || val >= 0 || 'Should be at least 0',
            ]"
            filled
            style="max-width: 150px;"
          />
          <q-slider v-model="issue.effortCompletionPercentage" :min="0" :max="100" label />
        </div>

        <div class="q-gutter-md q-mt-md row items-start">
          <q-input
            v-model.number="issue.estPurchaseCostXdr"
            label="預估採購金額"
            type="number"
            suffix="XDR"
            :rules="[
              (val) => val == null || val >= 0 || 'Should be at least 0',
            ]"
            filled
            style="max-width: 150px;"
          />
          <q-input
            v-model.number="issue.purchasedAmount"
            label="已採購金額"
            type="number"
            suffix="XDR"
            :rules="[
              (val) => val == null || val >= 0 || 'Should be at least 0',
            ]"
            filled
            style="max-width: 150px;"
          />
        </div>
        <div class="q-gutter-md q-mt-md items-start">
          <q-input
            v-model="issue.dueDate"
            filled
            type="date"
            label="截止日期"
            style="max-width: 160px;"
          />

          <q-input v-model="issue.notes" label="筆記" type="textarea" filled />
        </div>
        <modal-buttons />
      </q-form>
    </div>
  </div>
</template>

<script>
import { mapActions, mapGetters, mapState } from "vuex";

export default {
  components: {
    "modal-buttons": require("components/Shared/ModalComponents/ModalButtons.vue")
      .default
  },

  data() {
    return {
      issue: {},
      estimatedRoi: null
    };
  },

  computed: {
    ...mapState("orgs", ["currentOrg"]),
    ...mapState("ui", ["selectedIssueId"]),
    ...mapState("issues", ["issues"]),

    selectedIssue() {
      let that = this;
      let issueId = null;
      if (this.$route.params.issueId) issueId = this.$route.params.issueId;
      else if (that.selectedIssueId) issueId = that.selectedIssueId;
      return this.issues.find(function(issue) {
        return issue.id == issueId;
      });
    },

    estTotalCostXdr() {
      let estEffortCostXdr = this.issue.estEffortCostXdr
        ? this.issue.estEffortCostXdr
        : 0;
      let estPurchaseCostXdr = this.issue.estPurchaseCostXdr
        ? this.issue.estPurchaseCostXdr
        : 0;
      let estTotalCostXdr = estEffortCostXdr + estPurchaseCostXdr;
      return estTotalCostXdr;
    },

    outstandingCostXdr() {
      let effortCompletionPercentage = this.issue.effortCompletionPercentage
        ? this.issue.effortCompletionPercentage
        : 0;
      let outstandingEffortCost =
        this.issue.estEffortCostXdr * (1 - effortCompletionPercentage / 100);

      let estPurchaseCostXdr = this.issue.estPurchaseCostXdr
        ? this.issue.estPurchaseCostXdr
        : 0;

      let purchasedAmount = this.issue.purchasedAmount
        ? this.issue.purchasedAmount
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
      let benefit = this.issue.estTotalBenefitXdr
        ? this.issue.estTotalBenefitXdr
        : 0;
      let roi = (benefit - outstandingCostXdr) / outstandingCostXdr;
      return Number(roi.toPrecision(2));
    }
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
        id: this.selectedIssueId,
        updates: this.issue
      };
      this.$store.dispatch("issues/updateIssue", payload);
    }
  },

  watch: {
    selectedIssue: function(newIssue, oldIssue) {
      this.issue = Object.assign({}, this.selectedIssue);
    },
    estTotalCostXdr: function() {
      this.issue.estTotalCostXdr = this.estTotalCostXdr;
    },
    outstandingCostXdr: function() {
      this.issue.outstandingCostXdr = this.outstandingCostXdr;
    },
    estRoi: function(newValue, oldValue) {
      this.issue.estRoi = this.estRoi;
    }
  }
};
</script>
