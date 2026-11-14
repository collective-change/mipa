<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" maximized>
    <q-card class="column full-height bg-grey-1">
      <q-card-section class="row items-center justify-between bg-white q-py-sm border-bottom">
        <div class="row items-center">
          <q-icon name="cloud_upload" color="primary" size="24px" class="q-mr-sm" />
          <div>
            <div class="text-h6 leading-tight">{{ $t("ingestDataTitle") }}</div>
            <div class="text-caption text-grey-7">{{ $t("ingestDataSubtitle") }}</div>
          </div>
        </div>
        <q-btn flat round dense icon="close" v-close-popup />
      </q-card-section>

      <q-tabs
        v-model="activeTab"
        dense
        align="left"
        class="bg-white text-grey-8"
        active-color="primary"
        indicator-color="primary"
      >
        <q-tab name="ingest" icon="upload_file" :label="$t('tabDocumentIngestion')" />
        <q-tab name="freshness" icon="update" :label="$t('tabFreshnessAudit')">
          <q-badge v-if="staleFactorsCount > 0" color="negative" floating rounded>
            {{ staleFactorsCount }}
          </q-badge>
        </q-tab>
        <q-tab name="accounting" icon="account_balance" :label="$t('tabAccountingStructure')" />
      </q-tabs>
      <q-separator />

      <q-tab-panels v-model="activeTab" animated class="col bg-grey-1">
        <!-- Tab 1: Document & Report Ingestion -->
        <q-tab-panel name="ingest" class="q-pa-md column">
          <div class="row q-col-gutter-md col">
            <!-- Left panel: input / paste / upload -->
            <div class="col-12 col-md-5 column">
              <q-card flat bordered class="bg-white q-pa-sm col column">
                <div class="text-subtitle2 text-weight-medium q-mb-xs">
                  {{ $t("ingestPasteTitle") }}
                </div>
                <div class="text-caption text-grey-7 q-mb-sm">
                  {{ $t("ingestPasteHelp") }}
                </div>

                <div class="row q-gutter-xs q-mb-sm">
                  <q-btn
                    outline
                    dense
                    size="sm"
                    color="primary"
                    icon="content_paste"
                    :label="$t('loadSampleFinancialTable')"
                    @click="loadSampleTable"
                  />
                  <q-btn
                    flat
                    dense
                    size="sm"
                    color="grey-8"
                    icon="clear"
                    :label="$t('clearInput')"
                    @click="rawTableText = ''; parsedProposals = []"
                  />
                </div>

                <q-input
                  v-model="rawTableText"
                  type="textarea"
                  outlined
                  dense
                  class="col font-mono"
                  :placeholder="$t('ingestPlaceholder')"
                  @update:model-value="onTextUpdated"
                />

                <div class="row q-col-gutter-xs q-mt-xs">
                  <div class="col-6">
                    <q-input
                      v-model="defaultPeriod"
                      dense
                      outlined
                      :label="$t('defaultReportingPeriod')"
                      placeholder="e.g. FY2026"
                      @update:model-value="reparse"
                    />
                  </div>
                  <div class="col-6">
                    <q-input
                      v-model="defaultCitation"
                      dense
                      outlined
                      :label="$t('defaultSourceCitation')"
                      placeholder="e.g. 2025 Annual Report, Note 4"
                      @update:model-value="reparse"
                    />
                  </div>
                </div>
              </q-card>
            </div>

            <!-- Right panel: extracted factor preview & batch import -->
            <div class="col-12 col-md-7 column">
              <q-card flat bordered class="bg-white q-pa-sm col column">
                <div class="row items-center justify-between q-mb-xs">
                  <div>
                    <div class="text-subtitle2 text-weight-medium">
                      {{ $t("extractedProposalsTitle") }}
                    </div>
                    <div class="text-caption text-grey-7">
                      {{ $t("extractedProposalsSubtitle", { count: parsedProposals.length }) }}
                    </div>
                  </div>
                  <div class="row q-gutter-xs">
                    <q-btn
                      unelevated
                      dense
                      no-caps
                      color="primary"
                      icon="save_alt"
                      :label="$t('importSelectedFactors', { count: selectedCount })"
                      :disable="selectedCount === 0"
                      :loading="isImporting"
                      @click="importSelectedFactors"
                    />
                  </div>
                </div>

                <div v-if="parsedProposals.length === 0" class="col flex flex-center text-grey-6">
                  <div class="text-center">
                    <q-icon name="table_view" size="48px" class="q-mb-sm" />
                    <div>{{ $t("noFactorsParsedYet") }}</div>
                  </div>
                </div>

                <q-table
                  v-else
                  flat
                  bordered
                  dense
                  :rows="parsedProposals"
                  :columns="proposalColumns"
                  row-key="id"
                  class="col"
                  virtual-scroll
                  :rows-per-page-options="[0]"
                >
                  <template v-slot:header-cell-selected="props">
                    <q-th :props="props" auto-width>
                      <q-checkbox v-model="allSelected" dense @update:model-value="toggleSelectAll" />
                    </q-th>
                  </template>
                  <template v-slot:body-cell-selected="props">
                    <q-td :props="props" auto-width>
                      <q-checkbox v-model="props.row.selected" dense />
                    </q-td>
                  </template>

                  <template v-slot:body-cell-costCategory="props">
                    <q-td :props="props">
                      <q-select
                        v-model="props.row.costCategory"
                        dense
                        borderless
                        options-dense
                        emit-value
                        map-options
                        :options="accountingCategoryOptions"
                      />
                    </q-td>
                  </template>

                  <template v-slot:body-cell-latestValue="props">
                    <q-td :props="props">
                      <span class="text-weight-bold text-primary">
                        {{ formatValue(props.row.latestValue) }}
                      </span>
                      <span v-if="props.row.unit" class="text-caption text-grey-7 q-ml-xs">
                        {{ props.row.unit }}
                      </span>
                    </q-td>
                  </template>
                </q-table>
              </q-card>
            </div>
          </div>
        </q-tab-panel>

        <!-- Tab 2: Freshness & Stale Data Audit -->
        <q-tab-panel name="freshness" class="q-pa-md">
          <q-card flat bordered class="bg-white q-pa-md q-mb-md">
            <div class="row items-center justify-between">
              <div>
                <div class="text-subtitle1 text-weight-bold text-primary">
                  {{ $t("freshnessAuditTitle") }}
                </div>
                <div class="text-caption text-grey-7">
                  {{ $t("freshnessAuditSubtitle") }}
                </div>
              </div>
              <div class="row q-gutter-sm">
                <q-chip dense color="positive" text-color="white">
                  {{ freshCount }} {{ $t("freshnessFresh") }}
                </q-chip>
                <q-chip dense color="warning" text-color="white">
                  {{ expiringCount }} {{ $t("freshnessExpiring") }}
                </q-chip>
                <q-chip dense color="negative" text-color="white">
                  {{ staleFactorsCount }} {{ $t("freshnessStale") }}
                </q-chip>
              </div>
            </div>
          </q-card>

          <q-table
            flat
            bordered
            dense
            :rows="auditedFactors"
            :columns="freshnessColumns"
            row-key="id"
            :rows-per-page-options="[15, 30, 50, 0]"
          >
            <template v-slot:body-cell-freshness="props">
              <q-td :props="props">
                <q-chip
                  dense
                  size="sm"
                  :color="props.row.freshness.color"
                  text-color="white"
                  class="text-weight-medium"
                >
                  {{ $t(props.row.freshness.labelKey) }}
                  <span v-if="props.row.freshness.daysElapsed !== null" class="q-ml-xs">
                    ({{ props.row.freshness.daysElapsed }}d)
                  </span>
                </q-chip>
              </q-td>
            </template>

            <template v-slot:body-cell-latestValue="props">
              <q-td :props="props">
                <span class="text-weight-bold">
                  {{ formatValue(props.row.latestValue) }}
                </span>
                <span class="text-caption text-grey-7 q-ml-xs">{{ props.row.unit }}</span>
              </q-td>
            </template>
          </q-table>
        </q-tab-panel>

        <!-- Tab 3: Accounting & Fiscal Period Cadence -->
        <q-tab-panel name="accounting" class="q-pa-md">
          <q-card flat bordered class="bg-white q-pa-md q-mb-md">
            <div class="row items-center justify-between">
              <div>
                <div class="text-subtitle1 text-weight-bold text-primary">
                  {{ $t("accountingStructureTitle") }}
                </div>
                <div class="text-caption text-grey-7">
                  {{ $t("accountingStructureSubtitle") }}
                </div>
              </div>
            </div>
          </q-card>

          <div class="row q-col-gutter-md">
            <div
              v-for="cat in accountingCategories"
              :key="cat.value"
              class="col-12 col-md-4"
            >
              <q-card flat bordered class="bg-white full-height">
                <q-card-section class="q-pb-xs">
                  <div class="row items-center justify-between">
                    <span class="text-weight-bold text-primary">{{ $t(cat.labelKey) }}</span>
                    <q-badge color="grey-3" text-color="grey-9">
                      {{ (groupedFactors[cat.value] || []).length }}
                    </q-badge>
                  </div>
                </q-card-section>
                <q-separator />
                <q-list dense separator class="q-py-none">
                  <q-item
                    v-for="f in (groupedFactors[cat.value] || [])"
                    :key="f.id"
                    class="q-py-xs"
                  >
                    <q-item-section>
                      <q-item-label class="text-weight-medium">{{ f.name }}</q-item-label>
                      <q-item-label caption>{{ f.symbol }}</q-item-label>
                    </q-item-section>
                    <q-item-section side>
                      <span class="text-weight-bold text-grey-9">
                        {{ formatValue(f.latestValue) }} {{ f.unit }}
                      </span>
                    </q-item-section>
                  </q-item>
                  <q-item v-if="!(groupedFactors[cat.value] || []).length">
                    <q-item-section class="text-caption text-grey-5 text-center q-pa-sm">
                      {{ $t("noFactorsInCategory") }}
                    </q-item-section>
                  </q-item>
                </q-list>
              </q-card>
            </div>
          </div>
        </q-tab-panel>
      </q-tab-panels>
    </q-card>
  </q-dialog>
</template>

<script>
import { mapState, mapGetters, mapActions } from "vuex";
import {
  ACCOUNTING_CATEGORIES,
  parseTabularData,
  evaluateFactorFreshness,
  groupFactorsByCategory,
  createAuditTrailEntry
} from "@/utils/dataIngestion";

export const SAMPLE_FINANCIAL_TABLE = `Account / Metric,Baseline Value,Unit,Category,Reporting Period,Effective Date,Source Citation
Direct Program Expenses,420000,USD,direct_program,FY2025,2025-12-31,2025 Audited Financial Statement Note 5
General Administration Overhead,85000,USD,overhead,FY2025,2025-12-31,2025 Audited Financial Statement Note 6
Facility Solar Installation,150000,USD,capital,FY2025,2025-11-15,Clean Power Capital Improvement Ledger
Active Volunteers,450,people,social_benefit,FY2025,2025-12-31,Volunteer Census Q4 2025
Beneficiary Meals Served,120000,meals,social_benefit,FY2025,2025-12-31,Food Relief Program Evaluation p.12`;

export default {
  props: {
    modelValue: { type: Boolean, default: false }
  },
  emits: ["update:modelValue"],
  data() {
    return {
      activeTab: "ingest",
      rawTableText: "",
      defaultPeriod: "",
      defaultCitation: "",
      parsedProposals: [],
      allSelected: true,
      isImporting: false,
      accountingCategories: ACCOUNTING_CATEGORIES,
      proposalColumns: [
        { name: "selected", label: "", align: "center", field: "selected" },
        { name: "name", label: this.$t("factorName"), align: "left", field: "name" },
        { name: "symbol", label: this.$t("Short name"), align: "left", field: "symbol" },
        { name: "latestValue", label: this.$t("Current value (optional)"), align: "right", field: "latestValue" },
        { name: "costCategory", label: this.$t("costCategory"), align: "left", field: "costCategory" },
        { name: "reportingPeriod", label: this.$t("reportingPeriod"), align: "left", field: "reportingPeriod" },
        { name: "sourceCitation", label: this.$t("sourceCitation"), align: "left", field: "sourceCitation" }
      ],
      freshnessColumns: [
        { name: "freshness", label: this.$t("freshnessStatus"), align: "left", field: "freshness" },
        { name: "name", label: this.$t("Factor"), align: "left", field: "name" },
        { name: "symbol", label: this.$t("Short name"), align: "left", field: "symbol" },
        { name: "latestValue", label: this.$t("Current value (optional)"), align: "right", field: "latestValue" },
        { name: "costCategory", label: this.$t("costCategory"), align: "left", field: "costCategory" },
        { name: "reportingPeriod", label: this.$t("reportingPeriod"), align: "left", field: "reportingPeriod" },
        { name: "effectiveDate", label: this.$t("effectiveDate"), align: "left", field: "effectiveDate" },
        { name: "sourceCitation", label: this.$t("sourceCitation"), align: "left", field: "sourceCitation" }
      ]
    };
  },
  computed: {
    ...mapState("orgs", ["currentOrg"]),
    ...mapState("model", ["currentModel"]),
    ...mapGetters("model", ["nodes"]),
    ...mapState("auth", ["userEmail"]),

    accountingCategoryOptions() {
      return this.accountingCategories.map((c) => ({
        value: c.value,
        label: this.$t(c.labelKey)
      }));
    },

    selectedCount() {
      return this.parsedProposals.filter((p) => p.selected).length;
    },

    auditedFactors() {
      return (this.nodes || []).map((node) => ({
        ...node,
        freshness: evaluateFactorFreshness(node)
      }));
    },

    freshCount() {
      return this.auditedFactors.filter((f) => f.freshness.status === "fresh").length;
    },

    expiringCount() {
      return this.auditedFactors.filter((f) => f.freshness.status === "expiring").length;
    },

    staleFactorsCount() {
      return this.auditedFactors.filter((f) => f.freshness.status === "stale").length;
    },

    groupedFactors() {
      return groupFactorsByCategory(this.nodes || []);
    }
  },
  methods: {
    ...mapActions("model", ["addNode", "updateNode"]),

    onTextUpdated() {
      this.reparse();
    },

    reparse() {
      const parsed = parseTabularData(this.rawTableText, {
        defaultPeriod: this.defaultPeriod,
        defaultCitation: this.defaultCitation,
        defaultUnit: this.currentOrg?.currency || ""
      });
      this.parsedProposals = parsed.map((p) => ({ ...p, selected: true }));
      this.allSelected = true;
    },

    loadSampleTable() {
      this.rawTableText = SAMPLE_FINANCIAL_TABLE;
      this.reparse();
    },

    toggleSelectAll(val) {
      this.parsedProposals.forEach((p) => {
        p.selected = val;
      });
    },

    formatValue(val) {
      if (typeof val === "number") return val.toLocaleString();
      return val ?? "-";
    },

    async importSelectedFactors() {
      const toImport = this.parsedProposals.filter((p) => p.selected);
      if (toImport.length === 0) return;

      this.isImporting = true;
      let added = 0;
      let updated = 0;

      const modelId = this.currentModel?.id || this.$route?.params?.modelId;

      for (const proposal of toImport) {
        // Check if factor already exists by symbol or name
        const existing = (this.nodes || []).find(
          (n) => n.symbol === proposal.symbol || n.name.toLowerCase() === proposal.name.toLowerCase()
        );

        if (existing) {
          await this.updateNode({
            modelId,
            updates: {
              id: existing.id,
              latestValue: proposal.latestValue,
              unit: proposal.unit || existing.unit,
              costCategory: proposal.costCategory || existing.costCategory,
              reportingPeriod: proposal.reportingPeriod || existing.reportingPeriod,
              effectiveDate: proposal.effectiveDate || existing.effectiveDate,
              sourceCitation: proposal.sourceCitation || existing.sourceCitation
            }
          });
          createAuditTrailEntry(
            existing,
            existing.latestValue,
            proposal.latestValue,
            this.userEmail,
            proposal.sourceCitation,
            proposal.reportingPeriod
          );
          updated++;
        } else {
          await this.addNode({
            modelId,
            node: {
              name: proposal.name,
              symbol: proposal.symbol,
              unit: proposal.unit,
              latestValue: proposal.latestValue,
              symbolFormula: "",
              sysFormula: "",
              costCategory: proposal.costCategory,
              reportingPeriod: proposal.reportingPeriod,
              effectiveDate: proposal.effectiveDate,
              sourceCitation: proposal.sourceCitation,
              isHourlyCost: false,
              isEstimate: !proposal.isVerified
            }
          });
          added++;
        }
      }

      this.isImporting = false;
      if (this.$q && typeof this.$q.notify === "function") {
        this.$q.notify({
          type: "positive",
          message: this.$t("toastIngestSuccess", { added, updated })
        });
      }
      this.$emit("update:modelValue", false);
    }
  }
};
</script>

<style scoped>
.font-mono {
  font-family: monospace;
}
.border-bottom {
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}
</style>
