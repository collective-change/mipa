<template>
  <q-page padding>
    <div class="text-h5">
      <!-- {{ $route.params.orgName }}'s goal: -->
      <!-- <span v-if="currentOrg">{{ currentOrg.goal }}</span> -->
    </div>
    <div class="q-pa-xs">
      <div class="row q-col-gutter-md">
        <!--
        <div class="col-12 col-md-2 print-hide">
          <q-select borderless v-model="currentModel" :options="modelOptions" label="Model" />
          <q-tree :nodes="exampleTree" node-key="label" />
        </div>
        -->
        <div class="col-12 col-md-7">
          <q-toggle v-model="useRoi" label="分析優先順序" />
          <div v-if="useRoi">
            <actions-list></actions-list>
          </div>
          <div v-else>
            <unprioritized-actions-list></unprioritized-actions-list>
          </div>

          <!-- <pre>{{ actions}}</pre> -->
        </div>
        <div class="col-12 col-md-3">
          <action-summary />
        </div>
      </div>
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
      useRoi: true
    };
  },
  computed: {
    ...mapState("actions", ["actions"]),
    ...mapState("uiAction", ["uiActionChanged"])
  },
  created() {
    (async () => {
      while (
        !firebaseAuth.currentUser // define the condition as you like
      )
        await new Promise(resolve => setTimeout(resolve, 200));

      let orgId = this.$route.params.orgId;
      this.$store.dispatch("actions/bindActions", orgId);
    })();
  },

  beforeRouteLeave(to, from, next) {
    if (this.uiActionChanged) {
      const answer = window.confirm("You have unsaved changes. Really leave?");
      if (answer) {
        next();
      } else {
        next(false);
      }
    } else next();
  },
  beforeDestroy() {
    //if the new route does not need actions, then unbind
    if (this.$route.name in ["actions", "actionDetails"]) {
      this.$store.dispatch("actions/unbindActions");
    }
  }
};
</script>
