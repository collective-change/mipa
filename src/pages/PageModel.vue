<template>
  <q-page padding>
    <div class="text-h5">
      <span v-if="currentOrg">{{ currentOrg.name }}'s goal: </span>
      <span v-if="currentOrg">{{ currentOrg.goal }}</span>
    </div>

    <div class="row q-col-gutter-sm">
      <div class="col-12 col-md-2 q-gutter-sm print-hide">
        <div class="row">
          {{ currentModel ? currentModel.name : "" }}
          {{
            currentModel ? (currentModel.isOrgMainModel ? " (main)" : "") : ""
          }}
        </div>
        <div class="row">
          <q-btn
            @click="showConfigOrgModel = true"
            class="all-pointer-events print-hide"
            color="primary"
            label="Configure model"
          />
        </div>
        <div class="row">
          <calculator-ui
            calculationType="baseline"
            buttonLabel="Calculate baseline"
          />
        </div>
        <div class="row">
          <q-tree :nodes="exampleTree" node-key="label" />
        </div>
      </div>

      <div class="col-12 col-md-7">
        <dependency-graph></dependency-graph>
      </div>
      <div class="col-12 col-md-3">
        <node-summary />
      </div>
    </div>
    <q-dialog v-model="showConfigOrgModel">
      <config-org-model @close="showConfigOrgModel = false" />
    </q-dialog>
  </q-page>
</template>

<script>
import { mapGetters, mapState } from "vuex";
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";

export default {
  components: {
    "config-org-model": require("components/Model/Modals/ConfigOrgModel.vue")
      .default,
    "calculator-ui": require("components/Calc/CalculatorUi.vue").default,
    "dependency-graph": require("components/Model/DependencyGraph.vue").default,
    "node-summary": require("components/Model/NodeSummary.vue").default
  },
  data() {
    return {
      showConfigOrgModel: false,
      models: null,
      modelOptions: ["Tzu Chi", "Human-Earth system model"],
      exampleTree: [
        { label: "Goal and cost" },
        {
          label: "Chart of accounts",
          children: [
            { label: "income statement accounts" },
            { label: "balance sheet accounts" }
          ]
        },
        {
          label: "World3 (imported)",
          //icon: "public",
          //iconColor: "blue-4",
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
    ...mapState("model", ["currentModel"]),
    ...mapState("ui", ["uiNodeChanged", "uiNodeChangedFields"])
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
      this.$store.dispatch("adHocDocs/bindExchangeRates");
      this.$store.dispatch("calcResults/bindBaseline", modelId);

      //bind to currentModel's nodes
      //this.$store.dispatch("orgs/bindCurrentOrg", this.$route.params.orgId);
      //this.$store.dispatch("model/bindNodes", this.$route.params.orgId);
    })();
    //console.log("above code doesn't block main function stack");
  },
  mounted() {},

  beforeRouteLeave(to, from, next) {
    if (this.uiNodeChanged) {
      this.$q
        .dialog({
          title: "Unsaved changes",
          message:
            "<p>Changed: " +
            this.uiNodeChangedFields.join(", ") +
            "<p/><p>The changes you made will be lost. Really leave?</p>",

          cancel: true,
          persistent: true,
          html: true
        })
        .onOk(() => {
          next();
        });
    } else next();
  },

  beforeDestroy() {
    // don't unbind firestore refs here; leave it until org change in Layout.vue
  }
};
</script>
