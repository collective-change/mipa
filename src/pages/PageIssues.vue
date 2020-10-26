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
            <issues-list></issues-list>
          </div>
          <div v-else>
            <unprioritized-issues-list></unprioritized-issues-list>
          </div>
          <!-- <pre>{{ issues}}</pre> -->
        </div>
        <div class="col-12 col-md-3">
          <issue-summary />
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
    //"no-issues": require("components/Issues/NoIssues.vue").default,
    //"issues-todo": require("components/Issues/IssuesTodo.vue").default,
    //"issues-completed": require("components/Issues/IssuesCompleted.vue").default,
    "issues-list": require("components/Issues/IssuesList.vue").default,
    "unprioritized-issues-list": require("components/Issues/UnprioritizedIssuesList.vue")
      .default,
    //"add-issue": require("components/Issues/Modals/AddIssue.vue").default,
    "issue-summary": require("components/Issues/IssueSummary.vue").default,
    //search: require("components/Issues/Tools/Search.vue").default,
    //sort: require("components/Issues/Tools/Sort.vue").default
  },
  data() {
    return {
      useRoi: true,
    };
  },
  computed: {
    ...mapState("issues", ["issues"]),
  },
  created() {
    (async () => {
      while (
        !firebaseAuth.currentUser // define the condition as you like
      )
        await new Promise((resolve) => setTimeout(resolve, 200));

      let orgId = this.$route.params.orgId;
      this.$store.dispatch("issues/bindIssues", orgId);
    })();
  },
  mounted() {},
  beforeDestroy() {
    //if the new route does not need issues, then unbind
    if (this.$route.name in ["issues", "issueDetails"]) {
      this.$store.dispatch("issues/unbindIssues");
    }
  },
};
</script>
