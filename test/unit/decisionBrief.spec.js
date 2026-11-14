import { describe, it, expect } from "vitest";
import {
  formatCurrencyValue,
  formatRatioValue,
  extractActionDrivers,
  explainActionComparison,
  generateDecisionBrief,
  validateBriefNumbers,
  formatBriefAsMarkdown,
  formatBriefAsCsv
} from "@/utils/decisionBrief.js";

const mockNodes = [
  { id: "node_volunteers", symbol: "volunteers", name: "Active Volunteers", unit: "people", isEstimate: false },
  { id: "node_meals", symbol: "mealsServed", name: "Meals Served", unit: "meals", isEstimate: false },
  { id: "node_food", symbol: "foodDonatedKg", name: "Food Donated", unit: "kg", isEstimate: true, notes: "Subject to seasonal donations estimate" },
  { id: "node_cap", symbol: "packingCapacity", name: "Packing Capacity", unit: "meals/month", isEstimate: false }
];

const mockActionA = {
  id: "act_recruit",
  title: "Recruit & Train Volunteer Teams",
  actionLeverage: 48.5,
  marginalNetTotalBenefitNpv: 125000,
  marginalOrgBenefitNpv: 45000,
  marginalWorldBenefitNpv: 80000,
  marginalOrgCostNpv: 5000,
  marginalWorldCostNpv: 0,
  marginalTotalBenefitNpv: 130000,
  marginalTotalCostNpv: 5000,
  outstandingDirectCosts: 1200,
  estEffortHrs: 60,
  estSpending: 1200,
  totalRoi: 24.2,
  impacts: [
    { nodeId: "node_volunteers", symbol: "volunteers", operation: "+", operand: 15, duration: "forever" }
  ]
};

const mockActionB = {
  id: "act_partner",
  title: "Supermarket Surplus Food Partnership",
  actionLeverage: 12.3,
  marginalNetTotalBenefitNpv: 35000,
  marginalOrgBenefitNpv: 10000,
  marginalWorldBenefitNpv: 25000,
  marginalOrgCostNpv: 4000,
  marginalWorldCostNpv: 0,
  marginalTotalBenefitNpv: 39000,
  marginalTotalCostNpv: 4000,
  outstandingDirectCosts: 2500,
  estEffortHrs: 80,
  estSpending: 2500,
  totalRoi: 8.5,
  impacts: [
    { nodeId: "node_food", symbol: "foodDonatedKg", operation: "+", operand: 1000, duration: "forever" }
  ]
};

const mockActionC = {
  id: "act_report",
  title: "Publish Annual Glossy Report",
  actionLeverage: -5.2,
  marginalNetTotalBenefitNpv: -8000,
  marginalOrgBenefitNpv: 2000,
  marginalWorldBenefitNpv: 0,
  marginalOrgCostNpv: 10000,
  marginalWorldCostNpv: 0,
  marginalTotalBenefitNpv: 2000,
  marginalTotalCostNpv: 10000,
  outstandingDirectCosts: 3000,
  estEffortHrs: 40,
  estSpending: 3000,
  totalRoi: -0.8,
  impacts: []
};

describe("Feature 2: Decision Brief and Explain Ranking Engine", () => {
  describe("Formatting utilities", () => {
    it("formats currency and ratio values correctly", () => {
      expect(formatCurrencyValue(12500, "USD")).toContain("USD");
      expect(formatCurrencyValue(null)).toBe("-");
      expect(formatRatioValue(48.512)).toBe("49");
      expect(formatRatioValue(Infinity)).toBe("-");
    });

    it("extracts action drivers with correct factor attributes", () => {
      const driversA = extractActionDrivers(mockActionA, mockNodes);
      expect(driversA).toHaveLength(1);
      expect(driversA[0].name).toBe("Active Volunteers");
      expect(driversA[0].operand).toBe(15);
      expect(driversA[0].isEstimate).toBe(false);

      const driversB = extractActionDrivers(mockActionB, mockNodes);
      expect(driversB[0].name).toBe("Food Donated");
      expect(driversB[0].isEstimate).toBe(true);

      const driversC = extractActionDrivers(mockActionC, mockNodes);
      expect(driversC).toHaveLength(0);
    });
  });

  describe("Explain Ranking (Action Comparison)", () => {
    it("generates English comparison with ZERO Chinese characters", () => {
      const comparison = explainActionComparison(mockActionA, mockActionB, mockNodes, {
        locale: "en-us",
        currency: "USD"
      });

      expect(comparison.delta.leverage).toBeCloseTo(36.2, 1);
      expect(comparison.summary).toContain("leverage ratio");
      expect(comparison.narrative).toContain("Recruit & Train Volunteer Teams");

      // STRICT CONSTRAINT CHECK: No Chinese characters in English locale
      const chineseCharRegex = /[\u4e00-\u9fff]/;
      expect(chineseCharRegex.test(comparison.summary)).toBe(false);
      expect(chineseCharRegex.test(comparison.narrative)).toBe(false);
    });

    it("generates Traditional Chinese comparison satisfying 用詞優雅 and 效應比", () => {
      const comparison = explainActionComparison(mockActionA, mockActionB, mockNodes, {
        locale: "zh-tw",
        currency: "TWD"
      });

      expect(comparison.summary).toContain("效應比");
      expect(comparison.narrative).toContain("系統動態學模擬計算");
      expect(comparison.narrative).toContain("驅動要素");
      expect(comparison.narrative).toContain("淨效益折現值");
      expect(comparison.narrative).toContain("尚需直接經費");
    });

    it("handles equal leverage and edge cases gracefully", () => {
      const equalAction = { ...mockActionA, id: "act_equal" };
      const comparison = explainActionComparison(mockActionA, equalAction, mockNodes, {
        locale: "en-us"
      });
      expect(comparison.delta.leverage).toBe(0);
      expect(comparison.summary).toContain("identical leverage");
    });
  });

  describe("5-Part Leadership Decision Brief Generation", () => {
    it("generates all 5 required roadmap sections in English without Chinese characters", () => {
      const brief = generateDecisionBrief(
        [mockActionA, mockActionB, mockActionC],
        mockNodes,
        {
          locale: "en-us",
          currency: "USD",
          orgName: "Food Rescue Collective",
          modelName: "Core Operations Model",
          authorName: "Strategy Director"
        }
      );

      expect(brief).toBeDefined();
      expect(brief.metadata.optionsCount).toBe(3);

      // Section 1: The decision, in one sentence, and options compared
      expect(brief.section1.decisionQuestion).toBeDefined();
      expect(brief.section1.optionsOverview).toContain("Food Rescue Collective");

      // Section 2: Structured numbers table computed by mipa
      expect(brief.section2.options).toHaveLength(3);
      expect(brief.section2.options[0].rank).toBe(1);
      expect(brief.section2.options[0].title).toBe("Recruit & Train Volunteer Teams");
      expect(brief.section2.options[0].actionLeverage).toBe(48.5);

      // Section 3: Why top option ranks first
      expect(brief.section3.narrative).toContain("Recruit & Train Volunteer Teams");

      // Section 4: Key assumptions and estimates
      expect(brief.section4.narrative).toContain("The ranking depends primarily on the following");

      // Section 5: What brief does not cover
      expect(brief.section5.title).toContain("Unmodeled Considerations");
      expect(brief.section5.narrative).toContain("qualitative leadership appraisal");

      // Strict validation: ZERO Chinese characters in English brief
      const fullText = [
        brief.section1.decisionQuestion,
        brief.section1.optionsOverview,
        brief.section3.narrative,
        brief.section4.narrative,
        brief.section5.narrative
      ].join("\n");

      const chineseCharRegex = /[\u4e00-\u9fff]/;
      expect(chineseCharRegex.test(fullText)).toBe(false);
    });

    it("generates elegant Traditional Chinese brief with 效應比 and refined phrasing", () => {
      const brief = generateDecisionBrief(
        [mockActionA, mockActionB, mockActionC],
        mockNodes,
        {
          locale: "zh-tw",
          currency: "TWD",
          orgName: "社會效益推展協會",
          modelName: "組織綜效模型",
          authorName: "專案經理"
        }
      );

      expect(brief.section1.decisionQuestion).toContain("效應比");
      expect(brief.section2.options[0].uncertaintySummary).toBe("基於實證基準");
      expect(brief.section2.options[1].uncertaintySummary).toBe("包含估算參數");
      expect(brief.section3.narrative).toContain("效應比");
      expect(brief.section4.narrative).toContain("本排序結果奠基於以下關鍵假設");
      expect(brief.section5.narrative).toContain("宏觀政策與法規風險");
    });
  });

  describe("Strict Simulation Number Verification Check", () => {
    it("validates legitimate cited simulation numbers", () => {
      const brief = generateDecisionBrief([mockActionA, mockActionB], mockNodes, { locale: "en-us" });
      const narrative = `The top option achieves a net benefit of 125000 and total ROI of 24.2, compared to 35000 and 8.5 for the runner up. Direct costs are 1200 versus 2500.`;

      const result = validateBriefNumbers(narrative, brief.verifiedNumbers);
      expect(result.valid).toBe(true);
      expect(result.unverifiedNumbers).toHaveLength(0);
    });

    it("rejects hallucinated or unmatched numbers", () => {
      const brief = generateDecisionBrief([mockActionA, mockActionB], mockNodes, { locale: "en-us" });
      const narrativeWithHallucination = `This action will yield a profit of 999999 and save 777777 hours.`;

      const result = validateBriefNumbers(narrativeWithHallucination, brief.verifiedNumbers);
      expect(result.valid).toBe(false);
      expect(result.unverifiedNumbers).toContain(999999);
      expect(result.unverifiedNumbers).toContain(777777);
    });
  });

  describe("Export formats (Markdown and CSV)", () => {
    it("formats brief cleanly into Markdown", () => {
      const brief = generateDecisionBrief([mockActionA, mockActionB], mockNodes, { locale: "en-us" });
      const md = formatBriefAsMarkdown(brief);

      expect(md).toContain("# Executive Decision Brief:");
      expect(md).toContain("| Rank | Option | Leverage |");
      expect(md).toContain("Recruit & Train Volunteer Teams");
      expect(/[\u4e00-\u9fff]/.test(md)).toBe(false);
    });

    it("formats options comparison into CSV", () => {
      const brief = generateDecisionBrief([mockActionA, mockActionB], mockNodes, { locale: "en-us" });
      const csv = formatBriefAsCsv(brief);

      expect(csv).toContain("Rank,Option,Leverage,Net Benefit NPV");
      expect(csv).toContain('"Recruit & Train Volunteer Teams"');
      expect(/[\u4e00-\u9fff]/.test(csv)).toBe(false);
    });
  });
});
