<template>
  <div>
    <q-table
      title="Actions"
      :rows="matchingActions"
      :columns="columnsI18n"
      row-key="id"
      :filter="filter"
      :loading="loading"
      v-model:pagination="pagination"
      :rows-per-page-options="[10, 20, 50, 0]"
      :rows-per-page-label="$t('Records per page')"
      binary-state-sort
      @row-click="onRowClick"
    >
      <template v-slot:top>
        <div class="col-2 q-table__title">{{ $t("Actions") }}</div>
        <q-space />
        <div class="row q-gutter-sm">
          <q-btn
            color="primary"
            icon="add"
            unelevated
            no-caps
            :disable="loading"
            :label="$t('Add action')"
            @click="showAddAction = true"
          />
          <calculator-ui
            calculationType="actions"
            :buttonLabel="$t('Recalculate')"
            icon="calculate"
            outline
            no-caps
          />
          <q-btn
            color="primary"
            icon="description"
            outline
            no-caps
            :disable="loading || !matchingActions || !matchingActions.length"
            :label="$t('decisionBrief')"
            @click="selectedActionsForBrief = []; showDecisionBrief = true"
          />
        </div>
        <div class="row q-gutter-sm">
          <select-action-states
            class="q-pl-sm"
            :label="$t('States')"
            v-model="actionStatesToSearch"
          />
          <select-user
            class="q-pl-sm"
            :label="$t('Responsible')"
            v-model="responsiblePersonToSearch"
          />
          <select-user
            class="q-pl-sm"
            :label="$t('Accountable')"
            v-model="accountablePersonToSearch"
          />
          <q-input
            dense
            debounce="300"
            color="primary"
            v-model="filter"
            clearable
            :placeholder="$t('Search actions')"
            class="q-pl-sm"
          >
            <template v-slot:append>
              <q-icon name="search" />
            </template>
          </q-input>
        </div>
      </template>
      <template v-slot:header-cell="props">
        <q-th :props="props">
          {{ props.col.label }}
          <q-icon
            v-if="props.col.help"
            name="help_outline"
            size="xs"
            color="grey-6"
            class="q-ml-xs"
          >
            <q-tooltip max-width="280px">{{ $t(props.col.help) }}</q-tooltip>
          </q-icon>
        </q-th>
      </template>
      <template v-slot:body-cell-actionLeverage="props">
        <q-td :props="props">
          <div class="row items-center justify-end no-wrap">
            <q-btn
              flat
              round
              dense
              size="xs"
              icon="psychology"
              color="primary"
              class="q-mr-xs"
              @click.stop="openExplainRanking(props.row)"
            >
              <q-tooltip>{{ $t("explainRankingShort") }}</q-tooltip>
            </q-btn>
            <span>{{ props.value }}</span>
          </div>
        </q-td>
      </template>
      <template v-slot:body-cell-sroiRatio="props">
        <q-td :props="props">
          <q-badge v-if="props.value !== '-'" color="positive" text-color="white" dense>
            {{ props.value }}
          </q-badge>
          <span v-else class="text-grey-5">-</span>
        </q-td>
      </template>
      <template v-slot:no-data>
        <empty-state
          class="full-width"
          icon="wb_incandescent"
          icon-color="primary"
          :title="$t('noActionsTitle')"
          :description="$t('noActionsText')"
          :action-label="$t('Add an action')"
          action-icon="add"
          @action="showAddAction = true"
        />
      </template>
    </q-table>
    <q-dialog v-model="showAddAction">
      <add-action @close="showAddAction = false" />
    </q-dialog>
    <decision-brief-modal
      v-model="showDecisionBrief"
      :initialActions="selectedActionsForBrief"
    />
    <explain-ranking-modal
      v-model="showExplainRanking"
      :action="actionToExplain"
      @open-full-brief="openBriefWithActions"
    />
  </div>
</template>

<script>
import { mapGetters, mapState } from "vuex";
import { firebaseApp, firebaseDb, firebaseAuth } from "@/boot/firebase";
import { formatNumber } from "@/utils/util-formatNumber";
import { formatSroiRatio } from "@/utils/sroi";
import {
  getUserDisplayNameOrTruncatedEmail,
  getUserPhotoURL,
} from "@/utils/util-getUserDetails";
import AddAction from "@/components/Actions/Modals/AddAction.vue";
import DecisionBriefModal from "@/components/Actions/Modals/DecisionBriefModal.vue";
import ExplainRankingModal from "@/components/Actions/Modals/ExplainRankingModal.vue";
import CalculatorUi from "@/components/Calc/CalculatorUi.vue";
import SelectUser from "@/components/Users/SelectUser.vue";
import SelectActionStates from "@/components/Actions/SelectActionStates.vue";
import EmptyState from "@/components/Shared/EmptyState.vue";

function getRelationshipsDisplay(row) {
  let relationships = [];
  if (row.parentActionId) relationships.push("has parent");
  if (row.childrenActionIds && row.childrenActionIds.length)
    relationships.push(row.childrenActionIds.length + " children");
  if (row.blockerActionIds && row.blockerActionIds.length)
    relationships.push("blocked by " + row.blockerActionIds.length);
  if (row.blockeeActionIds && row.blockeeActionIds.length)
    relationships.push("blocks " + row.blockeeActionIds.length);
  return relationships.join("; ");
}

export default {
  components: {
    "add-action": AddAction,
    "decision-brief-modal": DecisionBriefModal,
    "explain-ranking-modal": ExplainRankingModal,
    "empty-state": EmptyState,
    "calculator-ui": CalculatorUi,
    "select-user": SelectUser,
    "select-action-states": SelectActionStates,
  },
  props: ["options"],
  data() {
    return {
      showAddAction: false,
      showDecisionBrief: false,
      showExplainRanking: false,
      actionToExplain: null,
      selectedActionsForBrief: [],
      loading: false,
      filter: "",
      actionStatesToSearch: this.options.actionStatesToSearch,
      responsiblePersonToSearch: this.options.responsiblePersonToSearch,
      accountablePersonToSearch: this.options.accountablePersonToSearch,
      //rowCount: 10, //only used in sample code; delete when not needed anymore
      pagination: {
        sortBy: "actionLeverage",
        descending: true,
        page: 1,
        rowsPerPage: 10,
        // rowsNumber: xx if getting data from a server
      },
    };
  },

  computed: {
    //...mapGetters("settings", ["settings"]),
    ...mapState("actions", ["matchingActions"]),
    ...mapState("uiAction", ["uiActionChanged"]),
    ...mapState("ui", ["selectedActionId"]),
    ...mapState("orgs", ["currentOrg"]),
    ...mapGetters("users", ["currentOrgUsers"]),
    columnsI18n() {
      let columns = [
        {
          name: "actionLeverage",
          help: "helpLeverage",
          required: true,
          align: "right",
          label: this.$t("Leverage"),
          field: "actionLeverage",
          format: (val) => `${formatNumber(val, 2)}`,
          sortable: true,
          sortBy: "desc",
        },
        {
          name: "sroiRatio",
          align: "right",
          label: "SROI",
          field: "sroiRatio",
          format: (val) => formatSroiRatio(val),
          sortable: true,
        },
        {
          name: "state",
          help: "helpState",
          align: "center",
          label: this.$t("State"),
          field: "actionMchState",
          format: (ams) => `${this.$t(ams.value)}`,
          sortable: true,
          sort: (a, b) => ("" + a.value).localeCompare(b.value),
        },
        {
          name: "title",
          required: true,
          label: this.$t("Title"),
          align: "left",
          //field: row => row.id.substring(0, 2) + " " + row.title,
          field: (row) => row.title,
          sortable: true,
        },
        {
          name: "responsible-accountable",
          help: "helpResponsibleAccountable",
          required: true,
          label: this.$t("Responsible, accountable"),
          align: "left",
          field: (row) =>
            getUserDisplayNameOrTruncatedEmail(
              this.currentOrgUsers,
              row.responsiblePerson
            ) +
            ", " +
            getUserDisplayNameOrTruncatedEmail(
              this.currentOrgUsers,
              row.accountablePerson
            ),
          //field: (row) => row.title,
          sortable: true,
        },
        /*{
          name: "isProject",
          align: "center",
          label: this.$t('isProject'),
          field: "isProject",
          sortable: true
        },*/
        {
          name: "benefit",
          help: "helpBenefit",
          align: "right",
          label: this.withCurrency(this.$t("marginalTotalBenefitNpv")),
          field: "marginalTotalBenefitNpv",
          format: (val) => `${formatNumber(val, 3)}`,
          sortable: true,
        },
        {
          name: "cost",
          help: "helpCost",
          align: "right",
          label: this.withCurrency(this.$t("marginalTotalCostNpv")),
          field: "marginalTotalCostNpv",
          format: (val) => `${formatNumber(val, 3)}`,
          sortable: true,
        },
        {
          name: "netBenefit",
          help: "helpNetBenefit",
          align: "right",
          label: this.withCurrency(this.$t("marginalNetTotalBenefitNpv")),
          field: "marginalNetTotalBenefitNpv",
          format: (val) => `${formatNumber(val, 3)}`,
          sortable: true,
        },
        {
          name: "outstandingDirectCost",
          help: "helpRemainingCost",
          align: "right",
          label: this.withCurrency(this.$t("outstandingDirectCost")),
          // Recalculate saves outstandingDirectCosts; saving an action by
          // hand saves outstandingDirectCost.
          field: (row) => row.outstandingDirectCosts ?? row.outstandingDirectCost,
          format: (val) => `${formatNumber(val, 3)}`,
          sortable: true,
        },
        {
          name: "totalRoi",
          help: "helpRoi",
          required: true,
          align: "right",
          label: this.$t("totalRoi"),
          field: "totalRoi",
          format: (val) => `${formatNumber(val, 2)}`,
          sortable: true,
          sortBy: "desc",
        },
        {
          name: "effortCompletionRate",
          help: "helpWorkDone",
          align: "right",
          label: this.$t("effortCompletionPercentage"),
          field: "effortCompletionPercentage",
          format: (val) =>
            `${formatNumber(val, 3)}${typeof val == "number" ? "%" : ""}`,
          sortable: true,
        },
        {
          name: "relationships",
          help: "helpRelated",
          align: "left",
          label: this.$t("relationships"),
          field: "childrenIds",
          //format: val => `${formatNumber(val, 3)}`,
          format: (val, row) => getRelationshipsDisplay(row),
          sortable: false,
        },
        /*{
          name: "dueDate",
          align: "center",
          label: this.$t('dueDate'),
          field: "dueDate",
          sortable: true
        }*/
      ];
      return columns;
    },
  },

  created() {
    this.getUserDisplayNameOrTruncatedEmail = getUserDisplayNameOrTruncatedEmail;
  },

  mounted() {
    this.dispatchBindMatchingActions();
  },

  methods: {
    formatNumber,
    // Amounts are in the organization's currency.
    withCurrency(label) {
      const currency = this.currentOrg && this.currentOrg.currency;
      return currency ? `${label} (${currency})` : label;
    },
    openExplainRanking(row) {
      this.actionToExplain = row;
      this.showExplainRanking = true;
    },
    openBriefWithActions(actions) {
      this.selectedActionsForBrief = actions;
      this.showDecisionBrief = true;
    },
    onRowClick(evt, row) {
      if (this.selectedActionId == row.id) {
        if (!this.uiActionChanged) {
          this.$store.dispatch("ui/setSelectedActionId", row.id);
        } else return;
      }
      if (this.uiActionChanged) {
        this.$q
          .dialog({
            title: "Unsaved changes",
            message:
              "Any changes you made will be lost. Really switch to another action?",
            cancel: true,
            persistent: true,
          })
          .onOk(() => {
            this.$store.dispatch("ui/setSelectedActionId", row.id);
          });
      } else this.$store.dispatch("ui/setSelectedActionId", row.id);
    },
    // emulate fetching data from server
    addRow() {
      this.loading = true;
      setTimeout(() => {
        const index = Math.floor(Math.random() * (this.data.length + 1)),
          row = this.original[Math.floor(Math.random() * this.original.length)];
        if (this.data.length === 0) {
          this.rowCount = 0;
        }
        row.id = ++this.rowCount;
        const addRow = { ...row }; // extend({}, row, { name: `${row.name} (${row.__count})` })
        this.data = [
          ...this.data.slice(0, index),
          addRow,
          ...this.data.slice(index),
        ];
        this.loading = false;
      }, 500);
    },

    removeRow() {
      this.loading = true;
      setTimeout(() => {
        const index = Math.floor(Math.random() * this.data.length);
        this.data = [
          ...this.data.slice(0, index),
          ...this.data.slice(index + 1),
        ];
        this.loading = false;
      }, 500);
    },
    dispatchBindMatchingActions() {
      if (this.currentOrg)
        this.$store.dispatch("actions/bindMatchingActions", {
          orgId: this.currentOrg.id,
          actionStatesToSearch: this.actionStatesToSearch,
          responsiblePersonToSearch:
            this.responsiblePersonToSearch == "me"
              ? firebaseAuth.currentUser.uid
              : this.responsiblePersonToSearch,
          accountablePersonToSearch: this.accountablePersonToSearch,
        });
    },
  },

  watch: {
    currentOrg() {
      this.dispatchBindMatchingActions();
    },
    actionStatesToSearch() {
      this.dispatchBindMatchingActions();
    },
    responsiblePersonToSearch() {
      this.dispatchBindMatchingActions();
    },
    accountablePersonToSearch() {
      this.dispatchBindMatchingActions();
    },
  },
};
</script>

<style scoped>
div :deep(.q-table tbody td) {
  white-space: normal;
}
div :deep(.q-table--no-wrap th) {
  /* override table header wrapping */
  white-space: normal !important;
}
</style>
