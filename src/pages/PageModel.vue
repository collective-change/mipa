<template>
  <q-page padding>
    <h5>{{ $route.params.teamName }}'s Model</h5>
    <influence-diagram :storeNodes="nodes" :storeLinks="links"></influence-diagram>
  </q-page>
</template>

<script>
import { mapGetters, mapState } from "vuex";

export default {
  name: "app",
  components: {
    //"bar-chart": require("components/Model/BarChart.vue").default,
    "influence-diagram": require("components/Model/InfluenceDiagram.vue")
      .default
  },
  data() {
    return {};
  },
  computed: {
    ...mapState("model", ["nodes", "links", "modelDownloaded", "focusedNode"])
  }
};
</script>