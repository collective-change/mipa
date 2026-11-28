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
          <actions-chart v-if="hasChartableActions"></actions-chart>
          <q-banner v-else class="bg-blue-1 q-mb-md" rounded>
            <template v-slot:avatar>
              <q-icon name="scatter_plot" color="primary" />
            </template>
            {{ $t("actionsChartHint") }}
          </q-banner>
          <actions-list :options="actionsListOptions"></actions-list>
          <!-- <pre>{{ actions}}</pre> -->
        </div>
        <div class="col-12 col-md-4">
          <action-summary v-if="selectedAction" :action="selectedAction" />
          <empty-state
            v-else
            icon="touch_app"
            icon-color="primary"
            :title="$t('noActionSelectedTitle')"
            :description="$t('noActionSelectedHint')"
          />
        </div>
      </div>
    </div>
  </q-page>
</template>

<script>
import { pickState } from "@/store/pinia-helpers";
import { useActionsStore } from "@/store/store-actions";
import { useUiStore } from "@/store/store-ui";
import { useUiActionStore } from "@/store/store-uiAction";
import { useModelStore } from "@/store/store-model";
import { firebaseApp, firebaseDb, firebaseAuth } from "@/boot/firebase";
import ActionsList from "@/components/Actions/ActionsList.vue";
import ActionsChart from "@/components/Actions/ActionsChart.vue";
import UnprioritizedActionsList from "@/components/Actions/UnprioritizedActionsList.vue";
import ActionSummary from "@/components/Actions/ActionSummary.vue";
import EmptyState from "@/components/Shared/EmptyState.vue";
import { measure } from "@/utils/measure";

export default {
  components: {
    "actions-list": ActionsList,
    "actions-chart": ActionsChart,
    "unprioritized-actions-list": UnprioritizedActionsList,
    "action-summary": ActionSummary,
    "empty-state": EmptyState,
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
    // The chart plots actions with a positive, finite leverage.
    hasChartableActions() {
      return (this.matchingActions || []).some(
        (a) => a.actionLeverage > 0 && isFinite(a.actionLeverage)
      );
    },
    ...pickState(useActionsStore, ["matchingActions"]),
    ...pickState(useUiStore, ["selectedActionId"]),
    ...pickState(useUiActionStore, ["uiActionChanged"]),
  },
  created() {
    (async () => {
      while (
        !firebaseAuth.currentUser // define the condition as you like
      )
        await new Promise((resolve) => setTimeout(resolve, 200));

      // Actions are bound with pagination / bounding by ActionsList.
      let orgId = this.$route.params.orgId;
      useModelStore(this.$pinia).bindCurrentModel(orgId);
      useModelStore(this.$pinia).bindNodes(orgId);
    })();
  },

  /*computed: {
    selectedAction: function () {
      if (this.actions) {
        let found = this.actions.find(function (action) {
          return action.id == useUiStore(this.$pinia).selectedActionId;
        });
        console.log("found", found);
        return found;
      }
    },
  },*/
  mounted() {
    this.refreshSelectedAction();
    if (typeof sessionStorage !== "undefined" && !sessionStorage.getItem("ranking_viewed")) {
      try {
        sessionStorage.setItem("ranking_viewed", "1");
      } catch {
        // sessionStorage blocked or restricted
      }
      measure("ranking_viewed");
    }
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

  beforeUnmount() {},
};
</script>
