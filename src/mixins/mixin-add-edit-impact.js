import { mapState } from "vuex";
import { createHelpers } from "vuex-map-fields";

const { mapFields } = createHelpers({
  getterType: "uiAction/getField",
  mutationType: "uiAction/updateUiActionField"
});

export default {};
