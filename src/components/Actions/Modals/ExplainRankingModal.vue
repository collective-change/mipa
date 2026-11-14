<template>
  <q-dialog v-model="isOpen" persistent>
    <q-card style="min-width: 650px; max-width: 850px; width: 100%">
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
        <div class="row items-center justify-between q-pa-sm bg-blue-1 rounded-borders q-mb-md">
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
      selectedComparisonId: null
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
      // Default to the runner up or action right above/below
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
    onOpenFullBrief() {
      this.isOpen = false;
      this.$emit("open-full-brief", [this.actionA, this.actionB].filter(Boolean));
    }
  }
};
</script>
