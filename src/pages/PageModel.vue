<template>
  <q-page padding>
    <div class="text-h5">
      {{ $route.params.teamName }}'s goal:
      <span v-if="currentTeam">{{currentTeam.goal}}</span>
    </div>
    <div class="q-pa-md">
      <div class="row q-col-gutter-md">
        <div class="col-12 col-md-2">
          <q-tree :nodes="exampleTree" node-key="label" />
        </div>
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
    return {
      exampleTree: [
        {
          label: "AC usage",
          children: [{ label: "overall" }, { label: "AC efficiency" }]
        },
        {
          label: "some model shared w/ public",
          icon: "public",
          iconColor: "orange-4",
          children: [{ label: "one" }, { label: "two" }]
        },
        {
          label: "global warming",
          icon: "public",
          iconColor: "blue-4",
          children: [
            {
              label: "ESCiMO",
              //icon: "folder",
              children: [
                { label: "top level" },
                { label: "sub-model 1" },
                { label: "sub-model 2" }
              ]
            },
            {
              label: "Planetary Boundaries",
              //icon: "folder",
              //disabled: true,
              children: [{ label: "..." }, { label: "..." }]
            },
            {
              label: "17 SDGs",
              //icon: "folder",
              children: [
                { label: "overall" },
                { label: "1 No Poverty" },
                { label: "2 Zero Hunger" }
              ]
            }
          ]
        }
      ]
    };
  },
  computed: {
    ...mapState("teams", ["currentTeam"])
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

