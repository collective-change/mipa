<template>
  <q-card flat bordered class="q-my-md rounded-borders bg-white">
    <q-card-section class="q-pb-xs">
      <div class="row items-center justify-between">
        <div class="text-subtitle1 text-weight-bold text-grey-9 row items-center">
          <q-icon name="science" color="primary" class="q-mr-xs" size="20px" />
          {{ $t("counterfactualArm") || "Counterfactual & Attribution Design" }}
        </div>
        <div class="row items-center q-gutter-xs">
          <q-chip
            v-if="isMeasured"
            dense
            color="green-1"
            text-color="positive"
            icon="verified"
            class="text-weight-bold"
          >
            {{ $t("measuredCounterfactualBadge") || "Measured" }}: {{ methodLabel }}
          </q-chip>
          <q-chip
            v-else
            dense
            color="grey-2"
            text-color="grey-8"
          >
            {{ $t("declaredBaselineBadge") || "Declared Baseline" }}
          </q-chip>
          <q-btn
            v-if="!isEditing"
            outline
            dense
            no-caps
            size="sm"
            color="primary"
            icon="edit"
            :label="$t('editAttribution') || 'Edit'"
            @click="startEditing"
          />
        </div>
      </div>
      <div class="text-caption text-grey-7 q-mt-xs">
        {{ $t("counterfactualDesc") || "Governs whether the counterfactual ('if not done') arm is declared by assumption or measured empirically." }}
      </div>
    </q-card-section>

    <!-- Read-only View -->
    <q-card-section v-if="!isEditing" class="q-pt-sm">
      <div v-if="isMeasured" class="bg-green-1 q-pa-sm rounded-borders border-positive q-mb-sm">
        <div class="text-body2 text-weight-bold text-green-9">
          {{ statement }}
        </div>
        <div v-if="cfAssumptions" class="text-caption text-grey-9 q-mt-xs">
          <strong>{{ $t("methodAssumptions") || "Assumptions" }}:</strong> {{ cfAssumptions }}
        </div>
        <div v-if="cfLimits" class="text-caption text-grey-9 q-mt-xs">
          <strong>{{ $t("methodLimits") || "Limitations" }}:</strong> {{ cfLimits }}
        </div>
      </div>
      <div v-else class="bg-grey-1 q-pa-sm rounded-borders border q-mb-sm text-caption text-grey-8">
        {{ $t("declaredBaselineExplanation") || "Counterfactual derived directly from baseline trajectory. Upgradable to measured where empirical comparison data exists." }}
      </div>

      <!-- Observed Series Summary Table (if measured) -->
      <div v-if="isMeasured && series.length > 0" class="q-mt-sm">
        <div class="text-caption text-weight-bold text-grey-8 q-mb-xs">
          {{ $t("counterfactualSeries") || "Observed Counterfactual Series" }} ({{ series.length }} {{ $t("points") || "points" }})
        </div>
        <q-markup-table dense flat bordered separator="cell">
          <thead>
            <tr class="bg-grey-2 text-grey-9">
              <th class="text-left">{{ $t("date") || "Date" }}</th>
              <th class="text-right">{{ $t("value") || "Value" }}</th>
              <th class="text-center">{{ $t("valueFlag") || "Status" }}</th>
              <th class="text-left">{{ $t("provenance") || "Provenance" }}</th>
              <th class="text-left">{{ $t("citation") || "Citation" }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(pt, idx) in series" :key="idx">
              <td>{{ pt.date || "-" }}</td>
              <td class="text-right text-weight-bold">{{ pt.value }}</td>
              <td class="text-center">
                <q-badge
                  :color="pt.type === 'forecast' ? 'warning' : 'positive'"
                  :text-color="pt.type === 'forecast' ? 'dark' : 'white'"
                >
                  {{ pt.type || "measured" }}
                </q-badge>
              </td>
              <td>{{ pt.provenance || "-" }}</td>
              <td>
                <a v-if="pt.citationUrl" :href="pt.citationUrl" target="_blank" class="text-primary">
                  {{ pt.citation || pt.citationUrl }}
                </a>
                <span v-else>{{ pt.citation || "-" }}</span>
              </td>
            </tr>
          </tbody>
        </q-markup-table>
      </div>
    </q-card-section>

    <!-- Editing Form -->
    <q-card-section v-else class="q-pt-sm">
      <div class="row q-col-gutter-sm items-center q-mb-md">
        <div class="col-12 col-sm-6">
          <q-select
            v-model="editForm.armType"
            dense
            filled
            emit-value
            map-options
            :options="armOptions"
            :label="$t('counterfactualArmType') || 'Counterfactual Arm Type'"
          />
        </div>
        <div v-if="editForm.armType === 'measured'" class="col-12 col-sm-6">
          <q-select
            v-model="editForm.method"
            dense
            filled
            emit-value
            map-options
            :options="methodOptions"
            :label="$t('counterfactualMethod') || 'Comparison Design Method'"
          />
        </div>
      </div>

      <div v-if="editForm.armType === 'measured'" class="q-gutter-y-sm">
        <div class="row q-col-gutter-sm">
          <div class="col-12 col-sm-4">
            <q-input
              v-model="editForm.attributionDate"
              dense
              filled
              type="date"
              :label="$t('attributionDate') || 'Attribution Evaluation Date'"
            />
          </div>
          <div class="col-12 col-sm-8">
            <q-input
              v-model="editForm.attributionDesign"
              dense
              filled
              :label="$t('attributionDesign') || 'Attribution Design Summary'"
              placeholder="e.g. Matched cohort of 12 non-participating clinics"
            />
          </div>
        </div>

        <div class="row q-col-gutter-sm">
          <div class="col-12 col-sm-6">
            <q-input
              v-model="editForm.assumptions"
              dense
              filled
              type="textarea"
              rows="2"
              :label="$t('methodAssumptions') || 'Method Assumptions'"
              placeholder="e.g. Parallel pre-treatment trends between cohorts"
            />
          </div>
          <div class="col-12 col-sm-6">
            <q-input
              v-model="editForm.limits"
              dense
              filled
              type="textarea"
              rows="2"
              :label="$t('methodLimits') || 'Method Limitations'"
              placeholder="e.g. Cross-boundary spillover, small sample size"
            />
          </div>
        </div>

        <!-- Series Editor -->
        <div class="q-mt-md">
          <div class="row items-center justify-between q-mb-xs">
            <div class="text-caption text-weight-bold text-grey-8">
              {{ $t("counterfactualSeries") || "Observed Data Points (Control Arm)" }}
            </div>
            <q-btn
              flat
              dense
              no-caps
              size="sm"
              color="primary"
              icon="add"
              :label="$t('addObservedPoint') || 'Add Point'"
              @click="addSeriesPoint"
            />
          </div>

          <div v-for="(pt, idx) in editForm.series" :key="idx" class="row q-col-gutter-xs items-center q-mb-xs">
            <div class="col-12 col-sm-2">
              <q-input v-model="pt.date" dense filled type="date" label="Date" />
            </div>
            <div class="col-12 col-sm-2">
              <q-input v-model.number="pt.value" dense filled type="number" label="Value" />
            </div>
            <div class="col-12 col-sm-2">
              <q-select
                v-model="pt.type"
                dense
                filled
                emit-value
                map-options
                :options="statusOptions"
                label="Status"
              />
            </div>
            <div class="col-12 col-sm-2">
              <q-input v-model="pt.provenance" dense filled label="Provenance" />
            </div>
            <div class="col-12 col-sm-3">
              <q-input v-model="pt.citation" dense filled label="Citation / Source" />
            </div>
            <div class="col-12 col-sm-1 text-center">
              <q-btn flat dense round size="sm" color="negative" icon="delete" @click="removeSeriesPoint(idx)" />
            </div>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="row justify-end q-gutter-sm q-mt-md">
        <q-btn flat dense no-caps :label="$t('Cancel') || 'Cancel'" @click="cancelEditing" />
        <q-btn unelevated dense no-caps color="primary" :label="$t('Save') || 'Save'" @click="saveChanges" />
      </div>
    </q-card-section>
  </q-card>
</template>

<script>
import {
  COUNTERFACTUAL_METHODS,
  ARM_TYPES,
  VALUE_FLAGS,
  getCounterfactualMethodLabel,
  formatCounterfactualStatement,
  buildActionCounterfactualSummary
} from "@/utils/counterfactual";

export default {
  name: "CounterfactualCard",

  props: {
    action: {
      type: Object,
      required: true
    }
  },

  emits: ["update:counterfactual", "save"],

  data() {
    return {
      isEditing: false,
      editForm: {
        armType: ARM_TYPES.DECLARED,
        method: "difference_in_differences",
        attributionDate: new Date().toISOString().split("T")[0],
        attributionDesign: "",
        assumptions: "",
        limits: "",
        series: []
      }
    };
  },

  computed: {
    counterfactual() {
      return this.action.counterfactual || {};
    },
    isMeasured() {
      return this.counterfactual.armType === ARM_TYPES.MEASURED;
    },
    methodLabel() {
      const method = this.counterfactual.method;
      if (!method) return "-";
      const key = `counterfactualMethod_${method}`;
      const translated = this.$t(key);
      return translated !== key ? translated : getCounterfactualMethodLabel(method);
    },
    statement() {
      if (!this.isMeasured) {
        return formatCounterfactualStatement(this.counterfactual);
      }
      const label = this.methodLabel;
      const date = this.counterfactual.attributionDate || "unspecified date";
      return `The counterfactual is observed, chosen by ${label}, on ${date}.`;
    },
    cfAssumptions() {
      return this.counterfactual.assumptions || "";
    },
    cfLimits() {
      return this.counterfactual.limits || "";
    },
    series() {
      return Array.isArray(this.counterfactual.series) ? this.counterfactual.series : [];
    },
    armOptions() {
      return [
        { label: this.$t("counterfactualDeclared") || "Declared Baseline Projection", value: ARM_TYPES.DECLARED },
        { label: this.$t("counterfactualMeasured") || "Observed Counterfactual (Measured)", value: ARM_TYPES.MEASURED }
      ];
    },
    methodOptions() {
      return COUNTERFACTUAL_METHODS.map(m => {
        const key = `counterfactualMethod_${m.id}`;
        const translated = this.$t(key);
        const label = translated !== key ? translated : m.label;
        return {
          label: `${label} - ${m.description}`,
          value: m.id
        };
      });
    },
    statusOptions() {
      return [
        { label: this.$t("valueFlagMeasured") || "Measured", value: VALUE_FLAGS.MEASURED },
        { label: this.$t("valueFlagForecast") || "Forecast", value: VALUE_FLAGS.FORECAST }
      ];
    }
  },

  methods: {
    startEditing() {
      const cf = this.action.counterfactual || {};
      this.editForm = {
        armType: cf.armType || ARM_TYPES.DECLARED,
        method: cf.method || "difference_in_differences",
        attributionDate: cf.attributionDate || new Date().toISOString().split("T")[0],
        attributionDesign: cf.attributionDesign || "",
        assumptions: cf.assumptions || "",
        limits: cf.limits || "",
        series: Array.isArray(cf.series)
          ? cf.series.map(pt => ({ ...pt }))
          : []
      };
      this.isEditing = true;
    },
    cancelEditing() {
      this.isEditing = false;
    },
    addSeriesPoint() {
      this.editForm.series.push({
        date: new Date().toISOString().split("T")[0],
        value: 0,
        type: VALUE_FLAGS.MEASURED,
        provenance: "",
        citation: "",
        citationUrl: ""
      });
    },
    removeSeriesPoint(index) {
      this.editForm.series.splice(index, 1);
    },
    saveChanges() {
      const payload = {
        armType: this.editForm.armType,
        method: this.editForm.armType === ARM_TYPES.MEASURED ? this.editForm.method : null,
        attributionDate: this.editForm.armType === ARM_TYPES.MEASURED ? this.editForm.attributionDate : null,
        attributionDesign: this.editForm.armType === ARM_TYPES.MEASURED ? this.editForm.attributionDesign : "",
        assumptions: this.editForm.armType === ARM_TYPES.MEASURED ? this.editForm.assumptions : "",
        limits: this.editForm.armType === ARM_TYPES.MEASURED ? this.editForm.limits : "",
        series: this.editForm.armType === ARM_TYPES.MEASURED ? this.editForm.series : []
      };

      this.$emit("update:counterfactual", payload);
      this.$emit("save", payload);
      this.isEditing = false;
    }
  }
};
</script>
