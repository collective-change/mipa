<template>
  <q-card>
    <q-card-section>
      <div class="text-h6">Add impact</div>
    </q-card-section>

    <q-form @submit.prevent="submitAction">
      <q-card-section class="q-gutter-sm q-pt-none">
        <div class="q-gutter-sm row items-start">
          <q-select
            filled
            v-model="impact.impactType"
            :options="typeOptions"
            emit-value
            map-options
          />
          <q-input
            prefix="then"
            v-model="impact.thenText"
            placeholder="what's impacted and how?"
            filled
            autogrow
            style="width: 400px"
          />
        </div>
        <div class="q-gutter-sm row items-start">
          <div>That is,</div>
          <q-select
            filled
            use-input
            hide-selected
            fill-input
            v-model="impact.nodeId"
            @filter="filterFn"
            @filter-abort="abortFilterFn"
            :options="filteredNodeOptions"
            emit-value
            map-options
            style="width: 150px"
          />
          <q-select
            filled
            v-model="impact.operation"
            :options="operationOptions"
            emit-value
            map-options
          />
          <q-input
            v-model="impact.operand"
            placeholder="number or expression"
            filled
            autogrow
            style="width: 180px"
          />
          <q-select
            filled
            v-model="impact.durationType"
            :options="durationTypeOptions"
            emit-value
            map-options
          />
          <q-input
            v-model="impact.durationExpression"
            placeholder="number or expression"
            filled
            autogrow
            style="width: 80px"
          />
          <q-select
            filled
            v-model="impact.durationUnit"
            :options="durationUnitOptions"
            emit-value
            map-options
          />
        </div>
      </q-card-section>
      <modal-buttons />
    </q-form>
  </q-card>
</template>

<script>
import { mapActions, mapState } from "vuex";
import { createHelpers } from "vuex-map-fields";

const { mapFields } = createHelpers({
  getterType: "uiAction/getField",
  mutationType: "uiAction/updateUiActionField"
});

export default {
  data() {
    return {
      impact: {
        impactType: "if_done",
        durationType: "for",
        durationUnit: "days"
      },
      filteredNodeOptions: [],
      typeOptions: [
        {
          label: "If we act on the opportunity",
          value: "if_done"
        },
        {
          label: "If we don't act on the threat",
          value: "if_not_done"
        }
      ],
      operationOptions: [
        {
          label: "+", // unicode U+0002B
          value: "+"
        },
        {
          label: "−", // unicode U+02212
          value: "-"
        },
        {
          label: "×", // unicode U+000D7
          value: "*"
        },
        {
          label: "÷", // unicode U+000F7
          value: "/"
        },
        {
          label: "=", // unicode U+0003D
          value: "="
        }
      ],
      durationTypeOptions: [
        {
          label: "for",
          value: "for"
        },
        {
          label: "just once",
          value: "just_once"
        },
        {
          label: "forever",
          value: "forever"
        }
      ],
      durationUnitOptions: [
        {
          label: "days",
          value: "days"
        },
        {
          label: "weeks",
          value: "weeks"
        },
        {
          label: "months",
          value: "months"
        },
        {
          label: "years",
          value: "years"
        }
      ]
    };
  },
  methods: {
    ...mapActions("actions", ["addAction"]),

    submitAction() {
      var newImpact = {};
      Object.assign(newImpact, this.impact);
      newImpact.id = Date.now();
      this.$store.commit("uiAction/addImpact", newImpact);
      this.$emit("close");
      console.log("close");
    },

    /*submitForm() {
      this.$refs.modalActionTitle.$refs.title.validate();
      if (!this.$refs.modalActionTitle.$refs.title.hasError) {
        this.submitAction();
      }
    }*/
    filterFn(val, update, abort) {
      // call abort() at any time if you can't retrieve data somehow

      //setTimeout(() => {
      update(() => {
        if (val === "") {
          this.filteredNodeOptions = this.nodeOptions;
        } else {
          const needle = val.toLowerCase();
          this.filteredNodeOptions = this.nodeOptions.filter(
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
  components: {
    "modal-header": require("components/Shared/ModalComponents/ModalHeader.vue")
      .default,
    "modal-action-title": require("components/Actions/Modals/Shared/ModalActionTitle.vue")
      .default,
    "modal-buttons": require("components/Shared/ModalComponents/ModalButtons.vue")
      .default
  },
  computed: {
    //fields calculated in the uiAction store, for display only
    //(do not modify their values in the component)
    ...mapState("uiAction", ["uiAction"]),
    ...mapState("model", ["nodes"]),
    //fields for 2-way sync between component and store
    ...mapFields(["uiAction.impacts"]),
    nodeOptions() {
      return this.nodes.map(node => {
        return { label: node.name, value: node.id };
      });
    }
  }
};
</script>
