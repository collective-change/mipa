<template>
  <div>
    <q-btn
      @click="exportCalcResults()"
      class="all-pointer-events print-hide"
      color="primary"
    >{{ buttonLabel }}</q-btn>
  </div>
</template>

<script>
import { mapGetters, mapState } from "vuex";

export default {
  props: ["dataSource", "actionId", "actionTitle", "buttonLabel"],
  components: {},
  data() {
    return {};
  },
  computed: {
    ...mapState("orgs", ["currentOrg"]),
    ...mapState("model", ["currentModel"]),
    ...mapGetters("model", ["nodes"]),
    ...mapState("calcResults", ["baseline", "resultsOfAction"])
  },
  methods: {
    async exportCalcResults() {
      let modelId = this.$route.params.modelId
        ? this.$route.params.modelId
        : this.$route.params.orgId;
      let tsvContent = "data:text/tab-separated-values;charset=utf-8,";
      let calcDate = new Date(1970, 0, 1);
      let filename = "";
      switch (this.dataSource) {
        case "baseline":
          tsvContent += prepBaselineArray(this.baseline, this.nodes)
            .map(e => e.join("\t"))
            .join("\n");
          calcDate.setSeconds(this.baseline.calcDate / 1000);
          filename =
            this.currentOrg.name.replace(" ", "-") +
            "_" +
            this.currentModel.name.replace(" ", "-") +
            "_" +
            this.dataSource +
            "_" +
            calcDate.toISOString() +
            ".tsv";
          break;
        case "resultsOfAction":
          await this.$store.dispatch(
            "calcResults/loadResultsOfAction",
            this.actionId
          );
          tsvContent += prepResultsOfActionArray(
            this.resultsOfAction,
            this.nodes
          )
            .map(e => e.join("\t"))
            .join("\n");
          calcDate.setSeconds(this.resultsOfAction.calcDate / 1000);
          filename =
            this.currentOrg.name.replace(" ", "-") +
            "_" +
            this.dataSource +
            "_" +
            this.actionTitle +
            "_" +
            calcDate.toISOString() +
            ".tsv";
          break;
        default:
          throw `Data source "${this.dataSource}" not recognized.`;
      }

      let encodedUri = encodeURI(tsvContent);
      var link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", filename);
      document.body.appendChild(link); // Required for FF
      link.click(); // This will download the data file named [dataSource].tsv.
    }
  },
  created() {},
  mounted() {},
  beforeDestroy() {}
};

function prepBaselineArray(calcResults, nodes) {
  let tempRow = [];
  let rows = [];
  //sort nodes by name
  let sortedNodes = nodes.sort(sortByName);

  //compose header row
  tempRow = [
    "Name",
    "Symbol",
    "Unit",
    "Node ID",
    "Latest value",
    "Result type",
    ...calcResults.timeSPoints.map(s => {
      let date = new Date(1970, 0, 1);
      date.setSeconds(s);
      return date.toISOString();
    })
  ];
  rows.push(tempRow);

  //compose values rows
  sortedNodes.forEach(function(node) {
    tempRow = [
      node.name,
      node.symbol,
      node.unit,
      node.id,
      node.latestValue,
      "baseline",
      ...calcResults.nodesValues[node.id]
    ];
    rows.push(tempRow);
  });

  return rows;
}

function prepResultsOfActionArray(calcResults, nodes) {
  let tempRow = [];
  let rows = [];
  //sort nodes by name
  let sortedNodes = nodes.sort(sortByName);

  //compose header row
  tempRow = [
    "Name",
    "Symbol",
    "Unit",
    "Node ID",
    "Latest value",
    "Result type",
    ...calcResults.timeSPoints.map(s => {
      let date = new Date(1970, 0, 1);
      date.setSeconds(s);
      return date.toISOString();
    })
  ];
  rows.push(tempRow);

  //compose values rows
  sortedNodes.forEach(function(node) {
    composeActionResultsValueRow(
      node,
      "baseline",
      calcResults.baselineNodesValues,
      rows
    );
    composeActionResultsValueRow(
      node,
      "if done",
      calcResults.ifDoneNodesValues,
      rows
    );
    composeActionResultsValueRow(
      node,
      "if not done",
      calcResults.ifNotDoneNodesValues,
      rows
    );
  });

  return rows;
}

function composeActionResultsValueRow(
  node,
  nodesValuesType,
  nodesValues,
  rows
) {
  if (node.id in nodesValues) {
    rows.push([
      node.name,
      node.symbol,
      node.unit,
      node.id,
      node.latestValue,
      nodesValuesType,
      ...nodesValues[node.id]
    ]);
  }
}

function sortByName(a, b) {
  if (a.name < b.name) {
    return -1;
  }
  if (a.name > b.name) {
    return 1;
  }
  return 0;
}
</script>
