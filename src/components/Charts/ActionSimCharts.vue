<template>
  <div class="row q-gutter-y-lg">
    <div
      class="column q-gutter-md"
      v-for="chart in chartsArr"
      :key="chart.nodeId"
    >
      <gchart
        type="LineChart"
        :data="chart.chartData"
        :options="chart.chartOptions"
      />
      <div class="row justify-center q-gutter-x-md">
        <q-btn-toggle
          v-model="chart.chartOptions.series"
          action-color="primary"
          size="xs"
          :options="[
            {
              label: 'difference',
              value: showDifferenceConfig,
            },
            {
              label: 'values',
              value: showValuesConfig,
            },
          ]"
        />

        <q-btn-toggle
          v-model="chart.chartOptions.vAxis.scaleType"
          action-color="primary"
          size="xs"
          :options="[
            { label: 'linear', value: 'linear' },
            { label: 'log', value: 'mirrorLog' },
          ]"
        />
      </div>
    </div>
  </div>
</template>

<script>
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";
import { mapActions, mapMutations, mapGetters, mapState } from "vuex";
import { createHelpers, mapMultiRowFields } from "vuex-map-fields";
import { GChart } from "vue-google-charts";

const { mapFields } = createHelpers({
  getterType: "uiAction/getField",
  mutationType: "uiAction/updateUiActionField",
});

export default {
  components: {
    gchart: GChart,
  },

  data() {
    return {
      //embedded: false, //whether this component is embedded or a full page
      //actionId: null,
      //saveFullResults: false,
      chartsArr: [],
      showValuesConfig: {
        0: { lineWidth: 5, visibleInLegend: true },
        1: { lineWidth: 2, visibleInLegend: true },
        2: { lineWidth: 2, visibleInLegend: true },
        3: { lineWidth: 0, visibleInLegend: false },
      },
      showDifferenceConfig: {
        0: { lineWidth: 0, visibleInLegend: false },
        1: { lineWidth: 0, visibleInLegend: false },
        2: { lineWidth: 0, visibleInLegend: false },
        3: { lineWidth: 2, visibleInLegend: true },
      },
    };
  },

  computed: {
    //...mapState("ui", ["selectedActionId"]),
    ...mapState("calcResults", ["resultsOfAction"]),
    ...mapState("model", ["currentModel"]),
    ...mapGetters("model", ["nodes"]),

    //fields calculated in the uiAction store, for display only
    //(do not modify their values in the component)
    ...mapState("uiAction", ["uiAction"]),
    //fields for 2-way sync between component and store
    ...mapFields(["uiAction.nodesToChart"]),
  },

  methods: {
    ...mapActions("model", ["updateAction"]),
    ...mapMutations("uiAction", ["mergeNewActionToUiAction"]),

    updateChartDataForNode(nodeId) {
      //console.log(this.resultsOfAction.timeSPoints);

      // if baseline.nodes contains the selected node then load baseline for this nde
      if (
        this.resultsOfAction !== undefined &&
        this.resultsOfAction.timeSPoints !== undefined &&
        this.resultsOfAction.timeSPoints.length
      ) {
        let timeSPoints = this.resultsOfAction.timeSPoints;
        let baselineValues = this.resultsOfAction.baselineNodesValues[nodeId];
        let ifNotDoneValues = this.resultsOfAction.ifNotDoneNodesValues[nodeId];
        let ifDoneValues = this.resultsOfAction.ifDoneNodesValues[nodeId];
        //if nodeId does not exist in chartsDataArr then create it
        let chart = this.chartsArr.find((chart) => chart.nodeId == nodeId);
        if (typeof chart == "undefined") {
          console.log("existing chart not found");
          let unit = (chart = {
            nodeId: nodeId,
            chartData: [],
            chartOptions: {
              title: this.getNodeName(nodeId),
              vAxis: {
                title: this.getNodeUnit(nodeId),
                scaleType: "linear",
                format: "short",
              },
              legend: { position: "bottom" },
              series: this.showDifferenceConfig,
              width: 360,
              height: 240,
              //explorer: {}
            },
          });
          this.chartsArr.push(chart);
        } else {
          console.log("existing chart found");
          chart.chartData = [];
        }
        if (ifDoneValues.length > 0) {
          chart.chartData.push([
            "time",
            "baseline",
            "if done",
            "if not done",
            "done minus not done",
          ]);
          for (var i = 0; i < timeSPoints.length; i++) {
            chart.chartData.push([
              new Date(timeSPoints[i] * 1000),
              baselineValues[i],
              ifDoneValues[i],
              ifNotDoneValues[i],
              ifDoneValues[i] - ifNotDoneValues[i],
            ]);
          }
        }
      } else {
        this.chartsArr = [];
      }
    },
    updateChartsArr() {
      if (this.currentModel && this.uiAction && this.uiAction.impacts) {
        /*if (!this.currentModel || typeof this.uiAction.impacts == "undefined")
        return;*/
        //console.log("updateChartsArr");
        let nodesToChart = [];
        //add impacted nodes
        this.uiAction.impacts.forEach(function (impact) {
          nodesToChart.push(impact.nodeId);
        });
        //add benefit and cost nodes
        nodesToChart.push(this.currentModel.roleNodes.orgBenefit);
        nodesToChart.push(this.currentModel.roleNodes.orgCost);
        nodesToChart.push(this.currentModel.roleNodes.worldBenefit);
        nodesToChart.push(this.currentModel.roleNodes.worldCost);
        //nodesToChart.push(this.currentModel.roleNodes.effort);
        //nodesToChart.push(this.currentModel.roleNodes.spending);

        //load data into each node
        nodesToChart.forEach((nodeId) => this.updateChartDataForNode(nodeId));
      }
    },
    getNodeName(nodeId) {
      const found = this.nodes.find((node) => node.id == nodeId);
      if (found) return found.name;
      else return nodeId;
    },
    getNodeUnit(nodeId) {
      const found = this.nodes.find((node) => node.id == nodeId);
      if (found) return found.unit;
      else return "";
    },
  },

  mounted() {
    this.$store.dispatch("calcResults/loadResultsOfAction", this.uiAction.id);
  },

  destroyed() {},

  watch: {
    nodes: function () {
      this.updateChartsArr();
    },
    resultsOfAction: function () {
      this.updateChartsArr();
    },
    "uiAction.id": function (newId) {
      this.$store.dispatch("calcResults/loadResultsOfAction", newId);
    },
  },
};
</script>
