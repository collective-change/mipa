import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { Request, Response } from "firebase-functions/v2/https";
import { sanitizeTelemetryRecord, collectTelemetry } from "./telemetryCollector.js";

describe("todo225: First-party cookieless telemetry collector", () => {
  describe("sanitizeTelemetryRecord", () => {
    it("parses valid telemetry payload into clean record", () => {
      const raw = {
        e: "signup_completed",
        p: "/auth?tab=register#top",
        r: "https://news.ycombinator.com/item?id=123",
        w: 1200,
        back: true,
        extra: { step: 3, flow: "organic" }
      };

      const record = sanitizeTelemetryRecord(raw);
      assert.ok(record, "record should not be null");
      assert.equal(record.e, "signup_completed");
      assert.equal(record.p, "/auth");
      assert.equal(record.r, "news.ycombinator.com");
      assert.equal(record.w, 1280); // 1200 rounded to nearest 320: 1200/320 = 3.75 -> 4 * 320 = 1280
      assert.equal(record.back, true);
      assert.deepEqual(record.extra, { step: 3, flow: "organic" });
      assert.ok(typeof record.timestamp === "string");
    });

    it("verifiably DISCARDS the IP address and persistent identifiers", () => {
      const rawWithPii = {
        e: "view",
        p: "/orgs",
        r: "https://google.com/search?q=mipa",
        w: 750,
        back: false,
        ip: "203.0.113.195",
        client_ip: "203.0.113.195",
        userId: "secret-uid-999",
        email: "user@example.com",
        cookie: "session=xyz123",
        extra: {
          ip: "203.0.113.195",
          clientIp: "203.0.113.195",
          user_id: "secret-uid-999",
          uid: "secret-uid-999",
          cookie: "cookie_val",
          fingerprint: "canvas-fp",
          token: "bearer-token",
          safeMetric: "ranking_modal",
          count: 5
        }
      };

      const record = sanitizeTelemetryRecord(rawWithPii) as unknown as Record<string, unknown>;
      assert.ok(record);

      // Verifiably assert that NO IP field exists anywhere on the record
      assert.equal("ip" in record, false, "record must not have 'ip' property");
      assert.equal("client_ip" in record, false, "record must not have 'client_ip' property");
      assert.equal("userId" in record, false, "record must not have 'userId' property");
      assert.equal("email" in record, false, "record must not have 'email' property");
      assert.equal("cookie" in record, false, "record must not have 'cookie' property");

      // In extra, forbidden keys must be stripped
      const extra = record.extra as Record<string, unknown>;
      assert.equal("ip" in extra, false, "extra must not have 'ip' property");
      assert.equal("clientIp" in extra, false, "extra must not have 'clientIp' property");
      assert.equal("user_id" in extra, false, "extra must not have 'user_id' property");
      assert.equal("uid" in extra, false, "extra must not have 'uid' property");
      assert.equal("fingerprint" in extra, false, "extra must not have 'fingerprint' property");

      // Only safe metrics retained
      assert.deepEqual(record.extra, { safeMetric: "ranking_modal", count: 5 });

      // Verifiably assert serialized record never contains the IP address string
      const serialized = JSON.stringify(record);
      assert.equal(serialized.includes("203.0.113.195"), false, "serialized record must not contain IP address");
      assert.equal(serialized.includes("secret-uid-999"), false, "serialized record must not contain user ID");
      assert.equal(serialized.includes("user@example.com"), false, "serialized record must not contain email");
    });

    it("rejects non-object or empty event payload", () => {
      assert.equal(sanitizeTelemetryRecord(null), null);
      assert.equal(sanitizeTelemetryRecord(undefined), null);
      assert.equal(sanitizeTelemetryRecord(""), null);
      assert.equal(sanitizeTelemetryRecord({}), null);
      assert.equal(sanitizeTelemetryRecord({ e: "" }), null);
      assert.equal(sanitizeTelemetryRecord({ e: "   " }), null);
    });

    it("buckets viewport widths to nearest 320px", () => {
      assert.equal(sanitizeTelemetryRecord({ e: "v", w: 320 })?.w, 320);
      assert.equal(sanitizeTelemetryRecord({ e: "v", w: 360 })?.w, 320);
      assert.equal(sanitizeTelemetryRecord({ e: "v", w: 768 })?.w, 640);
      assert.equal(sanitizeTelemetryRecord({ e: "v", w: 1024 })?.w, 960);
      assert.equal(sanitizeTelemetryRecord({ e: "v", w: 1440 })?.w, 1600);
      assert.equal(sanitizeTelemetryRecord({ e: "v", w: 0 })?.w, 0);
      assert.equal(sanitizeTelemetryRecord({ e: "v", w: -50 })?.w, 0);
    });
  });

  describe("collectTelemetry HTTP handler", () => {
    it("handles OPTIONS preflight with CORS headers and 204", async () => {
      let statusCode = 0;
      let bodySent = "";
      const headers: Record<string, string> = {};

      const req = {
        method: "OPTIONS"
      } as unknown as Request;
      const res = {
        setHeader: (k: string, v: string) => { headers[k] = v; },
        status: (code: number) => {
          statusCode = code;
          return { send: (b: string) => { bodySent = b; } };
        }
      } as unknown as Response;

      await (collectTelemetry as unknown as (r: Request, s: Response) => Promise<void>)(req, res);
      assert.equal(statusCode, 204);
      assert.equal(headers["Access-Control-Allow-Origin"], "*");
      assert.equal(headers["Access-Control-Allow-Methods"], "POST, OPTIONS");
      assert.equal(bodySent, "");
    });

    it("rejects non-POST methods with 405", async () => {
      let statusCode = 0;
      let bodySent = "";

      const req = {
        method: "GET"
      } as unknown as Request;
      const res = {
        setHeader: () => {},
        status: (code: number) => {
          statusCode = code;
          return { send: (b: string) => { bodySent = b; } };
        }
      } as unknown as Response;

      await (collectTelemetry as unknown as (r: Request, s: Response) => Promise<void>)(req, res);
      assert.equal(statusCode, 405);
      assert.equal(bodySent, "Method Not Allowed");
    });
  });
});
