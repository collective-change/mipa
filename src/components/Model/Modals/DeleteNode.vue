<template>
  <div>
    <q-card v-if="nodeReadyToDelete">
      <q-form @submit.prevent="submitDeleteNode">
        <q-card-section>
          <div class="text-h6">
            Really delete "{{node.name}}"?
            <br />This cannot be undone.
          </div>
        </q-card-section>
        <modal-cancel-delete-buttons />
      </q-form>
    </q-card>
    <q-card v-else>
      <modal-header>
        <template v-slot:header>Node not ready to be deleted</template>
      </modal-header>
      <q-card-section>
        <div
          class="text-h7"
        >First delete its link to influencees, its formula, then its link from influencers.</div>
      </q-card-section>
    </q-card>
  </div>
</template>

<script>
import { mapActions } from "vuex";
import { showErrorMessage } from "src/utils/function-show-error-message";

export default {
  components: {
    "modal-header": require("components/Shared/ModalComponents/ModalHeader.vue")
      .default,
    "modal-cancel-delete-buttons": require("components/Shared/ModalComponents/ModalCancelDeleteButtons.vue")
      .default
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
    }
  },

  methods: {
    ...mapActions("model", ["deleteNode"]),

    submitDeleteNode() {
      if (this.nodeReadyToDelete) {
        this.deleteNode({
          node: this.node,
          teamId: this.$route.params.teamId
        });
        this.$emit("close");
      } else {
        console.log(
          "Node cannot be deleted because its formula, influencers or influencees array is not empty."
        );
      }
    }
  }
};
</script>
