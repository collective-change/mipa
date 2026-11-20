import { describe, it, expect } from "vitest";
import { analyzeHorizonGrowth, assessDraftLimits } from "@/utils/draftLimitCheck";

describe("draftLimitCheck (MIPA-55)", () => {
  const simParams = { finalTimeNumber: 120, finalTimeUnit: "months" };

  describe("analyzeHorizonGrowth (numerical horizon gate)", () => {
    it("tolerates constants, steady-state flattening curves, oscillations, and settled overshoots", () => {
      const nodes = [
        { id: "c", symbol: "cap", name: "Kitchen Capacity" },
        { id: "sat", symbol: "output", name: "Saturating Throughput" },
        { id: "osc", symbol: "inventory", name: "Seasonal Inventory" },
        { id: "over", symbol: "staffing", name: "Adjusted Staffing" }
      ];
      const baseline = {
        timeSPoints: [0, 1, 2, 3, 4, 5, 6],
        nodesValues: {
          c: [100, 100, 100, 100, 100, 100, 100],
          sat: [0, 39, 63, 78, 87, 92, 95],
          osc: [50, 65, 50, 35, 50, 65, 50],
          over: [20, 80, 120, 95, 102, 100, 100]
        }
      };

      expect(analyzeHorizonGrowth(nodes, baseline, simParams)).toEqual([]);
    });

    it("identifies linear and exponential rising series by name and horizon when growth has not leveled off", () => {
      const nodes = [
        { id: "lin", symbol: "kitchenThroughput", name: "Kitchen Throughput" },
        { id: "exp", symbol: "donorPool", name: "Donor Pool" },
        { id: "flat", symbol: "rent", name: "Monthly Rent" }
      ];
      const baseline = {
        timeSPoints: [0, 1, 2, 3, 4],
        nodesValues: {
          lin: [100, 125, 150, 175, 200],
          exp: [10, 15, 22.5, 33.75, 50.625],
          flat: [5000, 5000, 5000, 5000, 5000]
        }
      };

      const findings = analyzeHorizonGrowth(nodes, baseline, simParams);
      expect(findings).toHaveLength(2);
      expect(findings.map((f) => f.symbol)).toEqual(["kitchenThroughput", "donorPool"]);
      expect(findings[0].message).toContain('"Kitchen Throughput"');
      expect(findings[0].message).toContain("120 months");
    });
  });

  describe("assessDraftLimits", () => {
    it("fails when a reinforcing loop has no bounding balancing loop or when any factor is unlinked", () => {
      const nodes = [
        { id: "r1", symbol: "demand", name: "Customer Demand", formula: "referral * 1.2", influencers: ["r2"], class: "state" },
        { id: "r2", symbol: "referral", name: "Word of Mouth", formula: "demand * 0.5", influencers: ["r1"], class: "state" },
        { id: "u1", symbol: "spareBudget", name: "Spare Budget", formula: "500", influencers: [], class: "unlinked" }
      ];
      const baseline = {
        timeSPoints: [0, 1, 2, 3],
        nodesValues: {
          r1: [10, 20, 40, 80],
          r2: [5, 10, 20, 40],
          u1: [500, 500, 500, 500]
        }
      };

      const result = assessDraftLimits({ nodes, baseline, simulationParams: simParams });
      expect(result.passed).toBe(false);
      expect(result.unboundedReinforcingLoops).toHaveLength(1);
      expect(result.unlinkedFactors).toEqual([{ id: "u1", symbol: "spareBudget", name: "Spare Budget" }]);
      expect(result.growingFactors.map((g) => g.symbol)).toEqual(["demand", "referral"]);
      expect(result.repairErrors.some((e) => e.includes("no bounding balancing limit"))).toBe(true);
      expect(result.repairErrors.some((e) => e.includes("Spare Budget"))).toBe(true);
    });

    it("refuses to pass on a decorative balancing count alone when a factor still grows unboundedly or R-loop stays unpaired", () => {
      // Unrelated decorative balancing loop (b1 <-> b2) does not share factors with reinforcing loop (r1 <-> r2)
      const nodes = [
        { id: "r1", symbol: "sales", name: "Monthly Sales", formula: "hype * 2", influencers: ["r2"], class: "state" },
        { id: "r2", symbol: "hype", name: "Brand Hype", formula: "sales * 0.6", influencers: ["r1"], class: "state" },
        { id: "b1", symbol: "decStock", name: "Decorative Buffer", formula: "decGap * 0.5", influencers: ["b2"], class: "state" },
        { id: "b2", symbol: "decGap", name: "Decorative Target Gap", formula: "100 - decStock", influencers: ["b1"], class: "state" }
      ];
      const baseline = {
        timeSPoints: [0, 1, 2, 3],
        nodesValues: {
          r1: [10, 12, 14.4, 17.28],
          r2: [6, 7.2, 8.64, 10.368],
          b1: [10, 10, 10, 10],
          b2: [90, 90, 90, 90]
        }
      };

      const result = assessDraftLimits({ nodes, baseline, simulationParams: simParams });
      expect(result.balancingLoops).toHaveLength(1);
      expect(result.passed).toBe(false);
      expect(result.unboundedReinforcingLoops).toHaveLength(1);
      expect(result.growingFactors.length).toBeGreaterThan(0);
    });

    it("passes and names bounding limits when reinforcing loops are paired via Limits to Growth, series level off, and all factors connect", () => {
      const nodes = [
        { id: "a", symbol: "orders", name: "Daily Orders", formula: "referrals - capacityDrag", influencers: ["r", "l"], class: "state" },
        { id: "r", symbol: "referrals", name: "Customer Referrals", formula: "orders * 0.8", influencers: ["a"], class: "state" },
        { id: "l", symbol: "capacityDrag", name: "Kitchen Capacity Limit", formula: "orders * 0.5", influencers: ["a"], class: "state" }
      ];
      const baseline = {
        timeSPoints: [0, 1, 2, 3, 4],
        nodesValues: {
          a: [20, 45, 60, 68, 71],
          r: [16, 36, 48, 54.4, 56.8],
          l: [10, 22.5, 30, 34, 35.5]
        }
      };

      const result = assessDraftLimits({ nodes, baseline, simulationParams: simParams });
      expect(result.passed).toBe(true);
      expect(result.unlinkedFactors).toHaveLength(0);
      expect(result.growingFactors).toHaveLength(0);
      expect(result.loopPairings[0].bounded).toBe(true);
      expect(result.loopPairings[0].boundingLimitNames).toContain("Kitchen Capacity Limit");
      expect(result.namedLimits[0].summary).toContain("Kitchen Capacity Limit");
    });
  });
});
