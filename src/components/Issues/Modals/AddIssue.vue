<template>
  <q-card>
    <modal-header v-slot:header>Add Issue</modal-header>

    <q-form @submit.prevent="submitForm">
      <q-card-section>
        <modal-issue-name :name.sync="issueToSubmit.name" ref="modalIssueName" />
      </q-card-section>
      <modal-buttons />
    </q-form>
  </q-card>
</template>

<script>
import { mapActions } from "vuex";
import mixinAddEditIssue from "src/mixins/mixin-add-edit-issue";

export default {
  mixins: [mixinAddEditIssue],
  data() {
    return {
      issueToSubmit: {
        name: "",
        dueDate: "",
        dueTime: "",
        completed: false
      }
    };
  },
  methods: {
    ...mapActions("issues", ["addIssue"]),

    submitIssue() {
      this.addIssue(this.issueToSubmit);
      this.$emit("close");
    }
  }
};
</script>
