<template>
  <div>
    <div class="text-h6">Impacts</div>
    <q-list bordered>
      <q-item
        v-for="impact in impacts"
        v-bind:key="impact.id"
        tag="label"
        v-ripple
      >
        <q-item-section>
          <q-item-label>{{ impact.id }}</q-item-label>
        </q-item-section>
        <q-item-section side> </q-item-section>
      </q-item>
    </q-list>
    <div class="q-pa-sm q-gutter-sm">
      <q-btn label="Add impact" color="primary" @click="showAddImpact = true" />
    </div>
    <q-dialog v-model="showAddImpact">
      <add-impact @close="showAddImpact = false" />
    </q-dialog>
  </div>
</template>

<script>
import { mapActions, mapGetters, mapState } from "vuex";
//import { mapFields } from 'vuex-map-fields';
import { createHelpers, mapMultiRowFields } from "vuex-map-fields";
import { formatNumber } from "src/utils/util-formatNumber";

const { mapFields } = createHelpers({
  getterType: "uiAction/getField",
  mutationType: "uiAction/updateUiActionField"
});

export default {
  components: {
    "modal-buttons": require("components/Shared/ModalComponents/ModalButtons.vue")
      .default,
    "add-impact": require("components/Impacts/AddImpact.vue").default
  },

  data() {
    return {
      actionId: null,
      showAddImpact: false
      //estimatedRoi: null
    };
  },

  computed: {
    ...mapState("orgs", ["currentOrg"]),
    ...mapState("ui", ["selectedActionId"]),
    ...mapState("actions", ["actions"]),
    //fields calculated in the uiAction store, for display only
    //(do not modify their values in the component)
    ...mapState("uiAction", ["uiAction"]),
    //fields for 2-way sync between component and store
    ...mapFields([
      "uiAction.title",
      "uiAction.estTotalBenefitXdr",
      "uiAction.estEffortCostXdr",
      "uiAction.effortCompletionPercentage",
      "uiAction.estPurchaseCostXdr",
      "uiAction.purchasedAmount",
      "uiAction.dueDate",
      "uiAction.notes",
      "uiAction.impacts"
    ])
    //...mapMultiRowFields(["uiAction.impacts"])
  },

  methods: {
    ...mapActions("model", ["updateAction"]),
    formatNumber
  },

  watch: {}
};
</script>
