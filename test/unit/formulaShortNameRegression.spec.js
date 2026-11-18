// @vitest-environment node
//
// Regression tests for MIPA-8:
// 1. Bare factor short names in formulas resolve to $<nodeId> on save.
// 2. Factors referenced in formulas are auto-linked as inputs.
// 3. Two-factor model typed with short names saves and calculates successfully.
// 4. The error message no longer instructs the user to link factors that are already linked.
// 5. Dimensional analysis behavior is preserved (Unit mismatch error is actionable).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { node, message, runCalc, mockFirebaseModules, FIXED_NOW } from "./calc/harness.js";
import { toSysFormula } from "@/utils/formulaHelper";
import { i18n } from "@/boot/i18n";

const fb = mockFirebaseModules(() => []);
vi.mock("firebase/app", () => fb.app);
vi.mock("firebase/auth", () => fb.auth);
vi.mock("firebase/firestore", () => fb.firestore);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXED_NOW);
  for (const level of ["log", "table", "error", "warn"]) {
    vi.spyOn(console, level).mockImplementation(() => {});
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("MIPA-8 Formula Short Names & Auto-Linking Regression", () => {
  it("builds a two-factor model, types referencing formula using short names, saves, and asserts Calculate succeeds", async () => {
    // 1. Factor 1: Active Volunteers (independent factor)
    const factor1 = node("node_vol", "50", {
      symbol: "volunteers",
      name: "Active Volunteers",
      unit: "people",
      symbolFormula: "50",
      influencers: [],
      influencees: []
    });

    // 2. Factor 2: Meals Served (user types referencing formula using short name "volunteers * 10", unlinked initially)
    const factor2 = node("node_meals", "", {
      symbol: "mealsServed",
      name: "Meals Served",
      unit: "people",
      symbolFormula: "volunteers * 10",
      influencers: [], // Not linked yet!
      influencees: []
    });

    const modelNodes = [factor1, factor2];

    // 3. User saves Factor 2: toSysFormula resolves bare short names and auto-links inputs
    const { sysFormula, referencedNodeIds, unlinkedSymbols } = toSysFormula(
      factor2.symbolFormula,
      modelNodes,
      factor2
    );

    expect(sysFormula).toBe("$node_vol * 10");
    expect(referencedNodeIds).toEqual(["node_vol"]);
    expect(unlinkedSymbols.length).toBe(1);
    expect(unlinkedSymbols[0].symbol).toBe("volunteers");

    // Apply resolved save state with auto-linking
    factor2.sysFormula = sysFormula;
    factor2.influencers = [...referencedNodeIds];
    factor1.influencees = [factor2.id];

    // 4. Run calculation worker
    const msg = message([factor1, factor2], { calculationType: "baseline" });
    const { results, error } = await runCalc(msg);

    expect(error).toBeUndefined();
    expect(results.length).toBeGreaterThan(0);

    const baseline = results.find((r) => r.resultsType === "baseline");
    expect(baseline).toBeDefined();
    expect(baseline.nodesValues).toBeDefined();

    // Volunteers: 50
    expect(baseline.nodesValues["node_vol"]).toEqual([50, 50, 50, 50, 50]);
    // Meals served: 50 * 10 = 500
    expect(baseline.nodesValues["node_meals"]).toEqual([500, 500, 500, 500, 500]);
  });

  it("calculates successfully even when legacy model has short names directly in sysFormula", async () => {
    // Regression defense: model stored with verbatim short names in sysFormula
    const nodeA = node("node_a", "100", {
      symbol: "capacity",
      name: "Capacity",
      unit: ""
    });
    const nodeB = node("node_b", "capacity * 2", {
      symbol: "demand",
      name: "Demand",
      unit: "",
      symbolFormula: "capacity * 2"
    });

    const msg = message([nodeA, nodeB], { calculationType: "baseline" });
    const { results, error } = await runCalc(msg);

    expect(error).toBeUndefined();
    const baseline = results.find((r) => r.resultsType === "baseline");
    expect(baseline.nodesValues["node_b"]).toEqual([200, 200, 200, 200, 200]);
  });

  it("does not instruct the user to link factors that are already linked when an evaluation error occurs", () => {
    const nodeA = node("node_a", "100", { symbol: "income", name: "Income" });
    const nodeB = node("node_b", "$node_a / 0", {
      symbol: "ratio",
      name: "Ratio",
      symbolFormula: "income / 0",
      influencers: ["node_a"] // Already linked!
    });

    const allNodes = [nodeA, nodeB];
    const affectedNode = nodeB;

    // Verify all referenced factors are already in influencers
    const referencedNodes = allNodes.filter(
      (n) => n.id !== affectedNode.id && affectedNode.sysFormula.includes("$" + n.id)
    );
    const allLinked =
      referencedNodes.length > 0 &&
      referencedNodes.every((n) => affectedNode.influencers.includes(n.id));

    expect(allLinked).toBe(true);

    // The advice string should come from errEvalAdviceAlreadyLinked, NOT errEvalAdvice
    const standardAdvice = i18n.global.t("errEvalAdvice");
    const alreadyLinkedAdvice = i18n.global.t("errEvalAdviceAlreadyLinked");

    expect(alreadyLinkedAdvice).not.toContain("linked factor");
    expect(alreadyLinkedAdvice).not.toContain("已連結");
    expect(alreadyLinkedAdvice).not.toContain("已链接");
    expect(alreadyLinkedAdvice).toContain("units can be combined");
    expect(standardAdvice).toContain("linked factor");
  });

  it("preserves dimensional analysis behavior (expected unit mismatch remains actionable)", async () => {
    // Node with expected unit 'USD' whose calculation yields a unitless number (10 * 500 = 5000)
    const factorA = node("node_a", "10");
    const factorMismatch = node("node_mismatch", "$node_a * 500", {
      symbol: "summary",
      name: "Summary",
      unit: "USD",
      blockingInfluencers: ["node_a"]
    });

    const mismatchMsg = message([factorA, factorMismatch], { calculationType: "baseline" });
    const { error: mismatchError } = await runCalc(mismatchMsg);

    expect(mismatchError).toBeDefined();
    expect(mismatchError.errorType).toBe("Unit mismatch");
    expect(mismatchError.errorMessage).toContain("dimensions of expected units and calculated units do not match");
    expect(mismatchError.errorMessage).toContain('Expected unit: "USD"');
    expect(mismatchError.errorMessage).toContain('Calculated result: "5000"');
  });
});
