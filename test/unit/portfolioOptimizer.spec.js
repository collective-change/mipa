import { describe, it, expect } from "vitest";
import {
  solvePortfolioOptimization,
  DEFAULT_DEPARTMENTS
} from "@/utils/portfolioOptimizer";
import messages from "@/i18n";

describe("Portfolio Resource Bandwidth & Concurrency Optimizer", () => {
  const mockActions = [
    {
      id: "act_1",
      title: "Executive Strategic Review",
      marginalNetTotalBenefitNpv: 100000,
      outstandingDirectCosts: 10000,
      estEffortHrs: 60,
      departmentTag: "executive",
      actionLeverage: 10
    },
    {
      id: "act_2",
      title: "Community Outreach Campaign",
      marginalNetTotalBenefitNpv: 150000,
      outstandingDirectCosts: 20000,
      estEffortHrs: 180,
      departmentTag: "fieldwork",
      actionLeverage: 7.5
    },
    {
      id: "act_3",
      title: "Platform Modernization",
      marginalNetTotalBenefitNpv: 220000,
      outstandingDirectCosts: 30000,
      estEffortHrs: 250,
      departmentTag: "engineering",
      actionLeverage: 7.3
    },
    {
      id: "act_4",
      title: "Financial Restructuring",
      marginalNetTotalBenefitNpv: 80000,
      outstandingDirectCosts: 15000,
      estEffortHrs: 100,
      departmentTag: "finance",
      actionLeverage: 5.3
    }
  ];

  it("selects all actions when capacity and budget are unlimited", () => {
    const result = solvePortfolioOptimization(mockActions);
    expect(result.selectedActions.length).toBe(4);
    expect(result.excludedActions.length).toBe(0);
    expect(result.totalBenefitNpv).toBe(550000);
    expect(result.totalCostNpv).toBe(75000);
    expect(result.totalEffortHrs).toBe(590);
  });

  it("respects total budget constraint and excludes lower-efficiency initiatives", () => {
    // Budget limit of $35,000 allows act_1 ($10k) and act_2 ($20k) = $30k, but not act_3 ($30k) together
    const result = solvePortfolioOptimization(mockActions, {
      maxTotalBudget: 35000
    });

    expect(result.totalCostNpv).toBeLessThanOrEqual(35000);
    expect(result.selectedActions.some((a) => a.id === "act_1")).toBe(true);
    expect(result.selectedActions.some((a) => a.id === "act_2")).toBe(true);
    expect(result.excludedActions.some((e) => e.action.id === "act_3")).toBe(true);
  });

  it("respects total effort hours limit and enforces workforce bandwidth", () => {
    // Limit to 300 total hours
    const result = solvePortfolioOptimization(mockActions, {
      maxTotalHours: 300
    });

    expect(result.totalEffortHrs).toBeLessThanOrEqual(300);
    expect(result.selectedActions.length).toBeGreaterThan(0);
    for (const res of result.resourceUtilization) {
      if (res.key === "totalHours") {
        expect(res.used).toBeLessThanOrEqual(300);
      }
    }
  });

  it("enforces individual department caps (e.g. executive hours limit)", () => {
    // Executive cap is 40 hours, but act_1 requires 60 hours -> act_1 must be excluded
    const result = solvePortfolioOptimization(mockActions, {
      departmentCaps: {
        executive: 40
      }
    });

    expect(result.selectedActions.some((a) => a.id === "act_1")).toBe(false);
    const excludedAct1 = result.excludedActions.find((e) => e.action.id === "act_1");
    expect(excludedAct1).toBeDefined();
    expect(excludedAct1.bottleneckReason).toBe("dept_bottleneck_executive");
  });

  it("computes resource utilization percentages and statuses", () => {
    const result = solvePortfolioOptimization(mockActions, {
      maxTotalBudget: 50000,
      maxTotalHours: 400
    });

    expect(result.resourceUtilization.length).toBeGreaterThanOrEqual(2);
    const budgetRes = result.resourceUtilization.find((r) => r.key === "budget");
    expect(budgetRes).toBeDefined();
    expect(budgetRes.used).toBe(result.totalCostNpv);
    expect(budgetRes.percent).toBeGreaterThan(0);
    expect(["safe", "warning", "capped"]).toContain(budgetRes.status);
  });

  it("handles empty action list gracefully", () => {
    const result = solvePortfolioOptimization([]);
    expect(result.selectedActions).toEqual([]);
    expect(result.totalBenefitNpv).toBe(0);
    expect(result.totalCostNpv).toBe(0);
    expect(result.totalEffortHrs).toBe(0);
  });

  it("verifies zero Chinese characters in English locale for portfolio keys", () => {
    const en = messages["en-us"];
    const keys = [
      "optimizePortfolio",
      "portfolioOptimizerTitle",
      "portfolioOptimizerSubtitle",
      "departmentTag",
      "departmentTagHint",
      "deptExecutive",
      "deptOperations",
      "deptFieldwork",
      "deptEngineering",
      "deptFinance",
      "resourceConstraintsSection",
      "maxTotalBudget",
      "maxTotalHours",
      "departmentHoursLimits",
      "optimizationObjective",
      "maxNetBenefit",
      "maxLeverage",
      "recommendedBundle",
      "capacityUtilizationTitle",
      "excludedDueToBottlenecks",
      "bottleneckReason",
      "budget_bottleneck",
      "hours_bottleneck",
      "lower_relative_leverage",
      "applyToDecisionBrief"
    ];

    const chineseRegex = /[\u4e00-\u9fa5]/;
    for (const key of keys) {
      expect(en[key], `Missing en key: ${key}`).toBeDefined();
      expect(chineseRegex.test(en[key]), `Key ${key} has Chinese in en-us: ${en[key]}`).toBe(false);
    }
  });

  it("verifies Traditional Chinese translation completeness for portfolio keys", () => {
    const zh = messages["zh-tw"];
    const keys = [
      "optimizePortfolio",
      "portfolioOptimizerTitle",
      "portfolioOptimizerSubtitle",
      "departmentTag",
      "departmentTagHint",
      "deptExecutive",
      "deptOperations",
      "deptFieldwork",
      "deptEngineering",
      "deptFinance",
      "resourceConstraintsSection",
      "maxTotalBudget",
      "maxTotalHours",
      "departmentHoursLimits",
      "optimizationObjective",
      "maxNetBenefit",
      "maxLeverage",
      "recommendedBundle",
      "capacityUtilizationTitle",
      "excludedDueToBottlenecks",
      "bottleneckReason",
      "budget_bottleneck",
      "hours_bottleneck",
      "lower_relative_leverage",
      "applyToDecisionBrief"
    ];

    for (const key of keys) {
      expect(zh[key], `Missing zh-tw key: ${key}`).toBeDefined();
      expect(zh[key].length).toBeGreaterThan(0);
    }
  });
});
