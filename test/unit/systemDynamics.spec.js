import { describe, it, expect } from "vitest";
import {
  classifyFactorType,
  determineEdgePolarity,
  computeModelEdgePolarities,
  detectFeedbackLoops,
  detectSystemArchetypes,
  SYSTEM_ARCHETYPE_CATALOG,
  MISSING_LOOP_DESCRIPTIONS,
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

    it("detects negative polarity numerically for non-subtraction negative forms (MIPA-53)", () => {
      const load = { id: "a", symbol: "load" };

      expect(
        determineEdgePolarity(load, { id: "b1", symbol: "eff1", formula: "capacity / (1 + load)" })
      ).toBe(-1);
      expect(
        determineEdgePolarity(load, { id: "b2", symbol: "eff2", formula: "-1 * load" })
      ).toBe(-1);
      expect(
        determineEdgePolarity(load, { id: "b3", symbol: "eff3", formula: "1 / (1 + exp(load))" })
      ).toBe(-1);
      expect(
        determineEdgePolarity(load, { id: "b4", symbol: "eff4", formula: "capacity / (load + 1)" })
      ).toBe(-1);
      expect(
        determineEdgePolarity(load, { id: "b5", symbol: "eff5", formula: "max(0, capacity - load)" })
      ).toBe(-1);
    });

    it("detects positive polarity for double negation and net-positive links numerically", () => {
      const donors = { id: "a", symbol: "donors" };
      expect(
        determineEdgePolarity(donors, { id: "b", symbol: "funds", formula: "-(0 - donors) * 10" })
      ).toBe(1);
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

    it("reports two-node balancing loops when negative links use capacity / (1 + A), -1 * A, 1 / (1 + exp(A)), or capacity / (A + 1) (MIPA-53)", () => {
      const negativeFormulas = [
        "capacity / (1 + A)",
        "-1 * A",
        "1 / (1 + exp(A))",
        "capacity / (A + 1)"
      ];

      for (const negFormula of negativeFormulas) {
        const nodes = [
          { id: "a", symbol: "A", formula: "B * 1.5", influencers: ["b"] },
          { id: "b", symbol: "B", formula: negFormula, influencers: ["a"] }
        ];

        const loops = detectFeedbackLoops(nodes);
        expect(loops).toHaveLength(1);
        const loop = loops[0];
        expect(loop.type).toBe("balancing");
        expect(loop.code).toBe("B1");
        expect(loop.polarityProduct).toBe(-1);
        expect(loop.length).toBe(2);
        expect(loop.nodeIds).toEqual(["a", "b"]);
        expect(loop.id).toBe("loop_B1_a_b");
      }
    });

    it("evaluates persisted symbolFormula and sysFormula ($id) schemas numerically", () => {
      const nodes = [
        { id: "node-a", symbol: "demand", symbolFormula: "supply * 1.1", influencers: ["node-b"] },
        { id: "node-b", symbol: "supply", sysFormula: "$cap-node / (1 + $node-a)", influencers: ["node-a"] },
        { id: "cap-node", symbol: "capacity", sysFormula: "100", influencers: [] }
      ];

      const loops = detectFeedbackLoops(nodes);
      expect(loops).toHaveLength(1);
      expect(loops[0].type).toBe("balancing");
      expect(loops[0].code).toBe("B1");
      expect(loops[0].polarityProduct).toBe(-1);
    });

    it("diagnoses Limits to Growth when the limiting loop uses a non-linear negative link", () => {
      const nodes = [
        { id: "a", symbol: "activity", formula: "momentum + capacityGuard", influencers: ["m", "g"] },
        { id: "m", symbol: "momentum", formula: "activity * 1.4", influencers: ["a"] },
        { id: "g", symbol: "capacityGuard", formula: "maxCap / (1 + exp(pressure))", influencers: ["p"] },
        { id: "p", symbol: "pressure", formula: "activity * 0.8", influencers: ["a"] },
        { id: "cap", symbol: "maxCap", formula: "50", influencers: [] }
      ];

      const loops = detectFeedbackLoops(nodes);
      expect(loops.some((l) => l.type === "reinforcing")).toBe(true);
      expect(loops.some((l) => l.type === "balancing")).toBe(true);

      const archetypes = detectSystemArchetypes(nodes, loops);
      const limits = archetypes.find((arch) => arch.archetype === "limits_to_growth");
      expect(limits).toBeDefined();
      expect(limits.balancingLoop).toBe("B1");
    });

    it("perturbs each source factor once per model rather than once per edge", () => {
      // Hub factor `h` drives three outgoing cycle edges across three loops
      const nodes = [
        { id: "h", symbol: "hub", formula: "r1 + r2 - b1", influencers: ["r1", "r2", "b1"] },
        { id: "r1", symbol: "branchOne", formula: "hub * 0.5", influencers: ["h"] },
        { id: "r2", symbol: "branchTwo", formula: "hub * 0.3", influencers: ["h"] },
        { id: "b1", symbol: "branchLimit", formula: "hub * 0.2", influencers: ["h"] }
      ];

      const perturbedCalls = [];
      const loops = detectFeedbackLoops(nodes, {
        onPerturbFactor: (id) => perturbedCalls.push(id)
      });

      expect(loops).toHaveLength(3);
      expect(loops.filter((l) => l.type === "reinforcing")).toHaveLength(2);
      expect(loops.filter((l) => l.type === "balancing")).toHaveLength(1);

      // `hub` has 3 outgoing edges yet must only be perturbed once
      expect(perturbedCalls.filter((id) => id === "h")).toHaveLength(1);
      expect(new Set(perturbedCalls).size).toBe(perturbedCalls.length);

      const modelPass = computeModelEdgePolarities(nodes);
      expect(modelPass.perturbedFactorIds.filter((id) => id === "h")).toHaveLength(1);
    });

    it("reflects operating-point sign switches when baselineValues are provided for non-monotonic dynamics", () => {
      // Logistic saturation rate: r * x * (1 - x / K), positive slope below K/2 and negative above K/2
      const nodes = [
        { id: "x", symbol: "stock", formula: "delay(stock, 1) + growth", influencers: ["g"] },
        { id: "g", symbol: "growth", formula: "r * stock * (1 - stock / K)", influencers: ["x"] }
      ];

      const lowDensityLoops = detectFeedbackLoops(nodes, {
        baselineValues: { x: 20, K: 100, r: 0.5, g: 8 }
      });
      expect(lowDensityLoops[0].type).toBe("reinforcing");

      const nearCarryingCapacityLoops = detectFeedbackLoops(nodes, {
        baselineValues: { x: 80, K: 100, r: 0.5, g: 8 }
      });
      expect(nearCarryingCapacityLoops[0].type).toBe("balancing");
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

    it("diagnoses Shifting the Burden FIRST (complete + partial forms naming missing loop)", () => {
      // Complete Shifting the Burden: quickFix fast B, fundCap delayed B, plus R where quickFix erodes fundCap
      const completeNodes = [
        { id: "symp", symbol: "backlog", name: "Service Backlog", formula: "max(0, 50 - quickFix - fundCap)", influencers: ["quickFix", "fundCap"] },
        { id: "quickFix", symbol: "quickFix", name: "Emergency Temp Dispatch", formula: "backlog * 0.6", influencers: ["symp"] },
        { id: "fundCap", symbol: "fundCap", name: "Volunteer Captain Capacity", formula: "delay(fundCap, dt, 10) + backlog * 0.4 - quickFix * 0.5", influencers: ["symp", "quickFix"] }
      ];
      const completeLoops = detectFeedbackLoops(completeNodes);
      const completeArchs = detectSystemArchetypes(completeNodes, completeLoops);
      expect(completeArchs[0].archetype).toBe("shifting_the_burden");
      expect(completeArchs[0].status).toBe("complete");
      expect(completeArchs[0].isPartial).toBe(false);
      expect(completeArchs[0].missingLoop).toBeNull();
      expect(completeArchs[0].looksLike.length).toBeGreaterThan(15);
      expect(completeArchs[0].implication.length).toBeGreaterThan(15);

      // Partial Shifting the Burden P1: fast B + delayed B without R side-effect erosion loop
      const partialNoRNodes = [
        completeNodes[0],
        completeNodes[1],
        { id: "fundCap", symbol: "fundCap", name: "Volunteer Captain Capacity", formula: "delay(fundCap, dt, 10) + backlog * 0.4", influencers: ["symp"] }
      ];
      const partialNoRLoops = detectFeedbackLoops(partialNoRNodes);
      const partialNoRArch = detectSystemArchetypes(partialNoRNodes, partialNoRLoops).find(
        (a) => a.archetype === "shifting_the_burden"
      );
      expect(partialNoRArch).toBeDefined();
      expect(partialNoRArch.isPartial).toBe(true);
      expect(partialNoRArch.missingLoopKey).toBe("shiftingSideEffectR");
      expect(partialNoRArch.missingLoop).toMatch(/reinforcing side-effect loop/i);

      // Partial Shifting the Burden P2: fast B + R (-1 -> -1 erosion) without direct fundamental B
      const partialNoBNodes = [
        completeNodes[0],
        completeNodes[1],
        { id: "fundCap", symbol: "fundCap", name: "Volunteer Captain Capacity", formula: "delay(fundCap, dt, 10) + 12 - quickFix * 0.5", influencers: ["quickFix"] }
      ];
      const partialNoBLoops = detectFeedbackLoops(partialNoBNodes);
      const partialNoBArch = detectSystemArchetypes(partialNoBNodes, partialNoBLoops).find(
        (a) => a.archetype === "shifting_the_burden"
      );
      expect(partialNoBArch).toBeDefined();
      expect(partialNoBArch.isPartial).toBe(true);
      expect(partialNoBArch.missingLoopKey).toBe("shiftingFundamentalB");
      expect(partialNoBArch.missingLoop).toMatch(/fundamental solution balancing loop/i);
    });

    it("diagnoses Fixes that Fail (complete delayed rebound + partial missing R)", () => {
      const completeNodes = [
        { id: "prob", symbol: "backlog", name: "Backlog", formula: "30 + debt - fix", influencers: ["debt", "fix"] },
        { id: "fix", symbol: "fix", name: "Overtime Patch", formula: "prob * 0.7", influencers: ["prob"] },
        { id: "debt", symbol: "debt", name: "Technical Debt", formula: "delay(debt, dt, 0) + fix * 0.4", influencers: ["fix"] }
      ];
      const completeLoops = detectFeedbackLoops(completeNodes);
      const fixes = detectSystemArchetypes(completeNodes, completeLoops).find(
        (a) => a.archetype === "fixes_that_fail"
      );
      expect(fixes).toBeDefined();
      expect(fixes.isPartial).toBe(false);
      expect(fixes.missingLoop).toBeNull();
      expect(fixes.presentLoops.length).toBeGreaterThanOrEqual(2);

      // Partial: fast B drives unclosed delayed side-effect stock
      const partialNodes = [
        { id: "prob", symbol: "backlog", name: "Backlog", formula: "30 - fix", influencers: ["fix"] },
        { id: "fix", symbol: "fix", name: "Overtime Patch", formula: "prob * 0.7", influencers: ["prob"] },
        { id: "debt", symbol: "debt", name: "Technical Debt", formula: "delay(debt, dt, 0) + fix * 0.4", influencers: ["fix"] }
      ];
      const partialLoops = detectFeedbackLoops(partialNodes);
      const partialFixes = detectSystemArchetypes(partialNodes, partialLoops).find(
        (a) => a.archetype === "fixes_that_fail"
      );
      expect(partialFixes).toBeDefined();
      expect(partialFixes.isPartial).toBe(true);
      expect(partialFixes.missingLoop).toMatch(/rebound loop/i);
    });

    it("diagnoses Eroding Goals (complete opposite-side gap adjustment + partial without corrective B)", () => {
      const completeNodes = [
        { id: "gap", symbol: "gap", name: "Quality Gap", formula: "goal - perf", influencers: ["goal", "perf"] },
        { id: "goal", symbol: "goal", name: "Service Target", formula: "delay(goal, dt, 100) - gap * 0.2", influencers: ["gap"] },
        { id: "act", symbol: "act", name: "Corrective Effort", formula: "gap * 0.5", influencers: ["gap"] },
        { id: "perf", symbol: "perf", name: "Actual Performance", formula: "delay(perf, dt, 60) + act", influencers: ["act"] }
      ];
      const completeLoops = detectFeedbackLoops(completeNodes);
      const eroding = detectSystemArchetypes(completeNodes, completeLoops).find(
        (a) => a.archetype === "eroding_goals"
      );
      expect(eroding).toBeDefined();
      expect(eroding.isPartial).toBe(false);
      expect(eroding.missingLoop).toBeNull();

      // Partial: goal slides downward while performance corrective loop is missing
      const partialNodes = [
        { id: "gap", symbol: "gap", name: "Quality Gap", formula: "goal - perf", influencers: ["goal", "perf"] },
        { id: "goal", symbol: "goal", name: "Service Target", formula: "delay(goal, dt, 100) - gap * 0.2", influencers: ["gap"] },
        { id: "perf", symbol: "perf", name: "Actual Performance", formula: "60", influencers: [] }
      ];
      const partialLoops = detectFeedbackLoops(partialNodes);
      const partialEroding = detectSystemArchetypes(partialNodes, partialLoops).find(
        (a) => a.archetype === "eroding_goals"
      );
      expect(partialEroding).toBeDefined();
      expect(partialEroding.isPartial).toBe(true);
      expect(partialEroding.missingLoop).toMatch(/corrective action balancing loop/i);
    });

    it("diagnoses Success to the Successful without false-firing on additive hubs", () => {
      const completeNodes = [
        { id: "perfA", symbol: "perfA", formula: "resA * 2", influencers: ["resA"] },
        { id: "perfB", symbol: "perfB", formula: "resB * 2", influencers: ["resB"] },
        { id: "shareA", symbol: "shareA", formula: "perfA / (perfA + perfB)", influencers: ["perfA", "perfB"] },
        { id: "resA", symbol: "resA", formula: "100 * shareA", influencers: ["shareA"] },
        { id: "resB", symbol: "resB", formula: "100 * (1 - shareA)", influencers: ["shareA"] }
      ];
      const completeLoops = detectFeedbackLoops(completeNodes);
      const successArch = detectSystemArchetypes(completeNodes, completeLoops).find(
        (a) => a.archetype === "success_to_successful"
      );
      expect(successArch).toBeDefined();
      expect(successArch.isPartial).toBe(false);
      expect(successArch.presentLoops).toHaveLength(2);

      // Additive fan-in hub (like systemDynamics hub test) must NOT fire Success to the Successful
      const additiveHub = [
        { id: "h", symbol: "hub", formula: "r1 + r2", influencers: ["r1", "r2"] },
        { id: "r1", symbol: "branchOne", formula: "h * 0.5", influencers: ["h"] },
        { id: "r2", symbol: "branchTwo", formula: "h * 0.3", influencers: ["h"] }
      ];
      const additiveArchs = detectSystemArchetypes(additiveHub, detectFeedbackLoops(additiveHub));
      expect(additiveArchs.some((a) => a.archetype === "success_to_successful")).toBe(false);
    });

    it("diagnoses Tragedy of the Commons (complete 2R + 2B shared pool + partial missing second commons loop)", () => {
      const completeNodes = [
        { id: "actA", symbol: "actA", formula: "delay(actA, dt, 10) + gainA * 0.2", influencers: ["gainA"] },
        { id: "gainA", symbol: "gainA", formula: "actA * yield", influencers: ["actA", "yield"] },
        { id: "actB", symbol: "actB", formula: "delay(actB, dt, 10) + gainB * 0.2", influencers: ["gainB"] },
        { id: "gainB", symbol: "gainB", formula: "actB * yield", influencers: ["actB", "yield"] },
        { id: "totalAct", symbol: "totalAct", formula: "actA + actB", influencers: ["actA", "actB"] },
        { id: "yield", symbol: "yield", formula: "200 / (1 + totalAct)", influencers: ["totalAct"] }
      ];
      const completeLoops = detectFeedbackLoops(completeNodes);
      const tragedy = detectSystemArchetypes(completeNodes, completeLoops).find(
        (a) => a.archetype === "tragedy_of_the_commons"
      );
      expect(tragedy).toBeDefined();
      expect(tragedy.isPartial).toBe(false);
      expect(tragedy.presentLoops).toHaveLength(4);

      // Partial: B feeds into totalAct, yield only feeds back to gainA (missing B2 to actor B)
      const partialNodes = [
        ...completeNodes.slice(0, 3),
        { id: "gainB", symbol: "gainB", formula: "actB * 5", influencers: ["actB"] },
        completeNodes[4],
        completeNodes[5]
      ];
      const partialTragedy = detectSystemArchetypes(partialNodes, detectFeedbackLoops(partialNodes)).find(
        (a) => a.archetype === "tragedy_of_the_commons"
      );
      expect(partialTragedy).toBeDefined();
      expect(partialTragedy.isPartial).toBe(true);
      expect(partialTragedy.missingLoop).toMatch(/commons-depletion loop/i);
    });

    it("diagnoses Escalation (complete 2B + figure-8 R + partial missing opponent anchor B)", () => {
      const completeNodes = [
        { id: "threatA", symbol: "threatA", formula: "delay(effortB, dt, 10) - effortA", influencers: ["effortB", "effortA"] },
        { id: "effortA", symbol: "effortA", formula: "10 + 0.6 * threatA", influencers: ["threatA"] },
        { id: "threatB", symbol: "threatB", formula: "delay(effortA, dt, 10) - effortB", influencers: ["effortA", "effortB"] },
        { id: "effortB", symbol: "effortB", formula: "10 + 0.6 * threatB", influencers: ["threatB"] }
      ];
      const completeLoops = detectFeedbackLoops(completeNodes);
      const escalation = detectSystemArchetypes(completeNodes, completeLoops).find(
        (a) => a.archetype === "escalation"
      );
      expect(escalation).toBeDefined();
      expect(escalation.isPartial).toBe(false);
      expect(escalation.presentLoops).toHaveLength(3);

      // Partial: B2 lacks self-anchoring comparison edge (threatB does not subtract effortB)
      const partialNodes = [
        completeNodes[0],
        completeNodes[1],
        { id: "threatB", symbol: "threatB", formula: "delay(effortA, dt, 10)", influencers: ["effortA"] },
        completeNodes[3]
      ];
      const partialEscalation = detectSystemArchetypes(partialNodes, detectFeedbackLoops(partialNodes)).find(
        (a) => a.archetype === "escalation"
      );
      expect(partialEscalation).toBeDefined();
      expect(partialEscalation.isPartial).toBe(true);
      expect(partialEscalation.missingLoop).toMatch(/balancing anchor loop/i);
    });

    it("diagnoses Growth and Underinvestment (complete delayed capacity B + partial unclosed constant capacity)", () => {
      const completeNodes = [
        { id: "orders", symbol: "orders", formula: "marketing * quality", influencers: ["marketing", "quality"] },
        { id: "rev", symbol: "revenue", formula: "orders * 10", influencers: ["orders"] },
        { id: "marketing", symbol: "marketing", formula: "rev * 0.2", influencers: ["rev"] },
        { id: "backlog", symbol: "backlog", formula: "orders / max(1, cap)", influencers: ["orders", "cap"] },
        { id: "quality", symbol: "quality", formula: "100 / (1 + backlog)", influencers: ["backlog"] },
        { id: "perfGap", symbol: "perfGap", formula: "80 - quality", influencers: ["quality"] },
        { id: "cap", symbol: "capacity", formula: "delay(cap, dt, 50) + perfGap * 0.5", influencers: ["perfGap"] }
      ];
      const completeLoops = detectFeedbackLoops(completeNodes);
      const growthInvest = detectSystemArchetypes(completeNodes, completeLoops).find(
        (a) => a.archetype === "growth_and_underinvestment"
      );
      expect(growthInvest).toBeDefined();
      expect(growthInvest.isPartial).toBe(false);

      // Partial: delayed bottleneck stock backed by unclosed constant capacity factor
      const partialNodes = [
        completeNodes[0],
        completeNodes[1],
        completeNodes[2],
        { id: "backlog", symbol: "backlog", formula: "delay(backlog, dt, 5) + orders / max(1, cap)", influencers: ["orders", "cap"] },
        completeNodes[4],
        { id: "cap", symbol: "capacity", formula: "50", influencers: [] }
      ];
      const partialGrowthInvest = detectSystemArchetypes(partialNodes, detectFeedbackLoops(partialNodes)).find(
        (a) => a.archetype === "growth_and_underinvestment"
      );
      expect(partialGrowthInvest).toBeDefined();
      expect(partialGrowthInvest.isPartial).toBe(true);
      expect(partialGrowthInvest.missingLoop).toMatch(/capacity investment balancing loop/i);
    });

    it("diagnoses Attractiveness Principle and partial Limits to Growth cleanly", () => {
      const attractNodes = [
        { id: "growth", symbol: "growth", formula: "demand * capLimit * qualityLimit", influencers: ["demand", "capLimit", "qualityLimit"] },
        { id: "demand", symbol: "demand", formula: "growth * 1.5", influencers: ["growth"] },
        { id: "capLimit", symbol: "capLimit", formula: "100 / (1 + overload)", influencers: ["overload"] },
        { id: "overload", symbol: "overload", formula: "growth * 0.5", influencers: ["growth"] },
        { id: "qualityLimit", symbol: "qualityLimit", formula: "100 / (1 + fatigue)", influencers: ["fatigue"] },
        { id: "fatigue", symbol: "fatigue", formula: "growth * 0.3", influencers: ["growth"] }
      ];
      const attractLoops = detectFeedbackLoops(attractNodes);
      const attractiveness = detectSystemArchetypes(attractNodes, attractLoops).find(
        (a) => a.archetype === "attractiveness_principle"
      );
      expect(attractiveness).toBeDefined();
      expect(attractiveness.isPartial).toBe(false);
      expect(attractiveness.boundingBalancingLoops).toHaveLength(2);

      // Partial Limits to Growth when only an unbounded reinforcing loop is modeled
      const unboundedNodes = [
        { id: "v", symbol: "volunteers", formula: "wom * 1.2", influencers: ["wom"] },
        { id: "wom", symbol: "wordOfMouth", formula: "v * 2", influencers: ["v"] }
      ];
      const partialLimit = detectSystemArchetypes(unboundedNodes, detectFeedbackLoops(unboundedNodes)).find(
        (a) => a.archetype === "limits_to_growth"
      );
      expect(partialLimit).toBeDefined();
      expect(partialLimit.isPartial).toBe(true);
      expect(partialLimit.missingLoop).toMatch(/balancing constraint loop/i);
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
      Object.values(SYSTEM_ARCHETYPE_CATALOG).forEach((entry) => {
        expect(chineseCharRegex.test(entry.name)).toBe(false);
        expect(chineseCharRegex.test(entry.looksLike)).toBe(false);
        expect(chineseCharRegex.test(entry.implication)).toBe(false);
        expect(chineseCharRegex.test(entry.recommendation)).toBe(false);
      });
      Object.values(MISSING_LOOP_DESCRIPTIONS).forEach((text) => {
        expect(chineseCharRegex.test(text)).toBe(false);
      });
    });
  });
});
