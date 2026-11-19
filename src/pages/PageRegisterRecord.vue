<template>
  <q-page class="register-record-page q-pa-md q-pa-md-xl">
    <div class="register-container">
      <!-- Breadcrumb / Record Meta Bar -->
      <div class="row items-center justify-between q-mb-md no-print">
        <div class="row items-center q-gutter-xs text-caption text-grey-7">
          <router-link to="/" class="text-primary text-weight-medium text-decoration-none">
            {{ $t("home") || "Home" }}
          </router-link>
          <span>/</span>
          <span>{{ $t("decisionRegisterTitle") || "Decision Register" }}</span>
          <span>/</span>
          <span class="text-grey-9 text-weight-bold">{{ record.recordId }}</span>
        </div>
        <div class="row items-center q-gutter-sm">
          <q-btn
            outline
            dense
            no-caps
            size="sm"
            color="primary"
            icon="content_copy"
            :label="$t('copyCitationBtn') || 'Copy Citation'"
            @click="copyCitation"
          />
          <q-btn
            unelevated
            dense
            no-caps
            size="sm"
            color="grey-8"
            icon="print"
            :label="$t('exportPdfBtn') || 'Print / Export'"
            @click="printRecord"
          />
        </div>
      </div>

      <!-- Record Header Card -->
      <div class="record-header q-mb-lg q-pa-lg bg-white rounded-borders border-grey">
        <div class="row items-start justify-between q-col-gutter-md">
          <div class="col-12 col-md-8">
            <div class="row items-center q-gutter-xs q-mb-xs">
              <q-badge color="primary" text-color="white" class="text-weight-bold">
                {{ $t("permanentRegisterEntry") || "Permanent Register Entry" }}
              </q-badge>
              <q-badge color="grey-3" text-color="grey-9" class="text-weight-medium">
                {{ record.version }}
              </q-badge>
              <q-badge color="teal-1" text-color="teal-9" class="text-weight-bold">
                {{ $t("notErasableBadge") || "Non-Erasable · Citable" }}
              </q-badge>
            </div>
            <h1 class="text-h4 text-weight-bolder text-grey-9 q-my-xs">
              {{ record.title }}
            </h1>
            <p class="text-body2 text-grey-8 q-my-sm leading-relaxed">
              {{ record.governancePrinciple }}
            </p>
          </div>
          <div class="col-12 col-md-4 text-left text-md-right text-caption text-grey-7">
            <div class="q-mb-xs">
              <strong>{{ $t("publishedDateLabel") || "Published" }}:</strong> {{ record.publishedDate }}
            </div>
            <div class="q-mb-xs">
              <strong>{{ $t("citationIdLabel") || "Citation ID" }}:</strong>
              <code class="text-weight-bold text-grey-9 q-ml-xs bg-grey-2 q-pa-xs rounded-borders">{{ record.citationId }}</code>
            </div>
            <div class="text-grey-6 text-italic q-mt-xs">
              {{ record.methodology }}
            </div>
          </div>
        </div>
      </div>

      <!-- Section 1: The Six Claims of Verification (Precedes Capabilities) -->
      <div class="q-mb-lg bg-white q-pa-md q-pa-md-lg rounded-borders border-grey">
        <div class="row items-center justify-between q-mb-xs">
          <div class="text-subtitle1 text-weight-bold text-grey-9 row items-center">
            <q-icon name="verified_user" color="primary" class="q-mr-xs" size="22px" />
            {{ $t("claimsSeparationTitle") || "Separation of Claims & Verification Modes" }}
          </div>
          <q-badge color="blue-1" text-color="primary" class="text-weight-bold">
            {{ $t("precedesCapabilitiesBadge") || "Precedes Capabilities" }}
          </q-badge>
        </div>
        <p class="text-caption text-grey-7 q-mb-md">
          {{ $t("claimsSeparationSubtitle") || "Claims are separated into mechanical verification, input attribution, declared baselines, and lagged forecast scoring. Each limit names specifically which claim it applies to." }}
        </p>

        <div class="row q-col-gutter-md">
          <div
            v-for="claim in record.claimsSeparation"
            :key="claim.id"
            class="col-12 col-md-6"
          >
            <q-card flat class="claim-card bg-grey-1 q-pa-md border-grey h-100">
              <div class="row items-center justify-between q-mb-xs">
                <div class="row items-center">
                  <q-avatar size="24px" color="primary" text-color="white" class="q-mr-xs text-weight-bold text-caption">
                    {{ claim.claimNumber }}
                  </q-avatar>
                  <span class="text-subtitle2 text-weight-bold text-grey-9">{{ claim.title }}</span>
                </div>
                <q-chip
                  dense
                  size="sm"
                  :color="getClaimChipColor(claim.mode)"
                  :text-color="getClaimChipTextColor(claim.mode)"
                  class="text-weight-bold"
                >
                  {{ claim.modeLabel }}
                </q-chip>
              </div>

              <p class="text-body2 text-grey-8 q-my-xs leading-relaxed" style="font-size: 13px;">
                {{ claim.scope }}
              </p>

              <div class="row items-center justify-between q-mt-sm pt-xs border-top-light text-caption text-grey-7">
                <span class="text-weight-medium text-grey-9 font-mono" style="font-size: 11px;">
                  {{ claim.verificationStatement }}
                </span>
                <span class="text-grey-6 text-italic" style="font-size: 11px;">
                  {{ claim.formulaReference }}
                </span>
              </div>
            </q-card>
          </div>
        </div>
      </div>

      <!-- Section 2: Derived Standard World Model & Shipped Capabilities -->
      <div class="q-mb-lg bg-white q-pa-md q-pa-md-lg rounded-borders border-grey">
        <div class="row items-center justify-between q-mb-xs">
          <div class="text-subtitle1 text-weight-bold text-grey-9 row items-center">
            <q-icon name="public" color="teal" class="q-mr-xs" size="22px" />
            {{ $t("shippedModelCapabilitiesTitle") || "Shipped Standard World Model & Capabilities (Derived from Code)" }}
          </div>
          <q-badge color="teal-1" text-color="teal-9" class="text-weight-bold">
            {{ $t("derivedFromCodeBadge") || "Live Code Derivation" }}
          </q-badge>
        </div>
        <p class="text-caption text-grey-7 q-mb-md">
          {{ $t("shippedCapabilitiesSubtitle") || "Capabilities are derived directly from active model code (worldModel.js, conversionFactors.js, dimensions.js) rather than hand-written statements." }}
        </p>

        <div class="row q-col-gutter-md">
          <!-- Layer 1 Country Model -->
          <div class="col-12 col-md-6">
            <q-card flat class="q-pa-md bg-grey-1 border-grey">
              <div class="text-subtitle2 text-weight-bold text-grey-9 row items-center q-mb-xs">
                <q-icon name="travel_explore" color="primary" class="q-mr-xs" size="18px" />
                {{ record.shippedCapabilities.worldModel.name }}
              </div>
              <div class="text-caption text-grey-7 q-mb-sm">
                {{ record.shippedCapabilities.worldModel.authority }} · {{ record.shippedCapabilities.worldModel.license }}
              </div>
              <div class="row q-col-gutter-xs q-mb-sm">
                <div class="col-6">
                  <div class="text-h6 text-weight-bold text-primary">
                    {{ record.shippedCapabilities.worldModel.indicatorsCount }}
                  </div>
                  <div class="text-caption text-grey-7">{{ $t("indicatorsCountLabel") || "Standard Indicators" }}</div>
                </div>
                <div class="col-6">
                  <div class="text-h6 text-weight-bold text-primary">
                    {{ record.shippedCapabilities.worldModel.categories.length }}
                  </div>
                  <div class="text-caption text-grey-7">{{ $t("categoriesCountLabel") || "Socio-Economic Categories" }}</div>
                </div>
              </div>
              <div class="row q-gutter-xs">
                <q-chip
                  v-for="cat in record.shippedCapabilities.worldModel.categories"
                  :key="cat"
                  dense
                  size="sm"
                  color="blue-1"
                  text-color="primary"
                >
                  {{ cat }}
                </q-chip>
              </div>
            </q-card>
          </div>

          <!-- Layer 3 Climate Conversion Factors -->
          <div class="col-12 col-md-6">
            <q-card flat class="q-pa-md bg-grey-1 border-grey">
              <div class="text-subtitle2 text-weight-bold text-grey-9 row items-center q-mb-xs">
                <q-icon name="cloud" color="teal" class="q-mr-xs" size="18px" />
                {{ record.shippedCapabilities.conversionFactors.name }}
              </div>
              <div class="text-caption text-grey-7 q-mb-sm">
                GHG Protocol & IPCC AR6 GWP-100 · {{ record.shippedCapabilities.conversionFactors.canonicalUnit }}
              </div>
              <div class="row q-col-gutter-xs q-mb-sm">
                <div class="col-6">
                  <div class="text-h6 text-weight-bold text-teal-9">
                    {{ record.shippedCapabilities.conversionFactors.factorsCount }}
                  </div>
                  <div class="text-caption text-grey-7">{{ $t("conversionFactorsCountLabel") || "Conversion Factors" }}</div>
                </div>
                <div class="col-6">
                  <div class="text-h6 text-weight-bold text-teal-9">
                    {{ record.shippedCapabilities.conversionFactors.scopesCovered.join(", ") }}
                  </div>
                  <div class="text-caption text-grey-7">{{ $t("scopesCoveredLabel") || "Emissions Scopes" }}</div>
                </div>
              </div>
              <div class="text-caption text-grey-8">
                <strong>{{ $t("authoritiesLabel") || "Authorities" }}:</strong>
                {{ record.shippedCapabilities.conversionFactors.authorities.slice(0, 3).join("; ") }}...
              </div>
            </q-card>
          </div>

          <!-- Shipped Dimensions Framework -->
          <div class="col-12 col-md-6">
            <q-card flat class="q-pa-md bg-grey-1 border-grey">
              <div class="text-subtitle2 text-weight-bold text-grey-9 row items-center q-mb-xs">
                <q-icon name="category" color="purple" class="q-mr-xs" size="18px" />
                {{ $t("worldDimensionsFrameworkTitle") || "World Dimensions & Governance Framework" }}
              </div>
              <div class="text-caption text-grey-7 q-mb-sm">
                {{ $t("dimensionsPrinciplesDesc") || "Decision M-5 (limits block), M-6 (labels navigate), M-7 (physical units), M-8 (attributed weights)" }}
              </div>
              <div class="q-gutter-y-xs">
                <div
                  v-for="dim in record.shippedCapabilities.dimensions.shipped"
                  :key="dim.id"
                  class="row items-center justify-between text-body2"
                  style="font-size: 13px;"
                >
                  <span class="text-weight-medium text-grey-9">{{ dim.name }}</span>
                  <q-badge color="purple-1" text-color="purple-9">
                    {{ dim.kind }} ({{ dim.physicalUnit || 'label' }})
                  </q-badge>
                </div>
              </div>
            </q-card>
          </div>

          <!-- Register Permanence & Storage -->
          <div class="col-12 col-md-6">
            <q-card flat class="q-pa-md bg-grey-1 border-grey">
              <div class="text-subtitle2 text-weight-bold text-grey-9 row items-center q-mb-xs">
                <q-icon name="inventory_2" color="brown" class="q-mr-xs" size="18px" />
                {{ $t("registerPermanenceArchTitle") || "Register Permanence & Storage Retention" }}
              </div>
              <div class="text-caption text-grey-7 q-mb-sm">
                {{ record.shippedCapabilities.registerPermanence.immutabilityRule }}
              </div>
              <div class="row items-center justify-between q-mb-xs text-caption text-grey-8">
                <span>{{ $t("restoreDrillStatusLabel") || "Restore Drill Verification" }}:</span>
                <span class="text-weight-bold text-positive">
                  {{ record.shippedCapabilities.registerPermanence.verifiedRestoreDrill.fidelity }} Data Fidelity
                </span>
              </div>
              <div class="q-gutter-y-xs text-caption text-grey-7" style="font-size: 11px;">
                <div
                  v-for="t in record.shippedCapabilities.registerPermanence.retentionTiers"
                  :key="t.tier"
                  class="row justify-between"
                >
                  <span>{{ t.tier }}</span>
                  <span class="text-weight-medium text-grey-9">{{ t.window }}</span>
                </div>
              </div>
            </q-card>
          </div>
        </div>
      </div>

      <!-- Section 3: Mission Requirements & Coverage Registry -->
      <div class="q-mb-lg bg-white q-pa-md q-pa-md-lg rounded-borders border-grey">
        <div class="row items-center justify-between q-mb-xs">
          <div class="text-subtitle1 text-weight-bold text-grey-9 row items-center">
            <q-icon name="checklist" color="primary" class="q-mr-xs" size="22px" />
            {{ $t("missionRequirementsRegistryTitle") || "Mission Requirements & Coverage Registry" }}
          </div>
          <q-badge color="amber-1" text-color="warning" class="text-weight-bold">
            {{ $t("silenceIsBannedBadge") || "Silence is Banned (Decision M-6)" }}
          </q-badge>
        </div>
        <p class="text-caption text-grey-7 q-mb-md">
          {{ $t("missionRequirementsSubtitle") || "Every mission requirement appears below with its current operational state and dated technical rationale. Nothing is omitted silently." }}
        </p>

        <div class="q-gutter-y-sm">
          <q-card
            v-for="req in record.missionRequirements"
            :key="req.id"
            flat
            class="requirement-item q-pa-md bg-grey-1 border-grey"
          >
            <div class="row items-start justify-between q-col-gutter-sm">
              <div class="col-12 col-md-8">
                <div class="row items-center q-gutter-xs q-mb-xs">
                  <span class="text-subtitle2 text-weight-bold text-grey-9">{{ req.title }}</span>
                  <q-badge color="grey-3" text-color="grey-8" class="text-caption" style="font-size: 10px;">
                    Decision {{ req.governingDecision }}
                  </q-badge>
                </div>
                <p class="text-body2 text-grey-8 q-my-xs leading-relaxed" style="font-size: 13px;">
                  {{ req.reason }}
                </p>
              </div>
              <div class="col-12 col-md-4 text-left text-md-right">
                <q-chip
                  dense
                  :color="getStateChipColor(req.state)"
                  :text-color="getStateChipTextColor(req.state)"
                  class="text-weight-bold"
                >
                  {{ getStateLabel(req.state) }}
                </q-chip>
                <div class="text-caption text-grey-6 q-mt-xs" style="font-size: 11px;">
                  {{ $t("auditedAsOfLabel") || "As of" }}: {{ req.asOfDate }}
                </div>
              </div>
            </div>
          </q-card>
        </div>
      </div>

      <!-- Record Attribution & Citations Footer -->
      <div class="record-footer q-py-lg text-center text-caption text-grey-6">
        <div class="q-mb-xs">
          <strong>{{ $t("permanentUrlLabel") || "Permanent URL" }}:</strong>
          <a :href="record.permanentUrl" class="text-primary text-decoration-none q-ml-xs">
            {{ record.permanentUrl }}
          </a>
        </div>
        <div>
          <span>mipa · strategic coordination for collective-change.org</span>
          <span class="q-mx-xs">·</span>
          <span>License: {{ record.license }}</span>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script>
import { buildMissionCoverageRecord } from "@/utils/missionCoverage";

export default {
  name: "PageRegisterRecord",
  data() {
    return {
      record: buildMissionCoverageRecord()
    };
  },
  methods: {
    getClaimChipColor(mode) {
      if (mode === "mechanical") return "blue-1";
      if (mode === "attribution") return "teal-1";
      if (mode === "declared_by_default") return "amber-1";
      if (mode === "lagged_calibration") return "purple-1";
      if (mode === "ex_ante_judgment") return "green-1";
      return "grey-2";
    },
    getClaimChipTextColor(mode) {
      if (mode === "mechanical") return "primary";
      if (mode === "attribution") return "teal-9";
      if (mode === "declared_by_default") return "warning";
      if (mode === "lagged_calibration") return "purple-9";
      if (mode === "ex_ante_judgment") return "positive";
      return "grey-9";
    },
    getStateChipColor(state) {
      if (state === "met") return "green-1";
      if (state === "not_yet_met") return "amber-1";
      if (state === "deliberately_not_built") return "purple-1";
      return "grey-2";
    },
    getStateChipTextColor(state) {
      if (state === "met") return "positive";
      if (state === "not_yet_met") return "warning";
      if (state === "deliberately_not_built") return "purple-9";
      return "grey-8";
    },
    getStateLabel(state) {
      if (state === "met") return this.$t("stateMet") || "Met";
      if (state === "not_yet_met") return this.$t("stateNotYetMet") || "Not yet met";
      if (state === "deliberately_not_built") return this.$t("stateDeliberatelyNotBuilt") || "Deliberately not built";
      return state;
    },
    copyCitation() {
      const citationText = `Mipa Decision Register. "${this.record.title}". Citation ID: ${this.record.citationId}. Published: ${this.record.publishedDate}. URL: ${this.record.permanentUrl}`;
      if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        navigator.clipboard.writeText(citationText);
      }
      if (this.$q && typeof this.$q.notify === "function") {
        this.$q.notify({
          message: this.$t("citationCopiedToast") || "Permanent citation copied to clipboard.",
          color: "primary",
          icon: "check",
          timeout: 2500
        });
      }
    },
    printRecord() {
      window.print();
    }
  }
};
</script>

<style scoped>
.register-record-page {
  background-color: #f8fafc;
  min-height: 100vh;
}
.register-container {
  max-width: 960px;
  margin: 0 auto;
}
.border-grey {
  border: 1px solid #e2e8f0;
}
.border-top-light {
  border-top: 1px solid #f1f5f9;
}
.leading-relaxed {
  line-height: 1.6;
}
.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.h-100 {
  height: 100%;
}
.text-decoration-none {
  text-decoration: none;
}

@media print {
  .no-print {
    display: none !important;
  }
  .register-record-page {
    background-color: #ffffff !important;
    padding: 0 !important;
  }
  .register-container {
    max-width: 100% !important;
    margin: 0 !important;
  }
  .border-grey {
    border: 1px solid #cbd5e1 !important;
  }
}
</style>
