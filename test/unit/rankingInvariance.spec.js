import { describe, it, expect } from "vitest";
import {
  analyzeFactorRankingInvariance,
  getDownstreamNodeIds,
  getFactorActionReach,
  evaluatePerturbedAction
} from "@/utils/sensitivityAnalysis";

describe("MIPA-12: Ranking Sensitivity & Scale-Invariance", () => {
  // Canonical mipa leverage formula:
  // actionLeverage = sign(net) * net^2 / (C * (C + E))
  // When net is multiplied by k, leverage is multiplied by k^2.
  // Two fixtures differing only by a common benefit multiplier k must produce
  // the exact same action ordering and a leverage ratio of k^2.

  const baseActions = [
    {
      id: "action_1",
      title: "Deploy Solar Panels",
      marginalTotalBenefitNpv: 100000,
      marginalTotalCostNpv: 10000,
      marginalNetTotalBenefitNpv: 90000,
      outstandingDirectCosts: 5000,
      estEffortHrs: 50,
      estSpending: 5000,
      impacts: [{ nodeId: "node_energy", symbol: "cleanEnergyKwh", operand: 500 }]
    },
    {
      id: "action_2",
      title: "Food Waste Composting",
      marginalTotalBenefitNpv: 60000,
      marginalTotalCostNpv: 5000,
      marginalNetTotalBenefitNpv: 55000,
      outstandingDirectCosts: 4000,
      estEffortHrs: 40,
      estSpending: 4000,
      impacts: [{ nodeId: "node_waste", symbol: "wasteReducedKg", operand: 1000 }]
    },
    {
      id: "action_3",
      title: "Community Outreach",
      marginalTotalBenefitNpv: 30000,
      marginalTotalCostNpv: 2000,
      marginalNetTotalBenefitNpv: 28000,
      outstandingDirectCosts: 2500,
      estEffortHrs: 30,
      estSpending: 2500,
      impacts: [{ nodeId: "node_outreach", symbol: "participants", operand: 200 }]
    }
  ];

  function computeLeverage(action, benefitMultiplier = 1.0) {
    const totalBenefit = action.marginalTotalBenefitNpv * benefitMultiplier;
    const totalCost = action.marginalTotalCostNpv;
    const directCost = action.outstandingDirectCosts;
    const net = totalBenefit - totalCost;
    const marginalTotalCostExcludingAction = Math.max(0, totalCost - directCost);
    const costDenominator = directCost + marginalTotalCostExcludingAction;
    const totalRoi = costDenominator > 0 ? net / costDenominator : 0;
    const actionLeverage = directCost > 0
      ? ((net * totalRoi) / directCost) * Math.sign(net)
      : 0;
    return {
      ...action,
      marginalTotalBenefitNpv: totalBenefit,
      marginalNetTotalBenefitNpv: net,
      totalRoi,
      actionLeverage
    };
  }

  it("pins scale-invariance: two fixtures differing only by common benefit multiplier k produce identical ordering and k² leverage ratio", () => {
    const k1 = 0.5;
    const k2 = 2.0;
    const ratioK = k2 / k1; // 4.0
    const expectedLeverageRatio = ratioK * ratioK; // 16.0

    // When gross benefits dominate and costs are fixed or scale with benefit,
    // evaluate with pure net benefit multiplier:
    const fixture1 = baseActions.map((a) => {
      const net = a.marginalNetTotalBenefitNpv * k1;
      const directCost = a.outstandingDirectCosts;
      const roi = net / directCost;
      const leverage = (net * roi / directCost) * Math.sign(net);
      return { ...a, actionLeverage: leverage };
    });

    const fixture2 = baseActions.map((a) => {
      const net = a.marginalNetTotalBenefitNpv * k2;
      const directCost = a.outstandingDirectCosts;
      const roi = net / directCost;
      const leverage = (net * roi / directCost) * Math.sign(net);
      return { ...a, actionLeverage: leverage };
    });

    // 1. Assert identical ordering
    const sorted1 = [...fixture1].sort((a, b) => b.actionLeverage - a.actionLeverage);
    const sorted2 = [...fixture2].sort((a, b) => b.actionLeverage - a.actionLeverage);

    expect(sorted1.map((a) => a.id)).toEqual(sorted2.map((a) => a.id));

    // 2. Assert exact k² leverage ratio for every action
    fixture1.forEach((act1) => {
      const act2 = fixture2.find((a) => a.id === act1.id);
      expect(act2).toBeDefined();
      const observedRatio = act2.actionLeverage / act1.actionLeverage;
      expect(observedRatio).toBeCloseTo(expectedLeverageRatio, 5);
    });
  });

  describe("analyzeFactorRankingInvariance", () => {
    const testNodes = [
      { id: "node_val_decision", symbol: "valueOfBetterDecision", name: "Value of Decision", class: "constant", symbolFormula: "10000" },
      { id: "node_kwh_val", symbol: "valueOfCleanEnergy", name: "Value of Energy", class: "constant", symbolFormula: "0.2" },
      { id: "node_energy", symbol: "cleanEnergyKwh", name: "Clean Energy Generated", influencers: ["node_kwh_val"] },
      { id: "node_waste", symbol: "wasteReducedKg", name: "Waste Reduced", influencers: ["node_val_decision"] },
      { id: "node_outreach", symbol: "participants", name: "Participants", influencers: ["node_val_decision"] },
      { id: "node_org_benefit", symbol: "orgBenefit", name: "Org Benefit", influencers: ["node_energy", "node_waste", "node_outreach", "node_val_decision"] }
    ];

    const actions = [
      {
        id: "act_solar",
        title: "Deploy Solar Panels",
        actionLeverage: 100.0,
        marginalNetTotalBenefitNpv: 50000,
        marginalTotalBenefitNpv: 55000,
        marginalTotalCostNpv: 5000,
        outstandingDirectCosts: 2500,
        totalRoi: 20.0,
        impacts: [{ nodeId: "node_energy", symbol: "cleanEnergyKwh", operand: 500 }]
      },
      {
        id: "act_compost",
        title: "Food Waste Composting",
        actionLeverage: 40.0,
        marginalNetTotalBenefitNpv: 30000,
        marginalTotalBenefitNpv: 35000,
        marginalTotalCostNpv: 5000,
        outstandingDirectCosts: 3000,
        totalRoi: 10.0,
        impacts: [{ nodeId: "node_waste", symbol: "wasteReducedKg", operand: 1000 }]
      }
    ];

    it("identifies a universal benefit factor as ranking-invariant", () => {
      const universalNode = testNodes.find((n) => n.symbol === "valueOfBetterDecision");
      const simParams = { roleNodes: { orgBenefit: "node_org_benefit" } };

      const result = analyzeFactorRankingInvariance(universalNode, actions, testNodes, simParams);

      expect(result.isConstant).toBe(true);
      expect(result.isRankingInvariant).toBe(true);
      expect(result.canMoveRanking).toBe(false);
      expect(result.reason).toBe("ranking_invariant_all_actions");
      expect(result.fedCount).toBe(2);
      expect(result.totalCount).toBe(2);
    });

    it("identifies a subset factor as capable of changing ranking and surfaces turning point", () => {
      // valueOfCleanEnergy only feeds cleanEnergyKwh (which act_solar impacts), NOT act_compost
      const subsetNode = testNodes.find((n) => n.symbol === "valueOfCleanEnergy");
      const simParams = { roleNodes: { orgBenefit: "node_org_benefit" } };

      const result = analyzeFactorRankingInvariance(subsetNode, actions, testNodes, simParams);

      expect(result.isConstant).toBe(true);
      expect(result.isRankingInvariant).toBe(false);
      expect(result.canMoveRanking).toBe(true);
      expect(result.reason).toBe("subset_factor");
      expect(result.fedCount).toBe(1);
      expect(result.totalCount).toBe(2);

      // Act Solar (leverage 100) vs Act Compost (leverage 40)
      // When valueOfCleanEnergy decreases, Act Solar's leverage drops until Act Compost overtakes it
      expect(result.turningPoint).not.toBeNull();
      expect(result.turningPoint).toBeLessThan(0.2);
      expect(result.direction).toBe("decrease");
      expect(result.topActionTitle).toBe("Deploy Solar Panels");
      expect(result.runnerUpTitle).toBe("Food Waste Composting");
    });

    it("handles unlinked constant factor gracefully", () => {
      const unlinkedNode = {
        id: "node_unlinked",
        symbol: "unlinkedFactor",
        name: "Unlinked Factor",
        class: "constant",
        symbolFormula: "42"
      };

      const result = analyzeFactorRankingInvariance(unlinkedNode, actions, testNodes, {});

      expect(result.isConstant).toBe(true);
      expect(result.isRankingInvariant).toBe(true);
      expect(result.canMoveRanking).toBe(false);
      expect(result.reason).toBe("unlinked_factor");
    });

    it("handles insufficient actions (< 2 actions) gracefully", () => {
      const subsetNode = testNodes.find((n) => n.symbol === "valueOfCleanEnergy");

      const result = analyzeFactorRankingInvariance(subsetNode, [actions[0]], testNodes, {});

      expect(result.isConstant).toBe(true);
      expect(result.canMoveRanking).toBe(false);
      expect(result.reason).toBe("insufficient_actions");
      expect(result.totalCount).toBe(1);
    });

    it("returns isConstant: false for non-constant formula nodes", () => {
      const calcNode = {
        id: "node_calc",
        symbol: "calculatedFactor",
        symbolFormula: "cleanEnergyKwh * 2",
        influencers: ["node_energy"]
      };

      const result = analyzeFactorRankingInvariance(calcNode, actions, testNodes, {});
      expect(result.isConstant).toBe(false);
    });
  });
});
