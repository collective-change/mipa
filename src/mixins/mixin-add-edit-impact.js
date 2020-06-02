import { mapState } from "vuex";
import { createHelpers } from "vuex-map-fields";

const { mapFields } = createHelpers({
  getterType: "uiAction/getField",
  mutationType: "uiAction/updateUiActionField"
});

export default {
  data() {
    return {
      validationError: false,
      impact: {
        impactType: "if_done",
        operation: "+",
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
    }
  },
  components: {
    "modal-header": require("components/Shared/ModalComponents/ModalHeader.vue")
      .default,
    "modal-save-button": require("components/Shared/ModalComponents/ModalSaveButton.vue")
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
  }
};
