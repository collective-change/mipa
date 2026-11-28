<template>
  <q-page>
    <!-- Loading State -->
    <div
      v-if="modelLoading"
      class="row justify-center items-center q-pa-xl text-center"
      style="min-height: 400px;"
    >
      <q-spinner color="primary" size="3em" />
    </div>

    <!-- No Access State (MIPA-51) -->
    <div
      v-else-if="!hasAccess"
      class="row justify-center items-center q-pa-xl text-center"
      style="min-height: 400px;"
      data-testid="no-model-access"
    >
      <div class="col-12 col-sm-8 col-md-6">
        <q-icon name="lock" size="64px" color="grey-6" class="q-mb-md" />
        <div class="text-h5 text-weight-bold q-mb-sm text-grey-9">
          {{ $t("noModelAccessTitle") }}
        </div>
        <div class="text-body1 text-grey-7 q-mb-lg">
          {{ $t("noModelAccessDesc") }}
        </div>
        <q-btn
          unelevated
          no-caps
          color="primary"
          icon="arrow_back"
          :label="$t('backToOrgs')"
          :to="{ name: 'orgs' }"
        />
      </div>
    </div>

    <!-- Accessible Model View -->
    <template v-else>
      <div v-if="currentOrg && currentOrg.goal" class="q-px-md q-pt-sm text-subtitle1 text-grey-8">
        {{ currentOrg.goal }}
      </div>
      <q-banner
        v-if="isReadOnly"
        dense
        rounded
        class="bg-blue-1 text-primary q-mx-sm q-mb-sm print-hide"
      >
        <template v-slot:avatar>
          <q-icon name="visibility" color="primary" />
        </template>
        <div class="text-body2 text-weight-medium">
          {{ $t("stakeholderViewerNotice") }}
        </div>
      </q-banner>

    <getting-started
      v-if="!isReadOnly"
      class="q-mt-sm print-hide"
      @add-factor="showAddNode = true"
      @open-templates="showTemplateLibrary = true"
      @open-tour="showOnboardingTour = true"
    />
    <q-banner
      v-if="showDraftInvite && !isReadOnly"
      rounded
      class="bg-blue-1 q-mx-sm q-mb-sm print-hide"
    >
      <template v-slot:avatar>
        <q-icon name="auto_awesome" color="primary" />
      </template>
      <div class="text-body1">{{ $t("aiInviteTitle") }}</div>
      <div class="text-body2 text-grey-8">{{ $t("aiInviteText") }}</div>
      <template v-slot:action>
        <q-btn unelevated no-caps color="primary" :label="$t('Draft with AI')" @click="showDraftModel = true" />
      </template>
    </q-banner>

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
              v-if="!isReadOnly"
              @click="showConfigOrgModel = true"
              class="full-width print-hide"
              color="primary"
              outline
              no-caps
              icon="tune"
              :label="$t('Model settings')"
            />
            <q-btn
              v-if="!isReadOnly"
              @click="showDraftModel = true"
              class="full-width print-hide"
              color="primary"
              outline
              no-caps
              icon="auto_awesome"
              :label="$t('Draft with AI')"
            />
            <q-btn
              v-if="!isReadOnly"
              @click="showIngestData = true"
              class="full-width print-hide"
              color="primary"
              outline
              no-caps
              icon="cloud_upload"
              :label="$t('ingestDataBtn')"
            />
            <q-btn
              @click="showCustomVariables = true"
              class="full-width print-hide"
              color="primary"
              outline
              no-caps
              icon="data_object"
              :label="$t('customVariablesBtn')"
            />
            <q-btn
              @click="showModelSnapshots = true"
              class="full-width print-hide"
              color="primary"
              outline
              no-caps
              icon="history_edu"
              :label="$t('modelSnapshotsBtn')"
            />
            <q-btn
              @click="showSystemDynamics = true"
              class="full-width print-hide"
              color="primary"
              outline
              no-caps
              icon="all_inclusive"
              :label="$t('systemDynamicsBtn')"
            />
            <q-btn
              @click="showTemplateLibrary = true"
              class="full-width print-hide"
              color="primary"
              outline
              no-caps
              icon="hub"
              :label="$t('templateLibraryBtn')"
            />
            <q-btn
              v-if="!isReadOnly"
              @click="confirmImportCountryModel"
              class="full-width print-hide"
              color="teal-8"
              outline
              no-caps
              icon="public"
              :label="$t('importCountryModelBtn')"
            />
            <q-btn
              @click="showOnboardingTour = true"
              class="full-width print-hide"
              color="grey-8"
              flat
              no-caps
              icon="help_outline"
              :label="$t('guidedTourBtn')"
            />
            <q-btn
              v-if="latestAiDraft && !isReadOnly"
              @click="confirmRemoveDraft"
              class="full-width print-hide"
              color="grey-8"
              flat
              no-caps
              icon="undo"
              :label="$t('Remove AI draft')"
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
        <div
          v-if="hasMoreNodesToLoad"
          class="row items-center justify-between q-pa-sm bg-blue-1 text-primary rounded-borders q-mx-sm q-mb-sm print-hide"
        >
          <div class="row items-center text-caption text-weight-medium">
            <q-icon name="info" class="q-mr-xs" size="16px" />
            {{ $t("showingBoundedFactors", { loaded: nodes.length, total: nodesTotalCount }) }}
          </div>
          <div class="row q-gutter-xs">
            <q-btn
              size="sm"
              unelevated
              color="primary"
              no-caps
              :label="$t('loadMoreFactorsButton', { count: 50 })"
              @click="loadMoreNodes"
            />
            <q-btn
              size="sm"
              outline
              color="primary"
              no-caps
              :label="$t('loadAllFactorsButton')"
              @click="loadAllNodes"
            />
          </div>
        </div>
        <dependency-graph
          :initialCirclePositions="initialCirclePositions"
          :readOnly="isReadOnly"
        ></dependency-graph>
      </div>
      <div class="col-12 col-md-3">
        <div class="node-panel q-pa-sm">
          <node-summary :readOnly="isReadOnly" />
        </div>
      </div>
    </div>
    <q-dialog v-model="showAddNode">
      <add-node newNodeRole="" @close="showAddNode = false" />
    </q-dialog>
    <q-dialog v-model="showDraftModel" persistent>
      <draft-model-dialog @accepted="onDraftAccepted" />
    </q-dialog>
    <q-dialog v-model="showConfigOrgModel">
      <config-org-model @close="showConfigOrgModel = false" />
    </q-dialog>
    <ingest-data-dialog v-model="showIngestData" />
    <custom-variables-modal
      v-model="showCustomVariables"
      :model="currentModel"
      :read-only="isReadOnly"
    />
    <model-snapshots-modal
      v-model="showModelSnapshots"
      :model="currentModel"
      :nodes="nodes"
    />
    <system-dynamics-modal
      v-model="showSystemDynamics"
      :model="currentModel"
      :nodes="nodes"
    />
    <model-template-library-modal
      v-model="showTemplateLibrary"
      :model="currentModel"
      :nodes="nodes"
      :actions="actions"
    />
    <onboarding-tour-modal
      v-model="showOnboardingTour"
      @open-templates="showTemplateLibrary = true"
    />
    </template>
  </q-page>
</template>

<script>
import { pickState, pickActions } from "@/store/pinia-helpers";
import { useModelStore } from "@/store/store-model";
import { useOrgsStore } from "@/store/store-orgs";
import { useActionsStore } from "@/store/store-actions";
import { useUiStore } from "@/store/store-ui";
import { useCalculatorStore } from "@/store/store-calculator";
import { useAdHocDocsStore } from "@/store/store-adHocDocs";
import { useCalcResultsStore } from "@/store/store-calcResults";
import { firebaseApp, firebaseDb, firebaseAuth } from "@/boot/firebase";
import idb from "@/api/idb";
import ConfigOrgModel from "@/components/Model/Modals/ConfigOrgModel.vue";
import CalculatorUi from "@/components/Calc/CalculatorUi.vue";
import ExportCalcResults from "@/components/Calc/ExportCalcResults.vue";
import DependencyGraph from "@/components/Model/DependencyGraph.vue";
import NodeSummary from "@/components/Model/NodeSummary.vue";
import GettingStarted from "@/components/Model/GettingStarted.vue";
import AddNode from "@/components/Model/Modals/AddNode.vue";
import DraftModelDialog from "@/components/Model/Modals/DraftModelDialog.vue";
import IngestDataDialog from "@/components/Model/Modals/IngestDataDialog.vue";
import ModelSnapshotsModal from "@/components/Model/Modals/ModelSnapshotsModal.vue";
import SystemDynamicsModal from "@/components/Model/Modals/SystemDynamicsModal.vue";
import ModelTemplateLibraryModal from "@/components/Model/Modals/ModelTemplateLibraryModal.vue";
import OnboardingTourModal from "@/components/Model/Modals/OnboardingTourModal.vue";
import CustomVariablesModal from "@/components/Model/Modals/CustomVariablesModal.vue";
import { planDraftRemoval, removeDraft } from "@/utils/util-aiDraft";
import { showErrorMessage } from "@/utils/util-show-error-message";
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
    "getting-started": GettingStarted,
    "add-node": AddNode,
    "draft-model-dialog": DraftModelDialog,
    "ingest-data-dialog": IngestDataDialog,
    "model-snapshots-modal": ModelSnapshotsModal,
    "system-dynamics-modal": SystemDynamicsModal,
    "model-template-library-modal": ModelTemplateLibraryModal,
    "onboarding-tour-modal": OnboardingTourModal,
    "custom-variables-modal": CustomVariablesModal,
    "calculator-ui": CalculatorUi,
    "export-calc-results": ExportCalcResults,
    "dependency-graph": DependencyGraph,
    "node-summary": NodeSummary,
  },

  data() {
    return {
      //dependencyGraphSavefile: null,
      modelLoading: true,
      showConfigOrgModel: false,
      showAddNode: false,
      showDraftModel: false,
      showIngestData: false,
      showModelSnapshots: false,
      showSystemDynamics: false,
      showTemplateLibrary: false,
      showOnboardingTour: false,
      showCustomVariables: false,
      models: null,
      //selectedNodeGroupId: null,
      expanded: [],
      initialCirclePositions: null,
      nodesLimit: 50,
    };
  },
  computed: {
    ...pickState(useModelStore, { nodes: "nodesList", nodesTotalCount: "nodesTotalCount" }),
    hasAccess() {
      if (!this.currentModel) return false;
      return (
        this.currentModel.isPublic === true ||
        this.isEditor ||
        this.isViewer
      );
    },
    hasMoreNodesToLoad() {
      return (
        typeof this.nodesTotalCount === "number" &&
        this.nodesTotalCount > this.nodes.length
      );
    },
    // Offer AI drafting while the model has only its starter factors.
    showDraftInvite() {
      return (
        !!this.currentModel &&
        this.currentModel.isOrgMainModel &&
        this.nodes.length > 0 &&
        this.nodes.length <= 7 &&
        !(this.currentModel.appliedAiDrafts || []).length
      );
    },
    latestAiDraft() {
      const drafts = (this.currentModel && this.currentModel.appliedAiDrafts) || [];
      return drafts.length ? drafts[drafts.length - 1] : null;
    },
    isEditor() {
      const uid = firebaseAuth.currentUser?.uid;
      if (!uid || !this.currentModel) return false;
      const editors = this.currentModel.editors?.users || [];
      const owners = this.currentModel.owners?.users || [];
      return editors.includes(uid) || owners.includes(uid);
    },
    isViewer() {
      const user = firebaseAuth.currentUser;
      if (!user || !this.currentModel) return false;
      if (this.isEditor) return false;

      // 1. Direct user UID or email viewer
      const viewerUsers = this.currentModel.viewers?.users || [];
      const viewerEmails = (this.currentModel.viewers?.emails || []).map((e) =>
        e.toLowerCase()
      );
      if (
        viewerUsers.includes(user.uid) ||
        (user.email && viewerEmails.includes(user.email.toLowerCase()))
      ) {
        return true;
      }

      // 2. Org-level viewer (viewers.org can be an array of org IDs or a single org ID)
      const rawOrgs = this.currentModel.viewers?.org;
      const viewerOrgs = Array.isArray(rawOrgs)
        ? rawOrgs
        : typeof rawOrgs === "string"
        ? [rawOrgs]
        : [];

      if (viewerOrgs.length > 0) {
        // Check currentOrg
        if (
          this.currentOrg &&
          viewerOrgs.includes(this.currentOrg.id) &&
          Array.isArray(this.currentOrg.users) &&
          this.currentOrg.users.includes(user.uid)
        ) {
          return true;
        }

        // Check route params orgId
        const routeOrgId = this.$route?.params?.orgId;
        if (
          routeOrgId &&
          viewerOrgs.includes(routeOrgId) &&
          this.currentOrg &&
          this.currentOrg.id === routeOrgId &&
          Array.isArray(this.currentOrg.users) &&
          this.currentOrg.users.includes(user.uid)
        ) {
          return true;
        }

        // Check user's orgs list in store
        const userOrgs = useOrgsStore(this.$pinia).orgs || [];
        if (Array.isArray(userOrgs) && userOrgs.some((o) => viewerOrgs.includes(o.id))) {
          return true;
        }
      }

      return false;
    },
    isReadOnly() {
      return this.hasAccess && !this.isEditor;
    },
    ...pickState(useOrgsStore, ["currentOrg"]),
    ...pickState(useModelStore, ["currentModel"]),
    ...pickState(useActionsStore, ["actions"]),
    ...pickState(useUiStore, [
      "uiNodeChanged",
      "uiNodeChangedFields",
      //"selectedNodeGroupId",
      "selectedNodeId",
    ]),
    selectedNodeGroupId: {
      get() {
        const ui = useUiStore(this.$pinia);
        return ui.selectedNodeGroupId
          ? ui.selectedNodeGroupId
          : null;
      },
      set(value) {
        useUiStore(this.$pinia).setSelectedNodeGroupId(value);
      },
    },
    expandedNodeGroups: {
      get() {
        const ui = useUiStore(this.$pinia);
        return ui.expandedNodeGroups
          ? ui.expandedNodeGroups
          : [];
      },
      set(value) {
        useUiStore(this.$pinia).setExpandedNodeGroups(value);
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
    onDraftAccepted() {
      this.showDraftModel = false;
      // Calculate once the new factors have arrived.
      setTimeout(() => {
        useCalculatorStore(this.$pinia).calculate({
          calculationType: "baseline",
          orgId: this.$route.params.orgId,
          modelId: this.$route.params.modelId || this.$route.params.orgId,
          nodes: this.nodes,
          exchangeRates: useAdHocDocsStore(this.$pinia).exchangeRates,
          simulationParams: this.currentModel.simulationParams,
          roleNodes: this.currentModel.roleNodes,
          customVariables: this.currentModel?.customVariables || null,
        });
      }, 1500);
    },
    confirmRemoveDraft() {
      const draft = this.latestAiDraft;
      const plan = planDraftRemoval(this.nodes, draft.draftId);
      let message = this.$t("aiRemoveConfirm", { count: plan.deletes.length });
      if (plan.conflicts.length)
        message += "\n\n" + this.$t("aiRemoveConflicts", { names: plan.conflicts.join(", ") });
      if (plan.kept.length)
        message += "\n\n" + this.$t("aiRemoveKept", { names: plan.kept.join(", ") });
      this.$q
        .dialog({ title: this.$t("Remove AI draft"), message, cancel: true, persistent: true, style: "white-space: pre-line" })
        .onOk(async () => {
          try {
            await removeDraft({ model: this.currentModel, nodes: this.nodes, draftId: draft.draftId });
            this.$q.notify(this.$t("aiDraftRemoved"));
          } catch (error) {
            showErrorMessage(this.$t("Remove AI draft"), error.message);
          }
        });
    },
    ...pickActions(useUiStore, ["setSelectedNodeId"]),
    ...pickActions(useModelStore, ["importCountryModel"]),

    async confirmImportCountryModel() {
      const modelId = this.currentModel?.id || this.$route.params.modelId;
      if (!modelId) return;
      this.$q
        .dialog({
          title: this.$t("importCountryModelBtn"),
          message: this.$t("importCountryModelConfirmPrompt"),
          cancel: true,
          persistent: true
        })
        .onOk(async () => {
          try {
            await this.importCountryModel({ modelId, countryCode: "USA" });
          } catch (err) {
            showErrorMessage(this.$t("importCountryModelBtn"), err.message);
          }
        });
    },

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
      useModelStore(this.$pinia).updateModel(payload);
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

    loadMoreNodes() {
      this.nodesLimit += 50;
      this.dispatchBindNodes();
    },

    loadAllNodes() {
      if (this.nodesTotalCount) {
        this.nodesLimit = this.nodesTotalCount;
      } else {
        this.nodesLimit += 100;
      }
      this.dispatchBindNodes();
    },

    dispatchBindNodes() {
      const modelId = this.$route.params.modelId;
      if (modelId) {
        useModelStore(this.$pinia).bindNodes({
          modelId,
          limit: this.nodesLimit
        });
      }
    },

    async loadData() {
      const modelId = this.$route.params.modelId;
      const orgId = this.$route.params.orgId;
      this.modelLoading = true;
      try {
        if (orgId && (!this.currentOrg || this.currentOrg.id !== orgId)) {
          await Promise.resolve(useOrgsStore(this.$pinia).bindCurrentOrg(orgId)).catch(() => {});
        }
        await useModelStore(this.$pinia).bindCurrentModel(modelId);
      } catch (err) {
        console.warn("bindCurrentModel failed:", err);
      } finally {
        this.modelLoading = false;
      }

      if (this.hasAccess) {
        useModelStore(this.$pinia).bindNodes({
          modelId,
          limit: this.nodesLimit
        });
        useAdHocDocsStore(this.$pinia).bindExchangeRates();
        useCalcResultsStore(this.$pinia).loadBaseline(modelId);

        let dependencyGraphSavefile = await idb.getDependencyGraphDisplay(
          modelId
        );
        if (dependencyGraphSavefile) {
          useUiStore(this.$pinia).setExpandedNodeGroups(
            dependencyGraphSavefile.expandedNodeGroups
          );
          this.initialCirclePositions = dependencyGraphSavefile.circlePositions;
        } else {
          useUiStore(this.$pinia).setExpandedNodeGroups([]);
          this.initialCirclePositions = [];
        }
      }
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
        if (oldModelId) {
          this.nodesLimit = 50;
          this.loadData();
        }
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
