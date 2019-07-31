<template>
  <q-page padding>
    <h5>Model</h5>
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
          nodes: [
            { id: "a", name: "A" },
            { id: "b", name: "B" },
            { id: "c", name: "C" },
            { id: "d", name: "D" },
            { id: "e", name: "E" },
            { id: "f", name: "F" },
            { id: "g", name: "G" }
          ],
          links: [
            { source: "a", target: "b", value: 1 },
            { source: "a", target: "c", value: 20 },
            { source: "a", target: "f", value: 10 },
            { source: "b", target: "d", value: 50 },
            { source: "c", target: "f", value: 1 },
            { source: "d", target: "g", value: 0.1 },
            { source: "e", target: "f", value: 5 }
          ]
        }
      }
    };
  }
};
</script>