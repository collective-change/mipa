<template>
  <div>
    <q-table
      title="Actions"
      :data="actions"
      :columns="columns"
      row-key="id"
      :filter="filter"
      :loading="loading"
      :pagination.sync="pagination"
      :rows-per-page-options="[10, 20, 50, 0]"
      binary-state-sort
      @row-click="onRowClick"
    >
      <template v-slot:top>
        <div class="col-2 q-table__title">行動</div>
        <div class="row q-gutter-sm">
          <q-btn
            color="primary"
            :disable="loading"
            label="新增"
            @click="showAddAction = true"
          />
          <calculator-ui calculationType="actions" buttonLabel="Recalculate" />
        </div>

        <q-space />
        <q-input
          dense
          debounce="300"
          color="primary"
          v-model="filter"
          clearable
        >
          <template v-slot:append>
            <q-icon name="search" />
          </template>
        </q-input>
      </template>
    </q-table>
    <q-dialog v-model="showAddAction">
      <add-action @close="showAddAction = false" />
    </q-dialog>
  </div>
</template>

<script>
import { mapGetters, mapState } from "vuex";
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";
import { formatNumber } from "src/utils/util-formatNumber";

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
    "add-action": require("components/Actions/Modals/AddAction.vue").default,
    "calculator-ui": require("components/Calc/CalculatorUi.vue").default
  },
  data() {
    return {
      showAddAction: false,
      loading: false,
      filter: "",
      //rowCount: 10, //only used in sample code; delete when not needed anymore
      pagination: {
        sortBy: "actionLeverage",
        descending: true,
        page: 1,
        rowsPerPage: 10
        // rowsNumber: xx if getting data from a server
      },
      columns: [
        {
          name: "actionLeverage",
          required: true,
          align: "right",
          label: "效應比",
          field: "actionLeverage",
          format: val => `${formatNumber(val, 2)}`,
          sortable: true,
          sortBy: "desc"
        },
        {
          name: "state",
          align: "center",
          label: "狀態",
          field: "actionMchState",
          format: ams => `${ams.value}`,
          sortable: true,
          sort: (a, b) => ("" + a.value).localeCompare(b.value)
        },
        {
          name: "title",
          required: true,
          label: "標題",
          align: "left",
          //field: row => row.id.substring(0, 2) + " " + row.title,
          field: row => row.title,
          sortable: true
        },
        /*{
          name: "isProject",
          align: "center",
          label: "專案",
          field: "isProject",
          sortable: true
        },*/
        {
          name: "benefit",
          align: "right",
          label: "總邊際效益",
          field: "marginalTotalBenefitNpv",
          format: val => `${formatNumber(val, 3)}`,
          sortable: true
        },
        {
          name: "cost",
          align: "right",
          label: "總邊際成本",
          field: "marginalTotalCostNpv",
          format: val => `${formatNumber(val, 3)}`,
          sortable: true
        },
        {
          name: "netBenefit",
          align: "right",
          label: "總淨邊際效益",
          field: "marginalNetTotalBenefitNpv",
          format: val => `${formatNumber(val, 3)}`,
          sortable: true
        },
        {
          name: "outstandingDirectCost",
          align: "right",
          label: "需再投入直接成本",
          field: "outstandingDirectCost",
          format: val => `${formatNumber(val, 3)}`,
          sortable: true
        },
        {
          name: "totalRoi",
          required: true,
          align: "right",
          label: "Total ROI",
          field: "totalRoi",
          format: val => `${formatNumber(val, 2)}`,
          sortable: true,
          sortBy: "desc"
        },
        {
          name: "effortCompletionRate",
          align: "right",
          label: "完成度",
          field: "effortCompletionPercentage",
          format: val =>
            `${formatNumber(val, 3)}${typeof val == "number" ? "%" : ""}`,
          sortable: true
        },
        {
          name: "relationships",
          align: "left",
          label: "關係",
          field: "childrenIds",
          //format: val => `${formatNumber(val, 3)}`,
          format: (val, row) => getRelationshipsDisplay(row),
          sortable: false
        }
        /*{
          name: "dueDate",
          align: "center",
          label: "截止日期",
          field: "dueDate",
          sortable: true
        }*/
      ]
    };
  },

  computed: {
    //...mapGetters("settings", ["settings"]),
    ...mapState("actions", ["actions"]),
    ...mapState("uiAction", ["uiActionChanged"]),
    ...mapState("ui", ["selectedActionId"])
  },

  methods: {
    formatNumber,
    onRowClick(evt, row) {
      //console.log("clicked on", row.id);
      if (this.selectedActionId == row.id) {
        return;
      }
      if (this.uiActionChanged) {
        this.$q
          .dialog({
            title: "Unsaved changes",
            message:
              "Any changes you made will be lost. Really switch to another action?",
            cancel: true,
            persistent: true
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
          ...this.data.slice(index)
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
          ...this.data.slice(index + 1)
        ];
        this.loading = false;
      }, 500);
    }
  }
};
</script>

<style>
.q-table tbody td {
  white-space: normal;
}
</style>
