<template>
  <div class="row q-mb-sm">
    <q-input
      outlined
      autofocus
      v-select-all
      clearable
      :value="title"
      @input="$emit('update:title', $event)"
      :rules="[val => !!val || 'Field is required']"
      ref="title"
      label="Action title"
      class="col"
    />
  </div>
</template>

<script>
import { selectAll } from "src/directives/directive-select-all";

export default {
  props: ["title"],
  directives: {
    selectAll
  }
};
</script>
