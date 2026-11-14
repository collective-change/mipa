<template>
  <q-dialog
    v-model="isOpen"
    maximized
    transition-show="slide-up"
    transition-hide="slide-down"
  >
    <q-card class="column full-height bg-grey-1">
      <!-- Modal Header -->
      <q-card-section class="row items-center justify-between bg-primary text-white q-py-sm shadow-2">
        <div class="row items-center q-gutter-sm">
          <q-icon name="all_inclusive" size="md" />
          <div>
            <div class="text-h6 text-weight-bold">{{ $t("systemDynamicsModalTitle") }}</div>
            <div class="text-caption text-blue-1">{{ $t("systemDynamicsModalSubtitle") }}</div>
          </div>
        </div>

        <div class="row items-center q-gutter-sm">
          <q-btn icon="close" flat round dense v-close-popup />
        </div>
      </q-card-section>

      <!-- Tabs Navigation -->
      <q-card-section class="bg-white q-pa-none border-bottom">
        <q-tabs
          v-model="activeTab"
          dense
          class="text-grey-7"
          active-color="primary"
          indicator-color="primary"
          align="left"
        >
          <q-tab name="loops" icon="cached" :label="$t('feedbackLoopsTab')" no-caps />
          <q-tab name="archetypes" icon="auto_graph" :label="$t('systemArchetypesTab')" no-caps />
          <q-tab name="meadows" icon="stairs" :label="$t('meadowsHierarchyTab')" no-caps />
        </q-tabs>
      </q-card-section>

      <!-- Main Body -->
      <q-card-section class="col scroll q-pa-md">
        <!-- TAB 1: Feedback Loops (R & B) -->
        <div v-if="activeTab === 'loops'">
          <!-- Empty State -->
          <div v-if="!loops.length" class="text-center q-pa-xl">
            <q-icon name="all_inclusive" size="4rem" color="grey-5" />
            <div class="text-h6 text-grey-8 q-mt-md">{{ $t("noLoopsDetectedTitle") }}</div>
            <div class="text-body2 text-grey-6 q-mt-xs">{{ $t("noLoopsDetectedSubtitle") }}</div>
          </div>

          <!-- Loop Cards Grid -->
          <div v-else class="row q-col-gutter-md">
            <!-- Reinforcing Loops Column -->
            <div class="col-12 col-md-6">
              <div class="row items-center q-mb-sm">
                <q-badge color="positive" class="q-mr-xs text-weight-bold">
                  {{ reinforcingLoops.length }}
                </q-badge>
                <span class="text-subtitle1 text-weight-bold text-grey-9">
                  {{ $t("reinforcingLoopLabel") }}
                </span>
              </div>

              <div v-if="!reinforcingLoops.length" class="text-caption text-grey-6 q-pa-md bg-white rounded-borders border">
                No reinforcing loops detected.
              </div>

              <div v-else class="q-gutter-y-sm">
                <q-card
                  v-for="loop in reinforcingLoops"
                  :key="loop.id"
                  flat
                  bordered
                  class="bg-white shadow-1 rounded-borders"
                >
                  <q-card-section class="q-pb-xs">
                    <div class="row items-center justify-between">
                      <div class="text-weight-bold text-positive text-subtitle2">
                        {{ loop.code }} (Reinforcing Loop)
                      </div>
                      <div class="row items-center q-gutter-xs">
                        <q-chip v-if="loop.hasDelay" dense size="sm" color="amber-2" text-color="amber-10" icon="hourglass_empty">
                          {{ $t("hasDelayBadge") }}
                        </q-chip>
                        <q-badge color="green-1" text-color="positive">
                          {{ loop.length }} {{ $t("loopLengthLabel") }}
                        </q-badge>
                      </div>
                    </div>

                    <div class="text-body2 text-grey-9 q-mt-xs font-mono text-weight-medium">
                      {{ loop.name }}
                    </div>
                  </q-card-section>

                  <q-card-section class="q-pt-none text-caption text-grey-7">
                    {{ loop.description }}
                  </q-card-section>
                </q-card>
              </div>
            </div>

            <!-- Balancing Loops Column -->
            <div class="col-12 col-md-6">
              <div class="row items-center q-mb-sm">
                <q-badge color="primary" class="q-mr-xs text-weight-bold">
                  {{ balancingLoops.length }}
                </q-badge>
                <span class="text-subtitle1 text-weight-bold text-grey-9">
                  {{ $t("balancingLoopLabel") }}
                </span>
              </div>

              <div v-if="!balancingLoops.length" class="text-caption text-grey-6 q-pa-md bg-white rounded-borders border">
                No balancing loops detected.
              </div>

              <div v-else class="q-gutter-y-sm">
                <q-card
                  v-for="loop in balancingLoops"
                  :key="loop.id"
                  flat
                  bordered
                  class="bg-white shadow-1 rounded-borders"
                >
                  <q-card-section class="q-pb-xs">
                    <div class="row items-center justify-between">
                      <div class="text-weight-bold text-primary text-subtitle2">
                        {{ loop.code }} (Balancing Loop)
                      </div>
                      <div class="row items-center q-gutter-xs">
                        <q-chip v-if="loop.hasDelay" dense size="sm" color="amber-2" text-color="amber-10" icon="hourglass_empty">
                          {{ $t("hasDelayBadge") }}
                        </q-chip>
                        <q-badge color="blue-1" text-color="primary">
                          {{ loop.length }} {{ $t("loopLengthLabel") }}
                        </q-badge>
                      </div>
                    </div>

                    <div class="text-body2 text-grey-9 q-mt-xs font-mono text-weight-medium">
                      {{ loop.name }}
                    </div>
                  </q-card-section>

                  <q-card-section class="q-pt-none text-caption text-grey-7">
                    {{ loop.description }}
                  </q-card-section>
                </q-card>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 2: System Archetypes -->
        <div v-else-if="activeTab === 'archetypes'">
          <div v-if="!archetypes.length" class="text-center q-pa-xl text-grey-6">
            <q-icon name="psychology" size="3.5rem" color="grey-4" />
            <div class="text-h6 text-grey-8 q-mt-md">No systemic pathologies detected.</div>
            <div class="text-body2 text-grey-6">The factor network does not exhibit coupled archetype tensions.</div>
          </div>

          <div v-else class="q-gutter-y-md">
            <q-card
              v-for="arch in archetypes"
              :key="arch.id"
              flat
              bordered
              class="bg-white shadow-1 rounded-borders"
            >
              <q-card-section>
                <div class="row items-center justify-between q-mb-xs">
                  <div class="text-h6 text-weight-bold text-grey-9">
                    {{ arch.name }}
                  </div>
                  <q-badge color="purple-1" text-color="purple-9" class="text-weight-bold">
                    {{ $t("meadowsLevelBadge") }} {{ arch.meadowsLevel }}
                  </q-badge>
                </div>

                <div class="text-body2 text-grey-8 q-mb-md">
                  {{ arch.description }}
                </div>

                <div class="bg-blue-1 text-blue-10 q-pa-md rounded-borders border-primary">
                  <div class="text-subtitle2 text-weight-bold row items-center q-mb-xs">
                    <q-icon name="lightbulb" class="q-mr-xs" color="primary" />
                    {{ $t("strategicRecommendationTitle") }}
                  </div>
                  <div class="text-body2">
                    {{ arch.recommendation }}
                  </div>
                </div>
              </q-card-section>
            </q-card>
          </div>
        </div>

        <!-- TAB 3: Meadows Leverage Hierarchy -->
        <div v-else class="meadows-container">
          <q-card flat bordered class="bg-white q-mb-md">
            <q-card-section>
              <div class="text-subtitle1 text-weight-bold text-primary q-mb-xs">
                Donella Meadows' 12 Places to Intervene in a System
              </div>
              <div class="text-body2 text-grey-7">
                Interventions ranked from lowest leverage (parameters, budgets) to highest leverage (mindset, paradigms).
              </div>
            </q-card-section>
          </q-card>

          <q-table
            flat
            bordered
            dense
            :rows="meadowsLevels"
            :columns="meadowsColumns"
            row-key="level"
            hide-pagination
            :pagination="{ rowsPerPage: 0 }"
            class="bg-white"
          >
            <template v-slot:body-cell-power="props">
              <q-td :props="props">
                <q-chip
                  dense
                  size="sm"
                  :color="getPowerColor(props.value)"
                  :text-color="getPowerTextColor(props.value)"
                >
                  {{ formatPowerBadge(props.value) }}
                </q-chip>
              </q-td>
            </template>
          </q-table>
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script>
import {
  detectFeedbackLoops,
  detectSystemArchetypes,
  MEADOWS_LEVERAGE_HIERARCHY
} from "@/utils/systemDynamics";

export default {
  name: "SystemDynamicsModal",
  props: {
    modelValue: {
      type: Boolean,
      default: false
    },
    nodes: {
      type: Array,
      default: () => []
    },
    model: {
      type: Object,
      default: () => ({})
    }
  },
  emits: ["update:modelValue"],
  data() {
    return {
      activeTab: "loops",
      meadowsLevels: MEADOWS_LEVERAGE_HIERARCHY
    };
  },
  computed: {
    isOpen: {
      get() {
        return this.modelValue;
      },
      set(val) {
        this.$emit("update:modelValue", val);
      }
    },
    loops() {
      return detectFeedbackLoops(this.nodes);
    },
    reinforcingLoops() {
      return this.loops.filter((l) => l.type === "reinforcing");
    },
    balancingLoops() {
      return this.loops.filter((l) => l.type === "balancing");
    },
    archetypes() {
      return detectSystemArchetypes(this.nodes, this.loops);
    },
    meadowsColumns() {
      return [
        { name: "level", label: "#", field: "level", align: "center", sortable: true },
        { name: "name", label: "Leverage Point", field: "name", align: "left" },
        { name: "power", label: "Leverage Power", field: "power", align: "center" },
        { name: "example", label: "Example & Strategic Role", field: "example", align: "left" }
      ];
    }
  },
  methods: {
    formatPowerBadge(power) {
      if (power === "transformative") return this.$t("leveragePowerTransformative");
      if (power === "very_high" || power === "high") return this.$t("leveragePowerHigh");
      if (power === "medium") return this.$t("leveragePowerMedium");
      return this.$t("leveragePowerLow");
    },
    getPowerColor(power) {
      if (power === "transformative") return "purple-1";
      if (power === "very_high" || power === "high") return "green-1";
      if (power === "medium") return "blue-1";
      return "grey-2";
    },
    getPowerTextColor(power) {
      if (power === "transformative") return "purple-9";
      if (power === "very_high" || power === "high") return "positive";
      if (power === "medium") return "primary";
      return "grey-8";
    }
  }
};
</script>

<style scoped>
.font-mono {
  font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.9rem;
}
</style>
