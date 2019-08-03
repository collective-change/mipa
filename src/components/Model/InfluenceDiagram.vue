<template>
  <div>
    <div id="influence-diagram">
      <div
        class="node"
        v-for="(node, key) in chartData.nodes"
        :key="key"
        :v-bind="key"
        :style="chartCenterY"
      >
        <div class="node-contents">{{node.name}}</div>
      </div>
    </div>
    <q-btn @click="renderChart">continue</q-btn>
    <q-btn @click="setInitialPositionsOfNodes">reload</q-btn>
  </div>
</template>

<script>
export default {
  name: "influence-diagram",
  props: ["chartData"],
  data: () => ({}),
  mounted() {
    //set initial positions of nodes
    this.nodesPhysics = {};
    this.numBands = 1;
    this.xBandLocations = [];
    this.needToRecalculateBands = true;
    this.setInitialPositionsOfNodes();
    this.renderChart();
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
        node.style.left =
          nodesPhysics[nodeId].xPos - node.offsetWidth / 2 + "px";
        node.style.top =
          nodesPhysics[nodeId].yPos - node.offsetHeight / 2 + "px";
      });
    },
    setInitialPositionsOfNodes() {
      //console.log("setInitialPositionsOfNodes()");
      this.nodesPhysics = {};
      this.numBands = 1;
      this.xBandLocations = [];
      this.needToRecalculateBands = true;

      let diagram = document.querySelector("#influence-diagram");
      let node = document.querySelector(".node");
      let chartCenterX = diagram.offsetWidth / 2;
      let chartCenterY = diagram.offsetHeight / 2;
      let nodeTargetCenterX = chartCenterX;
      let nodeTargetCenterY = chartCenterY;

      let nodesData = this.chartData.nodes;
      let nodesPhysics = this.nodesPhysics;
      Object.keys(nodesData).forEach(function(nodeId) {
        //console.log("setInitialPositionOfNodes nodeId: ", nodeId);
        nodesPhysics[nodeId] = {
          band: 1, //to which vertical band the node should go to
          xPos:
            nodeTargetCenterX +
            (Math.random() * diagram.offsetWidth - chartCenterX) * 0.2,
          yPos:
            nodeTargetCenterY +
            (Math.random() * diagram.offsetHeight - chartCenterY) * 0.3,
          xVelo: 0,
          yVelo: 0
        };
      });
      console.log(
        "setInitialPositionOfNodes this.nodesPhysics: ",
        this.nodesPhysics
      );
      this.updateNodePositionsOnDiagram();
    },
    recalculateBands() {
      //check links to see if this node has an influencer, if yes, increase band number to one above
      // if no influencers, then set band to lowest influencee band - 1 but not less than 1
      let nodesData = this.chartData.nodes;
      let linksData = this.chartData.links;
      let nodesPhysics = this.nodesPhysics;
      let influencerBands = [];
      let influenceeBands = [];
      let draftBand = 1;
      Object.keys(nodesData).forEach(function(nodeId) {
        Object.keys(linksData).forEach(function(linkId) {
          //check if link has current node as target (i.e. has an influencer)
          if (linksData[linkId].target == nodeId) {
            influencerBands.push(nodesPhysics[linksData[linkId].source].band);
          }
          //check if link has current node as source (i.e. has an influencee)
          if (linksData[linkId].source == nodeId) {
            influenceeBands.push(nodesPhysics[linksData[linkId].target].band);
          }
        }, this);
        if (influencerBands.length > 0) {
          draftBand = Math.max(...influencerBands) + 1;
        } else {
          draftBand = Math.max(1, Math.min(...influenceeBands) - 1);
        }

        //if band has changed from previous iteration
        if (draftBand != nodesPhysics[nodeId].band) {
          //save band into physics model
          nodesPhysics[nodeId].band = draftBand;
        } else {
          this.needToRecalculateBands = false;
        }

        if (draftBand > this.numBands) this.numBands = draftBand;
      }, this);

      // calculat where the bands should be
      let diagram = document.querySelector("#influence-diagram");
      let diagramWidth = diagram.offsetWidth;
      let bandWidth = diagramWidth / this.numBands;
      let bandOffset = bandWidth / 2;
      let i;
      for (i = 0; i < this.numBands; i++) {
        this.xBandLocations.push(i * bandWidth + bandOffset);
      }
    },
    calculateNextFrame(frameTimeMs) {
      if (this.needToRecalculateBands == true) this.recalculateBands();

      //console.log('calculateNextFrame: ', frameTimeMs);
      let diagram = document.querySelector("#influence-diagram");
      let node = document.querySelector(".node");
      let nodeDiameter = node.offsetHeight;
      let dc = 10; //damping coefficient; damping deceleration = velocity * damping coefficient
      let xc = diagram.offsetWidth / 2; // x spring center
      let yc = diagram.offsetHeight / 2; // y spring center
      let kx = 200; //x spring constant
      let ky = 10; //y spring constant
      let ar = 35; //repulsive acceleration between nodes
      let dt = frameTimeMs / 1000; //delta time in seconds
      let ax = 0; //x acceleration
      let ay = 0; //y acceleration
      let distance = 0; //distance between centers of two nodes

      let nodesData = this.chartData.nodes;
      let linksData = this.chartData.links;
      let nodesPhysics = this.nodesPhysics;
      let nodesPhysicsOld = Object.assign({}, this.nodesPhysics);

      let candidateXVelo, candidateYVelo;

      Object.keys(nodesData).forEach(function(nodeId) {
        let band = nodesPhysicsOld[nodeId].band; //previous band
        let xPos = nodesPhysicsOld[nodeId].xPos; //previous xPos
        let yPos = nodesPhysicsOld[nodeId].yPos; //previous xPos
        let xVelo = nodesPhysicsOld[nodeId].xVelo; //previous xVelo
        let yVelo = nodesPhysicsOld[nodeId].yVelo; //previous xVelo
        let dist = 0;
        let xDist = 0; //distance between centers of two nodes
        let yDist = 0;
        let arx = 0; //repulsive acceleration between nodes
        let ary = 0;
        let xBandLocation = 0;

        // check for collision
        Object.keys(nodesData).forEach(function(nodeBId) {
          if (nodeBId != nodeId) {
            xDist = xPos - nodesPhysicsOld[nodeBId].xPos;
            yDist = yPos - nodesPhysicsOld[nodeBId].yPos;
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

                //vcx = nodesPhysicsOld[nodeDataB.id].xVelo;
                //vcy = nodesPhysicsOld[nodeDataB.id].yVelo;
              }
            }
          }
          //arx = Math.abs(arx) > repulsionDebounceThreshold ? arx : 0;
          //ary = Math.abs(ary) > repulsionDebounceThreshold ? ary : 0;
        });

        // x calculations
        // determine which band location to go to
        xBandLocation = this.xBandLocations[nodesPhysics[nodeId].band - 1];
        ax = (xBandLocation - xPos) * kx + arx - xVelo * dc;
        nodesPhysics[nodeId].xPos = xPos + xVelo * dt + ((ax * dt) / 2) * dt;
        //candidateXVelo = xVelo + ax * dt;
        nodesPhysics[nodeId].xVelo = xVelo + ax * dt;
        //Math.abs(candidateXVelo) > lowVelocityThreshold ? candidateXVelo : 0;
        //nodesPhysics[nodeData.id].xVelo = xVelo + ax * dt + vcx;

        // y calculations
        ay = (yc - yPos) * ky + ary - yVelo * dc;
        nodesPhysics[nodeId].yPos = yPos + yVelo * dt + ((ay * dt) / 2) * dt;
        //candidateYVelo = yVelo + ay * dt;
        nodesPhysics[nodeId].yVelo = yVelo + ay * dt;
        //Math.abs(candidateYVelo) > lowVelocityThreshold ? candidateYVelo : 0;
        //nodesPhysics[nodeData.id].yVelo = yVelo + ay * dt + vcy;

        //console.log("ax ay: ", ax, ", ", ay);
      }, this);
    },
    renderChart() {
      console.log("renderChart()");
      var node = document.querySelector("*[v-bind='d']");
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
    chartData: ["renderChart"]
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
      //position: absolute;
      position: relative;
      vertical-align: middle;
      height: 50%;
      text-align: center;
      //overflow-y: hidden;
      //overflow-x: hidden;
      font-size: 0.8em;
      line-height: 1;
      //display: inline-block; //for older versions of IE
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