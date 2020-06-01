<template>
  <q-card>
    <q-card-section>
      <div class="text-h6">Add impact</div>
    </q-card-section>

    <q-form @submit.prevent="submitAction">
      <q-card-section class="q-pt-none">
        <q-select
          filled
          v-model="impact.impactType"
          :options="options"
          label=""
          emit-value
        />
      </q-card-section>
      <modal-buttons />
    </q-form>
  </q-card>
</template>

<script>
import { mapActions, mapState } from "vuex";
import { createHelpers } from "vuex-map-fields";

const { mapFields } = createHelpers({
  getterType: "uiAction/getField",
  mutationType: "uiAction/updateUiActionField"
});

export default {
  data() {
    return {
      impact: {},
      options: [
        {
          label: "If we act on the opportunity",
          value: "if_done"
        },
        {
          label: "If we don't act on the threat",
          value: "if_not_done"
        }
      ]
    };
  },
  methods: {
    ...mapActions("actions", ["addAction"]),

    submitAction() {
      var newImpact = {};
      Object.assign(newImpact, this.impact);
      newImpact.id = Date.now();
      this.$store.commit("uiAction/addImpact", newImpact);
      this.$emit("close");
      console.log("closed");
    }

    /*submitForm() {
      this.$refs.modalActionTitle.$refs.title.validate();
      if (!this.$refs.modalActionTitle.$refs.title.hasError) {
        this.submitAction();
      }
    }*/
  },
  components: {
    "modal-header": require("components/Shared/ModalComponents/ModalHeader.vue")
      .default,
    "modal-action-title": require("components/Actions/Modals/Shared/ModalActionTitle.vue")
      .default,
    "modal-buttons": require("components/Shared/ModalComponents/ModalButtons.vue")
      .default
  },
  computed: {
    //fields calculated in the uiAction store, for display only
    //(do not modify their values in the component)
    ...mapState("uiAction", ["uiAction"]),
    //fields for 2-way sync between component and store
    ...mapFields([
      /*"uiAction.title",
      "uiAction.estTotalBenefitXdr",
      "uiAction.estEffortCostXdr",
      "uiAction.effortCompletionPercentage",
      "uiAction.estPurchaseCostXdr",
      "uiAction.purchasedAmount",
      "uiAction.dueDate",
      "uiAction.notes",*/
      "uiAction.impacts"
    ])
  }
};
</script>
