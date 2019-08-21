<template>
  <q-page padding>
    <h5>{{ $route.params.teamName }}'s Model</h5>

    <div class="q-pa-md">
      <div class="row">
        <div class="col-12 col-md-9">
          <dependency-graph :storeData="data"></dependency-graph>
        </div>
        <div class="col-12 col-md-3">col-12 col-md-3</div>
      </div>
    </div>
  </q-page>
</template>

<script>
import { mapGetters, mapState } from "vuex";
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";

export default {
  name: "app",
  components: {
    "dependency-graph": require("components/Model/DependencyGraph.vue").default
  },
  data() {
    return {
      storeDataLoaded: false
    };
  },
  computed: {
    //...mapState("model", ["nodes", "testNodes", "testLinks"]),
    ...mapGetters("model", ["nodes", "links"]),
    data() {
      //return { nodes: this.testNodes, links: this.testLinks };
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
    console.log("above code doesn't block main function stack");
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

