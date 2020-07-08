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
          Expand node groups
        </div>
        <div>
          <q-tree
            :nodes="nodeGroupsForTree"
            node-key="groupId"
            selected-color="primary"
            :selected.sync="selectedNodeGroupId"
            tick-strategy="strict"
            :ticked.sync="visibilityOfNodeGroups"
            :expanded.sync="expanded"
            no-nodes-label="None available"
          >
            <template v-slot:default-header="{ node }">
              <div class="">{{ node.label }}</div>
              <div
                class="row items-center"
                @click.stop
              >
                <q-icon
                  v-if="node.groupId == selectedNodeGroupId"
                  :name="node.icon || 'edit'"
                  class="q-mr-sm"
                  color="primary"
                  right
                ></q-icon>
                <q-popup-edit v-model="node.label">
                  <q-input
                    :value="node.label"
                    dense
                    autofocus
                    @change="
                      v => {
                        node.label = v.target.value;
                        saveNodeGroupName(node.groupId, v.target.value);
                      }
                    "
                  ></q-input>
                </q-popup-edit>
              </div>
            </template>
          </q-tree>
        </div>
        <!-- <pre>selectedNodeGroupId {{ selectedNodeGroupId }}</pre>
        <pre>selectedNodeGroup {{ selectedNodeGroup }}</pre> -->
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
  data () {
    return {
      showConfigOrgModel: false,
      models: null,
      modelOptions: ["Tzu Chi", "Human-Earth system model"],
      selectedNodeGroupId: null,
      expanded: null
    };
  },
  computed: {
    ...mapState("orgs", ["currentOrg"]),
    ...mapState("model", ["currentModel"]),
    ...mapState("ui", [
      "uiNodeChanged",
      "uiNodeChangedFields",
      "selectedNodeGroup"
    ]),
    visibilityOfNodeGroups: {
      get () {
        return this.$store.state.ui.visibilityOfNodeGroups
      },
      set (value) {
        this.$store.commit('ui/setVisibilityOfNodeGroups', value)
      }
    },

    nodeGroupsForTree () {
      if (!this.currentModel || !this.currentModel.nodeGroups) return [];
      let list = JSON.parse(JSON.stringify(this.currentModel.nodeGroups)),
        map = {},
        group,
        groupToPush,
        roots = [],
        i;
      for (i = 0; i < list.length; i += 1) {
        map[list[i].id] = i; // initialize the map
        list[i].children = []; // initialize the children
      }
      for (i = 0; i < list.length; i += 1) {
        group = list[i];
        groupToPush = {
          label: group.name,
          groupId: group.id
        };
        //if (group.nodeIds) groupToPush.children = group.nodeIds;
        if (group.parentId && group.parentId !== "0") {
          // if you have dangling branches check that map[node.parentId] exists
          list[map[group.parentId]].children.push(groupToPush);
        } else {
          roots.push(groupToPush);
        }
      }
      return roots;
    }
  },

  methods: {
    saveNodeGroupName (groupId, name) {
      let clonedNodeGroups = JSON.parse(
        JSON.stringify(this.currentModel.nodeGroups)
      );
      let nodeGroup = clonedNodeGroups.find(
        nodeGroup => nodeGroup.id == groupId
      );
      nodeGroup.name = name;
      //save name to model
      let payload = {
        modelId: this.currentModel.id,
        updates: { nodeGroups: clonedNodeGroups }
      };
      this.$store.dispatch("model/updateModel", payload);
    }
  },

  watch: {
    //sync selectedNodeGroupId to ui.selectedNodeGroup
    selectedNodeGroupId () {
      if (
        this.selectedNodeGroup == null ||
        this.selectedNodeGroup.id != this.selectedNodeGroupId
      ) {
        let nodeGroup = this.currentModel.nodeGroups.find(
          nodeGroup => nodeGroup.id == this.selectedNodeGroupId
        );
        this.$store.commit("ui/setSelectedNodeGroup", nodeGroup);
      }
    },
    //sync ui.selectedNodeGroup to selectedNodeGroupId
    selectedNodeGroup () {
      if (this.selectedNodeGroup)
        this.selectedNodeGroupId = this.selectedNodeGroup.id;
      else this.selectedNodeGroupId = null;
    }
  },
  created () {
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
      this.$store.dispatch("calcResults/loadBaseline", modelId);

      //bind to currentModel's nodes
      //this.$store.dispatch("orgs/bindCurrentOrg", this.$route.params.orgId);
      //this.$store.dispatch("model/bindNodes", this.$route.params.orgId);
    })();
    //console.log("above code doesn't block main function stack");
  },
  mounted () { },

  beforeRouteLeave (to, from, next) {
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

  beforeDestroy () {
    // don't unbind firestore refs here; leave it until org change in Layout.vue
  }
};
</script>
