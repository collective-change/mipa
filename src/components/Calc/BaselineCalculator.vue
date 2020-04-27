<template>
  <div class="q-pa-md">
    <q-btn
      @click="showBaselineCalculator = true; startBaselineCalculation()"
      class="all-pointer-events print-hide"
      color="primary"
      label="Calculate basesline"
    />
    <q-linear-progress
      v-if="showBaselineCalculator"
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
    </q-linear-progress>
  </div>
</template>

<script>
import { mapGetters, mapState } from "vuex";
//import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";
//import BaselineCalcWorker from "statics/baselineCalcWorker.js";
//const baselineCalcWorker = new BaselineCalcWorker();

export default {
  components: {},
  data() {
    return {
      showBaselineCalculator: false,
      baselineCalcWorker: null,
      calculationProgress: 0.25,
      calculationProgressLabel: "25%"
    };
  },
  computed: {
    //...mapState("orgs", ["currentOrg"]),
    ...mapGetters("model", ["nodes"])
  },
  methods: {
    startBaselineCalculation() {
      /*if (!window.Worker) {
        console.log(
          "Web worker not supported by browser. Aborting calculations."
        );
        return;
      }*/
      this.baselineCalcWorker = new Worker("statics/js/baselineCalcWorker.js");
      this.baselineCalcWorker.postMessage({
        modelNodes: this.nodes
        //expr: "12 / (2.3 + 0.7)"
      });
      console.log("Message posted to worker");

      this.baselineCalcWorker.onmessage = function(e) {
        //result.textContent = e.data;
        console.log("Message received from worker: ", e.data);
      };
    }
  },
  created() {},
  mounted() {},
  beforeDestroy() {
    //this.$store.dispatch("model/unbindNodes");
  }
};
</script>
