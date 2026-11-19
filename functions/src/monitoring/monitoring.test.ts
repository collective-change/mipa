import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
  formatAlertMessage,
  dispatchProductionAlert,
  ALERT_THRESHOLDS
} from "./alerting";
import {
  evaluateSyntheticModelCalculation,
  executeSyntheticFunnelCheck
} from "./syntheticCheck";

test("ALERT_THRESHOLDS declares strict production monitoring ceilings", () => {
  assert.equal(ALERT_THRESHOLDS.CRITICAL_FUNCTION_FAILURE_COUNT, 1);
  assert.equal(ALERT_THRESHOLDS.SYNTHETIC_FUNNEL_FAILURE_COUNT, 1);
  assert.equal(ALERT_THRESHOLDS.ERROR_RATE_WINDOW_MINUTES, 15);
  assert.equal(ALERT_THRESHOLDS.ERROR_RATE_BURST_THRESHOLD, 3);
  assert.equal(ALERT_THRESHOLDS.DEFAULT_HERMES_ALERT_CHANNEL, "telegram:8949762543:1471");
});

test("formatAlertMessage formats single-line and multi-line Hermes alerts", () => {
  const { singleLine, multiLine } = formatAlertMessage({
    severity: "CRITICAL",
    component: "scheduledFirestoreBackup",
    summary: "Bucket export failed",
    error: new Error("GCS permissions refused")
  });

  assert.ok(singleLine.includes("[MIPA-ALERT][CRITICAL] scheduledFirestoreBackup: Bucket export failed"));
  assert.ok(singleLine.includes("GCS permissions refused"));
  assert.ok(multiLine.includes("telegram:8949762543:1471"));
  assert.ok(multiLine.includes("GCS permissions refused"));
});

test("dispatchProductionAlert dispatches to specified channel with audit record", async () => {
  const result = await dispatchProductionAlert({
    severity: "ERROR",
    component: "billingWebhook",
    summary: "Lemon Squeezy signature verification failed",
    destination: "telegram:8949762543:1471",
    skipFirestore: true
  });

  assert.equal(result.dispatched, true);
  assert.equal(result.channel, "telegram:8949762543:1471");
  assert.ok(result.singleLineSummary.includes("billingWebhook"));
});

test("evaluateSyntheticModelCalculation calculates action leverage with 100% domain fidelity", () => {
  // Formula: actionLeverage = (netBenefitNpv * totalRoi / outstandingDirectCosts) * sign(net)
  // Solar Fleet: netBenefitNpv = $220,000, totalRoi = 4.4, directCosts = $50,000
  // expected: (220,000 * 4.4 / 50,000) * 1 = 19.36
  const leverage = evaluateSyntheticModelCalculation(220000, 4.4, 50000);
  assert.equal(Math.round(leverage * 100) / 100, 19.36);

  // When direct costs <= 0, leverage is 0
  assert.equal(evaluateSyntheticModelCalculation(1000, 2.0, 0), 0);
  assert.equal(evaluateSyntheticModelCalculation(1000, 2.0, -100), 0);

  // Negative net benefit carries negative sign
  // (totalRoi is netBenefit / denominator, so totalRoi is also negative when netBenefit is negative)
  const negativeLeverage = evaluateSyntheticModelCalculation(-50000, -0.5, 100000);
  assert.equal(negativeLeverage, -0.25);
});

test("executeSyntheticFunnelCheck passes all 4 steps when services are normal", async () => {
  const report = await executeSyntheticFunnelCheck({
    skipNetworkFetch: true,
    skipAlertFirestore: true
  });

  assert.equal(report.success, true);
  assert.equal(report.steps.length, 4);
  assert.equal(report.steps[0].step, "step1_landing");
  assert.equal(report.steps[1].step, "step2_auth");
  assert.equal(report.steps[2].step, "step3_calculation");
  assert.equal(report.steps[3].step, "step4_dossier");
  assert.equal(report.isPositiveControl, false);
});

test("MIPA-36 Positive Control: Intentional failure immediately triggers CRITICAL alert to Ted's channel", async () => {
  const report = await executeSyntheticFunnelCheck({
    positiveControl: true,
    skipNetworkFetch: true,
    skipAlertFirestore: true
  });

  // Verify failure is captured on step 3 (calculation engine)
  assert.equal(report.success, false);
  assert.equal(report.failedStep, "step3_calculation");
  assert.equal(report.isPositiveControl, true);

  // Verify alert was dispatched
  assert.ok(report.alertDispatched);
  assert.equal(report.alertDispatched?.payload.severity, "CRITICAL");
  assert.equal(report.alertDispatched?.channel, "telegram:8949762543:1471");
  assert.ok(report.alertDispatched?.singleLineSummary.includes("Positive Control Alert Drill"));
});
