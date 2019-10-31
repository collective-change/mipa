<template>
  <div>
    <q-btn
      @click="showAddNode = true; addNodeProps.newNodeRole=''"
      class="all-pointer-events"
      style="position: relative; top: 40px; left: 4px;"
      color="primary"
      label="Add node"
    />
    <svg
      :width="svgWidth"
      :height="svgHeight"
      style="border: black; border-style: solid; border-width: 0px"
    />
    <p>Right-click on node or link to show menu. Ctrl+mouse to pan and zoom.</p>
    <q-dialog v-model="showAddNode">
      <add-node
        :sourceNodeId="addNodeProps.sourceNodeId"
        :newNodeRole="addNodeProps.newNodeRole"
        @close="showAddNode=false"
      />
    </q-dialog>
    <q-dialog v-model="showDeleteNode">
      <delete-node :node="selectedNode" @close="showDeleteNode=false" />
    </q-dialog>
    <q-dialog v-model="showAddLink">
      <add-link
        :sourceNodeId="selectedNodeId"
        :linkToSubmit="linkToSubmit"
        @close="showAddLink=false"
      />
    </q-dialog>
  </div>
</template>

<script>
import { mapActions, mapGetters, mapState } from "vuex";
import * as d3 from "d3";
import "d3-selection-multi";
import * as sizeof from "object-sizeof";
import { responsify } from "src/functions/function-responsify-svg";
import { sleep } from "src/functions/function-sleep";
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";
import { getNodeLinkEndPoints } from "src/functions/function-getNodeLinkEndPoints";

// based on https://bl.ocks.org/agnjunio/fd86583e176ecd94d37f3d2de3a56814

var nodeRadius = 30;
const svgWidth = 800;
const svgHeight = 800;

export default {
  name: "dependency-graph",
  components: {
    "add-node": require("components/Model/Modals/AddNode.vue").default,
    "delete-node": require("components/Model/Modals/DeleteNode.vue").default,
    "add-link": require("components/Model/Modals/AddLink.vue").default
  },
  data() {
    return {
      showAddNode: false,
      showDeleteNode: false,
      showAddLink: false,
      linkTargetType: "",
      svgWidth: svgWidth,
      svgHeight: svgWidth,
      selections: {},
      d3Data: {
        nodes: [],
        links: []
      },
      storeDataChangeCount: 0,
      simulation: null,
      forceProperties: {
        gravity: {
          strength: 80,
          distanceMin: 1,
          distanceMax: 1000
        },
        charge: {
          strength: -200,
          distanceMin: 1,
          distanceMax: 400
        },
        collide: {
          strength: 0.7,
          iterations: 1,
          radius: nodeRadius
        },
        forceX: {
          strength: 0.03,
          x: svgWidth / 2
        },
        forceY: {
          strength: 0.03,
          y: svgHeight / 2
        },
        link: {
          distance: 90,
          iterations: 1
        }
      },
      addNodeProps: {
        sourceNodeId: "",
        newNodeRole: ""
      },
      linkToSubmit: {
        sourceNodeId: "",
        targetNodeId: "",
        targetType: ""
      }
    };
  },

  computed: {
    ...mapState("ui", ["selectedNodeId"]),
    ...mapGetters("model", ["nodes", "links"]),
    selectedNode() {
      let that = this;
      return this.nodes.find(function(node) {
        return node.id == that.selectedNodeId;
      });
    },
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
      .force("gravity", d3.forceManyBody())
      .force("charge", d3.forceManyBody())
      .force("collide", d3.forceCollide())
      .force("center", d3.forceCenter(this.svgWidth / 2, this.svgHeight / 2))
      .force("forceX", d3.forceX())
      .force("forceY", d3.forceY())
      .velocityDecay(0.2)
      .on("tick", this.tick);
    // Call first time to setup default values
    this.updateForces();
  },

  mounted() {
    //set up svg
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
      .attr("refX", 5) //Prevents arrowhead from being covered by circle
      .attr("refY", 0)
      .attr("markerUnits", "userSpaceOnUse")
      .attr("markerWidth", 15)
      .attr("markerHeight", 15)
      .attr("fill", "#888")
      .attr("orient", "auto")
      .append("svg:path")
      .attr("d", "M0,-5L10,0L0,5");

    // Add zoom and panning triggers
    this.zoom = d3
      .zoom()
      .scaleExtent([1 / 4, 2])
      .on("zoom", this.zoomed);
    svg.call(this.zoom);

    //require ctrlKey in addition to mouse
    this.zoom.filter(function() {
      return d3.event.ctrlKey;
    });

    this.selections.graph = svg.append("g");
    const graph = this.selections.graph;

    this.updateData();
  },

  methods: {
    ...mapActions("model", ["addLink", "deleteLink"]),
    ...mapActions("ui", ["setSelectedNodeId"]),

    tick() {
      // If no data is ready, do nothing
      if (!this.d3Data) {
        return;
      }

      this.simulation
        .force("collide")
        .radius(nodeRadius * (1 - this.simulation.alpha()));

      const transform = d => {
        return "translate(" + d.x + "," + d.y + ")";
      };

      const link = d => {
        const linkEndPoints = getNodeLinkEndPoints(d, nodeRadius, 3);
        return (
          "M" +
          linkEndPoints.sx +
          "," +
          linkEndPoints.sy +
          " L" +
          linkEndPoints.tx +
          "," +
          linkEndPoints.ty
        );
      };

      const graph = this.selections.graph;
      graph.selectAll("path").attr("d", link);
      graph.selectAll("circle").attr("transform", transform);
      graph.selectAll("text").attr("transform", transform);
      console.log("alpha: ", this.simulation.alpha());
    },
    updateData() {
      var that = this;
      console.log(
        "updateData; change count ",
        this.storeDataChangeCount,
        "****************"
      );
      // stop the previous simulation if it is still running
      this.simulation.stop();
      this.simulation.nodes(this.d3Data.nodes);
      this.simulation.force("link").links(this.d3Data.links);

      const simulation = this.simulation;
      const graph = this.selections.graph;
      const svg = this.selections.svg;

      var nodeContextMenu = this.contextMenu().items(
        {
          label: "Add new influencer",
          handler: function() {
            that.showAddNode = true;
            that.addNodeProps.sourceNodeId = that.selectedNodeId;
            that.addNodeProps.newNodeRole = "influencer";
          }
        },
        {
          label: "Add new influencee",
          handler: function() {
            that.showAddNode = true;
            that.addNodeProps.sourceNodeId = that.selectedNodeId;
            that.addNodeProps.newNodeRole = "influencee";
          }
        },
        {
          label: "Link to influencer",
          handler: function() {
            that.showAddLink = true;
            that.linkToSubmit.sourceNodeId = that.selectedNodeId;
            that.linkToSubmit.targetNodeId = "";
            that.linkToSubmit.targetType = "influencer";
          }
        },
        {
          label: "Link to influencee",
          handler: function() {
            that.showAddLink = true;
            that.linkToSubmit.sourceNodeId = that.selectedNodeId;
            that.linkToSubmit.targetNodeId = "";
            that.linkToSubmit.targetType = "influencee";
          }
        },
        {
          label: "Delete node",
          handler: function() {
            that.showDeleteNode = true;
          }
        }
      );

      var linkContextMenu = this.contextMenu().items({
        label: "Delete link",
        handler: function() {
          //"this" is the parameter of handler.call(parameter); a link in this case
          that.deleteLink({
            link: {
              influencerNodeId: this.source.id,
              influenceeNodeId: this.target.id
            },
            teamId: that.$route.params.teamId
          });
        }
      });

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
        .attr("class", d => "link " + d.type)
        .on("contextmenu", function(d) {
          d3.event.preventDefault();
          linkContextMenu(d3.mouse(svg.node())[0], d3.mouse(svg.node())[1], d);
        });

      // Nodes should always be redrawn to avoid lines above them
      graph.selectAll("circle").remove();
      graph
        .selectAll("circle")
        .data(this.d3Data.nodes)
        .enter()
        .append("circle")
        .attr("r", nodeRadius)
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
        .on("contextmenu", function(d) {
          d3.event.preventDefault();
          that.nodeClick(d);
          nodeContextMenu(d3.mouse(svg.node())[0], d3.mouse(svg.node())[1], d);
        })
        .on("click", this.nodeClick);

      graph.selectAll("text").remove();
      graph
        .selectAll("text")
        .data(this.d3Data.nodes)
        .enter()
        .append("text")
        .attr("x", 0)
        .attr("y", ".31em")
        .attr("text-anchor", "middle")
        .text(d => d.name)
        .call(this.wrap, nodeRadius * 2); // wrap the text in <= node diameter

      // Add 'marker-end' attribute to each path
      svg
        .selectAll("g")
        .selectAll("path")
        .attr("marker-end", "url(#end)");

      simulation.alpha(1).restart();
    },
    updateForces() {
      const { simulation, forceProperties, svgWidth, svgHeight, d3Data } = this;
      simulation
        .force("gravity")
        .strength(forceProperties.gravity.strength)
        .distanceMin(forceProperties.gravity.distanceMin)
        .distanceMax(forceProperties.gravity.distanceMax);
      simulation
        .force("charge")
        .strength(forceProperties.charge.strength)
        .distanceMin(forceProperties.charge.distanceMin)
        .distanceMax(forceProperties.charge.distanceMax);
      simulation
        .force("collide")
        .strength(forceProperties.collide.strength)
        //.radius(forceProperties.collide.radius)
        .iterations(forceProperties.collide.iterations);
      simulation
        .force("forceX")
        .x(forceProperties.forceX.x)
        .strength(function(d) {
          if (d.class == "unlinked") {
            return forceProperties.forceX.strength;
          } else {
            return 0;
          }
        });
      simulation
        .force("forceY")
        .y(forceProperties.forceY.y)
        .strength(d => {
          if (d.class == "unlinked") {
            return forceProperties.forceX.strength;
            //return 0;
          } else {
            return 0;
          }
        });
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

    contextMenu(hostD) {
      var height,
        that = this,
        width,
        margin = 0.1, // fraction of width
        items = [],
        rescale = false,
        style = {
          rect: {
            mouseout: {
              fill: "rgb(244,244,244)",
              stroke: "white",
              "stroke-width": "1px"
            },
            mouseover: {
              fill: "rgb(200,200,200)"
            }
          },
          text: {
            fill: "steelblue",
            "font-size": "15"
          }
        };

      function menu(x, y, hostD) {
        d3.select(".context-menu").remove();
        scaleItems();

        // Draw the menu
        d3.select("svg")
          .append("g")
          .attr("class", "context-menu")
          .selectAll("tmp")
          .data(items)
          .enter()
          .append("g")
          .attr("class", "menu-entry")
          .style("cursor", "pointer")
          .on("mouseover", function() {
            d3.select(this)
              .select("rect")
              .styles(style.rect.mouseover);
          })
          .on("mouseout", function() {
            d3.select(this)
              .select("rect")
              .styles(style.rect.mouseout);
          });

        d3.selectAll(".menu-entry")
          .append("rect")
          .attr("x", x)
          .attr("y", function(d, i) {
            return y + i * height;
          })
          .attr("width", width)
          .attr("height", height)
          .styles(style.rect.mouseout)
          .on("click", function(d) {
            d.handler.call(hostD);
          });

        d3.selectAll(".menu-entry")
          .append("text")
          .text(function(d) {
            return d.label;
          })
          .attr("x", x)
          .attr("y", function(d, i) {
            return y + i * height;
          })
          .attr("dy", height - margin / 2)
          .attr("dx", margin)
          .styles(style.text);

        // Other interactions
        d3.select("body").on("click", function() {
          d3.select(".context-menu").remove();
        });
      }

      menu.items = function(e) {
        if (!arguments.length) return items;
        for (var i in arguments) items.push(arguments[i]);
        rescale = true;
        return menu;
      };

      // Automatically set width, height, and margin;
      function scaleItems() {
        if (rescale) {
          d3.select("svg")
            .selectAll("tmp")
            .data(items)
            .enter()
            .append("text")
            .text(function(d) {
              return d.label;
            })
            .styles(style.text)
            .attr("x", -1000)
            .attr("y", -1000)
            .attr("class", "tmp");
          var z = d3
            .selectAll(".tmp")
            .nodes()
            .map(function(x) {
              return x.getBBox();
            });
          width = d3.max(
            z.map(function(x) {
              return x.width;
            })
          );
          margin = margin * width;
          width = width + 2 * margin;
          height = d3.max(
            z.map(function(x) {
              return x.height + margin / 2;
            })
          );

          // cleanup
          d3.selectAll(".tmp").remove();
          rescale = false;
        }
      }

      return menu;
    },
    wrap(text, width) {
      text.each(function() {
        var text = d3.select(this),
          words = text
            .text()
            .split(/\s+/)
            .reverse(),
          word,
          line = [],
          lineWordCount = 0,
          lines = [],
          lineNumber = 0,
          lineHeight = 1.1, // ems
          x = text.attr("x"),
          y = text.attr("y"),
          dy = 0, //parseFloat(text.attr("dy")),
          tspan = text
            .text(null)
            .append("tspan")
            .attr("x", x)
            .attr("y", y)
            .attr("dy", dy + "em");
        while ((word = words.pop())) {
          line.push(word);
          lineWordCount++;
          tspan.text(line.join(" "));
          if (
            tspan.node().getComputedTextLength() > width &&
            lineWordCount > 1
          ) {
            line.pop();
            lines.push(line.join(" "));
            line = [word];
            lineWordCount = 1;
          }
        }
        lines.push(line.join(" "));
        tspan.text(null);
        lines = lines.reverse();
        dy = -0.5 - lines.length / 2 - 0.1;
        while ((line = lines.pop())) {
          tspan = text
            .append("tspan")
            .attr("x", x)
            .attr("y", y)
            .attr("dy", ++lineNumber * lineHeight + dy + "em")
            .text(line);
        }
      });
    },
    submitLink() {
      this.addLink({
        link: this.linkToSubmit,
        teamId: this.$route.params.teamId
      });
      this.$emit("close");
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
        console.log("nodes handler running");
        var that = this;
        var dataChanged = false;
        //mark each node in d3Data.nodes as unconfirmed
        if (this.d3Data.nodes.length > 0) {
          this.d3Data.nodes.forEach(function(d3Node) {
            d3Node.unconfirmed = "true";
          });
        }
        let matchedD3Node = null;
        //for each in storeNodes,
        this.storeData.nodes.forEach(function(storeNode) {
          //if storeNode exists in d3Data.nodes already
          if (
            //declaration inside if conditional intended
            (matchedD3Node = that.d3Data.nodes.filter(
              d3Node => d3Node.id == storeNode.id
            )[0])
          ) {
            //remove "unconfirmed" flag
            delete matchedD3Node.unconfirmed;
            //update d3Data node with values from storeNode
            if (matchedD3Node.name != storeNode.name) {
              matchedD3Node.name = storeNode.name;
              dataChanged = true;
            }
            if (matchedD3Node.group != storeNode.group) {
              matchedD3Node.group = storeNode.group;
              dataChanged = true;
            }
            if (matchedD3Node.class != storeNode.class) {
              matchedD3Node.class = storeNode.class;
              dataChanged = true;
            }
          } else {
            // storeNode does not exist in d3Data; clone it there
            that.d3Data.nodes.push(Object.assign({}, storeNode));
            dataChanged = true;
          }
        });
        //remove unconfirmed nodes in data.nodes
        if (that.d3Data.nodes.length > 0) {
          var originalNodeCount = that.d3Data.nodes.length;
          that.d3Data.nodes = that.d3Data.nodes.filter(function(node) {
            return typeof node.unconfirmed === "undefined"; //node does not have 'unconfirmed' property
          });
          if (that.d3Data.nodes.length != originalNodeCount) {
            dataChanged = true;
          }
        }
        console.log("finished handling nodes; starting on links");
        //     this.storeDataChangeCount++;
        //   }
        // },
        // // watcher for store links
        // links: {
        //   immediate: true,
        //   deep: true,
        //   handler(/*newLinks, oldLinks*/) {
        // var that = this;

        //now do the links
        //mark each link in data.links as unconfirmed
        if (this.d3Data.links.length > 0) {
          this.d3Data.links.forEach(function(d3Link) {
            d3Link.unconfirmed = "true";
          });
        }
        let matchedD3Link = null;
        //for each in storeLinks,
        this.storeData.links.forEach(function(storeLink) {
          var filterPattern = {
            source: storeLink.source,
            target: storeLink.target
            //type: storeLink.type
          };
          //if storeLink exists in data.links already
          // if (
          //   //declaration inside if conditional intended
          //   (matchedD3Link = that.d3Data.links.filter(function(item) {
          //     for (var key in filterPattern) {
          //       console.log("key: ", key, " ", filterPattern[key]);
          //       if (item[key] === undefined || item[key] != filterPattern[key])
          //         return false;
          //     }
          //   })[0])
          // )
          if (
            (matchedD3Link = that.d3Data.links.filter(
              d3Link =>
                d3Link.source.id == storeLink.source &&
                d3Link.target.id == storeLink.target
            )[0])
          ) {
            //remove "unconfirmed" mark
            delete matchedD3Link.unconfirmed;
            //update data link with values from storeLink
            // matchedD3Link.derivative = storeLink.derivative;
          } //else storeLink does not exist in data; clone it there
          else {
            that.d3Data.links.push(Object.assign({}, storeLink));
            dataChanged = true;
          }
        });
        //remove unconfirmed links in data.links
        if (that.d3Data.links.length > 0) {
          var originalLinkCount = that.d3Data.links.length;
          that.d3Data.links = that.d3Data.links.filter(function(link) {
            return typeof link.unconfirmed === "undefined"; //link does not have 'unconfirmed' property
          });
          if (that.d3Data.links.length != originalLinkCount) {
            dataChanged = true;
          }
        }
        if (dataChanged) {
          console.log("incrementing storeDataChangeCount");
          this.storeDataChangeCount++;
        }
        console.log("nodes handler finished");
      }
    }
  }
};
</script>

<style>
.faded {
  opacity: 0.1;
  transition: 0.5s opacity;
}
.highlight {
  opacity: 1;
}

path.link {
  fill: none;
  stroke: #888;
  stroke-width: 5px;
}
path.link.faded {
  opacity: 0.07;
}
path.link.highlight {
  opacity: 1;
}
path.link.depends {
  stroke: #005900;
  stroke-dasharray: 5, 2;
}
path.link.needs {
  stroke: #7f3f00;
}

path.link.unusedInFormula {
  stroke: lightcoral;
}

path.link.usedInFormula {
  stroke: #333;
}

circle {
  stroke-width: 0px;
}
circle.unlinked {
  fill: #f8c471;
  stroke: darkorange;
}
circle.state {
  fill: #a9cce3;
  stroke: #003366;
}
circle.output {
  fill: thistle;
  stroke: #60006d;
}
circle.input {
  fill: #b2e48a;
  stroke: #005000;
}

circle.selected {
  animation: selected 1s infinite alternate ease-in-out;
}

@keyframes selected {
  from {
    stroke-width: 6px;
  }
  to {
    stroke-width: 2px;
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