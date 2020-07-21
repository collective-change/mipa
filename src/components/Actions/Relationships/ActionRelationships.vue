<template>
  <q-list padding>
    <q-item-label header>
      Blocked by
      <q-btn color="primary" size="xs" class="q-ml-lg">add</q-btn>
    </q-item-label>
    <q-separator spaced />
    <q-item-label header>Blocks</q-item-label>
    <q-separator spaced />
    <q-item-label header>Parent</q-item-label>
    <q-separator spaced />
    <q-item-label header>Children</q-item-label>
  </q-list>
</template>

<script>
//import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";
import { mapActions, mapGetters, mapState } from "vuex";
import { createHelpers, mapMultiRowFields } from "vuex-map-fields";

const { mapFields } = createHelpers({
  getterType: "uiAction/getField",
  mutationType: "uiAction/updateUiActionField"
});

export default {
  props: ["action"],

  data() {
    return {};
  },

  computed: {
    ...mapState("ui", ["selectedActionId"]),
    ...mapGetters("actions", ["actions"]),
    //fields calculated in the uiAction store, for display only
    //(do not modify their values in the component)
    ...mapState("uiAction", ["uiAction", "uiActionChanged"]),
    //fields for 2-way sync between component and store
    ...mapFields([
      "uiAction.title",
      "uiAction.actionMchState",
      "uiAction.estEffortHrs",
      "uiAction.effortCompletionPercentage",
      "uiAction.effortCostPerHrType",
      "uiAction.customEffortCostPerHr",
      "uiAction.estSpending",
      "uiAction.spentAmount",
      "uiAction.totalDirectCost",
      "uiAction.outstandingDirectCost",
      "uiAction.sunkenDirectCost",
      "uiAction.dueDate",
      "uiAction.notes"
    ]),
    ...mapMultiRowFields(["uiAction.impacts"])
  },

  methods: {},

  created() {},
  watch: {}
};
</script>
