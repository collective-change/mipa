<template>
  <div>
    <q-select
      dense
      :label="label"
      :options="actionStatesOptions"
      multiple
      emit-value
      map-options
      use-input
      :model-value="modelValue"
      @update:model-value="(value) => $emit('update:modelValue', value)"
    />
  </div>
</template>

<script>
import { mapActions, mapGetters, mapState } from "vuex";

export default {
  props: ["label", "modelValue"],
  emits: ["update:modelValue"],
  data() {
    return {
      //actionStatesOptions: ["test"],
      selectedStates: [],
      actionStates: [
        "initiating",
        "eligible",
        "to_approve",
        "rejected",
        "approved",
        "cancellation_requested",
        "canceled",
        "done",
      ],
    };
  },
  mounted: function () {
    //compose option values first, so we don't need to wait
    //for filteredUserOptions to compute, which results in q-select
    //displaying option value instead of option label.
    //this.filteredUserOptions = this.userOptions;
  },

  computed: {
    actionStatesOptions() {
      return this.actionStates.map((state) => {
        return { label: this.$t(state), value: state };
      });
    },
  },

  methods: {},
  watch: {},
};
</script>
