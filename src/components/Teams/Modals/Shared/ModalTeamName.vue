<template>
  <div class="row q-mb-sm">
    <q-input
      autofocus
      v-select-all
      clearable
      :value="name"
      @input="$emit('update:name', $event)"
      :rules="[val => !!val || 'Field is required']"
      ref="name"
      label="Name"
      class="col"
    />
  </div>
</template>

<script>
import { selectAll } from "src/directives/directive-select-all";

export default {
  props: ["name"],
  directives: {
    selectAll,
  },
};
</script>