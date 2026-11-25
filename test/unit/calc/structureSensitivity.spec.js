// @vitest-environment node
//
// PROBE (not a regression test): does the ENGINE matter?
//
// 昕, 2026-11-18. Question from Ted: "Do these products incorporate system dynamics
// like we do?" The strategic answer depends on whether mipa's ranking changes when the
// SYSTEM STRUCTURE or the TIME HORIZON changes. If it does not, the dynamics are
// decoration and the product is a spreadsheet with a nicer graph.
//
// Three runs of the same sample organisation:
//   A. as built              — volunteer hours and packing capacity bind (min() in the structure)
//   B. bottleneck removed    — mealsServed no longer capped by packingCapacity
//   C. short horizon         — 12 months instead of 120
//
// If the ranking of actions differs between runs, the engine is load-bearing.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { message, runCalc, mockFirebaseModules, FIXED_NOW } from "./harness.js";
import { compileDraftNodes, roleNodesOf } from "@/utils/util-model-draft";
import { buildSampleOrg } from "@/utils/sample-org";
import enUs from "@/i18n/en-us/index.js";

const fb = mockFirebaseModules(() => []);
// PROBE output must reach the terminal even though console.* is mocked below.
const print = (...a) => process.stdout.write(a.join(" ") + "\n");
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

const baseParams = {
  finalTimeNumber: 120,
  finalTimeUnit: "months",
  numTimeSteps: 120,
  orgWeightingFactor: 1,
  timeStepGrowthRate: 0,
  timeStepNumber: 1,
  timeStepUnit: "months",
  worldToOrgWeightingRatio: 0.5,
  worldWeightingFactor: 1
};

function compile() {
  const t = key => {
    const v = key.split(".").reduce((o, k) => (o ? o[k] : undefined), enUs);
    if (typeof v != "string") throw new Error(`missing message ${key}`);
    return v;
  };
  const sample = buildSampleOrg(t, "USD");
  const nodes = compileDraftNodes(sample, s => "id_" + s);
  const roleNodes = roleNodesOf(nodes);
  const actions = sample.actions.map(a => ({
    id: a.key,
    title: a.title,
    estEffortHrs: a.estEffortHrs,
    estSpending: a.estSpending,
    outstandingSpending: a.estSpending,
    spentAmount: 0,
    effortCompletionPercentage: 0,
    effortCostPerHrType: a.effortCostSymbol ? "use_factor" : "use_average",
    effortCostNodeId: a.effortCostSymbol ? "id_" + a.effortCostSymbol : null,
    impacts: a.impacts.map(({ symbol, ...rest }) => ({ ...rest, nodeId: "id_" + symbol }))
  }));
  return { nodes, roleNodes, actions };
}

async function rank(nodes, roleNodes, actions, params) {
  const run = await runCalc(
    message(nodes, { calculationType: "actions", roleNodes, actions, simulationParams: params })
  );
  if (run.error) {
    print("ERROR:", JSON.stringify(run.error).slice(0, 400));
    return null;
  }
  const [, actionResults] = run.results;
  return actionResults.actionsResults.map(r => ({
    id: r.id,
    lev: r.effectiveResultsNumbers.actionLeverage
  }));
}

function show(label, rows) {
  if (!rows) return;
  const sorted = [...rows].sort((a, b) => (b.lev ?? -1e18) - (a.lev ?? -1e18));
  const line = sorted
    .map(r => `${r.id}=${r.lev === null || r.lev === undefined ? "null" : r.lev.toPrecision(4)}`)
    .join("  ");
  print(`${label}\n     ${line}\n     order: ${sorted.map(r => r.id).join(" > ")}`);
}

describe("PROBE engine load-bearing", () => {
  it("A/B/C comparison", async () => {
    let orderA, orderB, orderC;

    // A — as built
    {
      const { nodes, roleNodes, actions } = compile();
      const rows = await rank(nodes, roleNodes, actions, baseParams);
      show("A. as built (120 months, bottleneck in place)", rows);
      orderA = [...rows].sort((a, b) => (b.lev ?? -1e18) - (a.lev ?? -1e18)).map(r => r.id);
    }

    // B — remove the bottleneck from the structure
    {
      const { nodes, roleNodes, actions } = compile();
      const served = nodes.find(n => n.symbol == "mealsServed");
      print(`     [served formula was: ${served.sysFormula}]`);
      served.sysFormula = "$id_foodAvailableInMeals";
      served.symbolFormula = "$id_foodAvailableInMeals";
      const rows = await rank(nodes, roleNodes, actions, baseParams);
      show("B. bottleneck removed (packingCapacity no longer binds)", rows);
      orderB = [...rows].sort((a, b) => (b.lev ?? -1e18) - (a.lev ?? -1e18)).map(r => r.id);
    }

    // C — short horizon
    {
      const { nodes, roleNodes, actions } = compile();
      const rows = await rank(nodes, roleNodes, actions, { ...baseParams, numTimeSteps: 12, finalTimeNumber: 12 });
      show("C. short horizon (12 months)", rows);
      orderC = [...rows].sort((a, b) => (b.lev ?? -1e18) - (a.lev ?? -1e18)).map(r => r.id);
    }

    // What this pins, stated honestly (corrected 2026-11-18 after Ted pushed back):
    // the sample model's DOCUMENTED LESSON is that "recruiting volunteers does good,
    // more food alone does little, because volunteer hours are the bottleneck". This
    // pins that the lesson follows FROM THE STRUCTURE: take packingCapacity out of the
    // min() and the lesson inverts. That is a consistency check on the sample model,
    // NOT evidence about the market or about competitors - a spreadsheet can hold the
    // same min() and would behave identically. Do not cite this test as a
    // differentiator; the differentiator is only testable against real outcomes.
    expect(orderA[0], "sample model: with the bottleneck, recruiting volunteers ranks first").toBe("recruit");
    expect(orderB[0], "sample model: without the bottleneck, the supermarket partnership ranks first").toBe("supermarkets");
    // Recorded negative result so it is not re-hypothesised: the HORIZON changes
    // magnitudes but did not change the order in this model.
    expect(orderC).toEqual(orderA);
  }, 60000);
});
