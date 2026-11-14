<template>
  <q-card style="width: 850px; max-width: 95vw;">
    <modal-header>{{ $t("Add action") }}</modal-header>

    <q-tabs
      v-model="activeTab"
      dense
      class="text-grey-7 bg-grey-2"
      active-color="primary"
      indicator-color="primary"
      align="justify"
    >
      <q-tab name="aiDraft" icon="auto_awesome" :label="$t('tabSmartDraft')" />
      <q-tab name="manual" icon="edit" :label="$t('tabManualEntry')" />
    </q-tabs>

    <q-separator />

    <q-tab-panels v-model="activeTab" animated>
      <!-- TAB 1: Smart Draft with AI -->
      <q-tab-panel name="aiDraft" class="q-pa-md">
        <!-- Initial prompt screen when no proposal is generated yet -->
        <div v-if="!proposal" class="q-gutter-md">
          <div class="text-body2 text-grey-8">
            {{ $t("ideaPromptHint") }}
          </div>

          <q-input
            v-model="ideaText"
            filled
            type="textarea"
            rows="3"
            autogrow
            :label="$t('ideaPromptLabel')"
            :placeholder="$t('ideaPromptPlaceholder')"
            class="full-width"
            @keydown.enter.ctrl="generateProposal"
          />

          <div class="row justify-end q-mt-md">
            <q-btn
              color="primary"
              unelevated
              no-caps
              icon="auto_awesome"
              :label="$t('generateActionProposal')"
              :loading="isGenerating"
              :disable="!ideaText.trim()"
              @click="generateProposal"
            />
          </div>
        </div>

        <!-- Proposal Review and Adjustment Screen -->
        <div v-else class="q-gutter-md">
          <q-banner dense rounded class="bg-primary text-white q-mb-sm">
            <template v-slot:avatar>
              <q-icon name="lightbulb" color="white" />
            </template>
            <div class="text-caption">
              {{ $t("proposalReviewBanner") }}
            </div>
          </q-banner>

          <q-input
            v-model="proposal.title"
            filled
            :label="$t('actionProposalTitle')"
            :rules="[val => !!val && val.trim().length > 0 || 'Title is required']"
            dense
          />

          <q-input
            v-model="proposal.summary"
            filled
            type="textarea"
            autogrow
            :label="$t('actionProposalSummary')"
            dense
          />

          <!-- Effort & Spending grid -->
          <div class="row q-col-gutter-md">
            <div class="col-12 col-sm-6">
              <q-input
                v-model.number="proposal.estSpending"
                filled
                type="number"
                dense
                :label="$t('estSpendingLabel')"
                :suffix="currentCurrency"
              />
              <div v-if="proposal.spendingReasoning" class="text-caption text-grey-7 q-mt-xs">
                {{ proposal.spendingReasoning }}
              </div>
            </div>

            <div class="col-12 col-sm-6">
              <q-input
                v-model.number="proposal.estEffortHrs"
                filled
                type="number"
                dense
                :label="$t('estEffortHrsLabel')"
                suffix="workhours"
              />
              <div v-if="proposal.effortReasoning" class="text-caption text-grey-7 q-mt-xs">
                {{ proposal.effortReasoning }}
              </div>
            </div>
          </div>

          <!-- Impacts on Model Factors -->
          <div class="q-mt-lg">
            <div class="text-subtitle2 text-weight-bold row items-center justify-between">
              <div>{{ $t("factorImpactsTitle") }}</div>
              <q-btn
                flat
                dense
                no-caps
                size="sm"
                color="primary"
                icon="add"
                :label="$t('addFactorImpact')"
                @click="addEmptyImpact"
              />
            </div>

            <div v-if="!proposal.impacts || proposal.impacts.length === 0" class="text-caption text-grey-6 q-py-sm">
              {{ $t("noImpactsFound") }}
            </div>

            <q-list v-else bordered separator class="rounded-borders q-mt-xs">
              <q-item v-for="(impact, idx) in proposal.impacts" :key="idx" class="q-py-sm">
                <q-item-section>
                  <div class="row q-col-gutter-xs items-center">
                    <!-- Factor Select -->
                    <div class="col-12 col-sm-4">
                      <q-select
                        v-model="impact.nodeId"
                        :options="factorOptions"
                        emit-value
                        map-options
                        dense
                        filled
                        :label="$t('impactFactorCol')"
                      />
                    </div>

                    <!-- Operation -->
                    <div class="col-3 col-sm-2">
                      <q-select
                        v-model="impact.operation"
                        :options="operationOptions"
                        emit-value
                        map-options
                        dense
                        filled
                        :label="$t('impactOperationCol')"
                      />
                    </div>

                    <!-- Operand -->
                    <div class="col-9 col-sm-3">
                      <q-input
                        v-model="impact.operand"
                        dense
                        filled
                        :label="$t('impactValueCol')"
                      />
                    </div>

                    <!-- Duration Type -->
                    <div class="col-12 col-sm-3">
                      <q-select
                        v-model="impact.durationType"
                        :options="durationTypeOptions"
                        emit-value
                        map-options
                        dense
                        filled
                        :label="$t('impactDurationCol')"
                      />
                    </div>
                  </div>

                  <!-- Optional duration details if for_period -->
                  <div
                    v-if="['for_period', 'with_half_life'].includes(impact.durationType)"
                    class="row q-col-gutter-xs items-center q-mt-xs"
                  >
                    <div class="col-6 col-sm-3">
                      <q-input
                        v-model.number="impact.durationNumber"
                        dense
                        filled
                        type="number"
                        label="Number"
                      />
                    </div>
                    <div class="col-6 col-sm-3">
                      <q-select
                        v-model="impact.durationUnit"
                        :options="durationUnitOptions"
                        emit-value
                        map-options
                        dense
                        filled
                        label="Unit"
                      />
                    </div>
                  </div>

                  <!-- Impact Reasoning -->
                  <div class="row q-mt-xs">
                    <div class="col-12">
                      <q-input
                        v-model="impact.thenText"
                        dense
                        filled
                        autogrow
                        :label="$t('impactReasonCol')"
                      />
                    </div>
                  </div>
                </q-item-section>

                <q-item-section side>
                  <q-btn
                    flat
                    round
                    dense
                    icon="delete"
                    color="negative"
                    @click="removeImpact(idx)"
                  />
                </q-item-section>
              </q-item>
            </q-list>
          </div>

          <!-- Notes & Considerations -->
          <q-input
            v-model="proposal.notes"
            filled
            type="textarea"
            autogrow
            :label="$t('actionProposalNotes')"
            dense
            class="q-mt-md"
          />

          <!-- Action buttons for proposal review -->
          <div class="row justify-between items-center q-mt-lg">
            <q-btn
              flat
              no-caps
              color="grey-7"
              :label="$t('startOver')"
              @click="resetProposal"
            />
            <div class="q-gutter-sm">
              <q-btn
                flat
                no-caps
                :label="$t('Cancel')"
                v-close-popup
              />
              <q-btn
                unelevated
                no-caps
                color="primary"
                icon="check"
                :label="$t('createActionProposal')"
                :loading="isSaving"
                @click="saveDraftAction"
              />
            </div>
          </div>
        </div>
      </q-tab-panel>

      <!-- TAB 2: Manual entry -->
      <q-tab-panel name="manual" class="q-pa-md">
        <q-form @submit.prevent="submitForm">
          <q-card-section>
            <modal-action-title
              v-model:title="actionToSubmit.title"
              ref="modalActionTitle"
            />
          </q-card-section>
          <modal-buttons />
        </q-form>
      </q-tab-panel>
    </q-tab-panels>
  </q-card>
</template>

<script>
import { mapActions, mapGetters, mapState } from "vuex";
import ModalHeader from "@/components/Shared/ModalComponents/ModalHeader.vue";
import ModalActionTitle from "@/components/Actions/Modals/Shared/ModalActionTitle.vue";
import ModalButtons from "@/components/Shared/ModalComponents/ModalButtons.vue";
import {
  requestActionDraft,
  heuristicDraftAction,
  compileActionFromProposal
} from "@/utils/util-aiActionDraft";

export default {
  data() {
    return {
      activeTab: "aiDraft",
      ideaText: "",
      isGenerating: false,
      isSaving: false,
      proposal: null,
      actionToSubmit: {
        orgId: this.$route.params.orgId,
        title: "",
        isProject: false,
        notes: "",
        actionMchState: { value: "initiating" },
        useSimpleEstimateMethod: false,
        simpleEstimateTotalBenefit: null,
        simpleEstimateTotalBenefitNotes: null,
        simpleEstimateOtherCosts: null,
        simpleEstimateOtherCostsNotes: null,
        impacts: [],
        estEffortHrs: null,
        effortCompletionPercentage: null,
        effortCostPerHrType: "use_average",
        customEffortCostPerHr: null,
        estSpending: null,
        spentAmount: null,
        totalDirectCost: 0,
        marginalTotalBenefitNpv: 0,
        marginalNetTotalBenefitNpv: 0,
        marginalTotalCostNpv: 0,
        actionLeverage: null,
        deadweight: 0,
        attribution: 0,
        displacement: 0,
      },
      operationOptions: [
        { label: "+", value: "+" },
        { label: "−", value: "-" },
        { label: "×", value: "*" },
        { label: "÷", value: "/" },
        { label: "=", value: "=" }
      ],
      durationTypeOptions: [
        { label: "forever", value: "forever" },
        { label: "just once", value: "just_once" },
        { label: "for period of", value: "for_period" },
        { label: "with half life of", value: "with_half_life" }
      ],
      durationUnitOptions: [
        { label: "days", value: "days" },
        { label: "weeks", value: "weeks" },
        { label: "months", value: "months" },
        { label: "years", value: "years" }
      ]
    };
  },
  computed: {
    ...mapState("orgs", ["currentOrg"]),
    ...mapState("model", ["currentModel"]),
    ...mapGetters("model", ["nodes"]),

    currentCurrency() {
      return this.currentOrg?.currency || "USD";
    },

    factorOptions() {
      if (!this.nodes) return [];
      return this.nodes.map(n => ({
        label: `${n.name} (${n.symbol})`,
        value: n.id,
        symbol: n.symbol
      }));
    }
  },
  methods: {
    ...mapActions("actions", ["addAction"]),

    async generateProposal() {
      if (!this.ideaText || !this.ideaText.trim()) return;
      this.isGenerating = true;

      try {
        const orgId = this.currentOrg?.id || this.$route.params.orgId;
        const modelId = this.currentModel?.id || this.$route.params.modelId;
        let reply = null;

        try {
          const res = await requestActionDraft({
            orgId,
            modelId,
            ideaText: this.ideaText
          });
          reply = res?.proposal;
        } catch (err) {
          // If no AI provider configured or Cloud Function unavailable, fallback gracefully to heuristic
          reply = heuristicDraftAction(this.ideaText, this.nodes || [], this.currentOrg);
          if (this.$q && this.$q.notify) {
            this.$q.notify({
              message: this.$t("heuristicFallbackNotice"),
              color: "secondary",
              icon: "lightbulb",
              timeout: 3000
            });
          }
        }

        if (!reply) {
          reply = heuristicDraftAction(this.ideaText, this.nodes || [], this.currentOrg);
        }

        // Ensure impacts have valid nodeId mapped from symbol or name
        if (reply.impacts) {
          const nodeMap = new Map();
          (this.nodes || []).forEach(n => {
            if (n.symbol) nodeMap.set(n.symbol, n.id);
            if (n.name) nodeMap.set(n.name, n.id);
          });
          reply.impacts = reply.impacts.map(imp => {
            let nId = imp.nodeId;
            if (!nId && imp.factorSymbol && nodeMap.has(imp.factorSymbol)) {
              nId = nodeMap.get(imp.factorSymbol);
            }
            if (!nId && imp.factorName && nodeMap.has(imp.factorName)) {
              nId = nodeMap.get(imp.factorName);
            }
            if (!nId && this.nodes && this.nodes[0]) {
              nId = this.nodes[0].id;
            }
            return {
              ...imp,
              nodeId: nId
            };
          });
        }

        this.proposal = reply;
      } catch (err) {
        if (this.$q && this.$q.notify) {
          this.$q.notify({
            message: err.message || "Failed to generate proposal",
            color: "negative"
          });
        }
      } finally {
        this.isGenerating = false;
      }
    },

    addEmptyImpact() {
      if (!this.proposal) return;
      if (!this.proposal.impacts) this.proposal.impacts = [];
      const defaultNodeId = this.nodes && this.nodes[0] ? this.nodes[0].id : "";
      this.proposal.impacts.push({
        nodeId: defaultNodeId,
        operation: "+",
        operand: "100",
        durationType: "for_period",
        durationNumber: 12,
        durationUnit: "months",
        thenText: ""
      });
    },

    removeImpact(idx) {
      if (!this.proposal || !this.proposal.impacts) return;
      this.proposal.impacts.splice(idx, 1);
    },

    resetProposal() {
      this.proposal = null;
    },

    async saveDraftAction() {
      if (!this.proposal || !this.proposal.title || !this.proposal.title.trim()) {
        if (this.$q && this.$q.notify) {
          this.$q.notify({
            message: "Action title is required",
            color: "negative"
          });
        }
        return;
      }

      this.isSaving = true;
      try {
        const orgId = this.currentOrg?.id || this.$route.params.orgId;
        const compiledAction = compileActionFromProposal(
          this.proposal,
          this.nodes || [],
          orgId
        );
        await this.addAction(compiledAction);
        this.$emit("close");
      } catch (err) {
        if (this.$q && this.$q.notify) {
          this.$q.notify({
            message: err.message || "Error saving action",
            color: "negative"
          });
        }
      } finally {
        this.isSaving = false;
      }
    },

    submitAction() {
      this.addAction(this.actionToSubmit);
      this.$emit("close");
    },

    submitForm() {
      this.$refs.modalActionTitle.$refs.title.validate();
      if (!this.$refs.modalActionTitle.$refs.title.hasError) {
        this.submitAction();
      }
    },
  },
  components: {
    "modal-header": ModalHeader,
    "modal-action-title": ModalActionTitle,
    "modal-buttons": ModalButtons,
  },
};
</script>
