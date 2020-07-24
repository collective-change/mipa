<template>
  <div>
    <div id="actionsChart" style="position: relative"></div>
    <!--<svg
      id="actionsChart"
      :width="svgWidth"
      :height="svgHeight"
      style="border: black; border-style: solid; border-width: 0px"
    /> -->

    <q-dialog v-model="showAddAction">
      <add-action @close="showAddAction = false" />
    </q-dialog>
  </div>
</template>

<script>
import { mapGetters, mapState, mapActions } from "vuex";
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";
import { formatNumber } from "src/utils/util-formatNumber";
import * as d3 from "d3";
import { responsify } from "src/utils/util-responsify-svg";

var svgWidth = 800,
  svgHeight = 800,
  margin = { top: 40, right: 150, bottom: 60, left: 35 },
  width = svgWidth - margin.left - margin.right,
  height = svgHeight - margin.top - margin.bottom;

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
      svg: null,
      svgWidth: svgWidth,
      svgHeight: svgHeight,
      selections: {},
      d3Data: {}
    };
  },

  mounted() {
    //set up svg
    this.svg = d3
      .select("#actionsChart")
      .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
    //.call(responsify);

    var defs = this.svg.append("defs");

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

    chartableActions() {
      return this.actions
        .filter(action => action.actionLeverage > 0 && action.estEffortHrs > 0)
        .sort(function(a, b) {
          return b.totalDirectCost - a.totalDirectCost;
        });
    }
  },

  methods: {
    formatNumber,

    bubbleClick(d, i, clickType) {
      const bubbles = this.svg.selectAll(".bubble");
      console.log("bubbles", bubbles);

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
    }
  },

  watch: {
    chartableActions: function(newActions, oldActions) {
      if (newActions.length == 0) return;

      let that = this;

      let maxEstEffortHrs = Math.max.apply(
        Math,
        newActions.map(function(a) {
          return a.estEffortHrs;
        })
      );
      let minEstEffortHrs = Math.min.apply(
        Math,
        newActions.map(function(a) {
          return a.estEffortHrs;
        })
      );
      let maxActionLeverage = Math.max.apply(
        Math,
        newActions.map(function(a) {
          return a.actionLeverage;
        })
      );
      let minActionLeverage = Math.min.apply(
        Math,
        newActions.map(function(a) {
          return a.actionLeverage;
        })
      );
      let maxTotalDirectCost = Math.max.apply(
        Math,
        newActions.map(function(a) {
          return a.totalDirectCost;
        })
      );
      /*let minTotalDirectCost = Math.min.apply(
        Math,
        newActions.map(function(a) {
          return a.totalDirectCost;
        })
      );*/

      // Add X axis
      var x = d3
        .scaleLog()
        .domain([minEstEffortHrs * 0.9, maxEstEffortHrs * 1.1])
        .range([0, width]);
      this.svg
        .append("g")
        .attr("transform", "translate(0," + height + ")")
        .call(d3.axisBottom(x).ticks(3));

      // Add X axis label:
      this.svg
        .append("text")
        .attr("text-anchor", "end")
        .attr("x", width)
        .attr("y", height + 50)
        .text("Effort");

      // Add Y axis
      var y = d3
        .scaleLog()
        .domain([minActionLeverage * 0.9, maxActionLeverage * 1.1])
        .range([height, 0]);
      this.svg.append("g").call(d3.axisLeft(y));

      // Add Y axis label:
      this.svg
        .append("text")
        .attr("text-anchor", "end")
        .attr("x", 0)
        .attr("y", -20)
        .text("Leverage")
        .attr("text-anchor", "start");

      // Add a scale for bubble size
      var z = d3
        //.scaleSqrt()
        .scalePow()
        .exponent(1 / 3)
        .domain([0, maxTotalDirectCost])
        .range([0, 100]);

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
        console.log("showTooltip");
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
      this.svg
        .append("g")
        .selectAll("dot")
        .data(newActions)
        .enter()
        .append("circle")
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
          return z(d.totalDirectCost);
        })
        .on("mouseover", showTooltip)
        .on("mousemove", moveTooltip)
        .on("mouseleave", hideTooltip)
        .on("click", function(d, i) {
          that.bubbleClick(d, i, "regularClick");
        });
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
@keyframes selected {
  from {
    stroke-width: 5px;
  }
  to {
    stroke-width: 2px;
  }
}
</style>
