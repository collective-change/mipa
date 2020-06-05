<template>
  <div>
    <div v-if="selectedNode">
      <div class="text-h6">{{ selectedNode.name }}</div>

      <q-form @submit.prevent="submitForm">
        <q-input
          v-model="nodeToSubmit.name"
          label="Name"
          :rules="[val => !!val || 'Field is required']"
          ref="nodeName"
        />
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
        <q-input
          v-model="nodeToSubmit.symbol"
          label="Symbol"
          debounce="500"
          :rules="[
            val => !!val || 'Field is required',
            val =>
              isNaN(parseInt(val.substring(0, 1))) ||
              'Cannot start with a number'
          ]"
        />
        <q-markup-table flat bordered v-if="influencerNodesInfo.length">
          <thead>
            <tr>
              <th class="text-left">Influencer</th>
              <th class="text-left">Symbol</th>
              <th class="text-left">Unit</th>
            </tr>
          </thead>
          <tr v-for="influencer in influencerNodesInfo" :key="influencer.id">
            <td>{{ influencer.name }}</td>
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
          <vue-mathjax
            :formula="'$' + nodeToSubmit.symbol + '=' + latexFormula + '$'"
          ></vue-mathjax>
        </div>
        <div v-else class="text-negative">{{ parserError }}</div>
        <q-input
          v-model="nodeToSubmit.currentValue"
          label="Current value"
          type="number"
          :suffix="nodeToSubmit.unit"
          debounce="300"
        />

        <gchart
          v-if="chartData.length > 0"
          type="LineChart"
          :data="chartData"
          :options="chartOptions"
        />

        <q-input v-model="nodeToSubmit.notes" label="Notes" autogrow />
        <modal-buttons />
      </q-form>

      <p>nodeToSubmit: {{ nodeToSubmit.id }}</p>
      <p>symbolFormula</p>
      <pre>{{ nodeToSubmit.symbolFormula }}</pre>
      <p>parsedSymbolFormula</p>
      <pre>{{ parsedSymbolFormula }}</pre>
      <p>sysFormula</p>
      <pre>{{ nodeToSubmit.sysFormula }}</pre>
      <p>nodeToSubmit</p>
      <pre>{{ nodeToSubmit }}</pre>
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

      chartData: [],
      chartOptions: {
        legend: { position: "none" }
      }
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
        currentValue: this.nodeToSubmit.currentValue,
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
    submitForm() {
      this.$refs.nodeName.validate();
      if (!this.$refs.nodeName.hasError) {
        this.submitNode();
      }
    },
    submitNode() {
      let oldCurrentVal = this.selectedNode.currentValue;
      let newCurrentVal = this.nodeToSubmit.currentValue;
      let oldCurrentValIsANumber =
        typeof oldCurrentVal != "undefined" &&
        oldCurrentVal != "" &&
        !isNaN(Number(oldCurrentVal));
      let newCurrentValIsANumber =
        typeof newCurrentVal != "undefined" &&
        newCurrentVal != "" &&
        !isNaN(Number(newCurrentVal));
      let currentValueExistenceChanged =
        oldCurrentValIsANumber != newCurrentValIsANumber;

      this.nodeToSubmit.isNew = false;

      this.updateNode({
        modelId: this.$route.params.modelId,
        updates: this.nodeToSubmit,
        currentValueExistenceChanged: currentValueExistenceChanged
      });
    },
    updateChartData() {
      // if baseline.nodes contains the selected node then load baseline for this nde
      if (
        typeof this.selectedNodeId !== "undefined" &&
        this.baseline != null &&
        this.selectedNodeId in this.baseline.nodes
      ) {
        let timeSPoints = this.baseline.timeSPoints;
        let values = this.baseline.nodes[this.selectedNode.id];
        this.chartData = [];
        if (values.length > 0) {
          this.chartData.push(["time", "value"]);
          for (var i = 0; i < timeSPoints.length; i++) {
            this.chartData.push([new Date(timeSPoints[i] * 1000), values[i]]);
          }
        }
      } else {
        //console.log("nope");
        this.chartData = [];
      }
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
      this.updateChartData();
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
              "unusedInfluencers"
            ].includes(item);
          });
          if (differences.length) {
            this.$store.commit("ui/setUiNodeChanged", true);
            this.$store.commit("ui/addUiNodeChangedFields", differences);
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
          return a.symbol.length - b.symbol.length;
        });

        var sysFormula = parsedSymbolFormula.toString();
        if (sysFormula) {
          potentials.forEach(function(node) {
            sysFormula = sysFormula.replace(
              new RegExp(node.symbol, "g"), //global replacement
              " $" + node.id + " "
            );
          });
        }
        sysFormula.trim(); //trim whitespace from both sides
        sysFormula = sysFormula.replace(/  +/g, " "); //replace multiple spaces with single space
        this.nodeToSubmit.sysFormula = sysFormula;
      }

      //calculate blockingInfluencers
      let classifiedInfluencers = classifyInfluencers({
        thisNode: this.nodeToSubmit,
        nodes: this.nodes
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
