<template>
  <q-card>
    <modal-header>
      <template v-slot:header>Add Influencer</template>
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
  props: ["sourceNodeId"],
  components: {
    "modal-header": require("components/Shared/ModalComponents/ModalHeader.vue")
      .default,
    "modal-buttons": require("components/Shared/ModalComponents/ModalButtons.vue")
      .default,
    "modal-node-selection": require("components/Model/Modals/Shared/ModalNodeSelection.vue")
      .default
  },
  data() {
    return {
      linkToSubmit: {
        sourceNodeId: this.sourceNodeId,
        targetNodeId: "",
        targetType: "influencer"
      }
    };
  },
  computed: {
    ...mapState("model", ["selectedNodeId"])
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
      console.log(this.linkToSubmit);
      this.addLink({
        link: this.linkToSubmit,
        teamId: this.$route.params.teamId
      });
      this.$emit("close");
    }
  }
};
</script>
