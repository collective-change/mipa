<template>
  <div>
    <div id="influence-diagram">
      <div
        class="node"
        v-for="(node, key) in chartData.nodes"
        :key="key"
        :v-bind="node.id"
        :style="chartCenterY"
      >
        <div class="node-contents">{{node.name}}</div>
      </div>
    </div>
    <q-btn @click="renderChart">refresh</q-btn>
  </div>
</template>

<script>
export default {
  name: "influence-diagram",
  props: ["chartData"],
  data: () => ({
    nodesPhysics: []
  }),
  mounted() {
    //set initial positions of nodes
    //this.nodesPhysics = [];
    this.setInitialPositoinsOfNodes();
    //this.renderChart();
  },
  methods: {
    updateNodePositionsOnDiagram() {
      let nodesPhysics = this.nodesPhysics;
      console.log(
        "updateNodePositionsOnDiagram(): nodesPhysics: ",
        nodesPhysics
      );
      let nodes = document.querySelectorAll(".node");
      let nodeId = "";
      nodes.forEach(function(node) {
        nodeId = node.getAttribute("v-bind");
        //console.log("nodeId: ", nodeId);
        //console.log("nodesPhysics[xx]: ", nodesPhysics[nodeId]);
        node.style.left = nodesPhysics[nodeId].xPos + "px";
        node.style.top = nodesPhysics[nodeId].yPos + "px";
      });
    },
    setInitialPositoinsOfNodes() {
      console.log("setInitialPositoinsOfNodes()");
      let diagram = document.querySelector("#influence-diagram");
      let node = document.querySelector(".node");
      let chartCenterX = diagram.offsetWidth / 2;
      let chartCenterY = diagram.offsetHeight / 2;
      let nodeTargetCenterX = chartCenterX - node.offsetWidth / 2;
      let nodeTargetCenterY = chartCenterY - node.offsetHeight / 2;

      let nodesData = this.chartData.nodes;
      //this.nodesPhysics = [];
      let nodesPhysics = this.nodesPhysics;
      //console.log("nodesPhysics, ", nodesPhysics);
      nodesData.forEach(function(nodeData) {
        nodesPhysics[nodeData.id] = {
          xPos: nodeTargetCenterX + Math.random() * 100 - 50,
          yPos: nodeTargetCenterY + Math.random() * 100 - 50
        };
      });
      this.updateNodePositionsOnDiagram();
    },
    calculateNextFrame() {
      let nodesData = this.chartData.nodes;
      let nodesPhysics = this.nodesPhysics;
      nodesData.forEach(function(nodeData) {
        nodesPhysics[nodeData.id].xPos = Math.random() * 100;
        nodesPhysics[nodeData.id].yPos = Math.random() * 100;
      });
    },
    renderChart() {
      console.log("renderChart()");
      var node = document.querySelector("*[v-bind='thisNode']");
      node.style.backgroundColor = "red";

      var self = this;

      var frameTimeMs = 1000 / 60; // 1000ms / 60
      let frameCount = 0;
      let stillMoving = true;

      let start = Date.now(); // remember start time

      let timer = setInterval(function() {
        // how much time passed from the start?
        let timePassed = Date.now() - start;
        if (timePassed >= 2000) {
          clearInterval(timer); // finish the animation after 2 seconds
          return;
        }
        // draw the animation at the moment timePassed
        self.calculateNextFrame();
        self.updateNodePositionsOnDiagram();
      }, frameTimeMs);
    },
    addNode() {},
    removeNode() {}
  },
  computed: {
    chartCenterX() {
      return this.width / 2;
    },
    chartCenterY() {
      return this.height / 2;
    }
  },
  watch: {
    chartData: "renderChart"
  }
};
</script>

<style lang="scss" scoped>
#influence-diagram {
  width: 100%;
  height: 400px;
  position: relative;
  background: Gainsboro;
  overflow: hidden;

  .node {
    width: 4rem;
    height: 2.5rem;
    background: PaleTurquoise;
    border-radius: 50%;
    border-style: solid;
    border-color: steelblue;
    overflow: hidden;
    display: table;
    position: absolute;

    .node-contents {
      display: table-cell;
      position: absolute;
      vertical-align: middle;
      height: 90%;
      text-align: center;
      //overflow-y: scroll;
      overflow-x: hidden;
      font-size: 0.8em;
      line-height: 1;
      display: inline-block; //for older versions of IE
    }
  }
}
.bar-chart {
  rect {
    fill: steelblue;
  }

  text {
    fill: white;
    font: 10px sans-serif;
    text-anchor: end;
  }
}
</style>