<template>
  <div>
    <q-btn
      @click="calculate()"
      class="all-pointer-events print-hide"
      color="primary"
      :loading="calculationProgress>0 && calculationProgress<1"
      :percentage="calculationProgress*100"
    >
      {{buttonLabel}}
      <template v-slot:loading>
        <q-spinner-gears class="on-left" />
        {{Math.round(calculationProgress*100)}}%
      </template>
    </q-btn>
    <!--<q-linear-progress
      v-if="calculatorIsRunning"
      stripe
      rounded
      size="20px"
      :value="calculationProgress"
      color="secondary"
      class="q-mt-sm"
    >
      <div class="absolute-full flex flex-center">
        <q-badge color="white" text-color="secondary" :label="calculationProgressLabel" />
      </div>
    </q-linear-progress>-->
  </div>
</template>

<script>
import { mapGetters, mapState } from "vuex";

export default {
  props: ["calculationType", "buttonLabel", "uiAction"],
  components: {},
  data() {
    return {
      showBaselineCalculator: false,
      calcWorker: null
    };
  },
  computed: {
    ...mapGetters("model", ["nodes"]),
    ...mapState("model", ["currentModel"]),
    ...mapState("calculator", [
      "calculatorIsRunning",
      "calculationProgress",
      "calculationProgressLabel"
    ]),
    ...mapState("adHocDocs", ["exchangeRates"]),
    ...mapGetters("actions", ["actions"])
  },
  methods: {
    calculate() {
      let modelId = this.$route.params.modelId
        ? this.$route.params.modelId
        : this.$route.params.orgId;
      let payload = {
        orgId: this.$route.params.orgId,
        modelId: modelId,
        nodes: this.nodes,
        exchangeRates: this.exchangeRates,
        simulationParams: this.currentModel.simulationParams,
        roleNodes: this.currentModel.roleNodes
      };
      switch (this.calculationType) {
        case "baseline":
          payload.calculationType = "baseline";
          break;
        case "actions":
          payload.calculationType = "actions";
          payload.actions = this.actions;
          break;
        case "uiAction":
          payload.calculationType = "actions";
          payload.actions = [this.uiAction];
          break;
        default:
          throw `Calculation type "${this.calculationType}" not recognized.`;
      }
      this.$store.dispatch("calculator/calculate", payload);
    }
  },
  created() {},
  mounted() {},
  beforeDestroy() {}
};
</script>
