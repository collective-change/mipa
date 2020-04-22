<template>
  <div>
    <q-table
      title="Issues"
      :data="issues"
      :columns="columns"
      row-key="id"
      :filter="filter"
      :loading="loading"
      :pagination.sync="pagination"
      @row-click="onRowClick"
    >
      <template v-slot:top>
        <div class="col-2 q-table__title">項目</div>
        <!--
        <q-btn
          color="primary"
          :disable="loading"
          label="Add row"
          @click="addRow"
        />
        <q-btn
          class="q-ml-sm"
          color="primary"
          :disable="loading"
          label="Remove row"
          @click="removeRow"
        />
        -->
        <q-space />
        <q-input dense debounce="300" color="primary" v-model="filter">
          <template v-slot:append>
            <q-icon name="search" />
          </template>
        </q-input>
      </template>
    </q-table>
  </div>
</template>

<script>
import { mapGetters, mapState } from "vuex";
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";
export default {
  data() {
    return {
      loading: false,
      filter: "",
      //rowCount: 10, //only used in sample code; delete when not needed anymore
      pagination: {
        sortBy: "roi",
        descending: true,
        page: 1,
        rowsPerPage: 10,
        // rowsNumber: xx if getting data from a server
      },
      columns: [
        {
          name: "roi",
          required: true,
          align: "right",
          label: "SROI",
          field: "estRoi",
          format: (val) => `${val.toLocaleString()}`,
          sortable: true,
          sortBy: "desc",
        },
        {
          name: "name",
          required: true,
          label: "項目",
          align: "left",
          field: (row) => row.name,
          sortable: true,
        },
        {
          name: "type",
          align: "left",
          label: "種類",
          field: "type",
          sortable: true,
        },
        {
          name: "benefit",
          align: "right",
          label: "總效益 (XDR)",
          field: "estTotalBenefitXdr",
          format: (val) => `${val.toLocaleString()}`,
          sortable: true,
        },
        {
          name: "totalCost",
          align: "right",
          label: "總成本 (XDR)",
          field: "estTotalCostXdr",
          format: (val) => `${val.toLocaleString()}`,
          sortable: true,
        },
      ],
    };
  },

  computed: {
    //...mapGetters("settings", ["settings"]),
    ...mapState("issues", ["issues"]),
  },

  methods: {
    onRowClick(evt, row) {
      console.log("clicked on", row.id);
      this.$store.dispatch("ui/setSelectedIssueId", row.id);
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
  },
};
</script>
