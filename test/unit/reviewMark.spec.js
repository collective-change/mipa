import { describe, it, expect } from "vitest";
import { createI18n } from "vue-i18n";
import { reviewMarkParts, reviewMarkText, reviewVersionDrift, ReviewMarkError } from "@/utils/reviewMark";
import enUS from "@/i18n/en-us/index.js";
import zhTW from "@/i18n/zh-tw/index.js";

const stored = Object.freeze({
  schemaVersion: 1,
  provider: "anthropic",
  model: "claude-3-5-sonnet-20241022",
  requestedModel: "claude-3-5-sonnet-20241022",
  pinStatus: "pinned",
  methodologyVersion: "1.0.0",
  reviewedAt: "2026-11-20T01:02:03.000Z"
});

// A minimal stand-in for vue-i18n's t(): named placeholders only.
const tFor = (messages) => (key, params = {}) => {
  if (!(key in messages)) throw new Error(`missing message ${key}`);
  return messages[key].replace(/\{(\w+)\}/g, (_, name) => String(params[name]));
};

describe("MIPA-43: review mark wording is generated from stored provenance", () => {
  it("renders the M-3 sentence from the stored fields only", () => {
    expect(reviewMarkText(stored, tFor(enUS))).toBe(
      "Checked against Longecho methodology v1.0.0 by model claude-3-5-sonnet-20241022 (anthropic) on 2026-11-20."
    );
    expect(reviewMarkText(stored, tFor(zhTW))).toBe(
      "依 Longecho 方法論 v1.0.0，由模型 claude-3-5-sonnet-20241022（anthropic）於 2026-11-20 檢核。"
    );
  });

  it("changes when, and only when, the stored fields change", () => {
    const other = { ...stored, model: "claude-3-5-sonnet-20240620", methodologyVersion: "1.1.0" };
    const text = reviewMarkText(other, tFor(enUS));
    expect(text).toContain("v1.1.0");
    expect(text).toContain("claude-3-5-sonnet-20240620");
    expect(reviewMarkText({ ...stored }, tFor(enUS))).toBe(reviewMarkText(stored, tFor(enUS)));
  });

  it("refuses to produce a mark when any field is missing, rather than a partial one", () => {
    for (const field of ["provider", "model", "methodologyVersion", "reviewedAt", "pinStatus"]) {
      expect(() => reviewMarkParts({ ...stored, [field]: "" })).toThrow(ReviewMarkError);
    }
    expect(() => reviewMarkParts(null)).toThrow(ReviewMarkError);
    expect(() => reviewMarkParts({ ...stored, reviewedAt: "not a date" })).toThrow(ReviewMarkError);
  });

  it("flags an unverified pin in the mark itself", () => {
    const text = reviewMarkText({ ...stored, model: "claude-opus-5-5", pinStatus: "unverified" }, tFor(enUS));
    expect(text).toContain("may not reproduce");
  });

  it("an old review keeps its stored version and says what has changed since", () => {
    const current = { provider: "anthropic", model: "claude-opus-5-5-20270101", methodologyVersion: "2.0.0" };
    expect(reviewVersionDrift(stored, current)).toEqual(["model", "methodologyVersion"]);
    const text = reviewMarkText(stored, tFor(enUS), current);
    expect(text).toContain("by model claude-3-5-sonnet-20241022");
    expect(text).toContain("v1.0.0");
    expect(text).toContain("Since this check, the model, methodology changed; this record keeps the version it used.");
    expect(reviewMarkText(stored, tFor(zhTW), current)).toContain("模型、方法論已變更");
    expect(reviewVersionDrift(stored, { ...stored })).toEqual([]);
  });

  it("every mark message exists in both en-us and zh-tw", () => {
    const keys = Object.keys(enUS).filter((k) => k.startsWith("reviewMark"));
    expect(keys.length).toBe(7);
    for (const k of keys) expect(typeof zhTW[k]).toBe("string");
  });

  it("renders identically through the app's real vue-i18n", () => {
    for (const [locale, messages] of [["en-us", enUS], ["zh-tw", zhTW]]) {
      const i18n = createI18n({ legacy: true, locale, messages: { [locale]: messages } });
      const t = (key, params) => i18n.global.t(key, params);
      const current = { provider: "anthropic", model: "x-20270101", methodologyVersion: "1.0.0" };
      expect(reviewMarkText({ ...stored, pinStatus: "unverified" }, t, current)).toBe(
        reviewMarkText({ ...stored, pinStatus: "unverified" }, tFor(messages), current)
      );
    }
  });
});
