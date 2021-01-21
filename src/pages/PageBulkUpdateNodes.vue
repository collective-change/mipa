<template>
  <q-page padding>
    <div class="text-h5">
      <span v-if="currentOrg">{{ currentOrg.goal }}</span>
    </div>
    <div class="row q-pb-md">
      {{ currentModel ? currentModel.name : "" }}
      {{
      currentModel ? (currentModel.isOrgMainModel ? " (main)" : "") : ""
      }}
    </div>
    <div
      class="row q-pb-md"
    >This page helps you quickly update the latest values of nodes in your model. Follow the steps below.</div>
    <div class="row">
      <div class="col-12 col-md-3 print-hide"></div>

      <div class="col-12 col-md-6">
        <div class="q-pa-md">
          <p>Step 1. Copy and paste the update template into a spreadsheet.</p>
          <div class="column items-center">
            <q-btn
              color="primary"
              label="Copy update template to clipboard"
              @click="copyUpdateTemplateToClipboard()"
            />
          </div>
        </div>
        <div class="q-pa-md">
          <p>Step 2. Make your changes in the spreadsheet. You may change fields in any column except Node ID. Be careful, as your changes will not be validated before they are saved.</p>
        </div>

        <div class="q-pa-md">
          <p>Step 3. Copy and paste your edited version into the area below and submit.</p>
          <div>
            <q-input v-model="text" filled type="textarea" />
          </div>
          <div class="column items-center q-pa-md">
            <q-btn color="primary" label="Submit" @click="processInputTsvText()" />
          </div>
        </div>
      </div>
      <div class="col-12 col-md-3 print-hide"></div>
    </div>
  </q-page>
</template>

<script>
import { mapGetters, mapState } from "vuex";
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";
//import idb from "src/api/idb";
import { copyToClipboard } from "quasar";
import { showErrorMessage } from "src/utils/util-show-error-message";
import { stripScriptTags } from "src/utils/util-stripTags";

const parse = require("csv-parse/lib/sync");

export default {
  components: {},
  data() {
    return { text: "" };
  },
  computed: {
    ...mapState("orgs", ["currentOrg"]),
    ...mapState("model", ["currentModel"]),
    ...mapGetters("model", ["nodes"])
  },

  methods: {
    copyUpdateTemplateToClipboard() {
      let tsvContent = prepUpdateTemplate(this.nodes)
        .map(e => e.join("\t"))
        .join("\n");
      copyToClipboard(tsvContent)
        .then(() => {
          this.$q.notify("Template copied. Ready to paste into spreadsheet.");
        })
        .catch(() => {
          this.$q.notify({
            type: "warning",
            color: "warning",
            timeout: 1000,
            position: "center",
            message: "Oops. Something went wrong!"
          });
        });
    },

    processInputTsvText() {
      let records;
      try {
        records = parse(this.text, {
          bom: true,
          columns: true,
          delimiter: ["\t"],
          skip_empty_lines: true,
          trim: true
        });
      } catch (err) {
        console.log(err);
        showErrorMessage("Error parsing data", err.message);
      }

      //compare new records to existing data
      let errorOccurred = false;
      let changedNodes = [];
      let numChangedFields = 0;
      let numChangedNodes = 0;
      const fieldsToCompare = [
        { dbName: "name", tsvName: "Name" },
        { dbName: "symbol", tsvName: "Symbol" },
        { dbName: "unit", tsvName: "Unit" },
        { dbName: "symbolFormula", tsvName: "Formula" },
        { dbName: "latestValue", tsvName: "Latest value" }
      ];
      records.forEach((record, index) => {
        if (!errorOccurred) {
          let foundNode = this.nodes.find(node => node.id == record["Node ID"]);
          if (foundNode) {
            let originals = {};
            let changes = {};
            let latestValueExistenceChanged = false;
            let symbolChanged = false;
            //compare fields and add to updates array
            fieldsToCompare.forEach(field => {
              if (
                foundNode[field.dbName] !=
                  stripScriptTags(record[field.tsvName]) &&
                !(
                  typeof foundNode[field.dbName] == "undefined" &&
                  record[field.tsvName] == ""
                )
              ) {
                changes[field.dbName] = stripScriptTags(record[field.tsvName]);
                originals[field.dbName] = foundNode[field.dbName];
                if (field.dbName == "symbol") symbolChanged = true;
                if (field.dbName == "latestValue") {
                  let oldLatestVal = foundNode.latestValue;
                  let newLatestVal = stripScriptTags(record["Latest value"]);
                  let oldLatestValIsANumber =
                    typeof oldLatestVal != "undefined" &&
                    oldLatestVal !== "" &&
                    !isNaN(Number(oldLatestVal));
                  let newLatestValIsANumber =
                    typeof newLatestVal != "undefined" &&
                    newLatestVal !== "" &&
                    !isNaN(Number(newLatestVal));
                  latestValueExistenceChanged =
                    oldLatestValIsANumber != newLatestValIsANumber;
                }
                numChangedFields++;
              }
            });
            if (Object.keys(changes).length > 0) {
              changedNodes.push({
                id: foundNode.id,
                name: foundNode.name,
                originals,
                changes,
                latestValueExistenceChanged,
                symbolChanged
              });
              numChangedNodes++;
            }
            //dispatch store action to batch write to firestore
          } else {
            errorOccurred = true;
            showErrorMessage(
              "Error matching data",
              `Node ID not found: "${record["Node ID"]}" on line "${index + 2}"`
            );
          }
        }
      });
      if (errorOccurred) return;
      //console.log({ changedNodes });
      if (changedNodes.length) {
        this.confirmToUpdate({
          changedNodes,
          numChangedFields,
          numChangedNodes
        });
      } else showErrorMessage("No changes found", "The data has not changed.");
    },

    confirmToUpdate(payload) {
      let message = `Compared to database, ${payload.numChangedFields} change(s) found in ${payload.numChangedNodes} node(s):<br>`;
      message +=
        "<table> <tr> <th>Node</th> <th>Field</th> <th>Change</th> </tr>";
      payload.changedNodes.forEach(node => {
        for (const property in node.changes) {
          message += "<tr>";
          message += `<td class="text-nowrap">${node.name}</td>`;
          message += `<td>${property}</td>`;
          message += `<td>${node.originals[property]} → ${node.changes[property]}</td>`;
          message += "</tr>";
        }
      });
      message += "</table>";
      this.$q
        .dialog({
          title: "Confirm values to update",
          message: message,
          cancel: true,
          persistent: true,
          html: true
        })
        .onOk(() => {
          // console.log('>>>> OK')
          let payloadToStore = {
            modelId: this.currentModel.id,
            changedNodes: payload.changedNodes
          };
          this.$store.dispatch("model/updateNodes", payloadToStore);
        })
        .onOk(() => {
          // console.log('>>>> second OK catcher')
        })
        .onCancel(() => {
          // console.log('>>>> Cancel')
        })
        .onDismiss(() => {
          // console.log('I am triggered on both OK and Cancel')
        });
    }
  },

  watch: {},
  created() {
    (async () => {
      //console.log("waiting for currentUser to be defined");
      while (
        !firebaseAuth.currentUser // define the condition as you like
      )
        await new Promise(resolve => setTimeout(resolve, 200));
      //bind to list of models the org-user can view
      //(user is in model's owners, editors, or viewers)
      //this.$store.dispatch("orgs/bindReadableModels", this.$route.params.orgId);
      let modelId = this.$route.params.orgId;
      this.$store.dispatch("model/bindCurrentModel", modelId);
      this.$store.dispatch("model/bindNodes", modelId);
      this.$store.dispatch("adHocDocs/bindExchangeRates");
      this.$store.dispatch("calcResults/loadBaseline", modelId);
    })();
    //console.log("above code doesn't block main function stack");
  },
  mounted() {}
};

function prepUpdateTemplate(nodes) {
  let tempRow = [];
  let rows = [];
  let sortedNodes = JSON.parse(JSON.stringify(nodes)).sort(sortByName);

  //compose header row
  tempRow = ["Name", "Symbol", "Unit", "Formula", "Node ID", "Latest value"];
  rows.push(tempRow);

  //compose values rows
  sortedNodes.forEach(function(node) {
    tempRow = [
      node.name,
      node.symbol,
      node.unit,
      node.symbolFormula,
      node.id,
      node.latestValue
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

<style>
table {
  border: 1px solid #333;
}
td {
  padding: 5px;
}
tr:nth-child(even) {
  background-color: #eee;
}
</style>