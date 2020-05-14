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
        />
        <vue-mathjax :formula="'$' + nodeToSubmit.symbol + '=' + latexFormula + '$'"></vue-mathjax>
        <gchart :v-if="chartData != []" type="LineChart" :data="chartData" :options="chartOptions" />

        <q-input v-model="nodeToSubmit.notes" label="Notes" autogrow />
        <modal-buttons />
      </q-form>parsedSymbolFormula
      <pre>{{nodeToSubmit.symbolFormula}}</pre>
      <p>parsedSymbolFormula</p>
      <pre>{{parsedSymbolFormula}}</pre>
      <p>sysFormula</p>
      <pre>{{nodeToSubmit.sysFormula}}</pre>

      <p>nodeToSubmit {{ nodeToSubmit.id }}</p>
      <pre>{{ nodeToSubmit }}</pre>
    </div>
  </div>
</template>

<script>
import { mapActions, mapGetters, mapState } from "vuex";
import { parse, format, toTex } from "mathjs";
import { VueMathjax } from "vue-mathjax";
import { getAcronym } from "src/utils/util-getAcronym";
import { GChart } from "vue-google-charts";
import { showErrorMessage } from "src/utils/util-show-error-message";

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
      //nodeBaseline: null,
      //enteredFormula: "",
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

    /*nonBlockingInfluencers() {
      if ('influencers' in this.nodeToSubmit && this.nodeToSubmit.influencers.length > 0) {
        this.nodeToSubmit.influencers.forEach(function(influencerId, index){
          //check if influencer is in a delay function
          //parse the formula, evaluate 
          //todo: check if influencer's time series begins before delay time
        })
      } else {
        return [];
      }
    }*/
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
      //this.$emit("close");
    },
    updateChartData() {
      // if baseline.nodes contains the selected node then load baseline for this nde
      if (
        typeof selectedNodeId !== "undefined" &&
        selectedNodeId in this.baseline.nodes
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
      } else this.chartData = [];
    },
    getBlockingInfluencers(sysFormula) {
      let nodeToSubmit = this.nodeToSubmit;
      let thisNodeId = this.nodeToSubmit.id;
      let parsedSysFormula = parse(sysFormula);
      //get all used influencers, add to blocking array
      let blocking = [];
      this.nodeToSubmit.influencers.forEach(function(influencerId) {
        if (sysFormula.includes(influencerId)) blocking.push(influencerId);
      });

      //get all delay calls
      let delayCallsArgs = [];
      let selfDelay = false;
      parsedSysFormula.traverse(function(node, path, parent) {
        if (node.type == "FunctionNode") {
          if (node.fn.name == "delay") {
            delayCallsArgs.push(node.args);
            //if the current node has a delay influence on itself
            if (node.args[0].name == "$" + nodeToSubmit.id) selfDelay = true;
          }
        }
      });
      if (selfDelay == true) blocking.push(nodeToSubmit.id);

      blocking.forEach(function(influencerId, index, object) {
        //remove influencer from blocking if it is only in non-blocking delay
        let influencerIsBlocking = true;
        let influencerDelayCallsArgs = [];
        //is influencer is used in any delay?
        delayCallsArgs.forEach(function(args) {
          //console.log(args);
          //if influencer is used in any delay, then influencerIsBlocking = false
          if (args[0].name.substring(1) == influencerId) {
            influencerIsBlocking = false;
            influencerDelayCallsArgs.push(args);
          }
        });
        //for each delay call the influencer is in
        influencerDelayCallsArgs.forEach(function(args) {
          //if a blocking delay, then set influencerIsBlocking = true
          //if initialValue is not set then influencerIsBlocking = true
          if (args.length < 3) influencerIsBlocking = true;
          let initialValue = args[2];
          if (initialValue == "best_guess") {
            let historyAvailable = false; //todo: check if history is available
            if (isNaN(nodeToSubmit.currentValue))
              var currentValueAvailable = false;
            else var currentValueAvailable = true;
            if (!historyAvailable && !currentValueAvailable)
              influencerIsBlocking = true;
          }
        });
        if (influencerIsBlocking == false) {
          //remove influencer from blocking array
          object.splice(index, 1);
        }
      });
      console.log({ blocking });
      return blocking;
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

    //initialize nodeToSubmit
    //this.nodeToSubmit = Object.assign({}, this.selectedNode);
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
      let blockingInfluencers = this.getBlockingInfluencers(sysFormula);
      this.nodeToSubmit.blockingInfluencers = blockingInfluencers;
    }
  }
};
</script>
