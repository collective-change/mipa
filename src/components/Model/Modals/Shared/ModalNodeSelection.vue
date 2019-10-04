<template>
  <div class="row q-mb-sm">
    <q-select
      filled
      label="Node"
      style="width: 250px"
      autofocus
      :value="targetNodeId"
      use-input
      input-debounce="0"
      :options="options"
      option-value="id"
      option-label="name"
      @filter="filterFn"
      :rules="[val => !!val || 'Field is required']"
      emit-value
      map-options
      @input="$emit('update:targetNodeId', $event)"
      ref="targetNode"
    >
      <template v-slot:no-option>
        <q-item>
          <q-item-section class="text-grey">No results</q-item-section>
        </q-item>
      </template>
    </q-select>
  </div>
</template>

<script>
import { mapState, mapGetters } from "vuex";

export default {
  props: ["targetNodeId"],
  data() {
    return {
      options: this.nodeOptions,
      selected: this.targetNodeId
    };
  },
  computed: {
    ...mapState("ui", ["selectedNodeId"]),
    ...mapGetters("model", ["nodes"]),
    nodeOptions() {
      console.log(this.selectedNodeId);
      return this.nodes.filter(node => node.id != this.selectedNodeId);
    }
  },
  methods: {
    filterFn(val, update) {
      if (val === "") {
        update(() => {
          this.options = this.nodeOptions;
        });
        return;
      }

      update(() => {
        const needle = val.toLowerCase();
        this.options = this.nodeOptions.filter(
          node => node.name.toLowerCase().indexOf(needle) > -1
        );
      });
    }
  }
};
</script>