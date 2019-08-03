<template>
  <q-page padding>
    <h5>{{ $route.params.teamName }}'s Model</h5>
    <div id="app">
      <influence-diagram :chartData="influenceDiagram.data"></influence-diagram>
    </div>
  </q-page>
</template>

<script>
export default {
  name: "app",
  components: {
    "influence-diagram": require("components/Model/InfluenceDiagram.vue")
      .default
  },
  data() {
    return {
      influenceDiagram: {
        data: {
          nodes: {
            a: { name: "A" },
            b: { name: "B" },
            c: { name: "C" },
            d: { name: "D" },
            e: { name: "E" },
            f: { name: "F" },
            g: { name: "G" }
          },
          links: {
            l1: { source: "a", target: "b", value: 1 },
            l2: { source: "a", target: "c", value: 20 },
            l3: { source: "a", target: "f", value: 10 },
            l4: { source: "b", target: "d", value: 50 },
            l5: { source: "c", target: "f", value: 1 },
            l6: { source: "d", target: "g", value: 0.1 },
            l7: { source: "e", target: "f", value: 5 }
          }
        }
      }
    };
  }
};
</script>