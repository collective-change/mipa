#!/usr/bin/env node
// Lists node formulas whose meaning changes under the mathjs version the app
// now uses. Read-only: it never writes to Firestore.
//
// Usage:
//   node check.mjs --project <firebase-project-id> [--json]
//
// Credentials: Application Default Credentials (`gcloud auth
// application-default login`) or GOOGLE_APPLICATION_CREDENTIALS pointing to a
// service-account key. Set FIRESTORE_EMULATOR_HOST to run against an emulator.

import { parseArgs } from "node:util";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { compareFormula, versions } from "./compare.mjs";

const FIELDS = ["symbolFormula", "sysFormula"];

const { values } = parseArgs({
  options: {
    project: { type: "string" },
    json: { type: "boolean", default: false }
  }
});

const projectId =
  values.project || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) {
  console.error("Usage: node check.mjs --project <firebase-project-id> [--json]");
  process.exit(2);
}

initializeApp(
  process.env.FIRESTORE_EMULATOR_HOST
    ? { projectId }
    : { projectId, credential: applicationDefault() }
);
const db = getFirestore();

const modelNames = new Map();
async function modelName(modelRef) {
  if (!modelNames.has(modelRef.id)) {
    const snap = await modelRef.get();
    modelNames.set(modelRef.id, snap.exists ? snap.get("name") || "" : "(missing)");
  }
  return modelNames.get(modelRef.id);
}

const findings = [];
let nodeCount = 0;
let formulaCount = 0;

const snapshot = await db.collectionGroup("nodes").get();
for (const doc of snapshot.docs) {
  const modelRef = doc.ref.parent.parent;
  if (!modelRef || modelRef.parent.id !== "models") continue;
  nodeCount++;
  const node = doc.data();
  for (const field of FIELDS) {
    const formula = node[field];
    if (typeof formula !== "string" || formula.trim() === "") continue;
    formulaCount++;
    const change = compareFormula(formula);
    if (!change) continue;
    findings.push({
      modelId: modelRef.id,
      model: await modelName(modelRef),
      nodeId: doc.id,
      node: node.name || "",
      symbol: node.symbol || "",
      field,
      formula,
      ...change
    });
  }
}

if (values.json) {
  console.log(JSON.stringify({ versions, nodeCount, formulaCount, findings }, null, 2));
} else {
  console.log(
    `Checked ${formulaCount} formulas on ${nodeCount} nodes (mathjs ${versions.old} -> ${versions.new}).`
  );
  const byKind = Map.groupBy(findings, f => f.kind);
  if (!findings.length) console.log("No formulas change meaning.");
  for (const [kind, items] of byKind) {
    console.log(`\n== ${kind}: ${items.length} ==`);
    for (const f of items) {
      console.log(
        `\n[${f.model || f.modelId}] ${f.node} (${f.symbol}) - ${f.field}` +
          `\n  formula: ${f.formula}` +
          `\n  before:  ${f.before}` +
          `\n  after:   ${f.after}` +
          `\n  path:    models/${f.modelId}/nodes/${f.nodeId}`
      );
    }
  }
}

const changed = findings.filter(f => f.kind !== "invalid in both").length;
process.exit(changed ? 1 : 0);
