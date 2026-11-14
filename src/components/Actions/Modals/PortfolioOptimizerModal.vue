<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" maximized transition-show="slide-up" transition-hide="slide-down">
    <q-card class="column full-height bg-grey-1">
      <!-- Header -->
      <q-card-section class="row items-center q-pb-sm bg-white border-bottom">
        <div>
          <div class="text-h6 text-weight-bold text-primary row items-center">
            <q-icon name="hub" class="q-mr-sm" size="sm" />
            {{ $t("portfolioOptimizerTitle") }}
          </div>
          <div class="text-caption text-grey-8">
            {{ $t("portfolioOptimizerSubtitle") }}
          </div>
        </div>
        <q-space />
        <q-btn icon="close" flat round dense @click="$emit('update:modelValue', false)" />
      </q-card-section>

      <!-- Main Body -->
      <q-card-section class="col q-pa-md scroll">
        <div class="row q-col-gutter-md">
          <!-- Left Column: Resource Constraints & Caps Controls -->
          <div class="col-12 col-md-4">
            <q-card flat bordered class="bg-white rounded-borders q-pa-sm">
              <div class="text-subtitle2 text-weight-bold q-mb-sm row items-center text-primary">
                <q-icon name="tune" class="q-mr-xs" />
                {{ $t("resourceConstraintsSection") }}
              </div>

              <!-- Objective toggle -->
              <div class="q-mb-md">
                <div class="text-caption text-grey-7 q-mb-xs">{{ $t("optimizationObjective") }}:</div>
                <q-btn-toggle
                  v-model="objective"
                  dense
                  unelevated
                  no-caps
                  class="full-width"
                  toggle-color="primary"
                  toggle-text-color="white"
                  color="grey-2"
                  text-color="grey-8"
                  :options="[
                    { label: $t('maxNetBenefit'), value: 'benefit' },
                    { label: $t('maxLeverage'), value: 'leverage' }
                  ]"
                />
              </div>

              <!-- Budget ceiling -->
              <div class="q-mb-md">
                <div class="row items-center justify-between text-caption text-grey-7">
                  <span>{{ $t("maxTotalBudget") }}:</span>
                  <span class="text-weight-bold text-primary">{{ formatNumber(maxBudget, 2) }} {{ currency }}</span>
                </div>
                <q-slider
                  v-model="maxBudget"
                  :min="0"
                  :max="maxBudgetSliderLimit"
                  :step="1000"
                  color="primary"
                />
              </div>

              <!-- Total Hours Limit -->
              <div class="q-mb-md">
                <div class="row items-center justify-between text-caption text-grey-7">
                  <span>{{ $t("maxTotalHours") }}:</span>
                  <span class="text-weight-bold text-primary">{{ formatNumber(maxHours, 2) }} hrs</span>
                </div>
                <q-slider
                  v-model="maxHours"
                  :min="0"
                  :max="maxHoursSliderLimit"
                  :step="20"
                  color="primary"
                />
              </div>

              <!-- Quick Presets -->
              <div class="row items-center justify-between text-caption text-grey-7 q-mb-md">
                <span>{{ $t("setCompletionPreset") }}:</span>
                <div class="row q-gutter-xs">
                  <q-btn
                    v-for="p in [25, 50, 75, 100]"
                    :key="p"
                    dense
                    flat
                    size="xs"
                    color="primary"
                    :label="p + '%'"
                    @click="applyPreset(p)"
                  />
                </div>
              </div>

              <q-separator class="q-my-sm" />

              <!-- Department hours caps -->
              <q-expansion-item
                dense
                dense-toggle
                icon="groups"
                :label="$t('departmentHoursLimits')"
                header-class="text-caption text-grey-9 q-px-none"
              >
                <div class="q-gutter-y-xs q-mt-xs">
                  <div
                    v-for="dept in departmentList"
                    :key="dept.id"
                    class="row items-center justify-between q-py-xs"
                  >
                    <span class="text-caption text-grey-8 col-5">{{ dept.label }}:</span>
                    <div class="col-7">
                      <q-input
                        v-model.number="deptCaps[dept.id]"
                        dense
                        outlined
                        type="number"
                        suffix="hrs"
                        class="text-right"
                        clearable
                        placeholder="Unlimited"
                      />
                    </div>
                  </div>
                </div>
              </q-expansion-item>
            </q-card>
          </div>

          <!-- Right Column: Optimization Dashboard & Bundles -->
          <div class="col-12 col-md-8">
            <!-- Aggregate Result Banner -->
            <div class="row q-col-gutter-sm q-mb-md">
              <div class="col-6 col-sm-3">
                <q-card flat bordered class="bg-white q-pa-sm text-center">
                  <div class="text-caption text-grey-7">{{ $t("recommendedBundle") }}</div>
                  <div class="text-h6 text-weight-bold text-primary">
                    {{ result.selectedActions.length }} / {{ actions.length }}
                  </div>
                </q-card>
              </div>
              <div class="col-6 col-sm-3">
                <q-card flat bordered class="bg-white q-pa-sm text-center">
                  <div class="text-caption text-grey-7">{{ $t("marginalNetTotalBenefitNpv") }}</div>
                  <div class="text-h6 text-weight-bold text-positive">
                    {{ formatNumber(result.totalBenefitNpv, 2) }} {{ currency }}
                  </div>
                </q-card>
              </div>
              <div class="col-6 col-sm-3">
                <q-card flat bordered class="bg-white q-pa-sm text-center">
                  <div class="text-caption text-grey-7">{{ $t("outstandingDirectCost") }}</div>
                  <div class="text-h6 text-weight-bold text-grey-9">
                    {{ formatNumber(result.totalCostNpv, 2) }} {{ currency }}
                  </div>
                </q-card>
              </div>
              <div class="col-6 col-sm-3">
                <q-card flat bordered class="bg-white q-pa-sm text-center">
                  <div class="text-caption text-grey-7">{{ $t("Leverage") }}</div>
                  <div class="text-h6 text-weight-bold text-primary">
                    {{ formatNumber(result.portfolioLeverage, 2) }}x
                  </div>
                </q-card>
              </div>
            </div>

            <!-- Resource Utilization Gauges -->
            <q-card flat bordered class="bg-white q-pa-md q-mb-md rounded-borders">
              <div class="text-subtitle2 text-weight-bold text-grey-8 q-mb-sm row items-center">
                <q-icon name="speed" class="q-mr-xs" color="primary" />
                {{ $t("capacityUtilizationTitle") }}
              </div>
              <div class="row q-col-gutter-sm">
                <div
                  v-for="res in result.resourceUtilization"
                  :key="res.key"
                  class="col-12 col-sm-6"
                >
                  <div class="bg-grey-1 q-pa-xs rounded-borders border">
                    <div class="row items-center justify-between text-caption q-mb-xs">
                      <span class="text-weight-medium">{{ formatResourceName(res.key) }}</span>
                      <span class="text-grey-7">
                        {{ formatNumber(res.used, 1) }} / {{ formatNumber(res.cap, 1) }} {{ res.unit }}
                        ({{ res.percent }}%)
                      </span>
                    </div>
                    <q-linear-progress
                      :value="res.percent / 100"
                      rounded
                      size="8px"
                      :color="res.percent >= 100 ? 'negative' : res.percent >= 85 ? 'warning' : 'positive'"
                    />
                  </div>
                </div>
              </div>
            </q-card>

            <!-- Recommended Actions Table -->
            <q-card flat bordered class="bg-white rounded-borders q-mb-md">
              <div class="row items-center justify-between q-pa-sm border-bottom">
                <div class="text-subtitle2 text-weight-bold text-primary row items-center">
                  <q-icon name="check_circle" class="q-mr-xs" color="positive" />
                  {{ $t("recommendedBundle") }} ({{ result.selectedActions.length }})
                </div>
                <q-btn
                  color="primary"
                  unelevated
                  no-caps
                  size="sm"
                  icon="description"
                  :label="$t('applyToDecisionBrief')"
                  :disable="!result.selectedActions.length"
                  @click="applyToBrief"
                />
              </div>

              <q-table
                flat
                dense
                :rows="result.selectedActions"
                :columns="recommendedColumns"
                row-key="id"
                hide-pagination
                :pagination="{ rowsPerPage: 0 }"
              >
                <template v-slot:body-cell-dept="props">
                  <q-td :props="props">
                    <q-chip dense size="xs" color="blue-1" text-color="primary">
                      {{ formatDepartment(props.row.departmentTag) }}
                    </q-chip>
                  </q-td>
                </template>
              </q-table>
            </q-card>

            <!-- Excluded / Bottlenecked Actions Table -->
            <q-card v-if="result.excludedActions.length" flat bordered class="bg-white rounded-borders">
              <div class="text-subtitle2 text-weight-bold text-grey-8 q-pa-sm border-bottom row items-center">
                <q-icon name="block" class="q-mr-xs" color="negative" />
                {{ $t("excludedDueToBottlenecks") }} ({{ result.excludedActions.length }})
              </div>
              <q-table
                flat
                dense
                :rows="result.excludedActions"
                :columns="excludedColumns"
                row-key="action.id"
                hide-pagination
                :pagination="{ rowsPerPage: 0 }"
              >
                <template v-slot:body-cell-reason="props">
                  <q-td :props="props">
                    <q-chip dense size="xs" color="red-1" text-color="negative">
                      {{ formatBottleneckReason(props.value) }}
                    </q-chip>
                  </q-td>
                </template>
              </q-table>
            </q-card>
          </div>
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script>
import { formatNumber } from "@/utils/util-formatNumber";
import { solvePortfolioOptimization, DEFAULT_DEPARTMENTS } from "@/utils/portfolioOptimizer";

export default {
  props: {
    modelValue: {
      type: Boolean,
      default: false
    },
    actions: {
      type: Array,
      default: () => []
    }
  },
  emits: ["update:modelValue", "open-brief"],
  data() {
    return {
      objective: "benefit",
      maxBudget: 100000,
      maxHours: 500,
      deptCaps: {
        executive: null,
        operations: null,
        fieldwork: null,
        engineering: null,
        finance: null
      }
    };
  },
  computed: {
    currency() {
      return this.$store?.state?.orgs?.currentOrg?.currency || "USD";
    },
    totalCandidateCost() {
      return this.actions.reduce((sum, a) => sum + (Number(a.outstandingDirectCosts ?? a.outstandingDirectCost) || 0), 0);
    },
    totalCandidateHours() {
      return this.actions.reduce((sum, a) => sum + (Number(a.estEffortHrs) || 0), 0);
    },
    maxBudgetSliderLimit() {
      return Math.max(10000, Math.ceil(this.totalCandidateCost * 1.2));
    },
    maxHoursSliderLimit() {
      return Math.max(100, Math.ceil(this.totalCandidateHours * 1.2));
    },
    departmentList() {
      const isZh = (this.$i18n?.locale || "").startsWith("zh");
      return DEFAULT_DEPARTMENTS.map((d) => ({
        id: d.id,
        label: isZh ? d.labelZh : d.labelEn
      }));
    },
    result() {
      return solvePortfolioOptimization(this.actions, {
        maxTotalBudget: this.maxBudget,
        maxTotalHours: this.maxHours,
        departmentCaps: this.deptCaps,
        objective: this.objective
      });
    },
    recommendedColumns() {
      return [
        { name: "title", label: this.$t("Title"), field: "title", align: "left" },
        { name: "dept", label: this.$t("departmentTag"), field: (row) => row.departmentTag || "operations", align: "left" },
        { name: "hrs", label: this.$t("estEffortHrs"), field: (row) => `${formatNumber(row.estEffortHrs || 0, 1)}h`, align: "right" },
        { name: "cost", label: this.$t("outstandingDirectCost"), field: (row) => `${formatNumber(row.outstandingDirectCosts ?? row.outstandingDirectCost ?? 0, 2)} ${this.currency}`, align: "right" },
        { name: "netBenefit", label: this.$t("marginalNetTotalBenefitNpv"), field: (row) => `${formatNumber(row.marginalNetTotalBenefitNpv || 0, 2)} ${this.currency}`, align: "right" },
        { name: "leverage", label: this.$t("Leverage"), field: (row) => `${formatNumber(row.actionLeverage || 0, 2)}x`, align: "right" }
      ];
    },
    excludedColumns() {
      return [
        { name: "title", label: this.$t("Title"), field: (row) => row.action.title, align: "left" },
        { name: "cost", label: this.$t("outstandingDirectCost"), field: (row) => `${formatNumber(row.cost, 2)} ${this.currency}`, align: "right" },
        { name: "hrs", label: this.$t("estEffortHrs"), field: (row) => `${formatNumber(row.hrs, 1)}h`, align: "right" },
        { name: "reason", label: this.$t("bottleneckReason"), field: "bottleneckReason", align: "left" }
      ];
    }
  },
  watch: {
    actions: {
      immediate: true,
      handler(newActions) {
        if (Array.isArray(newActions) && newActions.length > 0) {
          const totCost = this.totalCandidateCost;
          const totHrs = this.totalCandidateHours;
          this.maxBudget = Math.max(1000, Math.ceil(totCost / 1000) * 1000);
          this.maxHours = Math.max(20, Math.ceil(totHrs / 20) * 20);
        }
      }
    }
  },
  methods: {
    formatNumber,
    formatDepartment(tag) {
      const match = this.departmentList.find((d) => d.id === tag);
      return match ? match.label : tag || "Operations";
    },
    formatResourceName(key) {
      if (key === "budget") return this.$t("maxTotalBudget");
      if (key === "totalHours") return this.$t("maxTotalHours");
      return this.formatDepartment(key);
    },
    formatBottleneckReason(code) {
      if (code && code.startsWith("dept_bottleneck_")) {
        const deptKey = code.replace("dept_bottleneck_", "");
        return `Exceeds ${this.formatDepartment(deptKey)} limit`;
      }
      return this.$t(code) || code;
    },
    applyPreset(percent) {
      this.maxBudget = Math.round((this.totalCandidateCost * (percent / 100)) / 1000) * 1000;
      this.maxHours = Math.round((this.totalCandidateHours * (percent / 100)) / 20) * 20;
    },
    applyToBrief() {
      this.$emit("open-brief", this.result.selectedActions);
      this.$emit("update:modelValue", false);
    }
  }
};
</script>

<style scoped>
.border-bottom {
  border-bottom: 1px solid #e0e0e0;
}
</style>
