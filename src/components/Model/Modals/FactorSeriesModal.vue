<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
    <q-card style="min-width: 680px; max-width: 950px; width: 100%">
      <!-- Header -->
      <q-card-section class="row items-center justify-between q-pb-none">
        <div class="row items-center text-h6 text-primary">
          <q-icon name="timeline" class="q-mr-sm" size="24px" />
          {{ $t("factorSeriesModalTitle") }}
        </div>
        <q-btn flat round dense icon="close" v-close-popup />
      </q-card-section>

      <!-- Factor identity badge -->
      <q-card-section class="q-py-xs">
        <div class="row items-center q-gutter-sm">
          <span class="text-subtitle1 text-weight-bold text-grey-9">{{ factor?.name || "Factor" }}</span>
          <q-badge color="primary" class="font-mono">${{ factor?.symbol || factor?.id }}</q-badge>
          <q-badge v-if="factor?.unit" outline color="grey-8">{{ factor.unit }}</q-badge>
        </div>
        <div class="text-caption text-grey-7 q-mt-xs">
          {{ $t("factorSeriesHelp") }}
        </div>
      </q-card-section>

      <q-separator class="q-my-xs" />

      <!-- Tabs: View Current Series vs Import / Edit -->
      <q-tabs
        v-model="activeTab"
        dense
        align="left"
        class="text-grey-8"
        active-color="primary"
        indicator-color="primary"
      >
        <q-tab name="current" icon="table_chart" :label="$t('tabCurrentSeries')">
          <q-badge v-if="existingPointsCount > 0" color="primary" floating rounded>
            {{ existingPointsCount }}
          </q-badge>
        </q-tab>
        <q-tab v-if="!readOnly" name="import" icon="upload_file" :label="$t('tabImportSeries')" />
      </q-tabs>

      <q-tab-panels v-model="activeTab" animated class="q-pa-none">
        <!-- Tab 1: Current Series & Provenance -->
        <q-tab-panel name="current" class="q-pa-md">
          <div v-if="existingPointsCount > 0">
            <!-- Provenance Card -->
            <q-card flat bordered class="q-pa-sm bg-grey-1 q-mb-sm">
              <div class="row items-center justify-between">
                <div class="text-caption text-weight-bold text-grey-8 uppercase">
                  {{ $t("seriesProvenanceTitle") }}
                </div>
                <q-btn
                  v-if="!readOnly"
                  flat
                  dense
                  size="sm"
                  color="negative"
                  icon="delete_outline"
                  :label="$t('clearSeriesBtn')"
                  @click="confirmClearSeries"
                />
              </div>

              <div class="row q-gutter-xs q-mt-xs items-center wrap">
                <q-chip dense size="sm" color="primary" text-color="white" icon="tag">
                  {{ existingPointsCount }} {{ $t("dataPoints") }}
                </q-chip>
                <q-chip dense size="sm" color="teal" text-color="white" icon="history">
                  {{ historicalCount }} {{ $t("seriesHistorical") }}
                </q-chip>
                <q-chip dense size="sm" color="purple" text-color="white" icon="trending_up">
                  {{ predictedCount }} {{ $t("seriesPredicted") }}
                </q-chip>
                <q-chip
                  v-if="factor?.seriesProvenance?.sourceCitation"
                  dense
                  size="sm"
                  color="grey-8"
                  text-color="white"
                  icon="menu_book"
                >
                  {{ factor.seriesProvenance.sourceCitation }}
                </q-chip>
                <q-chip
                  v-if="dateRange"
                  dense
                  size="sm"
                  outline
                  color="grey-8"
                  icon="date_range"
                >
                  {{ dateRange }}
                </q-chip>
              </div>
            </q-card>

            <!-- Search filter -->
            <div class="row q-mb-xs">
              <q-input
                v-model="searchFilter"
                dense
                outlined
                clearable
                class="col-12"
                :placeholder="$t('filterSeriesPointsPlaceholder')"
              >
                <template v-slot:prepend>
                  <q-icon name="search" size="18px" />
                </template>
              </q-input>
            </div>

            <!-- Table of points -->
            <q-table
              flat
              bordered
              dense
              :rows="filteredCurrentPoints"
              :columns="columns"
              row-key="date"
              :rows-per-page-options="[10, 25, 50, 0]"
              style="max-height: 320px"
              virtual-scroll
            >
              <template v-slot:body-cell-type="props">
                <q-td :props="props">
                  <q-badge
                    dense
                    :color="props.row.isPredicted ? 'purple' : 'teal'"
                    :label="props.row.isPredicted ? $t('seriesPredicted') : $t('seriesHistorical')"
                  />
                </q-td>
              </template>
              <template v-slot:body-cell-value="props">
                <q-td :props="props" class="font-mono text-weight-bold">
                  {{ formatNumber(props.row.value) }}
                  <span v-if="factor?.unit" class="text-caption text-grey-7 q-ml-xs">
                    {{ factor.unit }}
                  </span>
                </q-td>
              </template>
            </q-table>
          </div>

          <!-- Empty State -->
          <div v-else class="text-center q-py-lg text-grey-7">
            <q-icon name="query_builder" size="48px" class="text-grey-5 q-mb-sm" />
            <div class="text-subtitle1 text-weight-medium">{{ $t("noTimeSeriesData") }}</div>
            <div class="text-caption text-grey-6 q-mb-md">{{ $t("noTimeSeriesHelp") }}</div>
            <q-btn
              v-if="!readOnly"
              unelevated
              color="primary"
              icon="upload_file"
              :label="$t('importSeriesBtn')"
              @click="activeTab = 'import'"
            />
          </div>
        </q-tab-panel>

        <!-- Tab 2: Import / Update Series -->
        <q-tab-panel v-if="!readOnly" name="import" class="q-pa-md">
          <div class="row q-col-gutter-md">
            <!-- Left: Input & Options -->
            <div class="col-12 col-md-6 column">
              <div class="row items-center justify-between q-mb-xs">
                <div class="text-subtitle2 text-weight-medium">{{ $t("importSeriesPasteTitle") }}</div>
                <div class="row q-gutter-xs">
                  <q-btn
                    outline
                    dense
                    size="sm"
                    color="primary"
                    icon="content_paste"
                    :label="$t('loadSampleTimeSeries')"
                    @click="loadSample"
                  />
                  <q-btn
                    flat
                    dense
                    size="sm"
                    color="grey-7"
                    icon="clear"
                    :label="$t('clearInput')"
                    @click="rawInput = ''"
                  />
                </div>
              </div>

              <q-input
                v-model="rawInput"
                type="textarea"
                outlined
                dense
                rows="8"
                class="font-mono text-caption col"
                :placeholder="$t('importSeriesPlaceholder')"
              />

              <q-input
                v-model="sourceCitation"
                dense
                outlined
                class="q-mt-sm"
                :label="$t('seriesSourceCitation')"
                :hint="$t('seriesSourceHint')"
              />
            </div>

            <!-- Right: Parse Preview & Overwrite Warning -->
            <div class="col-12 col-md-6 column">
              <div class="text-subtitle2 text-weight-medium q-mb-xs">
                {{ $t("parsedPreviewTitle") }}
                <span v-if="parsedPoints.length > 0" class="text-caption text-primary">
                  ({{ parsedPoints.length }} {{ $t("dataPoints") }})
                </span>
              </div>

              <!-- Overwrite Warning Banner if factor already has series (Non-silent overwrite guard) -->
              <q-banner
                v-if="existingPointsCount > 0 && parsedPoints.length > 0"
                dense
                rounded
                class="bg-amber-1 text-amber-10 border-amber q-mb-sm"
              >
                <template v-slot:avatar>
                  <q-icon name="warning" color="amber-9" />
                </template>
                <div class="text-caption text-weight-bold">
                  {{ $t("overwriteWarningTitle") }}
                </div>
                <div class="text-caption">
                  {{ $t("overwriteWarningMsg", { count: existingPointsCount, source: factor?.seriesProvenance?.sourceCitation || $t("unspecifiedSource") }) }}
                </div>
                <div class="row q-gutter-sm q-mt-xs">
                  <q-radio v-model="saveMode" val="replace" dense size="xs" :label="$t('overwriteOptionReplace')" />
                  <q-radio v-model="saveMode" val="merge" dense size="xs" :label="$t('overwriteOptionMerge')" />
                </div>
              </q-banner>

              <div v-if="parsedPoints.length === 0" class="col flex flex-center text-grey-5 border-dashed q-pa-md">
                <div class="text-center">
                  <q-icon name="preview" size="36px" class="q-mb-xs" />
                  <div class="text-caption">{{ $t("pasteToPreviewHelp") }}</div>
                </div>
              </div>

              <q-table
                v-else
                flat
                bordered
                dense
                :rows="parsedPoints"
                :columns="columns"
                row-key="date"
                class="col"
                style="max-height: 240px"
                virtual-scroll
                :rows-per-page-options="[0]"
              >
                <template v-slot:body-cell-type="props">
                  <q-td :props="props">
                    <q-badge
                      dense
                      :color="props.row.isPredicted ? 'purple' : 'teal'"
                      :label="props.row.isPredicted ? $t('seriesPredicted') : $t('seriesHistorical')"
                    />
                  </q-td>
                </template>
                <template v-slot:body-cell-value="props">
                  <q-td :props="props" class="font-mono">
                    {{ formatNumber(props.row.value) }}
                  </q-td>
                </template>
              </q-table>

              <div class="row justify-end q-mt-sm">
                <q-btn
                  unelevated
                  color="primary"
                  icon="save"
                  :label="$t('confirmSaveSeries')"
                  :disable="parsedPoints.length === 0"
                  :loading="isSaving"
                  @click="commitSeries"
                />
              </div>
            </div>
          </div>
        </q-tab-panel>
      </q-tab-panels>
    </q-card>
  </q-dialog>
</template>

<script>
import {
  parseTimeSeriesData,
  mergeTimeSeries,
  SAMPLE_TIME_SERIES
} from "@/utils/dataIngestion";
import { useAuthStore } from "@/store/store-auth";
import { formatNumber } from "@/utils/util-formatNumber";

export default {
  name: "FactorSeriesModal",
  props: {
    modelValue: {
      type: Boolean,
      default: false
    },
    factor: {
      type: Object,
      default: () => ({})
    },
    readOnly: {
      type: Boolean,
      default: false
    }
  },
  emits: ["update:modelValue", "save-series"],
  data() {
    return {
      activeTab: "current",
      rawInput: "",
      sourceCitation: "",
      saveMode: "replace",
      searchFilter: "",
      isSaving: false
    };
  },
  computed: {
    // Signed-in user's email; tolerates a missing Pinia like the old optional-chained store read.
    authUserEmail() {
      return this.$pinia ? useAuthStore(this.$pinia).user?.email : undefined;
    },
    existingPoints() {
      const s = this.factor?.timeSeries || this.factor?.series;
      return Array.isArray(s) ? s : [];
    },
    existingPointsCount() {
      return this.existingPoints.length;
    },
    historicalCount() {
      return this.existingPoints.filter(p => !p.isPredicted).length;
    },
    predictedCount() {
      return this.existingPoints.filter(p => p.isPredicted).length;
    },
    dateRange() {
      if (this.existingPoints.length === 0) return "";
      const sorted = [...this.existingPoints].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      const start = sorted[0]?.date || "";
      const end = sorted[sorted.length - 1]?.date || "";
      return start && end ? `${start} → ${end}` : start || end;
    },
    filteredCurrentPoints() {
      if (!this.searchFilter.trim()) return this.existingPoints;
      const q = this.searchFilter.toLowerCase().trim();
      return this.existingPoints.filter(p =>
        (p.date && p.date.toLowerCase().includes(q)) ||
        (p.sourceCitation && p.sourceCitation.toLowerCase().includes(q)) ||
        (p.notes && p.notes.toLowerCase().includes(q))
      );
    },
    parsedResult() {
      return parseTimeSeriesData(this.rawInput, {
        sourceCitation: this.sourceCitation,
        userEmail: this.authUserEmail || "user"
      });
    },
    parsedPoints() {
      return this.parsedResult.series;
    },
    columns() {
      return [
        {
          name: "date",
          required: true,
          label: this.$t("seriesColDate"),
          align: "left",
          field: "date",
          sortable: true
        },
        {
          name: "value",
          required: true,
          label: this.$t("seriesColValue"),
          align: "right",
          field: "value",
          sortable: true
        },
        {
          name: "type",
          label: this.$t("seriesColType"),
          align: "center",
          field: "isPredicted"
        },
        {
          name: "sourceCitation",
          label: this.$t("seriesColSource"),
          align: "left",
          field: row => row.sourceCitation || this.factor?.seriesProvenance?.sourceCitation || "",
          sortable: true
        }
      ];
    }
  },
  watch: {
    modelValue(val) {
      if (val) {
        this.activeTab = this.existingPointsCount > 0 ? "current" : "import";
        this.sourceCitation = this.factor?.sourceCitation || this.factor?.seriesProvenance?.sourceCitation || "";
      }
    }
  },
  methods: {
    formatNumber(val) {
      return formatNumber(val);
    },
    loadSample() {
      this.rawInput = SAMPLE_TIME_SERIES;
      if (!this.sourceCitation) {
        this.sourceCitation = "Sample Organization Ledger (Historical & Predictions)";
      }
    },
    commitSeries() {
      if (this.parsedPoints.length === 0) return;
      this.isSaving = true;

      try {
        const finalSeries = mergeTimeSeries(
          this.existingPoints,
          this.parsedPoints,
          this.saveMode
        );

        const provenance = {
          sourceCitation: this.sourceCitation || this.parsedResult.provenance.sourceCitation || "",
          importedAt: new Date().toISOString(),
          importedBy: this.authUserEmail || "user",
          pointCount: finalSeries.length,
          historicalCount: finalSeries.filter(p => !p.isPredicted).length,
          predictedCount: finalSeries.filter(p => p.isPredicted).length,
          startDate: finalSeries[0]?.date || "",
          endDate: finalSeries[finalSeries.length - 1]?.date || "",
          lastUpdated: new Date().toISOString()
        };

        this.$emit("save-series", {
          timeSeries: finalSeries,
          seriesProvenance: provenance
        });

        this.rawInput = "";
        this.activeTab = "current";
        this.$emit("update:modelValue", false);
      } finally {
        this.isSaving = false;
      }
    },
    confirmClearSeries() {
      this.$q.dialog({
        title: this.$t("clearSeriesBtn"),
        message: this.$t("clearSeriesConfirm"),
        cancel: true,
        persistent: true
      }).onOk(() => {
        this.$emit("save-series", {
          timeSeries: [],
          seriesProvenance: null
        });
      });
    }
  }
};
</script>

<style scoped>
.font-mono {
  font-family: monospace;
}
.border-amber {
  border: 1px solid #f59e0b;
}
.border-dashed {
  border: 1px dashed #d1d5db;
  border-radius: 4px;
}
</style>
