<template>
  <div>
    <div v-if="selectedIssue">
      <q-form @submit.prevent="submitForm">
        <q-input
          class="text-h6"
          v-model="issue.name"
          :rules="[val => !!val || 'Field is required']"
          ref="issueName"
        />
        <div class="q-gutter-md row items-start">
          <q-input
            v-model.number="issue.estTotalBenefitXdr"
            label="Estimated total benefit"
            type="number"
            prefix="XDR"
            :rules="[val => val >= 0 || 'Should be at least 0']"
            filled
            style="max-width: 200px"
          />
          <q-input
            v-model.number="issue.estTotalCostXdr"
            label="Estimated total cost"
            type="number"
            prefix="XDR"
            :rules="[val => val >= 0 || 'Should be at least 0']"
            filled
            style="max-width: 200px"
          />

          <q-input
            v-model.number="issue.estRoi"
            label="Estimated ROI"
            type="number"
            filled
            style="max-width: 200px"
            readonly
          />
        </div>
        <q-slider v-model="issue.completionPercentage" :min="0" :max="100" label />
        <q-input v-model="issue.details" label="Details" type="textarea" filled />

        <modal-buttons />
      </q-form>
    </div>
    <p>selectedIssueId: {{selectedIssueId}}</p>
    <pre>{{selectedIssue}}</pre>
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
      //model: null
    };
  },

  computed: {
    ...mapState("ui", ["selectedIssueId"]),
    ...mapState("issues", ["issues"]),

    selectedIssue() {
      let that = this;
      return this.issues.find(function(issue) {
        return issue.id == that.selectedIssueId;
      });
    },

    estRoi() {
      let completionPercentage = this.issue.completionPercentage
        ? this.issue.completionPercentage
        : 0;
      console.log("completionPercentage", completionPercentage);
      let outstandingCost =
        this.issue.estTotalCostXdr * (1 - completionPercentage / 100);
      //if (outstandingCost==0) return null;
      let benefit = this.issue.estTotalBenefitXdr;
      let roi = (benefit - outstandingCost) / outstandingCost;
      let precision = Math.ceil(Math.log10(Math.abs(roi)));
      let roundedRoi = (roi / 10 ** precision).toFixed(2) * 10 ** precision;
      return roundedRoi;
    }
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
        updates: this.issue
      };
      this.$store.dispatch("issues/updateIssue", payload);
      /*this.updateIssue({
        modelId: this.$route.params.modelId,
        updates: this.issue
      });*/
      //this.$emit("close");
    }
  },

  mounted() {},

  watch: {
    selectedIssue: function(newIssue, oldIssue) {
      this.issue = Object.assign({}, this.selectedIssue);
    },
    estRoi: function(newValue, oldValue) {
      this.issue.estRoi = this.estRoi;
    }
  }
};
</script>
