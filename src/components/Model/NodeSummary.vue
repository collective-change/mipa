<template>
  <div>
    <!-- <q-card v-if="selectedNode">
      <q-card-section class="row">
        <div class="text-h6">{{selectedNode.name}}</div>
      </q-card-section>
      <q-card-section class="row justify-end"></q-card-section>
      <q-form @submit.prevent="submitForm">
        <q-card-section>
          <q-input
            v-model="nodeToSubmit.name"
            label="Name"
            :rules="[val => !!val || 'Field is required']"
            clearable
            ref="nodeName"
          />
          <q-input v-model="nodeToSubmit.units" label="Units" clearable />
          <q-input
            v-model="nodeToSubmit.symbol"
            label="symbol"
            :rules="[val => !!val || 'Field is required']"
            clearable
          />
          <q-input v-model="enteredFormula" label="enteredFormula" />
          <q-input v-model="nodeToSubmit.sysFormula" label="sysFormula" clearable />
          <vue-mathjax :formula="'$$'+selectedNode.symbol+'='+latexFormula+'$$'"></vue-mathjax>
          <q-input v-model="nodeToSubmit.notes" label="Notes" clearable />
        </q-card-section>
        <modal-buttons />
      </q-form>
    </q-card>-->
    <div v-if="selectedNode">
      <div class="text-h6">{{selectedNode.name}}</div>

      <q-form @submit.prevent="submitForm">
        <q-input
          v-model="nodeToSubmit.name"
          label="Name"
          :rules="[val => !!val || 'Field is required']"
          clearable
          ref="nodeName"
        />
        <q-input v-model="nodeToSubmit.units" label="Units" clearable />
        <q-input
          v-model="nodeToSubmit.symbol"
          label="symbol"
          :rules="[val => !!val || 'Field is required']"
          clearable
        />
        <q-input v-model="enteredFormula" label="enteredFormula" />
        <q-input v-model="nodeToSubmit.sysFormula" label="sysFormula" clearable />
        <vue-mathjax :formula="'$$'+selectedNode.symbol+'='+latexFormula+'$$'"></vue-mathjax>
        <q-input v-model="nodeToSubmit.notes" label="Notes" clearable />

        <modal-buttons />
      </q-form>
    </div>
    <!-- <p>selectedNode</p> 
    <pre>{{selectedNode}}</pre>-->
  </div>
</template>

<script>
import { mapActions, mapGetters, mapState } from "vuex";
import { parse, format, toTex } from "mathjs";
import { VueMathjax } from "vue-mathjax";
import { getAcronym } from "src/functions/function-getAcronym";

export default {
  components: {
    "modal-buttons": require("components/Shared/ModalComponents/ModalButtons.vue")
      .default,
    "vue-mathjax": VueMathjax
  },

  data() {
    return {
      nodeToSubmit: {},
      enteredFormula: "",
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

    //parse symbol formula
    parsedSymbolFormula() {
      let parsedSymbolFormula = this.symbolFormula
        ? parse(this.symbolFormula)
        : "";
      return parsedSymbolFormula;
    },

    //latexFormula from parsedSymbolFormula
    latexFormula() {
      let parenthesis = "keep";
      let implicit = "hide";
      return this.parsedSymbolFormula
        ? this.parsedSymbolFormula.toTex({
            parenthesis: parenthesis,
            implicit: implicit
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
        teamId: this.$route.params.teamId,
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
    }
  }
};
</script>
