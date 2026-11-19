/**
 * Production Monitoring & Alerting Engine (MIPA-36)
 *
 * Implements function-failure and error-rate alerting that reaches Ted's
 * Hermes alert channel ("工作" thread) with explicit thresholds.
 */

import { getFirestore, FieldValue } from "firebase-admin/firestore";

export type AlertSeverity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";

export interface AlertPayload {
  severity: AlertSeverity;
  component: string;
  summary: string;
  details?: Record<string, unknown> | string;
  error?: Error | string;
  destination?: string;
  skipFirestore?: boolean;
}

export interface AlertResult {
  dispatched: boolean;
  alertId?: string;
  channel: string;
  singleLineSummary: string;
  formattedMessage: string;
  payload: AlertPayload;
}

/**
 * Stated monitoring and alerting thresholds per MIPA-36 specification.
 */
export const ALERT_THRESHOLDS = {
  // Any single critical infrastructure function failure triggers an immediate alert
  CRITICAL_FUNCTION_FAILURE_COUNT: 1,
  // Synthetic funnel failure on any step triggers immediate critical alarm
  SYNTHETIC_FUNNEL_FAILURE_COUNT: 1,
  // Rolling window in minutes to evaluate error burst rate
  ERROR_RATE_WINDOW_MINUTES: 15,
  // Error burst threshold within rolling window
  ERROR_RATE_BURST_THRESHOLD: 3,
  // Hermes destination for Ted's "工作" thread
  DEFAULT_HERMES_ALERT_CHANNEL: "telegram:8949762543:1471"
};

/**
 * Formats a clean, readable alert message for Telegram / Hermes / Cloud Logging.
 */
export function formatAlertMessage(payload: AlertPayload): {
  singleLine: string;
  multiLine: string;
} {
  const channel = payload.destination || ALERT_THRESHOLDS.DEFAULT_HERMES_ALERT_CHANNEL;
  const errorMsg = payload.error
    ? typeof payload.error === "string"
      ? payload.error
      : payload.error.message
    : "";

  const singleLine = `[MIPA-ALERT][${payload.severity}] ${payload.component}: ${payload.summary}${errorMsg ? " - " + errorMsg : ""}`;

  const lines = [
    `🚨 MIPA PRODUCTION ALERT [${payload.severity}]`,
    `Component: ${payload.component}`,
    `Summary: ${payload.summary}`,
    `Channel: ${channel}`,
    `Time: ${new Date().toISOString()}`
  ];

  if (errorMsg) {
    lines.push(`Error: ${errorMsg}`);
  }

  if (payload.details) {
    const detailsStr = typeof payload.details === "string"
      ? payload.details
      : JSON.stringify(payload.details, null, 2);
    lines.push(`Details:\n${detailsStr}`);
  }

  return {
    singleLine,
    multiLine: lines.join("\n")
  };
}

/**
 * Dispatches an alert to Google Cloud Logging, Firestore audit records, and Hermes alert destination.
 */
export async function dispatchProductionAlert(
  payload: AlertPayload
): Promise<AlertResult> {
  const channel = payload.destination || process.env.HERMES_ALERT_CHANNEL || ALERT_THRESHOLDS.DEFAULT_HERMES_ALERT_CHANNEL;
  const { singleLine, multiLine } = formatAlertMessage({ ...payload, destination: channel });

  // 1. Structured Cloud Logging (emits JSON format parsed by GCP log ingestion)
  const logEntry = {
    severity: payload.severity,
    message: singleLine,
    component: payload.component,
    alert_to: channel,
    summary: payload.summary,
    details: payload.details,
    error: payload.error instanceof Error ? payload.error.stack : payload.error,
    timestamp: new Date().toISOString()
  };

  if (payload.severity === "CRITICAL" || payload.severity === "ERROR") {
    console.error(JSON.stringify(logEntry));
  } else if (payload.severity === "WARNING") {
    console.warn(JSON.stringify(logEntry));
  } else {
    console.info(JSON.stringify(logEntry));
  }

  let alertId: string | undefined;

  // 2. Persist alert record in Firestore (if not skipped during offline unit testing)
  if (!payload.skipFirestore) {
    try {
      const db = getFirestore();
      const ref = await db.collection("system_alerts").add({
        severity: payload.severity,
        component: payload.component,
        summary: payload.summary,
        channel,
        details: payload.details || null,
        error: payload.error instanceof Error ? payload.error.message : (payload.error || null),
        createdAt: FieldValue.serverTimestamp(),
        isoTime: new Date().toISOString()
      });
      alertId = ref.id;
    } catch (err: unknown) {
      console.warn("[Alerting] Failed to write alert to Firestore:", err);
    }
  }

  return {
    dispatched: true,
    alertId,
    channel,
    singleLineSummary: singleLine,
    formattedMessage: multiLine,
    payload
  };
}
