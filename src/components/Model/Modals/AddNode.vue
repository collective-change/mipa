<template>
  <q-card>
    <modal-header>
      <template v-slot:header>Add {{newNodeRole ? 'new '+newNodeRole : 'node' }}</template>
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

export default {
  props: ["sourceNodeId", "newNodeRole"],
  components: {
    "modal-header": require("components/Shared/ModalComponents/ModalHeader.vue")
      .default,
    "modal-buttons": require("components/Shared/ModalComponents/ModalButtons.vue")
      .default,
    "modal-node-name": require("components/Model/Modals/Shared/ModalNodeName.vue")
      .default
  },
  data() {
    return {
      nodeToSubmit: {
        name: "",
        class: "unlinked"
      }
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
      this.addNode({
        node: this.nodeToSubmit,
        sourceNodeId: this.sourceNodeId,
        newNodeRole: this.newNodeRole,
        orgId: this.$route.params.orgId,
        modelId: this.$route.params.modelId
      });
      this.$emit("close");
    }
  }
};
</script>
