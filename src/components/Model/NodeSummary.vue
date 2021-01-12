<template>
  <div>
    <div v-if="selectedNode">
      <q-form @submit.prevent="submitForm">
        <q-input
          class="text-h6"
          v-model="nodeToSubmit.name"
          placeholder="Name"
          :rules="[val => !!val || 'Field is required']"
          ref="nodeName"
        />
        <div class="row justify-between">
          <div class="col-8">
            <q-input
              v-model="nodeToSubmit.symbol"
              label="Symbol"
              debounce="500"
              :rules="[
            val => !!val || 'Field is required',
            val =>
              isNaN(parseInt(val.substring(0, 1))) ||
              'Cannot start with a number',
            val =>
              this.isAlphanumeric(val) ||
              'Only alphanumeric characters and underscores supported'
          ]"
            />
          </div>
          <div class="col-3">
            <q-input
              v-model="nodeToSubmit.unit"
              label="Unit"
              :rules="[
            val =>
              typeof val == 'undefined' ||
              val == '' ||
              (val != '' && isNaN(parseInt(val.substring(0, 1)))) ||
              'Cannot start with a number'
          ]"
            />
          </div>
        </div>
        <q-markup-table flat bordered v-if="influencerNodesInfo.length">
          <thead>
            <tr>
              <th class="text-left">Influencer</th>
              <th class="text-left">Symbol</th>
              <th class="text-left">Unit</th>
            </tr>
          </thead>
          <tr v-for="influencer in influencerNodesInfo" :key="influencer.id">
            <td>
              <q-btn
                flat
                no-caps
                padding="none"
                color="white"
                text-color="black"
                :label="influencer.name"
                @click="setSelectedNodeId(influencer.id)"
              />
            </td>
            <td>{{ influencer.symbol }}</td>
            <td>{{ influencer.unit }}</td>
          </tr>
        </q-markup-table>

        <q-input
          v-model="nodeToSubmit.symbolFormula"
          label="Formula"
          prefix="="
          autogrow
          debounce="800"
        />
        <div v-if="parserError == '' && latexFormula">
          <vue-mathjax :formula="'$' + nodeToSubmit.symbol + '=' + latexFormula + '$'"></vue-mathjax>
        </div>
        <div v-else class="text-negative">{{ parserError }}</div>
        <q-input
          v-model="nodeToSubmit.latestValue"
          label="Latest value (optional)"
          type="number"
          step="any"
          :suffix="nodeToSubmit.unit"
          hint="Only used if a delay function with 'best_guess' as initial value references this node."
          debounce="300"
        />
        <q-input v-model="nodeToSubmit.notes" label="Notes" autogrow />
        <modal-buttons />
        <div v-if="nodeChart.chartData.length > 0">
          <gchart
            v-if="nodeChart.chartData.length > 0"
            type="LineChart"
            :data="nodeChart.chartData"
            :options="nodeChart.chartOptions"
          />
          <div class="row justify-center">
            <q-btn-toggle
              v-model="nodeChart.chartOptions.vAxis.scaleType"
              toggle-color="primary"
              size="xs"
              :options="[
                { label: 'linear', value: 'linear' },
                { label: 'log', value: 'mirrorLog' }
              ]"
            />
          </div>
        </div>

        <div v-if="influencerChartsArr.length" class="text-h6">Influencers</div>
        <div v-for="chart in influencerChartsArr" :key="chart.nodeId" class="q-pa-md">
          <gchart type="LineChart" :data="chart.chartData" :options="chart.chartOptions" />
          <div class="row justify-center q-gutter-x-md">
            <q-btn-toggle
              v-model="chart.chartOptions.vAxis.scaleType"
              action-color="primary"
              size="xs"
              :options="[
                { label: 'linear', value: 'linear' },
                { label: 'log', value: 'mirrorLog' }
              ]"
            />
            <q-btn size="xs" label="go to node" @click="setSelectedNodeId(chart.nodeId)" />
          </div>
        </div>
      </q-form>

      <p>Node ID: {{ nodeToSubmit.id }}</p>
      <!--
      <p>symbolFormula</p>
      <pre>{{ nodeToSubmit.symbolFormula }}</pre>
      <p>parsedSymbolFormula</p>
      <pre>{{ parsedSymbolFormula }}</pre>
      <p>sysFormula</p>
      <pre>{{ nodeToSubmit.sysFormula }}</pre>
      <p>nodeToSubmit</p>
      <pre>{{ nodeToSubmit }}</pre>-->
    </div>
  </div>
</template>

<script>
import { mapActions, mapGetters, mapState } from "vuex";
import { parse, toTex } from "mathjs";
import { VueMathjax } from "vue-mathjax";
import { GChart } from "vue-google-charts";
import { getAcronym } from "src/utils/util-getAcronym";
import { showErrorMessage } from "src/utils/util-show-error-message";
import { classifyInfluencers } from "src/utils/util-node-operations";

export default {
  components: {
    "modal-buttons": require("components/Shared/ModalComponents/ModalButtons.vue")
      .default,
    gchart: GChart,
    "vue-mathjax": VueMathjax
  },

  data() {
    return {
      nodeToSubmit: {},
      oldNodeToSubmit: {}, //used for comparing changes to nodeToSubmit
      nodeToSubmitIsFreshlyAssigned: false,
      model: null,
      parserError: "",

      nodeChart: {
        chartData: [],
        chartOptions: {
          vAxis: { scaleType: "linear", format: "short" },
          legend: { position: "none" }
        }
      },
      influencerChartsArr: []
    };
  },

  computed: {
    ...mapState("ui", [
      "selectedNodeId",
      "uiNodeChanged",
      "uiNodeChangedFields"
    ]),
    ...mapState("calcResults", ["baseline"]),
    ...mapGetters("model", ["nodes", "links"]),

    selectedNode() {
      let that = this;
      return this.nodes.find(function(node) {
        return node.id == that.selectedNodeId;
      });
    },

    influencerNodesInfo() {
      let nodeToSubmit = this.nodeToSubmit;
      let influencerNodesInfo = [];
      if (typeof nodeToSubmit.influencers == "undefined")
        return influencerNodesInfo;
      let influencerNodes = this.nodes.filter(node =>
        nodeToSubmit.influencers.includes(node.id)
      );
      influencerNodes.forEach(function(influencerNode) {
        let influencerNodeInfo = {
          id: influencerNode.id,
          name: influencerNode.name,
          symbol: influencerNode.symbol,
          unit: influencerNode.unit,
          isBlocking: nodeToSubmit.blockingInfluencers.includes(
            influencerNode.id
          ),
          isUnused: nodeToSubmit.unusedInfluencers.includes(influencerNode.id)
        };
        influencerNodesInfo.push(influencerNodeInfo);
      });
      return influencerNodesInfo;
    },

    //parse symbol formula
    parsedSymbolFormula() {
      try {
        let parsedSymbolFormula = this.nodeToSubmit.symbolFormula
          ? parse(this.nodeToSubmit.symbolFormula)
          : "";
        this.parserError = "";
        return parsedSymbolFormula;
      } catch (err) {
        this.parserError = "Error parsing formula: " + err.message;
        return "";
      }
    },

    watchedObjectForNodePropertyRecalculation() {
      return {
        latestValue: this.nodeToSubmit.latestValue,
        parsedFormula: this.parsedSymbolFormula
      };
    },

    //latexFormula from parsedSymbolFormula
    latexFormula() {
      return this.parsedSymbolFormula
        ? this.parsedSymbolFormula.toTex({
            parenthesis: "keep",
            implicit: "hide"
          })
        : "";
      console.log("LaTeX expression:", latex);
    }
  },

  methods: {
    ...mapActions("model", ["updateNode"]),
    ...mapActions("ui", ["setSelectedNodeId"]),

    isAlphanumeric(str) {
      return str.match(/^[a-z0-9_]+$/i) !== null;
    },
    submitForm() {
      this.$refs.nodeName.validate();
      if (!this.$refs.nodeName.hasError) {
        this.submitNode();
      }
    },
    submitNode() {
      let oldLatestVal = this.selectedNode.latestValue;
      let newCurrentVal = this.nodeToSubmit.latestValue;
      let oldLatestValIsANumber =
        typeof oldLatestVal != "undefined" &&
        oldLatestVal !== "" &&
        !isNaN(Number(oldLatestVal));
      let newCurrentValIsANumber =
        typeof newCurrentVal != "undefined" &&
        newCurrentVal !== "" &&
        !isNaN(Number(newCurrentVal));
      let latestValueExistenceChanged =
        oldLatestValIsANumber != newCurrentValIsANumber;

      let oldSymbol = this.selectedNode.symbol;
      let newSymbol = this.nodeToSubmit.symbol;
      let symbolChanged = oldSymbol != newSymbol;
      this.nodeToSubmit.isNew = false;

      this.updateNode({
        modelId: this.$route.params.modelId,
        updates: this.nodeToSubmit,
        latestValueExistenceChanged: latestValueExistenceChanged,
        symbolChanged: symbolChanged
        /* "symbolChanged" doesn't actually work yet to classify influencers
        of node's influencees, because classifyInfluencers currently
        starts with sysFormula, which would not change until it's recomposed.
        */
      });
    },
    updateChartData() {
      // if baseline.nodes contains the selected node then load baseline for this nde
      if (
        this.selectedNodeId !== "null" &&
        typeof this.baseline !== "undefined" &&
        typeof this.baseline.nodesValues != "undefined" &&
        this.selectedNodeId in this.baseline.nodesValues
      ) {
        let timeSPoints = this.baseline.timeSPoints;
        let values = this.baseline.nodesValues[this.selectedNodeId];
        let chartData = [];
        let chartOptions = {};
        if (values.length > 0) {
          chartData.push(["time", "value"]);
          for (var i = 0; i < timeSPoints.length; i++) {
            chartData.push([new Date(timeSPoints[i] * 1000), values[i]]);
          }
          chartOptions = {
            title: this.selectedNode.name,
            vAxis: {
              title: this.selectedNode.unit,
              scaleType: "linear",
              format: "short"
            },
            legend: { position: "none" }
          };
        }
        this.nodeChart = { chartData, chartOptions };
      } else {
        this.nodeChart = {
          chartData: [],
          chartOptions: {
            vAxis: { scaleType: "linear", format: "short" },
            legend: { position: "none" }
          }
        };
      }
    },
    updateChartDataForNode(nodeId) {
      //console.log(this.resultsOfAction.timeSPoints);

      // if baseline.nodes contains the selected node then load baseline for this nde
      if (
        this.selectedNodeId !== "null" &&
        typeof this.baseline !== "undefined" &&
        typeof this.baseline.nodesValues != "undefined" &&
        nodeId in this.baseline.nodesValues
      ) {
        let timeSPoints = this.baseline.timeSPoints;
        let values = this.baseline.nodesValues[nodeId];

        //if nodeId does not exist in chartsDataArr then create it
        let chart = this.influencerChartsArr.find(
          chart => chart.nodeId == nodeId
        );
        if (typeof chart == "undefined") {
          //let foundNode = this.nodes.find((node) => node.id == nodeId);
          let unit = (chart = {
            nodeId: nodeId,
            chartData: [],
            chartOptions: {
              title: this.getNodeName(nodeId),
              vAxis: {
                title: this.getNodeUnit(nodeId),
                scaleType: "linear",
                format: "short"
              },
              legend: { position: "none" }
              //legend: { position: "bottom" },
              //series: this.showDifferenceConfig,
              //explorer: {}
            }
          });
          this.influencerChartsArr.push(chart);
        } else chart.chartData = [];
        if (values.length > 0) {
          chart.chartData.push(["time", "value"]);
          for (var i = 0; i < timeSPoints.length; i++) {
            chart.chartData.push([new Date(timeSPoints[i] * 1000), values[i]]);
          }
        }
      } else {
        this.influencerChartsArr = [];
      }
    },
    updateInfluencerChartsArr() {
      if (!this.selectedNode) return;
      let influencerNodesToChart = this.selectedNode.influencers;
      /*
      //add combinedBenefit and combinedCost nodes
      influencerNodesToChart.push(this.currentModel.roleNodes.combinedBenefit);
      influencerNodesToChart.push(this.currentModel.roleNodes.combinedCost);
      influencerNodesToChart.push(this.currentModel.roleNodes.effort);
      influencerNodesToChart.push(this.currentModel.roleNodes.spending);
      //add impacted nodes
      this.uiAction.impacts.forEach(function (impact) {
        influencerNodesToChart.push(impact.nodeId);
      });
      */

      //load data into each node
      if (influencerNodesToChart)
        influencerNodesToChart.forEach(nodeId =>
          this.updateChartDataForNode(nodeId)
        );
    },
    getNodeName(nodeId) {
      const found = this.nodes.find(node => node.id == nodeId);
      if (found) return found.name;
      else return nodeId;
    },
    getNodeUnit(nodeId) {
      const found = this.nodes.find(node => node.id == nodeId);
      if (found) return found.unit;
      else return "";
    }
  },

  mounted() {
    //load mathjax
    const plugin = document.createElement("script");
    plugin.setAttribute(
      "src",
      "https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.6/MathJax.js?config=TeX-AMS_HTML"
    );
    plugin.async = true;
    document.head.appendChild(plugin);
  },

  watch: {
    selectedNode: function(newNode, oldNode) {
      this.nodeToSubmitIsFreshlyAssigned = true;
      this.nodeToSubmit = Object.assign({}, this.selectedNode);
      this.$store.commit("ui/setUiNodeChanged", false);
      this.influencerChartsArr = [];
      this.nodeChart = {};
      this.updateChartData();
      this.updateInfluencerChartsArr();
    },

    nodeToSubmit: {
      deep: true,
      handler: function(newNode) {
        if (!this.nodeToSubmitIsFreshlyAssigned) {
          let oldNode = this.oldNodeToSubmit;
          let differences = Object.keys(newNode).filter(
            k =>
              (newNode[k] ? newNode[k] : {}).toString() !==
              (oldNode[k] ? oldNode[k] : {}).toString()
          );

          differences = differences.filter(function(item) {
            return ![
              "sysFormula",
              "class",
              "blockingInfluencers",
              "unusedInfluencers",
              "updateTime"
            ].includes(item);
          });
          if (differences.length) {
            this.$store.commit("ui/setUiNodeChanged", true);
            this.$store.commit("ui/addUiNodeChangedFields", differences);
            //console.log({ differences });
          }
        } else {
          this.nodeToSubmitIsFreshlyAssigned = false;
        }
        Object.assign(this.oldNodeToSubmit, newNode);
      }
    },

    baseline: function() {
      this.updateChartData();
    },

    watchedObjectForNodePropertyRecalculation: function(/*newVersion, oldVersion*/) {
      let parsedSymbolFormula = this.parsedSymbolFormula
        ? this.parsedSymbolFormula
        : "";
      // calculate sysFormula
      if (parsedSymbolFormula.toString() == "") {
        this.nodeToSubmit.sysFormula = "";
      } else {
        var nodes = this.nodes;
        var influencerNode = {};

        //gather up ids of self, influencers, and their symbols
        var potentials = [];
        potentials.push({
          symbol: this.nodeToSubmit.symbol,
          id: this.nodeToSubmit.id
        });
        if (
          "influencers" in this.nodeToSubmit &&
          this.nodeToSubmit.influencers.length > 0
        ) {
          this.nodeToSubmit.influencers.forEach(function(influencerNodeId) {
            influencerNode = nodes.find(function(node) {
              return node.id == influencerNodeId;
            });
            potentials.push({
              symbol: influencerNode.symbol,
              id: influencerNodeId
            });
          });
        }
        potentials.sort(function(a, b) {
          return b.symbol.length - a.symbol.length;
        });

        var sysFormula = parsedSymbolFormula.toString();
        if (sysFormula) {
          potentials.forEach(function(node) {
            sysFormula = sysFormula.replace(
              new RegExp("\\b" + node.symbol + "\\b", "g"), //global replacement
              "$" + node.id
            );
          });
        }
        sysFormula.trim(); //trim whitespace from both sides
        sysFormula = sysFormula.replace(/  +/g, " "); //replace multiple spaces with single space
        this.nodeToSubmit.sysFormula = sysFormula;
      }

      //calculate blockingInfluencers
      let classifiedInfluencers = classifyInfluencers({
        thisNode: this.nodeToSubmit
      });
      //console.log("classifyInfluencers ran");
      this.nodeToSubmit.blockingInfluencers = classifiedInfluencers.blocking;
      this.nodeToSubmit.unusedInfluencers = classifiedInfluencers.unused;
      this.nodeToSubmit.isSelfBlocking = classifiedInfluencers.blocking.includes(
        this.nodeToSubmit.id
      );
    }
  }
};
</script>
