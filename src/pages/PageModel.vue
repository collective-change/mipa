<template>
  <q-page padding>
    <h5>{{ $route.params.teamName }}'s Model</h5>

    <influence-diagram :chartData="chartData" :chartDataLoaded="chartDataLoaded"></influence-diagram>
  </q-page>
</template>

<script>
import { mapGetters, mapState } from "vuex";
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";

export default {
  name: "app",
  components: {
    "influence-diagram": require("components/Model/InfluenceDiagram.vue")
      .default
  },
  data() {
    return {
      chartDataLoaded: false
    };
  },
  computed: {
    ...mapState("model", ["nodes", "testNodes", "testLinks"]),
    ...mapGetters("model", ["links"]),
    chartData() {
      return { nodes: this.nodes, links: this.links };
    }
  },
  created() {
    (async () => {
      //console.log("waiting for currentUser to be defined");
      while (
        !firebaseAuth.currentUser // define the condition as you like
      )
        await new Promise(resolve => setTimeout(resolve, 200));
      this.$store.dispatch("model/bindNodes", this.$route.params.teamId);
    })();
    //console.log("above code doesn't block main function stack");
  },

  mounted() {
    //console.log(firebaseAuth.currentUser.uid);
    // this.$root.$on("showAddTeam", () => {
    //   this.showAddTeam = true;
    // });
  },

  beforeDestroy() {
    this.$store.dispatch("model/unbindNodes");
  }
};
</script>