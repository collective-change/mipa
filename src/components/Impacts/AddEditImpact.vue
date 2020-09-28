<template>
  <q-card style="max-width:1500px; width:1000px">
    <q-card-section>
      <modal-header v-slot:header>{{ addOrEdit }} impact</modal-header>
    </q-card-section>

    <q-form @submit.prevent="submitImpact">
      <q-card-section class="q-gutter-sm q-pt-none">
        <div class="q-gutter-sm row items-center">
          <q-select
            filled
            v-model="impact.impactType"
            :options="typeOptions"
            emit-value
            map-options
          />
          <q-select
            filled
            v-model="impact.hasDeadline"
            :options="deadlineOptions"
            emit-value
            map-options
          />
          <q-input
            v-show="impact.hasDeadline == true"
            v-model="impact.deadline"
            filled
            type="date"
          />
          <q-input
            prefix="then"
            v-model="impact.thenText"
            placeholder="what's impacted and how? (optional)"
            filled
            autogrow
            style="width: 30em;"
          />{{ impact.thenText }}
        </div>
        <div class="q-gutter-sm row items-center">
          <div>That is,</div>
          <q-select
            filled
            use-input
            hide-selected
            fill-input
            v-model="impact.nodeId"
            placeholder="impacted node"
            @filter="filterFn"
            @filter-abort="abortFilterFn"
            :options="filteredNodeOptions"
            emit-value
            map-options
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
            filled
            autogrow
            :suffix="unitDisplay"
            :style="'width: ' + operandFieldWidthEm + 'em; max-width: 30em'"
          />{{ impact.operand }}
          <q-select
            filled
            v-model="impact.durationType"
            :options="durationTypeOptions"
            emit-value
            map-options
          />
          <q-input
            v-show="
              ['for_period', 'with_half_life'].includes(impact.durationType)
            "
            v-model.number="impact.durationNumber"
            placeholder="how many"
            filled
            autogrow
            style="width: 8em"
          />
          <q-select
            v-show="
              ['for_period', 'with_half_life'].includes(impact.durationType)
            "
            filled
            v-model="impact.durationUnit"
            :options="durationUnitOptions"
            emit-value
            map-options
          />
        </div>
      </q-card-section>
      <q-card-section class="q-gutter-sm q-pt-none">
        <div v-if="validationError" class="text-negative">Missing input</div>
      </q-card-section>
      <modal-save-button />
    </q-form>
  </q-card>
</template>

<script>
import { mapState } from "vuex";

export default {
  props: ["addOrEdit", "impactToEdit", "nodes"],

  components: {
    "modal-header": require("components/Shared/ModalComponents/ModalHeader.vue")
      .default,
    "modal-save-button": require("components/Shared/ModalComponents/ModalSaveButton.vue")
      .default
  },

  data() {
    return {
      validationError: false,
      impact: {
        id: null,
        impactType: "if_done",
        hasDeadline: false,
        thenText: null,
        operation: "+",
        operand: null,
        durationType: "for_period",
        durationUnit: "months"
      },
      filteredNodeOptions: [],
      typeOptions: [
        {
          label: "If done",
          value: "if_done"
        },
        {
          label: "If not done",
          value: "if_not_done"
        }
      ],
      deadlineOptions: [
        {
          label: "at some time",
          value: false
        },
        {
          label: "by deadline",
          value: true
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
          label: "just once",
          value: "just_once"
        },
        {
          label: "for period of",
          value: "for_period"
        },
        {
          label: "with half life of",
          value: "with_half_life"
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

  created: function() {
    //compose option values first, so we don't need to wait
    //for filteredNodeOptions to compute, which results in q-select
    //displaying option value instead of option label.
    this.filteredNodeOptions = this.nodeOptions;

    if (this.addOrEdit == "edit") {
      Object.assign(this.impact, this.impactToEdit);
    }
  },

  mounted: function() {},

  computed: {
    nodeOptions() {
      return this.nodes.map(node => {
        return { label: node.name, value: node.id };
      });
    },
    operandFieldWidthEm() {
      let operandWidthEm = 4;
      if (typeof this.impact.operand != "undefined") {
        operandWidthEm = Math.min(
          20,
          Math.max(operandWidthEm, this.impact.operand.length * 0.6)
        );
      }
      return operandWidthEm + this.unitDisplay.length * 0.7;
    },
    unitDisplay() {
      if (this.impact.nodeId) {
        if (["+", "-", "="].includes(this.impact.operation))
          return this.getNodeUnit(this.impact.nodeId);
        else return "";
      } else {
        return "";
      }
    }
  },

  methods: {
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
    },

    getNodeUnit(nodeId) {
      const found = this.nodes.find(node => node.id == nodeId);
      return found.unit;
    },

    submitImpact() {
      //validate inputs
      if (
        /*!this.impact.thenText ||*/
        !this.impact.nodeId ||
        (this.impact.hasDeadline && !this.impact.deadline) ||
        typeof this.impact.operand == "undefined" ||
        this.impact.operand == "" ||
        (this.impact.durationType == "for_period" &&
          (typeof this.impact.durationNumber == "undefined" ||
            this.impact.durationNumber == ""))
      ) {
        this.validationError = true;
        console.log("validation error");
      } else {
        var newImpact = {};
        Object.assign(newImpact, this.impact);
        if (this.addOrEdit == "add") {
          newImpact.id = Date.now();
          this.$store.commit("uiAction/addImpact", newImpact);
        } else {
          this.$store.commit("uiAction/updateImpact", newImpact);
        }
        this.$emit("close");
      }
    }
  }
};
</script>
