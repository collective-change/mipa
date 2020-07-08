<template>
  <div style="position: relative;">
    <q-btn
      @click="
        showAddNode = true;
        addNodeProps.newNodeRole = '';
      "
      class="all-pointer-events print-hide"
      style="position: absolute; top: 10px; left: 10px; z-index: 2"
      color="primary"
      label="Add node"
    />
    <svg
      id="dependencyGraph"
      :width="svgWidth"
      :height="svgHeight"
      style="border: black; border-style: solid; border-width: 0px"
    />

    <p class="print-hide">
      Right-click on node or link to show menu. Ctrl+mouse to pan and zoom.
    </p>
    <q-dialog v-model="showAddNode">
      <add-node
        :sourceNodeId="addNodeProps.sourceNodeId"
        :newNodeRole="addNodeProps.newNodeRole"
        @close="showAddNode = false"
      />
    </q-dialog>
    <q-dialog v-model="showDeleteNode">
      <delete-node
        :node="selectedNode"
        @close="showDeleteNode = false"
      />
    </q-dialog>
    <q-dialog v-model="showAddLink">
      <add-link
        :sourceNodeId="selectedNodeId"
        :linkToSubmit="linkToSubmit"
        @close="showAddLink = false"
      />
    </q-dialog>
    <pre>{{visibilityOfNodeGroups}}</pre>
  </div>
</template>

<script>
import { mapActions, mapGetters, mapState } from "vuex";
import * as d3 from "d3";
import "d3-selection-multi";
import * as sizeof from "object-sizeof";
import idb from "src/api/idb";
import { responsify } from "src/utils/util-responsify-svg";
import { sleep } from "src/utils/util-sleep";
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";
import {
  getNodeLinkEndPoints,
  getDistance
} from "src/utils/util-getNodeLinkEndPoints";

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
  data () {
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
          strength: 1.5,
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
        //type: ""
      }
    };
  },

  computed: {
    ...mapState("ui", [
      "selectedNodeId",
      "selectedNodeGroup",
      "uiNodeChanged",
      "uiNodeChangedFields"
    ]),
    ...mapGetters("model", ["nodes", "links"]),
    ...mapState("model", ["currentModel"]),
    debugLinks () {
      return this.d3Data.links.map(link => { return { source: link.source.id, target: link.target.id } })
    },
    visibilityOfNodeGroups: {
      get () {
        return this.$store.state.ui.visibilityOfNodeGroups
      },
      set (value) {
        this.$store.commit('ui/setVisibilityOfNodeGroups', value)
      }
    },
    selectedNode () {
      let that = this;
      return this.nodes.find(function (node) {
        return node.id == that.selectedNodeId;
      });
    },

    nodeGroups () {
      if (this.currentModel) return this.currentModel.nodeGroups;
      else return null;
    },

    storeData () {
      return { nodes: this.nodes, links: this.links };
    }
  },

  created () {
    this.simulation = d3
      .forceSimulation()
      .force(
        "link",
        d3.forceLink().id(function (d) {
          return d.id;
        })
      )
      .force("gravity", d3.forceManyBody())
      .force("charge", d3.forceManyBody())
      .force("collide", d3.forceCollide())
      .force("center", d3.forceCenter(this.svgWidth / 2, this.svgHeight / 2))
      .force("forceX", d3.forceX())
      .force("forceY", d3.forceY())
      .alphaMin(0.001)
      .alphaDecay(0.0667457) //about 100 iterations
      .alphaTarget(0)
      .velocityDecay(0.1)
      .on("tick", this.tick);
    // Call first time to setup default values
    this.updateForces();
  },

  mounted () {
    //set up svg
    this.selections.svg = d3.select(this.$el.querySelector("svg#dependencyGraph"));
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

    //require ctrlKey in addition to mouse
    this.zoom.filter(function () {
      return d3.event.ctrlKey;
    });

    this.selections.graph = svg.append("g");
    const graph = this.selections.graph;

    this.updateData();
  },

  beforeUpdate () {
    //console.log("beforeUpdate()");
  },
  updated () {
    //console.log("updated()");
  },

  methods: {
    ...mapActions("model", [
      "addLink",
      "deleteLink",
      "createNodeGroup",
      "addToNodeGroup",
      "removeNodeFromGroup",
      "disbandNodeGroup"
    ]),
    ...mapActions("ui", ["setSelectedNodeId"]),

    tick () {
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
      //console.log("alpha: ", this.simulation.alpha());
    },

    savePositions () {
      const graph = this.selections.graph;
      let circlePositions = [];
      graph.selectAll('circle').each(function () {
        const thisCircle = d3.select(this);
        circlePositions.push({ id: thisCircle.data()[0].id, x: thisCircle.attr('x'), y: thisCircle.attr('y') })
      });
      this.simulation.on("end", null); //remove savePositions function from simulation on end
      let saveFile = { modelId: this.currentModel.id, circlePositions }
      console.log('saveing positions');
      idb.saveDependencyGraphDisplay(saveFile);
    },

    getVisibleData () {
      let that = this;
      let collapsedNodeGroups, nodesInCollapsedGroup;

      let nodes = [...this.storeData.nodes];
      let links = [...this.storeData.links];

      //compute collapsedNodeGroups
      if (this.currentModel.nodeGroups && this.visibilityOfNodeGroups)
        collapsedNodeGroups = this.currentModel.nodeGroups.filter(group => !that.visibilityOfNodeGroups.includes(group.id))
      else if (this.currentModel.nodeGroups)
        collapsedNodeGroups = [...this.currentModel.nodeGroups];
      else collapsedNodeGroups = [];

      //TODO: topoSort collapsedNodeGroups
      collapsedNodeGroups.forEach(function (collapsedGroup) {
        let nodeForCollapsedGroup = { id: collapsedGroup.id, name: collapsedGroup.name, isNodeGroup: true, class: 'group', isNew: false, isSelfBlocking: false, symbolFormula: 'exist' };
        //collect problems from nodes in group then remove the nodes
        nodesInCollapsedGroup = nodes.filter(node => collapsedGroup.nodeIds.includes(node.id));
        nodesInCollapsedGroup.forEach(function (node) {
          if (node.isNew) nodeForCollapsedGroup.isNew = true;
          if (node.isSelfBlocking) nodeForCollapsedGroup.isSelfBlocking = true;
          if (node.symbolFormula == '') nodeForCollapsedGroup.symbolFormula = '';
        });
        nodes = nodes.filter(node => !collapsedGroup.nodeIds.includes(node.id));

        //add group node
        nodes.push(nodeForCollapsedGroup);

        //remove links with both ends in group
        //console.log('link 0:', links[0])
        links = links.filter(function (link) {
          return !(collapsedGroup.nodeIds.includes(link.source) && collapsedGroup.nodeIds.includes(link.target))
        });

        //redirect links w/ one end in group to group node; do not allow delete
        links.forEach(function (link, index, linksArray) {
          if (collapsedGroup.nodeIds.includes(link.source) && !collapsedGroup.nodeIds.includes(link.target)) {
            let newLink = Object.assign({}, link);
            newLink.source = collapsedGroup.id;
            links.splice(index, 1, newLink)
          }
          if (!collapsedGroup.nodeIds.includes(link.source) && collapsedGroup.nodeIds.includes(link.target)) {
            let newLink = Object.assign({}, link);
            newLink.target = collapsedGroup.id;
            links.splice(index, 1, newLink)
          }
        })
      });

      //TODO: remove duplicate group-to-group links and add count

      return { nodes, links };
    },
    prepD3DataAndUpdate () {
      if (this.nodes && this.currentModel) {
        /*continue*/
      } else return;
      var that = this;
      let visibleData = this.getVisibleData();
      let visibleNodes = visibleData.nodes;
      let visibleLinks = visibleData.links;

      var dataChanged = false;
      var graphTextChange = false;
      //mark each node in d3Data.nodes as unconfirmed
      if (this.d3Data.nodes.length > 0) {
        this.d3Data.nodes.forEach(function (d3Node) {
          d3Node.unconfirmed = "true";
        });
      }
      let matchedD3Node = null;
      //for each in visibleNodes, update in d3Data.nodes, add it, or remove it
      visibleNodes.forEach(function (visibleNode) {
        //if visibleNode exists in d3Data.nodes already
        if (
          //declaration inside if conditional intended
          (matchedD3Node = that.d3Data.nodes.filter(
            d3Node => d3Node.id == visibleNode.id
          )[0])
        ) {
          //remove "unconfirmed" flag
          delete matchedD3Node.unconfirmed;
          //update d3Data node with values from visibleNode
          if (matchedD3Node.name != visibleNode.name) {
            matchedD3Node.name = visibleNode.name;
            graphTextChange = true;
          }
          if (matchedD3Node.class != visibleNode.class) {
            matchedD3Node.class = visibleNode.class;
            dataChanged = true;
          }
          if (matchedD3Node.isSelfBlocking != visibleNode.isSelfBlocking) {
            matchedD3Node.isSelfBlocking = visibleNode.isSelfBlocking;
            graphTextChange = true;
          }
          if (matchedD3Node.isNew != visibleNode.isNew) {
            matchedD3Node.isNew = visibleNode.isNew;
            graphTextChange = true;
          }
          if (matchedD3Node.symbolFormula != visibleNode.symbolFormula) {
            matchedD3Node.symbolFormula = visibleNode.symbolFormula;
            graphTextChange = true;
          }
        } else {
          // visibleNode does not exist in d3Data; clone it there
          that.d3Data.nodes.push(Object.assign({}, visibleNode));
          dataChanged = true;
        }
      });
      //remove unconfirmed nodes in data.nodes
      if (that.d3Data.nodes.length > 0) {
        var originalNodeCount = that.d3Data.nodes.length;
        that.d3Data.nodes = that.d3Data.nodes.filter(function (node) {
          return typeof node.unconfirmed === "undefined"; //node does not have 'unconfirmed' property
        });
        if (that.d3Data.nodes.length != originalNodeCount) {
          dataChanged = true;
        }
      }

      //now do the links
      //console.log("finished handling nodes; starting on links");
      //mark each link in data.links as unconfirmed
      if (this.d3Data.links.length > 0) {
        this.d3Data.links.forEach(function (d3Link) {
          d3Link.unconfirmed = "true";
        });
      }
      let matchedD3Link = null;
      //for each in visibleLinks,
      visibleLinks.forEach(function (visibleLink) {
        if (
          //if a match in d3Data.links is found
          (matchedD3Link = that.d3Data.links.filter(
            d3Link =>
              d3Link.source.id == visibleLink.source &&
              d3Link.target.id == visibleLink.target &&
              d3Link.hasReciprocal == visibleLink.hasReciprocal &&
              d3Link.isBlocking == visibleLink.isBlocking &&
              d3Link.isUnused == visibleLink.isUnused
          )[0])
        ) {
          //then remove "unconfirmed" mark
          delete matchedD3Link.unconfirmed;
        } //else visibleLink does not exist in data; clone it there
        else {
          that.d3Data.links.push(Object.assign({}, visibleLink));
          dataChanged = true;
        }
      });
      //remove unconfirmed links in data.links
      if (that.d3Data.links.length > 0) {
        var originalLinkCount = that.d3Data.links.length;
        that.d3Data.links = that.d3Data.links.filter(function (link) {
          //only keep links that do not have 'unconfirmed' property
          return typeof link.unconfirmed === "undefined";
        });
        if (that.d3Data.links.length != originalLinkCount) {
          dataChanged = true;
        }
      }
      if (dataChanged) {
        this.updateData();
      }
      if (graphTextChange && !dataChanged) {
        this.updateNodeClassAndText(true);
      }
    },
    updateData (restartForceSimulation = true) {
      var that = this;

      // stop the previous simulation
      if (restartForceSimulation) this.simulation.stop();
      this.simulation.nodes(this.d3Data.nodes);
      this.simulation.force("link").links(this.d3Data.links);

      //const simulation = this.simulation;
      const graph = this.selections.graph;
      const svg = this.selections.svg;

      var linkContextMenu = this.contextMenu().items({
        label: "Delete link",
        handler: function () {
          //"this" is the parameter of handler.call(parameter); a link in this case
          that.deleteLink({
            link: {
              influencerNodeId: this.source.id,
              influenceeNodeId: this.target.id
            },
            modelId: that.$route.params.modelId
          });
        }
      });

      graph
        .selectAll("path")
        .data(this.d3Data.links)
        .exit()
        .remove();

      //Ted: Somehow, we need to remove all links if there are more than 1.
      //Otherwise link styles won't update when isBlocking/isUnused changes.
      if (
        graph
          .selectAll("path")
          .data(this.d3Data.links)
          .exit()._groups[0].length > 1
      ) {
        graph
          .selectAll("path")
          .data(this.d3Data.links)
          .remove();
      }

      graph
        .selectAll("path")
        .data(this.d3Data.links)
        .enter()
        .append("path")
        .attr(
          "class",
          d =>
            "link " +
            (d.isBlocking ? "" : "nonBlocking ") +
            (d.isUnused ? "unused " : "")
        )
        .on("contextmenu", function (d) {
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
        .attr("x", d => d.x ? d.x : this.svgWidth * 0.5)
        .attr("y", d => d.y ? d.y : this.svgWidth * 0.5)
        .call(
          d3
            .drag()
            .on("start", this.nodeDragStarted)
            .on("drag", this.nodeDragged)
            .on("end", this.nodeDragEnded)
        )
        .on("mouseover", this.nodeMouseOver)
        .on("mouseout", this.nodeMouseOut)
        .on("contextmenu", function (d) {
          d3.event.preventDefault();
          that.nodeClick(d, null, "contextMenuClick");

          function composeNodeContextMenuItems (conditions) {
            const baseNodeContextMenuItems = [
              {
                label: "Add new influencer",
                handler: function () {
                  that.showAddNode = true;
                  that.addNodeProps.sourceNodeId = that.selectedNodeId;
                  that.addNodeProps.newNodeRole = "influencer";
                }
              },
              {
                label: "Add new influencee",
                handler: function () {
                  that.showAddNode = true;
                  that.addNodeProps.sourceNodeId = that.selectedNodeId;
                  that.addNodeProps.newNodeRole = "influencee";
                }
              },
              {
                label: "Link to influencer",
                handler: function () {
                  that.showAddLink = true;
                  that.linkToSubmit.sourceNodeId = that.selectedNodeId;
                  that.linkToSubmit.targetNodeId = "";
                  that.linkToSubmit.targetType = "influencer";
                }
              },
              {
                label: "Link to influencee",
                handler: function () {
                  that.showAddLink = true;
                  that.linkToSubmit.sourceNodeId = that.selectedNodeId;
                  that.linkToSubmit.targetNodeId = "";
                  that.linkToSubmit.targetType = "influencee";
                }
              },

              {
                label: "Delete node",
                handler: function () {
                  that.showDeleteNode = true;
                }
              }
            ];

            const notInNodeGroupContextMenuItems = [
              {
                label: "Start node group",
                handler: async function () {
                  let nodeGroup = await that.createNodeGroup(that.selectedNodeId);
                  that.$store.commit("ui/setSelectedNodeGroup", nodeGroup);
                }
              }
            ];

            const addToSelectedNodeGroupMenuItems = [
              {
                label: "Add to selected group",
                handler: async function () {
                  await that.addToNodeGroup({
                    nodeId: that.selectedNodeId,
                    nodeGroupId: that.selectedNodeGroup.id
                  });
                }
              }
            ];

            const selectedInNodeGroupMenuItems = [
              {
                label: "Remove node from group",
                handler: async function () {
                  await that.removeNodeFromGroup({
                    nodeId: that.selectedNodeId,
                    nodeGroupId: that.selectedNodeGroup.id
                  });
                }
              },
              {
                label: "Collapse node group",
                handler: async function () {
                  await that.collapseNodeGroup(that.selectedNodeGroup.id);
                }
              },
              {
                label: "Disband node group",
                handler: async function () {
                  await that.disbandNodeGroup(that.selectedNodeGroup.id);
                }
              },
            ];

            let items = [];
            items.push(...baseNodeContextMenuItems);
            if (!conditions.nodeIsInGroup)
              items.push(...notInNodeGroupContextMenuItems);
            if (!conditions.nodeIsInGroup && conditions.someNodeGroupIsSelected)
              items.push(...addToSelectedNodeGroupMenuItems);
            if (selectedNodeIsInSelectedGroup)
              items.push(...selectedInNodeGroupMenuItems);
            return items;
          }

          //add additional items to menu if applicable
          //if node is not in a group, then show corresponding options
          //loop through nodeGroups to find selectedNodeId

          let nodeIsInGroup = false;
          if (that.currentModel.nodeGroups)
            that.currentModel.nodeGroups.forEach(function (nodeGroup) {
              if (nodeGroup.nodeIds.includes(that.selectedNodeId)) {
                //console.log("nodeIsInGroup");
                nodeIsInGroup = true;
              }
            });

          let someNodeGroupIsSelected = that.selectedNodeGroup ? true : false;
          let selectedNodeIsInSelectedGroup = false;
          if (that.selectedNodeGroup &&
            that.selectedNodeId &&
            that.selectedNodeGroup.nodeIds.includes(that.selectedNodeId))
            selectedNodeIsInSelectedGroup = true;

          let menuItems = composeNodeContextMenuItems({
            nodeIsInGroup,
            someNodeGroupIsSelected,
            selectedNodeIsInSelectedGroup
          });
          let nodeContextMenu = that.contextMenu().items(...menuItems);
          nodeContextMenu(d3.mouse(svg.node())[0], d3.mouse(svg.node())[1], d);
        })
        //.on("click", this.nodeClick);
        .on("click", function (d, i) {
          that.nodeClick(d, i, "regularClick");
        });

      this.updateNodeClassAndText();

      // Add 'marker-end' attribute to each path
      svg
        .selectAll("g")
        .selectAll("path")
        .attr("marker-end", "url(#end)");

      if (restartForceSimulation) {
        this.simulation.on("end", this.savePositions);
        this.simulation.alpha(1).restart();
      }
    },
    updateNodeClassAndText (restartSimulation = false) {
      const graph = this.selections.graph;
      const selectedCircle = graph.selectAll("circle.selected");
      const nodeIdsInNodeGroup = this.selectedNodeGroup
        ? this.selectedNodeGroup.nodeIds
        : [];
      graph
        .selectAll("circle")
        .data(this.d3Data.nodes)
        //.attr("r", nodeRadius)
        .attr("class", d =>
          d.class.concat(
            d.isSelfBlocking ? " selfBlocking" : "",
            d.isNew ? " new" : "",
            d.symbolFormula && d.symbolFormula ? "" : " noFormula",
            nodeIdsInNodeGroup.includes(d.id) ? " nodeGroupSelected" : "",
            d.isNodeGroup && this.selectedNodeGroup && d.id == this.selectedNodeGroup.id ? ' nodeGroupSelected' : ''
          )
        );
      selectedCircle.classed("selected", true);

      graph.selectAll("text").remove();
      graph
        .selectAll("text")
        .data(this.d3Data.nodes)
        .enter()
        .append("text")
        .attr("x", 0)
        .attr("y", ".31em")
        .attr("text-anchor", "middle")
        .text(d =>
          d.name.concat(
            d.isSelfBlocking ? " (self-blocking)" : "",
            d.isNew ? " (new)" : "",
            d.symbolFormula ? "" : " (no formula)"
          )
        )
        .call(this.wrap, nodeRadius * 2); // wrap the text in <= node diameter
      //update circle styles as well
      if (restartSimulation) {
        this.simulation.alpha(0.001).restart();
      }
    },
    updateForces () {
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
        .strength(function (d) {
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
        .strength(forceProperties.link.strength)
        .iterations(forceProperties.link.iterations);

      // updates ignored until this is run
      // restarts the simulation (important if simulation has already slowed down)
      simulation.alpha(1).restart();
    },
    zoomed () {
      const transform = d3.event.transform;
      this.selections.graph.attr("transform", transform);
    },
    nodeDragStarted (d) {
      if (!d3.event.active) {
        this.simulation.on("end", this.savePositions);
        this.simulation.alphaTarget(0.3).restart();
      }
      d.fx = d.x;
      d.fy = d.y;
    },
    nodeDragged (d) {
      d.fx = d3.event.x;
      d.fy = d3.event.y;
      this.simulation.alphaTarget(0.3).restart();
    },
    nodeDragEnded (d) {
      if (!d3.event.active) {
        this.simulation.alphaTarget(0);
      }
      d.fx = null;
      d.fy = null;
    },
    nodeMouseOver (d) {
      const graph = this.selections.graph;
      const circles = graph.selectAll("circle");
      const paths = graph.selectAll("path");
      const texts = graph.selectAll("text");

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
      circles.classed("faded", true);
      circles.filter(df => related.indexOf(df) > -1).classed("highlight", true);
      paths.classed("faded", true);
      paths
        .filter(df => df.source === d || df.target === d)
        .classed("highlight", true);
      texts.classed("faded", true);
      texts.filter(df => related.indexOf(df) > -1).classed("highlight", true);
      // This ensures that tick is called so the node count is updated
      this.simulation.alphaTarget(0/*0.0001*/).restart();
    },
    nodeMouseOut (d) {
      const graph = this.selections.graph;
      const circles = graph.selectAll("circle");
      const paths = graph.selectAll("path");
      const texts = graph.selectAll("text");

      circles.classed("faded", false);
      circles.classed("highlight", false);
      paths.classed("faded", false);
      paths.classed("highlight", false);
      texts.classed("faded", false);
      texts.classed("highlight", false);
      // This ensures that tick is called so the node count is updated
      this.simulation.restart();
    },
    nodeClick (d, i, clickType) {
      const circles = this.selections.graph.selectAll("circle");

      circles.classed("selected", false);
      circles.filter(td => td === d).classed("selected", true);

      if (this.uiNodeChanged) {
        this.$q
          .dialog({
            title: "Unsaved changes",
            message:
              "<p>Changed: " +
              this.uiNodeChangedFields.join(", ") +
              "<p/><p>The changes you made will be lost. Really switch to another node?</p>",
            cancel: true,
            persistent: true,
            html: true
          })

          .onOk(() => {
            this.setSelectedNodeId(d.id);
            circles.classed("selected", false);
            circles.filter(td => td === d).classed("selected", true);
          });
      } else {
        this.setSelectedNodeId(d.id);
        circles.classed("selected", false);
        circles.filter(td => td === d).classed("selected", true);
      }
      if (clickType == "regularClick") {
        const that = this;
        //look for node in model.nodeGroups
        if (this.currentModel.hasOwnProperty("nodeGroups")) {
          let selectedNodeGroupFound = false;
          this.currentModel.nodeGroups.forEach(function (nodeGroup) {
            if (
              nodeGroup.hasOwnProperty("nodeIds") &&
              //nodeGroup.nodeIds.includes(selectedNode.id)
              nodeGroup.nodeIds.includes(d.id)
            ) {
              that.$store.commit("ui/setSelectedNodeGroup", nodeGroup);
              selectedNodeGroupFound = true;
            }
          });
          if (!selectedNodeGroupFound)
            that.$store.commit("ui/setSelectedNodeGroup", null);
        } else {
          that.$store.commit("ui/setSelectedNodeGroup", null);
        }
        this.updateNodeClassAndText();
      }
    },
    contextMenu (hostD) {
      let svg = this.selections.svg;
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

      function menu (x, y, hostD) {
        d3.select(".context-menu").remove();
        scaleItems();

        // Draw the menu
        //d3.select("svg")
        svg
          .append("g")
          .attr("class", "context-menu")
          .selectAll("tmp")
          .data(items)
          .enter()
          .append("g")
          .attr("class", "menu-entry")
          .style("cursor", "pointer")
          .on("mouseover", function () {
            d3.select(this)
              .select("rect")
              .styles(style.rect.mouseover);
          })
          .on("mouseout", function () {
            d3.select(this)
              .select("rect")
              .styles(style.rect.mouseout);
          });

        d3.selectAll(".menu-entry")
          .append("rect")
          .attr("x", x)
          .attr("y", function (d, i) {
            return y + i * height;
          })
          .attr("width", width)
          .attr("height", height)
          .styles(style.rect.mouseout)
          .on("click", function (d) {
            d.handler.call(hostD);
          });

        d3.selectAll(".menu-entry")
          .append("text")
          .text(function (d) {
            return d.label;
          })
          .attr("x", x)
          .attr("y", function (d, i) {
            return y + i * height;
          })
          .attr("dy", height - margin / 2)
          .attr("dx", margin)
          .styles(style.text);

        // Other interactions
        d3.select("body").on("click", function () {
          d3.select(".context-menu").remove();
        });
      }

      menu.items = function (e) {
        if (!arguments.length) return items;
        for (var i in arguments) items.push(arguments[i]);
        rescale = true;
        return menu;
      };

      // Automatically set width, height, and margin;
      function scaleItems () {
        if (rescale) {
          //d3.select("svg")
          svg
            .selectAll("tmp")
            .data(items)
            .enter()
            .append("text")
            .text(function (d) {
              return d.label;
            })
            .styles(style.text)
            .attr("x", -1000)
            .attr("y", -1000)
            .attr("class", "tmp");
          var z = d3
            .selectAll(".tmp")
            .nodes()
            .map(function (x) {
              return x.getBBox();
            });
          width = d3.max(
            z.map(function (x) {
              return x.width;
            })
          );
          margin = margin * width;
          width = width + 2 * margin;
          height = d3.max(
            z.map(function (x) {
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
    wrap (texts, width) {
      texts.each(function () {
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
    submitLink () {
      this.addLink({
        link: this.linkToSubmit,
        modelId: this.$route.params.modelId
      });
      this.$emit("close");
    }
  },

  watch: {
    forceProperties: {
      handler (newForce) {
        this.updateForces();
      },
      deep: true
    },

    selectedNodeGroup: {
      deep: true,
      handler () {
        this.updateNodeClassAndText(true);
      }
    },

    nodeGroups: {
      deep: true,
      handler (nodeGroups) {
        if (nodeGroups && this.selectedNodeGroup) {
          let nodeGroup = nodeGroups.find(ng => ng.id == this.selectedNodeGroup.id);
          this.$store.commit("ui/setSelectedNodeGroup", nodeGroup);
        }
      }
    },

    // watcher for store nodes
    nodes: {
      immediate: true,
      deep: true,
      handler (/*newNodes, oldNodes*/) {
        //console.log('nodes changed');
        if (this.nodes && this.currentModel) {
          //console.log('nodes watcher calling prepD3DataAndUpdate')
          this.prepD3DataAndUpdate();
        }

      }
    },

    visibilityOfNodeGroups: {
      immediate: true,
      deep: true,
      handler (/*newNodes, oldNodes*/) {
        //console.log('visibilityOfNodeGroups changed');
        if (this.nodes && this.currentModel) {
          //console.log('visibilityOfNodeGroups watcher calling prepD3DataAndUpdate')
          this.prepD3DataAndUpdate();
        }

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
  stroke: #666;
  stroke-width: 5px;
}
path.link.faded {
  opacity: 0.07;
}
path.link.highlight {
  opacity: 1;
}
path.link.nonBlocking {
  stroke-dasharray: 5, 2;
}
path.link.unused {
  stroke: #aaa;
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
circle.group {
  fill: #e0e0e0;
  stroke: #666;
}
circle.new,
circle.noFormula,
circle.selfBlocking {
  stroke-width: 1px;
  stroke: red;
}

circle.selected {
  animation: selected 1s infinite alternate ease-in-out;
}

circle.nodeGroupSelected {
  stroke: #666;
  stroke-width: 3px;
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
