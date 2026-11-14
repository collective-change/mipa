#!/usr/bin/env node
// Finds factors with non-ASCII (Chinese) symbols in Firestore models,
// plans meaningful English ASCII symbol replacements, updates all referring
// formulas in each model, and applies the changes cleanly.
//
// Usage:
//   node migrate.mjs [--project <id>] [--dry-run] [--apply] [--mappings <file>] [--dump-mappings <file>]
//
// By default, runs in DRY-RUN mode. Pass --apply to execute updates in Firestore.
// Credentials: Application Default Credentials (`gcloud auth application-default login`)
// or GOOGLE_APPLICATION_CREDENTIALS. Set FIRESTORE_EMULATOR_HOST to run against emulator.

import { parseArgs } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { planModelMigration } from "./lib.mjs";

let initializeApp, applicationDefault, cert, getFirestore, FieldValue;
try {
  ({ initializeApp, applicationDefault, cert } = await import("firebase-admin/app"));
  ({ getFirestore, FieldValue } = await import("firebase-admin/firestore"));
} catch {
  const { createRequire } = await import("node:module");
  const req = createRequire(path.resolve(process.cwd(), "functions/package.json"));
  ({ initializeApp, applicationDefault, cert } = req("firebase-admin/app"));
  ({ getFirestore, FieldValue } = req("firebase-admin/firestore"));
}

const { values } = parseArgs({
  options: {
    project: { type: "string" },
    key: { type: "string" },
    "dry-run": { type: "boolean" },
    apply: { type: "boolean", default: false },
    mappings: { type: "string" },
    "dump-mappings": { type: "string" }
  }
});

const isDryRun = values.apply ? false : (values["dry-run"] ?? true);
const projectId =
  values.project ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  "mipa-2";

console.log(`\n=== Mipa Symbol Migration ===`);
console.log(`Project: ${projectId}`);
console.log(`Mode:    ${isDryRun ? "DRY-RUN (read-only)" : "APPLY (writes to Firestore)"}`);

// Load explicit mappings if provided
let explicitMappings = {};
const mappingsPath = values.mappings || "./mappings.json";
if (fs.existsSync(mappingsPath)) {
  try {
    const raw = fs.readFileSync(mappingsPath, "utf8");
    explicitMappings = JSON.parse(raw);
    console.log(`Loaded ${Object.keys(explicitMappings).length} mappings from ${mappingsPath}`);
  } catch (err) {
    console.warn(`Warning: Could not read mappings file ${mappingsPath}: ${err.message}`);
  }
}

const keyPath =
  values.key ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  (fs.existsSync("./service-account.json") ? "./service-account.json" : null);

if (process.env.FIRESTORE_EMULATOR_HOST) {
  initializeApp({ projectId });
} else if (keyPath && fs.existsSync(keyPath)) {
  const serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf8"));
  console.log(`Authenticating with service account key: ${keyPath}`);
  initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id || projectId
  });
} else {
  initializeApp({
    projectId,
    credential: applicationDefault()
  });
}
const db = getFirestore();

const modelsSnap = await db.collection("models").get();
console.log(`Found ${modelsSnap.size} models in project.`);

let totalInvalidFactors = 0;
let totalFormulasUpdated = 0;
let modelsAffected = 0;
const dumpedMappings = {};

for (const modelDoc of modelsSnap.docs) {
  const modelId = modelDoc.id;
  const modelName = modelDoc.get("name") || modelId;

  const nodesSnap = await db.collection("models").doc(modelId).collection("nodes").get();
  if (nodesSnap.empty) continue;

  const nodes = nodesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const plan = planModelMigration(nodes, explicitMappings);

  if (!plan) continue;

  modelsAffected++;
  totalInvalidFactors += plan.invalidCount;

  console.log(`\n--------------------------------------------------`);
  console.log(`Model: "${modelName}" (${modelId})`);
  console.log(`  Invalid symbols found: ${plan.invalidCount}`);

  for (const r of plan.replacements) {
    dumpedMappings[r.nodeId] = {
      modelId,
      modelName,
      name: r.name,
      oldSymbol: r.oldSymbol,
      newSymbol: r.newSymbol
    };
    console.log(`  • Factor: "${r.name}"`);
    console.log(`    Symbol:  ${r.oldSymbol}  -->  ${r.newSymbol} ${r.isExplicit ? "(explicit)" : "(suggested)"}`);
  }

  const formulaUpdates = plan.updates.filter(u => u.formulaChanged);
  if (formulaUpdates.length > 0) {
    console.log(`  Formula updates (${formulaUpdates.length}):`);
    for (const u of formulaUpdates) {
      console.log(`    - [${u.newSymbol || u.oldSymbol}] "${u.name}"`);
      console.log(`      before: ${u.oldFormula}`);
      console.log(`      after:  ${u.newFormula}`);
    }
  }

  totalFormulasUpdated += formulaUpdates.length;

  if (!isDryRun) {
    const batch = db.batch();
    for (const u of plan.updates) {
      const nodeRef = db.collection("models").doc(modelId).collection("nodes").doc(u.id);
      const updateData = {
        updateTime: FieldValue.serverTimestamp()
      };
      if (u.symbolChanged) {
        updateData.symbol = u.newSymbol;
      }
      if (u.formulaChanged) {
        updateData.symbolFormula = u.newFormula;
      }
      batch.update(nodeRef, updateData);
    }
    await batch.commit();
    console.log(`  [OK] Saved updates to Firestore.`);
  }
}

console.log(`\n==================================================`);
console.log(`Summary:`);
console.log(`  Models affected:         ${modelsAffected}`);
console.log(`  Factors with non-ASCII:  ${totalInvalidFactors}`);
console.log(`  Formulas updated:        ${totalFormulasUpdated}`);

if (values["dump-mappings"]) {
  const outPath = values["dump-mappings"];
  fs.writeFileSync(outPath, JSON.stringify(dumpedMappings, null, 2), "utf8");
  console.log(`\nWrote proposed mappings to ${outPath}`);
}

if (isDryRun) {
  console.log(`\nDry run complete. No changes were written.`);
  if (totalInvalidFactors > 0) {
    console.log(`To apply these changes, run with --apply.`);
  }
} else {
  console.log(`\nMigration completed successfully!`);
}
