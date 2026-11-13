<template>
  <q-page>
    <div v-if="currentOrg && currentOrg.goal" class="q-px-md q-pt-sm text-subtitle1 text-grey-8">
      {{ currentOrg.goal }}
    </div>

    <div class="row">
      <div class="col-12 col-md-2 print-hide q-px-sm">
        <div class="column full-height">
          <div class="q-gutter-y-sm q-mt-sm">
            <calculator-ui
              calculationType="baseline"
              :buttonLabel="$t('Calculate')"
              icon="calculate"
              unelevated
              no-caps
              class="full-width"
            />
            <q-btn
              @click="showConfigOrgModel = true"
              class="full-width print-hide"
              color="primary"
              outline
              no-caps
              icon="tune"
              :label="$t('Model settings')"
            />
            <export-calc-results
              data-source="baseline"
              :buttonLabel="$t('Download results')"
              icon="download"
              flat
              no-caps
              class="full-width"
            >
            </export-calc-results>
          </div>

          <div class="row items-center q-mt-lg">
            <div class="text-subtitle1 text-weight-medium">
              {{ $t("Node groups") }}
            </div>
            <q-space />
            <q-btn flat round dense size="sm" icon="unfold_more" @click="expandMenuTree">
              <q-tooltip>{{ $t("Expand list") }}</q-tooltip>
            </q-btn>
            <q-btn flat round dense size="sm" icon="unfold_less" @click="collapseMenuTree">
              <q-tooltip>{{ $t("Collapse list") }}</q-tooltip>
            </q-btn>
            <q-btn flat round dense size="sm" icon="open_in_full" @click="expandAllGroups">
              <q-tooltip>{{ $t("Show all nodes in groups") }}</q-tooltip>
            </q-btn>
            <q-btn flat round dense size="sm" icon="close_fullscreen" @click="collapseAllGroups">
              <q-tooltip>{{ $t("Collapse all groups in the graph") }}</q-tooltip>
            </q-btn>
          </div>
          <q-scroll-area class="col" visible>
            <q-tree
              :nodes="nodeGroupsForTree"
              node-key="id"
              ref="tree"
              label-key="name"
              selected-color="primary"
              v-model:selected="selectedNodeGroupId"
              tick-strategy="strict"
              v-model:ticked="expandedNodeGroups"
              v-model:expanded="expanded"
              :no-nodes-label="$t('noNodeGroupsHint')"
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
                      :model-value="node.name"
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
        <div class="node-panel q-pa-sm">
          <node-summary />
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
import { firebaseApp, firebaseDb, firebaseAuth } from "@/boot/firebase";
import idb from "@/api/idb";
import ConfigOrgModel from "@/components/Model/Modals/ConfigOrgModel.vue";
import CalculatorUi from "@/components/Calc/CalculatorUi.vue";
import ExportCalcResults from "@/components/Calc/ExportCalcResults.vue";
import DependencyGraph from "@/components/Model/DependencyGraph.vue";
import NodeSummary from "@/components/Model/NodeSummary.vue";
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
    "config-org-model": ConfigOrgModel,
    "calculator-ui": CalculatorUi,
    "export-calc-results": ExportCalcResults,
    "dependency-graph": DependencyGraph,
    "node-summary": NodeSummary,
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

  beforeUnmount() {
    // don't unbind firestore refs here; leave it until org change in Layout.vue
  },
};
</script>

<style scoped>
/* Keeps the selected node's details in view while the graph scrolls. */
.node-panel {
  padding-right: 16px;
}
@media (min-width: 1024px) {
  .node-panel {
    position: sticky;
    top: 50px;
    max-height: calc(100vh - 60px);
    overflow-y: auto;
    overflow-x: hidden;
  }
}
</style>
