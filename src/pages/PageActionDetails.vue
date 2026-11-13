<template>
  <q-page padding>
    <div class="q-pa-xs">
      <action-summary v-if="currentAction" :action="currentAction" />
    </div>
  </q-page>
</template>

<script>
import { mapGetters, mapState } from "vuex";
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
    ...mapState("actions", ["currentAction"]),
    ...mapState("uiAction", ["uiActionChanged"]),
  },
  created() {},
  mounted() {},

  watch: {
    "$route.params.orgId": {
      handler: function (orgId) {
        this.$store.dispatch("actions/bindActions", orgId);
      },
      immediate: true,
    },
    "$route.params.actionId": {
      handler: function (actionId) {
        this.$store.dispatch("actions/bindCurrentAction", actionId);
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
      this.$store.dispatch("actions/unbindCurrentAction");
    }
  },
};
</script>
