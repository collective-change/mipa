<template>
  <q-card-section class="row">
    <div class="text-h6">
      <slot name="header"></slot>
    </div>
    <q-space />
    <q-btn v-close-popup flat round dense icon="close" />
  </q-card-section>
</template>

<script>
export default {};
</script>
