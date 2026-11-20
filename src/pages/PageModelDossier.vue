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
                <div class="text-h6 text-weight-bolder">
                  {{ isPartialView ? `${dossier.factorsCount} / ${nodesTotalCount}` : dossier.factorsCount }}
                </div>
                <div class="text-caption">
                  {{ $t("dossierFactorsMetric") }}
                  <span v-if="isPartialView" class="text-weight-bold q-ml-xs">({{ $t("partialViewBadge") }})</span>
                </div>
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
            <div v-if="dossier.portfolioPressures && dossier.portfolioPressures.actionsWithPressureCount > 0" class="col-12 col-sm-3">
              <q-card flat class="metric-card bg-teal-1 text-teal-9 q-pa-sm text-center">
                <div class="text-h6 text-weight-bolder">
                  {{ dossier.portfolioPressures.totalTCO2e }} {{ dossier.portfolioPressures.unit }}
                </div>
                <div class="text-caption">{{ $t("portfolioClimatePressure") || "Portfolio Climate Pressure" }}</div>
                <div class="text-caption text-grey-7" style="font-size: 10px;">
                  S1: {{ dossier.portfolioPressures.byScope.scope1 }} · S2: {{ dossier.portfolioPressures.byScope.scope2 }} · S3: {{ dossier.portfolioPressures.byScope.scope3 }}
                </div>
              </q-card>
            </div>
          </div>
        </div>

        <!-- Partial View Notice Banner -->
        <q-banner
          v-if="isPartialView"
          rounded
          class="bg-amber-1 text-grey-9 q-mb-lg border-amber"
        >
          <template v-slot:avatar>
            <q-icon name="info" color="warning" />
          </template>
          <div class="row items-center justify-between full-width">
            <div class="col-12 col-md-8">
              <div class="text-weight-bold">
                {{ $t("showingBoundedFactors", { loaded: rawNodes.length, total: nodesTotalCount }) }}
                <span class="text-weight-regular text-grey-8">({{ $t("partialViewBadge") }})</span>
              </div>
              <div class="text-caption text-grey-7">
                {{ $t("partialViewExplanation") }}
              </div>
            </div>
            <div class="col-12 col-md-4 text-right q-mt-xs-sm q-mt-md-none">
              <q-btn
                unelevated
                dense
                no-caps
                color="primary"
                icon="unfold_more"
                :label="$t('showAllFactors', { total: nodesTotalCount })"
                :loading="loadingMoreNodes"
                @click="loadAllNodes"
                class="no-print"
              />
            </div>
          </div>
        </q-banner>

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
                <div class="row items-center justify-center q-gutter-xs">
                  <q-chip dense color="blue-1" text-color="primary" class="text-weight-bold">
                    {{ Number(props.value || 0).toFixed(2) }}x
                  </q-chip>
                  <q-badge
                    v-if="props.row.valueFlags && props.row.valueFlags.actionLeverage"
                    :color="valueFlagColor(props.row.valueFlags.actionLeverage)"
                    :text-color="valueFlagTextColor(props.row.valueFlags.actionLeverage)"
                    class="text-caption text-weight-bold"
                  >
                    {{ formatValueFlag(props.row.valueFlags.actionLeverage) }}
                  </q-badge>
                </div>
              </q-td>
            </template>
            <template v-slot:body-cell-benefit="props">
              <q-td :props="props">
                <div class="row items-center justify-end q-gutter-xs">
                  <span>{{ formatNumber(props.value, 0) }}</span>
                  <q-badge
                    v-if="props.row.valueFlags && props.row.valueFlags.marginalNetTotalBenefitNpv"
                    :color="valueFlagColor(props.row.valueFlags.marginalNetTotalBenefitNpv)"
                    :text-color="valueFlagTextColor(props.row.valueFlags.marginalNetTotalBenefitNpv)"
                    class="text-caption"
                  >
                    {{ formatValueFlag(props.row.valueFlags.marginalNetTotalBenefitNpv) }}
                  </q-badge>
                </div>
              </q-td>
            </template>
            <template v-slot:body-cell-roi="props">
              <q-td :props="props">
                <div class="row items-center justify-end q-gutter-xs">
                  <span>{{ formatNumber(props.value, 2) }}</span>
                  <q-badge
                    v-if="props.row.valueFlags && props.row.valueFlags.totalRoi"
                    :color="valueFlagColor(props.row.valueFlags.totalRoi)"
                    :text-color="valueFlagTextColor(props.row.valueFlags.totalRoi)"
                    class="text-caption"
                  >
                    {{ formatValueFlag(props.row.valueFlags.totalRoi) }}
                  </q-badge>
                </div>
              </q-td>
            </template>
            <template v-slot:body-cell-counterfactualArm="props">
              <q-td :props="props">
                <div v-if="props.row.counterfactualArm && props.row.counterfactualArm.isMeasured" class="text-center">
                  <q-chip
                    dense
                    color="green-1"
                    text-color="positive"
                    icon="verified"
                    class="text-weight-bold cursor-pointer"
                  >
                    {{ $t("measuredCounterfactualBadge") || "Measured" }}: {{ props.row.counterfactualArm.methodLabel || props.row.counterfactualArm.method }}
                    <q-tooltip class="bg-grey-9 text-body2 q-pa-sm" style="max-width: 340px;">
                      <div class="text-weight-bold q-mb-xs">{{ props.row.counterfactualArm.statement }}</div>
                      <div v-if="props.row.counterfactualArm.assumptions" class="q-mt-xs">
                        <strong>{{ $t("methodAssumptions") || "Assumptions" }}:</strong> {{ props.row.counterfactualArm.assumptions }}
                      </div>
                      <div v-if="props.row.counterfactualArm.limits" class="q-mt-xs">
                        <strong>{{ $t("methodLimits") || "Limitations" }}:</strong> {{ props.row.counterfactualArm.limits }}
                      </div>
                      <div v-if="props.row.counterfactualArm.seriesCount > 0" class="q-mt-xs text-caption text-grey-4">
                        {{ props.row.counterfactualArm.seriesCount }} observed points
                      </div>
                    </q-tooltip>
                  </q-chip>
                  <div class="text-caption text-grey-6" style="font-size: 10px;">
                    {{ props.row.counterfactualArm.attributionDate || "" }}
                  </div>
                </div>
                <div v-else class="text-center">
                  <q-chip dense color="grey-2" text-color="grey-8">
                    {{ $t("declaredBaselineBadge") || "Declared Baseline" }}
                    <q-tooltip class="bg-grey-9 text-caption q-pa-xs">
                      {{ $t("declaredBaselineTooltip") || "Counterfactual derived directly from baseline projection (unobserved)." }}
                    </q-tooltip>
                  </q-chip>
                </div>
              </q-td>
            </template>
            <template v-slot:body-cell-climatePressure="props">
              <q-td :props="props">
                <div v-if="props.row.climatePressure && typeof props.row.climatePressure.pressureValue === 'number'">
                  <q-chip dense color="teal-1" text-color="teal-9" class="text-weight-bold">
                    {{ props.row.climatePressure.pressureValue }} {{ props.row.climatePressure.pressureUnit || "tCO2e" }}
                  </q-chip>
                  <div class="text-caption text-grey-7" style="font-size: 10px;">
                    Scope {{ props.row.climatePressure.scope }}
                  </div>
                </div>
                <span v-else class="text-grey-5">-</span>
              </q-td>
            </template>
            <template v-slot:body-cell-sdgTargets="props">
              <q-td :props="props">
                <div v-if="props.value && props.value.length" class="row items-center q-gutter-xs">
                  <q-chip
                    v-for="target in props.value"
                    :key="target"
                    dense
                    color="blue-1"
                    text-color="primary"
                    size="sm"
                  >
                    {{ target }}
                  </q-chip>
                </div>
                <span v-else class="text-grey-5">-</span>
              </q-td>
            </template>
            <template v-slot:body-cell-animalWelfare="props">
              <q-td :props="props">
                <span v-if="props.value && props.value !== '-'" class="text-weight-bold text-teal-9">
                  {{ props.value }}
                  <span class="text-caption text-grey-6 q-ml-xs">({{ $t('notIncludedInScore') || 'not included in score' }})</span>
                </span>
                <span v-else class="text-grey-5">-</span>
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
              <q-badge v-if="isPartialView" color="warning" text-color="dark" class="q-ml-sm">
                {{ $t("showingBoundedFactors", { loaded: rawNodes.length, total: nodesTotalCount }) }}
              </q-badge>
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
                <div class="text-weight-bold">{{ dossierArchetypeTitle(arc) }}</div>
                <div>{{ dossierArchetypeDetail(arc) }}</div>
              </q-banner>
            </div>
          </div>
        </div>

        <!-- Section 4: World Factors & Data Provenance -->
        <div v-if="dossier.worldFactors && dossier.worldFactors.length > 0" class="q-mb-lg bg-white q-pa-md rounded-borders border-grey">
          <div class="row items-center justify-between q-mb-sm">
            <div class="text-subtitle1 text-weight-bold text-grey-9 row items-center">
              <q-icon name="public" color="primary" class="q-mr-xs" size="20px" />
              {{ $t("worldModelProvenanceTitle") }}
            </div>
            <q-chip dense color="teal-1" text-color="teal-9" icon="verified" size="sm">
              {{ $t("auditedProvenance") }}
            </q-chip>
          </div>
          <p class="text-caption text-grey-7 q-mb-md">
            {{ $t("worldModelProvenanceDesc") }}
          </p>

          <q-table
            flat
            dense
            :rows="dossier.worldFactors"
            :columns="worldFactorColumns"
            row-key="id"
            :pagination="{ rowsPerPage: 15 }"
            class="dossier-table"
          >
            <template v-slot:body-cell-citationUrl="props">
              <q-td :props="props">
                <a
                  v-if="props.value"
                  :href="props.value"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-primary text-weight-medium"
                >
                  {{ props.value }}
                </a>
                <span v-else class="text-grey-5">-</span>
              </q-td>
            </template>
            <template v-slot:body-cell-licence="props">
              <q-td :props="props">
                <q-badge color="grey-3" text-color="grey-9" class="text-weight-bold">
                  {{ props.value || "CC BY 4.0" }}
                </q-badge>
              </q-td>
            </template>
          </q-table>
        </div>

        <!-- Section 5: Action Climate Pressures & Emission Factor Provenance -->
        <div v-if="dossier.actionPressures && dossier.actionPressures.length > 0" class="q-mb-lg bg-white q-pa-md rounded-borders border-grey">
          <div class="row items-center justify-between q-mb-sm">
            <div class="text-subtitle1 text-weight-bold text-grey-9 row items-center">
              <q-icon name="eco" color="teal-8" class="q-mr-xs" size="20px" />
              {{ $t("actionClimateProvenanceTitle") || "Action Climate Pressures & Emission Factor Provenance" }}
            </div>
            <q-chip dense color="teal-1" text-color="teal-9" icon="verified" size="sm">
              IPCC AR6 / GHG Protocol
            </q-chip>
          </div>
          <p class="text-caption text-grey-7 q-mb-md">
            {{ $t("actionClimateProvenanceDesc") || "Canonical action pressures computed in tCO2e using verified emission factors with audited citations, licenses, and versions." }}
          </p>

          <q-table
            flat
            dense
            :rows="dossier.actionPressures"
            :columns="actionPressureColumns"
            row-key="actionId"
            :pagination="{ rowsPerPage: 10 }"
            class="dossier-table"
          >
            <template v-slot:body-cell-pressureValue="props">
              <q-td :props="props">
                <q-chip dense color="teal-1" text-color="teal-9" class="text-weight-bold">
                  {{ props.value }} {{ props.row.pressureUnit || "tCO2e" }}
                </q-chip>
              </q-td>
            </template>
            <template v-slot:body-cell-scope="props">
              <q-td :props="props">
                <q-badge color="grey-3" text-color="grey-9" class="text-weight-bold">
                  Scope {{ props.value }}
                </q-badge>
              </q-td>
            </template>
            <template v-slot:body-cell-citationUrl="props">
              <q-td :props="props">
                <a
                  v-if="props.value"
                  :href="props.value"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-primary text-weight-medium"
                >
                  {{ props.value }}
                </a>
                <span v-else class="text-grey-5">-</span>
              </q-td>
            </template>
            <template v-slot:body-cell-licence="props">
              <q-td :props="props">
                <q-badge color="grey-3" text-color="grey-9" class="text-weight-bold">
                  {{ props.value || "Open Data" }}
                </q-badge>
              </q-td>
            </template>
          </q-table>
        </div>

        <!-- Section 6: World Dimensions & Coverage Statement (MIPA-33) -->
        <div v-if="dossier.dimensions && dossier.dimensions.length > 0" class="q-mb-lg bg-white q-pa-md rounded-borders border-grey">
          <div class="row items-center justify-between q-mb-sm">
            <div class="text-subtitle1 text-weight-bold text-grey-9 row items-center">
              <q-icon name="category" color="primary" class="q-mr-xs" size="20px" />
              {{ $t("dimensionCoverageTitle") || "World Dimensions & Coverage Statement" }}
            </div>
            <q-chip dense color="blue-1" text-color="primary" size="sm">
              Decision M-6 / M-7 / M-8
            </q-chip>
          </div>
          <p class="text-caption text-grey-7 q-mb-md">
            {{ $t("dimensionCoverageDesc") || "Disclosure is mandatory; weighting is optional (Decision M-6). Dimensions not weighted are rendered in physical units and explicitly excluded from the score." }}
          </p>

          <q-table
            flat
            dense
            :rows="dossier.dimensions"
            :columns="dimensionColumns"
            row-key="id"
            :pagination="{ rowsPerPage: 10 }"
            class="dossier-table q-mb-md"
          >
            <template v-slot:body-cell-kind="props">
              <q-td :props="props">
                <q-chip
                  dense
                  :color="props.value === 'limit' ? 'red-1' : props.value === 'label' ? 'blue-1' : 'green-1'"
                  :text-color="props.value === 'limit' ? 'negative' : props.value === 'label' ? 'primary' : 'positive'"
                  class="text-weight-bold text-capitalize"
                >
                  {{ props.value }}
                </q-chip>
              </q-td>
            </template>
            <template v-slot:body-cell-state="props">
              <q-td :props="props">
                <span v-if="props.row.weight && props.row.weight.enabled" class="text-weight-bold text-primary">
                  {{ $t("dimensionStateWeighted") || "Weighted" }} ({{ props.row.weight.value }})
                </span>
                <span v-else class="text-caption text-grey-8">
                  <q-badge color="orange-1" text-color="orange-9" class="q-mr-xs">
                    {{ $t("notIncludedInScore") || "not included in the score" }}
                  </q-badge>
                  <span v-if="props.row.physicalUnit">({{ props.row.physicalUnit }})</span>
                </span>
              </q-td>
            </template>
            <template v-slot:body-cell-weightSource="props">
              <q-td :props="props">
                <span v-if="props.row.weight && props.row.weight.enabled">
                  {{ props.row.weightSourceFormatted || props.row.weight.source }}
                </span>
                <span v-else class="text-grey-5">-</span>
              </q-td>
            </template>
          </q-table>
        </div>

        <!-- Section 7: UN Sustainable Development Goals (SDG) Indicator Crosswalk -->
        <div v-if="dossier.sdgCrosswalk && dossier.sdgCrosswalk.length > 0" class="q-mb-lg bg-white q-pa-md rounded-borders border-grey">
          <div class="row items-center justify-between q-mb-sm">
            <div class="text-subtitle1 text-weight-bold text-grey-9 row items-center">
              <q-icon name="hub" color="primary" class="q-mr-xs" size="20px" />
              {{ $t("sdgCrosswalkTitle") || "UN SDG Indicator Crosswalk" }}
            </div>
            <q-chip dense color="teal-1" text-color="teal-9" icon="verified" size="sm">
              UN 2030 Agenda
            </q-chip>
          </div>
          <p class="text-caption text-grey-7 q-mb-md">
            {{ $t("sdgTargetsHint") || "Published crosswalk mapping indicators to SDG targets. A label navigates; a number scores." }}
          </p>

          <q-table
            flat
            dense
            :rows="dossier.sdgCrosswalk"
            :columns="sdgCrosswalkColumns"
            row-key="indicatorCode"
            :pagination="{ rowsPerPage: 10 }"
            class="dossier-table"
          >
            <template v-slot:body-cell-sdgTarget="props">
              <q-td :props="props">
                <q-chip dense color="blue-1" text-color="primary" class="text-weight-bold">
                  {{ props.value }}
                </q-chip>
              </q-td>
            </template>
          </q-table>
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
import { doc, getDoc, collection, getDocs, query, limit, getCountFromServer } from "firebase/firestore";
import { firebaseDb, firebaseFunctions } from "@/boot/firebase";
import { httpsCallable } from "firebase/functions";
import { buildDossierSummary, buildSampleDossierData, printDossierBrief } from "@/utils/modelDossier";
import { DEFAULT_NODES_LIMIT } from "@/store/store-model";

export default {
  name: "PageModelDossier",
  data() {
    return {
      loading: true,
      rawModel: null,
      rawNodes: [],
      nodesTotalCount: null,
      nodesLimit: DEFAULT_NODES_LIMIT,
      showingAllNodes: false,
      loadingMoreNodes: false,
      rawActions: [],
      rawOrg: null,
      perturbations: {}
    };
  },
  computed: {
    isPartialView() {
      return (
        !this.showingAllNodes &&
        typeof this.nodesTotalCount === "number" &&
        this.nodesTotalCount > this.rawNodes.length
      );
    },
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
      const cols = [
        { name: "title", label: this.$t("Title"), field: "title", align: "left", sortable: true },
        { name: "leverage", label: this.$t("Leverage") + " (效應比)", field: "actionLeverage", align: "center", sortable: true },
        { name: "benefit", label: this.$t("marginalTotalBenefitNpv"), field: "marginalTotalBenefitNpv", align: "right" },
        { name: "roi", label: this.$t("totalRoi"), field: "totalRoi", align: "right" },
        {
          name: "counterfactualArm",
          label: this.$t("counterfactualArmLabel") || "Counterfactual Arm",
          field: (row) => (row.counterfactualArm?.isMeasured ? "measured" : "declared"),
          align: "center",
          sortable: true
        },
        {
          name: "sdgTargets",
          label: this.$t("sdgTargetsLabel") || "SDG Targets",
          field: "sdgTargets",
          align: "left"
        },
        {
          name: "climatePressure",
          label: this.$t("climatePressure") || "Climate Pressure",
          field: (row) =>
            row.climatePressure && typeof row.climatePressure.pressureValue === "number"
              ? `${row.climatePressure.pressureValue} ${row.climatePressure.pressureUnit || "tCO2e"}`
              : "-",
          align: "right",
          sortable: true
        }
      ];

      if (this.dossier.animalWelfare) {
        cols.push({
          name: "animalWelfare",
          label: `${this.$t("dimAnimalWelfare") || "Animal Welfare"} (${this.dossier.animalWelfare.physicalUnit || "animal-years"})`,
          field: (row) =>
            row.animalYears !== undefined && row.animalYears !== null
              ? `${row.animalYears} ${this.dossier.animalWelfare.physicalUnit || "animal-years"}`
              : (row.animalWelfareImpact ? `${row.animalWelfareImpact} ${this.dossier.animalWelfare.physicalUnit || "animal-years"}` : "-"),
          align: "right"
        });
      }

      return cols;
    },
    dimensionColumns() {
      return [
        { name: "name", label: this.$t("Title") || "Dimension", field: "name", align: "left", sortable: true },
        { name: "kind", label: this.$t("dimensionKind") || "Kind", field: "kind", align: "center" },
        { name: "state", label: this.$t("Status") || "State", field: "state", align: "left" },
        { name: "weightSource", label: this.$t("weightSourceLabel") || "Weight Source", field: "weightSource", align: "left" },
        { name: "framework", label: this.$t("authority") || "Framework", field: "framework", align: "left" }
      ];
    },
    sdgCrosswalkColumns() {
      return [
        { name: "indicatorCode", label: this.$t("shortName") || "Indicator Code", field: "indicatorCode", align: "left" },
        { name: "indicatorName", label: this.$t("factorName") || "Indicator Name", field: "indicatorName", align: "left" },
        { name: "sdgTarget", label: this.$t("sdgTargetsLabel") || "SDG Target", field: "sdgTarget", align: "center" },
        { name: "sdgTitle", label: this.$t("Description") || "SDG Description", field: "sdgTitle", align: "left" }
      ];
    },
    worldFactorColumns() {
      return [
        { name: "name", label: this.$t("factorName") || "Factor Name", field: "name", align: "left", sortable: true },
        { name: "symbol", label: this.$t("shortName") || "Short Name", field: "symbol", align: "left" },
        { name: "value", label: this.$t("initialValue") || "Value", field: (row) => `${row.baseValue} ${row.units}`, align: "right" },
        { name: "source", label: this.$t("sourceCitation") || "Source Citation", field: "sourceCitation", align: "left" },
        { name: "citationUrl", label: this.$t("citationUrl") || "Citation URL", field: "citationUrl", align: "left" },
        { name: "licence", label: this.$t("licence") || "License", field: "licence", align: "center" }
      ];
    },
    actionPressureColumns() {
      return [
        { name: "actionTitle", label: this.$t("Title") || "Action", field: "actionTitle", align: "left", sortable: true },
        { name: "factorName", label: this.$t("factorName") || "Emission Factor", field: "factorName", align: "left", sortable: true },
        { name: "scope", label: this.$t("scope") || "Scope", field: "scope", align: "center" },
        { name: "geography", label: this.$t("geography") || "Geography", field: "geography", align: "center" },
        { name: "pressureValue", label: this.$t("climatePressure") || "Pressure (tCO2e)", field: "pressureValue", align: "right", sortable: true },
        { name: "authority", label: this.$t("authority") || "Authority", field: "authority", align: "left" },
        { name: "citationUrl", label: this.$t("citationUrl") || "Citation URL", field: "citationUrl", align: "left" },
        { name: "licence", label: this.$t("licence") || "License", field: "licence", align: "center" },
        { name: "version", label: this.$t("version") || "Version", field: "version", align: "center" }
      ];
    }
  },
  async mounted() {
    await this.fetchDossierData();
  },
  methods: {
    async fetchNodes(showAll = false) {
      const nodesCol = collection(firebaseDb, "models", this.modelId, "nodes");
      try {
        const countSnap = await getCountFromServer(nodesCol);
        this.nodesTotalCount =
          countSnap && typeof countSnap.data === "function" ? countSnap.data().count : null;
      } catch {
        this.nodesTotalCount = null;
      }

      try {
        const nodesQuery = showAll ? nodesCol : query(nodesCol, limit(this.nodesLimit));
        const nodesSnap = await getDocs(nodesQuery);
        this.rawNodes = nodesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        this.showingAllNodes = Boolean(showAll);
      } catch {
        this.applySampleFallback();
        return;
      }

      const initialPerturbations = { ...this.perturbations };
      for (const n of this.rawNodes) {
        if (initialPerturbations[n.id] === undefined) {
          initialPerturbations[n.id] = 0;
        }
      }
      this.perturbations = initialPerturbations;
    },
    async loadAllNodes() {
      this.loadingMoreNodes = true;
      try {
        await this.fetchNodes(true);
      } catch (err) {
        console.warn("Could not load all model factors:", err);
      } finally {
        this.loadingMoreNodes = false;
      }
    },
    async fetchDossierData() {
      this.loading = true;
      try {
        const modelRef = doc(firebaseDb, "models", this.modelId);
        const modelSnap = await getDoc(modelRef);

        if (modelSnap.exists()) {
          const modelData = typeof modelSnap.data === "function" ? modelSnap.data() : {};
          if (modelData && modelData.isPublic === false) {
            this.applySampleFallback();
            return;
          }
          this.rawOrg = null;
          this.rawModel = { id: modelSnap.id, ...modelData };
        } else {
          this.applySampleFallback();
          return;
        }

        // Fetch nodes (bounded with count query, show-all support)
        await this.fetchNodes(false);
        if (this.rawOrg && this.rawOrg.isSample) {
          return;
        }

        // Fetch actions. Actions are not publicly readable by Firestore rules
        // (MIPA-4); this callable returns only title + computed leverage for
        // a model with isPublic === true.
        try {
          const getActions = httpsCallable(firebaseFunctions, "getPublicDossierActions");
          const res = await getActions({ modelId: this.modelId });
          this.rawActions = (res.data && res.data.actions) || [];
        } catch (err) {
          console.warn("Could not load public dossier actions:", err);
          this.rawActions = [];
        }
      } catch (err) {
        console.warn("Could not load public model dossier:", err);
        this.applySampleFallback();
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
    },
    formatNumber(val, decimals = 0) {
      if (val === null || val === undefined || isNaN(val)) return "-";
      return Number(val).toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      });
    },
    valueFlagColor(flag) {
      if (flag === "measured") return "positive";
      if (flag === "forecast") return "warning";
      return "grey-4";
    },
    valueFlagTextColor(flag) {
      if (flag === "measured" || flag === "forecast") return "white";
      return "grey-9";
    },
    formatValueFlag(flag) {
      if (!flag) return "";
      const key = `valueFlag_${flag}`;
      const translated = this.$t(key);
      return translated !== key ? translated : flag;
    },
    dossierArchetypeTitle(arc) {
      const name =
        arc?.i18nKey && this.$te(`archetypes.${arc.i18nKey}.name`)
          ? this.$t(`archetypes.${arc.i18nKey}.name`)
          : arc?.name || "";
      const status = arc?.isPartial ? this.$t("archetypeStatusPartial") : this.$t("archetypeStatusComplete");
      const loops = arc?.presentLoops?.length ? ` [${arc.presentLoops.join(", ")}]` : "";
      return `${name} (${status})${loops}`;
    },
    dossierArchetypeDetail(arc) {
      const useEnglish = this.$i18n?.locale === "en-us";
      const looksLike =
        arc?.i18nKey && this.$te(`archetypes.${arc.i18nKey}.looksLike`) && !useEnglish
          ? this.$t(`archetypes.${arc.i18nKey}.looksLike`)
          : arc?.looksLike || arc?.description || "";
      if (!arc?.isPartial) return looksLike;
      const missingText =
        arc?.missingLoopKey && this.$te(`archetypes.missingLoop.${arc.missingLoopKey}`)
          ? this.$t(`archetypes.missingLoop.${arc.missingLoopKey}`)
          : arc?.missingLoop || "";
      return missingText ? `${looksLike} ${this.$t("archetypeMissingLoopLabel")}: ${missingText}` : looksLike;
    },
    applySampleFallback() {
      const locale = this.$i18n ? this.$i18n.locale : "en-us";
      const t = key => (this.$t ? this.$t(key) : key);
      const { org, model, nodes, actions } = buildSampleDossierData({
        modelId: this.modelId || "sample",
        t,
        locale
      });
      this.rawOrg = org;
      this.rawModel = model;
      this.rawNodes = nodes;
      this.rawActions = actions;
      this.nodesTotalCount = nodes.length;
      this.showingAllNodes = true;

      const initialPerturbations = { ...this.perturbations };
      for (const n of nodes) {
        if (initialPerturbations[n.id] === undefined) {
          initialPerturbations[n.id] = 0;
        }
      }
      this.perturbations = initialPerturbations;
    }
  },
  watch: {
    "$i18n.locale"() {
      if (this.rawOrg && this.rawOrg.isSample) {
        this.applySampleFallback();
      }
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
.border-amber {
  border: 1px solid #fcd34d;
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
