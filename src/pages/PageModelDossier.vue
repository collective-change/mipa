<template>
  <q-page padding class="dossier-page">
    <div class="dossier-container">
      <!-- Loading State -->
      <div v-if="loading" class="text-center q-pa-xl">
        <q-spinner-dots size="48px" color="primary" />
        <div class="text-subtitle1 text-grey-8 q-mt-md">{{ $t("loadingDossier") }}</div>
      </div>

      <!-- Main Dossier View -->
      <div v-else>
        <!-- Top Action Bar (hidden on print) -->
        <div class="row items-center justify-between q-mb-md no-print">
          <div class="row items-center q-gutter-xs">
            <q-badge color="blue-1" text-color="primary" class="q-px-sm q-py-xs text-caption text-weight-medium rounded-borders">
              <q-icon name="public" size="14px" class="q-mr-xs" />
              {{ $t("publicDossierBadge") }}
            </q-badge>
            <span class="text-caption text-grey-7 q-ml-sm">{{ $t("readOnlySandboxNotice") }}</span>
          </div>

          <div class="row items-center q-gutter-sm">
            <q-btn
              outline
              dense
              no-caps
              color="grey-8"
              class="q-px-sm"
              icon="share"
              :label="$t('shareDossierBtn')"
              @click="copyShareLink"
            />
            <q-btn
              unelevated
              dense
              no-caps
              color="primary"
              class="q-px-sm"
              icon="picture_as_pdf"
              :label="$t('exportPdfBtn')"
              @click="exportPdf"
            />
          </div>
        </div>

        <!-- Executive Brief Header -->
        <div class="dossier-header q-mb-lg q-pa-md bg-white rounded-borders border-grey">
          <div class="row items-start justify-between">
            <div>
              <div class="text-caption text-grey-7 text-uppercase text-weight-bold letter-spacing">
                {{ dossier.orgName }}
              </div>
              <h1 class="text-h4 text-weight-bolder text-grey-9 q-my-xs">
                {{ dossier.modelTitle }}
              </h1>
              <p v-if="dossier.modelDescription" class="text-body2 text-grey-8 q-my-xs leading-relaxed">
                {{ dossier.modelDescription }}
              </p>
            </div>
            <div class="text-right text-caption text-grey-6 no-print">
              {{ $t("generatedTimestamp") }}: {{ formattedDate }}
            </div>
          </div>

          <!-- Key Metrics Row -->
          <div class="row q-col-gutter-sm q-mt-md">
            <div class="col-6 col-sm-3">
              <q-card flat class="metric-card bg-blue-1 text-primary q-pa-sm text-center">
                <div class="text-h6 text-weight-bolder">{{ dossier.factorsCount }}</div>
                <div class="text-caption">{{ $t("dossierFactorsMetric") }}</div>
              </q-card>
            </div>
            <div class="col-6 col-sm-3">
              <q-card flat class="metric-card bg-green-1 text-positive q-pa-sm text-center">
                <div class="text-h6 text-weight-bolder">{{ dossier.actionsCount }}</div>
                <div class="text-caption">{{ $t("dossierActionsMetric") }}</div>
              </q-card>
            </div>
            <div class="col-6 col-sm-3">
              <q-card flat class="metric-card bg-purple-1 text-accent q-pa-sm text-center">
                <div class="text-h6 text-weight-bolder">{{ dossier.loopsCount }}</div>
                <div class="text-caption">{{ $t("dossierFeedbackLoopsMetric") }}</div>
              </q-card>
            </div>
            <div class="col-6 col-sm-3">
              <q-card flat class="metric-card bg-amber-1 text-warning q-pa-sm text-center">
                <div class="text-h6 text-weight-bolder">
                  {{ topLeverageFormatted }}
                </div>
                <div class="text-caption">{{ $t("dossierMaxLeverageMetric") }}</div>
              </q-card>
            </div>
          </div>
        </div>

        <!-- Section 1: Top Leverage Strategic Actions -->
        <div class="q-mb-lg bg-white q-pa-md rounded-borders border-grey">
          <div class="row items-center justify-between q-mb-sm">
            <div class="text-subtitle1 text-weight-bold text-grey-9 row items-center">
              <q-icon name="trending_up" color="primary" class="q-mr-xs" size="20px" />
              {{ $t("dossierActionsRankTitle") }}
            </div>
            <span class="text-caption text-grey-7">{{ $t("rankedByLeverageDesc") }}</span>
          </div>

          <q-table
            flat
            dense
            :rows="dossier.rankedActions"
            :columns="actionColumns"
            row-key="id"
            :pagination="{ rowsPerPage: 10 }"
            class="dossier-table"
          >
            <template v-slot:body-cell-leverage="props">
              <q-td :props="props">
                <q-chip dense color="blue-1" text-color="primary" class="text-weight-bold">
                  {{ Number(props.value || 0).toFixed(2) }}x
                </q-chip>
              </q-td>
            </template>
          </q-table>
        </div>

        <!-- Section 2: Interactive Factor Perturbation Sandbox -->
        <div class="q-mb-lg bg-white q-pa-md rounded-borders border-grey">
          <div class="row items-center justify-between q-mb-xs">
            <div class="text-subtitle1 text-weight-bold text-grey-9 row items-center">
              <q-icon name="tune" color="primary" class="q-mr-xs" size="20px" />
              {{ $t("dossierSandboxTitle") }}
            </div>
            <q-btn
              flat
              dense
              no-caps
              size="sm"
              color="grey-7"
              icon="restart_alt"
              :label="$t('resetPerturbationsBtn')"
              @click="resetPerturbations"
              class="no-print"
            />
          </div>
          <p class="text-caption text-grey-7 q-mb-md">
            {{ $t("dossierSandboxDesc") }}
          </p>

          <div class="row q-col-gutter-md">
            <div v-for="factor in dossier.factors" :key="factor.id" class="col-12 col-sm-6">
              <div class="factor-sandbox-item q-pa-sm rounded-borders bg-grey-1">
                <div class="row items-center justify-between q-mb-xs">
                  <span class="text-subtitle2 text-weight-medium">{{ factor.name }}</span>
                  <span class="text-caption text-weight-bold text-primary">
                    {{ factor.perturbedValue }} {{ factor.units }}
                    <span v-if="perturbations[factor.id]" class="text-caption text-grey-7">
                      ({{ perturbations[factor.id] > 0 ? '+' : '' }}{{ perturbations[factor.id] }}%)
                    </span>
                  </span>
                </div>
                <q-slider
                  v-model="perturbations[factor.id]"
                  :min="-50"
                  :max="50"
                  :step="5"
                  dense
                  label
                  color="primary"
                  class="no-print"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Section 3: Feedback Loops & System Archetypes -->
        <div v-if="dossier.loopsCount > 0 || (dossier.archetypes && dossier.archetypes.length > 0)" class="q-mb-lg bg-white q-pa-md rounded-borders border-grey">
          <div class="text-subtitle1 text-weight-bold text-grey-9 q-mb-sm row items-center">
            <q-icon name="all_inclusive" color="purple" class="q-mr-xs" size="20px" />
            {{ $t("dossierFeedbackTitle") }}
          </div>
          <div class="text-body2 text-grey-8 q-mb-md">
            {{ $t("dossierFeedbackDesc", { reinforcing: dossier.reinforcingLoopsCount, balancing: dossier.balancingLoopsCount }) }}
          </div>

          <div v-if="dossier.archetypes && dossier.archetypes.length > 0" class="row q-col-gutter-sm">
            <div v-for="arc in dossier.archetypes" :key="arc.id" class="col-12 col-sm-6">
              <q-banner dense rounded class="bg-purple-1 text-grey-9 text-caption">
                <template v-slot:avatar>
                  <q-icon name="psychology" color="purple" />
                </template>
                <div class="text-weight-bold">{{ arc.name }}</div>
                <div>{{ arc.description }}</div>
              </q-banner>
            </div>
          </div>
        </div>

        <!-- Attribution Footer -->
        <div class="dossier-footer text-center q-py-md text-caption text-grey-6">
          <div v-if="dossier.attributionFooter">
            {{ dossier.attributionFooter }}
          </div>
          <div v-else>
            {{ dossier.orgName }} · {{ dossier.modelTitle }}
          </div>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script>
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { firebaseDb } from "@/boot/firebase";
import { buildDossierSummary, printDossierBrief } from "@/utils/modelDossier";

export default {
  name: "PageModelDossier",
  data() {
    return {
      loading: true,
      rawModel: null,
      rawNodes: [],
      rawActions: [],
      rawOrg: null,
      perturbations: {}
    };
  },
  computed: {
    modelId() {
      return this.$route.params.modelId;
    },
    formattedDate() {
      return new Date().toLocaleDateString(this.$i18n ? this.$i18n.locale : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric"
      });
    },
    dossier() {
      return buildDossierSummary({
        model: this.rawModel || {},
        nodes: this.rawNodes || [],
        actions: this.rawActions || [],
        org: this.rawOrg,
        perturbations: this.perturbations
      });
    },
    topLeverageFormatted() {
      if (!this.dossier.topAction) return "-";
      const lev = Number(this.dossier.topAction.actionLeverage) || 0;
      return `${lev.toFixed(2)}x`;
    },
    actionColumns() {
      return [
        { name: "title", label: this.$t("Title"), field: "title", align: "left", sortable: true },
        { name: "leverage", label: this.$t("Leverage") + " (效應比)", field: "actionLeverage", align: "center", sortable: true },
        { name: "benefit", label: this.$t("marginalTotalBenefitNpv"), field: "marginalTotalBenefitNpv", align: "right" },
        { name: "roi", label: this.$t("totalRoi"), field: "totalRoi", align: "right" }
      ];
    }
  },
  async mounted() {
    await this.fetchDossierData();
  },
  methods: {
    async fetchDossierData() {
      this.loading = true;
      try {
        const modelRef = doc(firebaseDb, "models", this.modelId);
        const modelSnap = await getDoc(modelRef);

        if (modelSnap.exists()) {
          this.rawModel = { id: modelSnap.id, ...modelSnap.data() };
        } else {
          // Demo fallback model for previewing
          this.rawModel = {
            id: this.modelId,
            name: "Community Emergency Surge & Relief Model",
            description: "Systemic dynamic simulation of disaster relief volunteer capacity and philanthropic resource distribution."
          };
        }

        // Fetch nodes
        try {
          const nodesCol = collection(firebaseDb, "models", this.modelId, "nodes");
          const nodesSnap = await getDocs(nodesCol);
          this.rawNodes = nodesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch {
          this.rawNodes = [
            { id: "n1", symbol: "VC", name: "Volunteer Capacity", initialValue: 120, units: "volunteers" },
            { id: "n2", symbol: "RS", name: "Relief Supplies", initialValue: 85, units: "tons" },
            { id: "n3", symbol: "PT", name: "Public Trust", initialValue: 90, units: "points" }
          ];
        }

        // Initialize perturbation sliders map
        const initialPerturbations = {};
        for (const n of this.rawNodes) {
          initialPerturbations[n.id] = 0;
        }
        this.perturbations = initialPerturbations;
      } catch (err) {
        console.warn("Could not load public model dossier:", err);
      } finally {
        this.loading = false;
      }
    },
    resetPerturbations() {
      const reset = {};
      for (const n of this.rawNodes) {
        reset[n.id] = 0;
      }
      this.perturbations = reset;
    },
    copyShareLink() {
      if (typeof window !== "undefined" && navigator.clipboard) {
        navigator.clipboard.writeText(window.location.href);
        this.$q.notify({
          type: "positive",
          message: this.$t("shareLinkCopiedToast")
        });
      }
    },
    exportPdf() {
      printDossierBrief(this.dossier.modelTitle);
    }
  }
};
</script>

<style scoped>
.dossier-page {
  background-color: #f8fafc;
  min-height: 100vh;
}
.dossier-container {
  max-width: 960px;
  margin: 0 auto;
}
.border-grey {
  border: 1px solid #e2e8f0;
}
.letter-spacing {
  letter-spacing: 0.05em;
}
.leading-relaxed {
  line-height: 1.6;
}
.metric-card {
  border-radius: 8px;
}
.factor-sandbox-item {
  border: 1px solid #e2e8f0;
}

@media print {
  .no-print {
    display: none !important;
  }
  .dossier-page {
    background-color: #ffffff !important;
    padding: 0 !important;
  }
  .dossier-container {
    max-width: 100% !important;
    margin: 0 !important;
  }
  .border-grey {
    border: 1px solid #cbd5e1 !important;
  }
}
</style>
