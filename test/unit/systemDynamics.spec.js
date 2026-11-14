import { describe, it, expect } from "vitest";
import {
  classifyFactorType,
  determineEdgePolarity,
  detectFeedbackLoops,
  detectSystemArchetypes,
  MEADOWS_LEVERAGE_HIERARCHY
} from "@/utils/systemDynamics";

describe("System Dynamics Methodology & Systems Thinking Engine", () => {
  describe("Factor Classification (Stock / Flow / Constant / Auxiliary)", () => {
    it("classifies pure numbers as constants (Meadows Level 12)", () => {
      expect(classifyFactorType({ formula: "100" }).type).toBe("constant");
      expect(classifyFactorType({ formula: " -45.5 " }).type).toBe("constant");
      expect(classifyFactorType({ formula: "" }).type).toBe("constant");
    });

    it("classifies delay() expressions as stocks with historical accumulation", () => {
      const stock = classifyFactorType({
        symbol: "inventory",
        name: "Food Inventory Stock",
        formula: "delay(inventory, 1) + inflow - outflow"
      });
      expect(stock.type).toBe("stock");
      expect(stock.label).toContain("Stock");
    });

    it("classifies flow indicators based on semantic rate cues", () => {
      const flow1 = classifyFactorType({
        symbol: "donorGrowthRate",
        name: "Annual Donor Growth Rate",
        formula: "baseDonors * 0.08"
      });
      expect(flow1.type).toBe("flow");

      const flow2 = classifyFactorType({
        symbol: "mealDeliveryDelta",
        name: "Weekly Delivery Delta",
        formula: "deliveryCapacity - actualDelivered"
      });
      expect(flow2.type).toBe("flow");
    });

    it("classifies intermediate calculations as auxiliary variables", () => {
      const aux = classifyFactorType({
        symbol: "costPerMeal",
        name: "Average Cost Per Meal",
        formula: "totalOperationalCost / mealsPrepared"
      });
      expect(aux.type).toBe("auxiliary");
    });
  });

  describe("Edge Polarity Evaluation", () => {
    it("detects positive polarity for direct additive and multiplicative links", () => {
      const src = { id: "a", symbol: "donors" };
      const tgt = { id: "b", symbol: "funds", formula: "donors * 50 + grants" };
      expect(determineEdgePolarity(src, tgt)).toBe(1);
    });

    it("detects negative polarity for subtractions and divisions", () => {
      const src1 = { id: "a", symbol: "waste" };
      const tgt1 = { id: "b", symbol: "netYield", formula: "grossYield - waste" };
      expect(determineEdgePolarity(src1, tgt1)).toBe(-1);

      const src2 = { id: "c", symbol: "bottleneck" };
      const tgt2 = { id: "d", symbol: "throughput", formula: "grossOutput / bottleneck" };
      expect(determineEdgePolarity(src2, tgt2)).toBe(-1);
    });
  });

  describe("Feedback Loop Detection (Cycles & Polarities)", () => {
    it("detects reinforcing loops (positive feedback cycles)", () => {
      // Model: Volunteers -> Capacity -> Completed Projects -> Word of Mouth -> Volunteers
      const nodes = [
        { id: "n1", symbol: "volunteers", formula: "wordOfMouth * 1.2", influencers: ["n4"] },
        { id: "n2", symbol: "capacity", formula: "volunteers * 10", influencers: ["n1"] },
        { id: "n3", symbol: "projects", formula: "capacity * 0.5", influencers: ["n2"] },
        { id: "n4", symbol: "wordOfMouth", formula: "projects * 2", influencers: ["n3"] }
      ];

      const loops = detectFeedbackLoops(nodes);
      expect(loops).toHaveLength(1);
      const loop = loops[0];
      expect(loop.type).toBe("reinforcing");
      expect(loop.code).toBe("R1");
      expect(loop.length).toBe(4);
      expect(loop.polarityProduct).toBe(1);
    });

    it("detects balancing loops (negative feedback / goal-seeking cycles)", () => {
      // Inventory discrepancy model: Target -> Gap (Target - Stock) -> Production -> Stock (+delay) -> Gap
      const nodes = [
        { id: "s1", symbol: "stock", formula: "delay(stock, 1) + production", influencers: ["p1"] },
        { id: "g1", symbol: "gap", formula: "targetInventory - stock", influencers: ["s1"] },
        { id: "p1", symbol: "production", formula: "gap * 0.5", influencers: ["g1"] }
      ];

      const loops = detectFeedbackLoops(nodes);
      expect(loops.length).toBeGreaterThanOrEqual(1);
      const balancing = loops.find((l) => l.type === "balancing");
      expect(balancing).toBeDefined();
      expect(balancing.code).toBe("B1");
      expect(balancing.polarityProduct).toBe(-1);
      expect(balancing.hasDelay).toBe(true);
    });

    it("returns empty array when factor graph has no directed cycles", () => {
      const dag = [
        { id: "x", symbol: "inputA", formula: "100", influencers: [] },
        { id: "y", symbol: "inputB", formula: "200", influencers: [] },
        { id: "z", symbol: "output", formula: "inputA + inputB", influencers: ["x", "y"] }
      ];
      const loops = detectFeedbackLoops(dag);
      expect(loops).toEqual([]);
    });
  });

  describe("System Archetype Diagnosis", () => {
    it("diagnoses 'Limits to Growth' when a reinforcing loop shares factors with a balancing loop", () => {
      // Shared core factor: "scale"
      // R: scale -> awareness -> donations -> scale
      // B: scale -> administrativeOverhead -> (- scale)
      const nodes = [
        { id: "n_scale", symbol: "scale", formula: "donations - overhead", influencers: ["n_donations", "n_overhead"] },
        { id: "n_aware", symbol: "awareness", formula: "scale * 1.5", influencers: ["n_scale"] },
        { id: "n_donations", symbol: "donations", formula: "awareness * 100", influencers: ["n_aware"] },
        { id: "n_overhead", symbol: "overhead", formula: "scale * 0.3", influencers: ["n_scale"] }
      ];

      const loops = detectFeedbackLoops(nodes);
      expect(loops.some((l) => l.type === "reinforcing")).toBe(true);
      expect(loops.some((l) => l.type === "balancing")).toBe(true);

      const archetypes = detectSystemArchetypes(nodes, loops);
      const limits = archetypes.find((a) => a.archetype === "limits_to_growth");
      expect(limits).toBeDefined();
      expect(limits.name).toBe("Limits to Growth");
      expect(limits.meadowsLevel).toBe(6);
      expect(limits.recommendation).toContain("remove or expand the balancing capacity limit");
    });

    it("diagnoses 'Policy Resistance' when balancing feedback involves significant delay", () => {
      const nodes = [
        { id: "stock1", symbol: "supply", formula: "delay(supply, 3) + orders", influencers: ["orders1"] },
        { id: "gap1", symbol: "deficit", formula: "1000 - supply", influencers: ["stock1"] },
        { id: "orders1", symbol: "orders", formula: "deficit * 1.5", influencers: ["gap1"] }
      ];

      const loops = detectFeedbackLoops(nodes);
      const archetypes = detectSystemArchetypes(nodes, loops);
      const resistance = archetypes.find((a) => a.archetype === "policy_resistance");
      expect(resistance).toBeDefined();
      expect(resistance.name).toBe("Policy Resistance & Delayed Oscillation");
      expect(resistance.meadowsLevel).toBe(8);
      expect(resistance.recommendation).toContain("Shorten reporting delays");
    });
  });

  describe("Donella Meadows 12 Leverage Points Hierarchy", () => {
    it("contains all 12 canonical levels ranked from lowest (12) to highest (1)", () => {
      expect(MEADOWS_LEVERAGE_HIERARCHY).toHaveLength(12);
      expect(MEADOWS_LEVERAGE_HIERARCHY[0].level).toBe(12);
      expect(MEADOWS_LEVERAGE_HIERARCHY[11].level).toBe(1);

      // Verify key landmark levels
      const level12 = MEADOWS_LEVERAGE_HIERARCHY.find((lvl) => lvl.level === 12);
      expect(level12.name).toContain("Constants, parameters");
      expect(level12.power).toBe("low");

      const level7 = MEADOWS_LEVERAGE_HIERARCHY.find((lvl) => lvl.level === 7);
      expect(level7.name).toContain("Reinforcing feedback loop");
      expect(level7.power).toBe("high");

      const level1 = MEADOWS_LEVERAGE_HIERARCHY.find((lvl) => lvl.level === 1);
      expect(level1.name).toContain("Transcending paradigms");
      expect(level1.power).toBe("transformative");
    });

    it("ensures ZERO Chinese characters in default systemDynamics English definitions", () => {
      const chineseCharRegex = /[\u4e00-\u9fff]/;
      MEADOWS_LEVERAGE_HIERARCHY.forEach((item) => {
        expect(chineseCharRegex.test(item.name)).toBe(false);
        expect(chineseCharRegex.test(item.example)).toBe(false);
      });
    });
  });
});
