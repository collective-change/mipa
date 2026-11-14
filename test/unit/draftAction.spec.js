import { describe, it, expect } from "vitest";
import {
  heuristicDraftAction,
  compileActionFromProposal
} from "@/utils/util-aiActionDraft";

describe("util-aiActionDraft.js", () => {
  const sampleNodes = [
    {
      id: "node-electricity",
      name: "每月用電費用",
      symbol: "electricityCost",
      unit: "TWD",
      formula: "25000"
    },
    {
      id: "node-volunteers",
      name: "常態參與志工人數",
      symbol: "activeVolunteers",
      unit: "",
      formula: "120"
    },
    {
      id: "node-carbon",
      name: "溫室氣體碳排量",
      symbol: "carbonEmissions",
      unit: "kg",
      formula: "5000"
    },
    {
      id: "node-role-cost",
      name: "oneTimeSpending",
      symbol: "oneTimeSpending",
      unit: "TWD",
      formula: "0"
    }
  ];

  it("generates structured action proposal for solar panels idea (Chinese)", () => {
    const proposal = heuristicDraftAction(
      "在環保站安裝太陽能板以降低電費開銷與減少碳排",
      sampleNodes,
      { currency: "TWD" }
    );

    expect(proposal.title).toContain("安裝太陽能板");
    expect(proposal.currency).toBe("TWD");
    expect(proposal.estEffortHrs).toBeGreaterThan(0);
    expect(proposal.estSpending).toBeGreaterThan(0);
    expect(proposal.effortReasoning).toBeTruthy();
    expect(proposal.spendingReasoning).toBeTruthy();

    // Matched factor impacts
    expect(proposal.impacts.length).toBeGreaterThanOrEqual(1);
    const symbols = proposal.impacts.map(i => i.factorSymbol);
    expect(symbols.some(s => s === "electricityCost" || s === "carbonEmissions")).toBe(true);

    const electricityImpact = proposal.impacts.find(i => i.factorSymbol === "electricityCost");
    if (electricityImpact) {
      expect(electricityImpact.operation).toBe("-");
      expect(electricityImpact.nodeId).toBe("node-electricity");
    }
  });

  it("generates structured action proposal for volunteer recruitment idea (English)", () => {
    const englishNodes = [
      { id: "node-vols", name: "Active Volunteers", symbol: "activeVolunteers", unit: "people" },
      { id: "node-outreach", name: "Community Outreach", symbol: "communityOutreach", unit: "events" }
    ];

    const proposal = heuristicDraftAction(
      "Recruit and train 50 new volunteers for community outreach",
      englishNodes,
      { currency: "USD" }
    );

    expect(proposal.title).toContain("Recruit and train 50 new volunteers");
    expect(proposal.currency).toBe("USD");
    expect(proposal.estEffortHrs).toBeGreaterThan(0);
    expect(proposal.estSpending).toBeGreaterThan(0);
    expect(proposal.impacts.length).toBeGreaterThanOrEqual(1);

    const volImpact = proposal.impacts.find(i => i.factorSymbol === "activeVolunteers");
    expect(volImpact).toBeDefined();
    expect(volImpact.operation).toBe("+");
  });

  it("handles empty nodes gracefully without throwing", () => {
    const proposal = heuristicDraftAction("General initiative", [], { currency: "USD" });
    expect(proposal.title).toBe("General initiative");
    expect(proposal.impacts).toEqual([]);
    expect(proposal.estEffortHrs).toBeGreaterThan(0);
  });

  it("compiles proposal into complete mipa action document", () => {
    const proposal = {
      title: "環保站太陽能板設置案",
      summary: "於環保站鋪設太陽能發電系統。",
      estEffortHrs: 120,
      effortReasoning: "前置評估20小時，施工驗收100小時。",
      estSpending: 300000,
      spendingReasoning: "設備20萬，外包安裝10萬。",
      currency: "TWD",
      notes: "需先評估屋頂載重。",
      impacts: [
        {
          factorSymbol: "electricityCost",
          factorName: "每月用電費用",
          operation: "-",
          operand: "8000",
          durationType: "for_period",
          durationNumber: 60,
          durationUnit: "months",
          thenText: "每月省下8000元電費"
        }
      ]
    };

    const action = compileActionFromProposal(proposal, sampleNodes, "org-123");

    expect(action.orgId).toBe("org-123");
    expect(action.title).toBe("環保站太陽能板設置案");
    expect(action.estEffortHrs).toBe(120);
    expect(action.estSpending).toBe(300000);
    expect(action.actionMchState.value).toBe("initiating");
    expect(action.notes).toContain("施工驗收100小時");
    expect(action.notes).toContain("需先評估屋頂載重");

    expect(action.impacts.length).toBe(1);
    const imp = action.impacts[0];
    expect(imp.nodeId).toBe("node-electricity");
    expect(imp.operation).toBe("-");
    expect(imp.operand).toBe("8000");
    expect(imp.durationType).toBe("for_period");
    expect(imp.durationNumber).toBe(60);
    expect(imp.durationUnit).toBe("months");
    expect(imp.thenText).toBe("每月省下8000元電費");
  });
});
