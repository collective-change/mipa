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
    <q-btn @click="renderChart">continue</q-btn>
    <q-btn @click="setInitialPositoinsOfNodes">reload</q-btn>
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
      //console.log(
      //   "updateNodePositionsOnDiagram(): nodesPhysics: ",
      //   nodesPhysics
      // );
      let nodes = document.querySelectorAll(".node");
      let nodeId = "";
      nodes.forEach(function(node) {
        nodeId = node.getAttribute("v-bind");
        //console.log("nodeId: ", nodeId);
        //console.log("nodesPhysics[xx]: ", nodesPhysics[nodeId]);
        node.style.left =
          nodesPhysics[nodeId].xPos - node.offsetWidth / 2 + "px";
        node.style.top =
          nodesPhysics[nodeId].yPos - node.offsetHeight / 2 + "px";
      });
    },
    setInitialPositoinsOfNodes() {
      //console.log("setInitialPositoinsOfNodes()");
      let diagram = document.querySelector("#influence-diagram");
      let node = document.querySelector(".node");
      let chartCenterX = diagram.offsetWidth / 2;
      let chartCenterY = diagram.offsetHeight / 2;
      let nodeTargetCenterX = chartCenterX;
      let nodeTargetCenterY = chartCenterY;

      let nodesData = this.chartData.nodes;
      //this.nodesPhysics = [];
      let nodesPhysics = this.nodesPhysics;
      //console.log("nodesPhysics, ", nodesPhysics);
      nodesData.forEach(function(nodeData) {
        nodesPhysics[nodeData.id] = {
          xPos: nodeTargetCenterX + Math.random() * 200 - 100,
          yPos: nodeTargetCenterY + Math.random() * 200 - 100,
          xVelo: 0,
          yVelo: 0
        };
      });
      this.updateNodePositionsOnDiagram();
    },
    calculateNextFrame(frameTimeMs) {
      //console.log('calculateNextFrame: ', frameTimeMs);
      let diagram = document.querySelector("#influence-diagram");
      let node = document.querySelector(".node");
      let nodeDiameter = node.offsetWidth;
      let dc = 10; //damping coefficient; damping deceleration = velocity * damping coefficient
      let xc = diagram.offsetWidth / 2; // x spring center
      let yc = diagram.offsetHeight / 2; // y spring center
      let kx = 30; //x spring constant
      let ky = 1; //y spring constant
      let ar = 15; //repulsive acceleration between nodes
      let dt = frameTimeMs / 1000; //delta time in seconds
      let ax = 0; //x acceleration
      let ay = 0; //y acceleration
      let distance = 0; //distance between centers of two nodes
      let nodesData = this.chartData.nodes;
      let nodesPhysics = this.nodesPhysics;
      let nodesPhysicsOld = Object.assign({}, this.nodesPhysics);

      nodesData.forEach(function(nodeData) {
        let xPos = nodesPhysicsOld[nodeData.id].xPos; //previous xPos
        let yPos = nodesPhysicsOld[nodeData.id].yPos; //previous xPos
        let xVelo = nodesPhysicsOld[nodeData.id].xVelo; //previous xVelo
        let yVelo = nodesPhysicsOld[nodeData.id].yVelo; //previous xVelo
        var dist = 0;
        var xDist = 0; //distance between centers of two nodes
        var yDist = 0;
        var arx = 0; //repulsive acceleration between nodes
        var ary = 0;

        // check for collision
        nodesData.forEach(function(nodeDataB) {
          xDist = xPos - nodesPhysicsOld[nodeDataB.id].xPos;
          yDist = yPos - nodesPhysicsOld[nodeDataB.id].yPos;
          // if two nodes are nearby then calculate possible repulsive force
          if (xDist < nodeDiameter && yDist < nodeDiameter) {
            //calculate exact distance
            dist = Math.sqrt(xDist * xDist + yDist * yDist);
            if (dist < nodeDiameter) {
              arx +=
                Math.abs(dist) < nodeDiameter
                  ? ar * (nodeDiameter - Math.abs(xDist)) * Math.sign(xDist)
                  : 0;
              ary +=
                Math.abs(dist) < nodeDiameter
                  ? ar * (nodeDiameter - Math.abs(yDist)) * Math.sign(yDist)
                  : 0;
              if (nodeData.id == "thisNode")
                console.log("arx ary: ", arx, ", ", ary);
            }
          }
        });
        // x calculations
        ax = (xc - xPos) * kx + arx - xVelo * dc;
        nodesPhysics[nodeData.id].xPos = xPos + xVelo * dt;
        nodesPhysics[nodeData.id].xVelo = xVelo + ax * dt;
        // y calculations
        ay = (yc - yPos) * ky + ary - yVelo * dc;
        nodesPhysics[nodeData.id].yPos = yPos + yVelo * dt;
        nodesPhysics[nodeData.id].yVelo = yVelo + ay * dt;

        console.log("ax ay: ", ax, ", ", ay);
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
        if (timePassed >= 3000) {
          clearInterval(timer); // finish the animation after 2 seconds
          return;
        }
        // draw the animation at the moment timePassed
        self.calculateNextFrame(frameTimeMs);
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
    width: 3rem;
    height: 3rem;
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