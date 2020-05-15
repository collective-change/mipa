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
          :rules="[val => (val=='' || val!='' && isNaN(parseInt(val.substring(0,1)))) || 'Cannot start with a number']"
        />
        <q-input v-model="nodeToSubmit.currentValue" label="Current value" type="number" />
        <q-input
          :value="nodeToSubmit.symbol"
          @change="e => {nodeToSubmit.symbol = e.target.value}"
          label="Symbol"
          :rules="[val => !!val || 'Field is required', val => isNaN(parseInt(val.substring(0,1))) || 'Cannot start with a number']"
        />
        <q-input
          :value="nodeToSubmit.symbolFormula"
          @change="e => { nodeToSubmit.symbolFormula = e.target.value }"
          label="(symbol) Formula"
          autogrow
        />
        <vue-mathjax :formula="'$' + nodeToSubmit.symbol + '=' + latexFormula + '$'"></vue-mathjax>
        <gchart :v-if="chartData != []" type="LineChart" :data="chartData" :options="chartOptions" />
        <q-input v-model="nodeToSubmit.notes" label="Notes" autogrow />
        <modal-buttons />
      </q-form>
      <p>nodeToSubmit: {{ nodeToSubmit.id }}</p>
      <p>symbolFormula</p>
      <pre>{{nodeToSubmit.symbolFormula}}</pre>
      <p>parsedSymbolFormula</p>
      <pre>{{parsedSymbolFormula}}</pre>
      <p>sysFormula</p>
      <pre>{{nodeToSubmit.sysFormula}}</pre>
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
      model: null,

      chartData: [],
      chartOptions: {
        legend: { position: "none" }
      }
    };
  },

  computed: {
    ...mapState("ui", ["selectedNodeId"]),
    ...mapState("calcResults", ["baseline"]),
    ...mapGetters("model", ["nodes", "links"]),

    selectedNode() {
      let that = this;
      return this.nodes.find(function(node) {
        return node.id == that.selectedNodeId;
      });
    },

    //parse symbol formula
    parsedSymbolFormula() {
      try {
        let parsedSymbolFormula = this.nodeToSubmit.symbolFormula
          ? parse(this.nodeToSubmit.symbolFormula)
          : "";
        return parsedSymbolFormula;
      } catch (err) {
        console.log(err);
        showErrorMessage("Error parsing formula", err.message);
      }
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
      this.updateNode({
        modelId: this.$route.params.modelId,
        updates: this.nodeToSubmit
      });
    },
    updateChartData() {
      // if baseline.nodes contains the selected node then load baseline for this nde
      if (
        typeof this.selectedNodeId !== "undefined" &&
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
        console.log("nope");
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
      this.nodeToSubmit = Object.assign({}, this.selectedNode);
      this.updateChartData();
    },

    baseline: function() {
      this.updateChartData();
    },

    parsedSymbolFormula: function(newVersion, oldVersion) {
      // calculate sysFormula
      if (newVersion.toString() == "") {
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

        var sysFormula = newVersion.toString();
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

      this.nodeToSubmit.blockingInfluencers = classifiedInfluencers.blocking;
      this.nodeToSubmit.unusedInfluencers = classifiedInfluencers.unused;
    }
  }
};
</script>
