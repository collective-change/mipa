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

export default {
  data() {
    return {
      issueToSubmit: {
        name: "",
        //dueDate: "",
        //dueTime: "",
        orgId: this.$route.params.orgId,
        completed: false
      }
    };
  },
  methods: {
    ...mapActions("issues", ["addIssue"]),

    submitIssue() {
      this.addIssue(this.issueToSubmit);
      this.$emit("close");
    },

    submitForm() {
      this.$refs.modalIssueName.$refs.name.validate();
      if (!this.$refs.modalIssueName.$refs.name.hasError) {
        this.submitIssue();
      }
    }
  },
  components: {
    "modal-header": require("components/Shared/ModalComponents/ModalHeader.vue")
      .default,
    "modal-issue-name": require("components/Issues/Modals/Shared/ModalIssueName.vue")
      .default,
    //"modal-due-date": require("components/Issues/Modals/Shared/ModalDueDate.vue").default,
    //"modal-due-time": require("components/Issues/Modals/Shared/ModalDueTime.vue").default,
    "modal-buttons": require("components/Shared/ModalComponents/ModalButtons.vue")
      .default
  }
};
</script>
