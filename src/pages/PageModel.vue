<template>
  <q-page padding>
    <h5>{{ $route.params.teamName }}'s Model</h5>
    <div class="q-pa-md">
      <div class="row">
        <div class="col-12 col-md-9">
          <dependency-graph></dependency-graph>
        </div>
        <div class="col-12 col-md-3">
          <node-summary />
          <div class="absolute-bottom text-center q-mb-lg no-pointer-events">
            <q-btn
              @click="showAddNode = true"
              class="all-pointer-events"
              color="primary"
              label="Add node"
            />
          </div>
        </div>
      </div>
    </div>
    <q-dialog v-model="showAddNode">
      <add-node @close="showAddNode=false" />
    </q-dialog>
  </q-page>
</template>

<script>
import { mapGetters, mapState } from "vuex";
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";

export default {
  name: "app",
  components: {
    "dependency-graph": require("components/Model/DependencyGraph.vue").default,
    "node-summary": require("components/Model/NodeSummary.vue").default,
    "add-node": require("components/Model/Modals/AddNode.vue").default
  },
  data() {
    return {
      showAddNode: false
    };
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
    this.$root.$on("showAddNode", () => {
      this.showAddNode = true;
    });
  },
  beforeDestroy() {
    this.$store.dispatch("model/unbindNodes");
  }
};
</script>

