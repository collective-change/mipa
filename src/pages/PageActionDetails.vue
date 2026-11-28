<template>
  <q-page padding>
    <div class="q-pa-xs">
      <action-summary v-if="currentAction" :action="currentAction" />
    </div>
  </q-page>
</template>

<script>
import { pickState } from "@/store/pinia-helpers";
import { useActionsStore } from "@/store/store-actions";
import { useUiActionStore } from "@/store/store-uiAction";
import { firebaseApp, firebaseDb, firebaseAuth } from "@/boot/firebase";
import ActionsList from "@/components/Actions/ActionsList.vue";
import UnprioritizedActionsList from "@/components/Actions/UnprioritizedActionsList.vue";
import ActionSummary from "@/components/Actions/ActionSummary.vue";

export default {
  name: "app",
  components: {
    //"no-actions": NoActions,
    //"actions-todo": ActionsTodo,
    //"actions-completed": ActionsCompleted,
    "actions-list": ActionsList,
    "unprioritized-actions-list":
      UnprioritizedActionsList,
    //"add-action": AddAction,
    "action-summary": ActionSummary,
    //search: Search,
    //sort: Sort
  },
  data() {
    return {
      models: null,
    };
  },
  computed: {
    ...pickState(useActionsStore, ["currentAction"]),
    ...pickState(useUiActionStore, ["uiActionChanged"]),
  },
  created() {},
  mounted() {},

  watch: {
    "$route.params.actionId": {
      handler: function (actionId) {
        useActionsStore(this.$pinia).bindCurrentAction(actionId);
      },
      immediate: true,
    },
  },

  beforeRouteLeave(to, from, next) {
    if (this.uiActionChanged) {
      this.$q
        .dialog({
          title: "Unsaved changes",
          message: "Any changes you made will be lost. Really leave?",
          cancel: true,
          persistent: true,
        })
        .onOk(() => {
          next();
        });
    } else next();
  },

  beforeUnmount() {
    //if the new route does not need actions, then unbind
    if (!["actionDetails"].includes(this.$route.name)) {
      useActionsStore(this.$pinia).unbindCurrentAction();
    }
  },
};
</script>
