<template>
  <div class="row">
    <draggable
      v-model="chartsArr"
      group="charts"
      @start="drag = true"
      @end="drag = false"
    >
      <transition-group
        name="charts-list"
        tag="ul"
        class="row q-px-none q-mt-none"
      >
        <li
          class="column q-gutter-md"
          v-for="chart in chartsArr"
          :key="chart.nodeId"
        >
          <q-card class="q-ma-md">
            <div
              class="row justify-center q-px-md q-pt-md"
              style="width: 360px"
            >
              {{ chart.title }}
            </div>
            <div v-if="chart.chartData.length">
              <gchart
                type="LineChart"
                :data="chart.chartData"
                :options="chart.chartOptions"
              />
              <div class="row justify-center q-gutter-x-md q-mb-md">
                <q-btn-toggle
                  v-model="chart.chartOptions.series"
                  action-color="primary"
                  size="xs"
                  :options="[
                    {
                      label: 'values',
                      value: showValuesConfig,
                    },
                    {
                      label: 'difference',
                      value: showDifferenceConfig,
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
                <q-btn
                  round
                  size="xs"
                  color="primary"
                  icon="delete"
                  @click="
                    $store.dispatch(
                      'uiAction/removeNodeIdToChart',
                      chart.nodeId
                    );
                    removeFromCharts(chart.nodeId);
                  "
                />
              </div>
            </div>
            <div
              v-else
              style="height: 277px; width: 360px"
              class="column justify-center"
            >
              <div class="row justify-center">
                <div class="column q-px-xl q-pb-xl">
                  Simultion results have not been saved for this node. Please
                  make sure to enable saving on this device, then recalculate.
                </div>
                <q-btn
                  round
                  size="xs"
                  color="primary"
                  icon="delete"
                  @click="
                    $store.dispatch(
                      'uiAction/removeNodeIdToChart',
                      chart.nodeId
                    );
                    removeFromCharts(chart.nodeId);
                  "
                />
              </div>
            </div>
          </q-card>
        </li>
        <li class="column q-gutter-md" key="addChart">
          <q-card class="q-ma-md">
            <div class="row justify-center" style="height: 317px; width: 360px">
              <div class="column justify-center">
                <q-select
                  label="Add chart"
                  v-model="nodeIdToAdd"
                  @filter="filterFn"
                  @filter-abort="abortFilterFn"
                  :options="filteredNodeOptions"
                  @input="
                    (nodeId) => {
                      this.$store.dispatch('uiAction/addNodeIdToChart', nodeId);
                      nodeIdToAdd = null;
                    }
                  "
                  emit-value
                  map-options
                  outlined
                  use-input
                  hide-selected
                  fill-input
                  dense
                  bg-color="white"
                >
                  <template v-slot:no-option>
                    <q-item>
                      <q-item-section class="text-grey">
                        No results
                      </q-item-section>
                    </q-item>
                  </template>
                </q-select>
                <div
                  v-if="chartsArr.length > 1"
                  class="row justify-center q-mt-xl"
                >
                  Drag to reorder
                </div>
              </div>
            </div>
          </q-card>
        </li>
      </transition-group>
    </draggable>
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
      defaultNodeIdsToChart: [],
      chartsArr: [],
      prevOrderedNodeIds: [],
      prevNodeIdsToChartLength: 0,
      nodeIdToAdd: null,
      filteredNodeOptions: [],
      showValuesConfig: {
        0: { lineWidth: 5, color: "blue", visibleInLegend: true },
        1: { lineWidth: 2, color: "green", visibleInLegend: true },
        2: { lineWidth: 2, color: "red", visibleInLegend: true },
        3: { lineWidth: 0, color: "orange", visibleInLegend: false },
      },
      showDifferenceConfig: {
        0: { lineWidth: 0, color: "blue", visibleInLegend: false },
        1: { lineWidth: 0, color: "green", visibleInLegend: false },
        2: { lineWidth: 0, color: "red", visibleInLegend: false },
        3: { lineWidth: 2, color: "orange", visibleInLegend: true },
      },
    };
  },

  created() {
    this.filteredNodeOptions = this.nodeOptions;
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

    nodeOptions() {
      return this.nodes.map((node) => {
        return { label: node.name, value: node.id };
      });
    },
  },

  methods: {
    ...mapActions("model", ["updateAction"]),
    ...mapMutations("uiAction", ["mergeNewActionToUiAction"]),

    updateChartDataForNode(nodeId) {
      //console.log(this.resultsOfAction.timeSPoints);
      let chart = this.chartsArr.find((chart) => chart.nodeId == nodeId);
      if (typeof chart == "undefined") {
        chart = {
          nodeId: nodeId,
          title: this.getNodeName(nodeId),
          chartData: [],
          chartOptions: {
            //title: this.getNodeName(nodeId),
            vAxis: {
              title: this.getNodeUnit(nodeId),
              scaleType: "linear",
              format: "short",
            },
            chartArea: {
              top: 10,
              left: 58,
              height: "75%",
              width: "80%",
            },
            legend: { position: "bottom" },
            series: this.showValuesConfig,
            width: 360,
            height: 240,
            explorer: {},
          },
        };
        this.chartsArr.push(chart);
      } else {
        //console.log("existing chart found");
        chart.chartData = [];
      }
      // if resultsOfAction is available then then load it for the node; otherwise set data for the node to empty
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

        if (ifDoneValues && ifDoneValues.length > 0) {
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
        chart.chartData = [];
      }
    },

    updateChartsArr() {
      if (this.currentModel && this.uiAction && this.uiAction.impacts) {
        //load data into each node
        this.uiAction.nodeIdsToChart.forEach((nodeId) =>
          this.updateChartDataForNode(nodeId)
        );
        this.prevOrderedNodeIds = this.chartsArr.map((chart) => chart.nodeId);
      }
    },
    removeFromCharts(nodeId) {
      const index = this.chartsArr.findIndex(
        (chart) => chart.nodeId === nodeId
      );
      this.chartsArr.splice(index, 1);
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
    filterFn(val, update, abort) {
      update(() => {
        if (val === "") {
          this.filteredNodeOptions = this.nodeOptions;
        } else {
          const needle = val.toLowerCase();
          this.filteredNodeOptions = this.nodeOptions.filter(
            (v) => v.label.toLowerCase().indexOf(needle) > -1
          );
        }
        this.filteredNodeOptions.sort((a, b) => {
          if (a.label.toLowerCase() < b.label.toLowerCase()) {
            return -1;
          }
          if (a.label.toLowerCase() > b.label.toLowerCase()) {
            return 1;
          }
          return 0;
        });
      });
    },
    abortFilterFn() {
      // console.log('delayed filter aborted')
    },
  },

  mounted() {
    //save default nodeIds to uiAction.nodeIdsToChart if missing

    (async () => {
      while (
        !this.currentModel ||
        !this.uiAction // define the condition as you like
      ) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (this.currentModel && this.uiAction && this.uiAction.impacts) {
        this.$store.dispatch(
          "calcResults/loadResultsOfAction",
          this.uiAction.id
        );

        //add impacted nodes
        let that = this;
        this.uiAction.impacts.forEach(function (impact) {
          that.defaultNodeIdsToChart.push(impact.nodeId);
        });
        //add benefit and cost nodes
        this.defaultNodeIdsToChart.push(this.currentModel.roleNodes.orgBenefit);
        this.defaultNodeIdsToChart.push(this.currentModel.roleNodes.orgCost);
        this.defaultNodeIdsToChart.push(
          this.currentModel.roleNodes.worldBenefit
        );
        this.defaultNodeIdsToChart.push(this.currentModel.roleNodes.worldCost);

        this.$store.dispatch(
          "uiAction/addNodeIdsToChart",
          this.defaultNodeIdsToChart
        );
      }
    })();
  },

  destroyed() {},

  watch: {
    "uiAction.id": function (newId, oldId) {
      console.log(
        "uiAction.id watcher",
        this.uiAction.id,
        newId,
        oldId,
        this.uiAction
      );
      this.$store.dispatch("calcResults/loadResultsOfAction", this.uiAction.id);
      this.chartsArr = [];
    },
    nodes: function () {
      this.updateChartsArr();
    },
    resultsOfAction: function () {
      this.updateChartsArr();
    },
    "uiAction.nodeIdsToChart": function (newVal) {
      if (newVal.length != this.prevNodeIdsToChartLength) {
        this.updateChartsArr();
        this.prevNodeIdsToChartLength = newVal.length;
      }
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