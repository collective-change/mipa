<template>
  <q-card>
    <modal-header>
      <template v-slot:header>Add {{ newNodeRole ? "new " + newNodeRole : "node" }}</template>
    </modal-header>
    <q-form @submit.prevent="submitForm">
      <q-card-section>
        <modal-node-name :name.sync="nodeToSubmit.name" ref="modalNodeName" />
      </q-card-section>
      <modal-buttons />
    </q-form>
  </q-card>
</template>

<script>
import { mapActions } from "vuex";
import { camelize } from "src/utils/util-camelize";

export default {
  props: ["sourceNodeId", "newNodeRole"],
  components: {
    "modal-header": require("components/Shared/ModalComponents/ModalHeader.vue")
      .default,
    "modal-buttons": require("components/Shared/ModalComponents/ModalButtons.vue")
      .default,
    "modal-node-name": require("components/Model/Modals/Shared/ModalNodeName.vue")
      .default,
  },
  data() {
    return {
      nodeToSubmit: {
        name: "",
        class: "unlinked",
      },
    };
  },

  methods: {
    ...mapActions("model", ["addNode"]),

    submitForm() {
      this.$refs.modalNodeName.$refs.name.validate();
      if (!this.$refs.modalNodeName.$refs.name.hasError) {
        this.submitNode();
      }
    },

    submitNode() {
      this.nodeToSubmit.symbol = camelize(this.nodeToSubmit.name);
      this.nodeToSubmit.symbolFormula = `delay(${this.nodeToSubmit.symbol}, dt, 0)`;
      this.nodeToSubmit.isNew = true;
      this.addNode({
        node: this.nodeToSubmit,
        sourceNodeId: this.sourceNodeId,
        newNodeRole: this.newNodeRole,
        modelId: this.$route.params.modelId,
      });
      this.$emit("close");
    },
  },
};
</script>
