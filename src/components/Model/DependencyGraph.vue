<template>
  <div>
    <svg width="500" height="500" style="border: black; border-style: solid; border-width: 1px" />
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
import { calculateDependencyLevels } from "src/functions/function-calculateDependencyLevels";

// based on https://bl.ocks.org/agnjunio/fd86583e176ecd94d37f3d2de3a56814

export default {
  name: "dependency-graph",
  components: {},
  data() {
    return {
      svgWidth: 500,
      svgHeight: 500,
      selections: {},
      d3Data: {
        nodes: [],
        links: []
        // draftLinksToInfluencer: [],
        // draftLinksToInfluencee: []
      },
      storeDataChangeCount: 0,
      simulation: null,
      forceProperties: {
        charge: {
          enabled: true,
          strength: -200,
          distanceMin: 1,
          distanceMax: 200
        },
        collide: {
          enabled: true,
          strength: 0.7,
          iterations: 1,
          radius: 35
        },
        forceX: {
          enabled: true,
          strength: 0.8
          //x: 0.5
        },
        forceY: {
          enabled: true,
          strength: 0.1,
          y: 0.5
        },
        link: {
          enabled: true,
          distance: 100,
          iterations: 1
        }
      },
      linkToSubmit: {
        sourceNodeId: "",
        targetNodeId: "",
        targetType: ""
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
      .force("forceX", d3.forceX())
      .force("forceY", d3.forceY())
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
      .attr("refX", 28) //Prevents arrowhead from being covered by circle
      .attr("refY", 0)
      .attr("markerUnits", "userSpaceOnUse")
      .attr("markerWidth", 15)
      .attr("markerHeight", 15)
      .attr("fill", "#666")
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
    ...mapActions("model", ["setSelectedNodeId", "addLink"]),
    ...mapState("model", "[selectedNodeId]"),

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

      var lineAttributes = {
        x1: function(d) {
          return d.x1;
        },
        y1: function(d) {
          return d.y1;
        },
        x2: function(d) {
          return d.x2;
        },
        y2: function(d) {
          return d.y2;
        }
      };

      const graph = this.selections.graph;
      graph.selectAll("path").attr("d", link);
      graph.selectAll("circle").attr("transform", transform);
      graph.selectAll("text").attr("transform", transform);
      // graph
      //   .selectAll("line")
      //   .attr("x1", lineAttributes.x1)
      //   .attr("y1", lineAttributes.y1)
      //   .attr("x2", lineAttributes.x2)
      //   .attr("y2", lineAttributes.y2);
    },
    updateData() {
      var that = this;
      //console.log("updateData; change count ", this.storeDataChangeCount);
      this.simulation.nodes(this.d3Data.nodes);
      this.simulation.force("link").links(this.d3Data.links);

      const simulation = this.simulation;
      const graph = this.selections.graph;
      const svg = this.selections.svg;

      var nodeContextMenu = this.contextMenu().items(
        {
          label: "Add influencer",
          handler: function(a, b) {
            //"this" is the parameter of handler.call(parameter)
            console.log("this: ", this);
            console.log("a: ", a);
            console.log("b: ", b);
          }
        },
        { label: "Add influencee" }
      );

      var linkContextMenu = this.contextMenu().items({
        label: "Delete link",
        handler: function() {
          //"this" is the parameter of handler.call(parameter)
          console.log("this: ", this);
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
          linkContextMenu(d3.mouse(svg.node())[0], d3.mouse(svg.node())[1]);
          //that.nodeClick(d);
        });

      // Nodes should always be redrawn to avoid lines above them
      graph.selectAll("circle").remove();
      graph
        .selectAll("circle")
        .data(this.d3Data.nodes)
        .enter()
        .append("circle")
        .attr("r", 30) // circle radius 30 pixels
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
          nodeContextMenu(d3.mouse(svg.node())[0], d3.mouse(svg.node())[1]);
          that.nodeClick(d);
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
        .call(this.wrap, 60); // wrap the text in <= 60 pixels

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
        .force("charge")
        .strength(forceProperties.charge.strength)
        .distanceMin(forceProperties.charge.distanceMin)
        .distanceMax(forceProperties.charge.distanceMax);
      simulation
        .force("collide")
        .strength(forceProperties.collide.strength)
        .radius(forceProperties.collide.radius)
        .iterations(forceProperties.collide.iterations);
      simulation
        .force("forceX")
        .strength(forceProperties.forceX.strength)
        .x(d => {
          if (d.depLev != null) {
            return (
              (svgWidth / d3Data.numDepLevs) * d.depLev +
              svgWidth / d3Data.numDepLevs / 2
            );
          } else {
            return svgWidth / 2;
          }
        });
      simulation
        .force("forceY")
        .strength(forceProperties.forceY.strength)
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
    contextMenu() {
      var height,
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
            "font-size": "13"
          }
        };

      function menu(x, y) {
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
            //console.log(d);
            var parent = d3.select(this.parentNode);
            console.log("parent: ", parent);
            d.handler.call("test", "A", "B");
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
          tspan.text(line.join(" "));
          if (tspan.node().getComputedTextLength() > width) {
            line.pop();
            lines.push(line.join(" "));
            line = [word];
          }
        }
        lines.push(line.join(" "));
        tspan.text(null);
        lines = lines.reverse();
        dy = -0.5 - lines.length / 2;
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
        // calculate and add depedency level to each node,
        // also save how many dependency levels there are
        let depLevs = calculateDependencyLevels(this.storeData.nodes);
        let numDepLevs = 0;
        that.d3Data.nodes.forEach(function(node) {
          node.depLev = depLevs[node.id];
          if (depLevs[node.id] + 1 > numDepLevs) {
            numDepLevs = depLevs[node.id] + 1;
          }
        });
        that.d3Data.numDepLevs = numDepLevs;

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
  background-color: white;
}
.highlight {
  opacity: 1;
}

path.link {
  fill: none;
  stroke: #666;
  /*stroke-width: 1.5px;*/
  stroke-width: 5px;
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
  stroke-width: 3px;
  /* stuff below for text wrapping */
  height: 100%;
  border-radius: 100%;
  text-align: center;
  line-height: 200px;
  font-size: 30px;
}
circle.unlinked {
  fill: #ffff99;
  stroke: darkorange;
  /*stroke-width: 1.5px;*/
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
  /*stroke-width: 3px;*/
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