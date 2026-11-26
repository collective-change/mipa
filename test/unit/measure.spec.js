import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isTrackingDisallowed,
  getResolvedEndpoint,
  getViewportBucket,
  getReferrerHostname,
  getSessionSeen,
  markSessionSeen,
  measure
} from "@/utils/measure";

describe("todo225: First-party cookieless telemetry (src/utils/measure.js)", () => {
  const originalNavigator = global.navigator;
  const originalLocation = global.location;
  const originalDocument = global.document;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    delete window.__LONGECHO_MEASURE__;
    delete window.doNotTrack;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Privacy controls: DNT & GPC", () => {
    it("returns false when neither DNT nor GPC is enabled", () => {
      vi.stubGlobal("navigator", { doNotTrack: "0", globalPrivacyControl: false });
      delete window.doNotTrack;
      expect(isTrackingDisallowed()).toBe(false);
    });

    it("honours navigator.doNotTrack = '1'", () => {
      vi.stubGlobal("navigator", { doNotTrack: "1", globalPrivacyControl: false });
      expect(isTrackingDisallowed()).toBe(true);
    });

    it("honours window.doNotTrack = '1'", () => {
      vi.stubGlobal("navigator", { doNotTrack: "0", globalPrivacyControl: false });
      window.doNotTrack = "1";
      expect(isTrackingDisallowed()).toBe(true);
    });

    it("honours navigator.globalPrivacyControl = true", () => {
      vi.stubGlobal("navigator", { doNotTrack: "0", globalPrivacyControl: true });
      expect(isTrackingDisallowed()).toBe(true);
    });
  });

  describe("Endpoint resolution", () => {
    it("defaults to empty string when window.__LONGECHO_MEASURE__ is not set", () => {
      expect(getResolvedEndpoint()).toBe("");
    });

    it("reads window.__LONGECHO_MEASURE__ when configured", () => {
      window.__LONGECHO_MEASURE__ = "/api/collect";
      expect(getResolvedEndpoint()).toBe("/api/collect");
    });
  });

  describe("Viewport bucketing & referrer reduction", () => {
    it("buckets viewport width to nearest 320 px without fingerprinting", () => {
      window.innerWidth = 375; // mobile
      expect(getViewportBucket()).toBe(320);

      window.innerWidth = 768; // tablet
      expect(getViewportBucket()).toBe(640);

      window.innerWidth = 1024; // desktop small
      expect(getViewportBucket()).toBe(960);

      window.innerWidth = 1280; // desktop
      expect(getViewportBucket()).toBe(1280);

      window.innerWidth = 1920; // wide
      expect(getViewportBucket()).toBe(1920);
    });

    it("reduces referrer to domain name only, stripping path and search params", () => {
      Object.defineProperty(document, "referrer", {
        value: "https://www.google.com/search?q=mipa+decision",
        configurable: true
      });
      expect(getReferrerHostname()).toBe("www.google.com");
    });

    it("handles empty or malformed referrer gracefully", () => {
      Object.defineProperty(document, "referrer", { value: "", configurable: true });
      expect(getReferrerHostname()).toBe("");

      Object.defineProperty(document, "referrer", { value: "invalid-url", configurable: true });
      expect(getReferrerHostname()).toBe("");
    });
  });

  describe("Session-scoped return tracking", () => {
    it("returns false for first visit in session and true after marked", () => {
      expect(getSessionSeen()).toBe(false);
      markSessionSeen();
      expect(getSessionSeen()).toBe(true);
      expect(sessionStorage.getItem("le")).toBe("1");
    });
  });

  describe("measure() dispatch", () => {
    it("returns false and transmits nothing when endpoint is unset (default state)", () => {
      const mockSendBeacon = vi.fn();
      vi.stubGlobal("navigator", { sendBeacon: mockSendBeacon, doNotTrack: "0" });

      const result = measure("view");
      expect(result).toBe(false);
      expect(mockSendBeacon).not.toHaveBeenCalled();
    });

    it("returns false and transmits nothing when DNT is enabled", () => {
      const mockSendBeacon = vi.fn();
      vi.stubGlobal("navigator", { sendBeacon: mockSendBeacon, doNotTrack: "1" });

      const result = measure("view", {}, "/api/collect");
      expect(result).toBe(false);
      expect(mockSendBeacon).not.toHaveBeenCalled();
    });

    it("returns false and transmits nothing when GPC is enabled", () => {
      const mockSendBeacon = vi.fn();
      vi.stubGlobal("navigator", { sendBeacon: mockSendBeacon, doNotTrack: "0", globalPrivacyControl: true });

      const result = measure("view", {}, "/api/collect");
      expect(result).toBe(false);
      expect(mockSendBeacon).not.toHaveBeenCalled();
    });

    it("dispatches event via navigator.sendBeacon with Blob payload when active", async () => {
      let sentUrl = "";
      let sentBlobContent = "";

      const mockSendBeacon = vi.fn((url, blob) => {
        sentUrl = url;
        // Read blob content
        blob.text().then((t) => { sentBlobContent = t; });
        return true;
      });

      vi.stubGlobal("navigator", {
        sendBeacon: mockSendBeacon,
        doNotTrack: "0",
        globalPrivacyControl: false
      });
      window.innerWidth = 1200;

      const dispatched = measure("goal_created", { type: "strategic" }, "/api/collect");
      expect(dispatched).toBe(true);
      expect(mockSendBeacon).toHaveBeenCalledTimes(1);
      expect(sentUrl).toBe("/api/collect");

      // Verify payload structure
      const parsed = JSON.parse(await mockSendBeacon.mock.calls[0][1].text());
      expect(parsed.e).toBe("goal_created");
      expect(parsed.w).toBe(1280);
      expect(parsed.extra).toEqual({ type: "strategic" });
      expect(parsed).not.toHaveProperty("ip");
      expect(parsed).not.toHaveProperty("userId");
    });

    it("falls back to fetch when sendBeacon is not available", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", mockFetch);
      vi.stubGlobal("navigator", {
        sendBeacon: undefined,
        doNotTrack: "0",
        globalPrivacyControl: false
      });

      const dispatched = measure("signup_started", {}, "/api/collect");
      expect(dispatched).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/collect",
        expect.objectContaining({
          method: "POST",
          keepalive: true
        })
      );
    });

    it("verifies NO cookies and NO persistent identifiers are ever created or read", () => {
      const initialCookie = document.cookie;
      measure("ranking_viewed", {}, "/api/collect");
      expect(document.cookie).toBe(initialCookie);
      expect(localStorage.getItem("userId")).toBeNull();
      expect(localStorage.getItem("fingerprint")).toBeNull();
    });
  });
});
