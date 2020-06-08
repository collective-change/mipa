<template>
  <div>
    <q-btn
      @click="calculate()"
      class="all-pointer-events print-hide"
      color="primary"
      :label="buttonLabel"
    />
    <q-linear-progress
      v-if="calculatorIsRunning"
      stripe
      rounded
      size="20px"
      :value="calculationProgress"
      color="secondary"
      class="q-mt-sm"
    >
      <div class="absolute-full flex flex-center">
        <q-badge
          color="white"
          text-color="secondary"
          :label="calculationProgressLabel"
        />
      </div>
    </q-linear-progress>
  </div>
</template>

<script>
import { mapGetters, mapState } from "vuex";

export default {
  props: ["calculationType", "buttonLabel"],
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
    ...mapState("adHocDocs", ["exchangeRates"])
  },
  methods: {
    calculate() {
      switch (this.calculationType) {
        case "baseline":
          this.calculateBaseline();
          break;
        case "actions":
          this.calculateAllActions();
          break;
        default:
          throw `Calculation type "${this.calculationType}" not recognized.`;
      }
    },
    getCommonPayload() {
      let commonPayload = {
        modelId: this.$route.params.modelId,
        nodes: this.nodes,
        exchangeRates: this.exchangeRates,
        simulationParams: this.currentModel.simulationParams
      };
      return commonPayload;
    },
    calculateBaseline() {
      let payload = this.getCommonPayload();
      this.$store.dispatch("calculator/calculateBaseline", payload);
    },
    calculateAllActions() {
      let payload = this.getCommonPayload();
      this.$store.dispatch("calculator/calculateActions", payload);
    }
  },
  created() {},
  mounted() {},
  beforeDestroy() {}
};
</script>
