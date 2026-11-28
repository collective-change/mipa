<template>
  <div>
    <q-list bordered>
      <q-item v-for="impact in impacts" v-bind:key="impact.id" tag="label" v-ripple>
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
              {{ mathSymbols[impact.operation] }} {{ Number(impact.operand).toLocaleString() }}
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
          <q-item-label caption></q-item-label>
        </q-item-section>
        <q-item-section side>
          <div class="row">
            <q-btn
              @click.stop="
                editImpactId = impact.id;
                showEditImpact = true;
              "
              flat
              round
              dense
              color="primary"
              icon="edit"
            >
              <q-tooltip>Edit impact</q-tooltip>
            </q-btn>
            <q-btn
              @click.stop="promptToDelete(impact.id)"
              flat
              round
              dense
              color="red-4"
              icon="delete"
            >
              <q-tooltip>Delete impact</q-tooltip>
            </q-btn>
          </div>
        </q-item-section>
      </q-item>
    </q-list>
    <div class="q-pa-sm q-gutter-sm">
      <q-btn :label="$t('Add impact')" icon="add" color="primary" unelevated no-caps @click="showAddImpact = true" />
    </div>
    <q-dialog v-model="showAddImpact">
      <add-edit-impact addOrEdit="add" :nodes="nodes" @close="showAddImpact = false" />
    </q-dialog>
    <q-dialog v-model="showEditImpact">
      <add-edit-impact
        addOrEdit="edit"
        :nodes="nodes"
        :impactToEdit="impactToEdit"
        @close="
          showEditImpact = false;
          editImpactId = null;
        "
      />
    </q-dialog>
  </div>
</template>

<script>
import { pickState, pickUiActionFields } from "@/store/pinia-helpers";
import { useOrgsStore } from "@/store/store-orgs";
import { useModelStore } from "@/store/store-model";
import { useUiStore } from "@/store/store-ui";
import { useActionsStore } from "@/store/store-actions";
import { useUiActionStore } from "@/store/store-uiAction";
import AddEditImpact from "@/components/Impacts/AddEditImpact.vue";

export default {
  components: {
    "add-edit-impact": AddEditImpact,
  },

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
    ...pickState(useOrgsStore, ["currentOrg"]),
    ...pickState(useModelStore, ["nodes"]),
    ...pickState(useUiStore, ["selectedActionId"]),
    ...pickState(useActionsStore, ["actions"]),
    //fields calculated in the uiAction store, for display only
    //(do not modify their values in the component)
    ...pickState(useUiActionStore, ["uiAction"]),
    //fields for 2-way sync between component and store
    ...pickUiActionFields(useUiActionStore, ["uiAction.title", "uiAction.impacts"]),

    impactToEdit() {
      if (this.editImpactId != null)
        return this.impacts.find((impact) => impact.id == this.editImpactId);
      else return null;
    },
  },

  methods: {
    //formatNumber
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

    promptToDelete(impactId) {
      this.$q
        .dialog({
          title: "Confirm",
          message: "Really delete?",
          cancel: true,
          persistent: true,
        })
        .onOk(() => {
          useUiActionStore(this.$pinia).deleteImpact(impactId);
        });
    },
  },

  watch: {},
};
</script>
