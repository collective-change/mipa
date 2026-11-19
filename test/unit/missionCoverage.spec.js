import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import PageRegisterRecord from "@/pages/PageRegisterRecord.vue";
import {
  buildMissionCoverageRecord,
  deriveShippedCapabilities,
  verifyCoverageRecordIntegrity,
  VERIFICATION_CLAIMS,
  MISSION_REQUIREMENTS,
  COVERAGE_VERSION,
  COVERAGE_RECORD_ID,
  COVERAGE_CITATION_ID
} from "@/utils/missionCoverage";
import { WDI_LAYER1_INDICATORS } from "@/utils/worldModel";
import { CLIMATE_CONVERSION_FACTORS } from "@/utils/conversionFactors";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

function mountRegisterRecord(locale = "en-us") {
  return mount(PageRegisterRecord, {
    global: {
      plugins: [
        [Quasar, { components }],
        createI18n({ legacy: true, locale, messages })
      ],
      mocks: {
        $route: { params: { recordId: COVERAGE_RECORD_ID }, path: "/coverage" }
      },
      stubs: {
        "q-page": { template: "<div class='q-page'><slot /></div>" },
        "router-link": {
          props: ["to"],
          template: "<a :href='to'><slot /></a>"
        }
      }
    }
  });
}

describe("MIPA-39: Mipa Mission Coverage & Decision Register Architecture", () => {
  it("criterion 3: generates a permanent, dated, citable register record", () => {
    const record = buildMissionCoverageRecord();

    expect(record.recordId).toBe(COVERAGE_RECORD_ID);
    expect(record.citationId).toBe(COVERAGE_CITATION_ID);
    expect(record.version).toBe(COVERAGE_VERSION);
    expect(record.isPermanent).toBe(true);
    expect(record.isRevoked).toBe(false);
    expect(record.permanentUrl).toContain("/records/mipa-mission-coverage-v1");
    expect(record.publishedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(record.methodology).toContain("checked against methodology v1.0.0");
  });

  it("criterion 6: per-claim separation precedes capabilities, and scopes every limitation", () => {
    const record = buildMissionCoverageRecord();

    expect(record.claimsSeparation).toBeDefined();
    expect(record.claimsSeparation).toHaveLength(6);

    const claimNumbers = record.claimsSeparation.map((c) => c.claimNumber);
    expect(claimNumbers).toEqual([1, 2, 3, 4, 5, 6]);

    // Claim 1: Method followed (mechanical)
    expect(record.claimsSeparation[0].mode).toBe("mechanical");
    expect(record.claimsSeparation[0].isVerifiableNow).toBe(true);

    // Claim 2: Arithmetic reproduces (mechanical)
    expect(record.claimsSeparation[1].mode).toBe("mechanical");
    expect(record.claimsSeparation[1].isVerifiableNow).toBe(true);

    // Claim 3: Inputs sourced (attribution)
    expect(record.claimsSeparation[2].mode).toBe("attribution");
    expect(record.claimsSeparation[2].isVerifiableNow).toBe(true);

    // Claim 4: Counterfactual (declared by default / upgradable)
    expect(record.claimsSeparation[3].mode).toBe("declared_by_default");
    expect(record.claimsSeparation[3].upgradableToMeasured).toBe(true);

    // Claim 5: Forecast (scored with a lag)
    expect(record.claimsSeparation[4].mode).toBe("lagged_calibration");
    expect(record.claimsSeparation[4].scoredWithLag).toBe(true);

    // Claim 6: Decision (judged ex-ante before outcome is known)
    expect(record.claimsSeparation[5].mode).toBe("ex_ante_judgment");
    expect(record.claimsSeparation[5].isVerifiableNow).toBe(true);
  });

  it("criterion 7: no sentence anywhere contains a blanket 'cannot be verified'", () => {
    const record = buildMissionCoverageRecord();
    const serialized = JSON.stringify(record).toLowerCase();

    expect(serialized).not.toContain("cannot be verified");
    expect(serialized).not.toContain("never verifies");
  });

  it("criterion 2: what ships is dynamically derived from code (worldModel, conversionFactors, dimensions)", () => {
    const capabilities = deriveShippedCapabilities();

    // 1. World Model (derived from WDI_LAYER1_INDICATORS)
    expect(capabilities.worldModel.indicatorsCount).toBe(WDI_LAYER1_INDICATORS.length);
    expect(capabilities.worldModel.indicators).toHaveLength(WDI_LAYER1_INDICATORS.length);
    expect(capabilities.worldModel.license).toBe("CC BY 4.0");

    // 2. Conversion Factors (derived from CLIMATE_CONVERSION_FACTORS)
    expect(capabilities.conversionFactors.factorsCount).toBe(CLIMATE_CONVERSION_FACTORS.length);
    expect(capabilities.conversionFactors.factors).toHaveLength(CLIMATE_CONVERSION_FACTORS.length);
    expect(capabilities.conversionFactors.scopesCovered).toContain("Scope 1");
    expect(capabilities.conversionFactors.scopesCovered).toContain("Scope 2");

    // 3. Shipped Dimensions (Five Domains, SDG labels, Boundary limits)
    expect(capabilities.dimensions.shipped).toHaveLength(3);
    const dimNames = capabilities.dimensions.shipped.map((d) => d.name);
    expect(dimNames).toContain("Animal Welfare");
    expect(dimNames).toContain("Sustainable Development Goals (SDG)");
    expect(dimNames).toContain("Planetary & Social Boundaries");

    // 4. Register permanence & restore drill
    expect(capabilities.registerPermanence.verifiedRestoreDrill.fidelity).toBe("100%");
    expect(capabilities.registerPermanence.retentionTiers).toHaveLength(4);
  });

  it("criterion 1: all mission requirements appear with a state and dated reason (silence banned)", () => {
    expect(MISSION_REQUIREMENTS.length).toBeGreaterThanOrEqual(10);

    const validStates = ["met", "not_yet_met", "deliberately_not_built"];
    for (const req of MISSION_REQUIREMENTS) {
      expect(validStates).toContain(req.state);
      expect(req.reason).toBeDefined();
      expect(req.reason.length).toBeGreaterThan(20);
      expect(req.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(req.governingDecision).toBeDefined();
    }

    const titles = MISSION_REQUIREMENTS.map((r) => r.title.toLowerCase());
    expect(titles.some((t) => t.includes("distribution"))).toBe(true);
    expect(titles.some((t) => t.includes("disagreement"))).toBe(true);
    expect(titles.some((t) => t.includes("labour"))).toBe(true);
    expect(titles.some((t) => t.includes("governance"))).toBe(true);
    expect(titles.some((t) => t.includes("health"))).toBe(true);
    expect(titles.some((t) => t.includes("consent"))).toBe(true);
    expect(titles.some((t) => t.includes("subjects beyond"))).toBe(true);
    expect(titles.some((t) => t.includes("lexical"))).toBe(true);
    expect(titles.some((t) => t.includes("animal welfare"))).toBe(true);
    expect(titles.some((t) => t.includes("planetary boundaries"))).toBe(true);
  });

  it("criterion 4: verifyCoverageRecordIntegrity validates record compliance and audit requirements", () => {
    const { isValid, checks } = verifyCoverageRecordIntegrity();

    expect(isValid).toBe(true);
    expect(checks).toHaveLength(5);
    for (const c of checks) {
      expect(c.passed).toBe(true);
    }
  });

  it("renders PageRegisterRecord in English with zero Chinese characters", () => {
    const wrapper = mountRegisterRecord("en-us");

    const text = wrapper.text();
    expect(text).toContain("Mipa Mission Coverage & Claim Verification Statement");
    expect(text).toContain("Permanent Register Entry");
    expect(text).toContain("Separation of Claims & Verification Modes");
    expect(text).toContain("Shipped Standard World Model & Capabilities");
    expect(text).toContain("Mission Requirements & Coverage Registry");
    expect(text).toContain("The method was followed");
    expect(text).toContain("The arithmetic reproduces");
    expect(text).toContain("The inputs are sourced");
    expect(text).toContain("The counterfactual");
    expect(text).toContain("The forecast");
    expect(text).toContain("The decision");

    const chineseMatches = text.match(/[\u4e00-\u9fff]/g);
    expect(chineseMatches).toBeNull();
  });

  it("renders PageRegisterRecord in Traditional Chinese with elegant terminology", () => {
    const wrapper = mountRegisterRecord("zh-tw");

    const text = wrapper.text();
    expect(text).toContain("決策登記冊");
    expect(text).toContain("永久登記冊紀錄");
    expect(text).toContain("不可抹除 · 可永久引用");
    expect(text).toContain("主張分離與查驗模式");
    expect(text).toContain("已交付標準世界模型與能力");
    expect(text).toContain("使命需求與涵蓋範圍登記冊");
    expect(text).toContain("嚴禁隱瞞");
  });

  it("handles copyCitation and window.print without error", () => {
    const wrapper = mountRegisterRecord("en-us");

    const writeTextMock = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true
    });
    const printMock = vi.fn();
    window.print = printMock;

    wrapper.vm.copyCitation();
    expect(writeTextMock).toHaveBeenCalled();
    expect(writeTextMock.mock.calls[0][0]).toContain(COVERAGE_CITATION_ID);

    wrapper.vm.printRecord();
    expect(printMock).toHaveBeenCalled();
  });
});
