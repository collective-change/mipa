<template>
  <svg width="400" height="400" class="influence-diagram" />
</template>

<script>
import BaseChart from "vue-d3-basechart";
import * as d3 from "d3";
import * as sizeof from "object-sizeof";
import { responsify } from "src/functions/function-responsify-svg";

export default BaseChart.extend({
  name: "influence-diagram",
  props: ["nodes", "links"],
  methods: {
    renderChart() {
      console.log("InfluenceDiagram renderChart()");

      //var data = this.chartData;
      var nodes = Object.values(this.nodes);
      var initialWidth = 500;
      var initialHeight = 500;
      console.log({ nodes });
      console.log("nodes size: ", sizeof(nodes));

      // var x = d3
      //   .scaleLinear()
      //   .domain([0, d3.max(data)])
      //   .range([0, width]);

      var chart = d3
        .select(this.$el)
        .attr("width", initialWidth)
        .attr("height", initialHeight)
        .call(responsify);
      console.log("I ", { chart });

      var d = chart.selectAll("g").data(nodes);
      console.log("I ", { d });

      d.exit().remove();

      var g = d
        .enter()
        .append("g")
        .merge(d)
        .attr("transform", function(d, i) {
          return "translate(0," + i * 20 + ")";
        });
      var cx = Math.random(400);
      var cy = Math.random(400);
      g.selectAll("circle").remove();
      g.selectAll("circle").remove();
      g.append("circle")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", 20);
      g.append("text")
        .attr("x", function(d) {
          return cx + 20;
        })
        .attr("y", cy)
        .attr("dy", ".35em")
        .text(function(d) {
          return d;
        });
    }
  },
  watch: {
    chartData: "renderChart",
    barHeight: "renderChart"
  }
});
</script>

<style lang="scss" scoped>
#influence-diagram {
  width: 100%;
  height: 400px;
  position: relative;
  border-color: gray;
  border-width: 1px;
  border-style: solid;
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