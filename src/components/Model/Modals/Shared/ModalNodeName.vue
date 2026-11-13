<template>
  <div class="row q-mb-sm">
    <q-input
      autofocus
      v-select-all
      clearable
      :model-value="name"
      @update:model-value="$emit('update:name', $event)"
      :rules="[val => !!val || $t('Required')]"
      ref="name"
      :label="$t('Name of the factor')"
      class="col"
    />
  </div>
</template>

<script>
import { selectAll } from "@/directives/directive-select-all";

export default {
  props: ["name"],
  directives: {
    selectAll,
  },
};
</script>