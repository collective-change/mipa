<template>
  <div>
    <div id="actionsChart"></div>
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
import { mapGetters, mapState } from "vuex";
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";
import { formatNumber } from "src/utils/util-formatNumber";
import * as d3 from "d3";
import { responsify } from "src/utils/util-responsify-svg";

var svgWidth = 800,
  svgHeight = 800,
  margin = { top: 40, right: 150, bottom: 60, left: 30 },
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
    //this.selections.svg = d3.select(this.$el.querySelector("svg#actionsChart"));
    //var svg = this.selections.svg;

    /*var margin = { top: 40, right: 150, bottom: 60, left: 30 },
      width = this.svgWidth - margin.left - margin.right,
      height = this.svgHeight - margin.top - margin.bottom;*/

    this.svg = d3
      .select("#actionsChart")
      .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
    //.call(responsify);
  },

  computed: {
    //...mapGetters("settings", ["settings"]),
    ...mapState("actions", ["actions"]),
    ...mapState("uiAction", ["uiActionChanged"]),
    ...mapState("ui", ["selectedActionId"]),

    chartableActions() {
      return this.actions.filter(
        action => action.actionLeverage > 0 && action.estEffortHrs > 0
      );
    }
  },

  methods: {
    formatNumber
  },

  watch: {
    chartableActions: function(newActions, oldActions) {
      if (newActions.length == 0) return;
      let maxEstEffortHrs = Math.max.apply(
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
      let maxTotalDirectCost = Math.max.apply(
        Math,
        newActions.map(function(a) {
          return a.totalDirectCost;
        })
      );

      // Add X axis
      var x = d3
        .scaleLog()
        .domain([1, maxEstEffortHrs])
        .range([0, width]);
      this.svg
        .append("g")
        .attr("transform", "translate(0," + height + ")")
        //.attr("transform", "translate(0,700)")
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
        .domain([1, maxActionLeverage])
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
        .scaleSqrt()
        .domain([1, maxTotalDirectCost])
        .range([2, 50]);

      // Add dots

      this.svg
        .append("g")
        .selectAll("dot")
        .data(newActions)
        .enter()
        .append("circle")
        .attr("cx", function(d) {
          return x(d.estEffortHrs);
        })
        .attr("cy", function(d) {
          return y(d.actionLeverage);
        })
        .attr("r", function(d) {
          return z(d.totalDirectCost);
        })
        .style("fill", "#69b3a2")
        .style("opacity", "0.7")
        .attr("stroke", "black");
    }
  }
};
</script>

<style>
.bubbles {
  stroke-width: 1px;
  stroke: black;
  opacity: 0.8;
}
.bubbles:hover {
  stroke: black;
}
</style>
