<template>
  <div>
    <div v-if="selectedNode">
      <div class="text-h6">{{ selectedNode.name }}</div>

      <q-form @submit.prevent="submitForm">
        <q-input
          v-model="nodeToSubmit.name"
          label="Name"
          :rules="[(val) => !!val || 'Field is required']"
          clearable
          ref="nodeName"
        />
        <q-input v-model="nodeToSubmit.units" label="Units" clearable />
        <q-input v-model="nodeToSubmit.symbol" label="symbol" clearable />
        <q-input v-model="nodeToSubmit.symbolFormula" label="symbolFormula" />
        <q-input v-model="nodeToSubmit.parsedSysFormula" label="parsedSysFormula" readonly />
        <vue-mathjax :formula="'$$' + selectedNode.symbol + '=' + latexFormula + '$$'"></vue-mathjax>
        <q-input v-model="nodeToSubmit.notes" label="Notes" clearable />

        <modal-buttons />
      </q-form>
    </div>
    <!--<p>selectedNode</p>
    <pre>{{selectedNode}}</pre>-->
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
    "vue-mathjax": VueMathjax
  },

  data() {
    return {
      nodeToSubmit: {},
      //enteredFormula: "",
      model: null
    };
  },

  computed: {
    ...mapState("ui", ["selectedNodeId"]),
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
        //for each influencer, replace symbol in formula with id
        if (typeof this.nodeToSubmit.influencers !== "undefined") {
          this.nodeToSubmit.influencers.forEach(function(influencerNodeId) {
            influencerNode = nodes.find(function(node) {
              return node.id == influencerNodeId;
            });
            sysFormula = sysFormula.replace(
              influencerNode.symbol,
              " " + influencerNode.id + " "
            );
          });
        }
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

    //parse system formula
    parsedSysFormula() {
      let parsedSysFormula = this.nodeToSubmit.sysFormula
        ? parse(this.nodeToSubmit.sysFormula)
        : "";
      return parsedSysFormula;
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
    },
    sysFormula: function() {
      this.nodeToSubmit.sysFormula = this.sysFormula;
    },
    parsedSysFormula: function() {
      this.nodeToSubmit.parsedSysFormula = this.parsedSysFormula;
    }
  }
};
</script>
