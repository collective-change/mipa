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
        <div class="col-12 col-md-8">
          <actions-chart></actions-chart>
          <actions-list :options="actionsListOptions"></actions-list>
          <!-- <pre>{{ actions}}</pre> -->
        </div>
        <div class="col-12 col-md-4">
          <action-summary v-if="selectedAction" :action="selectedAction" />
        </div>
      </div>
    </div>
  </q-page>
</template>

<script>
import { mapGetters, mapState } from "vuex";
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";

export default {
  components: {
    "actions-list": require("components/Actions/ActionsList.vue").default,
    "actions-chart": require("components/Actions/ActionsChart.vue").default,
    "unprioritized-actions-list": require("components/Actions/UnprioritizedActionsList.vue")
      .default,
    "action-summary": require("components/Actions/ActionSummary.vue").default,
  },
  data() {
    return {
      selectedAction: null,
      actionsListOptions: {
        actionStatesToSearch: [
          "initiating",
          "eligible",
          "to_approve",
          "approved",
        ],
        responsiblePersonToSearch: null,
        accountablePersonToSearch: null,
      },
    };
  },
  computed: {
    ...mapState("actions", ["matchingActions"]),
    ...mapState("ui", ["selectedActionId"]),
    ...mapState("uiAction", ["uiActionChanged"]),
  },
  created() {
    (async () => {
      while (
        !firebaseAuth.currentUser // define the condition as you like
      )
        await new Promise((resolve) => setTimeout(resolve, 200));

      let orgId = this.$route.params.orgId;
      //this.$store.dispatch("actions/bindActions", orgId);
    })();
  },

  /*computed: {
    selectedAction: function () {
      if (this.actions) {
        let found = this.actions.find(function (action) {
          return action.id == this.$store.state.ui.selectedActionId;
        });
        console.log("found", found);
        return found;
      }
    },
  },*/
  mounted() {
    this.refreshSelectedAction();
  },

  methods: {
    refreshSelectedAction() {
      let that = this;
      this.selectedAction = this.matchingActions.find(function (action) {
        return action.id == that.selectedActionId;
      });
    },
  },

  watch: {
    selectedActionId() {
      this.refreshSelectedAction();
    },
    matchingActions() {
      this.refreshSelectedAction();
    },
  },

  beforeRouteLeave(to, from, next) {
    if (this.uiActionChanged) {
      this.$q
        .dialog({
          title: "Unsaved changes",
          message: "Any changes you made will be lost. Really leave?",
          cancel: true,
          persistent: true,
        })
        .onOk(() => {
          next();
        });
    } else next();
  },

  beforeDestroy() {},
};
</script>
