<template>
  <div class="row q-mb-sm">
    <q-input
      outlined
      clearable
      :value="dueDate"
      @input="$emit('update:dueDate', $event)"
      label="Due date"
    >
      <template v-slot:append>
        <q-icon name="event" class="cursor-pointer">
          <q-popup-proxy ref="qDateProxy" transition-show="scale" transition-hide="scale">
            <q-date
              :value="dueDate"
              @input="$refs.qDateProxy.hide(); $emit('update:dueDate', $event)"
            />
          </q-popup-proxy>
        </q-icon>
      </template>
    </q-input>
  </div>
</template>

<script>
export default {
  props: ["dueDate"],
};
</script>