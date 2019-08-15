<template>
  <div>
    <svg width="400" height="400" id="viz" class="influence-diagram">
      <g :id="links" />
      <g :id="nodes" />
    </svg>
    <p>storeData</p>
    <pre>{{storeData}}</pre>
    <hr />
    <p>graph</p>
    <pre>{{graph}}</pre>
  </div>
</template>

<script>
//import BaseChart from "vue-d3-basechart";
import * as d3 from "d3";
import * as sizeof from "object-sizeof";
import { responsify } from "src/functions/function-responsify-svg";
import { sleep } from "src/functions/function-sleep";
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";

export default {
  name: "influence-diagram",
  props: ["storeData", "storeDataLoaded"],
  data() {
    return {
      graph: { nodes: [], links: [] },
      simulation: null,
      //color: d3.scaleOrdinal(d3.schemeCategory20),
      settings: {
        strokeColor: "#29B5FF",
        svgWidth: 960,
        svgHeight: 600
      }
    };
  },
  mounted: function() {
    var that = this;
    console.log("mounted");
    console.log("this.storeData: ", this.storeData);

    var svg = d3
      .select("#viz")
      .attr("width", this.settings.svgWidth)
      .attr("height", this.settings.svgHeight)
      .call(responsify);

    // d3.json(this.storeData, function(error, graph) {
    //   if (error) throw error;
    //   that.graph = graph;
    //   console.log("json");
    that.simulation = d3
      .forceSimulation(that.graph.nodes)
      .force(
        "link",
        d3
          .forceLink(that.graph.links)
          .distance(100)
          .strength(0.1)
      )
      .force("charge", d3.forceManyBody())
      .force(
        "center",
        d3.forceCenter(that.settings.svgWidth / 2, that.settings.svgHeight / 2)
      );
    //});
  },
  computed: {
    nodes: function() {
      console.log("computed/nodes()");
      var that = this;
      //if (that.graph) {
      if (that.graph) {
        console.log("that.graph: ", that.graph);
        let nodes = d3
          .select("svg")
          .append("g")
          .attr("class", "nodes")
          .selectAll("circle")
          .data(that.graph.nodes)
          .enter()
          .append("circle")
          .attr("r", 20)
          .attr("fill", function(d, i) {
            return "steelblue";
          })
          .call(
            d3
              .drag()
              .on("start", function dragstarted(d) {
                if (!d3.event.active)
                  that.simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
              })
              .on("drag", function dragged(d) {
                d.fx = d3.event.x;
                d.fy = d3.event.y;
              })
              .on("end", function dragended(d) {
                if (!d3.event.active) that.simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
              })
          );
        console.log("computed nodes: ", nodes);
        return nodes;
      }
    },
    links: function() {
      console.log("computed/links()");
      var that = this;
      //console.log("that.graph: ", that.graph);
      if (that.graph) {
        let links = d3
          .select("svg")
          .append("g")
          .attr("class", "links")
          .selectAll("line")
          .data(that.graph.links)
          .enter()
          .append("line")
          .attr("stroke-width", 5);
        // .attr("stroke-width", function(d) {
        //   return Math.sqrt(d.value);
        // });
        console.log("computed links: ", links);
        return links;
      }
    }
  },
  updated: function() {
    var that = this;
    that.simulation.nodes(that.graph.nodes).on("tick", function ticked() {
      that.links
        .attr("x1", function(d) {
          return that.graph.nodes.filter(node => {
            return node.id == d.source;
          })[0].x;
          //return that.graph.nodes[d.source].x;
          return d.source.x;
        })
        .attr("y1", function(d) {
          return that.graph.nodes.filter(node => {
            return node.id == d.source;
          })[0].y;
          //return that.graph.nodes[d.source].y;
          return d.source.y;
        })
        .attr("x2", function(d) {
          return that.graph.nodes.filter(node => {
            return node.id == d.target;
          })[0].x;
          //return that.graph.nodes[d.target].x;
          return d.target.x;
        })
        .attr("y2", function(d) {
          return that.graph.nodes.filter(node => {
            return node.id == d.target;
          })[0].y;
          //return that.graph.nodes[d.target].y;
          return d.target.y;
        });

      that.nodes
        .attr("cx", function(d) {
          return d.x;
        })
        .attr("cy", function(d) {
          return d.y;
        });
    });
  },
  watch: {
    storeData: function() {
      var that = this;
      console.log("watch storeData this: ", this);
      console.log("storeData watcher");
      //mark each node in graph.nodes as unconfirmed
      if (this.graph.nodes.length > 0) {
        this.graph.nodes.forEach(function(graphNode) {
          graphNode.unconfirmed = "true";
        });
      }
      let matchedGraphNode = null;
      //for each in storeNodes,
      this.storeData.nodes.forEach(function(storeNode) {
        //if storeNode exists in graph.nodes already
        if (
          //declaration inside if conditional intended
          (matchedGraphNode = that.graph.nodes.filter(
            graphNode => graphNode.id == storeNode.id
          )[0])
        ) {
          //remove "unconfirmed" mark
          delete matchedGraphNode.unconfirmed;
          //update graph node with values from storeNode
          matchedGraphNode = { ...matchedGraphNode, ...storeNode };
        } else {
          // storeNode does not exist in graph; clone it there
          that.graph.nodes.push(Object.create(storeNode)); //
          console.log("graph.nodes: ", that.graph.nodes);
        }
      });
      //remove unconfirmed nodes in graph.nodes
      if (that.graph.nodes.length > 0) {
        that.graph.nodes = that.graph.nodes.filter(function(node) {
          return typeof node.unconfirmed === "undefined"; //node does not have 'unconfirmed' property
        });
      }
      console.log("storeData watcher graph: ", that.graph);
    }
  }
};
</script>

<style lang="scss" >
.influence-diagram {
  border-color: gray;
  border-width: 1px;

  .links line {
    stroke: #999;
    stroke-opacity: 0.6;
  }

  .nodes circle {
    stroke: #fff;
    stroke-width: 1.5px;
  }
}
</style>