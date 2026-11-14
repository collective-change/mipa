import { describe, it, expect } from "vitest";
import {
  calculateSroiMetrics,
  formatSroiRatio,
  generateSroiImpactMap,
  generateSroiMarkdownReport
} from "@/utils/sroi";

describe("SROI (Social Return on Investment) Utilities", () => {
  const sampleAction = {
    id: "action_disaster_relief",
    title: "Emergency Water Purification Surge",
    marginalWorldBenefitNpv: 500000,
    marginalWorldCostNpv: 20000,
    outstandingDirectCosts: 100000,
    deadweight: 15,
    attribution: 20,
    displacement: 5,
    dropOffRate: 10,
    impacts: [
      {
        id: "imp_1",
        nodeId: "node_clean_water",
        operand: 50000,
        operation: "+",
        durationType: "just_once"
      },
      {
        id: "imp_2",
        nodeId: "node_carbon_offset",
        operand: 120,
        operation: "+",
        durationType: "just_once"
      }
    ]
  };

  const sampleNodes = [
    { id: "node_clean_water", name: "Clean Water Distributed", unit: "liters" },
    { id: "node_carbon_offset", name: "Emissions Reduced", unit: "tons CO2" }
  ];

  const sampleOrg = {
    name: "Global Relief Initiative",
    currency: "USD"
  };

  it("calculates SROI metrics with standard adjustment factors", () => {
    const res = calculateSroiMetrics(sampleAction);

    // dw: 15% -> 0.85
    // attr: 20% -> 0.80
    // disp: 5% -> 0.95
    // adjustmentFactor = 0.85 * 0.80 * 0.95 = 0.646
    expect(res.adjustmentFactor).toBeCloseTo(0.646, 3);

    // gross = 500,000
    // adjusted = 500,000 * 0.646 = 323,000
    expect(res.adjustedSocialBenefitNpv).toBeCloseTo(323000, 1);

    // net = 323,000 - 20,000 = 303,000
    expect(res.netSocialBenefitNpv).toBeCloseTo(303000, 1);

    // total investment = 100,000
    // sroiRatio = 303,000 / 100,000 = 3.03
    expect(res.sroiRatio).toBeCloseTo(3.03, 2);
  });

  it("handles zero direct investment gracefully", () => {
    const zeroCostAction = {
      ...sampleAction,
      outstandingDirectCosts: 0,
      estDirectCosts: 0
    };
    const res = calculateSroiMetrics(zeroCostAction);
    expect(res.totalInvestmentInputs).toBe(0);
    expect(res.sroiRatio).toBeNull();
  });

  it("supports parameter overrides for scenario simulation", () => {
    const override = { deadweight: 0, attribution: 0, displacement: 0 };
    const res = calculateSroiMetrics(sampleAction, override);
    expect(res.adjustmentFactor).toBe(1);
    expect(res.netSocialBenefitNpv).toBe(480000); // 500,000 - 20,000
    expect(res.sroiRatio).toBe(4.8); // 480,000 / 100,000
  });

  it("formats SROI ratio correctly", () => {
    expect(formatSroiRatio(3.42)).toBe("3.42:1");
    expect(formatSroiRatio(null)).toBe("-");
    expect(formatSroiRatio(undefined)).toBe("-");
    expect(formatSroiRatio(NaN)).toBe("-");
  });

  it("generates structured SROI Impact Map rows with stakeholder mapping", () => {
    const map = generateSroiImpactMap(sampleAction, sampleNodes, sampleOrg);
    expect(map.rows).toHaveLength(2);
    expect(map.rows[0].factorName).toBe("Clean Water Distributed");
    expect(map.rows[0].stakeholder).toBe("Community & Beneficiaries");
    expect(map.rows[1].factorName).toBe("Emissions Reduced");
    expect(map.rows[1].stakeholder).toBe("Environment & Planet");
    expect(map.summary.sroiRatio).toBeCloseTo(3.03, 2);
  });

  it("generates markdown SROI executive report", () => {
    const md = generateSroiMarkdownReport(sampleAction, sampleNodes, sampleOrg);
    expect(md).toContain("Social Return on Investment (SROI) Analysis");
    expect(md).toContain("Global Relief Initiative");
    expect(md).toContain("3.03:1");
    expect(md).toContain("Clean Water Distributed");
    expect(md).toContain("SROI Impact Map");
  });
});
