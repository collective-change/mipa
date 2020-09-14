export default {
  methods: {
    submitForm() {
      this.$refs.modalOrgName.$refs.name.validate();
      if (!this.$refs.modalOrgName.$refs.name.hasError) {
        this.submitOrg();
      }
    }
  },
  components: {
    "modal-header": require("components/Shared/ModalComponents/ModalHeader.vue")
      .default,
    "modal-buttons": require("components/Shared/ModalComponents/ModalButtons.vue")
      .default,
    "modal-org-name": require("components/Orgs/Modals/Shared/ModalOrgName.vue")
      .default,
    "modal-org-currency": require("components/Orgs/Modals/Shared/ModalOrgCurrency.vue")
      .default
  }
};
