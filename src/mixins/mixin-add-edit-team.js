export default {
  methods: {
    submitForm() {
      this.$refs.modalTeamName.$refs.name.validate();
      if (!this.$refs.modalTeamName.$refs.name.hasError) {
        this.submitTeam();
      }
    }
  },
  components: {
    "modal-header": require("components/Shared/ModalComponents/ModalHeader.vue")
      .default,
    "modal-buttons": require("components/Shared/ModalComponents/ModalButtons.vue")
      .default,
    "modal-team-name": require("components/Teams/Modals/Shared/ModalTeamName.vue")
      .default
  }
};
