import { describe, it, expect } from "vitest";
import {
  sampleTriangular,
  samplePert,
  runMonteCarloSimulation,
  analyzeActionsWithMonteCarlo
} from "../../src/utils/monteCarlo";
import { generateDecisionBrief, formatBriefAsMarkdown } from "../../src/utils/decisionBrief";
import fs from "fs";
import path from "path";

describe("Monte Carlo Uncertainty & Downside Risk Engine", () => {
  describe("sampleTriangular", () => {
    it("returns boundary value when min === max", () => {
      expect(sampleTriangular(10, 10, 10)).toBe(10);
    });

    it("samples within boundaries [min, max]", () => {
      for (let i = 0; i < 50; i++) {
        const val = sampleTriangular(5, 10, 20);
        expect(val).toBeGreaterThanOrEqual(5);
        expect(val).toBeLessThanOrEqual(20);
      }
    });

    it("handles inverted bounds gracefully", () => {
      const val = sampleTriangular(20, 10, 5);
      expect(val).toBeGreaterThanOrEqual(5);
      expect(val).toBeLessThanOrEqual(20);
    });
  });

  describe("samplePert", () => {
    it("returns boundary value when min === max", () => {
      expect(samplePert(15, 15, 15)).toBe(15);
    });

    it("samples strictly within [min, max] range", () => {
      for (let i = 0; i < 50; i++) {
        const val = samplePert(10, 20, 30);
        expect(val).toBeGreaterThanOrEqual(10);
        expect(val).toBeLessThanOrEqual(30);
      }
    });
  });

  describe("runMonteCarloSimulation", () => {
    it("computes ordered percentiles (P10 <= P50 <= P90) and VaR95", () => {
      const action = {
        id: "act-1",
        title: "Disaster Preparedness Training",
        marginalNetTotalBenefitNpv: 500000,
        outstandingDirectCosts: 100000,
        totalRoi: 5.0
      };

      const result = runMonteCarloSimulation(action, { trials: 200 });

      expect(result).toBeDefined();
      expect(result.trials).toBe(200);

      const { leverage, netBenefit, downsideRisk } = result;

      // Percentiles must be strictly monotonic
      expect(leverage.p10).toBeLessThanOrEqual(leverage.p50);
      expect(leverage.p50).toBeLessThanOrEqual(leverage.p90);
      expect(leverage.var95).toBeLessThanOrEqual(leverage.p10);

      expect(netBenefit.p10).toBeLessThanOrEqual(netBenefit.p50);
      expect(netBenefit.p50).toBeLessThanOrEqual(netBenefit.p90);

      // Downside risk metrics
      expect(downsideRisk.probLossPercent).toBeGreaterThanOrEqual(0);
      expect(downsideRisk.probLossPercent).toBeLessThanOrEqual(100);
      expect(["low", "moderate", "high"]).toContain(downsideRisk.riskRating);
      expect(leverage.riskAdjusted).toBeGreaterThanOrEqual(0);
    });

    it("flags high downside risk for high probability of loss or negative benefits", () => {
      const riskyAction = {
        id: "act-risk",
        title: "Speculative Pilot",
        marginalNetTotalBenefitNpv: -10000,
        outstandingDirectCosts: 50000,
        totalRoi: 0.2
      };

      const result = runMonteCarloSimulation(riskyAction, { trials: 100 });
      expect(result.downsideRisk.riskRating).toBe("high");
      expect(result.downsideRisk.probLossPercent).toBeGreaterThan(50);
    });

    it("handles zero or missing action metrics gracefully without throwing", () => {
      const emptyAction = {};
      const result = runMonteCarloSimulation(emptyAction, { trials: 50 });
      expect(result).toBeDefined();
      expect(isFinite(result.leverage.p50)).toBe(true);
    });
  });

  describe("analyzeActionsWithMonteCarlo", () => {
    it("enriches multiple actions with Monte Carlo statistics", () => {
      const actions = [
        { id: "a1", marginalNetTotalBenefitNpv: 200000, outstandingDirectCosts: 50000, totalRoi: 4 },
        { id: "a2", marginalNetTotalBenefitNpv: 100000, outstandingDirectCosts: 30000, totalRoi: 3.3 }
      ];

      const analyzed = analyzeActionsWithMonteCarlo(actions, { trials: 100 });
      expect(analyzed.length).toBe(2);
      expect(analyzed[0].monteCarlo).toBeDefined();
      expect(analyzed[1].monteCarlo.leverage.p50).toBeGreaterThan(0);
    });

    it("returns empty array for invalid inputs", () => {
      expect(analyzeActionsWithMonteCarlo(null)).toEqual([]);
    });
  });

  describe("Decision Brief Integration", () => {
    it("includes Monte Carlo analysis and confidence intervals in decision brief", () => {
      const actions = [
        {
          id: "act-1",
          title: "Community Outreach",
          actionLeverage: 12.5,
          marginalNetTotalBenefitNpv: 250000,
          outstandingDirectCosts: 20000,
          totalRoi: 12.5
        },
        {
          id: "act-2",
          title: "Warehouse Expansion",
          actionLeverage: 4.2,
          marginalNetTotalBenefitNpv: 420000,
          outstandingDirectCosts: 100000,
          totalRoi: 4.2
        }
      ];

      const brief = generateDecisionBrief(actions, [], {
        orgName: "Global Foundation",
        modelName: "Relief Dynamics 2026",
        locale: "en-us"
      });

      expect(brief).toBeDefined();
      expect(brief.section2.options[0].monteCarlo).toBeDefined();
      expect(brief.section4.monteCarloAnalysis).toBeDefined();
      expect(brief.section4.monteCarloAnalysis.length).toBe(2);

      const markdown = formatBriefAsMarkdown(brief);
      expect(markdown).toContain("Monte Carlo Uncertainty & Downside Risk Profile");
      expect(markdown).toContain("P10 (Downside)");
      expect(markdown).toContain("P50 (Median)");
      expect(markdown).toContain("Downside VaR95");
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
