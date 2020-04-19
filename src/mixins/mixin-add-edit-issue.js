export default {
  methods: {
    submitForm() {
      this.$refs.modalIssueName.$refs.name.validate();
      if (!this.$refs.modalIssueName.$refs.name.hasError) {
        this.submitIssue();
      }
    },
  },
  components: {
    "modal-header": require("components/Shared/ModalComponents/ModalHeader.vue")
      .default,
    "modal-issue-name": require("components/Issues/Modals/Shared/ModalIssueName.vue")
      .default,
    //"modal-due-date": require("components/Issues/Modals/Shared/ModalDueDate.vue").default,
    //"modal-due-time": require("components/Issues/Modals/Shared/ModalDueTime.vue").default,
    "modal-buttons": require("components/Shared/ModalComponents/ModalButtons.vue")
      .default,
  },
};
