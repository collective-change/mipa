<template>
  <div>
    <div v-if="selectedNode">
      <div class="text-h6">{{ selectedNode.name }}</div>

      <q-form @submit.prevent="submitForm">
        <q-input
          v-model="nodeToSubmit.name"
          label="Name"
          :rules="[(val) => !!val || 'Field is required']"
          ref="nodeName"
        />
        <q-input v-model="nodeToSubmit.units" label="Units" />
        <q-input v-model="nodeToSubmit.currentValue" label="Current value" />
        <q-input v-model="nodeToSubmit.symbol" label="symbol" />
        <q-input v-model="nodeToSubmit.symbolFormula" label="symbolFormula" />
        <vue-mathjax :formula="'$$' + nodeToSubmit.symbol + '=' + latexFormula + '$$'"></vue-mathjax>
        <q-input v-model="nodeToSubmit.notes" label="Notes" />

        <modal-buttons />
      </q-form>
    </div>
    <p>selectedNode</p>
    <pre>{{selectedNode}}</pre>
  </div>
</template>

<script>
import { mapActions, mapGetters, mapState } from "vuex";
import { parse, format, toTex } from "mathjs";
import { VueMathjax } from "vue-mathjax";
import { getAcronym } from "src/utils/util-getAcronym";

export default {
  components: {
    "modal-buttons": require("components/Shared/ModalComponents/ModalButtons.vue")
      .default,
    //sparkline: require("components/Charts/Sparkline.vue").default,
    "vue-mathjax": VueMathjax
  },

  data() {
    return {
      nodeToSubmit: {},
      nodeBaseline: null,
      //enteredFormula: "",
      model: null
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
    /*
    symbolFormula() {
      if (this.nodeToSubmit.sysFormula) {
        var nodes = this.nodes;
        var influencerNode = {};
        var symbolFormula = this.nodeToSubmit.sysFormula;
        //for each influencer, replace id in formula with symbol
        this.nodeToSubmit.influencers.forEach(function(influencerNodeId) {
          influencerNode = nodes.find(function(node) {
            return node.id == influencerNodeId;
          });
          symbolFormula = symbolFormula.replace(
            influencerNode.id,
            influencerNode.symbol
          );
        });
        return symbolFormula;
      } else return "";
    },
    */

    sysFormula() {
      if (this.nodeToSubmit.symbolFormula) {
        var nodes = this.nodes;
        var influencerNode = {};
        var sysFormula = this.nodeToSubmit.symbolFormula;
        //todo: replace symbols starting with longest symbols
        //gather up ids of self, influencers, and their symbols
        var potentials = [];
        potentials.push({
          symbol: this.nodeToSubmit.symbol,
          id: this.nodeToSubmit.id
        });
        if (this.nodeToSubmit.influencers)
          this.nodeToSubmit.influencers.forEach(function(influencerNodeId) {
            influencerNode = nodes.find(function(node) {
              return node.id == influencerNodeId;
            });
            potentials.push({
              symbol: influencerNode.symbol,
              id: influencerNodeId
            });
          });
        if (this.nodeToSubmit.feedbackInfluencers)
          this.nodeToSubmit.feedbackInfluencers.forEach(function(
            influencerNodeId
          ) {
            influencerNode = nodes.find(function(node) {
              return node.id == influencerNodeId;
            });
            potentials.push({
              symbol: influencerNode.symbol,
              id: influencerNodeId
            });
          });
        potentials.sort(function(a, b) {
          return a.symbol.length - b.symbol.length;
        });
        console.log("potentials: ", potentials);

        potentials.forEach(function(node) {
          sysFormula = sysFormula.replace(node.symbol, " " + node.id + " ");
        });

        return sysFormula;
      } else return "";
    },

    //parse symbol formula
    parsedSymbolFormula() {
      let parsedSymbolFormula = this.nodeToSubmit.symbolFormula
        ? parse(this.nodeToSubmit.symbolFormula)
        : "";
      return parsedSymbolFormula;
    },

    //replace ids in parsedSysFormula back to symbols

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
      //this.$emit("close");
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
      this.nodeBaseline = {
        timeSPoints: this.baseline.timeSPoints,
        values: this.baseline[this.selectedNode.id]
      };
    },
    sysFormula: function() {
      this.nodeToSubmit.sysFormula = this.sysFormula;
    }
  }
};
</script>
