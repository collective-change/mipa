<template>
  <q-menu id="node_context_menu" ref="contextMenu" style="display: none" no-parent-event>
    <q-list style="min-width: 100px">
      <q-item clickable v-close-popup>
        <q-item-section>New influencer</q-item-section>
      </q-item>
      <q-item clickable v-close-popup>
        <q-item-section>New influencee</q-item-section>
      </q-item>
    </q-list>
  </q-menu>
</template>

<script>
import { mapActions, mapGetters, mapState } from "vuex";

export default {
  props: ["nodeContextMenuShowing"],
  computed: {
    ...mapState("model", ["selectedNodeId"]),
    ...mapGetters("model", ["nodes", "links"])

    // selectedNode() {
    //   let that = this;
    //   return this.nodes.find(function(node) {
    //     return node.id == that.selectedNodeId;
    //   });
    // }
  },

  methods: {},

  mounted() {
    this.$refs.contextMenu.show();
  },

  watch: {}
};
</script>
