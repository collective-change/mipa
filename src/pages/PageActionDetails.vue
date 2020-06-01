<template>
  <q-page padding>
    <div class="q-pa-xs">
      <action-summary />
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
    "action-summary": require("components/Actions/ActionSummary.vue").default
    //search: require("components/Actions/Tools/Search.vue").default,
    //sort: require("components/Actions/Tools/Sort.vue").default
  },
  data() {
    return {
      models: null
    };
  },
  computed: {
    ...mapState("actions", ["actions"])
  },
  created() {
    (async () => {
      while (
        !firebaseAuth.currentUser // define the condition as you like
      )
        await new Promise(resolve => setTimeout(resolve, 200));

      let orgId = this.$route.params.orgId;
      await this.$store.dispatch("actions/bindActions", orgId);
    })();
  },
  mounted() {
    //console.log("actionDetails");
  },
  beforeDestroy() {
    //if the new route does not need actions, then unbind
    if (this.$route.name in ["actions", "actionDetails"]) {
      this.$store.dispatch("actions/unbindActions");
    }
  }
};
</script>
