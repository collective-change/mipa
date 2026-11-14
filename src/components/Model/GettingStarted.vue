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
        <div class="text-caption text-grey-7">
          {{ $t("gsStarterTemplatesPrompt") }}
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
import { mapState, mapGetters, mapActions } from "vuex";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { firebaseDb } from "@/boot/firebase";
import CalculatorUi from "@/components/Calc/CalculatorUi.vue";

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
    ...mapState("model", ["currentModel"]),
    ...mapGetters("model", ["nodes"]),
    ...mapState("calcResults", ["baseline"]),
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
    steps() {
      const hourly = this.nodeById[this.roleNodes.averageEffortCostPerHour];
      const linked = ["orgBenefit", "orgCost", "worldBenefit", "worldCost"].some(
        (role) => {
          const node = this.nodeById[this.roleNodes[role]];
          return node && node.influencers && node.influencers.length > 0;
        }
      );
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
          key: "linkFactors",
          done: linked,
          go: () => this.selectNode(this.roleNodes.worldBenefit || this.roleNodes.orgBenefit)
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
      return `mipa.gettingStarted.hidden.${this.modelId}`;
    }
  },
  methods: {
    ...mapActions("ui", ["setSelectedNodeId"]),
    selectNode(nodeId) {
      if (nodeId) this.setSelectedNodeId(nodeId);
    },
    hide() {
      this.hidden = true;
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
