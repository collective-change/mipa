// @vitest-environment node
//
// Black-box tests of the calculation web worker: send it the same message the
// app sends, check what it posts back. Expected values are worked out
// independently in each test rather than copied from the worker's output.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  node,
  message,
  runCalc,
  mockFirebaseModules,
  defaultParams,
  FIXED_NOW,
  YEAR_S
} from "./harness.js";

let actionsInFirestore = [];
const fb = mockFirebaseModules(() => actionsInFirestore);
vi.mock("firebase/app", () => fb.app);
vi.mock("firebase/auth", () => fb.auth);
vi.mock("firebase/firestore", () => fb.firestore);

// mathjs defines a year as 365.25 days.
const MATHJS_YEAR_S = 365.25 * 24 * 3600;

beforeEach(() => {
  actionsInFirestore = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXED_NOW);
  // the worker logs timing tables and progress; keep test output readable
  for (const level of ["log", "table", "error", "warn"]) {
    vi.spyOn(console, level).mockImplementation(() => {});
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function baseline(nodes, overrides) {
  const run = await runCalc(message(nodes, overrides));
  expect(run.error).toBeUndefined();
  const [results] = run.results;
  expect(results.resultsType).toBe("baseline");
  return results;
}

async function expectError(nodes, errorType, overrides) {
  const run = await runCalc(message(nodes, overrides));
  expect(run.results).toEqual([]);
  expect(run.error).toMatchObject({ errorType });
  return run.error;
}

const steps = n => Array(defaultParams.numTimeSteps + 1).fill(n);

describe("baseline: time steps", () => {
  it("starts at the calculation time and takes numTimeSteps + 1 points", async () => {
    const r = await baseline([node("a", "1")]);
    const start = FIXED_NOW.getTime() / 1000;
    expect(r.startTimeS).toBe(start);
    expect(r.calcDate).toBe(FIXED_NOW.getTime());
    expect(r.timeSPoints).toEqual(
      [0, 1, 2, 3, 4].map(i => start + i * MATHJS_YEAR_S)
    );
    expect(r.nodesValues.a).toHaveLength(5);
  });

  it("grows each step by timeStepGrowthRate", async () => {
    const r = await baseline([node("a", "1")], {
      simulationParams: { ...defaultParams, timeStepGrowthRate: 1 }
    });
    const gaps = r.timeSPoints
      .slice(1)
      .map((t, i) => (t - r.timeSPoints[i]) / MATHJS_YEAR_S);
    expect(gaps).toEqual([1, 2, 4, 8]);
  });

  it("exposes the current step length as dt", async () => {
    // A formula with no node reference is wrapped as unit(<formula>, '<unit>'),
    // so dt is used together with a node, as in real models.
    const r = await baseline([
      node("perDay", "2", { unit: "kg / day" }),
      node("perStep", "$perDay * dt", { unit: "kg", blockingInfluencers: ["perDay"] })
    ]);
    expect(r.nodesValues.perStep).toEqual(steps(2 * 365.25));
  });
});

describe("baseline: formulas", () => {
  it("evaluates nodes after the nodes they depend on, whatever the input order", async () => {
    const r = await baseline([
      node("c", "$b + 1", { blockingInfluencers: ["b"] }),
      node("b", "$a * 2", { blockingInfluencers: ["a"] }),
      node("a", "10")
    ]);
    expect(r.nodesValues.a).toEqual(steps(10));
    expect(r.nodesValues.b).toEqual(steps(20));
    expect(r.nodesValues.c).toEqual(steps(21));
  });

  it("accumulates a stock with delay(self, dt, initial)", async () => {
    const r = await baseline([
      node("inflow", "10"),
      node("stock", "delay($stock, dt, 5) + $inflow", {
        blockingInfluencers: ["inflow"]
      })
    ]);
    expect(r.nodesValues.stock).toEqual([15, 25, 35, 45, 55]);
  });

  it("returns the initial value from delay() before the delayed time exists", async () => {
    const r = await baseline([
      node("growing", "delay($growing, dt, 1) * 2"),
      node("lagged", "delay($growing, 2 years, 0)")
    ]);
    expect(r.nodesValues.growing).toEqual([2, 4, 8, 16, 32]);
    expect(r.nodesValues.lagged).toEqual([0, 0, 2, 4, 8]);
  });

  it("uses mathjs 15 grouping for a negative fraction followed by a symbol", async () => {
    // Under the old mathjs 8 this meant -1 / (2 * a) = -0.05.
    const r = await baseline([
      node("a", "10"),
      node("half", "-1 / 2 $a", { blockingInfluencers: ["a"] })
    ]);
    expect(r.nodesValues.half).toEqual(steps(-5));
  });

  it("treats a factor without a formula yet as 0", async () => {
    // a factor just added with "Add factor" has no calculator formula yet
    const r = await baseline([
      node("fresh", ""),
      node("freshMoney", "", { unit: "USD" }),
      node("uses", "$fresh + 1", { blockingInfluencers: ["fresh"] })
    ]);
    expect(r.nodesValues.fresh).toEqual(steps(0));
    expect(r.nodesValues.freshMoney).toEqual(steps(0));
    expect(r.nodesValues.uses).toEqual(steps(1));
  });

  it("supports conditionals and built-in functions", async () => {
    const r = await baseline([
      node("a", "-3"),
      node("clamped", "$a < 0 ? 0 : $a", { blockingInfluencers: ["a"] }),
      node("biggest", "max(abs($a), 2)", { blockingInfluencers: ["a"] })
    ]);
    expect(r.nodesValues.clamped).toEqual(steps(0));
    expect(r.nodesValues.biggest).toEqual(steps(3));
  });
});

describe("baseline: units and currencies", () => {
  it("reports each node's values in that node's own unit", async () => {
    const r = await baseline([
      node("distance", "5", { unit: "km" }),
      node("meters", "$distance", { unit: "m", blockingInfluencers: ["distance"] })
    ]);
    expect(r.nodesValues.distance).toEqual(steps(5));
    expect(r.nodesValues.meters).toEqual(steps(5000));
  });

  it("converts currencies with the exchange rates in the message", async () => {
    // rates are per 1 USD: 1 USD = 32 TWD = 0.8 EUR
    const r = await baseline([
      node("usd", "30", { unit: "USD" }),
      node("twd", "$usd", { unit: "TWD", blockingInfluencers: ["usd"] }),
      node("eur", "$twd", { unit: "EUR", blockingInfluencers: ["twd"] })
    ]);
    expect(r.nodesValues.twd).toEqual(steps(960));
    r.nodesValues.eur.forEach(v => expect(v).toBeCloseTo(24, 10));
  });

  it("accepts constants written with a unit", async () => {
    const r = await baseline([
      node("bare", "5", { unit: "km" }),
      node("withUnit", "5 km", { unit: "km" }),
      node("converted", "5 km", { unit: "m" }),
      node("money", "-3/4 USD", { unit: "USD" }),
      node("stepDays", "dt", { unit: "days" })
    ]);
    expect(r.nodesValues.bare).toEqual(steps(5));
    expect(r.nodesValues.withUnit).toEqual(steps(5));
    expect(r.nodesValues.converted).toEqual(steps(5000));
    expect(r.nodesValues.money).toEqual(steps(-0.75));
    expect(r.nodesValues.stepDays).toEqual(steps(365.25));
  });

  it("knows mipa's custom units", async () => {
    const r = await baseline([
      node("team", "3", { unit: "people" }),
      node("hours", "$team * 40 workhours / person", {
        unit: "workhours",
        blockingInfluencers: ["team"]
      })
    ]);
    expect(r.nodesValues.hours).toEqual(steps(120));
  });
});

describe("baseline: date functions", () => {
  it("returns the simulated year and calendar month", async () => {
    // mid-month start so the 6-hour yearly drift and time zones don't matter
    vi.setSystemTime(new Date("2026-07-15T12:00:00Z"));
    const r = await baseline([
      node("year", "getSimYear()"),
      node("month", "getSimCalendarMonth()"),
      node("monthAhead", 'getSimCalendarMonth("2 months")')
    ]);
    expect(r.nodesValues.year).toEqual([2026, 2027, 2028, 2029, 2030]);
    expect(r.nodesValues.month).toEqual(steps(7));
    expect(r.nodesValues.monthAhead).toEqual(steps(9));
  });
});

describe("baseline: errors", () => {
  it("rejects a unitless result for a node that expects a unit", async () => {
    const error = await expectError(
      [node("a", "10"), node("money", "$a * 3", { unit: "USD", blockingInfluencers: ["a"] })],
      "Unit mismatch"
    );
    expect(error.errorData).toEqual({ nodeId: "money" });
  });

  it("rejects a result with the wrong dimension", async () => {
    await expectError(
      [node("a", "10", { unit: "km" }), node("b", "$a", { unit: "USD", blockingInfluencers: ["a"] })],
      "Unit mismatch"
    );
  });

  it("rejects a constant written in the wrong kind of unit", async () => {
    const error = await expectError([node("a", "5 USD", { unit: "km" })], "Unit mismatch");
    expect(error.errorData).toEqual({ nodeId: "a" });
  });

  it("reports circular dependencies with the nodes involved", async () => {
    const error = await expectError(
      [
        node("a", "$b + 1", { blockingInfluencers: ["b"] }),
        node("b", "$a + 1", { blockingInfluencers: ["a"] }),
        node("free", "1")
      ],
      "Circular dependency detected"
    );
    expect(error.errorData.map(n => n.id).sort()).toEqual(["a", "b"]);
  });

  it("reports formulas that don't parse", async () => {
    await expectError([node("a", "1 +")], "Parse error");
  });

  it("reports unknown units", async () => {
    await expectError([node("a", "1", { unit: "flubbers" })], "Unit loading error");
  });
});

// A small model with the role nodes that action calculations need.
function actionModel() {
  return {
    nodes: [
      node("avgCost", "50"),
      node("doctorRate", "120"), // hourly cost of a role, used by some actions
      node("effort", "0"),
      node("spending", "0", { unit: "USD" }),
      node("trees", "100"),
      node("worldBenefit", "$trees * 1 USD", {
        unit: "USD",
        blockingInfluencers: ["trees"]
      }),
      node("orgBenefit", "0", { unit: "USD" }),
      node("orgCost", "$spending + $effort * 50 USD", {
        unit: "USD",
        blockingInfluencers: ["spending", "effort"]
      }),
      node("worldCost", "0", { unit: "USD" })
    ],
    roleNodes: {
      averageEffortCostPerHour: "avgCost",
      effort: "effort",
      spending: "spending",
      orgBenefit: "orgBenefit",
      orgCost: "orgCost",
      worldBenefit: "worldBenefit",
      worldCost: "worldCost"
    }
  };
}

function action(id, extra = {}) {
  return {
    id,
    title: id,
    impacts: [],
    estEffortHrs: 0,
    effortCompletionPercentage: 0,
    estSpending: 0,
    outstandingSpending: 0,
    spentAmount: 0,
    effortCostPerHrType: "use_average",
    ...extra
  };
}

function treesImpact(operand, extra = {}) {
  return {
    nodeId: "trees",
    operation: "+",
    operand,
    durationType: "forever",
    impactType: "if_done",
    ...extra
  };
}

async function calcActions(actions) {
  const { nodes, roleNodes } = actionModel();
  const run = await runCalc(
    message(nodes, { calculationType: "actions", roleNodes, actions })
  );
  expect(run.error).toBeUndefined();
  expect(run.results.map(r => r.resultsType)).toEqual(["baseline", "actions"]);
  return run.results[1].actionsResults;
}

// NPV of a constant yearly amount at each time point, discounted at 5%/year
function npvOfConstant(amount, points = 5) {
  let npv = 0;
  for (let i = 0; i < points; i++) {
    const tYears = (i * MATHJS_YEAR_S) / YEAR_S;
    npv += amount / Math.pow(1.05, tYears);
  }
  return npv;
}

describe("actions", () => {
  it("computes costs, benefits, ROI and leverage of a single action", async () => {
    const [result] = await calcActions([
      action("plant", {
        impacts: [treesImpact(50)],
        estEffortHrs: 10,
        estSpending: 100,
        outstandingSpending: 100
      })
    ]);

    // 10 h at the average 50/h plus 100 spending, all at the start
    const cost = 10 * 50 + 100;
    // 50 more trees, each worth 1 USD, at every time point
    const benefit = npvOfConstant(50);
    const net = benefit - cost;
    const roi = net / cost;

    expect(result.id).toBe("plant");
    const n = result.effectiveResultsNumbers;
    expect(n.outstandingDirectCosts).toBe(cost);
    expect(n.marginalOrgCostNpv).toBeCloseTo(cost, 9);
    expect(n.marginalWorldBenefitNpv).toBeCloseTo(benefit, 9);
    expect(n.marginalNetTotalBenefitNpv).toBeCloseTo(net, 9);
    expect(n.totalRoi).toBeCloseTo(roi, 9);
    expect(n.actionLeverage).toBeCloseTo(((net * roi) / cost) * Math.sign(net), 9);
    expect(result.effectiveChainedCostsAndImpacts.includedActionIds).toEqual(["plant"]);
  });

  it("uses the hourly cost of a role's factor when the action names one", async () => {
    const [result] = await calcActions([
      action("consult", {
        estEffortHrs: 10,
        effortCostPerHrType: "use_factor",
        effortCostNodeId: "doctorRate"
      })
    ]);
    expect(result.effectiveChainedCostsAndImpacts.estEffortCosts).toBe(1200);
  });

  it("falls back to the average hourly cost if the role's factor is gone", async () => {
    const [result] = await calcActions([
      action("consult", {
        estEffortHrs: 10,
        effortCostPerHrType: "use_factor",
        effortCostNodeId: "deleted"
      })
    ]);
    expect(result.effectiveChainedCostsAndImpacts.estEffortCosts).toBe(500);
  });

  it("only counts the outstanding part of effort and uses a custom hourly cost", async () => {
    const [result] = await calcActions([
      action("half done", {
        impacts: [treesImpact(1000)],
        estEffortHrs: 10,
        effortCompletionPercentage: 40,
        effortCostPerHrType: "use_custom",
        customEffortCostPerHr: 20
      })
    ]);
    const c = result.effectiveChainedCostsAndImpacts;
    expect(c.estEffortCosts).toBe(200);
    expect(c.outstandingDirectEffortHrs).toBeCloseTo(6, 12);
    expect(c.outstandingDirectCosts).toBeCloseTo(120, 9);
  });

  it("counts an if_not_done impact as benefit avoided by doing the action", async () => {
    // if the action is not done, 20 trees are lost every step
    const [result] = await calcActions([
      action("protect", {
        impacts: [treesImpact(20, { operation: "-", impactType: "if_not_done" })],
        outstandingSpending: 100
      })
    ]);
    const n = result.effectiveResultsNumbers;
    expect(n.marginalWorldBenefitNpv).toBeCloseTo(npvOfConstant(20), 9);
    expect(n.marginalOrgCostNpv).toBeCloseTo(100, 9);
  });

  it("applies a just_once impact only at the first time point", async () => {
    const [result] = await calcActions([
      action("one-off", {
        impacts: [treesImpact(50, { durationType: "just_once" })],
        outstandingSpending: 10
      })
    ]);
    expect(result.effectiveResultsNumbers.marginalWorldBenefitNpv).toBeCloseTo(50, 9);
  });

  it("includes a child action's costs and impacts in its parent", async () => {
    const child = action("child", {
      parentActionId: "parent",
      impacts: [treesImpact(30)],
      outstandingSpending: 40
    });
    const parent = action("parent", {
      childrenActionIds: ["child"],
      impacts: [treesImpact(10)],
      outstandingSpending: 60
    });
    actionsInFirestore = [child, parent];

    const results = await calcActions([parent]);
    const byId = Object.fromEntries(results.map(r => [r.id, r]));
    expect(Object.keys(byId).sort()).toEqual(["child", "parent"]);

    const chained = byId.parent.effectiveChainedCostsAndImpacts;
    expect(chained.includedActionIds).toEqual(["parent", "child"]);
    expect(chained.outstandingDirectCosts).toBe(100);
    expect(byId.parent.effectiveResultsNumbers.marginalWorldBenefitNpv).toBeCloseTo(
      npvOfConstant(40),
      9
    );
    expect(byId.child.effectiveResultsNumbers.marginalWorldBenefitNpv).toBeCloseTo(
      npvOfConstant(30),
      9
    );
  });
});
