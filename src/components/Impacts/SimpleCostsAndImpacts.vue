<template>
  <div v-if="costsAndImpacts">
    <!--<div class="text-h6">
      <slot name="header"></slot>
    </div>-->
    <div>
      <q-chip
        square
        v-for="actionId in costsAndImpacts.includedActionIds"
        :key="actionId"
        >{{ getActionTitle(actionId) }}</q-chip
      >
    </div>
    <q-list>
      <q-item
        v-for="impact in costsAndImpacts.impacts"
        v-bind:key="impact.id"
        tag="label"
      >
        <q-item-section>
          <!-- <q-item-label overline>{{ impact.id }}</q-item-label> -->
          <q-item-label>
            <div class="row">
              {{ getImpactTypeIfClause(impact.impactType) }}
              {{ impact.hasDeadline ? "by deadline" : "at some time" }}
              {{ impact.deadline }} then
              {{ impact.thenText }}
            </div>
            <div class="row items-center">
              <q-chip>{{ getNodeName(impact.nodeId) }}</q-chip>
              {{ mathSymbols[impact.operation] }} {{ impact.operand }}
              {{ durationTypeText[impact.durationType] }}
              {{
                durationTypesWithDuration.includes(impact.durationType)
                  ? impact.durationNumber
                  : ""
              }}
              {{
                durationTypesWithDuration.includes(impact.durationType)
                  ? impact.durationUnit
                  : ""
              }}
            </div>
          </q-item-label>
        </q-item-section>
      </q-item>
    </q-list>
    <q-list>
      <q-item>
        Outstanding effort:
        {{ formatNumber(costsAndImpacts.outstandingDirectEffortHrs, 3) }} /
        {{ formatNumber(costsAndImpacts.estEffortHrs, 3) }} hrs
      </q-item>
      <q-item>
        Outstanding effort cost:
        {{ formatNumber(costsAndImpacts.outstandingDirectEffortCosts, 3) }} /
        {{ formatNumber(costsAndImpacts.estEffortCosts, 3) }}
      </q-item>
      <q-item>
        Outstanding spending:
        {{ formatNumber(costsAndImpacts.outstandingSpending, 3) }} /
        {{ formatNumber(costsAndImpacts.estSpending, 3) }}
      </q-item>
      <q-item>
        Outstanding direct costs:
        {{ formatNumber(costsAndImpacts.outstandingDirectCosts, 3) }} /
        {{ formatNumber(costsAndImpacts.estDirectCosts, 3) }}
      </q-item>
    </q-list>
  </div>
</template>

<script>
import { mapActions, mapGetters, mapState } from "vuex";
import { createHelpers, mapMultiRowFields } from "vuex-map-fields";
import { formatNumber } from "src/utils/util-formatNumber";

const { mapFields } = createHelpers({
  getterType: "uiAction/getField",
  mutationType: "uiAction/updateUiActionField",
});

export default {
  components: {
    "add-edit-impact": require("components/Impacts/AddEditImpact.vue").default,
  },

  props: ["costsAndImpacts"],

  data() {
    return {
      actionId: null,
      showAddImpact: false,
      showEditImpact: false,
      editImpactId: null,
      mathSymbols: {
        "+": "+",
        "-": "−",
        "*": "×",
        "/": "÷",
        "=": "=",
      },
      durationTypeText: {
        just_once: "just once",
        for_period: "for period of",
        with_half_life: "with half life of",
        forever: "forever",
      },
      durationTypesWithDuration: ["for_period", "with_half_life"],
    };
  },

  computed: {
    //...mapState("orgs", ["currentOrg"]),
    ...mapState("model", ["nodes"]),
    //...mapState("ui", ["selectedActionId"]),
    ...mapState("actions", ["actions"]),
  },

  methods: {
    //...mapActions("model", ["updateAction"]),
    formatNumber,
    getImpactTypeIfClause(type) {
      switch (type) {
        case "if_done":
          return "If done";
          break;
        case "if_not_done":
          return "if not done";
          break;
      }
    },
    getNodeName(nodeId) {
      const found = this.nodes.find((node) => node.id == nodeId);
      if (found) return found.name;
      else return nodeId;
    },

    getActionTitle(actionId) {
      let action = this.actions.find((a) => a.id == actionId);
      return action.title;
    },

    /*promptToDelete(impactId) {
      this.$q
        .dialog({
          title: "Confirm",
          message: "Really delete?",
          cancel: true,
          persistent: true
        })
        .onOk(() => {
          this.$store.commit("uiAction/deleteImpact", impactId);
        });
    }*/
  },

  watch: {},
};
</script>
