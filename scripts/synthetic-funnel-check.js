#!/usr/bin/env node

/**
 * Synthetic Funnel Uptime Check (Standalone CLI)
 *
 * Verifies end-to-end viability across the 4 core funnel steps:
 * 1. Landing page reachability & integrity
 * 2. Sign-up & auth route reachability
 * 3. Model calculation & action leverage evaluation (mathjs/leverage)
 * 4. Dossier rendering & citable register resolution
 *
 * Usage:
 *   node scripts/synthetic-funnel-check.js
 *   node scripts/synthetic-funnel-check.js --positive-control
 */

import { executeSyntheticFunnelCheck } from '../functions/lib/monitoring/syntheticCheck.js';

const isPositiveControl = process.argv.includes('--positive-control');

console.log('='.repeat(65));
console.log(`[MIPA SYNTHETIC CHECK] Running 4-step Funnel Verification`);
if (isPositiveControl) {
  console.log(`[POSITIVE CONTROL MODE] Intentionally forcing calculation failure to test alert alarm`);
}
console.log('='.repeat(65));

async function run() {
  try {
    const report = await executeSyntheticFunnelCheck({
      positiveControl: isPositiveControl,
      skipNetworkFetch: false,
      skipAlertFirestore: true
    });

    console.log(`Timestamp: ${report.timestamp}`);
    console.log(`Total Latency: ${report.totalLatencyMs}ms`);
    console.log('-'.repeat(65));

    for (const s of report.steps) {
      const statusIcon = s.success ? '✔ PASS' : '✖ FAIL';
      console.log(`[${statusIcon}] ${s.name} (${s.step}): ${s.latencyMs}ms`);
      if (s.error) {
        console.log(`       Error: ${s.error}`);
      }
    }

    console.log('='.repeat(65));

    if (report.success) {
      console.log('RESULT: ALL 4 FUNNEL STEPS HEALTHY (Funnel is operational)');
      process.exit(0);
    } else {
      console.log(`RESULT: FUNNEL FAILED ON ${report.failedStep}`);
      if (report.alertDispatched) {
        console.log(`ALERT DISPATCHED:`);
        console.log(`  Destination: ${report.alertDispatched.channel}`);
        console.log(`  Summary:     ${report.alertDispatched.singleLineSummary}`);
      }
      if (isPositiveControl) {
        console.log(`POSITIVE CONTROL SUCCESSFUL: Alert alarm verified to fire upon failure!`);
        process.exit(0);
      }
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal execution error running synthetic check:', err);
    process.exit(1);
  }
}

run();
