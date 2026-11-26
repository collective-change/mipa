import { onRequest, Request, Response } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

export interface CleanTelemetryRecord {
  e: string;
  p: string;
  r: string;
  w: number;
  back: boolean;
  extra?: Record<string, unknown>;
  timestamp: string;
}

const FORBIDDEN_KEYS = new Set([
  "ip",
  "clientip",
  "client_ip",
  "userip",
  "user_ip",
  "xforwardedfor",
  "x_forwarded_for",
  "userid",
  "user_id",
  "uid",
  "email",
  "cookie",
  "cookies",
  "fingerprint",
  "token"
]);

/**
 * Sanitizes incoming telemetry payload.
 * Verifiably DISCARDS any IP address, user identifier, cookie, or personal data.
 */
export function sanitizeTelemetryRecord(rawBody: unknown): CleanTelemetryRecord | null {
  if (!rawBody || typeof rawBody !== "object") {
    return null;
  }

  const data = rawBody as Record<string, unknown>;

  // Event name must be a non-empty string
  const rawEvent = typeof data.e === "string" ? data.e.trim() : "";
  if (!rawEvent) {
    return null;
  }

  // Path: sanitized to path only (strip query string and fragment if present)
  let rawPath = typeof data.p === "string" ? data.p.trim() : "";
  try {
    if (rawPath.startsWith("http://") || rawPath.startsWith("https://")) {
      rawPath = new URL(rawPath).pathname;
    } else {
      rawPath = rawPath.split("?")[0].split("#")[0];
    }
  } catch {
    rawPath = rawPath.slice(0, 100);
  }

  // Referrer hostname only (max 100 chars, no path or search)
  let rawReferrer = typeof data.r === "string" ? data.r.trim() : "";
  try {
    if (rawReferrer.includes("://")) {
      rawReferrer = new URL(rawReferrer).hostname;
    } else {
      rawReferrer = rawReferrer.split("/")[0].split("?")[0];
    }
  } catch {
    rawReferrer = "";
  }

  // Viewport width bucket (bucketed to nearest 320 px, minimum 0)
  let rawWidth = typeof data.w === "number" && !isNaN(data.w) ? Math.round(data.w) : 0;
  if (rawWidth > 0) {
    rawWidth = Math.round(rawWidth / 320) * 320;
  } else {
    rawWidth = 0;
  }

  // Session return visit flag
  const back = Boolean(data.back);

  // Sanitize extra parameters: non-PII only, string/number/boolean/null values
  let extra: Record<string, unknown> | undefined;
  if (data.extra && typeof data.extra === "object" && !Array.isArray(data.extra)) {
    const cleanExtra: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(data.extra as Record<string, unknown>)) {
      const normalizedKey = key.toLowerCase().replace(/[-_]/g, "");
      if (FORBIDDEN_KEYS.has(normalizedKey)) {
        continue; // Discard forbidden identifiers or IP fields
      }
      if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
        cleanExtra[key.slice(0, 50)] = typeof val === "string" ? val.slice(0, 200) : val;
      }
    }
    if (Object.keys(cleanExtra).length > 0) {
      extra = cleanExtra;
    }
  }

  const record: CleanTelemetryRecord = {
    e: rawEvent.slice(0, 60),
    p: rawPath.slice(0, 200),
    r: rawReferrer.slice(0, 100),
    w: rawWidth,
    back,
    timestamp: new Date().toISOString()
  };

  if (extra) {
    record.extra = extra;
  }

  return record;
}

/**
 * First-party, cookieless telemetry collector endpoint.
 * Discards incoming IP address, headers, and persistent identifiers.
 */
export const collectTelemetry = onRequest(async (req: Request, res: Response) => {
  // CORS support
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  let bodyData = req.body;
  if (typeof bodyData === "string") {
    try {
      bodyData = JSON.parse(bodyData);
    } catch {
      res.status(400).send("Invalid JSON");
      return;
    }
  }

  // Support single event or batch of events
  const rawList = Array.isArray(bodyData) ? bodyData : [bodyData];
  const validRecords: CleanTelemetryRecord[] = [];

  for (const item of rawList.slice(0, 20)) {
    const record = sanitizeTelemetryRecord(item);
    if (record) {
      validRecords.push(record);
    }
  }

  if (validRecords.length === 0) {
    res.status(400).send("No valid telemetry events in payload");
    return;
  }

  try {
    const db = getFirestore();
    const batch = db.batch();
    const collectionRef = db.collection("telemetryEvents");

    for (const rec of validRecords) {
      const docRef = collectionRef.doc();
      batch.set(docRef, rec);
    }

    await batch.commit();
  } catch (err) {
    console.error("Telemetry collector failed to write events:", err);
    // Don't leak internals to client
    res.status(500).send("Error recording telemetry");
    return;
  }

  res.status(204).send("");
});
