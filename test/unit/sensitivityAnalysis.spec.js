import { describe, it, expect } from "vitest";
import {
  listSensitivityInputs,
  evaluatePerturbedAction,
  screenInputSensitivity,
  findTurningPoint,
  generateSensitivityReport
} from "@/utils/sensitivityAnalysis";

const mockNodes = [
  { id: "node_volunteers", symbol: "volunteers", name: "Active Volunteers", unit: "people", isEstimate: false },
  { id: "node_meals", symbol: "mealsServed", name: "Meals Served", unit: "meals", isEstimate: false },
  { id: "node_food", symbol: "foodDonatedKg", name: "Food Donated", unit: "kg", isEstimate: true, notes: "Subject to seasonal donations estimate" },
  { id: "node_meal_val", symbol: "valueOfAMeal", name: "Value of a Meal", unit: "USD", class: "constant", sysFormula: "3", isEstimate: false },
  { id: "node_running_costs", symbol: "monthlyRunningCosts", name: "Monthly Running Costs", unit: "USD", class: "constant", sysFormula: "1200", isEstimate: false }
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
  actionLeverage: 18.2,
  marginalNetTotalBenefitNpv: 45000,
  marginalOrgBenefitNpv: 15000,
  marginalWorldBenefitNpv: 30000,
  marginalOrgCostNpv: 4000,
  marginalWorldCostNpv: 0,
  marginalTotalBenefitNpv: 49000,
  marginalTotalCostNpv: 4000,
  outstandingDirectCosts: 2500,
  estEffortHrs: 80,
  estSpending: 2500,
  totalRoi: 9.8,
  impacts: [
    { nodeId: "node_food", symbol: "foodDonatedKg", operation: "+", operand: 1000, duration: "forever" }
  ]
};

describe("Feature 3: Sensitivity & Turning-Point Analysis Engine", () => {
  it("lists all candidate inputs from actions and model constants", () => {
    const inputs = listSensitivityInputs(mockActionA, mockActionB, mockNodes, { currency: "USD" });
    expect(inputs.length).toBeGreaterThan(4);

    const costInput = inputs.find((i) => i.type === "action_cost" && i.actionId === mockActionA.id);
    expect(costInput).toBeDefined();
    expect(costInput.baseValue).toBe(1200);

    const constantInput = inputs.find((i) => i.id === "node_valueOfAMeal");
    expect(constantInput).toBeDefined();
    expect(constantInput.baseValue).toBe(3);
  });

  it("evaluates perturbed action leverage under cost increase", () => {
    const costInput = {
      type: "action_cost",
      actionId: mockActionA.id,
      baseValue: 1200
    };

    const baseEval = evaluatePerturbedAction(mockActionA, costInput, 1200);
    const perturbed = evaluatePerturbedAction(mockActionA, costInput, 2400);

    // Doubling direct cost should reduce leverage
    expect(perturbed.actionLeverage).toBeLessThan(baseEval.actionLeverage);
    expect(perturbed.outstandingDirectCosts).toBe(2400);
  });

  it("screens inputs for leverage swings and potential ranking flips", () => {
    const costInput = {
      id: "act_a_cost",
      type: "action_cost",
      actionId: mockActionA.id,
      baseValue: 1200,
      min: 120,
      max: 3600
    };

    const result = screenInputSensitivity(mockActionA, mockActionB, costInput, 0.30);
    expect(result.sensitivityScore).toBeGreaterThan(0);
    expect(result.maxLeverageSwing).toBeGreaterThan(0);
  });

  it("finds the critical turning point where Option B would overtake Option A", () => {
    const costInput = {
      id: "act_a_cost",
      type: "action_cost",
      actionId: mockActionA.id,
      baseValue: 1200,
      min: 100,
      max: 15000
    };

    const turningPoint = findTurningPoint(mockActionA, mockActionB, costInput);
    expect(turningPoint.found).toBe(true);
    expect(turningPoint.turningPoint).toBeGreaterThan(mockActionA.outstandingDirectCosts);
    expect(turningPoint.percentShift).toBeGreaterThan(0);
    expect(turningPoint.direction).toBe("increase");
  });

  it("generates English sensitivity report with ZERO Chinese characters", () => {
    const report = generateSensitivityReport(mockActionA, mockActionB, mockNodes, {}, {
      locale: "en-us",
      currency: "USD"
    });

    expect(report).toBeDefined();
    expect(report.turningPoints.length).toBeGreaterThan(0);
    expect(report.executiveSummary.toLowerCase()).toContain("robustness");
    expect(report.narrative).toContain("Decision Robustness");

    // Strict constraint: ZERO Chinese characters in English locale
    const chineseCharRegex = /[\u4e00-\u9fff]/;
    expect(chineseCharRegex.test(report.executiveSummary)).toBe(false);
    expect(chineseCharRegex.test(report.narrative)).toBe(false);
  });

  it("generates Traditional Chinese sensitivity report satisfying 用詞優雅 and 翻轉點", () => {
    const report = generateSensitivityReport(mockActionA, mockActionB, mockNodes, {}, {
      locale: "zh-tw",
      currency: "TWD"
    });

    expect(report.executiveSummary).toContain("抗風險裕度");
    expect(report.narrative).toContain("決策穩健性與關鍵假設評估");
    expect(report.narrative).toContain("關鍵假設翻轉點分析");
    expect(report.narrative).toContain("決策翻轉臨界值");
    expect(report.narrative).toContain("效應比");
  });

  it("supports configurable perturbation range (e.g. 10%, 25%, 50%) for dynamic scenario testing", () => {
    const report10 = generateSensitivityReport(mockActionA, mockActionB, mockNodes, {}, {
      locale: "en-us",
      currency: "USD",
      perturbationRange: 0.10
    });
    expect(report10.perturbationRange).toBe(0.10);
    expect(report10.perturbationPct).toBe(10);
    expect(report10.narrative).toContain("+/- 10% range");

    const report50 = generateSensitivityReport(mockActionA, mockActionB, mockNodes, {}, {
      locale: "zh-tw",
      currency: "TWD",
      perturbationRange: 0.50
    });
    expect(report50.perturbationRange).toBe(0.50);
    expect(report50.perturbationPct).toBe(50);
    expect(report50.narrative).toContain("±50% 區間");
  });
});
