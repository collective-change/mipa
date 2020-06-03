<template>
  <q-page padding>
    <div class="text-h5">
      <span v-if="currentOrg">{{ currentOrg.name }}'s goal: </span>
      <span v-if="currentOrg">{{ currentOrg.goal }}</span>
    </div>
    <div class="q-pa-md">
      <div class="row q-col-gutter-md">
        <div class="col-12 col-md-2 print-hide">
          <q-select
            borderless
            v-model="currentModel"
            :options="modelOptions"
            label="Model"
          />
          <baseline-calculator />
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
    "baseline-calculator": require("components/Calc/BaselineCalculator.vue")
      .default,
    "dependency-graph": require("components/Model/DependencyGraph.vue").default,
    "node-summary": require("components/Model/NodeSummary.vue").default
  },
  data() {
    return {
      models: null,
      modelOptions: ["Tzu Chi", "Human-Earth system model"],
      exampleTree: [
        { label: "Goal" },
        { label: "Total cost" },
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
              children: [{ label: "child 1" }, { label: "child 2" }]
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
    ...mapState("orgs", ["currentOrg"]),
    ...mapState("model", ["currentModel"])
  },
  created() {
    (async () => {
      //console.log("waiting for currentUser to be defined");
      while (
        !firebaseAuth.currentUser // define the condition as you like
      )
        await new Promise(resolve => setTimeout(resolve, 200));
      //bind to list of models the org-user can view
      //(user is in model's owners, editors, or viewers)
      //this.$store.dispatch("orgs/bindReadableModels", this.$route.params.orgId);
      let modelId = this.$route.params.orgId;
      this.$store.dispatch("model/bindCurrentModel", modelId);
      this.$store.dispatch("model/bindNodes", modelId);
      this.$store.dispatch("calcResults/bindBaseline", modelId);

      //bind to currentModel's nodes
      //this.$store.dispatch("orgs/bindCurrentOrg", this.$route.params.orgId);
      //this.$store.dispatch("model/bindNodes", this.$route.params.orgId);
    })();
    //console.log("above code doesn't block main function stack");
  },
  mounted() {},
  beforeDestroy() {
    this.$store.dispatch("model/unbindNodes");
    this.$store.dispatch("calcResults/unbindBaseline");
  }
};
</script>
