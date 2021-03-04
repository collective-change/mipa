<template>
  <div class="row q-gutter-y-lg">
    <draggable
      v-model="chartsArr"
      group="charts"
      @start="drag = true"
      @end="drag = false"
    >
      <transition-group name="charts-list" tag="ul" style="display: flex">
        <li
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
        </li>
      </transition-group>
    </draggable>
    <li class="column q-gutter-md"></li>
    <div>{{ uiAction.nodeIdsToChart }}</div>
  </div>
</template>

<script>
import { mapActions, mapMutations, mapGetters, mapState } from "vuex";
import { GChart } from "vue-google-charts";
import draggable from "vuedraggable";

export default {
  components: {
    gchart: GChart,
    draggable,
  },

  data() {
    return {
      //embedded: false, //whether this component is embedded or a full page
      //actionId: null,
      //saveFullResults: false,
      drag: false,
      chartsArr: [],
      prevOrderedNodeIds: [],
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
    //...mapFields(["uiAction.nodeIdsToChart"]),
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
          //console.log("existing chart not found");
          chart = {
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
          };
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

    async updateChartsArr() {
      if (this.currentModel && this.uiAction && this.uiAction.impacts) {
        let nodeIdsToAdd = [];
        //add impacted nodes
        this.uiAction.impacts.forEach(function (impact) {
          nodeIdsToAdd.push(impact.nodeId);
        });
        //add benefit and cost nodes
        nodeIdsToAdd.push(this.currentModel.roleNodes.orgBenefit);
        nodeIdsToAdd.push(this.currentModel.roleNodes.orgCost);
        nodeIdsToAdd.push(this.currentModel.roleNodes.worldBenefit);
        nodeIdsToAdd.push(this.currentModel.roleNodes.worldCost);
        this.$store.dispatch("uiAction/addNodeIdsToChart", nodeIdsToAdd);
        //TODO: save nodeIdsToChart to firestore

        //load data into each node
        this.uiAction.nodeIdsToChart.forEach((nodeId) =>
          this.updateChartDataForNode(nodeId)
        );

        this.prevOrderedNodeIds = this.chartsArr.map((chart) => chart.nodeId);
      }
    },
    pushIfNotExist(array, newStringItem) {
      array.indexOf(newStringItem) === -1 ? array.push(newStringItem) : {};
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
    drag: function (newDragVal) {
      if (newDragVal == false) {
        const orderedNodeIds = this.chartsArr.map((chart) => chart.nodeId);
        if (
          JSON.stringify(orderedNodeIds) !==
          JSON.stringify(this.prevOrderedNodeIds)
        ) {
          this.$store.dispatch("uiAction/setNodeIdsToChart", orderedNodeIds);
          this.prevOrderedNodeIds = orderedNodeIds;
        }
      }
    },
  },
};
</script>

<style>
.charts-list-move {
  transition: transform 1s;
}
</style>