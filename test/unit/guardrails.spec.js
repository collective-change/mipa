import { describe, it, expect } from "vitest";
import {
  evaluateGuardrailViolations,
  hasGuardrailBreach,
  hasActionCausedBreach
} from "@/utils/guardrails";
import { generateDecisionBrief, formatBriefAsMarkdown } from "@/utils/decisionBrief";
import messages from "@/i18n";

describe("Organizational Guardrails & Negative Side-Effect Detection", () => {
  const modelNodes = [
    {
      id: "node_cash",
      name: "Cash Reserves",
      symbol: "cash",
      unit: "USD",
      isGuardrail: true,
      guardrailMin: 10000,
      guardrailBreachMessage: "Insolvency risk"
    },
    {
      id: "node_burnout",
      name: "Staff Burnout Index",
      symbol: "burnout",
      unit: "points",
      isGuardrail: true,
      guardrailMax: 80,
      guardrailBreachMessage: "Severe employee turnover"
    },
    {
      id: "node_sales",
      name: "Monthly Sales",
      symbol: "sales",
      unit: "USD"
      // not a guardrail
    }
  ];

  it("detects minimum bound breach when factor drops below guardrailMin", () => {
    const ifDoneNodesValues = {
      node_cash: [20000, 15000, 8000, 12000],
      node_burnout: [30, 40, 50, 60]
    };
    const ifNotDoneNodesValues = {
      node_cash: [20000, 18000, 16000, 15000],
      node_burnout: [30, 35, 40, 45]
    };
    const timeSPoints = [0, 3600, 7200, 10800];

    const violations = evaluateGuardrailViolations(
      modelNodes,
      ifDoneNodesValues,
      ifNotDoneNodesValues,
      timeSPoints
    );

    expect(violations.length).toBe(1);
    const v = violations[0];
    expect(v.factorId).toBe("node_cash");
    expect(v.boundType).toBe("min");
    expect(v.threshold).toBe(10000);
    expect(v.worstValue).toBe(8000);
    expect(v.breachMagnitude).toBe(2000);
    expect(v.isActionCaused).toBe(true);
    expect(v.message).toBe("Insolvency risk");
  });

  it("detects maximum bound breach when factor exceeds guardrailMax", () => {
    const ifDoneNodesValues = {
      node_cash: [25000, 20000, 18000],
      node_burnout: [50, 70, 92]
    };
    const ifNotDoneNodesValues = {
      node_cash: [25000, 22000, 20000],
      node_burnout: [50, 55, 60]
    };

    const violations = evaluateGuardrailViolations(
      modelNodes,
      ifDoneNodesValues,
      ifNotDoneNodesValues
    );

    expect(violations.length).toBe(1);
    const v = violations[0];
    expect(v.factorId).toBe("node_burnout");
    expect(v.boundType).toBe("max");
    expect(v.threshold).toBe(80);
    expect(v.worstValue).toBe(92);
    expect(v.breachMagnitude).toBe(12);
    expect(v.isActionCaused).toBe(true);
  });

  it("returns empty array when all trajectories remain within safe guardrail boundaries", () => {
    const ifDoneNodesValues = {
      node_cash: [30000, 25000, 20000],
      node_burnout: [40, 50, 60]
    };

    const violations = evaluateGuardrailViolations(modelNodes, ifDoneNodesValues);
    expect(violations.length).toBe(0);
  });

  it("checks hasGuardrailBreach and hasActionCausedBreach helper predicates", () => {
    const safeAction = { id: "a1", guardrailViolations: [] };
    const breachAction = {
      id: "a2",
      guardrailViolations: [{ factorId: "node_cash", isActionCaused: true }]
    };
    const preexistingBreachAction = {
      id: "a3",
      guardrailViolations: [{ factorId: "node_cash", isActionCaused: false }]
    };

    expect(hasGuardrailBreach(safeAction)).toBe(false);
    expect(hasGuardrailBreach(breachAction)).toBe(true);
    expect(hasActionCausedBreach(breachAction)).toBe(true);
    expect(hasActionCausedBreach(preexistingBreachAction)).toBe(false);
  });

  it("integrates guardrail violations into Decision Brief and Markdown report", () => {
    const actions = [
      {
        id: "act_1",
        title: "Aggressive Expansion",
        actionLeverage: 120,
        marginalTotalBenefitNpv: 500000,
        marginalTotalCostNpv: 50000,
        marginalNetTotalBenefitNpv: 450000,
        totalRoi: 9,
        outstandingDirectCosts: 30000,
        estEffortHrs: 150,
        guardrailViolations: [
          {
            factorId: "node_burnout",
            factorName: "Staff Burnout Index",
            boundType: "max",
            threshold: 80,
            worstValue: 95,
            unit: "points",
            message: "Critical turnover risk"
          }
        ]
      }
    ];

    const brief = generateDecisionBrief(actions, modelNodes, {
      modelName: "Strategic Model",
      orgName: "Test Org",
      currency: "USD",
      locale: "en-us"
    });

    expect(brief.section4.guardrailViolations.length).toBe(1);
    expect(brief.section4.guardrailViolations[0].factorName).toBe("Staff Burnout Index");

    const markdown = formatBriefAsMarkdown(brief);
    expect(markdown).toContain("Organizational Guardrails & Side-Effect Safety");
    expect(markdown).toContain("Staff Burnout Index");
    expect(markdown).toContain("Critical turnover risk");
  });

  it("verifies zero Chinese characters in guardrail i18n English keys", () => {
    const en = messages["en-us"];
    const guardrailKeys = [
      "factorGuardrailSection",
      "isGuardrailFactor",
      "guardrailMin",
      "guardrailMinHint",
      "guardrailMax",
      "guardrailMaxHint",
      "guardrailBreachMessage",
      "guardrailBreachMessageHint",
      "guardrailBreachBadge",
      "guardrailBreachWarningTitle",
      "belowMinimum",
      "exceedsMaximum",
      "guardrailSectionTitle",
      "guardrailsAllSafe",
      "guardrailBreachDetected",
      "guardrailThreshold",
      "projectedWorstValue",
      "breachMagnitudeLabel",
      "actionCausedSideEffect"
    ];

    const chineseRegex = /[\u4e00-\u9fa5]/;
    for (const key of guardrailKeys) {
      expect(en[key], `Missing en key: ${key}`).toBeDefined();
      expect(chineseRegex.test(en[key]), `Key ${key} has Chinese in English locale: ${en[key]}`).toBe(false);
    }
  });

  it("verifies Traditional Chinese translation completeness for guardrail keys", () => {
    const zh = messages["zh-tw"];
    const guardrailKeys = [
      "factorGuardrailSection",
      "isGuardrailFactor",
      "guardrailMin",
      "guardrailMinHint",
      "guardrailMax",
      "guardrailMaxHint",
      "guardrailBreachMessage",
      "guardrailBreachMessageHint",
      "guardrailBreachBadge",
      "guardrailBreachWarningTitle",
      "belowMinimum",
      "exceedsMaximum",
      "guardrailSectionTitle",
      "guardrailsAllSafe",
      "guardrailBreachDetected",
      "guardrailThreshold",
      "projectedWorstValue",
      "breachMagnitudeLabel",
      "actionCausedSideEffect"
    ];

    for (const key of guardrailKeys) {
      expect(zh[key], `Missing zh-tw key: ${key}`).toBeDefined();
      expect(zh[key].length).toBeGreaterThan(0);
    }
  });
});
