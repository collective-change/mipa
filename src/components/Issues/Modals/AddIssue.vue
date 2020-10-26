<template>
  <q-card>
    <modal-header v-slot:header>Add Issue</modal-header>

    <q-form @submit.prevent="submitForm">
      <q-card-section>
        <modal-issue-title :title.sync="issueToSubmit.title" ref="modalIssueTitle" />
        <modal-issue-type :type.sync="issueToSubmit.type" ref="modalIssueType" />
      </q-card-section>
      <modal-buttons />
    </q-form>
  </q-card>
</template>

<script>
import { mapActions } from "vuex";

export default {
  data() {
    return {
      issueToSubmit: {
        title: "",
        type: "action",
        //dueDate: "",
        //dueTime: "",
        orgId: this.$route.params.orgId,
        completed: false,
      },
    };
  },
  methods: {
    ...mapActions("issues", ["addIssue"]),

    submitIssue() {
      this.addIssue(this.issueToSubmit);
      this.$emit("close");
    },

    submitForm() {
      this.$refs.modalIssueTitle.$refs.title.validate();
      if (!this.$refs.modalIssueTitle.$refs.title.hasError) {
        this.submitIssue();
      }
    },
  },
  components: {
    "modal-header": require("components/Shared/ModalComponents/ModalHeader.vue")
      .default,
    "modal-issue-title": require("components/Issues/Modals/Shared/ModalIssueTitle.vue")
      .default,
    "modal-issue-type": require("components/Issues/Modals/Shared/ModalIssueType.vue")
      .default,
    //"modal-due-date": require("components/Issues/Modals/Shared/ModalDueDate.vue").default,
    //"modal-due-time": require("components/Issues/Modals/Shared/ModalDueTime.vue").default,
    "modal-buttons": require("components/Shared/ModalComponents/ModalButtons.vue")
      .default,
  },
};
</script>
