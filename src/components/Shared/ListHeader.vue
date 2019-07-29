<template>
  <q-banner dense inline-actions :class="bg_color" class="list-header text-white text-center">
    <span class="text-bold text-subtitle1">
      <slot />
    </span>
  </q-banner>
</template>

<script>
export default {
  props: ["bg_color"]
};
</script>

<style>
.list-header {
  border-top-left-radius: 5px;
  border-top-right-radius: 5px;
}
</style>
