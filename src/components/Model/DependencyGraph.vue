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

    <p class="print-hide">Right-click on node or link to show menu. Ctrl+mouse to pan and zoom.</p>
    <q-dialog v-model="showAddNode">
      <add-node
        :sourceNodeId="addNodeProps.sourceNodeId"
        :newNodeRole="addNodeProps.newNodeRole"
        @close="showAddNode = false"
      />
    </q-dialog>
    <q-dialog v-model="showDeleteNode">
      <delete-node :node="selectedNode" @close="showDeleteNode = false" />
    </q-dialog>
    <q-dialog v-model="showAddLink">
      <add-link
        :sourceNodeId="selectedNodeId"
        :linkToSubmit="linkToSubmit"
        @close="showAddLink = false"
      />
    </q-dialog>
  </div>
</template>

<script>
import { mapActions, mapGetters, mapState } from "vuex";
import * as d3 from "d3";
import "d3-selection-multi"; //TODO: check if this import is needed
import * as sizeof from "object-sizeof";
import idb from "src/api/idb";
import { responsify } from "src/utils/util-responsify-svg";
import { sleep } from "src/utils/util-sleep";
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";
import {
  getNodeLinkEndPoints,
  getDistance
} from "src/utils/util-getNodeLinkEndPoints";
import { showErrorMessage } from "src/utils/util-show-error-message";

// based on https://bl.ocks.org/agnjunio/fd86583e176ecd94d37f3d2de3a56814

var nodeRadius = 30;
const svgWidth = 800;
const svgHeight = 590;
var dragStartTime, dragEndTime;

export default {
  name: "dependency-graph",
  components: {
    "add-node": require("components/Model/Modals/AddNode.vue").default,
    "delete-node": require("components/Model/Modals/DeleteNode.vue").default,
    "add-link": require("components/Model/Modals/AddLink.vue").default
  },
  props: ["initialCirclePositions"],
  data() {
    return {
      showAddNode: false,
      showDeleteNode: false,
      showAddLink: false,
      linkTargetType: "",
      svgWidth: svgWidth,
      svgHeight: svgHeight,
      selections: {},
      d3Data: {
        nodes: [],
        links: []
      },
      simulation: null,
      iterationCount: 0,
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
          iterations: 1
          //radius: nodeRadius
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
          strength: 1,
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
    /*debugLinks() {
      return this.d3Data.links.map(link => {
        return { source: link.source.id, target: link.target.id };
      });
    },*/
    expandedNodeGroups: {
      get() {
        return this.$store.state.ui.expandedNodeGroups;
      },
      set(value) {
        this.$store.commit("ui/setExpandedNodeGroups", value);
      }
    },
    selectedNode() {
      let that = this;
      return this.nodes.find(function(node) {
        return node.id == that.selectedNodeId;
      });
    },

    nodeGroups() {
      if (this.currentModel) return this.currentModel.nodeGroups;
      else return null;
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
      .alphaMin(0.001)
      .alphaDecay(0.0667457) //about 100 iterations
      .alphaTarget(0)
      .velocityDecay(0.1)
      .on("tick", this.tick);
    // Call first time to setup default values
    this.updateForces();
  },

  mounted() {
    //set up svg
    this.selections.svg = d3.select(
      this.$el.querySelector("svg#dependencyGraph")
    );
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
      .attr("id", "end")
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

    // Define the arrow marker for unused links
    svg
      .select("defs")
      .append("svg:marker") // This section adds in the arrows
      .attr("id", "end-unused")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 5) //Prevents arrowhead from being covered by circle
      .attr("refY", 0)
      .attr("markerUnits", "userSpaceOnUse")
      .attr("markerWidth", 15)
      .attr("markerHeight", 15)
      .attr("fill", "#e77")
      .attr("orient", "auto")
      .append("svg:path")
      .attr("d", "M0,-5L10,0L0,5");

    // Define the arrow marker for relaxed links
    svg
      .select("defs")
      .append("svg:marker") // This section adds in the arrows
      .attr("id", "end-relaxed")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 5) //Prevents arrowhead from being covered by circle
      .attr("refY", 0)
      .attr("markerUnits", "userSpaceOnUse")
      .attr("markerWidth", 15)
      .attr("markerHeight", 15)
      .attr("fill", "#eee")
      .attr("orient", "auto")
      .append("svg:path")
      .attr("d", "M0,-5L10,0L0,5");

    // Define the arrow marker for unused, relaxed links
    svg
      .select("defs")
      .append("svg:marker") // This section adds in the arrows
      .attr("id", "end-unused-relaxed")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 5) //Prevents arrowhead from being covered by circle
      .attr("refY", 0)
      .attr("markerUnits", "userSpaceOnUse")
      .attr("markerWidth", 15)
      .attr("markerHeight", 15)
      .attr("fill", "#fdd")
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

  beforeUpdate() {
    //console.log("beforeUpdate()");
  },
  updated() {
    //console.log("updated()");
  },

  methods: {
    ...mapActions("model", [
      "addLink",
      "deleteLink",
      "relaxLink",
      "relaxLinkMore",
      "restoreLinkForce",
      "createNodeGroup",
      "addToNodeGroup",
      "removeNodeFromGroup",
      "disbandNodeGroup"
    ]),
    ...mapActions("ui", ["setSelectedNodeId"]),

    tick() {
      let that = this;
      // If no data is ready, do nothing
      if (!this.d3Data) {
        return;
      }
      //this.simulation.stop();

      this.simulation
        .force("collide")
        .strength(that.forceProperties.collide.strength)
        .radius(function(node) {
          if (node.toRemove) return 0;
          else return nodeRadius * 1 - that.simulation.alpha();
        })
        .iterations(that.forceProperties.collide.iterations);

      this.simulation
        .force("link")
        .distance(function(link) {
          if (link.newlyEntered)
            return (
              that.forceProperties.link.distance *
              Math.min(1, that.iterationCount / 50)
            );
          else return that.forceProperties.link.distance;
        })
        //.strength(that.forceProperties.link.strength)
        .iterations(that.forceProperties.link.iterations);

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
      this.iterationCount++;
      //this.simulation.stop();
    },

    savePositions() {
      const graph = this.selections.graph;
      let circlePositions = [];
      let logged = false;
      graph.selectAll("circle").each(function() {
        const thisCircle = d3.select(this);
        let tempStr = thisCircle.attr("transform").replace("translate(", "");
        tempStr = tempStr.replace(")", "");
        let xy = tempStr.split(",");
        circlePositions.push({
          id: thisCircle.data()[0].id,
          x: xy[0],
          y: xy[1]
        });
      });
      this.simulation.on("end", null); //remove savePositions function from simulation on end

      (async () => {
        while (
          !this.currentModel // define the condition as you like
        )
          await new Promise(resolve => setTimeout(resolve, 200));

        let saveFile = {
          modelId: this.currentModel.id,
          expandedNodeGroups: this.expandedNodeGroups,
          circlePositions
        };
        //if circlePositions are valid, then save
        if (circlePositions.length && !isNaN(circlePositions[0].x)) {
          //console.log("saving positions");
          //console.log("iterationCount", this.iterationCount);
          idb.saveDependencyGraphDisplay(saveFile);
        }
      })();
    },

    getVisibleData(payload) {
      let that = this;
      let collapsedNodeGroups, nodesInCollapsedGroup;

      let nodes = [...this.storeData.nodes];
      let links = [...this.storeData.links];

      //remove newlyEntered from d3Data nodes and inks
      this.d3Data.nodes.forEach(n => (n.newlyEntered = false));
      this.d3Data.links.forEach(l => (l.newlyEntered = false));

      //compute collapsedNodeGroups
      if (this.currentModel.nodeGroups && this.expandedNodeGroups)
        collapsedNodeGroups = this.currentModel.nodeGroups.filter(
          group => !that.expandedNodeGroups.includes(group.id)
        );
      else if (this.currentModel.nodeGroups)
        collapsedNodeGroups = [...this.currentModel.nodeGroups];
      else collapsedNodeGroups = [];

      let sortedNodeGroups = [];
      if (this.currentModel.nodeGroups && this.currentModel.nodeGroups.length)
        sortedNodeGroups = this.topoSortNodeGroups(
          this.currentModel.nodeGroups
        );

      //for collapsed node groups, replace individual nodes with a group node
      sortedNodeGroups.forEach(function(nodeGroup) {
        //find collapsedNodeGroup with matching id as the sorted group
        let collapsedGroup = collapsedNodeGroups.find(
          group => group.id == nodeGroup.id
        );
        if (collapsedGroup) {
          let d3Node,
            xSum = 0,
            ySum = 0,
            collapsedD3NodesInGroupCount = 0;
          let nodeForCollapsedGroup = {
            id: collapsedGroup.id,
            name: collapsedGroup.name,
            isNodeGroup: true,
            class: "group",
            isNew: false,
            isSelfBlocking: false,
            symbolFormula: "exist"
          };
          //collect problems from nodes in group then remove the nodes
          nodesInCollapsedGroup = nodes.filter(node =>
            collapsedGroup.nodeIds.includes(node.id)
          );
          nodesInCollapsedGroup.forEach(function(node) {
            if (node.isNew) nodeForCollapsedGroup.isNew = true;
            if (node.isSelfBlocking)
              nodeForCollapsedGroup.isSelfBlocking = true;
            if (node.symbolFormula == "")
              nodeForCollapsedGroup.symbolFormula = "";

            // add node's x y positions to accumulator in preparation for
            // calculating average position
            if (that.d3Data.nodes.length) {
              d3Node = that.d3Data.nodes.find(n => n.id == node.id);
              if (d3Node) {
                xSum += d3Node.x;
                ySum += d3Node.y;
                collapsedD3NodesInGroupCount++;
              }
            }
          });

          //remove nodes from collapsed node group
          nodes = nodes.filter(
            node => !collapsedGroup.nodeIds.includes(node.id)
          );

          //add group node; first initialize with average position of child nodes if available
          if (collapsedD3NodesInGroupCount) {
            nodeForCollapsedGroup.x = xSum / collapsedD3NodesInGroupCount;
            nodeForCollapsedGroup.y = ySum / collapsedD3NodesInGroupCount;
          }
          nodes.push(nodeForCollapsedGroup);

          //remove links with both ends in group
          links = links.filter(function(link) {
            return !(
              collapsedGroup.nodeIds.includes(link.source) &&
              collapsedGroup.nodeIds.includes(link.target)
            );
          });

          //redirect links w/ one end in group to group node
          //TODO: do not allow delete on these links
          links.forEach(function(link, index, linksArray) {
            if (
              collapsedGroup.nodeIds.includes(link.source) &&
              !collapsedGroup.nodeIds.includes(link.target)
            ) {
              let newLink = Object.assign({}, link);
              newLink.source = collapsedGroup.id;
              links.splice(index, 1, newLink);
            }
            if (
              !collapsedGroup.nodeIds.includes(link.source) &&
              collapsedGroup.nodeIds.includes(link.target)
            ) {
              let newLink = Object.assign({}, link);
              newLink.target = collapsedGroup.id;
              links.splice(index, 1, newLink);
            }
          });
        }
      });
      //get nodes in newly expanded nodeGroup, use exiting group node position for new nodes
      if (payload && payload.newlyExpandedGroupId) {
        let newlyExpandedGroup = this.currentModel.nodeGroups.find(
          g => g.id == payload.newlyExpandedGroupId //
        );
        //console.log("newly expanded group", newlyExpandedGroup);
        //get exiting group node position
        let exitingGroupNode = that.d3Data.nodes.find(
          n => n.id == newlyExpandedGroup.id
        );
        //console.log("exiting groupNode", exitingGroupNode);
        let nodeInGroupCount = 0;
        newlyExpandedGroup.nodeIds.forEach(function(nodeId) {
          let nodeInGroup = nodes.find(n => n.id == nodeId);
          if (exitingGroupNode && nodeInGroup) {
            //set position to be around the exiting group node
            nodeInGroup.x =
              exitingGroupNode.x +
              that.forceProperties.link.distance *
                0.05 *
                Math.sin(nodeInGroupCount * 10);
            nodeInGroup.y =
              exitingGroupNode.y +
              that.forceProperties.link.distance *
                0.05 *
                Math.cos(nodeInGroupCount * 10);
            nodeInGroup.newlyEntered = true;
            nodeInGroupCount++;
          }
        });
      }

      //if nothing in d3Data (meaning the simulation is new)
      //then set initial positions node.x, node.y
      if (that.d3Data.nodes.length == 0) {
        let circlePositions = that.initialCirclePositions;
        if (circlePositions && circlePositions.length)
          nodes.forEach(function(node) {
            let circlePosition = circlePositions.find(c => c.id == node.id);
            if (circlePosition) {
              if (!isNaN(circlePosition.x)) node.x = Number(circlePosition.x);
              if (!isNaN(circlePosition.y)) node.y = Number(circlePosition.y);
            }
          });
      }

      //TODO: remove duplicate group-to-group links and add count

      return { nodes, links };
    },

    topoSortNodeGroups(storeNodeGroups) {
      let nodeGroups = JSON.parse(JSON.stringify(storeNodeGroups));
      //compute inDegrees of each node group
      nodeGroups.forEach(group => {
        //how many times the group appears as the parent
        group.parentDegree = nodeGroups.filter(
          x => x.parentId == group.id
        ).length;
      });
      let L = []; //for storing sorted elements
      let S = nodeGroups.filter(group => group.parentDegree == 0); //groups with no children
      let unvisitedGroups = nodeGroups.filter(group => group.parentDegree != 0);
      let g = null; //group to process
      let parent = null; //a working variable

      while (S.length) {
        // remove a group g from S and append to tail of L
        g = S.shift();
        L.push(g);
        if (g.parentId) {
          parent = unvisitedGroups.find(group => group.id == g.parentId);
          if (parent) {
            parent.parentDegree--;
            if (parent.parentDegree == 0) {
              S.push(parent);
              //remove parent from unvisited groups
              for (var i = 0; i < unvisitedGroups.length; i++) {
                if (unvisitedGroups[i] === parent) {
                  unvisitedGroups.splice(i, 1);
                }
              }
            }
          }
        }
      }
      //now try to sort out unvisited groups (ones in or blocked by a cycle)

      try {
        //if there are unvisited groups, then graph has at least one cycle
        if (unvisitedGroups.length) {
          const groupNames = unvisitedGroups
            .map(group => group.name)
            .join(", ");
          console.log("unvisitedNodeGroups: ", groupNames);
          throw "Circular hierarchy detected in node groups: " + groupNames;
        }
      } catch (err) {
        console.log(err);
        showErrorMessage("Error sorting node groups", err.message);
      }
      return L;
    },

    prepD3DataAndUpdate(payload) {
      if (this.nodes && this.currentModel) {
        /*continue*/
      } else return;
      var that = this;
      let visibleData = this.getVisibleData(payload);
      let visibleNodes = visibleData.nodes;
      let visibleLinks = visibleData.links;
      let modifyingExistingGraph = false;

      var dataChanged = false;
      var graphTextChange = false;
      //mark each node in d3Data.nodes as unconfirmed
      if (this.d3Data.nodes.length > 0) {
        this.d3Data.nodes.forEach(function(d3Node) {
          d3Node.unconfirmed = "true";
        });
        modifyingExistingGraph = true;
      }
      let matchedD3Node = null;
      //for each in visibleNodes, update in d3Data.nodes, add it, or remove it
      visibleNodes.forEach(function(visibleNode) {
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
          that.d3Data.nodes.push(Object.assign({}, visibleNode));
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

      //now do the links
      //console.log("finished handling nodes; starting on links");
      //mark each link in data.links as unconfirmed
      if (this.d3Data.links.length > 0) {
        this.d3Data.links.forEach(function(d3Link) {
          d3Link.unconfirmed = "true";
        });
      }
      let matchedD3Link = null;
      //for each in visibleLinks,
      visibleLinks.forEach(function(visibleLink) {
        if (
          //if a match in d3Data.links is found
          (matchedD3Link = that.d3Data.links.filter(
            d3Link =>
              d3Link.source.id == visibleLink.source &&
              d3Link.target.id == visibleLink.target &&
              d3Link.hasReciprocal == visibleLink.hasReciprocal &&
              d3Link.isBlocking == visibleLink.isBlocking &&
              d3Link.isUnused == visibleLink.isUnused &&
              d3Link.strengthFactor == visibleLink.strengthFactor
          )[0])
        ) {
          //then remove "unconfirmed" mark
          delete matchedD3Link.unconfirmed;
        } //else visibleLink does not exist in data; clone it there
        else {
          if (modifyingExistingGraph) visibleLink.newlyEntered = true;
          that.d3Data.links.push(Object.assign({}, visibleLink));
          dataChanged = true;
        }
      });
      //remove unconfirmed links in data.links
      if (that.d3Data.links.length > 0) {
        var originalLinkCount = that.d3Data.links.length;
        that.d3Data.links = that.d3Data.links.filter(function(link) {
          //only keep links that do not have 'unconfirmed' property
          return typeof link.unconfirmed === "undefined";
        });
        if (that.d3Data.links.length != originalLinkCount) {
          dataChanged = true;
        }
      }
      if (dataChanged) {
        //To draw relaxed links first (so they do not cover other links),
        //sort links so relaxed links come first.
        that.d3Data.links.sort((a, b) => a.strengthFactor - b.strengthFactor);
        this.updateData({ modifyingExistingGraph });
      }
      if (graphTextChange && !dataChanged) {
        this.updateNodeClassAndText(true, 0.001);
      }
    },
    updateData(options) {
      let restartForceSimulation =
        options && options.hasOwnProperty("restartForceSimulation")
          ? options.restartForceSimulation
          : true;
      let modifyingExistingGraph =
        options && options.hasOwnProperty("modifyingExistingGraph")
          ? options.modifyingExistingGraph
          : false;
      var that = this;

      // stop the previous simulation
      if (restartForceSimulation && this.simulation) this.simulation.stop();
      this.simulation.nodes(this.d3Data.nodes);
      this.simulation.force("link").links(this.d3Data.links);

      //const simulation = this.simulation;
      const graph = this.selections.graph;
      const svg = this.selections.svg;

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
            (d.isUnused ? "unused " : "") +
            (d.strengthFactor < 1 ? "relaxed " : "")
        )
        .on("contextmenu", function(d) {
          d3.event.preventDefault();
          function composeLinkContextMenuItems(d) {
            let linkIsRelaxed = d.strengthFactor < 1;
            const baseLinkContextMenuItems = [
              {
                label: "Delete link",
                handler: function() {
                  //"this" is the parameter of handler.call(parameter); a link in this case
                  that.deleteLink({
                    link: {
                      influencerNodeId: this.source.id,
                      influenceeNodeId: this.target.id
                    },
                    modelId: that.$route.params.modelId
                  });
                }
              }
            ];
            const unrelaxedLinkContextMenuItems = [
              {
                label: "Relax link",
                handler: function() {
                  //"this" is the parameter of handler.call(parameter); a link in this case
                  that.relaxLink({
                    link: {
                      influencerNodeId: this.source.id,
                      influenceeNodeId: this.target.id
                    },
                    modelId: that.$route.params.modelId
                  });
                }
              }
            ];
            const relaxedLinkContextMenuItems = [
              {
                label: "Relax more",
                handler: function() {
                  //"this" is the parameter of handler.call(parameter); a link in this case
                  that.relaxLinkMore({
                    link: {
                      influencerNodeId: this.source.id,
                      influenceeNodeId: this.target.id
                    },
                    modelId: that.$route.params.modelId
                  });
                }
              },
              {
                label: "Restore force",
                handler: function() {
                  //"this" is the parameter of handler.call(parameter); a link in this case
                  that.restoreLinkForce({
                    link: {
                      influencerNodeId: this.source.id,
                      influenceeNodeId: this.target.id
                    },
                    modelId: that.$route.params.modelId
                  });
                }
              }
            ];
            let items = [];
            //TODO: distinguish between links to nodes and to node groups
            items.push(...baseLinkContextMenuItems);
            if (linkIsRelaxed) items.push(...relaxedLinkContextMenuItems);
            else items.push(...unrelaxedLinkContextMenuItems);
            return items;
          }
          let linkContextMenuItems = composeLinkContextMenuItems(d);
          let linkContextMenu = that
            .contextMenu()
            .items(...linkContextMenuItems);
          linkContextMenu(d3.mouse(svg.node())[0], d3.mouse(svg.node())[1], d);
        });

      // Nodes should always be redrawn to avoid lines above them
      let nodes = graph.selectAll("circle");
      graph.selectAll("circle").remove();

      graph
        .selectAll("circle")
        .data(this.d3Data.nodes)
        .enter()
        .append("circle")
        .each(function(node, i) {
          if (node.newlyEntered) {
            d3.select(this)
              .transition()
              .attr("r", nodeRadius);
          } else {
            d3.select(this).attr("r", nodeRadius);
          }
        })
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
          that.nodeClick(d, null, "contextMenuClick");

          function composeNodeContextMenuItems() {
            //add additional items to menu if applicable
            //if node is not in a group, then show corresponding options
            //loop through nodeGroups to find selectedNodeId

            let nodeIsInGroup = false;
            let nodeIsGroupNode = false;
            //console.log("selectedNodeId", that.selectedNodeId);
            if (that.currentModel.nodeGroups)
              that.currentModel.nodeGroups.forEach(function(nodeGroup) {
                if (nodeGroup.nodeIds.includes(that.selectedNodeId)) {
                  //console.log("nodeIsInGroup");
                  nodeIsInGroup = true;
                }
                if (nodeGroup.id == that.selectedNodeId) {
                  nodeIsGroupNode = true;
                }
              });

            let someNodeGroupIsSelected = that.selectedNodeGroup ? true : false;
            let selectedNodeIsInSelectedGroup = false;
            if (
              that.selectedNodeGroup &&
              that.selectedNodeId &&
              that.selectedNodeGroup.nodeIds.includes(that.selectedNodeId)
            )
              selectedNodeIsInSelectedGroup = true;

            const baseNodeContextMenuItems = [
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
            ];

            const notInNodeGroupContextMenuItems = [
              {
                label: "Start node group",
                handler: async function() {
                  let node = that.storeData.nodes.find(
                    n => n.id == that.selectedNodeId
                  );
                  let nodeGroup = await that.createNodeGroup({
                    nodeId: that.selectedNodeId,
                    groupName: node.name
                  });
                  that.$store.commit("ui/setSelectedNodeGroup", nodeGroup);
                  //TODO: set nodeGroup as expanded
                  let expandedNodeGroups = [...that.expandedNodeGroups];
                  expandedNodeGroups.push(nodeGroup.id);
                  that.expandedNodeGroups = expandedNodeGroups;
                }
              }
            ];

            const addToSelectedNodeGroupMenuItems = [
              {
                label: "Add to selected group",
                handler: async function() {
                  await that.addToNodeGroup({
                    nodeId: that.selectedNodeId,
                    nodeIsGroupNode: nodeIsGroupNode,
                    nodeGroupId: that.selectedNodeGroup.id
                  });
                }
              }
            ];

            const selectedNodeIsGroupNodeMenuItems = [
              {
                label: "Expand group",
                handler: async function() {
                  let expandedNodeGroups = [...that.expandedNodeGroups];
                  expandedNodeGroups.push(that.selectedNodeId);
                  that.expandedNodeGroups = expandedNodeGroups;
                }
              }
            ];

            const selectedInNodeGroupMenuItems = [
              {
                label: "Remove from group",
                handler: async function() {
                  await that.removeNodeFromGroup({
                    nodeId: that.selectedNodeId,
                    nodeIsGroupNode: nodeIsGroupNode,
                    nodeGroupId: that.selectedNodeGroup.id
                  });
                }
              },
              {
                label: "Collapse group",
                handler: async function() {
                  let expandedNodeGroups = [...that.expandedNodeGroups];
                  const index = that.expandedNodeGroups.indexOf(
                    that.selectedNodeGroup.id
                  );
                  if (index > -1) {
                    expandedNodeGroups.splice(index, 1);
                    that.expandedNodeGroups = expandedNodeGroups;
                  }
                }
              },
              {
                label: "Disband group",
                handler: async function() {
                  //TODO: ask for user to confirm
                  await that.disbandNodeGroup(that.selectedNodeGroup.id);
                }
              }
            ];

            let items = [];
            if (!nodeIsGroupNode) items.push(...baseNodeContextMenuItems);
            if (!nodeIsInGroup) items.push(...notInNodeGroupContextMenuItems);
            //TODO: modify condition below to exclude if selected group node is selected group
            if (
              !nodeIsInGroup &&
              someNodeGroupIsSelected &&
              that.selectedNodeGroup.id != that.selectedNodeId
            )
              items.push(...addToSelectedNodeGroupMenuItems);
            if (selectedNodeIsInSelectedGroup)
              items.push(...selectedInNodeGroupMenuItems);
            if (nodeIsGroupNode)
              items.push(...selectedNodeIsGroupNodeMenuItems);
            return items;
          }

          let nodeContextMenuItems = composeNodeContextMenuItems();
          let nodeContextMenu = that
            .contextMenu()
            .items(...nodeContextMenuItems);
          nodeContextMenu(d3.mouse(svg.node())[0], d3.mouse(svg.node())[1], d);
        })
        //.on("click", this.nodeClick);
        .on("click", function(d, i) {
          that.nodeClick(d, i, "regularClick");
        });
      this.updateNodeClassAndText(false);

      // Add 'marker-end' attribute to each path
      svg
        .selectAll("g")
        .selectAll("path.link")
        .attr("marker-end", "url(#end)");
      svg
        .selectAll("g")
        .selectAll("path.link.unused")
        .attr("marker-end", "url(#end-unused)");
      svg
        .selectAll("g")
        .selectAll("path.link.relaxed")
        .attr("marker-end", "url(#end-relaxed)");
      svg
        .selectAll("g")
        .selectAll("path.link.unused.relaxed")
        .attr("marker-end", "url(#end-unused-relaxed)");

      if (restartForceSimulation) {
        this.simulation.on("end", this.savePositions);
        this.iterationCount = 0;
        this.simulation.alpha(1).restart();
      }
    },
    updateNodeClassAndText(restartSimulation, alpha) {
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
            d.isNodeGroup &&
              this.selectedNodeGroup &&
              d.id == this.selectedNodeGroup.id
              ? " nodeGroupSelected"
              : ""
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

      if (restartSimulation && alpha > this.simulation.alpha()) {
        this.simulation.alpha(alpha).restart();
      }
    },
    updateForces() {
      const { simulation, forceProperties, iterationCount } = this;
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
      /*simulation
        .force("collide")
        .strength(forceProperties.collide.strength)
        //.radius(forceProperties.collide.radius)
        .iterations(forceProperties.collide.iterations);*/
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
        .strength(d => {
          return forceProperties.link.strength * d.strengthFactor;
        })
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
        dragStartTime = new Date();
        this.simulation.alphaTarget(0.3).restart();
      }
      d.fx = d.x;
      d.fy = d.y;
    },
    nodeDragged(d) {
      d.fx = d3.event.x;
      d.fy = d3.event.y;
      this.simulation.alphaTarget(0.3).restart();
    },
    nodeDragEnded(d) {
      if (!d3.event.active) {
        //if dragged for more than 300ms, then save the final position
        dragEndTime = new Date();
        if (dragEndTime - dragStartTime > 300)
          this.simulation.on("end", this.savePositions);
        this.simulation.alphaTarget(0);
      }
      d.fx = null;
      d.fy = null;
    },
    nodeMouseOver(d) {
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
    },
    nodeMouseOut(d) {
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
    },
    nodeClick(d, i, clickType) {
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
          this.currentModel.nodeGroups.forEach(function(nodeGroup) {
            if (
              (nodeGroup.hasOwnProperty("nodeIds") &&
                nodeGroup.nodeIds.includes(d.id)) ||
              nodeGroup.id == d.id
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
        this.updateNodeClassAndText(false);
      }
    },
    contextMenu(hostD) {
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

      function menu(x, y, hostD) {
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
          //d3.select("svg")
          svg
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
    wrap(texts, width) {
      texts.each(function() {
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
        dy = -0.5 - lines.length / 2 - 0.2;
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
        modelId: this.$route.params.modelId
      });
      this.$emit("close");
    }
  },

  watch: {
    forceProperties: {
      handler(newForce) {
        this.updateForces();
      },
      deep: true
    },

    selectedNodeGroup: {
      deep: true,
      handler() {
        this.updateNodeClassAndText(true, 0.001);
      }
    },

    nodeGroups: {
      deep: true,
      handler(nodeGroups) {
        if (nodeGroups && this.selectedNodeGroup) {
          let nodeGroup = nodeGroups.find(
            ng => ng.id == this.selectedNodeGroup.id
          );
          this.$store.commit("ui/setSelectedNodeGroup", nodeGroup);
        }
      }
    },

    // watcher for store nodes
    nodes: {
      immediate: true,
      deep: true,
      handler(/*newNodes, oldNodes*/) {
        //console.log('nodes changed');
        if (this.nodes && this.currentModel) {
          //console.log('nodes watcher calling prepD3DataAndUpdate')
          this.prepD3DataAndUpdate();
        }
      }
    },

    links: {
      immediate: true,
      deep: true,
      handler(newLinks, oldLinks) {
        this.prepD3DataAndUpdate();
      }
    },

    expandedNodeGroups: {
      immediate: true,
      deep: true,
      handler(newExpandedGroups, oldExpandedGroups) {
        if (this.nodes && this.currentModel && oldExpandedGroups) {
          let idOfNodeGroupToSelect;
          let newlyExpandedGroups = newExpandedGroups.filter(
            g => !oldExpandedGroups.includes(g)
          );
          let newlyExpandedGroupId = newlyExpandedGroups[0]; //at most one match expected

          let newlyCollapsedGroups = oldExpandedGroups.filter(
            g => !newExpandedGroups.includes(g)
          );
          let newlyCollapsedGroupId = newlyCollapsedGroups[0]; //at most one match expected

          //set newly expanded or collapsed group as selected group
          if (newlyExpandedGroupId)
            idOfNodeGroupToSelect = newlyExpandedGroupId;
          if (newlyCollapsedGroupId)
            idOfNodeGroupToSelect = newlyCollapsedGroupId;
          let nodeGroupToSelect = this.currentModel.nodeGroups.find(
            ng => ng.id == idOfNodeGroupToSelect
          );
          this.$store.commit("ui/setSelectedNodeGroup", nodeGroupToSelect);

          //notify prepD3DataAndUpdate with newly expanded node group
          this.prepD3DataAndUpdate({ newlyExpandedGroupId });
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
  stroke: #e77;
}
path.link.relaxed {
  stroke: #eee;
}
path.link.unused.relaxed {
  stroke: #fdd;
}

circle {
  stroke-width: 0px;
}
circle.unlinked {
  fill: #ebc890;
  stroke: rgb(224, 163, 89);
}
circle.state {
  fill: #aac5d6;
  stroke: #4a84a5;
}
circle.output {
  fill: #d1c4e9;
  stroke: #9575cd;
}
circle.input {
  fill: #b9df99;
  stroke: #91b177;
}
circle.group {
  fill: #e0e0e0;
  stroke: #666;
}
circle.new,
circle.noFormula,
circle.selfBlocking {
  stroke-width: 1px;
  stroke: #e77;
}

circle.selected {
  animation: selected 1s infinite alternate ease-in-out;
}

circle.nodeGroupSelected {
  stroke: #666;
  stroke-width: 1.5px;
}

@keyframes selected {
  from {
    stroke-width: 5px;
  }
  to {
    stroke-width: 2px;
  }
}

text {
  font: 10px sans-serif;
  pointer-events: none;
  fill: #333;
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
