<template>
  <div>
    <q-btn
      @click="exportSimResults()"
      class="all-pointer-events print-hide"
      color="primary"
    >{{ buttonLabel }}</q-btn>
  </div>
</template>

<script>
import { mapGetters, mapState } from "vuex";

export default {
  props: ["dataSource", "buttonLabel"],
  components: {},
  data() {
    return {};
  },
  computed: {
    ...mapState("orgs", ["currentOrg"]),
    ...mapState("model", ["currentModel"]),
    ...mapGetters("model", ["nodes"]),
    ...mapState("calcResults", ["baseline"])
  },
  methods: {
    exportSimResults() {
      let modelId = this.$route.params.modelId
        ? this.$route.params.modelId
        : this.$route.params.orgId;
      let tsvContent = "data:text/tab-separated-values;charset=utf-8,";
      let calcDate = new Date(1970, 0, 1);
      switch (this.dataSource) {
        case "baseline":
          tsvContent += prepBaselineArray(this.baseline, this.nodes)
            .map(e => e.join("\t"))
            .join("\n");
          calcDate.setSeconds(this.baseline.calcDate / 1000);
          break;
        default:
          throw `Data source "${this.dataSource}" not recognized.`;
      }

      let encodedUri = encodeURI(tsvContent);
      var link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute(
        "download",
        this.currentOrg.name.replace(" ", "-") +
          "_" +
          this.currentModel.name.replace(" ", "-") +
          "_" +
          this.dataSource +
          "_" +
          calcDate.toISOString() +
          ".tsv"
      );
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
    "Node ID",
    "Symbol",
    "Unit",
    "Name",
    ...calcResults.timeSPoints.map(s => {
      let date = new Date(1970, 0, 1);
      date.setSeconds(s);
      return date.toISOString();
    })
  ];
  rows.push(tempRow);

  //compose values rows
  let t;
  sortedNodes.forEach(function(node) {
    tempRow = [
      node.id,
      node.symbol,
      node.unit,
      node.name,
      ...calcResults.nodesValues[node.id]
    ];
    rows.push(tempRow);
  });

  return rows;
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
