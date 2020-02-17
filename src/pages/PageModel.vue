<template>
  <q-page padding>
    <div class="text-h5">
      {{ $route.params.teamName }}'s goal:
      <span v-if="currentTeam">{{currentTeam.goal}}</span>
    </div>
    <div class="q-pa-md">
      <div class="row q-col-gutter-md">
        <div class="col-12 col-md-2">placeholder for model bookmarks and folders</div>
        <div class="col-12 col-md-7">
          <dependency-graph></dependency-graph>
        </div>
        <div class="col-12 col-md-3">
          <node-summary />
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
    "dependency-graph": require("components/Model/DependencyGraph.vue").default,
    "node-summary": require("components/Model/NodeSummary.vue").default
  },
  data() {
    return {};
  },
  computed: {
    ...mapState("teams", ["teams", "currentTeam"])
  },
  created() {
    (async () => {
      //console.log("waiting for currentUser to be defined");
      while (
        !firebaseAuth.currentUser // define the condition as you like
      )
        await new Promise(resolve => setTimeout(resolve, 200));
      this.$store.dispatch("teams/bindCurrentTeam", this.$route.params.teamId);
      this.$store.dispatch("model/bindNodes", this.$route.params.teamId);
    })();
    //console.log("above code doesn't block main function stack");
  },
  mounted() {},
  beforeDestroy() {
    this.$store.dispatch("teams/unbindCurrentTeam");
    this.$store.dispatch("model/unbindNodes");
  }
};
</script>

