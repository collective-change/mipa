<template>
  <div>
    <q-list dense padding>
      <q-item-label header class="q-py-xs">
        <div class="row items-center">
          Parent
          <q-select
            v-if="!parentActionId"
            filled
            use-input
            hide-selected
            fill-input
            v-model="parentToAdd"
            placeholder="select action"
            @filter="filterFn"
            @filter-abort="abortFilterFn"
            :options="filteredActionOptions"
            emit-value
            map-options
            clearable
            dense
            class="q-ml-sm"
          />
          <div v-if="parentToAdd != null">
            <q-btn
              color="primary"
              class="q-ml-xs"
              @click="
                addParent(parentToAdd);
                parentToAdd = null;
              "
              >add</q-btn
            >
          </div>
        </div>
      </q-item-label>
      <q-chip
        square
        clickable
        removable
        v-if="parentActionId"
        @remove="promptToDelete(parentActionId, 'child-parent')"
        >{{ getActionTitle(parentActionId) }}</q-chip
      >
      <q-separator spaced />
      <q-item-label header class="q-py-xs">
        <div class="row items-center">
          Children
          <q-select
            filled
            use-input
            hide-selected
            fill-input
            v-model="childToAdd"
            placeholder="select action"
            @filter="filterFn"
            @filter-abort="abortFilterFn"
            :options="filteredActionOptions"
            emit-value
            map-options
            clearable
            dense
            class="q-ml-sm"
          />
          <div v-if="childToAdd != null">
            <q-btn
              color="primary"
              class="q-ml-xs"
              @click="
                addChild(childToAdd);
                childToAdd = null;
              "
              >add</q-btn
            >
          </div>
        </div>
      </q-item-label>
      <q-chip
        square
        clickable
        removable
        v-for="actionId in childrenActionIds"
        :key="actionId"
        @remove="promptToDelete(actionId, 'parent-child')"
        >{{ getActionTitle(actionId) }}</q-chip
      >
      <q-separator spaced />
      <q-item-label header class="q-py-xs">
        <div class="row items-center">
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
            class="q-ml-sm"
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
        </div>
      </q-item-label>
      <q-chip
        square
        clickable
        removable
        v-for="actionId in blockerActionIds"
        :key="actionId"
        @remove="promptToDelete(actionId, 'blockee-blocker')"
        >{{ getActionTitle(actionId) }}</q-chip
      >
      <q-separator spaced />
      <q-item-label header class="q-py-xs">
        <div class="row items-center">
          Blocks
          <q-select
            filled
            use-input
            hide-selected
            fill-input
            v-model="blockeeToAdd"
            placeholder="select action"
            @filter="filterFn"
            @filter-abort="abortFilterFn"
            :options="filteredActionOptions"
            emit-value
            map-options
            clearable
            dense
            class="q-ml-sm"
          />
          <div v-if="blockeeToAdd != null">
            <q-btn
              color="primary"
              class="q-ml-xs"
              @click="
                addBlockee(blockeeToAdd);
                blockeeToAdd = null;
              "
              >add</q-btn
            >
          </div>
        </div>
      </q-item-label>
      <q-chip
        square
        clickable
        removable
        v-for="actionId in blockeeActionIds"
        :key="actionId"
        @remove="promptToDelete(actionId, 'blocker-blockee')"
        >{{ getActionTitle(actionId) }}</q-chip
      >
      <q-separator spaced />
    </q-list>
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
      parentToAdd: null,
      childToAdd: null,
      blockerToAdd: null,
      blockeeToAdd: null,
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
      "uiAction.blockerActionIds",
      "uiAction.blockeeActionIds",
      "uiAction.parentActionId",
      "uiAction.childrenActionIds"
    ]),
    //...mapMultiRowFields(["uiAction.impacts"]),
    actionOptions() {
      return this.actions.map(action => {
        return { label: action.title, value: action.id };
      });
    }
  },

  methods: {
    ...mapActions("actions", [
      "addParent",
      "addChild",
      "addBlocker",
      "addBlockee",
      "deleteRelationship"
    ]),
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
    },

    getActionTitle(actionId) {
      let action = this.actions.find(a => a.id == actionId);
      return action.title;
    },

    promptToDelete(targetActionId, relationshipType) {
      let sourceActionId = this.uiAction.id;
      this.$q
        .dialog({
          title: "Confirm",
          message: "Really remove the relationship?",
          cancel: true,
          persistent: true
        })
        .onOk(() => {
          switch (relationshipType) {
            case "parent-child":
              this.deleteRelationship({
                type: "nesting",
                parent: sourceActionId,
                child: targetActionId
              });
              break;
            case "child-parent":
              this.deleteRelationship({
                type: "nesting",
                child: sourceActionId,
                parent: targetActionId
              });
              break;
            case "blockee-blocker":
              this.deleteRelationship({
                type: "blocking",
                blockee: sourceActionId,
                blocker: targetActionId
              });
              break;
            case "blocker-blockee":
              this.deleteRelationship({
                type: "blocking",
                blocker: sourceActionId,
                blockee: targetActionId
              });
              break;
            default:
              throw `Delete relationship type ${relationshipType} not found.`;
          }
        });
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
