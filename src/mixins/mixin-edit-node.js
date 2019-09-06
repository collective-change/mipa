export default {
  methods: {
    submitForm() {
      this.$refs.nodeName.validate();
      if (!this.$refs.nodeName.hasError) {
        this.submitNode();
      }
    }
  },
  components: {
    // "modal-header": require("components/Shared/ModalComponents/ModalHeader.vue")
    //   .default,
    // "modal-buttons": require("components/Shared/ModalComponents/ModalButtons.vue")
    //   .default,
    "modal-node-name": require("components/Model/Modals/Shared/ModalNodeName.vue")
      .default
  }
};
