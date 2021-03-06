<template>
  <q-page>
    <div class="q-mx-sm text-h5">
      <span v-if="currentOrg">{{ currentOrg.goal }}</span>
    </div>

    <div class="row">
      <div class="col-12 col-md-2 print-hide q-pl-sm">
        <div class="column full-height">
          <div class="row">
            {{ currentModel ? currentModel.name : "" }}
            {{
              currentModel ? (currentModel.isOrgMainModel ? " (main)" : "") : ""
            }}
          </div>
          <div class="row q-ma-xs">
            <q-btn
              @click="showConfigOrgModel = true"
              class="all-pointer-events print-hide"
              color="primary"
              label="Configure model"
            />
          </div>
          <div class="row q-ma-xs">
            <calculator-ui
              calculationType="baseline"
              buttonLabel="Calculate baseline"
            />
          </div>
          <div class="row q-ma-xs">
            <export-calc-results
              data-source="baseline"
              buttonLabel="Export baseline TSV"
            />
          </div>

          <div>
            <div class="row text-h6">Node groups</div>
            <div class="q-ma-xs q-gutter-xs">
              Expand
              <q-btn label="menu tree" size="sm" @click="expandMenuTree" />
              <q-btn label="all groups" size="sm" @click="expandAllGroups" />
            </div>
            <div class="q-ma-xs q-gutter-xs">
              Collapse
              <q-btn label="menu tree" size="sm" @click="collapseMenuTree" />
              <q-btn label="all groups" size="sm" @click="collapseAllGroups" />
            </div>
          </div>
          <q-scroll-area class="col" visible>
            <q-tree
              :nodes="nodeGroupsForTree"
              node-key="id"
              ref="tree"
              label-key="name"
              selected-color="primary"
              :selected.sync="selectedNodeGroupId"
              tick-strategy="strict"
              :ticked.sync="expandedNodeGroups"
              :expanded.sync="expanded"
              no-nodes-label="To organize nodes into groups, right click on a node and select 'Start node group', then you can add more nodes to it."
            >
              <template v-slot:default-header="{ node }">
                <div class>{{ node.name }}</div>
                <div class="row items-center" @click.stop>
                  <q-icon
                    v-if="node.id == selectedNodeGroupId"
                    :name="node.icon || 'edit'"
                    class="q-mr-sm"
                    color="primary"
                    right
                  ></q-icon>
                  <q-popup-edit v-model="node.name">
                    <q-input
                      :value="node.name"
                      dense
                      autofocus
                      @change="
                        (v) => {
                          node.name = v.target.value;
                          saveNodeGroupName(node.id, v.target.value);
                        }
                      "
                    ></q-input>
                  </q-popup-edit>
                </div>
              </template>
            </q-tree>
          </q-scroll-area>
        </div>

        <!--<pre>{{nodeGroupsForTree}}</pre>
        <hr />
        <pre>{{currentModel ? currentModel.nodeGroups : 'no node groups'}}</pre>-->
        <!--<pre>selectedNodeGroup {{ selectedNodeGroup }}</pre>-->
      </div>

      <div class="col-12 col-md-7">
        <dependency-graph
          :initialCirclePositions="initialCirclePositions"
        ></dependency-graph>
      </div>
      <div class="col-12 col-md-3">
        <div class="column full-height">
          <q-scroll-area class="col q-pa-sm" visible>
            <node-summary />
          </q-scroll-area>
        </div>
      </div>
    </div>
    <q-dialog v-model="showConfigOrgModel">
      <config-org-model @close="showConfigOrgModel = false" />
    </q-dialog>
  </q-page>
</template>

<script>
import { mapGetters, mapState, mapActions } from "vuex";
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";
import idb from "src/api/idb";
//import ExportCalcResults from "../components/Calc/ExportCalcResults.vue";

const nest = (items, id = null, link = "parentId") => {
  return items
    .filter((item) => item[link] == id)
    .map((item) => ({
      ...item,
      children: nest(items, item.id),
    }));
};

export default {
  components: {
    "config-org-model": require("components/Model/Modals/ConfigOrgModel.vue")
      .default,
    "calculator-ui": require("components/Calc/CalculatorUi.vue").default,
    "export-calc-results": require("components/Calc/ExportCalcResults.vue")
      .default,
    "dependency-graph": require("components/Model/DependencyGraph.vue").default,
    "node-summary": require("components/Model/NodeSummary.vue").default,
  },

  data() {
    return {
      //dependencyGraphSavefile: null,
      showConfigOrgModel: false,
      models: null,
      //selectedNodeGroupId: null,
      expanded: [],
      initialCirclePositions: null,
    };
  },
  computed: {
    ...mapState("orgs", ["currentOrg"]),
    ...mapState("model", ["currentModel"]),
    ...mapState("ui", [
      "uiNodeChanged",
      "uiNodeChangedFields",
      //"selectedNodeGroupId",
      "selectedNodeId",
    ]),
    selectedNodeGroupId: {
      get() {
        return this.$store.state.ui.selectedNodeGroupId
          ? this.$store.state.ui.selectedNodeGroupId
          : null;
      },
      set(value) {
        this.$store.commit("ui/setSelectedNodeGroupId", value);
      },
    },
    expandedNodeGroups: {
      get() {
        return this.$store.state.ui.expandedNodeGroups
          ? this.$store.state.ui.expandedNodeGroups
          : [];
      },
      set(value) {
        this.$store.commit("ui/setExpandedNodeGroups", value);
      },
    },

    nodeGroupsForTree() {
      if (!this.currentModel || !this.currentModel.nodeGroups) return [];
      function compare(a, b) {
        if (a.name > b.name) return 1;
        if (b.name > a.name) return -1;

        return 0;
      }
      let nodeGroups = [...this.currentModel.nodeGroups];
      let nodeGroupsList = JSON.parse(JSON.stringify(nodeGroups.sort(compare)));
      return nest(nodeGroupsList);
    },
  },

  methods: {
    ...mapActions("ui", ["setSelectedNodeId"]),

    saveNodeGroupName(groupId, name) {
      let clonedNodeGroups = JSON.parse(
        JSON.stringify(this.currentModel.nodeGroups)
      );
      let nodeGroup = clonedNodeGroups.find(
        (nodeGroup) => nodeGroup.id == groupId
      );
      nodeGroup.name = name;
      //save name to model
      let payload = {
        modelId: this.currentModel.id,
        updates: { nodeGroups: clonedNodeGroups },
      };
      this.$store.dispatch("model/updateModel", payload);
    },

    expandMenuTree() {
      this.$nextTick(() => {
        this.$refs.tree.expandAll();
      });
    },

    collapseMenuTree() {
      this.$nextTick(() => {
        this.$refs.tree.collapseAll();
      });
    },

    expandAllGroups() {
      let temp = [];
      this.currentModel.nodeGroups.forEach((group) => temp.push(group.id));
      this.expandedNodeGroups = temp;
    },

    collapseAllGroups() {
      this.expandedNodeGroups = [];
    },

    async loadData() {
      //bind to list of models the org-user can view
      //(user is in model's owners, editors, or viewers)
      //this.$store.dispatch("orgs/bindReadableModels", this.$route.params.orgId);
      let modelId = this.$route.params.modelId;
      this.$store.dispatch("model/bindCurrentModel", modelId);
      this.$store.dispatch("model/bindNodes", modelId);
      this.$store.dispatch("adHocDocs/bindExchangeRates");
      this.$store.dispatch("calcResults/loadBaseline", modelId);

      let dependencyGraphSavefile = await idb.getDependencyGraphDisplay(
        modelId
      );
      //console.log('dependencyGraphSaveFile', dependencyGraphSavefile);
      //console.log('setting expandedNodeGroups:', dependencyGraphSavefile.expandedNodeGroups)
      if (dependencyGraphSavefile) {
        this.$store.commit(
          "ui/setExpandedNodeGroups",
          dependencyGraphSavefile.expandedNodeGroups
        );
        this.initialCirclePositions = dependencyGraphSavefile.circlePositions;
      } else {
        this.$store.commit("ui/setExpandedNodeGroups", []);
        this.initialCirclePositions = [];
      }
      //bind to currentModel's nodes
      //this.$store.dispatch("orgs/bindCurrentOrg", this.$route.params.orgId);
      //this.$store.dispatch("model/bindNodes", this.$route.params.orgId);
    },
  },

  created() {
    (async () => {
      //console.log("waiting for currentUser to be defined");
      while (
        !firebaseAuth.currentUser // define the condition as you like
      )
        await new Promise((resolve) => setTimeout(resolve, 200));
      this.loadData();
    })();
    //console.log("above code doesn't block main function stack");
  },
  mounted() {},

  watch: {
    "$route.params.modelId": {
      handler: function (modelId, oldModelId) {
        //if we are changing from one model to another one
        if (oldModelId) this.loadData();
      },
      immediate: true,
    },

    "$route.params.nodeId": {
      handler: function (nodeId) {
        if (this.selectedNodeId != nodeId) this.setSelectedNodeId(nodeId);
      },
      immediate: true,
    },
  },

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
          html: true,
        })
        .onOk(() => {
          next();
        });
    } else next();
  },

  beforeDestroy() {
    // don't unbind firestore refs here; leave it until org change in Layout.vue
  },
};
</script>
