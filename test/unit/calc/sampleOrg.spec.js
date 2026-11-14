// @vitest-environment node
//
// The sample organization must calculate without errors and teach what it
// is meant to: recruiting volunteers does good, more food alone does little
// (volunteer hours are the bottleneck), and a glossy report only costs.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { message, runCalc, mockFirebaseModules, FIXED_NOW } from "./harness.js";
import { compileDraftNodes, roleNodesOf } from "@/utils/util-model-draft";
import { buildSampleOrg } from "@/utils/sample-org";
import enUs from "@/i18n/en-us/index.js";
import zhTw from "@/i18n/zh-tw/index.js";

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

const translator = messages => key => {
  const value = key.split(".").reduce((o, k) => (o ? o[k] : undefined), messages);
  if (typeof value != "string") throw new Error(`missing message ${key}`);
  return value;
};

const simulationParams = {
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

function compileSample(messages = enUs, currency = "USD") {
  const sample = buildSampleOrg(translator(messages), currency);
  const nodes = compileDraftNodes(sample, symbol => "id_" + symbol);
  const roleNodes = roleNodesOf(nodes);
  const actions = sample.actions.map(a => ({
    id: a.key,
    title: a.title,
    estEffortHrs: a.estEffortHrs,
    estSpending: a.estSpending,
    outstandingSpending: a.estSpending,
    spentAmount: 0,
    effortCompletionPercentage: 0,
    effortCostPerHrType: "use_average",
    impacts: a.impacts.map(({ symbol, ...rest }) => ({ ...rest, nodeId: "id_" + symbol }))
  }));
  return { sample, nodes, roleNodes, actions };
}

describe("sample organization", () => {
  it("has every text in both languages", () => {
    for (const messages of [enUs, zhTw]) expect(() => compileSample(messages)).not.toThrow();
  });

  it("links its factors and fills all seven roles", () => {
    const { nodes, roleNodes } = compileSample();
    expect(Object.keys(roleNodes)).toHaveLength(7);
    const served = nodes.find(n => n.symbol == "mealsServed");
    expect(served.sysFormula).toBe("min($id_packingCapacity, $id_foodAvailableInMeals)");
    expect(served.class).toBe("state");
    const volunteers = nodes.find(n => n.symbol == "volunteers");
    expect(volunteers.isSelfBlocking).toBe(false);
    expect(volunteers.blockingInfluencers).toEqual(["id_newVolunteersPerMonth", "id_volunteersLeavingPerMonth"]);
  });

  it("calculates, and ranks the actions as the notes explain", async () => {
    const { nodes, roleNodes, actions } = compileSample();
    const run = await runCalc(
      message(nodes, { calculationType: "actions", roleNodes, actions, simulationParams })
    );
    expect(run.error).toBeUndefined();
    const [baseline, actionResults] = run.results;
    const meals = baseline.nodesValues.id_mealsServed;
    expect(meals[0]).toBeCloseTo(40 * 6 * 10 * 1.02, 0); // first month: 40.8 volunteers
    expect(meals[120]).toBeCloseTo(3000, 0); // settles at 50 volunteers

    const leverage = Object.fromEntries(
      actionResults.actionsResults.map(r => [r.id, r.effectiveResultsNumbers.actionLeverage])
    );
    expect(leverage.recruit).toBeGreaterThan(0);
    expect(leverage.supermarkets).toBeLessThan(0);
    expect(leverage.report).toBeLessThan(0);
  });

  it("calculates in Taiwan dollars too", async () => {
    const { nodes, roleNodes } = compileSample(zhTw, "TWD");
    const run = await runCalc(message(nodes, { roleNodes, simulationParams }));
    expect(run.error).toBeUndefined();
  });
});
