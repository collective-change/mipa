<template>
  <q-card v-if="visible" flat bordered class="getting-started q-mx-sm q-mb-sm">
    <q-expansion-item v-model="expanded" header-class="q-py-sm">
      <template v-slot:header>
        <q-item-section avatar>
          <q-circular-progress
            :value="(doneCount / steps.length) * 100"
            size="36px"
            :thickness="0.2"
            color="primary"
            track-color="grey-3"
            show-value
            class="text-caption"
          >
            {{ doneCount }}/{{ steps.length }}
          </q-circular-progress>
        </q-item-section>
        <q-item-section>
          <q-item-label class="text-subtitle1 text-weight-medium">
            {{ allDone ? $t("gsAllDoneTitle") : $t("Getting started") }}
          </q-item-label>
          <q-item-label caption>
            {{ allDone ? $t("gsAllDoneText") : $t("gsIntro") }}
          </q-item-label>
        </q-item-section>
        <q-item-section side>
          <q-btn flat dense no-caps size="sm" :label="$t('Hide')" @click.stop="hide" />
        </q-item-section>
      </template>

      <q-list dense class="q-pb-sm">
        <q-item v-for="(step, index) in steps" :key="step.key" class="q-py-sm">
          <q-item-section avatar top>
            <q-icon
              :name="step.done ? 'check_circle' : 'radio_button_unchecked'"
              :color="step.done ? 'positive' : 'grey-5'"
              size="sm"
            />
          </q-item-section>
          <q-item-section>
            <q-item-label :class="step.done ? 'text-grey-7' : 'text-weight-medium'">
              {{ index + 1 }}. {{ $t(`gs.${step.key}.title`) }}
            </q-item-label>
            <q-item-label caption>{{ $t(`gs.${step.key}.text`) }}</q-item-label>
            <div v-if="step.key === 'closeModel'" class="q-mt-xs">
              <div
                v-if="namedLimitNames.length > 0"
                class="text-caption text-primary text-weight-medium limits-notice"
              >
                {{ $t("gs.closeModel.limitsNotice", { limits: namedLimitNames.join(", ") }) }}
              </div>
              <div v-else class="text-caption text-grey-6 limits-notice">
                {{ $t("gs.closeModel.noLimits") }}
              </div>
              <div
                v-if="unconnectedDefaultNames.length > 0"
                class="text-caption text-negative q-mt-xs unconnected-defaults"
              >
                {{ $t("gs.closeModel.unconnectedDefaults", { factors: unconnectedDefaultNames.join(", ") }) }}
              </div>
            </div>
          </q-item-section>
          <q-item-section side top>
            <calculator-ui
              v-if="step.key == 'calculate'"
              calculationType="baseline"
              :buttonLabel="$t('Calculate')"
              :outline="step.done"
              unelevated
              no-caps
              size="sm"
            />
            <q-btn
              v-else
              :outline="step.done"
              :unelevated="!step.done"
              color="primary"
              no-caps
              size="sm"
              :label="$t(`gs.${step.key}.button`)"
              @click="step.go"
            />
          </q-item-section>
        </q-item>
      </q-list>

      <div class="row items-center justify-between q-px-md q-pt-xs q-pb-sm bg-grey-1 border-top">
        <div class="row items-center q-gutter-sm">
          <div class="text-caption text-grey-7">
            {{ $t("gsStarterTemplatesPrompt") }}
          </div>
          <a
            :href="finishedExampleHref"
            class="text-primary text-caption text-weight-medium finished-example-link q-mr-sm"
            data-testid="finished-example-link"
            @click.prevent="openFinishedExample"
          >
            {{ $t("gsSeeFinishedExample") }}
          </a>
        </div>
        <div class="row q-gutter-xs">
          <q-btn
            flat
            dense
            color="primary"
            size="sm"
            no-caps
            icon="hub"
            :label="$t('templateLibraryBtn')"
            @click="$emit('open-templates')"
          />
          <q-btn
            flat
            dense
            color="grey-8"
            size="sm"
            no-caps
            icon="help_outline"
            :label="$t('guidedTourBtn')"
            @click="$emit('open-tour')"
          />
        </div>
      </div>
    </q-expansion-item>
  </q-card>
</template>

<script>
import { pickState, pickActions } from "@/store/pinia-helpers";
import { useModelStore } from "@/store/store-model";
import { useCalcResultsStore } from "@/store/store-calcResults";
import { useUiStore } from "@/store/store-ui";
import { useOrgsStore } from "@/store/store-orgs";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { firebaseDb } from "@/boot/firebase";
import CalculatorUi from "@/components/Calc/CalculatorUi.vue";
import { assessDraftLimits } from "@/utils/draftLimitCheck";
import { measure } from "@/utils/measure";

// Starter factors created with every new model (see store-model createInitialNodes).
const STARTER_FACTOR_COUNT = 7;

export default {
  components: { "calculator-ui": CalculatorUi },
  emits: ["add-factor", "open-templates", "open-tour"],
  data() {
    return {
      expanded: true,
      hidden: false,
      actionsInfo: { count: 0, calculated: false }
    };
  },
  computed: {
    ...pickState(useModelStore, ["currentModel"]),
    ...pickState(useModelStore, { nodes: "nodesList" }),
    ...pickState(useCalcResultsStore, ["baseline"]),
    orgId() {
      return this.$route.params.orgId;
    },
    modelId() {
      return this.$route.params.modelId || this.orgId;
    },
    roleNodes() {
      return (this.currentModel && this.currentModel.roleNodes) || {};
    },
    nodeById() {
      return Object.fromEntries(this.nodes.map((n) => [n.id, n]));
    },
    limitAssessment() {
      return assessDraftLimits({
        nodes: this.nodes || [],
        baseline: this.baseline,
        simulationParams: this.currentModel?.simulationParams
      });
    },
    namedLimitNames() {
      if (!this.limitAssessment?.namedLimits) return [];
      const seen = new Set();
      const names = [];
      for (const limit of this.limitAssessment.namedLimits) {
        for (const name of limit.factorNames || []) {
          if (name && !seen.has(name)) {
            seen.add(name);
            names.push(name);
          }
        }
      }
      return names;
    },
    unconnectedDefaultFactors() {
      const defaultRoleKeys = ["orgBenefit", "orgCost", "worldBenefit", "worldCost"];
      const unlinkedIds = new Set(
        (this.limitAssessment?.unlinkedFactors || []).map((f) => f.id)
      );

      return defaultRoleKeys
        .map((k) => this.nodeById[this.roleNodes[k]])
        .filter((n) => {
          if (!n) return false;
          if (unlinkedIds.has(n.id)) return true;
          const hasIn = Array.isArray(n.influencers) && n.influencers.length > 0;
          const hasOut = Array.isArray(n.influencees) && n.influencees.length > 0;
          return (!hasIn && !hasOut) || n.class === "unlinked";
        });
    },
    unconnectedDefaultNames() {
      return this.unconnectedDefaultFactors.map((n) => n.name || n.symbol || n.id);
    },
    isModelClosed() {
      const hasBalancingLoop = (this.limitAssessment?.balancingLoops || []).length > 0;
      const noUnboundedLoops = (this.limitAssessment?.unboundedReinforcingLoops || []).length === 0;
      const noUnboundedGrowth = (this.limitAssessment?.growingFactors || []).length === 0;
      const boundsGrowth = hasBalancingLoop && noUnboundedLoops && noUnboundedGrowth;
      const noUnconnectedDefaults = this.unconnectedDefaultFactors.length === 0;

      return boundsGrowth && noUnconnectedDefaults;
    },
    steps() {
      const hourly = this.nodeById[this.roleNodes.averageEffortCostPerHour];
      const calculated = !!(
        this.baseline &&
        this.baseline.modelId == this.modelId &&
        this.baseline.timeSPoints &&
        this.baseline.timeSPoints.length
      );
      const actionsRoute = {
        name: "actions",
        params: { orgNameSlug: this.$route.params.orgNameSlug, orgId: this.orgId }
      };
      return [
        {
          key: "hourlyCost",
          done: !!hourly && hourly.isNew === false,
          go: () => this.selectNode(this.roleNodes.averageEffortCostPerHour)
        },
        {
          key: "addFactors",
          done: this.nodes.length > STARTER_FACTOR_COUNT,
          go: () => this.$emit("add-factor")
        },
        {
          key: "closeModel",
          done: this.isModelClosed,
          go: () => {
            const targetNode =
              (this.unconnectedDefaultFactors[0] && this.unconnectedDefaultFactors[0].id) ||
              this.roleNodes.worldBenefit ||
              this.roleNodes.orgBenefit;
            this.selectNode(targetNode);
          }
        },
        { key: "calculate", done: calculated },
        {
          key: "addAction",
          done: this.actionsInfo.count > 0,
          go: () => this.$router.push(actionsRoute)
        },
        {
          key: "compare",
          done: this.actionsInfo.calculated,
          go: () => this.$router.push(actionsRoute)
        }
      ];
    },
    doneCount() {
      return this.steps.filter((s) => s.done).length;
    },
    allDone() {
      return this.doneCount == this.steps.length;
    },
    visible() {
      return !this.hidden && !!this.currentModel && this.currentModel.isOrgMainModel;
    },
    storageKey() {
      return `longecho.gettingStarted.hidden.${this.modelId}`;
    },
    sampleOrg() {
      const orgsStore = useOrgsStore(this.$pinia);
      const orgs = orgsStore.orgs;
      if (Array.isArray(orgs)) {
        const match = orgs.find((o) => o && o.isSample);
        if (match) return match;
      }
      const currentOrg = orgsStore.currentOrg;
      return currentOrg && currentOrg.isSample ? currentOrg : null;
    },
    finishedExampleRoute() {
      if (this.sampleOrg) {
        return {
          name: "actions",
          params: {
            orgNameSlug: this.sampleOrg.nameSlug || this.$route?.params?.orgNameSlug || "sample",
            orgId: this.sampleOrg.id || this.sampleOrg.orgId || this.orgId
          }
        };
      }
      return {
        name: "actions",
        params: {
          orgNameSlug: this.$route?.params?.orgNameSlug || "sample",
          orgId: this.orgId || "sample"
        }
      };
    },
    finishedExampleHref() {
      const { orgNameSlug, orgId } = this.finishedExampleRoute.params;
      return `/org/${orgNameSlug}/ideate/actions/${orgId}`;
    }
  },
  methods: {
    ...pickActions(useUiStore, ["setSelectedNodeId"]),
    async openFinishedExample() {
      if (this.sampleOrg) {
        this.$router.push(this.finishedExampleRoute);
        return;
      }
      const orgsStore = useOrgsStore(this.$pinia);
      if (typeof orgsStore.createSampleOrg === "function") {
        const created = await orgsStore.createSampleOrg();
        if (created && created.orgId) {
          this.$router.push({
            name: "actions",
            params: {
              orgNameSlug: created.nameSlug || "sample",
              orgId: created.orgId
            }
          });
          return;
        }
      }
      this.$router.push(this.finishedExampleRoute);
    },
    selectNode(nodeId) {
      if (nodeId) this.setSelectedNodeId(nodeId);
    },
    hide() {
      this.hidden = true;
      if (!this.allDone) {
        measure("first_run_abandon", {
          doneCount: this.doneCount,
          total: this.steps.length
        });
      }
      try {
        localStorage.setItem(this.storageKey, "1");
      } catch {
        // storage unavailable (private window); hiding lasts for this visit
      }
    },
    async loadActionsInfo() {
      if (!this.orgId) return;
      try {
        const snapshot = await getDocs(
          query(collection(firebaseDb, "actions"), where("orgId", "==", this.orgId), limit(50))
        );
        const actions = snapshot.docs.map((d) => d.data());
        this.actionsInfo = {
          count: actions.length,
          calculated: actions.some((a) => typeof a.actionLeverage == "number")
        };
      } catch (error) {
        console.warn("Getting started: could not read actions", error.message);
      }
    }
  },
  created() {
    try {
      this.hidden = localStorage.getItem(this.storageKey) == "1";
    } catch {
      this.hidden = false;
    }
    this.loadActionsInfo();
  },
  watch: {
    allDone(done) {
      if (done) this.expanded = false;
    }
  }
};
</script>

<style scoped>
.getting-started {
  background: #f7fafd;
}
</style>
