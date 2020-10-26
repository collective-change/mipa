<template>
  <q-card>
    <modal-header>
      <template v-slot:header>Link to {{linkToSubmit.targetType}}</template>
    </modal-header>
    <q-form @submit.prevent="submitForm">
      <q-card-section>
        <modal-node-selection
          :targetNodeId.sync="linkToSubmit.targetNodeId"
          ref="modalNodeSelection"
        />
      </q-card-section>
      <modal-buttons />
    </q-form>
  </q-card>
</template>

<script>
import { mapState, mapActions } from "vuex";

export default {
  props: ["sourceNodeId", "linkToSubmit"],
  components: {
    "modal-header": require("components/Shared/ModalComponents/ModalHeader.vue")
      .default,
    "modal-buttons": require("components/Shared/ModalComponents/ModalButtons.vue")
      .default,
    "modal-node-selection": require("components/Model/Modals/Shared/ModalNodeSelection.vue")
      .default,
  },
  computed: {
    ...mapState("model", ["selectedNodeId"]),
  },
  methods: {
    ...mapActions("model", ["addLink"]),

    submitForm() {
      this.$refs.modalNodeSelection.$refs.targetNode.validate();
      if (!this.$refs.modalNodeSelection.$refs.targetNode.hasError) {
        this.submitLink();
      }
    },

    submitLink() {
      this.addLink({
        link: this.linkToSubmit,
        modelId: this.$route.params.modelId,
      });
      this.$emit("close");
    },
  },
};
</script>
