<template>
  <q-page padding>
    <h5>{{ $route.params.teamName }}'s Model</h5>

    <dependency-graph :storeData="data"></dependency-graph>
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
    ...mapState("model", ["nodes", "testNodes", "testLinks"]),
    //...mapGetters("model", ["nodes", "links"]),
    data() {
      return { nodes: this.testNodes, links: this.testLinks };
      //return { nodes: this.nodes, links: this.links };
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

<style>
.faded {
  opacity: 0.1;
  transition: 0.3s opacity;
}
.highlight {
  opacity: 1;
}

path.link {
  fill: none;
  stroke: #666;
  stroke-width: 1.5px;
}
path.link.depends {
  stroke: #005900;
  stroke-dasharray: 5, 2;
}
path.link.needs {
  stroke: #7f3f00;
}

circle {
  fill: #ffff99;
  stroke: #191900;
  stroke-width: 1.5px;
}
circle.system {
  fill: #cce5ff;
  stroke: #003366;
}
circle.mount {
  fill: #ffe5e5;
  stroke: #660000;
}
circle.init {
  fill: #b2e8b2;
  stroke: #001900;
}

circle.selected {
  stroke: #ff6666ff !important;
  stroke-width: 3px;
  animation: selected 2s infinite alternate ease-in-out;
}

@keyframes selected {
  from {
    stroke-width: 5px;
    r: 26;
  }
  to {
    stroke-width: 1px;
    r: 30;
  }
}

text {
  font: 10px sans-serif;
  pointer-events: none;
  text-shadow: 0 1px 0 #fff, 1px 0 0 #fff, 0 -1px 0 #fff, -1px 0 0 #fff;
}

rect.caption {
  fill: #ccccccac;
  stroke: #666;
  stroke-width: 1px;
}
text.caption {
  font-size: 14px;
  font-weight: bold;
}
</style>