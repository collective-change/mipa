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
            { id: "influencer1", name: "influencer 1", group: 0 },
            { id: "influencer2", name: "influencer 2", group: 0 },
            { id: "influencer3", name: "influencer 3", group: 0 },
            { id: "thisNode", name: "this Node", group: 1 },
            { id: "influencee1", name: "influencee 1", group: 2 },
            { id: "influencee2", name: "influencee 2", group: 2 }
          ],
          links: [
            { source: "influencer1", target: "thisNode", value: 1 },
            { source: "influencer2", target: "thisNode", value: 8 },
            { source: "influencer3", target: "thisNode", value: 5 },
            { source: "thisNode", target: "influencee1", value: 10 },
            { source: "thisNode", target: "influencee2", value: 1 }
          ]
        }
      }
    };
  }
};
</script>