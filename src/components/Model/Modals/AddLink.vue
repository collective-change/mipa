<template>
  <q-card>
    <modal-header>
      <template v-slot:header>Link to {{linkToSubmit.targetType}}</template>
    </modal-header>
    <q-form @submit.prevent="submitForm">
      <q-card-section>
        <modal-node-selection
          v-model:targetNodeId="linkToSubmit.targetNodeId"
          ref="modalNodeSelection"
        />
      </q-card-section>
      <modal-buttons />
    </q-form>
  </q-card>
</template>

<script>
import { mapState, mapActions } from "vuex";
import ModalHeader from "@/components/Shared/ModalComponents/ModalHeader.vue";
import ModalButtons from "@/components/Shared/ModalComponents/ModalButtons.vue";
import ModalNodeSelection from "@/components/Model/Modals/Shared/ModalNodeSelection.vue";

export default {
  props: ["sourceNodeId", "linkToSubmit"],
  components: {
    "modal-header": ModalHeader,
    "modal-buttons": ModalButtons,
    "modal-node-selection": ModalNodeSelection,
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
