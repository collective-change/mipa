<template>
  <div class="row q-mb-sm">
    <q-radio
      :value="type"
      @input="$emit('update:type', $event)"
      ref="type"
      val="action"
      label="Action"
    />
    <q-radio
      :value="type"
      @input="$emit('update:type', $event)"
      ref="type"
      val="situation"
      label="Situation"
    />
  </div>
</template>

<script>
export default {
  props: ["type"]
};
</script>