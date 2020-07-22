<template>
  <div>
    <q-list dense padding>
      <q-item-label header>
        <div class="row">
          Blocked by
          <q-select
            filled
            use-input
            hide-selected
            fill-input
            v-model="blockerToAdd"
            placeholder="select action"
            @filter="filterFn"
            @filter-abort="abortFilterFn"
            :options="filteredActionOptions"
            emit-value
            map-options
            clearable
            dense
          />
          <div v-if="blockerToAdd != null">
            <q-btn
              color="primary"
              class="q-ml-xs"
              @click="
                addBlocker(blockerToAdd);
                blockerToAdd = null;
              "
              >add</q-btn
            >
          </div>
          {{ blockerActions }}
        </div>
      </q-item-label>
      <q-separator spaced />
      <q-item-label header>Blocks</q-item-label>
      <q-separator spaced />
      <q-item-label header>Parent</q-item-label>
      <q-separator spaced />
      <q-item-label header>Children</q-item-label>
    </q-list>
    <!--<q-dialog v-model="showAddBlocker">
      <add-related-action
        targetType="blocker"
        :actions="actions"
        @close="showAddBlocker = false"
      />
    </q-dialog> -->
  </div>
</template>

<script>
//import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";
import { mapActions, mapGetters, mapState } from "vuex";
import { createHelpers, mapMultiRowFields } from "vuex-map-fields";

const { mapFields } = createHelpers({
  getterType: "uiAction/getField",
  mutationType: "uiAction/updateUiActionField"
});

export default {
  //props: ["action"],

  components: {
    /*"add-related-action": require("components/Actions/Relationships/AddActionRelationship.vue")
      .default*/
  },

  data() {
    return {
      /*showAddBlocker: false,
      showAddBlockee: false,
      showAddParent: false,
      showAddChild: false,*/
      blockerToAdd: null,
      filteredActionOptions: []
    };
  },

  computed: {
    ...mapState("ui", ["selectedActionId"]),
    ...mapGetters("actions", ["actions"]),
    //fields calculated in the uiAction store, for display only
    //(do not modify their values in the component)
    ...mapState("uiAction", ["uiAction", "uiActionChanged"]),
    //fields for 2-way sync between component and store
    ...mapFields([
      "uiAction.blockerActions",
      "uiAction.blockeeActions",
      "uiAction.parentAction",
      "uiAction.childrenActions"
    ]),
    //...mapMultiRowFields(["uiAction.impacts"]),
    actionOptions() {
      return this.actions.map(action => {
        return { label: action.title, value: action.id };
      });
    }
  },

  methods: {
    ...mapActions("actions", ["addBlocker"]),
    filterFn(val, update, abort) {
      // call abort() at any time if you can't retrieve data somehow

      //setTimeout(() => {
      update(() => {
        if (val === "") {
          this.filteredActionOptions = this.actionOptions;
        } else {
          const needle = val.toLowerCase();
          this.filteredActionOptions = this.actionOptions.filter(
            v => v.label.toLowerCase().indexOf(needle) > -1
          );
        }
      });
      //}, 100);
    },

    abortFilterFn() {
      // console.log('delayed filter aborted')
    }
  },

  created: function() {
    //compose option values first, so we don't need to wait
    //for filteredActionOptions to compute, which results in q-select
    //displaying option value instead of option label.
    this.filteredActionOptions = this.actionOptions;

    /*if (this.addOrEdit == "edit") {
      Object.assign(this.impact, this.impactToEdit);
    }*/
  },

  watch: {}
};
</script>
