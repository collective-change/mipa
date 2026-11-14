<template>
  <div>
    <div v-if="selectedNode">
      <q-form @submit.prevent="submitForm">
        <div class="row items-start no-wrap">
          <q-input
            class="text-h6 col"
            v-model="nodeToSubmit.name"
            :placeholder="$t('Name of the factor')"
            :rules="[(val) => !!val || $t('Required')]"
            ref="nodeName"
          />
          <q-btn flat round icon="more_horiz" class="q-mt-sm" :aria-label="$t('More options')">
            <q-tooltip>{{ $t("More options") }}</q-tooltip>
            <q-menu auto-close>
              <q-list style="min-width: 260px">
                <q-item clickable @click="openAddFactor('influencer')">
                  <q-item-section avatar><q-icon name="add_circle_outline" /></q-item-section>
                  <q-item-section>{{ $t("Add a factor this one uses") }}</q-item-section>
                </q-item>
                <q-item clickable @click="openAddFactor('influencee')">
                  <q-item-section avatar><q-icon name="add_circle_outline" /></q-item-section>
                  <q-item-section>{{ $t("Add a factor that uses this one") }}</q-item-section>
                </q-item>
                <q-separator />
                <q-item clickable @click="openAddLink('influencer')">
                  <q-item-section avatar><q-icon name="link" /></q-item-section>
                  <q-item-section>{{ $t("Link to a factor this one uses") }}</q-item-section>
                </q-item>
                <q-item clickable @click="openAddLink('influencee')">
                  <q-item-section avatar><q-icon name="link" /></q-item-section>
                  <q-item-section>{{ $t("Link to a factor that uses this one") }}</q-item-section>
                </q-item>
                <q-separator />
                <q-item clickable @click="showDeleteFactor = true">
                  <q-item-section avatar><q-icon name="delete_outline" color="negative" /></q-item-section>
                  <q-item-section class="text-negative">{{ $t("Delete factor") }}</q-item-section>
                </q-item>
              </q-list>
            </q-menu>
          </q-btn>
        </div>
        <div class="row justify-between">
          <div class="col-8">
            <q-input
              v-model="nodeToSubmit.symbol"
              :label="$t('Short name')"
              :hint="$t('shortNameHint')"
              debounce="500"
              :rules="[
                (val) => !!val || $t('Required'),
                (val) =>
                  isNaN(parseInt(val.substring(0, 1))) ||
                  $t('Cannot start with a number'),
                (val) =>
                  this.isAlphanumeric(val) ||
                  $t('shortNameCharacters'),
                (val) =>
                  this.isSymbolUnique(val) ||
                  $t('shortNameUnique'),
              ]"
            />
          </div>
          <div class="col-3">
            <q-input
              v-model="nodeToSubmit.unit"
              :label="$t('Unit')"
              :hint="$t('unitHint')"
              :rules="[
                (val) =>
                  typeof val == 'undefined' ||
                  val == '' ||
                  (val != '' && isNaN(parseInt(val.substring(0, 1)))) ||
                  $t('Cannot start with a number'),
              ]"
            />
          </div>
        </div>
        <div class="text-caption text-grey-8 q-mt-sm">{{ $t("Uses these factors") }}</div>
        <div v-if="!influencerNodesInfo.length" class="text-caption text-grey-7 q-mb-sm">
          {{ $t("noInfluencersHint") }}
        </div>
        <q-markup-table flat bordered dense v-if="influencerNodesInfo.length">
          <thead>
            <tr>
              <th class="text-left">{{ $t("Factor") }}</th>
              <th class="text-left">{{ $t("Short name") }}</th>
              <th class="text-left">{{ $t("Unit") }}</th>
            </tr>
          </thead>
          <tr v-for="influencer in influencerNodesInfo" :key="influencer.id">
            <td>
              <q-btn
                flat
                no-caps
                padding="none"
                color="white"
                text-color="black"
                :label="influencer.name"
                @click="setSelectedNodeId(influencer.id)"
              />
            </td>
            <td>{{ influencer.symbol }}</td>
            <td>{{ influencer.unit }}</td>
          </tr>
        </q-markup-table>

        <!-- Formula helper chips row -->
        <div class="row items-center q-gutter-xs q-mt-sm q-mb-xs">
          <span class="text-caption text-grey-7 q-mr-xs">{{ $t("formulaChipsLabel") }}</span>
          <q-chip
            v-for="chip in formulaPrimitives"
            :key="chip.id"
            clickable
            dense
            outline
            color="primary"
            text-color="primary"
            class="q-ma-none text-weight-medium"
            @click="insertPrimitive(chip)"
          >
            <q-icon :name="chip.icon" size="14px" class="q-mr-xs" v-if="chip.icon" />
            {{ chip.label }}
            <q-tooltip>{{ $t(chip.descKey) }}</q-tooltip>
          </q-chip>

          <q-btn
            flat
            dense
            size="sm"
            color="secondary"
            icon="add_circle"
            :label="$t('insertFactor')"
            class="q-ml-xs"
          >
            <q-tooltip>{{ $t("insertFactorHint") }}</q-tooltip>
            <q-menu auto-close style="max-height: 280px; min-width: 260px">
              <q-list dense>
                <q-item-label header class="text-caption">{{ $t("insertFactorHint") }}</q-item-label>
                <q-item
                  v-for="factor in allFactorSuggestions"
                  :key="factor.id"
                  clickable
                  @click="insertFactor(factor)"
                >
                  <q-item-section>
                    <div class="row items-center">
                      <span class="text-weight-bold text-primary q-mr-sm">{{ factor.symbol }}</span>
                      <span class="text-caption text-grey-8">{{ factor.name }}</span>
                    </div>
                  </q-item-section>
                  <q-item-section side>
                    <q-badge
                      :color="isInfluencerLinked(factor.id) ? 'positive' : 'grey-5'"
                      :label="isInfluencerLinked(factor.id) ? $t('linkedInfluencer') : $t('unlinkedFactor')"
                    />
                  </q-item-section>
                </q-item>
              </q-list>
            </q-menu>
          </q-btn>
        </div>

        <q-input
          ref="formulaInput"
          v-model="nodeToSubmit.symbolFormula"
          :label="$t('Formula: how this factor is calculated')"
          prefix="="
          autogrow
          debounce="500"
          @keyup="onFormulaKeyUp"
          @click="updateCursorPos"
          @focus="updateCursorPos"
          :rules="[
            (val) => isAllowedInFormula(val) || $t('formulaCharacters'),
            () => formulaValidation.valid || $t('formulaSyntaxErrorBlock')
          ]"
        />

        <!-- Inline Factor Autocomplete Suggestions Popup/Bar -->
        <div v-if="autocompleteSuggestions.length > 0 && showAutocompleteMenu" class="q-mb-sm">
          <q-card flat bordered class="bg-grey-1 q-pa-xs">
            <div class="row items-center justify-between q-px-xs q-pb-xs">
              <span class="text-caption text-grey-7">
                {{ $t("insertFactorHint") }} ("{{ currentFormulaToken }}")
              </span>
              <q-btn flat round dense icon="close" size="xs" @click="showAutocompleteMenu = false" />
            </div>
            <div class="row q-gutter-xs">
              <q-chip
                v-for="sug in autocompleteSuggestions"
                :key="sug.id"
                clickable
                dense
                color="white"
                text-color="primary"
                class="q-ma-none shadow-1"
                @click="insertFactor(sug, currentFormulaToken)"
              >
                <span class="text-weight-bold text-primary q-mr-xs">{{ sug.symbol }}</span>
                <span class="text-caption text-grey-8">({{ sug.name }})</span>
                <q-icon
                  :name="isInfluencerLinked(sug.id) ? 'check_circle' : 'add_link'"
                  :color="isInfluencerLinked(sug.id) ? 'positive' : 'grey-6'"
                  size="14px"
                  class="q-ml-xs"
                />
              </q-chip>
            </div>
          </q-card>
        </div>

        <!-- Syntax Error Banner -->
        <q-banner
          v-if="!formulaValidation.valid && !formulaValidation.empty"
          dense
          rounded
          class="bg-red-1 text-negative q-mt-xs q-mb-xs"
        >
          <template v-slot:avatar>
            <q-icon name="error_outline" color="negative" />
          </template>
          <div class="text-weight-medium">
            <span v-if="formulaValidation.errorType === 'parenthesis'">{{ $t('formulaErrorParenthesis') }}</span>
            <span v-else-if="formulaValidation.errorType === 'incomplete'">{{ $t('formulaErrorIncomplete') }}</span>
            <span v-else>{{ formulaValidation.error }}</span>
          </div>
          <div class="text-caption text-grey-8" v-if="formulaValidation.error">
            {{ formulaValidation.error }}
          </div>
        </q-banner>

        <!-- Unlinked Factors Banner -->
        <q-banner
          v-if="formulaValidation.valid && formulaValidation.unlinkedSymbols.length > 0"
          dense
          rounded
          class="bg-amber-1 text-brown-9 q-mt-xs q-mb-xs"
        >
          <template v-slot:avatar>
            <q-icon name="warning_amber" color="warning" />
          </template>
          <div>{{ $t('formulaUnlinkedWarning') }}</div>
          <div class="row q-gutter-xs q-mt-xs">
            <q-btn
              v-for="unlinked in formulaValidation.unlinkedSymbols"
              :key="unlinked.symbol"
              size="sm"
              outline
              dense
              color="warning"
              text-color="brown-10"
              icon="link"
              :label="$t('linkFactorButton', { name: unlinked.name || unlinked.symbol })"
              @click="linkInfluencer(unlinked.nodeId)"
            />
          </div>
        </q-banner>

        <!-- Unrecognized Symbols Notice -->
        <div
          v-if="formulaValidation.valid && formulaValidation.unknownSymbols.length > 0"
          class="text-caption text-orange-9 q-mt-xs q-mb-xs row items-center"
        >
          <q-icon name="info" class="q-mr-xs" size="14px" />
          {{ $t('formulaUnknownSymbols') }}: {{ formulaValidation.unknownSymbols.join(', ') }}
        </div>

        <q-expansion-item
          dense
          dense-toggle
          icon="help_outline"
          :label="$t('How to write formulas')"
          header-class="text-caption text-primary q-px-none"
        >
          <div class="text-caption formula-help">{{ $t("formulaHelp") }}</div>
        </q-expansion-item>
        <div v-if="formulaValidation.valid && latexFormula" class="q-my-xs">
          <latex-formula
            :formula="nodeToSubmit.symbol + '=' + latexFormula"
          />
        </div>
        <q-input
          v-model="nodeToSubmit.latestValue"
          :label="$t('Current value (optional)')"
          type="number"
          step="any"
          :suffix="nodeToSubmit.unit"
          :hint="$t('currentValueHint')"
          debounce="300"
        />

        <!-- Data Provenance & Freshness section -->
        <q-expansion-item
          dense
          dense-toggle
          icon="verified"
          :label="$t('factorProvenanceSection')"
          header-class="text-caption text-primary q-px-none q-mt-xs"
          default-opened
        >
          <div class="row items-center justify-between q-my-xs">
            <span class="text-caption text-grey-7">{{ $t('freshnessStatus') }}:</span>
            <q-chip
              dense
              size="sm"
              :color="factorFreshness.color"
              text-color="white"
              class="text-weight-medium"
            >
              {{ $t(factorFreshness.labelKey) }}
              <span v-if="factorFreshness.daysElapsed !== null" class="q-ml-xs">
                ({{ factorFreshness.daysElapsed }}d)
              </span>
            </q-chip>
          </div>

          <div class="row q-col-gutter-xs">
            <div class="col-12 col-sm-6">
              <q-select
                v-model="nodeToSubmit.costCategory"
                dense
                outlined
                options-dense
                emit-value
                map-options
                clearable
                :options="accountingCategoryOptions"
                :label="$t('costCategory')"
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-input
                v-model="nodeToSubmit.reportingPeriod"
                dense
                outlined
                :label="$t('reportingPeriod')"
                :hint="$t('reportingPeriodHint')"
              />
            </div>
          </div>

          <div class="row q-col-gutter-xs q-mt-xs">
            <div class="col-12 col-sm-6">
              <q-input
                v-model="nodeToSubmit.effectiveDate"
                dense
                outlined
                type="date"
                :label="$t('effectiveDate')"
                :hint="$t('effectiveDateHint')"
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-input
                v-model="nodeToSubmit.sourceCitation"
                dense
                outlined
                :label="$t('sourceCitation')"
                :hint="$t('sourceCitationHint')"
              />
            </div>
          </div>
        </q-expansion-item>
        <div style="height: 15px"></div>
        <select-user
          :label="$t('Responsible person')"
          v-model="nodeToSubmit.responsiblePerson"
        />
        <q-toggle
          v-if="selectedNode.id != currentModel.roleNodes?.averageEffortCostPerHour"
          v-model="nodeToSubmit.isHourlyCost"
          :label="$t('isHourlyCostLabel')"
          class="q-mt-sm"
        >
          <q-tooltip max-width="300px">{{ $t("isHourlyCostHint") }}</q-tooltip>
        </q-toggle>
        <q-input v-model="nodeToSubmit.notes" :label="$t('Notes')" autogrow />
        <modal-buttons />
      </q-form>
      <div class="text-h6">{{ $t("Chat") }}</div>
      <chat
        :chatId="nodeToSubmit.chatId"
        subjectDocType="node"
        :subjectDocLineage="{
          modelId: currentModel.id,
          nodeId: selectedNode.id,
        }"
        :subjectDocTitle="nodeToSubmit.name"
      />
      <div v-if="nodeChart.chartData.length > 0" class="q-mt-md">
        <gchart
          v-if="nodeChart.chartData.length > 0"
          type="LineChart"
          :data="nodeChart.chartData"
          :options="nodeChart.chartOptions"
        />
        <div class="row justify-center">
          <q-btn-toggle
            v-model="nodeChart.chartOptions.vAxis.scaleType"
            toggle-color="primary"
            size="xs"
            :options="[
              { label: $t('Linear'), value: 'linear' },
              { label: $t('Log scale'), value: 'mirrorLog' },
            ]"
          />
        </div>
      </div>

      <div v-if="influencerChartsArr.length" class="text-h6">{{ $t("Factors it uses") }}</div>
      <div
        v-for="chart in influencerChartsArr"
        :key="chart.nodeId"
        class="q-pa-md"
      >
        <gchart
          type="LineChart"
          :data="chart.chartData"
          :options="chart.chartOptions"
        />
        <div class="row justify-center q-gutter-x-md">
          <q-btn-toggle
            v-model="chart.chartOptions.vAxis.scaleType"
            action-color="primary"
            size="xs"
            :options="[
              { label: $t('Linear'), value: 'linear' },
              { label: $t('Log scale'), value: 'mirrorLog' },
            ]"
          />
          <q-btn
            size="xs"
            :label="$t('Open')"
            @click="setSelectedNodeId(chart.nodeId)"
          />
        </div>
      </div>

      <p class="text-caption text-grey-6 q-mt-md">ID: {{ nodeToSubmit.id }}</p>

      <q-dialog v-model="showAddFactor">
        <add-node
          :sourceNodeId="selectedNode.id"
          :newNodeRole="addFactorRole"
          @close="showAddFactor = false"
        />
      </q-dialog>
      <q-dialog v-model="showAddLink">
        <add-link
          :sourceNodeId="selectedNode.id"
          :linkToSubmit="linkToSubmit"
          @close="showAddLink = false"
        />
      </q-dialog>
      <q-dialog v-model="showDeleteFactor">
        <delete-node :node="selectedNode" @close="showDeleteFactor = false" />
      </q-dialog>
      <!--
      <p>symbolFormula</p>
      <pre>{{ nodeToSubmit.symbolFormula }}</pre>
      <p>parsedSymbolFormula</p>
      <pre>{{ parsedSymbolFormula }}</pre>
      <p>sysFormula</p>
      <pre>{{ nodeToSubmit.sysFormula }}</pre>
      <p>nodeToSubmit</p>
      <pre>{{ nodeToSubmit }}</pre>-->
    </div>
  </div>
</template>

<script>
import { mapActions, mapGetters, mapState } from "vuex";
import { parse } from "mathjs";
import LatexFormula from "@/components/Shared/LatexFormula.vue";
import { GChart } from "vue-google-charts";
import { showErrorMessage } from "@/utils/util-show-error-message";
import { classifyInfluencers } from "@/utils/util-node-operations";
import {
  FORMULA_PRIMITIVES,
  validateFormulaSyntax,
  getFactorSuggestions,
  insertSnippetIntoFormula
} from "@/utils/formulaHelper";
import {
  ACCOUNTING_CATEGORIES,
  evaluateFactorFreshness
} from "@/utils/dataIngestion";
import SelectUser from "../Users/SelectUser.vue";
import ModalButtons from "@/components/Shared/ModalComponents/ModalButtons.vue";
import Chat from "@/components/Chats/Chat.vue";
import AddNode from "@/components/Model/Modals/AddNode.vue";
import AddLink from "@/components/Model/Modals/AddLink.vue";
import DeleteNode from "@/components/Model/Modals/DeleteNode.vue";

export default {
  components: {
    "add-node": AddNode,
    "add-link": AddLink,
    "delete-node": DeleteNode,
    "modal-buttons": ModalButtons,
    "select-user": SelectUser,
    chat: Chat,
    gchart: GChart,
    "latex-formula": LatexFormula,
  },

  data() {
    return {
      nodeToSubmit: {},
      oldNodeToSubmit: {}, //used for comparing changes to nodeToSubmit
      // "⋯" menu (same actions as right-clicking the factor in the graph)
      showAddFactor: false,
      addFactorRole: "",
      showAddLink: false,
      linkToSubmit: { sourceNodeId: "", targetNodeId: "", targetType: "" },
      showDeleteFactor: false,
      nodeToSubmitIsFreshlyAssigned: false,
      model: null,
      accountingCategories: ACCOUNTING_CATEGORIES,
      formulaPrimitives: FORMULA_PRIMITIVES,
      formulaCursorPos: 0,
      currentFormulaToken: "",
      showAutocompleteMenu: false,
      nodeChart: {
        chartData: [],
        chartOptions: {
          vAxis: { scaleType: "linear", format: "short" },
          legend: { position: "none" },
        },
      },
      influencerChartsArr: [],
    };
  },

  computed: {
    ...mapState("ui", [
      "selectedNodeId",
      "uiNodeChanged",
      "uiNodeChangedFields",
    ]),
    ...mapState("calcResults", ["baseline"]),
    ...mapState("model", ["currentModel"]),
    ...mapGetters("model", ["nodes", "links"]),

    selectedNode() {
      let that = this;
      return this.nodes.find(function (node) {
        return node.id == that.selectedNodeId;
      });
    },

    accountingCategoryOptions() {
      return this.accountingCategories.map((c) => ({
        value: c.value,
        label: this.$t(c.labelKey)
      }));
    },

    factorFreshness() {
      return evaluateFactorFreshness(this.nodeToSubmit);
    },

    influencerNodesInfo() {
      let nodeToSubmit = this.nodeToSubmit;
      let influencerNodesInfo = [];
      if (typeof nodeToSubmit.influencers == "undefined")
        return influencerNodesInfo;
      let influencerNodes = this.nodes.filter((node) =>
        nodeToSubmit.influencers.includes(node.id)
      );
      influencerNodes.forEach(function (influencerNode) {
        let influencerNodeInfo = {
          id: influencerNode.id,
          name: influencerNode.name,
          symbol: influencerNode.symbol,
          unit: influencerNode.unit,
          isBlocking: nodeToSubmit.blockingInfluencers.includes(
            influencerNode.id
          ),
          isUnused: nodeToSubmit.unusedInfluencers.includes(influencerNode.id),
        };
        influencerNodesInfo.push(influencerNodeInfo);
      });
      return influencerNodesInfo;
    },

    formulaValidation() {
      const availableSymbols = [this.nodeToSubmit?.symbol || ""];
      if (Array.isArray(this.nodeToSubmit?.influencers)) {
        this.nodeToSubmit.influencers.forEach((id) => {
          const found = (this.nodes || []).find((n) => n.id === id);
          if (found && found.symbol) availableSymbols.push(found.symbol);
        });
      }
      return validateFormulaSyntax(this.nodeToSubmit?.symbolFormula || "", {
        availableSymbols,
        allNodes: this.nodes || [],
        currentNodeId: this.nodeToSubmit?.id
      });
    },

    allFactorSuggestions() {
      return getFactorSuggestions("", this.nodes, this.nodeToSubmit?.id, this.nodeToSubmit?.influencers);
    },

    autocompleteSuggestions() {
      if (!this.currentFormulaToken) return [];
      return getFactorSuggestions(
        this.currentFormulaToken,
        this.nodes,
        this.nodeToSubmit?.id,
        this.nodeToSubmit?.influencers
      ).slice(0, 8);
    },

    //parse symbol formula
    parsedSymbolFormula() {
      if (!this.nodeToSubmit?.symbolFormula || !this.formulaValidation?.valid) {
        return "";
      }
      try {
        return parse(this.nodeToSubmit.symbolFormula);
      } catch (err) {
        return "";
      }
    },

    watchedObjectForNodePropertyRecalculation() {
      return {
        latestValue: this.nodeToSubmit.latestValue,
        parsedFormula: this.parsedSymbolFormula,
      };
    },

    //latexFormula from parsedSymbolFormula
    latexFormula() {
      return this.parsedSymbolFormula && typeof this.parsedSymbolFormula.toTex === "function"
        ? this.parsedSymbolFormula.toTex({
            parenthesis: "keep",
            implicit: "hide",
          })
        : "";
    },
  },

  methods: {
    openAddFactor(role) {
      this.addFactorRole = role;
      this.showAddFactor = true;
    },
    openAddLink(targetType) {
      this.linkToSubmit = {
        sourceNodeId: this.selectedNode.id,
        targetNodeId: "",
        targetType
      };
      this.showAddLink = true;
    },
    ...mapActions("model", ["updateNode", "addLink"]),
    ...mapActions("ui", ["setSelectedNodeId"]),

    isAlphanumeric(str) {
      return str ? str.match(/^[a-z0-9_]+$/i) !== null : false;
    },
    isSymbolUnique(val) {
      if (!val || !this.nodes) return true;
      return !this.nodes.some(
        (node) => node.id !== this.nodeToSubmit.id && node.symbol === val
      );
    },
    isAllowedInFormula(str) {
      if (!str) return true;
      return str.match(/^[a-z0-9 _,=<>/:%\-\(\)\+\^\.\?\*]+$/i) !== null;
    },
    isInfluencerLinked(nodeId) {
      return Array.isArray(this.nodeToSubmit?.influencers) && this.nodeToSubmit.influencers.includes(nodeId);
    },
    updateCursorPos() {
      this.$nextTick(() => {
        const inputEl = this.$refs.formulaInput?.$el?.querySelector("input, textarea");
        if (inputEl && typeof inputEl.selectionStart === "number") {
          this.formulaCursorPos = inputEl.selectionStart;
        }
      });
    },
    onFormulaKeyUp() {
      this.updateCursorPos();
      this.$nextTick(() => {
        const formula = this.nodeToSubmit?.symbolFormula || "";
        const pos = this.formulaCursorPos;
        const match = formula.slice(0, pos).match(/([a-zA-Z0-9_]+)$/);
        if (match && match[1].length >= 1) {
          this.currentFormulaToken = match[1];
          this.showAutocompleteMenu = true;
        } else {
          this.showAutocompleteMenu = false;
          this.currentFormulaToken = "";
        }
      });
    },
    insertPrimitive(chip) {
      const currentFormula = this.nodeToSubmit?.symbolFormula || "";
      let snippet = chip.snippet;
      if (chip.id === "delay") {
        snippet = `delay(${this.nodeToSubmit?.symbol || "factor"}, dt, 0)`;
      }
      const res = insertSnippetIntoFormula(
        currentFormula,
        snippet,
        this.formulaCursorPos,
        this.formulaCursorPos
      );
      this.nodeToSubmit.symbolFormula = res.newFormula;
      this.formulaCursorPos = res.newCursorPosition;
      this.showAutocompleteMenu = false;
      this.focusFormulaInput();
    },
    insertFactor(factor, tokenToReplace = "") {
      const currentFormula = this.nodeToSubmit?.symbolFormula || "";
      const snippet = factor.symbol;
      const res = insertSnippetIntoFormula(
        currentFormula,
        snippet,
        this.formulaCursorPos,
        this.formulaCursorPos,
        tokenToReplace || this.currentFormulaToken
      );
      this.nodeToSubmit.symbolFormula = res.newFormula;
      this.formulaCursorPos = res.newCursorPosition;
      this.showAutocompleteMenu = false;
      this.currentFormulaToken = "";

      if (!this.isInfluencerLinked(factor.id)) {
        this.linkInfluencer(factor.id);
      }
      this.focusFormulaInput();
    },
    linkInfluencer(influencerId) {
      if (!Array.isArray(this.nodeToSubmit.influencers)) {
        this.nodeToSubmit.influencers = [];
      }
      if (!this.nodeToSubmit.influencers.includes(influencerId)) {
        this.nodeToSubmit.influencers.push(influencerId);
      }
      if (this.selectedNode?.id && this.$route?.params?.modelId && this.addLink) {
        this.addLink({
          modelId: this.$route.params.modelId,
          link: {
            sourceNodeId: this.selectedNode.id,
            targetNodeId: influencerId,
            targetType: "influencer"
          }
        });
      }
    },
    focusFormulaInput() {
      this.$nextTick(() => {
        if (this.$refs.formulaInput && typeof this.$refs.formulaInput.focus === "function") {
          this.$refs.formulaInput.focus();
        }
        const inputEl = this.$refs.formulaInput?.$el?.querySelector("input, textarea");
        if (inputEl && typeof inputEl.setSelectionRange === "function") {
          inputEl.setSelectionRange(this.formulaCursorPos, this.formulaCursorPos);
        }
      });
    },
    submitForm() {
      if (this.$refs.nodeName) {
        this.$refs.nodeName.validate();
        if (this.$refs.nodeName.hasError) return;
      }
      if (!this.formulaValidation?.valid) {
        if (this.$q && this.$q.notify) {
          this.$q.notify({
            type: "negative",
            message: this.$t("formulaSyntaxErrorBlock")
          });
        }
        return;
      }
      this.submitNode();
    },
    submitNode() {
      let oldLatestVal = this.selectedNode.latestValue;
      let newLatestVal = this.nodeToSubmit.latestValue;
      let oldLatestValIsANumber =
        typeof oldLatestVal != "undefined" &&
        oldLatestVal !== "" &&
        !isNaN(Number(oldLatestVal));
      let newLatestValIsANumber =
        typeof newLatestVal != "undefined" &&
        newLatestVal !== "" &&
        !isNaN(Number(newLatestVal));
      let latestValueExistenceChanged =
        oldLatestValIsANumber != newLatestValIsANumber;

      let oldSymbol = this.selectedNode.symbol;
      let newSymbol = this.nodeToSubmit.symbol;
      let symbolChanged = oldSymbol != newSymbol;
      this.nodeToSubmit.isNew = false;

      this.updateNode({
        modelId: this.$route.params.modelId,
        updates: this.nodeToSubmit,
        latestValueExistenceChanged: latestValueExistenceChanged,
        symbolChanged: symbolChanged,
        /* "symbolChanged" doesn't actually work yet to classify influencers
        of node's influencees, because classifyInfluencers currently
        starts with sysFormula, which would not change until it's recomposed.
        */
      });
    },
    updateChartData() {
      // if baseline.nodes contains the selected node then load baseline for this nde
      if (
        this.selectedNodeId !== null &&
        this.selectedNode !== undefined &&
        this.baseline !== undefined &&
        this.baseline.nodesValues != undefined &&
        this.selectedNodeId in this.baseline.nodesValues
      ) {
        let timeSPoints = this.baseline.timeSPoints;
        let values = this.baseline.nodesValues[this.selectedNodeId];
        let chartData = [];
        let chartOptions = {};
        if (values.length > 0) {
          chartData.push(["time", "value"]);
          for (var i = 0; i < timeSPoints.length; i++) {
            chartData.push([new Date(timeSPoints[i] * 1000), values[i]]);
          }
          chartOptions = {
            title: this.selectedNode.name,
            vAxis: {
              title: this.selectedNode.unit,
              scaleType: "linear",
              format: "short",
            },
            legend: { position: "none" },
          };
        }
        this.nodeChart = { chartData, chartOptions };
      } else {
        this.nodeChart = {
          chartData: [],
          chartOptions: {
            vAxis: { scaleType: "linear", format: "short" },
            legend: { position: "none" },
          },
        };
      }
    },
    updateChartDataForNode(nodeId) {
      //console.log(this.resultsOfAction.timeSPoints);

      // if baseline.nodes contains the selected node then load baseline for this nde
      if (
        this.selectedNodeId !== "null" &&
        typeof this.baseline !== "undefined" &&
        typeof this.baseline.nodesValues != "undefined" &&
        nodeId in this.baseline.nodesValues
      ) {
        let timeSPoints = this.baseline.timeSPoints;
        let values = this.baseline.nodesValues[nodeId];

        //if nodeId does not exist in chartsDataArr then create it
        let chart = this.influencerChartsArr.find(
          (chart) => chart.nodeId == nodeId
        );
        if (typeof chart == "undefined") {
          //let foundNode = this.nodes.find((node) => node.id == nodeId);
          let unit = (chart = {
            nodeId: nodeId,
            chartData: [],
            chartOptions: {
              title: this.getNodeName(nodeId),
              vAxis: {
                title: this.getNodeUnit(nodeId),
                scaleType: "linear",
                format: "short",
              },
              legend: { position: "none" },
              //legend: { position: "bottom" },
              //series: this.showDifferenceConfig,
              //explorer: {}
            },
          });
          this.influencerChartsArr.push(chart);
        } else chart.chartData = [];
        if (values.length > 0) {
          chart.chartData.push(["time", "value"]);
          for (var i = 0; i < timeSPoints.length; i++) {
            chart.chartData.push([new Date(timeSPoints[i] * 1000), values[i]]);
          }
        }
      } else {
        this.influencerChartsArr = [];
      }
    },
    updateInfluencerChartsArr() {
      if (!this.selectedNode) return;
      let influencerNodesToChart = this.selectedNode.influencers;
      /*
      //add combinedBenefit and combinedCost nodes
      influencerNodesToChart.push(this.currentModel.roleNodes.combinedBenefit);
      influencerNodesToChart.push(this.currentModel.roleNodes.combinedCost);
      influencerNodesToChart.push(this.currentModel.roleNodes.effort);
      influencerNodesToChart.push(this.currentModel.roleNodes.spending);
      //add impacted nodes
      this.uiAction.impacts.forEach(function (impact) {
        influencerNodesToChart.push(impact.nodeId);
      });
      */

      //load data into each node
      if (influencerNodesToChart)
        influencerNodesToChart.forEach((nodeId) =>
          this.updateChartDataForNode(nodeId)
        );
    },
    getNodeName(nodeId) {
      const found = this.nodes.find((node) => node.id == nodeId);
      if (found) return found.name;
      else return nodeId;
    },
    getNodeUnit(nodeId) {
      const found = this.nodes.find((node) => node.id == nodeId);
      if (found) return found.unit;
      else return "";
    },
  },

  watch: {
    selectedNode: {
      immediate: true,
      handler: function () {
        if (!this.selectedNode) return;
        this.nodeToSubmitIsFreshlyAssigned = true;
        this.nodeToSubmit = Object.assign({}, this.selectedNode, {
          influencers: [...(this.selectedNode.influencers || [])],
          blockingInfluencers: [...(this.selectedNode.blockingInfluencers || [])],
          unusedInfluencers: [...(this.selectedNode.unusedInfluencers || [])]
        });
        this.$store.commit("ui/setUiNodeChanged", false);
        this.influencerChartsArr = [];
        this.nodeChart = {};
        this.updateChartData();
        this.updateInfluencerChartsArr();
      },
    },

    nodeToSubmit: {
      deep: true,
      handler: function (newNode) {
        if (!this.nodeToSubmitIsFreshlyAssigned) {
          let oldNode = this.oldNodeToSubmit;
          let differences = Object.keys(newNode).filter(
            (k) =>
              (newNode[k] ? newNode[k] : {}).toString() !==
              (oldNode[k] ? oldNode[k] : {}).toString()
          );

          differences = differences.filter(function (item) {
            return ![
              "sysFormula",
              "class",
              "blockingInfluencers",
              "unusedInfluencers",
              "updateTime",
            ].includes(item);
          });
          if (differences.length) {
            this.$store.commit("ui/setUiNodeChanged", true);
            this.$store.commit("ui/addUiNodeChangedFields", differences);
            //console.log({ differences });
          }
        } else {
          this.nodeToSubmitIsFreshlyAssigned = false;
        }
        Object.assign(this.oldNodeToSubmit, newNode);
      },
    },

    baseline: function () {
      this.updateChartData();
    },

    watchedObjectForNodePropertyRecalculation: function (/*newVersion, oldVersion*/) {
      let parsedSymbolFormula = this.parsedSymbolFormula
        ? this.parsedSymbolFormula
        : "";
      // calculate sysFormula
      if (parsedSymbolFormula.toString() == "") {
        this.nodeToSubmit.sysFormula = "";
      } else {
        var nodes = this.nodes;
        var influencerNode = {};

        //gather up ids of self, influencers, and their symbols
        var potentials = [];
        potentials.push({
          symbol: this.nodeToSubmit.symbol,
          id: this.nodeToSubmit.id,
        });
        if (
          "influencers" in this.nodeToSubmit &&
          this.nodeToSubmit.influencers.length > 0
        ) {
          this.nodeToSubmit.influencers.forEach(function (influencerNodeId) {
            influencerNode = nodes.find(function (node) {
              return node.id == influencerNodeId;
            });
            if (influencerNode && influencerNode.symbol) {
              potentials.push({
                symbol: influencerNode.symbol,
                id: influencerNodeId,
              });
            }
          });
        }
        potentials.sort(function (a, b) {
          return (b.symbol || "").length - (a.symbol || "").length;
        });

        var sysFormula = parsedSymbolFormula.toString();
        if (sysFormula) {
          potentials.forEach(function (node) {
            sysFormula = sysFormula.replace(
              new RegExp("\\b" + node.symbol + "\\b", "g"), //global replacement
              "$" + node.id
            );
          });
        }
        sysFormula.trim(); //trim whitespace from both sides
        sysFormula = sysFormula.replace(/  +/g, " "); //replace multiple spaces with single space
        this.nodeToSubmit.sysFormula = sysFormula;
      }

      //calculate blockingInfluencers
      let classifiedInfluencers = classifyInfluencers({
        thisNode: this.nodeToSubmit,
      });
      //console.log("classifyInfluencers ran");
      this.nodeToSubmit.blockingInfluencers = classifiedInfluencers.blocking;
      this.nodeToSubmit.unusedInfluencers = classifiedInfluencers.unused;
      this.nodeToSubmit.isSelfBlocking = classifiedInfluencers.blocking.includes(
        this.nodeToSubmit.id
      );
    },
  },
};
</script>

<style scoped>
.formula-help {
  white-space: pre-line;
}
</style>
