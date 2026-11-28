<template>
  <div>
    <q-btn
      @click="calculate()"
      class="all-pointer-events print-hide"
      color="primary"
      v-bind="$attrs"
      :percentage="calculationProgress * 100"
      :loading="calculatorIsRunning"
    >
      {{ buttonLabel }}
      <template v-slot:loading>
        <q-spinner-gears class="on-left" />
        {{ Math.round(calculationProgress * 100) }}%
      </template>
    </q-btn>
  </div>
</template>

<script>
import { pickState } from "@/store/pinia-helpers";
import { useModelStore } from "@/store/store-model";
import { useOrgsStore } from "@/store/store-orgs";
import { useCalculatorStore } from "@/store/store-calculator";
import { useAdHocDocsStore } from "@/store/store-adHocDocs";
import { useActionsStore } from "@/store/store-actions";

export default {
  // attributes (icon, flat, no-caps...) go to the button, not the wrapper
  inheritAttrs: false,
  props: ["calculationType", "buttonLabel", "uiAction"],
  components: {},
  data() {
    return {
      showBaselineCalculator: false,
      calcWorker: null,
    };
  },
  computed: {
    ...pickState(useModelStore, { nodes: "nodesList" }),
    ...pickState(useModelStore, ["currentModel"]),
    ...pickState(useOrgsStore, ["currentOrg"]),
    ...pickState(useCalculatorStore, [
      "calculatorIsRunning",
      "calculationProgress",
      //"calculationProgressLabel"
    ]),
    ...pickState(useAdHocDocsStore, ["exchangeRates"]),
    ...pickState(useActionsStore, { actions: "actionsList" }),
    loading() {},
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
        roleNodes: this.currentModel.roleNodes,
        orgCurrency: this.currentOrg?.currency || this.currentModel?.currency || "USD",
        customVariables: this.currentModel?.customVariables || null,
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
      useCalculatorStore(this.$pinia).calculate(payload);
    },
  },
  created() {},
  mounted() {},
  beforeUnmount() {},
};
</script>
