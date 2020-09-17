<template>
  <div style="position: relative;">
    <div id="actionsChart" style="position: relative;"></div>
    <!--<q-dialog v-model="showAddAction">
      <add-action @close="showAddAction = false" />
    </q-dialog>-->
  </div>
</template>

<script>
import { mapGetters, mapState, mapActions } from "vuex";
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";
import { formatNumber } from "src/utils/util-formatNumber";
import * as d3 from "d3";
import { responsify } from "src/utils/util-responsify-svg";

var svgWidth = 1000,
  svgHeight = 600,
  margin = { top: 40, right: 90 /*150*/, bottom: 60, left: 35 },
  width = svgWidth - margin.left - margin.right,
  height = svgHeight - margin.top - margin.bottom,
  axisBuffer = 0.1;
var maxEstEffortHrs = null,
  minEstEffortHrs = null,
  maxActionLeverage = null,
  minActionLeverage = null,
  maxTotalDirectCost = null;

export default {
  components: {
    "add-action": require("components/Actions/Modals/AddAction.vue").default,
    "calculator-ui": require("components/Calc/CalculatorUi.vue").default
  },
  data() {
    return {
      showAddAction: false,
      loading: false,
      filter: "",
      svgInner: null,
      svgWidth: svgWidth,
      svgHeight: svgHeight,
      maxRadius: 100,
      selections: {},
      d3Data: {}
    };
  },

  mounted() {
    //set up svg
    this.svgInner = d3
      .select("#actionsChart")
      .append("svg")
      .attr("id", "actionsChartSvg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      //.call(responsify)
      .append("g")
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    //d3.select("#actionsChartSvg").call(responsify);

    var defs = this.svgInner.append("defs");

    var arrowMarker = defs
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
      .attr("fill", "#ff9b9b")
      .attr("orient", "auto")
      .append("svg:path")
      .attr("d", "M0,-5L10,0L0,5");

    var gradient = defs
      .append("radialGradient")
      .attr("id", "sphereGradient")
      .attr("cx", "40%")
      .attr("cy", "40%")
      .attr("r", "50%")
      .attr("fx", "40%")
      .attr("fy", "40%");

    gradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "rgb(255,255,255)")
      .attr("stop-opacity", 1);

    gradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "#69b3a2")
      .attr("stop-opacity", 1);
  },

  computed: {
    //...mapGetters("settings", ["settings"]),
    ...mapState("actions", ["actions"]),
    ...mapState("uiAction", ["uiActionChanged"]),
    ...mapState("ui", ["selectedActionId"]),
    ...mapGetters("actions", ["blockingRelationships"]),

    chartableActions() {
      if (this.blockingRelationships)
        return this.actions
          .filter(
            action => action.actionLeverage > 0 && action.estEffortHrs > 0
          )
          .sort(function(a, b) {
            return b.totalDirectCost - a.totalDirectCost;
          });
      else return [];
    }
  },

  methods: {
    formatNumber,

    bubbleClick(d, i, clickType) {
      const bubbles = this.svgInner.selectAll(".bubble");

      if (this.uiActionChanged) {
        this.$q
          .dialog({
            title: "Unsaved changes",
            message:
              "Any changes you made will be lost. Really switch to another action?",
            cancel: true,
            persistent: true
          })

          .onOk(() => {
            this.$store.dispatch("ui/setSelectedActionId", d.id);
            bubbles.classed("selected", false);
            bubbles.filter(td => td === d).classed("selected", true);
          });
      } else {
        this.$store.dispatch("ui/setSelectedActionId", d.id);
        bubbles.classed("selected", false);
        bubbles.filter(td => td === d).classed("selected", true);
      }
    },

    getBlockingLinks(blockingRelationships) {
      let links = [];
      blockingRelationships.forEach(relationship => {
        let blockerSouth = this.getPole(relationship.blockerId, "south");
        let blockeeNorth = this.getPole(relationship.blockeeId, "north");
        let source = blockerSouth
          ? blockerSouth
          : [blockeeNorth[0], blockeeNorth[1] - 30];
        let target = blockeeNorth
          ? blockeeNorth
          : [blockerSouth[0], blockerSouth[1] + 30];

        links.push({ source, target });
      });
      return links;
    },

    getPole(actionId, direction) {
      let sign = 1;
      switch (direction) {
        case "north":
          sign = -1;
          break;
        case "south":
          sign = 1;
          break;
        default:
          throw new error(`Direction "${direction}" not supported.`);
      }
      let action = this.chartableActions.find(a => a.id == actionId);
      if (action) {
        let xVal = d3
          .scaleLog()
          .domain([
            minEstEffortHrs / (1 + axisBuffer),
            maxEstEffortHrs * (1 + axisBuffer)
          ])
          .range([0, width])
          .call(this, action.estEffortHrs);

        let yVal = d3
          .scaleLog()
          .domain([
            minActionLeverage / (1 + axisBuffer),
            maxActionLeverage * (1 + axisBuffer)
          ])
          .range([height, 0])
          .call(this, action.actionLeverage);
        let rVal = d3
          .scalePow()
          .exponent(1 / 3)
          .domain([0, maxTotalDirectCost])
          .range([0, 100])
          .call(this, action.totalDirectCost);
        return [xVal, yVal + sign * rVal];
      } else return null;
    },
    wrap(texts /*, xwidth*/) {
      texts.each(function() {
        var text = d3.select(this),
          action = text.data(),
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
          width =
            2 *
            d3
              .scalePow()
              .exponent(1 / 3)
              .domain([0, maxTotalDirectCost])
              .range([0, 100])
              .call(this, action[0].totalDirectCost),
          textSize = width / 8,
          tspan = text
            .text(null)
            .append("tspan")
            .attr("x", x)
            .attr("font-size", `${textSize}px`)
            .attr("y", y)
            .attr("dy", dy + "em");
        //console.log("totalDirectCost", action[0].totalDirectCost);
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
        dy = -0.5 - lines.length / 2;
        while ((line = lines.pop())) {
          tspan = text
            .append("tspan")
            .attr("font-size", `${textSize}px`)
            .attr("x", x)
            .attr("y", y)
            .attr("dy", Number(++lineNumber * lineHeight + dy) + "em")
            .text(line);
        }
      });
    }
  },

  watch: {
    chartableActions: function(newActions, oldActions) {
      if (this.chartableActions.length == 0) return;

      let that = this;

      maxEstEffortHrs = Math.max.apply(
        Math,
        newActions.map(function(a) {
          return a.estEffortHrs;
        })
      );
      minEstEffortHrs = Math.min.apply(
        Math,
        newActions.map(function(a) {
          return a.estEffortHrs;
        })
      );
      maxActionLeverage = Math.max.apply(
        Math,
        newActions.map(function(a) {
          return a.actionLeverage;
        })
      );
      minActionLeverage = Math.min.apply(
        Math,
        newActions.map(function(a) {
          return a.actionLeverage;
        })
      );
      maxTotalDirectCost = Math.max.apply(
        Math,
        newActions.map(function(a) {
          return a.totalDirectCost;
        })
      );

      // Add X axis
      var x = d3
        .scaleLog()
        .domain([
          minEstEffortHrs / (1 + axisBuffer),
          maxEstEffortHrs * (1 + axisBuffer)
        ])
        .range([0, width]);
      this.svgInner
        .append("g")
        .attr("transform", "translate(0," + height + ")")
        .call(d3.axisBottom(x).ticks(3));

      // Add X axis label:
      this.svgInner
        .append("text")
        .attr("text-anchor", "end")
        .attr("x", width)
        .attr("y", height + 40)
        .text("Outstanding direct effort hrs");

      // Add Y axis
      var y = d3
        .scaleLog()
        .domain([
          minActionLeverage / (1 + axisBuffer),
          maxActionLeverage * (1 + axisBuffer)
        ])
        .range([height, 0]);
      this.svgInner.append("g").call(d3.axisLeft(y));

      // Add Y axis label:
      this.svgInner
        .append("text")
        .attr("text-anchor", "middle")
        .attr("x", 0)
        .attr("y", -20)
        .text("Leverage");
      //.attr("text-anchor", "start");

      // Add a scale for bubble size
      var r = d3
        //.scaleSqrt()
        .scalePow()
        .exponent(1 / 3)
        .domain([0, maxTotalDirectCost])
        .range([0, this.maxRadius]);

      //add links
      var blockingLinkGen = function(d) {
        let x0 = d.source[0],
          y0 = d.source[1],
          x1 = d.source[0],
          y1 = d.source[1] + 100,
          x2 = d.target[0],
          y2 = d.target[1] - 100,
          x = d.target[0],
          y = d.target[1];
        return `M${x0},${y0} C${x1},${y1} ${x2},${y2} ${x},${y}`;
      };

      let blockingLinkData = this.getBlockingLinks(this.blockingRelationships);
      //console.log("blockingLinkData", blockingLinkData);

      this.svgInner
        .selectAll(".blockingLink")
        .data(blockingLinkData)
        .join("path")
        .attr("d", blockingLinkGen)
        .attr(
          "class",
          d => "blockingLink " + (d.isBlocking ? "isblocking " : "notBlocking ")
        )
        .attr("marker-end", "url(#end)");

      // Create a tooltip div that is hidden by default:
      var tooltip = d3
        .select("#actionsChart")
        .append("div")
        .style("opacity", 0)
        .attr("class", "tooltip")
        .style("position", "absolute")
        .style("background-color", "LightGray")
        .style("border-radius", "5px")
        .style("padding", "5px")
        .style("color", "black");

      // Create 3 functions to show / update (when mouse move but stay on same circle) / hide the tooltip
      var showTooltip = function(d) {
        tooltip.transition().duration(200);
        tooltip
          .style("opacity", 1)
          .html(d.title)
          .style("left", d3.mouse(this)[0] + margin.left - 0 + "px")
          .style("top", d3.mouse(this)[1] + margin.top + 20 + "px");
      };
      var moveTooltip = function(d) {
        tooltip
          .style("left", d3.mouse(this)[0] + margin.left - 0 + "px")
          .style("top", d3.mouse(this)[1] + margin.top + 20 + "px");
      };
      var hideTooltip = function(d) {
        tooltip
          //.transition()
          //.duration(200)
          .style("opacity", 0);
      };

      // Add bubbles
      this.svgInner.selectAll(".bubble").remove();
      this.svgInner
        .append("g")
        .selectAll(".bubble")
        .data(this.chartableActions)
        .enter()
        .append("circle")
        .attr("id", function(d) {
          return d.id;
        })
        .attr("class", function(d) {
          return "bubble "; /*+ d.continent*/
        })
        .attr("cx", function(d) {
          return x(d.estEffortHrs);
        })
        .attr("cy", function(d) {
          return y(d.actionLeverage);
        })
        .attr("r", function(d) {
          return r(d.totalDirectCost);
        })
        .on("mouseover", showTooltip)
        .on("mousemove", moveTooltip)
        .on("mouseleave", hideTooltip)
        .on("click", function(d, i) {
          that.bubbleClick(d, i, "regularClick");
        });

      this.svgInner.selectAll(".actionTitle").remove();
      this.svgInner
        .selectAll("text .actionTitle")
        .data(this.chartableActions)
        .enter()
        .append("text")
        .classed("actionTitle", true)
        //.attr("x", 0)
        //.attr("y", "0.31em")
        .attr("text-anchor", "middle")
        .text(
          d =>
            d.title /*.concat(
            d.isSelfBlocking ? " (self-blocking)" : "",
            d.isNew ? " (new)" : "",
            d.symbolFormula ? "" : " (no formula)"
          )*/
        )
        .attr("x", (d, i) => x(d.estEffortHrs))
        .attr("y", (d, i) => y(d.actionLeverage))
        .attr("cursor", "default")
        .call(this.wrap /*this.maxRadius*/)
        .on("click", function(d, i) {
          that.bubbleClick(d, i, "regularClick");
        });
    },

    selectedActionId: function() {
      const bubbles = this.svgInner.selectAll(".bubble");
      bubbles.classed("selected", false);
      bubbles
        .filter(td => td.id == this.selectedActionId)
        .classed("selected", true);
    }
  }
};
</script>

<style>
.bubble {
  fill: url(#sphereGradient);
  stroke: #025e48;
  stroke-width: 0px;
  opacity: 0.7;
}
.bubble:hover {
  stroke: #025e48;
  stroke-width: 1.5px;
}
.bubble.selected {
  animation: selected 1s infinite alternate ease-in-out;
}
.blockingLink {
  stroke: #faa8a8;
  stroke-width: 5px;
  fill: none;
}
@keyframes selected {
  from {
    stroke-width: 5px;
  }
  to {
    stroke-width: 2px;
  }
}
.actionTitle {
  pointer-events: none;
  fill: #333;
}
</style>
