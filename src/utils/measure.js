/**
 * First-party, cookieless instrumentation for Longecho / Mipa.
 *
 * Design constraints:
 * 1. Measure the app, never the person.
 * 2. No cookies, no third-party scripts, and no persistent identifiers.
 * 3. Honours Do Not Track (DNT) and Global Privacy Control (GPC).
 * 4. Endpoint defaults to EMPTY so nothing is sent unless deliberately enabled.
 * 5. Referrer reduced to hostname; viewport bucketed to nearest 320 px.
 * 6. Session-scoped return visit tracking via sessionStorage only.
 */

export function isTrackingDisallowed() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return true;
  }
  // Honour Do Not Track
  if (navigator.doNotTrack === "1" || window.doNotTrack === "1") {
    return true;
  }
  // Honour Global Privacy Control
  if (navigator.globalPrivacyControl) {
    return true;
  }
  return false;
}

export function getResolvedEndpoint() {
  if (typeof window !== "undefined" && window.__LONGECHO_MEASURE__) {
    return window.__LONGECHO_MEASURE__;
  }
  if (typeof process !== "undefined" && process.env && process.env.MEASURE_ENDPOINT) {
    return process.env.MEASURE_ENDPOINT;
  }
  return "";
}

export function getViewportBucket() {
  if (typeof window === "undefined" || typeof window.innerWidth !== "number") {
    return 0;
  }
  return Math.max(0, Math.round(window.innerWidth / 320) * 320);
}

export function getReferrerHostname() {
  if (typeof document === "undefined" || !document.referrer) {
    return "";
  }
  try {
    return new URL(document.referrer).hostname;
  } catch {
    return "";
  }
}

export function getSessionSeen() {
  if (typeof sessionStorage === "undefined") {
    return false;
  }
  try {
    return sessionStorage.getItem("le") === "1" || sessionStorage.getItem("mipa_seen") === "1";
  } catch {
    return false;
  }
}

export function markSessionSeen() {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  try {
    sessionStorage.setItem("le", "1");
    sessionStorage.setItem("mipa_seen", "1");
  } catch {
    // sessionStorage blocked or unavailable
  }
}

/**
 * Sends a telemetry event if an endpoint is configured and privacy flags allow.
 *
 * @param {string} event - Event name (e.g. "view", "signup_started", "goal_created")
 * @param {Record<string, unknown>} [extra] - Non-PII contextual metrics
 * @param {string} [endpointOverride] - Optional endpoint override (useful for testing)
 * @returns {boolean} Whether the event was dispatched
 */
export function measure(event, extra = {}, endpointOverride = null) {
  const endpoint = endpointOverride !== null ? endpointOverride : getResolvedEndpoint();
  if (!endpoint || isTrackingDisallowed()) {
    return false;
  }

  const seen = getSessionSeen();
  markSessionSeen();

  const payload = {
    e: String(event).slice(0, 60),
    p: typeof location !== "undefined" ? location.pathname : "",
    r: getReferrerHostname(),
    w: getViewportBucket(),
    back: seen
  };

  if (extra && typeof extra === "object" && !Array.isArray(extra)) {
    payload.extra = extra;
  }

  const body = JSON.stringify(payload);

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      return navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
    } catch {
      // Fallback to fetch if sendBeacon fails (e.g. payload too large)
    }
  }

  if (typeof fetch === "function") {
    fetch(endpoint, {
      method: "POST",
      body,
      keepalive: true,
      headers: { "Content-Type": "application/json" }
    }).catch(() => {});
    return true;
  }

  return false;
}
