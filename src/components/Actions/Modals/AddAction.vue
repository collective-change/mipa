<template>
  <q-card>
    <modal-header v-slot:header>Add Action</modal-header>

    <q-form @submit.prevent="submitForm">
      <q-card-section>
        <modal-action-title :title.sync="actionToSubmit.title" ref="modalActionTitle" />
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
      actionToSubmit: {
        orgId: this.$route.params.orgId,
        title: "",
        isProject: false,
        notes: "",
        actionMchState: { value: "eligible" },
        impacts: [],
        estEffortHrs: null,
        effortCompletionPercentage: null,
        effortCostPerHrType: "use_average",
        customEffortCostPerHr: null,
        estSpending: null,
        spentAmount: null,
        totalDirectCost: 0,
        marginalTotalBenefitNpv: 0,
        marginalNetTotalBenefitNpv: 0,
        marginalTotalCostNpv: 0,
        actionLeverage: null,
      },
    };
  },
  methods: {
    ...mapActions("actions", ["addAction"]),

    submitAction() {
      this.addAction(this.actionToSubmit);
      this.$emit("close");
    },

    submitForm() {
      this.$refs.modalActionTitle.$refs.title.validate();
      if (!this.$refs.modalActionTitle.$refs.title.hasError) {
        this.submitAction();
      }
    },
  },
  components: {
    "modal-header": require("components/Shared/ModalComponents/ModalHeader.vue")
      .default,
    "modal-action-title": require("components/Actions/Modals/Shared/ModalActionTitle.vue")
      .default,
    "modal-buttons": require("components/Shared/ModalComponents/ModalButtons.vue")
      .default,
  },
};
</script>
