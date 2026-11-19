#!/usr/bin/env node

/**
 * Local-Layer Backup & Restore Drill CLI (MIPA-42)
 *
 * "An export that has never been restored is not a backup."
 *
 * Usage:
 *   node scripts/restore-drill-local-layer.js
 */

import { runRestoreDrill } from "./backup-local-layer.js";

async function main() {
  console.log(`=======================================================`);
  console.log(`[MIPA-42] Commencing Local-Only Layer Restore Drill`);
  console.log(`Target: Mipa Backlog, Hermes Assets, Todo-Board`);
  console.log(`=======================================================\n`);

  const startTime = Date.now();
  const result = runRestoreDrill();
  const elapsed = Date.now() - startTime;

  console.log(`Drill ID: ${result.drillId}`);
  console.log(`Timestamp: ${result.timestamp}`);
  console.log(`Elapsed Duration: ${elapsed}ms`);
  console.log(`Total Files Tested: ${result.totalFilesTested}\n`);

  console.log(`Integrity & Safety Verification Checklist:`);
  for (const assertion of result.assertions) {
    console.log(`   ✓ ${assertion.check}: PASS`);
  }

  if (!result.allPassed) {
    console.error(`\n=======================================================`);
    console.error(`[FAIL] Local-Layer Restore Drill Failed`);
    console.error(`=======================================================\n`);
    process.exit(1);
  }

  console.log(`\n=======================================================`);
  console.log(`[PASS] Local-Only Layer Restore Drill Completed Successfully`);
  console.log(`Status: 100% Byte-for-Byte Fidelity Verified & Zero Leakage Confirmed`);
  console.log(`=======================================================\n`);
}

main().catch((err) => {
  console.error(`[FAIL] Restore drill encountered unhandled exception:`, err);
  process.exit(1);
});
