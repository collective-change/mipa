<template>
  <div>
    <q-card v-if="selectedNode">
      <modal-header>
        <template v-slot:header>{{selectedNode.name}}</template>
      </modal-header>
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
          <q-input v-model="nodeToSubmit.enteredFormula" label="Formula" clearable />
          <vue-mathjax :formula="'$$'+latexFormula+'$$'"></vue-mathjax>
          <q-input v-model="nodeToSubmit.notes" label="Notes" clearable />
        </q-card-section>
        <modal-buttons />
      </q-form>
      <p>selectedNode</p>
      <pre>{{selectedNode}}</pre>
    </q-card>
    <q-card>Add a node</q-card>
  </div>
</template>

<script>
import { mapActions, mapGetters, mapState } from "vuex";
import mixinAddEditNode from "src/mixins/mixin-add-edit-node";
import { parse, format, toTex } from "mathjs";
import { VueMathjax } from "vue-mathjax";

export default {
  mixins: [mixinAddEditNode],

  components: {
    "modal-header": require("components/Shared/ModalComponents/ModalHeader.vue")
      .default,
    "modal-buttons": require("components/Shared/ModalComponents/ModalButtons.vue")
      .default,
    "vue-mathjax": VueMathjax
  },

  data() {
    return {
      nodeToSubmit: {}
    };
  },

  computed: {
    ...mapState("model", ["selectedNodeId"]),
    ...mapGetters("model", ["nodes", "links"]),

    selectedNode() {
      let that = this;
      return this.nodes.find(function(node) {
        return node.id == that.selectedNodeId;
      });
    },

    //parsedFormula from enteredFormula
    parsedFormula() {
      console.log("enteredFormula: ", this.nodeToSubmit.enteredFormula);
      let parsedFormula = this.nodeToSubmit.enteredFormula
        ? parse(this.nodeToSubmit.enteredFormula)
        : "";
      console.log("parsedFormula: ", parsedFormula);
      return parsedFormula;
    },

    //latexFormula from parsedFormula
    latexFormula() {
      let parenthesis = "keep";
      let implicit = "hide";
      return this.parsedFormula
        ? this.parsedFormula.toTex({
            parenthesis: parenthesis,
            implicit: implicit
          })
        : "";
      console.log("LaTeX expression:", latex);
    }
  },

  methods: {
    ...mapActions("model", ["updateNode"]),
    submitNode() {
      this.updateNode({
        teamId: this.$route.params.teamId,
        updates: this.nodeToSubmit
      });
      //this.$emit("close");
    }
  },

  mounted() {
    this.nodeToSubmit = Object.assign({}, this.selectedNode);
  },

  watch: {
    selectedNode: function(newNode, oldNode) {
      this.nodeToSubmit = Object.assign({}, this.selectedNode);
    }
  }
};
</script>
