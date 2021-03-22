<template>
  <q-page padding>
    <div class="q-pa-xs">
      <action-summary v-if="currentAction" :action="currentAction" />
    </div>
  </q-page>
</template>

<script>
import { mapGetters, mapState } from "vuex";
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";

export default {
  name: "app",
  components: {
    //"no-actions": require("components/Actions/NoActions.vue").default,
    //"actions-todo": require("components/Actions/ActionsTodo.vue").default,
    //"actions-completed": require("components/Actions/ActionsCompleted.vue").default,
    "actions-list": require("components/Actions/ActionsList.vue").default,
    "unprioritized-actions-list": require("components/Actions/UnprioritizedActionsList.vue")
      .default,
    //"add-action": require("components/Actions/Modals/AddAction.vue").default,
    "action-summary": require("components/Actions/ActionSummary.vue").default,
    //search: require("components/Actions/Tools/Search.vue").default,
    //sort: require("components/Actions/Tools/Sort.vue").default
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
  created() {
    (async () => {
      while (
        !firebaseAuth.currentUser // define the condition as you like
      )
        await new Promise((resolve) => setTimeout(resolve, 200));

      //let orgId = this.$route.params.orgId;
      let actionId = this.$route.params.actionId;
      //await this.$store.dispatch("actions/bindActions", orgId);
      await this.$store.dispatch("actions/bindCurrentAction", actionId);
    })();
  },
  mounted() {
    //console.log("actionDetails");
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

  beforeDestroy() {
    //if the new route does not need actions, then unbind
    if (!this.$route.name in ["actionDetails"]) {
      this.$store.dispatch("actions/unbindCurrentAction");
    }
  },
};
</script>
