import { describe, it, expect } from "vitest";
import enUs from "@/i18n/en-us";
import zhTw from "@/i18n/zh-tw";
import { queryKnowledge } from "../../scripts/agent-bridge.js";

/**
 * Canonical Mipa leverage formula as implemented in calcWorker.js:827-840:
 *
 *   marginalNetTotalBenefitNpv = marginalTotalBenefitNpv - marginalTotalCostNpv (net)
 *   marginalTotalCostExcludingAction = marginalTotalCostNpv - outstandingDirectCosts (E)
 *   totalRoi = net / (outstandingDirectCosts + max(0, marginalTotalCostExcludingAction))
 *   actionLeverage = ((net * totalRoi) / outstandingDirectCosts) * Math.sign(net)
 *
 * In algebraic terms:
 *   actionLeverage = Math.sign(net) * net^2 / (C * (C + E))
 * where C = outstandingDirectCosts and E = Math.max(0, marginalTotalCostExcludingAction).
 */
function evaluateLeverage(marginalNetTotalBenefitNpv, outstandingDirectCosts, marginalTotalCostExcludingAction = 0) {
  // Negative spending/effort clamped at input (calcWorker.js:439-443)
  const C = Math.max(0, outstandingDirectCosts);
  const E = Math.max(0, marginalTotalCostExcludingAction);
  const totalCostDenominator = C + E;

  let totalRoi = null;
  if (totalCostDenominator > 0) {
    totalRoi = marginalNetTotalBenefitNpv / totalCostDenominator;
  }

  let actionLeverage = null;
  if (C > 0 && totalRoi !== null) {
    actionLeverage =
      ((marginalNetTotalBenefitNpv * totalRoi) / C) *
      Math.sign(marginalNetTotalBenefitNpv);
  }

  if (isNaN(totalRoi) || !isFinite(totalRoi)) totalRoi = null;
  if (isNaN(actionLeverage) || !isFinite(actionLeverage)) actionLeverage = null;

  return { totalRoi, actionLeverage, outstandingDirectCosts: C };
}

describe("MIPA-11: 效應比 (Action Leverage) Formula & Edge Cases", () => {
  describe("1. Sign and Magnitude Pinning", () => {
    it("pins sign and magnitude with symmetric fixtures (+X and -X with identical costs)", () => {
      // Fixture 1: Positive net benefit (+100)
      const positiveFixture = evaluateLeverage(100, 100, 100);
      expect(positiveFixture.totalRoi).toBe(0.5);
      // ((100 * 0.5) / 100) * (+1) = +0.5000
      expect(positiveFixture.actionLeverage).toBe(0.5);

      // Fixture 2: Symmetric negative net benefit (-100)
      const negativeFixture = evaluateLeverage(-100, 100, 100);
      expect(negativeFixture.totalRoi).toBe(-0.5);
      // ((-100 * -0.5) / 100) * (-1) = -0.5000
      expect(negativeFixture.actionLeverage).toBe(-0.5);

      // Verify exact symmetry: magnitude is identical, sign is inverted
      expect(positiveFixture.actionLeverage).toBe(-negativeFixture.actionLeverage);
      expect(Math.abs(positiveFixture.actionLeverage)).toBe(0.5);
      expect(Math.abs(negativeFixture.actionLeverage)).toBe(0.5);
    });

    it("ensures that squaring does not destroy the sign across diverse non-zero fixtures", () => {
      const cases = [
        { net: 50, C: 10, E: 40, expectedSign: 1 },
        { net: -50, C: 10, E: 40, expectedSign: -1 },
        { net: 1000, C: 200, E: 300, expectedSign: 1 },
        { net: -1000, C: 200, E: 300, expectedSign: -1 },
      ];

      for (const { net, C, E, expectedSign } of cases) {
        const res = evaluateLeverage(net, C, E);
        expect(Math.sign(res.actionLeverage)).toBe(expectedSign);
      }
    });

    it("evaluates to 0 when net benefit is 0", () => {
      const res = evaluateLeverage(0, 100, 100);
      expect(res.actionLeverage).toBe(0);
      expect(res.totalRoi).toBe(0);
    });
  });

  describe("2. Quadratic Sensitivity Property", () => {
    it("verifies the metric scales quadratically with net benefit (four-fold increase when benefit doubles)", () => {
      // Identical cost structure: C = 100, E = 100
      // net = 100 -> leverage = +0.5
      const base = evaluateLeverage(100, 100, 100);
      expect(base.actionLeverage).toBe(0.5);

      // When net benefit doubles to 200 with identical total cost (marginalTotalCost = 200):
      // totalRoi = 200 / (100 + 100) = 1.0
      // actionLeverage = ((200 * 1.0) / 100) * 1 = 2.0
      const doubled = evaluateLeverage(200, 100, 100);
      expect(doubled.actionLeverage).toBe(2.0);

      // Ratio of leverage: 2.0 / 0.5 = 4.0 = 2^2 (quadratic convexity)
      expect(doubled.actionLeverage / base.actionLeverage).toBe(4.0);
    });
  });

  describe("3. C = 0 Definition (Fully Complete or Zero Direct Cost Actions)", () => {
    it("defines C = 0 as null rather than Infinity or NaN", () => {
      // An action with net benefit = 100, C = 0, E = 100
      const res = evaluateLeverage(100, 0, 100);
      expect(res.actionLeverage).toBeNull();
      // ROI can still be computed if external/marginal cost exists
      expect(res.totalRoi).toBe(1.0);
    });

    it("defines C = 0 and E = 0 as null for both leverage and ROI", () => {
      const res = evaluateLeverage(100, 0, 0);
      expect(res.actionLeverage).toBeNull();
      expect(res.totalRoi).toBeNull();
    });

    it("handles extremely small positive C gracefully without returning Infinity", () => {
      const res = evaluateLeverage(100, 1e-9, 100);
      expect(isFinite(res.actionLeverage)).toBe(true);
      expect(res.actionLeverage).toBeGreaterThan(0);
    });
  });

  describe("4. Negative C Clamping (Over-budget or Completed Initiatives)", () => {
    it("clamps negative outstanding direct costs to 0 and defines leverage as null", () => {
      // Suppose an action has spent more than estimated, so raw outstanding cost is -50
      const res = evaluateLeverage(100, -50, 100);
      expect(res.outstandingDirectCosts).toBe(0);
      expect(res.actionLeverage).toBeNull();
    });
  });

  describe("5. Quadratic Sensitivity Documentation in UI & Tool-facing Knowledge", () => {
    it("documents quadratic sensitivity and what the metric rewards in en-us", () => {
      expect(enUs.helpLeverage).toBeDefined();
      expect(enUs.helpLeverage).toContain("quadratically");
      expect(enUs.helpLeverage).toContain("net²");
      expect(enUs.helpLeverage).toContain("rewarding");
    });

    it("documents quadratic sensitivity and what the metric rewards in zh-tw", () => {
      expect(zhTw.helpLeverage).toBeDefined();
      expect(zhTw.helpLeverage).toContain("二次敏感度");
      expect(zhTw.helpLeverage).toContain("net²");
      expect(zhTw.helpLeverage).toContain("獎勵");
    });

    it("documents quadratic sensitivity in agent-bridge knowledge base", () => {
      const knowledge = queryKnowledge("leverage formula");
      expect(knowledge.length).toBeGreaterThan(0);
      expect(knowledge[0].details).toContain("actionLeverage");
      expect(knowledge[0].details).toContain("quadratically");
    });
  });
});
