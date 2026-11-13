import ModalHeader from "@/components/Shared/ModalComponents/ModalHeader.vue";
import ModalButtons from "@/components/Shared/ModalComponents/ModalButtons.vue";
import ModalOrgName from "@/components/Orgs/Modals/Shared/ModalOrgName.vue";
import ModalOrgCurrency from "@/components/Orgs/Modals/Shared/ModalOrgCurrency.vue";
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
    "modal-header": ModalHeader,
    "modal-buttons": ModalButtons,
    "modal-org-name": ModalOrgName,
    "modal-org-currency": ModalOrgCurrency
  }
};
