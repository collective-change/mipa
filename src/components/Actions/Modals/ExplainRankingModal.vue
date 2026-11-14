<template>
  <q-dialog v-model="isOpen" persistent>
    <q-card style="min-width: 680px; max-width: 900px; width: 100%">
      <q-card-section class="row items-center q-pb-none bg-primary text-white">
        <div class="row items-center q-gutter-sm">
          <q-icon name="psychology" size="sm" />
          <div class="text-h6">{{ $t("explainRankingTitle") }}</div>
        </div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section class="q-pt-md" v-if="actionA && actionB">
        <!-- Comparison Header Chips -->
        <div class="row items-center justify-between q-pa-sm bg-blue-1 rounded-borders q-mb-sm">
          <div class="col-12 col-sm-5 text-center">
            <div class="text-caption text-grey-8">{{ $t("targetAction") }}</div>
            <div class="text-subtitle1 text-weight-bold text-primary">{{ actionA.title }}</div>
            <div class="row justify-center q-gutter-xs q-mt-xs">
              <q-chip dense color="primary" text-color="white" icon="trending_up">
                {{ $t("Leverage") }}: {{ formatRatio(actionA.actionLeverage) }}
              </q-chip>
              <q-chip dense outline color="primary">
                ROI: {{ formatRatio(actionA.totalRoi) }}
              </q-chip>
            </div>
          </div>

          <div class="col-12 col-sm-2 text-center text-weight-bold text-grey-7 q-my-sm">
            <q-icon name="compare_arrows" size="md" color="primary" />
            <div class="text-caption">vs</div>
          </div>

          <div class="col-12 col-sm-5 text-center">
            <div class="text-caption text-grey-8">{{ $t("comparisonAction") }}</div>
            <q-select
              dense
              outlined
              v-model="selectedComparisonId"
              :options="comparisonOptions"
              emit-value
              map-options
              class="q-mt-xs"
            />
            <div class="row justify-center q-gutter-xs q-mt-xs">
              <q-chip dense color="grey-8" text-color="white" icon="trending_up">
                {{ $t("Leverage") }}: {{ formatRatio(actionB.actionLeverage) }}
              </q-chip>
              <q-chip dense outline color="grey-8">
                ROI: {{ formatRatio(actionB.totalRoi) }}
              </q-chip>
            </div>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <q-tabs
          v-model="activeTab"
          dense
          class="text-grey-7 q-mb-md border-bottom"
          active-color="primary"
          indicator-color="primary"
          align="justify"
        >
          <q-tab name="comparison" icon="compare" :label="$t('tabComparison')" />
          <q-tab name="robustness" icon="tune" :label="$t('tabRobustness')" />
        </q-tabs>

        <!-- TAB 1: Comparison Overview -->
        <div v-if="activeTab === 'comparison'">
          <!-- Summary Banner -->
          <q-banner rounded class="bg-indigo-1 text-indigo-10 q-mb-md">
            <template v-slot:avatar>
              <q-icon name="lightbulb" color="indigo" />
            </template>
            <div class="text-subtitle2">{{ comparison.summary }}</div>
          </q-banner>

          <!-- Metric Delta Cards -->
          <div class="row q-col-gutter-sm q-mb-md">
            <div class="col-4">
              <q-card flat bordered class="text-center q-pa-sm">
                <div class="text-caption text-grey-7">{{ $t("Leverage") }} Δ</div>
                <div
                  class="text-h6 text-weight-bolder"
                  :class="comparison.delta.leverage >= 0 ? 'text-positive' : 'text-negative'"
                >
                  {{ comparison.delta.leverage > 0 ? '+' : '' }}{{ formatRatio(comparison.delta.leverage) }}
                </div>
              </q-card>
            </div>
            <div class="col-4">
              <q-card flat bordered class="text-center q-pa-sm">
                <div class="text-caption text-grey-7">{{ $t("marginalNetTotalBenefitNpv") }} Δ</div>
                <div
                  class="text-h6 text-weight-bolder"
                  :class="comparison.delta.netBenefit >= 0 ? 'text-positive' : 'text-negative'"
                >
                  {{ comparison.delta.netBenefit > 0 ? '+' : '' }}{{ formatAmount(comparison.delta.netBenefit) }}
                </div>
              </q-card>
            </div>
            <div class="col-4">
              <q-card flat bordered class="text-center q-pa-sm">
                <div class="text-caption text-grey-7">{{ $t("outstandingDirectCost") }} Δ</div>
                <div
                  class="text-h6 text-weight-bolder"
                  :class="comparison.delta.cost <= 0 ? 'text-positive' : 'text-negative'"
                >
                  {{ comparison.delta.cost > 0 ? '+' : '' }}{{ formatAmount(comparison.delta.cost) }}
                </div>
              </q-card>
            </div>
          </div>

          <!-- Narrative Breakdown -->
          <q-card flat bordered class="q-pa-md bg-grey-1">
            <div class="text-subtitle2 text-grey-9 q-mb-sm row items-center">
              <q-icon name="analytics" class="q-mr-xs" color="primary" />
              {{ $t("briefSection3Title") }}
            </div>
            <div class="text-body2 text-grey-9" style="white-space: pre-line; line-height: 1.6">
              {{ comparison.narrative }}
            </div>
          </q-card>
        </div>

        <!-- TAB 2: Robustness & Turning Points (Feature 3) -->
        <div v-else-if="activeTab === 'robustness' && sensitivityReport">
          <!-- Robustness Status Banner -->
          <div class="row items-center justify-between q-pa-sm bg-grey-2 rounded-borders q-mb-md">
            <div class="row items-center q-gutter-sm">
              <q-icon name="shield" color="primary" size="sm" />
              <div class="text-subtitle2 text-weight-bold">{{ $t("robustnessScore") }}:</div>
              <q-chip
                dense
                :color="robustnessColor"
                text-color="white"
                class="text-weight-bold"
              >
                {{ robustnessLabel }}
              </q-chip>
            </div>
            <div class="row items-center q-gutter-xs">
              <span class="text-caption text-grey-7">{{ $t("perturbationRangeLabel") }}:</span>
              <q-btn-toggle
                v-model="perturbationPercent"
                dense
                unelevated
                size="sm"
                toggle-color="primary"
                toggle-text-color="white"
                color="white"
                text-color="grey-8"
                :options="perturbationOptions"
              />
            </div>
          </div>

          <q-banner rounded class="bg-blue-1 text-blue-10 q-mb-md">
            <div class="text-body2">{{ sensitivityReport.executiveSummary }}</div>
          </q-banner>

          <!-- Turning Points Table -->
          <div class="text-subtitle2 text-grey-9 q-mb-xs row items-center">
            <q-icon name="crisis_alert" class="q-mr-xs" color="primary" />
            {{ $t("turningPointAnalysis") }}
          </div>
          <q-table
            flat
            bordered
            dense
            :rows="sensitivityReport.turningPoints"
            :columns="turningPointColumns"
            row-key="id"
            hide-pagination
            :pagination="{ rowsPerPage: 0 }"
            class="q-mb-md"
          >
            <template v-slot:body-cell-percentShift="props">
              <q-td :props="props" class="text-weight-bold">
                <span :class="Math.abs(props.value) < 20 ? 'text-negative' : 'text-positive'">
                  {{ props.row.direction === 'decrease' ? '-' : '+' }}{{ Math.abs(props.value).toFixed(1) }}%
                </span>
              </q-td>
            </template>
            <template v-slot:body-cell-robustness="props">
              <q-td :props="props">
                <q-chip
                  dense
                  size="sm"
                  :color="props.value === 'sensitive' ? 'negative' : (props.value === 'moderate' ? 'warning' : 'positive')"
                  text-color="white"
                >
                  {{ formatRobustnessBadge(props.value) }}
                </q-chip>
              </q-td>
            </template>
          </q-table>

          <!-- Sensitivity Narrative -->
          <q-card flat bordered class="q-pa-md bg-grey-1">
            <div class="text-subtitle2 text-grey-9 q-mb-sm row items-center">
              <q-icon name="menu_book" class="q-mr-xs" color="primary" />
              {{ $t("robustnessFinding") }}
            </div>
            <div class="text-body2 text-grey-9" style="white-space: pre-line; line-height: 1.6">
              {{ sensitivityReport.narrative }}
            </div>
          </q-card>
        </div>
      </q-card-section>

      <q-card-actions align="between" class="bg-grey-2 q-px-md">
        <q-btn
          flat
          icon="description"
          color="primary"
          :label="$t('prepareDecisionBrief')"
          @click="onOpenFullBrief"
        />
        <q-btn flat :label="$t('Close')" color="grey-8" v-close-popup />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { mapState, mapGetters } from "vuex";
import { formatNumber } from "@/utils/util-formatNumber";
import {
  explainActionComparison,
  formatCurrencyValue,
  formatRatioValue
} from "@/utils/decisionBrief";
import { generateSensitivityReport } from "@/utils/sensitivityAnalysis";

export default {
  name: "ExplainRankingModal",
  props: {
    modelValue: {
      type: Boolean,
      default: false
    },
    action: {
      type: Object,
      default: null
    }
  },
  emits: ["update:modelValue", "open-full-brief"],
  data() {
    return {
      selectedComparisonId: null,
      activeTab: "comparison",
      perturbationPercent: 30,
      perturbationOptions: [
        { label: "±10%", value: 10 },
        { label: "±25%", value: 25 },
        { label: "±30%", value: 30 },
        { label: "±50%", value: 50 }
      ]
    };
  },
  computed: {
    ...mapState("actions", ["matchingActions"]),
    ...mapState("orgs", ["currentOrg"]),
    ...mapGetters("model", ["nodes"]),
    isOpen: {
      get() {
        return this.modelValue;
      },
      set(val) {
        this.$emit("update:modelValue", val);
      }
    },
    actionA() {
      return this.action;
    },
    comparisonOptions() {
      if (!this.matchingActions || !this.actionA) return [];
      return this.matchingActions
        .filter((a) => a.id !== this.actionA.id)
        .map((a) => ({
          label: `${a.title} (${this.$t("Leverage")}: ${formatRatioValue(a.actionLeverage)})`,
          value: a.id
        }));
    },
    actionB() {
      if (!this.matchingActions) return null;
      if (this.selectedComparisonId) {
        return this.matchingActions.find((a) => a.id === this.selectedComparisonId) || null;
      }
      const others = this.matchingActions.filter((a) => a.id !== this.actionA?.id);
      return others.length > 0 ? others[0] : null;
    },
    comparison() {
      if (!this.actionA || !this.actionB) {
        return {
          summary: "",
          narrative: "",
          delta: { leverage: 0, netBenefit: 0, cost: 0 }
        };
      }
      return explainActionComparison(this.actionA, this.actionB, this.nodes, {
        locale: this.$i18n.locale,
        currency: this.currentOrg ? this.currentOrg.currency : ""
      });
    },
    sensitivityReport() {
      if (!this.actionA || !this.actionB) return null;
      return generateSensitivityReport(this.actionA, this.actionB, this.nodes, {}, {
        locale: this.$i18n.locale,
        currency: this.currentOrg ? this.currentOrg.currency : "",
        perturbationRange: this.perturbationPercent / 100
      });
    },
    robustnessColor() {
      if (!this.sensitivityReport) return "grey";
      const r = this.sensitivityReport.overallRobustness;
      if (r === "sensitive") return "negative";
      if (r === "moderate") return "warning";
      return "positive";
    },
    robustnessLabel() {
      if (!this.sensitivityReport) return "";
      const r = this.sensitivityReport.overallRobustness;
      if (r === "sensitive") return this.$t("sensitiveAssumption");
      if (r === "moderate") return this.$t("moderatelyRobust");
      return this.$t("highlyRobust");
    },
    turningPointColumns() {
      return [
        { name: "name", label: this.$t("assumptionName"), field: "name", align: "left" },
        { name: "baseValue", label: this.$t("baseEstimate"), field: (row) => `${formatNumber(row.baseValue, 2)} ${row.unit || ''}`.trim(), align: "right" },
        { name: "turningPoint", label: this.$t("flippingThreshold"), field: (row) => `${formatNumber(row.turningPoint, 2)} ${row.unit || ''}`.trim(), align: "right" },
        { name: "percentShift", label: this.$t("requiredShift"), field: "percentShift", align: "right" },
        { name: "robustness", label: this.$t("statusCol"), field: "robustness", align: "center" }
      ];
    }
  },
  watch: {
    action: {
      immediate: true,
      handler(newAction) {
        if (newAction && this.matchingActions) {
          const others = this.matchingActions.filter((a) => a.id !== newAction.id);
          if (others.length > 0) {
            this.selectedComparisonId = others[0].id;
          }
        }
      }
    }
  },
  methods: {
    formatRatio(val) {
      return formatRatioValue(val);
    },
    formatAmount(val) {
      const cur = this.currentOrg ? this.currentOrg.currency : "";
      return formatCurrencyValue(val, cur);
    },
    formatRobustnessBadge(val) {
      if (val === "sensitive") return this.$t("sensitiveAssumption");
      if (val === "moderate") return this.$t("moderatelyRobust");
      return this.$t("highlyRobust");
    },
    onOpenFullBrief() {
      this.isOpen = false;
      this.$emit("open-full-brief", [this.actionA, this.actionB].filter(Boolean));
    }
  }
};
</script>

<style scoped>
.border-bottom {
  border-bottom: 1px solid #e2e8f0;
}
</style>
