<template>
  <q-dialog
    v-model="isOpen"
    persistent
    maximized
    transition-show="slide-up"
    transition-hide="slide-down"
  >
    <q-card class="column full-height bg-grey-1 print-card">
      <!-- Top Action Bar (hidden when printing) -->
      <q-card-section class="row items-center justify-between bg-primary text-white q-py-sm print-hide shadow-2">
        <div class="row items-center q-gutter-sm">
          <q-icon name="description" size="md" />
          <div>
            <div class="text-h6 text-weight-bold">{{ $t("decisionBrief") }}</div>
            <div class="text-caption text-blue-1">{{ $t("briefSubtitle") }}</div>
          </div>
        </div>

        <div class="row items-center q-gutter-sm">
          <!-- Verification Badge -->
          <q-chip
            v-if="verificationResult.valid"
            color="positive"
            text-color="white"
            icon="verified"
            dense
          >
            {{ $t("verifiedNumbersBadge") }}
          </q-chip>
          <q-chip
            v-else
            color="warning"
            text-color="dark"
            icon="warning"
            dense
          >
            {{ $t("unverifiedNumbersAlert") }}
          </q-chip>

          <!-- Edit Mode Toggle -->
          <q-btn
            flat
            dense
            no-caps
            :icon="isEditing ? 'check' : 'edit'"
            :label="isEditing ? $t('doneEditing') : $t('editBrief')"
            @click="isEditing = !isEditing"
          />

          <!-- Export Actions -->
          <q-btn-dropdown
            flat
            dense
            no-caps
            icon="file_download"
            :label="$t('briefExport')"
          >
            <q-list dense>
              <q-item clickable v-close-popup @click="exportMarkdown">
                <q-item-section avatar>
                  <q-icon name="code" color="primary" />
                </q-item-section>
                <q-item-section>{{ $t("exportMarkdown") }}</q-item-section>
              </q-item>
              <q-item clickable v-close-popup @click="exportCsv">
                <q-item-section avatar>
                  <q-icon name="table_chart" color="primary" />
                </q-item-section>
                <q-item-section>{{ $t("exportCsv") }}</q-item-section>
              </q-item>
              <q-item clickable v-close-popup @click="copyToClipboard">
                <q-item-section avatar>
                  <q-icon name="content_copy" color="primary" />
                </q-item-section>
                <q-item-section>{{ $t("copyBrief") }}</q-item-section>
              </q-item>
            </q-list>
          </q-btn-dropdown>

          <!-- Print / PDF Button -->
          <q-btn
            color="white"
            text-color="primary"
            unelevated
            no-caps
            icon="print"
            :label="$t('printPdf')"
            @click="printBrief"
          />

          <q-btn icon="close" flat round dense v-close-popup />
        </div>
      </q-card-section>

      <!-- Selection & Presets Toolbar (hidden when printing) -->
      <q-card-section class="bg-white q-py-sm border-bottom print-hide">
        <div class="row items-center justify-between q-col-gutter-sm">
          <div class="col-12 col-md-7">
            <q-select
              dense
              outlined
              multiple
              use-chips
              v-model="selectedActionIds"
              :options="allActionOptions"
              emit-value
              map-options
              :label="$t('selectActionsToCompare')"
              class="full-width"
            >
              <template v-slot:selected-item="scope">
                <q-chip
                  removable
                  dense
                  @remove="scope.removeAtIndex(scope.index)"
                  :tabindex="scope.tabindex"
                  color="blue-1"
                  text-color="primary"
                >
                  {{ scope.opt.label }}
                </q-chip>
              </template>
            </q-select>
          </div>

          <div class="col-12 col-md-5 row items-center justify-end q-gutter-xs">
            <span class="text-caption text-grey-7 q-mr-xs">{{ $t("quickSelect") }}:</span>
            <q-btn
              outline
              size="sm"
              no-caps
              color="primary"
              :label="$t('top3')"
              @click="selectTopN(3)"
            />
            <q-btn
              outline
              size="sm"
              no-caps
              color="primary"
              :label="$t('top5')"
              @click="selectTopN(5)"
            />
            <q-btn
              outline
              size="sm"
              no-caps
              color="primary"
              :label="$t('positiveLeverageOnly')"
              @click="selectPositive"
            />
            <q-btn
              outline
              size="sm"
              no-caps
              color="grey-8"
              :label="$t('allOptions')"
              @click="selectAll"
            />
          </div>
        </div>
      </q-card-section>

      <!-- Warning Banner if Unverified Numbers Found -->
      <q-banner
        v-if="!verificationResult.valid && !isPrinting"
        class="bg-amber-1 text-dark q-mx-md q-mt-md rounded-borders print-hide"
      >
        <template v-slot:avatar>
          <q-icon name="warning" color="warning" />
        </template>
        <div class="text-weight-bold">{{ $t("unverifiedNumbersAlert") }}:</div>
        <div class="text-caption">
          {{ verificationResult.unverifiedNumbers.join(", ") }}
        </div>
      </q-banner>

      <!-- Main Executive Document Container -->
      <q-card-section class="col q-pa-lg scroll print-document-container">
        <div class="brief-document bg-white shadow-1 q-pa-xl q-mx-auto">
          <!-- Document Header -->
          <div class="brief-header q-mb-lg border-bottom q-pb-md">
            <div class="row items-center justify-between">
              <div>
                <div class="text-overline text-primary text-weight-bold">
                  {{ briefData.metadata.orgName }} • {{ briefData.metadata.modelName }}
                </div>
                <div class="text-h4 text-weight-bolder text-grey-10 q-mt-xs">
                  {{ $t("decisionBrief") }}
                </div>
              </div>
              <div class="text-right text-caption text-grey-7">
                <div><strong>{{ $t("docDate") }}:</strong> {{ formattedDate }}</div>
                <div><strong>{{ $t("preparedBy") }}:</strong> {{ briefData.metadata.authorName }}</div>
                <div v-if="editedByMeta" class="text-primary text-italic q-mt-xs">
                  {{ editedByMeta }}
                </div>
              </div>
            </div>
          </div>

          <!-- SECTION 1: The Decision in One Sentence & Options Compared -->
          <div class="section-block q-mb-xl">
            <div class="text-h6 text-weight-bold text-primary q-mb-sm row items-center">
              <span class="section-num q-mr-sm">1</span>
              {{ briefData.section1.title }}
            </div>

            <div v-if="!isEditing" class="decision-thesis-box q-pa-md bg-blue-1 rounded-borders border-primary q-mb-md">
              <div class="text-subtitle1 text-weight-bold text-blue-10">
                {{ editableSection1Decision || briefData.section1.decisionQuestion }}
              </div>
            </div>
            <q-input
              v-else
              v-model="editableSection1Decision"
              outlined
              type="textarea"
              rows="2"
              :label="$t('decisionQuestionLabel')"
              class="q-mb-md"
            />

            <div class="text-body1 text-grey-9" style="line-height: 1.7">
              {{ briefData.section1.optionsOverview }}
            </div>
          </div>

          <!-- SECTION 2: Structured Numbers Table Computed by Mipa -->
          <div class="section-block q-mb-xl">
            <div class="text-h6 text-weight-bold text-primary q-mb-sm row items-center">
              <span class="section-num q-mr-sm">2</span>
              {{ briefData.section2.title }}
            </div>

            <q-table
              flat
              bordered
              :rows="briefData.section2.options"
              :columns="tableColumns"
              row-key="id"
              hide-pagination
              :pagination="{ rowsPerPage: 0 }"
              class="brief-table"
            >
              <template v-slot:body-cell-rank="props">
                <q-td :props="props">
                  <q-badge
                    :color="props.value === 1 ? 'primary' : 'grey-7'"
                    :label="'#' + props.value"
                    class="text-weight-bold"
                  />
                </q-td>
              </template>

              <template v-slot:body-cell-title="props">
                <q-td :props="props">
                  <span class="text-weight-bold text-grey-10">{{ props.row.title }}</span>
                  <div v-if="props.row.drivers && props.row.drivers.length" class="text-caption text-grey-7">
                    {{ props.row.drivers.map(d => `${d.name} (${d.operation}${d.operand} ${d.unit})`).join('; ') }}
                  </div>
                </q-td>
              </template>

              <template v-slot:body-cell-actionLeverage="props">
                <q-td :props="props" class="text-weight-bolder" :class="props.row.rank === 1 ? 'text-primary' : ''">
                  {{ formatRatio(props.value) }}
                </q-td>
              </template>

              <template v-slot:body-cell-sroiRatio="props">
                <q-td :props="props">
                  <q-badge v-if="props.value" color="positive" text-color="white" dense>
                    {{ formatRatio(props.value) }}
                  </q-badge>
                  <span v-else class="text-grey-5">-</span>
                </q-td>
              </template>

              <template v-slot:body-cell-marginalNetTotalBenefitNpv="props">
                <q-td :props="props">
                  {{ formatAmount(props.value) }}
                </q-td>
              </template>

              <template v-slot:body-cell-outstandingDirectCosts="props">
                <q-td :props="props">
                  {{ formatAmount(props.value) }}
                </q-td>
              </template>

              <template v-slot:body-cell-uncertaintySummary="props">
                <q-td :props="props">
                  <q-chip
                    dense
                    size="sm"
                    :color="props.row.hasUncertainInputs ? 'amber-2' : 'green-1'"
                    :text-color="props.row.hasUncertainInputs ? 'amber-10' : 'positive'"
                  >
                    {{ props.value }}
                  </q-chip>
                </q-td>
              </template>
            </q-table>
          </div>

          <!-- SECTION 3: Why the Top Option Ranks First in Plain Words -->
          <div class="section-block q-mb-xl">
            <div class="text-h6 text-weight-bold text-primary q-mb-sm row items-center">
              <span class="section-num q-mr-sm">3</span>
              {{ briefData.section3.title }}
            </div>

            <div
              v-if="!isEditing"
              class="text-body1 text-grey-9 brief-narrative q-pa-md bg-grey-1 rounded-borders"
              style="white-space: pre-line; line-height: 1.8"
            >
              {{ editableSection3Narrative || briefData.section3.narrative }}
            </div>
            <q-input
              v-else
              v-model="editableSection3Narrative"
              outlined
              type="textarea"
              rows="6"
              class="q-mb-md"
            />
          </div>

          <!-- SECTION 4: Key Assumptions the Ranking Depends on Most -->
          <div class="section-block q-mb-xl">
            <div class="text-h6 text-weight-bold text-primary q-mb-sm row items-center">
              <span class="section-num q-mr-sm">4</span>
              {{ briefData.section4.title }}
            </div>

            <div
              v-if="!isEditing"
              class="text-body1 text-grey-9 brief-narrative q-pa-md bg-grey-1 rounded-borders"
              style="white-space: pre-line; line-height: 1.8"
            >
              {{ editableSection4Narrative || briefData.section4.narrative }}
            </div>
            <q-input
              v-else
              v-model="editableSection4Narrative"
              outlined
              type="textarea"
              rows="5"
              class="q-mb-md"
            />

            <!-- Sensitivity Turning Points Table (Feature 3) -->
            <div
              v-if="briefData.section4.sensitivity && briefData.section4.sensitivity.turningPoints && briefData.section4.sensitivity.turningPoints.length"
              class="q-mt-md"
            >
              <div class="row items-center justify-between q-mb-xs">
                <div class="text-subtitle2 text-grey-8 row items-center">
                  <q-icon name="crisis_alert" class="q-mr-xs" color="primary" />
                  {{ $t("turningPointAnalysis") }}
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
                    color="grey-2"
                    text-color="grey-8"
                    :options="perturbationOptions"
                  />
                </div>
              </div>
              <q-table
                flat
                bordered
                dense
                :rows="briefData.section4.sensitivity.turningPoints"
                :columns="turningPointColumns"
                row-key="id"
                hide-pagination
                :pagination="{ rowsPerPage: 0 }"
                class="brief-table q-mb-md"
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
            </div>

            <!-- Organizational Guardrails Safety Card -->
            <div class="q-mt-md">
              <div class="row items-center q-mb-xs">
                <div class="text-subtitle2 text-grey-8 row items-center">
                  <q-icon name="shield" class="q-mr-xs" color="primary" />
                  {{ $t("guardrailSectionTitle") }}
                </div>
              </div>

              <div
                v-if="briefData.section4.guardrailViolations && briefData.section4.guardrailViolations.length"
                class="bg-red-1 border-negative rounded-borders q-pa-sm q-mb-md"
              >
                <div class="row items-center text-negative text-weight-bold q-mb-xs">
                  <q-icon name="warning" class="q-mr-xs" size="sm" />
                  {{ $t("guardrailBreachDetected") }}
                </div>
                <q-table
                  flat
                  bordered
                  dense
                  :rows="briefData.section4.guardrailViolations"
                  :columns="guardrailColumns"
                  row-key="factorId"
                  hide-pagination
                  :pagination="{ rowsPerPage: 0 }"
                  class="bg-white"
                />
              </div>

              <div
                v-else
                class="bg-green-1 text-positive rounded-borders q-pa-sm q-mb-md row items-center"
              >
                <q-icon name="verified_user" class="q-mr-sm" size="sm" />
                <span class="text-body2">{{ $t("guardrailsAllSafe") }}</span>
              </div>
            </div>
          </div>

          <!-- SECTION 5: What the Brief Does Not Cover (Unmodeled Considerations) -->
          <div class="section-block q-mb-lg">
            <div class="text-h6 text-weight-bold text-primary q-mb-sm row items-center">
              <span class="section-num q-mr-sm">5</span>
              {{ briefData.section5.title }}
            </div>

            <div
              v-if="!isEditing"
              class="text-body1 text-grey-9 brief-narrative q-pa-md bg-grey-1 rounded-borders"
              style="white-space: pre-line; line-height: 1.8"
            >
              {{ editableSection5Narrative || briefData.section5.narrative }}
            </div>
            <q-input
              v-else
              v-model="editableSection5Narrative"
              outlined
              type="textarea"
              rows="4"
              class="q-mb-md"
            />
          </div>

          <!-- Document Footer -->
          <div class="brief-footer border-top q-pt-md q-mt-xl text-center text-caption text-grey-6">
            {{ $t("briefDisclaimer") }}
          </div>
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script>
import { mapState, mapGetters } from "vuex";
import { exportFile, Notify } from "quasar";
import { firebaseAuth } from "@/boot/firebase";
import { formatNumber } from "@/utils/util-formatNumber";
import {
  generateDecisionBrief,
  validateBriefNumbers,
  formatBriefAsMarkdown,
  formatBriefAsCsv,
  formatCurrencyValue,
  formatRatioValue
} from "@/utils/decisionBrief";

export default {
  name: "DecisionBriefModal",
  props: {
    modelValue: {
      type: Boolean,
      default: false
    },
    initialActions: {
      type: Array,
      default: () => []
    }
  },
  emits: ["update:modelValue"],
  data() {
    return {
      selectedActionIds: [],
      isEditing: false,
      editableSection1Decision: "",
      editableSection3Narrative: "",
      editableSection4Narrative: "",
      editableSection5Narrative: "",
      editorName: "",
      editedAt: null,
      isPrinting: false,
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
    ...mapState("model", ["currentModel"]),
    ...mapGetters("model", ["nodes"]),
    isOpen: {
      get() {
        return this.modelValue;
      },
      set(val) {
        this.$emit("update:modelValue", val);
      }
    },
    allActionOptions() {
      if (!this.matchingActions) return [];
      return this.matchingActions.map((a) => ({
        label: `${a.title} (${this.$t("Leverage")}: ${formatRatioValue(a.actionLeverage)})`,
        value: a.id
      }));
    },
    actionsToCompare() {
      if (!this.matchingActions || this.matchingActions.length === 0) return [];
      if (this.selectedActionIds.length > 0) {
        const set = new Set(this.selectedActionIds);
        return this.matchingActions.filter((a) => set.has(a.id));
      }
      return this.matchingActions;
    },
    briefData() {
      const locale = this.$i18n.locale;
      const currency = this.currentOrg ? this.currentOrg.currency : "";
      const orgName = this.currentOrg ? this.currentOrg.name : "";
      const modelName = this.currentModel ? this.currentModel.name : "";
      const authorName = (firebaseAuth.currentUser && (firebaseAuth.currentUser.displayName || firebaseAuth.currentUser.email)) || "Decision Staff";

      return generateDecisionBrief(this.actionsToCompare, this.nodes, {
        locale,
        currency,
        orgName,
        modelName,
        authorName,
        decisionQuestion: this.editableSection1Decision,
        perturbationRange: this.perturbationPercent / 100
      }) || {
        metadata: { orgName: "", modelName: "", authorName: "", generatedAt: new Date().toISOString() },
        section1: { title: "", decisionQuestion: "", optionsOverview: "" },
        section2: { title: "", options: [] },
        section3: { title: "", narrative: "" },
        section4: { title: "", narrative: "" },
        section5: { title: "", narrative: "" },
        verifiedNumbers: []
      };
    },
    verificationResult() {
      const fullText = [
        this.editableSection1Decision || this.briefData.section1.decisionQuestion,
        this.editableSection3Narrative || this.briefData.section3.narrative,
        this.editableSection4Narrative || this.briefData.section4.narrative,
        this.editableSection5Narrative || this.briefData.section5.narrative
      ].join("\n");

      return validateBriefNumbers(fullText, this.briefData.verifiedNumbers || []);
    },
    formattedDate() {
      return new Date(this.briefData.metadata.generatedAt).toLocaleDateString(
        this.$i18n.locale.startsWith("zh") ? "zh-TW" : "en-US",
        { year: "numeric", month: "long", day: "numeric" }
      );
    },
    editedByMeta() {
      if (!this.editedAt) return "";
      const dateStr = new Date(this.editedAt).toLocaleDateString();
      return this.$t("editedByOn", { name: this.editorName, date: dateStr });
    },
    tableColumns() {
      const cur = this.currentOrg && this.currentOrg.currency ? ` (${this.currentOrg.currency})` : "";
      return [
        { name: "rank", label: this.$t("rankCol"), field: "rank", align: "center", sortable: true },
        { name: "title", label: this.$t("Title") || "Option", field: "title", align: "left", sortable: true },
        { name: "actionLeverage", label: this.$t("Leverage"), field: "actionLeverage", align: "right", sortable: true },
        { name: "sroiRatio", label: "SROI", field: "sroiRatio", align: "right", sortable: true },
        { name: "marginalNetTotalBenefitNpv", label: `${this.$t("marginalNetTotalBenefitNpv")}${cur}`, field: "marginalNetTotalBenefitNpv", align: "right", sortable: true },
        { name: "totalRoi", label: this.$t("totalRoi"), field: "totalRoi", align: "right", sortable: true },
        { name: "outstandingDirectCosts", label: `${this.$t("outstandingDirectCost")}${cur}`, field: "outstandingDirectCosts", align: "right", sortable: true },
        { name: "estEffortHrs", label: this.$t("hoursCol"), field: "estEffortHrs", align: "right", sortable: true },
        { name: "uncertaintySummary", label: this.$t("statusCol"), field: "uncertaintySummary", align: "center" }
      ];
    },
    turningPointColumns() {
      return [
        { name: "name", label: this.$t("assumptionName"), field: "name", align: "left" },
        { name: "baseValue", label: this.$t("baseEstimate"), field: (row) => `${formatNumber(row.baseValue, 2)} ${row.unit || ''}`.trim(), align: "right" },
        { name: "turningPoint", label: this.$t("flippingThreshold"), field: (row) => `${formatNumber(row.turningPoint, 2)} ${row.unit || ''}`.trim(), align: "right" },
        { name: "percentShift", label: this.$t("requiredShift"), field: "percentShift", align: "right" },
        { name: "robustness", label: this.$t("statusCol"), field: "robustness", align: "center" }
      ];
    },
    guardrailColumns() {
      return [
        { name: "actionTitle", label: this.$t("Title"), field: "actionTitle", align: "left" },
        { name: "factorName", label: this.$t("factorName"), field: "factorName", align: "left" },
        {
          name: "threshold",
          label: this.$t("guardrailThreshold"),
          field: (row) => `${this.$t(row.boundType === "min" ? "guardrailMin" : "guardrailMax")}: ${row.threshold} ${row.unit}`,
          align: "right"
        },
        {
          name: "worstValue",
          label: this.$t("projectedWorstValue"),
          field: (row) => `${row.worstValue} ${row.unit}`,
          align: "right"
        },
        {
          name: "breachMagnitude",
          label: this.$t("breachMagnitudeLabel"),
          field: (row) => `+${row.breachMagnitude} ${row.unit}`,
          align: "right"
        }
      ];
    }
  },
  watch: {
    initialActions: {
      immediate: true,
      handler(actions) {
        if (Array.isArray(actions) && actions.length > 0) {
          this.selectedActionIds = actions.map((a) => a.id);
        } else if (this.matchingActions && this.matchingActions.length > 0) {
          this.selectedActionIds = this.matchingActions.slice(0, 5).map((a) => a.id);
        }
      }
    },
    isEditing(newVal, oldVal) {
      if (oldVal && !newVal) {
        // User finished editing
        this.editorName = (firebaseAuth.currentUser && (firebaseAuth.currentUser.displayName || firebaseAuth.currentUser.email)) || "Staff";
        this.editedAt = new Date().toISOString();
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
    selectTopN(n) {
      if (!this.matchingActions) return;
      const sorted = [...this.matchingActions].sort((a, b) => (b.actionLeverage ?? -Infinity) - (a.actionLeverage ?? -Infinity));
      this.selectedActionIds = sorted.slice(0, n).map((a) => a.id);
    },
    selectPositive() {
      if (!this.matchingActions) return;
      this.selectedActionIds = this.matchingActions.filter((a) => (a.actionLeverage ?? 0) > 0).map((a) => a.id);
    },
    selectAll() {
      if (!this.matchingActions) return;
      this.selectedActionIds = this.matchingActions.map((a) => a.id);
    },
    printBrief() {
      this.isPrinting = true;
      setTimeout(() => {
        window.print();
        this.isPrinting = false;
      }, 200);
    },
    exportMarkdown() {
      const mdContent = formatBriefAsMarkdown(this.briefData);
      const filename = `Decision_Brief_${(this.currentOrg?.name || "Brief").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.md`;
      const status = exportFile(filename, mdContent, "text/markdown");
      if (status !== true) {
        Notify.create({ type: "negative", message: "Browser denied file download" });
      }
    },
    exportCsv() {
      const csvContent = formatBriefAsCsv(this.briefData);
      const filename = `Decision_Brief_Matrix_${(this.currentOrg?.name || "Brief").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
      const status = exportFile(filename, csvContent, "text/csv");
      if (status !== true) {
        Notify.create({ type: "negative", message: "Browser denied file download" });
      }
    },
    async copyToClipboard() {
      const mdContent = formatBriefAsMarkdown(this.briefData);
      try {
        await navigator.clipboard.writeText(mdContent);
        Notify.create({
          type: "positive",
          message: this.$t("briefCopied"),
          timeout: 2000
        });
      } catch (err) {
        console.error("Clipboard copy failed:", err);
      }
    }
  }
};
</script>

<style scoped>
.brief-document {
  max-width: 900px;
  min-height: 1000px;
  border-radius: 4px;
}

.border-bottom {
  border-bottom: 1px solid #e2e8f0;
}

.border-top {
  border-top: 1px solid #e2e8f0;
}

.border-primary {
  border-left: 4px solid var(--q-primary);
}

.section-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background-color: var(--q-primary);
  color: white;
  border-radius: 50%;
  font-size: 13px;
  font-weight: bold;
}

/* Print Optimization for 1-2 page Leadership Brief */
@media print {
  /* Hide all app shell elements, dialog backdrops, headers */
  :global(body *),
  .print-hide,
  :global(.q-header),
  :global(.q-drawer),
  :global(.q-dialog__backdrop) {
    visibility: hidden !important;
  }

  .print-card,
  .print-document-container,
  .brief-document,
  .brief-document * {
    visibility: visible !important;
  }

  .print-document-container {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    padding: 0 !important;
    margin: 0 !important;
    overflow: visible !important;
  }

  .brief-document {
    box-shadow: none !important;
    max-width: 100% !important;
    width: 100% !important;
    padding: 20mm !important;
    margin: 0 !important;
  }

  .section-block {
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .brief-table {
    page-break-inside: avoid;
    break-inside: avoid;
  }
}
</style>
