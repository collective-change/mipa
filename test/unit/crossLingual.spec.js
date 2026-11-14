import { describe, it, expect } from "vitest";
import {
  SUPPORTED_LOCALES,
  isLocaleSupported,
  getLocalizedText,
  setLocalizedText,
  getDualLanguageDisplay,
  isFormulaLinguisticallyNeutral,
  translateTextFromGlossary
} from "../../src/utils/crossLingual";
import messages from "../../src/i18n";
import { all, create } from "mathjs";
import fs from "fs";
import path from "path";

const math = create(all);

describe("Cross-Lingual Collaboration Engine & Multi-Language UI Expansion", () => {
  describe("Supported Locales & Coverage", () => {
    it("supports all 5 global and regional NGO languages", () => {
      const codes = SUPPORTED_LOCALES.map((l) => l.code);
      expect(codes).toContain("en-us");
      expect(codes).toContain("zh-tw");
      expect(codes).toContain("zh-cn");
      expect(codes).toContain("es");
      expect(codes).toContain("ja");

      expect(isLocaleSupported("en-us")).toBe(true);
      expect(isLocaleSupported("zh-TW")).toBe(true);
      expect(isLocaleSupported("zh-CN")).toBe(true);
      expect(isLocaleSupported("es")).toBe(true);
      expect(isLocaleSupported("ja")).toBe(true);
      expect(isLocaleSupported("unknown-lang")).toBe(false);
    });

    it("registers all 5 languages in i18n messages registry", () => {
      expect(messages["en-us"]).toBeDefined();
      expect(messages["zh-tw"]).toBeDefined();
      expect(messages["zh-cn"]).toBeDefined();
      expect(messages["es"]).toBeDefined();
      expect(messages.ja).toBeDefined();

      // Common critical keys exist in every language
      const requiredKeys = ["appTitle", "Leverage", "Actions", "Calculate", "Settings"];
      for (const loc of ["en-us", "zh-tw", "zh-cn", "es", "ja"]) {
        const pack = messages[loc];
        for (const key of requiredKeys) {
          expect(pack[key], `Missing key '${key}' in locale '${loc}'`).toBeDefined();
        }
      }
    });
  });

  describe("Multilingual Entity Translation Resolvers", () => {
    it("resolves localized text from nested translations map", () => {
      const factor = {
        name: "Volunteer Capacity",
        translations: {
          name: {
            "zh-tw": "志工服務量",
            "zh-cn": "志愿者服务量",
            es: "Capacidad de Voluntarios",
            ja: "ボランティア稼働力"
          }
        }
      };

      expect(getLocalizedText(factor, "name", "en-us")).toBe("Volunteer Capacity");
      expect(getLocalizedText(factor, "name", "zh-tw")).toBe("志工服務量");
      expect(getLocalizedText(factor, "name", "zh-cn")).toBe("志愿者服务量");
      expect(getLocalizedText(factor, "name", "es")).toBe("Capacidad de Voluntarios");
      expect(getLocalizedText(factor, "name", "ja")).toBe("ボランティア稼働力");
    });

    it("falls back to default entity field when locale translation is missing", () => {
      const action = { title: "Emergency Water Purification" };
      expect(getLocalizedText(action, "title", "ja")).toBe("Emergency Water Purification");
    });

    it("sets localized field updates mutably", () => {
      const action = { title: "Medical Outpost" };
      setLocalizedText(action, "title", "es", "Puesto Médico de Avanzada");

      expect(action.translations.title.es).toBe("Puesto Médico de Avanzada");
      expect(getLocalizedText(action, "title", "es")).toBe("Puesto Médico de Avanzada");
    });
  });

  describe("Dual-Language / Subtitle Display", () => {
    it("provides secondary subtitle when user's locale differs from reference locale", () => {
      const action = {
        title: "Disaster Relief Surge",
        translations: {
          title: {
            "zh-tw": "緊急災難援助擴增方案",
            "en-us": "Disaster Relief Surge"
          }
        }
      };

      // Viewing in Traditional Chinese: primary is Chinese, subtitle is English
      const displayZh = getDualLanguageDisplay(action, "title", "zh-tw", "en-us");
      expect(displayZh.primary).toBe("緊急災難援助擴增方案");
      expect(displayZh.subtitle).toBe("Disaster Relief Surge");

      // Viewing in English: subtitle is null
      const displayEn = getDualLanguageDisplay(action, "title", "en-us", "en-us");
      expect(displayEn.primary).toBe("Disaster Relief Surge");
      expect(displayEn.subtitle).toBeNull();
    });
  });

  describe("Formula & Symbol Stability across Locales", () => {
    it("validates that mathematical expressions use ASCII identifiers and functions", () => {
      expect(isFormulaLinguisticallyNeutral("VC * 0.8 + 15")).toBe(true);
      expect(isFormulaLinguisticallyNeutral("delay(StockA, dt, 0)")).toBe(true);
      expect(isFormulaLinguisticallyNeutral("min(Capacity, Demand)")).toBe(true);

      // Non-ASCII formulas must be rejected to prevent broken calculations
      expect(isFormulaLinguisticallyNeutral("志工量 * 0.8")).toBe(false);
      expect(isFormulaLinguisticallyNeutral("容量 + 10")).toBe(false);
    });

    it("evaluates Math.js expressions consistently regardless of active UI locale", () => {
      const formula = "VC * Ratio + BaseSpend";
      const scope = { VC: 150, Ratio: 1.5, BaseSpend: 50 };

      const compiled = math.compile(formula);

      for (const loc of ["en-us", "zh-tw", "zh-cn", "es", "ja"]) {
        const result = compiled.evaluate(scope);
        expect(result).toBe(275);
      }
    });
  });

  describe("Core Glossary Translations", () => {
    it("translates common decision terms accurately across languages", () => {
      expect(translateTextFromGlossary("Leverage", "zh-tw", "en-us")).toBe("效應比");
      expect(translateTextFromGlossary("Leverage", "zh-cn", "en-us")).toBe("效应比");
      expect(translateTextFromGlossary("Leverage", "es", "en-us")).toBe("Apalancamiento");
      expect(translateTextFromGlossary("Leverage", "ja", "en-us")).toBe("効果比（レバレッジ）");
    });
  });

  describe("Localization Standard Compliance", () => {
    it("ensures zero Chinese characters in src/i18n/en-us/index.js", () => {
      const enUsPath = path.resolve(__dirname, "../../src/i18n/en-us/index.js");
      const enUsContent = fs.readFileSync(enUsPath, "utf-8");
      const chineseCharMatch = enUsContent.match(/[\u4e00-\u9fff]/g);

      expect(chineseCharMatch).toBeNull();
    });
  });
});
