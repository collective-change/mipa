<template>
  <div class="q-pa-md">
    <q-table title="Issues" :data="issues" :columns="columns" row-key="name" />
  </div>
</template>

<script>
import { mapGetters, mapState } from "vuex";
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";
export default {
  data() {
    return {
      columns: [
        {
          name: "name",
          required: true,
          label: "Issue",
          align: "left",
          field: row => row.name,
          format: val => `${val}`,
          sortable: true
        },
        {
          name: "type",
          align: "left",
          label: "Type",
          field: "type",
          sortable: true
        }
      ]
    };
  },
  computed: {
    //...mapGetters("settings", ["settings"]),
    ...mapState("issues", ["issues"])
  }
};
</script>