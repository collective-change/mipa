<template>
  <q-card>
    <modal-header>
      <template v-slot:header>Add Node</template>
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
import mixinAddEditNode from "src/mixins/mixin-add-edit-node";

export default {
  mixins: [mixinAddEditNode],
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

    submitNode() {
      this.addNode(this.nodeToSubmit);
      this.$emit("close");
    }
  }
};
</script>
