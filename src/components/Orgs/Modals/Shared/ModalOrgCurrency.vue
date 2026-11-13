<template>
  <div class="row q-mb-sm">
    <q-select
      :options="currencies"
      :model-value="currency"
      @update:model-value="$emit('update:currency', $event)"
      :rules="[val => !!val || 'Field is required']"
      ref="currency"
      label="Currency"
      class="col"
    />
  </div>
</template>

<script>
import { mapState } from "vuex";
//import { selectAll } from "@/directives/directive-select-all";

export default {
  props: ["currency"],
  computed: {
    ...mapState("adHocDocs", ["exchangeRates"]),
    currencies: function() {
      return Object.keys(this.exchangeRates.rates).sort();
    }
  }
  /*directives: {
    selectAll,
  },*/
};
</script>