<template>
  <div>
    <q-card v-if="selectedNode">
      <q-card-section class="row">
        <div class="text-h6">{{selectedNode.name}}</div>
      </q-card-section>
      <q-card-section class="row justify-end">
        <q-btn
          @click="showAddInfluencer = true"
          class="all-pointer-events"
          color="primary"
          label="Add influencer"
        />
      </q-card-section>
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
          <vue-mathjax :formula="'$$'+selectedNode.name+'='+latexFormula+'$$'"></vue-mathjax>
          <q-input v-model="nodeToSubmit.notes" label="Notes" clearable />
        </q-card-section>
        <modal-buttons />
      </q-form>
      <p>selectedNode</p>
      <pre>{{selectedNode}}</pre>
    </q-card>
    <q-dialog v-model="showAddInfluencer">
      <add-influencer :sourceNodeId="selectedNodeId" @close="showAddInfluencer=false" />
    </q-dialog>
  </div>
</template>

<script>
import { mapActions, mapGetters, mapState } from "vuex";
import { parse, format, toTex } from "mathjs";
import { VueMathjax } from "vue-mathjax";

export default {
  components: {
    "modal-buttons": require("components/Shared/ModalComponents/ModalButtons.vue")
      .default,
    "add-influencer": require("components/Model/Modals/AddInfluencer.vue")
      .default,
    "vue-mathjax": VueMathjax
  },

  data() {
    return {
      showAddInfluencer: false,
      nodeToSubmit: {},
      model: null
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
      //console.log("enteredFormula: ", this.nodeToSubmit.enteredFormula);
      let parsedFormula = this.nodeToSubmit.enteredFormula
        ? parse(this.nodeToSubmit.enteredFormula)
        : "";
      //console.log("parsedFormula: ", parsedFormula);
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
