<template>
  <div>
    <svg width="500" height="500" style="border: black; border-style: solid; border-width: 1px" />
  </div>
</template>

<script>
import { mapActions, mapGetters, mapState } from "vuex";
import * as d3 from "d3";
import * as sizeof from "object-sizeof";
import { responsify } from "src/functions/function-responsify-svg";
import { sleep } from "src/functions/function-sleep";
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";

// based on https://bl.ocks.org/agnjunio/fd86583e176ecd94d37f3d2de3a56814

export default {
  name: "dependency-graph",
  data() {
    return {
      svgWidth: 500,
      svgHeight: 500,
      selections: {},
      d3Data: { nodes: [], links: [] },
      storeDataChangeCount: 0,
      simulation: null,
      forceProperties: {
        center: {
          x: 0.5,
          y: 0.5
        },
        charge: {
          enabled: true,
          strength: -700,
          distanceMin: 1,
          distanceMax: 2000
        },
        collide: {
          enabled: true,
          strength: 0.7,
          iterations: 1,
          radius: 35
        },
        forceX: {
          enabled: true,
          strength: 0.05,
          x: 0.5
        },
        forceY: {
          enabled: true,
          strength: 0.35,
          y: 0.5
        },
        link: {
          enabled: true,
          distance: 100,
          iterations: 1
        }
      }
    };
  },

  computed: {
    ...mapGetters("model", ["nodes", "links"]),
    storeData() {
      return { nodes: this.nodes, links: this.links };
    }
  },

  created() {
    this.simulation = d3
      .forceSimulation()
      .force(
        "link",
        d3.forceLink().id(function(d) {
          return d.id;
        })
      )
      .force("charge", d3.forceManyBody())
      .force("collide", d3.forceCollide())
      .force("center", d3.forceCenter())
      .force("forceX", d3.forceX())
      .force("forceY", d3.forceY())
      .on("tick", this.tick);
    // Call first time to setup default values
    this.updateForces();
  },

  mounted() {
    this.selections.svg = d3.select(this.$el.querySelector("svg"));
    const svg = this.selections.svg;

    svg
      .attr("width", this.svgWidth)
      .attr("height", this.svgHeight)
      .call(responsify);

    // Define the arrow marker
    svg
      .append("svg:defs")
      .selectAll("marker")
      .data(["end"]) // Different link/path types can be defined here
      .enter()
      .append("svg:marker") // This section adds in the arrows
      .attr("id", String)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 43) // Prevents arrowhead from being covered by circle
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("svg:path")
      .attr("d", "M0,-5L10,0L0,5");

    // Add zoom and panning triggers
    this.zoom = d3
      .zoom()
      .scaleExtent([1 / 4, 2])
      .on("zoom", this.zoomed);
    svg.call(this.zoom);

    this.selections.graph = svg.append("g");
    const graph = this.selections.graph;

    this.updateData();
  },

  methods: {
    ...mapActions("model", ["setSelectedNodeId"]),

    tick() {
      // If no data is ready, do nothing
      if (!this.d3Data) {
        return;
      }
      const transform = d => {
        return "translate(" + d.x + "," + d.y + ")";
      };

      const link = d => {
        return (
          "M" +
          d.source.x +
          "," +
          d.source.y +
          " L" +
          d.target.x +
          "," +
          d.target.y
        );
      };

      const graph = this.selections.graph;
      graph.selectAll("path").attr("d", link);
      graph.selectAll("circle").attr("transform", transform);
      graph.selectAll("text").attr("transform", transform);
    },
    updateData() {
      //console.log("updateData; change count ", this.storeDataChangeCount);
      this.simulation.nodes(this.d3Data.nodes);
      this.simulation.force("link").links(this.d3Data.links);

      const simulation = this.simulation;
      const graph = this.selections.graph;

      // Links should only exit if not needed anymore
      graph
        .selectAll("path")
        .data(this.d3Data.links)
        .exit()
        .remove();

      graph
        .selectAll("path")
        .data(this.d3Data.links)
        .enter()
        .append("path")
        .attr("class", d => "link " + d.type);

      // Nodes should always be redrawn to avoid lines above them
      graph.selectAll("circle").remove();
      graph
        .selectAll("circle")
        .data(this.d3Data.nodes)
        .enter()
        .append("circle")
        .attr("r", 30)
        .attr("class", d => d.class)
        .call(
          d3
            .drag()
            .on("start", this.nodeDragStarted)
            .on("drag", this.nodeDragged)
            .on("end", this.nodeDragEnded)
        )
        .on("mouseover", this.nodeMouseOver)
        .on("mouseout", this.nodeMouseOut)
        .on("click", this.nodeClick)
        .on("contextmenu", this.nodeContextMenu);

      graph.selectAll("text").remove();
      graph
        .selectAll("text")
        .data(this.d3Data.nodes)
        .enter()
        .append("text")
        .attr("x", 0)
        .attr("y", ".31em")
        .attr("text-anchor", "middle")
        .text(d => d.name);

      // Add 'marker-end' attribute to each path
      const svg = d3.select(this.$el.querySelector("svg"));
      svg
        .selectAll("g")
        .selectAll("path")
        .attr("marker-end", "url(#end)");

      simulation.alpha(1).restart();
    },
    updateForces() {
      const { simulation, forceProperties, svgWidth, svgHeight } = this;
      simulation
        .force("center")
        .x(svgWidth * forceProperties.center.x)
        .y(svgHeight * forceProperties.center.y);
      simulation
        .force("charge")
        .strength(
          forceProperties.charge.strength * forceProperties.charge.enabled
        )
        .distanceMin(forceProperties.charge.distanceMin)
        .distanceMax(forceProperties.charge.distanceMax);
      simulation
        .force("collide")
        .strength(
          forceProperties.collide.strength * forceProperties.collide.enabled
        )
        .radius(forceProperties.collide.radius)
        .iterations(forceProperties.collide.iterations);
      simulation
        .force("forceX")
        .strength(
          forceProperties.forceX.strength * forceProperties.forceX.enabled
        )
        .x(svgWidth * forceProperties.forceX.x);
      simulation
        .force("forceY")
        .strength(
          forceProperties.forceY.strength * forceProperties.forceY.enabled
        )
        .y(svgHeight * forceProperties.forceY.y);
      simulation
        .force("link")
        .distance(forceProperties.link.distance)
        .iterations(forceProperties.link.iterations);

      // updates ignored until this is run
      // restarts the simulation (important if simulation has already slowed down)
      simulation.alpha(1).restart();
    },
    zoomed() {
      const transform = d3.event.transform;
      this.selections.graph.attr("transform", transform);
    },
    nodeDragStarted(d) {
      if (!d3.event.active) {
        this.simulation.alphaTarget(0.3).restart();
      }
      d.fx = d.x;
      d.fy = d.y;
    },
    nodeDragged(d) {
      d.fx = d3.event.x;
      d.fy = d3.event.y;
    },
    nodeDragEnded(d) {
      if (!d3.event.active) {
        this.simulation.alphaTarget(0.0001);
      }
      d.fx = null;
      d.fy = null;
    },
    nodeMouseOver(d) {
      const graph = this.selections.graph;
      const circle = graph.selectAll("circle");
      const path = graph.selectAll("path");
      const text = graph.selectAll("text");

      const related = [];
      const relatedLinks = [];
      related.push(d);
      this.simulation
        .force("link")
        .links()
        .forEach(link => {
          if (link.source === d || link.target === d) {
            relatedLinks.push(link);
            if (related.indexOf(link.source) === -1) {
              related.push(link.source);
            }
            if (related.indexOf(link.target) === -1) {
              related.push(link.target);
            }
          }
        });
      circle.classed("faded", true);
      circle.filter(df => related.indexOf(df) > -1).classed("highlight", true);
      path.classed("faded", true);
      path
        .filter(df => df.source === d || df.target === d)
        .classed("highlight", true);
      text.classed("faded", true);
      text.filter(df => related.indexOf(df) > -1).classed("highlight", true);
      // This ensures that tick is called so the node count is updated
      this.simulation.alphaTarget(0.0001).restart();
    },
    nodeMouseOut(d) {
      const graph = this.selections.graph;
      const circle = graph.selectAll("circle");
      const path = graph.selectAll("path");
      const text = graph.selectAll("text");

      circle.classed("faded", false);
      circle.classed("highlight", false);
      path.classed("faded", false);
      path.classed("highlight", false);
      text.classed("faded", false);
      text.classed("highlight", false);
      // This ensures that tick is called so the node count is updated
      this.simulation.restart();
    },
    nodeClick(d) {
      const circle = this.selections.graph.selectAll("circle");
      circle.classed("selected", false);
      circle.filter(td => td === d).classed("selected", true);
      let correspondingStoreNode = this.storeData.nodes.find(function(
        storeNode
      ) {
        return storeNode.id == d.id;
      });
      this.setSelectedNodeId(correspondingStoreNode.id);
    },
    nodeContextMenu(d) {
      d3.event.preventDefault();
      const circle = this.selections.graph.selectAll("circle");
      circle.classed("selected", false);
      circle.filter(td => td === d).classed("selected", true);
    }
  },

  watch: {
    storeDataChangeCount: {
      handler(/*newValue, oldValue*/) {
        //console.log("watch / storeDataChangeCount");
        this.updateData();
      },
      deep: true
    },
    forceProperties: {
      handler(newForce) {
        this.updateForces();
      },
      deep: true
    },
    // watcher for store nodes
    nodes: {
      immediate: true,
      deep: true,
      handler(/*newNodes, oldNodes*/) {
        var that = this;
        //mark each node in data.nodes as unconfirmed
        if (this.d3Data.nodes.length > 0) {
          this.d3Data.nodes.forEach(function(d3Node) {
            d3Node.unconfirmed = "true";
          });
        }
        let matchedD3Node = null;
        //for each in storeNodes,
        this.storeData.nodes.forEach(function(storeNode) {
          //if storeNode exists in data.nodes already
          if (
            //declaration inside if conditional intended
            (matchedD3Node = that.d3Data.nodes.filter(
              d3Node => d3Node.id == storeNode.id
            )[0])
          ) {
            //remove "unconfirmed" mark
            delete matchedD3Node.unconfirmed;
            //update data node with values from storeNode
            matchedD3Node.name = storeNode.name;
            matchedD3Node.group = storeNode.group;
            matchedD3Node.class = storeNode.class;
          } else {
            // storeNode does not exist in data; clone it there
            that.d3Data.nodes.push(Object.assign({}, storeNode));
          }
        });
        //remove unconfirmed nodes in data.nodes
        if (that.d3Data.nodes.length > 0) {
          that.d3Data.nodes = that.d3Data.nodes.filter(function(node) {
            return typeof node.unconfirmed === "undefined"; //node does not have 'unconfirmed' property
          });
        }
        // add depedency level to each node
        

        this.storeDataChangeCount++;
      }
    },
    // watcher for store links
    links: {
      immediate: true,
      deep: true,
      handler(/*newLinks, oldLinks*/) {
        var that = this;
        //mark each link in data.links as unconfirmed
        if (this.d3Data.links.length > 0) {
          this.d3Data.links.forEach(function(d3Link) {
            d3Link.unconfirmed = "true";
          });
        }
        let matchedD3Link = null;
        //for each in storeLinks,
        this.storeData.links.forEach(function(storeLink) {
          var filter = { source: storeLink.source, target: storeLink.target };
          //if storeLink exists in data.links already
          if (
            //declaration inside if conditional intended
            (matchedD3Link = that.d3Data.links.filter(function(item) {
              for (var key in filter) {
                if (item[key] === undefined || item[key] != filter[key])
                  return false;
              }
            })[0])
          ) {
            //remove "unconfirmed" mark
            delete matchedD3Link.unconfirmed;
            //update data link with values from storeLink
            matchedD3Link.source = storeLink.source;
            matchedD3Link.target = storeLink.target;
            matchedD3Link.type = storeLink.type;
          } //else storeLink does not exist in data; clone it there
          else {
            that.d3Data.links.push(Object.assign({}, storeLink));
          }
        });
        //remove unconfirmed links in data.links
        if (that.d3Data.links.length > 0) {
          that.d3Data.links = that.d3Data.links.filter(function(link) {
            return typeof link.unconfirmed === "undefined"; //link does not have 'unconfirmed' property
          });
        }
        this.storeDataChangeCount++;
      }
    }
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
  stroke: darkorange;
  stroke-width: 1.5px;
}
circle.state {
  fill: #cce5ff;
  stroke: #003366;
}
circle.output {
  /* fill: #ffe5e5;
  stroke: #660000; */
  fill: thistle;
  stroke: purple;
}
circle.input {
  fill: #b2e8b2;
  stroke: #001900;
}

circle.selected {
  /*stroke: #ff6666ff !important;*/
  stroke-width: 3px;
  animation: selected 1.2s infinite alternate ease-in-out;
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