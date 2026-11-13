<template>
  <div>
    <q-card v-if="nodeReadyToDelete">
      <q-form @submit.prevent="submitDeleteNode">
        <q-card-section>
          <div class="text-h6">{{ $t("deleteFactorConfirm", { name: node.name }) }}</div>
        </q-card-section>
        <modal-cancel-delete-buttons />
      </q-form>
    </q-card>
    <q-card v-else>
      <modal-header>
        <template v-slot:header>{{ $t("This factor can't be deleted yet") }}</template>
      </modal-header>
      <q-card-section>
        <div
          class="text-h7"
        >{{ $t("deleteFactorSteps") }}</div>
      </q-card-section>
    </q-card>
  </div>
</template>

<script>
import { mapActions } from "vuex";
import { showErrorMessage } from "@/utils/util-show-error-message";
import ModalHeader from "@/components/Shared/ModalComponents/ModalHeader.vue";
import ModalCancelDeleteButtons from "@/components/Shared/ModalComponents/ModalCancelDeleteButtons.vue";

export default {
  components: {
    "modal-header": ModalHeader,
    "modal-cancel-delete-buttons": ModalCancelDeleteButtons,
  },

  props: ["node"],

  computed: {
    nodeReadyToDelete() {
      let node = this.node;
      if (
        (node.formula && node.formula.length) ||
        (node.influencers && node.influencers.length) ||
        (node.influencees && node.influencees.length)
      ) {
        return false;
      } else {
        return true;
      }
    },
  },

  methods: {
    ...mapActions("model", ["deleteNode"]),

    submitDeleteNode() {
      if (this.nodeReadyToDelete) {
        this.deleteNode({
          node: this.node,
          modelId: this.$route.params.modelId,
        });
        this.$emit("close");
      } else {
        console.log(
          "Node cannot be deleted because its formula, influencers or influencees array is not empty."
        );
      }
    },
  },
};
</script>
