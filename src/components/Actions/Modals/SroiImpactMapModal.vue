<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" maximized>
    <q-card class="column full-height bg-grey-1">
      <!-- Header -->
      <q-card-section class="row items-center justify-between bg-white q-py-sm border-bottom">
        <div class="row items-center">
          <q-icon name="volunteer_activism" color="positive" size="26px" class="q-mr-sm" />
          <div>
            <div class="text-h6 leading-tight">{{ $t("sroiModalTitle") }}</div>
            <div class="text-caption text-grey-7">{{ actionTitle }}</div>
          </div>
        </div>
        <div class="row items-center q-gutter-xs">
          <q-btn
            outline
            dense
            no-caps
            color="primary"
            icon="content_copy"
            :label="$t('copySroiReport')"
            @click="copyMarkdownReport"
          />
          <q-btn flat round dense icon="close" v-close-popup />
        </div>
      </q-card-section>

      <!-- Content Area -->
      <q-card-section class="col scroll q-pa-md">
        <!-- Top Metrics Row -->
        <div class="row q-col-gutter-md q-mb-md">
          <!-- SROI Ratio KPI Card -->
          <div class="col-12 col-md-4">
            <q-card flat bordered class="bg-white q-pa-md text-center full-height column justify-center">
              <div class="text-caption text-grey-7 text-uppercase text-weight-bold">
                {{ $t("sroiRatioLabel") }}
              </div>
              <div class="text-h3 text-weight-bolder text-positive q-my-xs">
                {{ formattedRatio }}
              </div>
              <div class="text-caption text-grey-8">
                {{ sroiInterpretation }}
              </div>
            </q-card>
          </div>

          <!-- Financial Breakdown Card -->
          <div class="col-12 col-md-4">
            <q-card flat bordered class="bg-white q-pa-md full-height column justify-between">
              <div class="text-subtitle2 text-weight-bold text-primary">
                {{ $t("sroiFinancialSummary") }}
              </div>
              <div class="q-gutter-y-xs text-body2">
                <div class="row justify-between">
                  <span class="text-grey-7">{{ $t("grossSocialBenefit") }}:</span>
                  <span class="text-weight-medium">{{ formatCurrency(sroiMetrics.grossSocialBenefitNpv) }}</span>
                </div>
                <div class="row justify-between text-negative">
                  <span>{{ $t("sroiTotalDeductions") }} ({{ (100 - sroiMetrics.adjustmentFactor * 100).toFixed(1) }}%):</span>
                  <span>-{{ formatCurrency(sroiMetrics.grossSocialBenefitNpv - sroiMetrics.adjustedSocialBenefitNpv) }}</span>
                </div>
                <div class="row justify-between">
                  <span class="text-grey-7">{{ $t("socialCostNpv") }}:</span>
                  <span>-{{ formatCurrency(sroiMetrics.socialCostNpv) }}</span>
                </div>
                <q-separator class="q-my-xs" />
                <div class="row justify-between text-weight-bold text-positive">
                  <span>{{ $t("netSocialValue") }}:</span>
                  <span>{{ formatCurrency(sroiMetrics.netSocialBenefitNpv) }}</span>
                </div>
                <div class="row justify-between text-grey-8">
                  <span>{{ $t("totalDirectInvestment") }}:</span>
                  <span>{{ formatCurrency(sroiMetrics.totalInvestmentInputs) }}</span>
                </div>
              </div>
            </q-card>
          </div>

          <!-- Live Deductions Sensitivity Card -->
          <div class="col-12 col-md-4">
            <q-card flat bordered class="bg-white q-pa-md full-height column justify-between">
              <div class="row items-center justify-between">
                <span class="text-subtitle2 text-weight-bold text-primary">
                  {{ $t("sroiDeductionsTitle") }}
                </span>
                <q-badge color="primary">
                  {{ (sroiMetrics.adjustmentFactor * 100).toFixed(1) }}% {{ $t("netImpactShare") }}
                </q-badge>
              </div>

              <div class="q-gutter-y-xs q-mt-xs">
                <!-- Deadweight -->
                <div>
                  <div class="row justify-between text-caption">
                    <span>{{ $t("deadweightLabel") }}</span>
                    <span class="text-weight-bold">{{ localDeadweight }}%</span>
                  </div>
                  <q-slider
                    v-model="localDeadweight"
                    :min="0"
                    :max="80"
                    :step="5"
                    dense
                    color="primary"
                    @update:model-value="onDeductionsChanged"
                  />
                </div>

                <!-- Attribution -->
                <div>
                  <div class="row justify-between text-caption">
                    <span>{{ $t("attributionLabel") }}</span>
                    <span class="text-weight-bold">{{ localAttribution }}%</span>
                  </div>
                  <q-slider
                    v-model="localAttribution"
                    :min="0"
                    :max="80"
                    :step="5"
                    dense
                    color="secondary"
                    @update:model-value="onDeductionsChanged"
                  />
                </div>

                <!-- Displacement -->
                <div>
                  <div class="row justify-between text-caption">
                    <span>{{ $t("displacementLabel") }}</span>
                    <span class="text-weight-bold">{{ localDisplacement }}%</span>
                  </div>
                  <q-slider
                    v-model="localDisplacement"
                    :min="0"
                    :max="50"
                    :step="5"
                    dense
                    color="accent"
                    @update:model-value="onDeductionsChanged"
                  />
                </div>
              </div>
            </q-card>
          </div>
        </div>

        <!-- SROI Impact Map Table Card -->
        <q-card flat bordered class="bg-white q-pa-md">
          <div class="row items-center justify-between q-mb-sm">
            <div>
              <div class="text-subtitle1 text-weight-bold text-primary">
                {{ $t("sroiImpactMapTitle") }}
              </div>
              <div class="text-caption text-grey-7">
                {{ $t("sroiImpactMapSubtitle") }}
              </div>
            </div>
            <div class="text-caption text-grey-6">
              {{ $t("impactMapGuidelinesCitation") }}
            </div>
          </div>

          <q-table
            flat
            bordered
            dense
            :rows="impactMapRows"
            :columns="impactMapColumns"
            row-key="id"
            :rows-per-page-options="[0]"
          >
            <template v-slot:body-cell-stakeholder="props">
              <q-td :props="props">
                <q-chip dense outline size="sm" color="primary">
                  {{ props.value }}
                </q-chip>
              </q-td>
            </template>

            <template v-slot:body-cell-outputDescription="props">
              <q-td :props="props">
                <span class="text-weight-bold text-primary">{{ props.value }}</span>
              </q-td>
            </template>

            <template v-slot:body-cell-deductions="props">
              <q-td :props="props">
                <span class="text-caption text-grey-8">
                  DW {{ props.row.deadweight }}% | Attr {{ props.row.attribution }}% | Disp {{ props.row.displacement }}%
                </span>
              </q-td>
            </template>
          </q-table>
        </q-card>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script>
import { mapState } from "vuex";
import {
  calculateSroiMetrics,
  formatSroiRatio,
  generateSroiImpactMap,
  generateSroiMarkdownReport
} from "@/utils/sroi";

export default {
  props: {
    modelValue: { type: Boolean, default: false },
    action: { type: Object, default: () => ({}) }
  },
  emits: ["update:modelValue", "updateAdjustments"],
  data() {
    return {
      localDeadweight: 0,
      localAttribution: 0,
      localDisplacement: 0,
      impactMapColumns: [
        { name: "stakeholder", label: this.$t("sroiColStakeholder"), field: "stakeholder", align: "left" },
        { name: "factorName", label: this.$t("Factor"), field: "factorName", align: "left" },
        { name: "outputDescription", label: this.$t("sroiColOutput"), field: "outputDescription", align: "left" },
        { name: "deductions", label: this.$t("sroiColDeductions"), field: "deductions", align: "center" }
      ]
    };
  },
  watch: {
    action: {
      immediate: true,
      handler(act) {
        if (!act) return;
        this.localDeadweight = Number(act.deadweight) || 0;
        this.localAttribution = Number(act.attribution) || 0;
        this.localDisplacement = Number(act.displacement) || 0;
      }
    }
  },
  computed: {
    ...mapState("orgs", ["currentOrg"]),
    ...mapState("model", ["nodes"]),

    actionTitle() {
      return this.action?.title || this.$t("Action");
    },

    currency() {
      return this.currentOrg?.currency || "USD";
    },

    sroiMetrics() {
      return calculateSroiMetrics(this.action, {
        deadweight: this.localDeadweight,
        attribution: this.localAttribution,
        displacement: this.localDisplacement
      });
    },

    formattedRatio() {
      return formatSroiRatio(this.sroiMetrics.sroiRatio);
    },

    sroiInterpretation() {
      if (this.sroiMetrics.sroiRatio === null) {
        return this.$t("sroiZeroCostInterpretation");
      }
      return this.$t("sroiRatioInterpretation", {
        currency: this.currency,
        value: this.sroiMetrics.sroiRatio.toFixed(2)
      });
    },

    impactMapData() {
      return generateSroiImpactMap(
        {
          ...this.action,
          deadweight: this.localDeadweight,
          attribution: this.localAttribution,
          displacement: this.localDisplacement
        },
        this.nodes || [],
        this.currentOrg || {}
      );
    },

    impactMapRows() {
      return this.impactMapData.rows;
    }
  },
  methods: {
    formatCurrency(val) {
      if (typeof val !== "number" || isNaN(val)) return "-";
      return `${this.currency} ${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    },

    onDeductionsChanged() {
      this.$emit("updateAdjustments", {
        deadweight: this.localDeadweight,
        attribution: this.localAttribution,
        displacement: this.localDisplacement
      });
    },

    async copyMarkdownReport() {
      const md = generateSroiMarkdownReport(
        {
          ...this.action,
          deadweight: this.localDeadweight,
          attribution: this.localAttribution,
          displacement: this.localDisplacement
        },
        this.nodes || [],
        this.currentOrg || {}
      );

      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(md);
        }
        if (this.$q?.notify) {
          this.$q.notify({
            type: "positive",
            message: this.$t("sroiReportCopiedToast")
          });
        }
      } catch (e) {
        console.error("Clipboard write error:", e);
      }
    }
  }
};
</script>

<style scoped>
.border-bottom {
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}
.leading-tight {
  line-height: 1.2;
}
</style>
