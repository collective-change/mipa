<template>
  <q-page padding>
    <h5>{{ $route.params.teamName }}'s Model</h5>
    <influence-diagram :nodes="nodes" :links="links"></influence-diagram>
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
    return {
      barChart: {
        data: [4, 8, 15, 16, 23, 42],
        width: 420,
        barHeight: 20
      },
      influenceDiagram: {
        data: {
          nodes: {
            a: { id: "a", name: "A" },
            b: { id: "b", name: "B" },
            c: { id: "c", name: "C" },
            d: { id: "d", name: "D" },
            e: { id: "e", name: "E" },
            f: { id: "f", name: "F" },
            g: { id: "g", name: "G" }
          },
          links: {
            l1: { source: "a", target: "b", value: 1 },
            l2: { source: "a", target: "c", value: 20 },
            l3: { source: "a", target: "f", value: 10 },
            l4: { source: "b", target: "d", value: 50 },
            l5: { source: "c", target: "f", value: 1 },
            l6: { source: "d", target: "f", value: 1 },
            l7: { source: "d", target: "g", value: 0.1 },
            l8: { source: "e", target: "f", value: 5 }
          }
        }
      }
    };
  },
  computed: {
    ...mapState("model", ["nodes", "links", "modelDownloaded", "focusedNode"])
  }
};
</script>