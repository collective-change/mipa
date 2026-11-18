// @vitest-environment node

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  node,
  message,
  runCalc,
  mockFirebaseModules,
  defaultParams,
  FIXED_NOW
} from "./harness.js";

let actionsInFirestore = [];
const fb = mockFirebaseModules(() => actionsInFirestore);
vi.mock("firebase/app", () => fb.app);
vi.mock("firebase/auth", () => fb.auth);
vi.mock("firebase/firestore", () => fb.firestore);

beforeEach(() => {
  actionsInFirestore = [];
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

async function baseline(nodes, overrides) {
  const run = await runCalc(message(nodes, overrides));
  expect(run.error).toBeUndefined();
  const [results] = run.results;
  expect(results.resultsType).toBe("baseline");
  return results;
}

describe("MIPA-20: Historical and Predicted Value Series in Simulation", () => {
  it("feeds historical series points into delay() at simulation start instead of initial fallback", async () => {
    // FIXED_NOW is 2026-01-01T00:00:00Z
    const nodes = [
      node("sales", "0", {
        timeSeries: [
          { date: "2024-01-01", value: 50 },
          { date: "2025-01-01", value: 80 },
          { date: "2026-01-01", value: 100 }
        ]
      }),
      node("lagged1y", "delay($sales, 1 year, 0)"),
      node("lagged2y", "delay($sales, 2 years, 0)")
    ];

    const r = await baseline(nodes);

    // At step 0 (2026-01-01):
    // 1 year delay lands near 2025-01-01 -> historical value ~80
    // 2 year delay lands near 2024-01-01 -> historical value ~50
    expect(r.nodesValues.lagged1y[0]).toBeCloseTo(80, 0);
    expect(r.nodesValues.lagged2y[0]).toBeCloseTo(50, 0);

    // At step 1 (2027-01-01):
    // 2 year delay lands near 2025-01-01 -> historical value ~80
    expect(r.nodesValues.lagged2y[1]).toBeCloseTo(80, 0);
  });

  it("linearly interpolates between historical points when delay targets an in-between date", async () => {
    const nodes = [
      node("historicalMetric", "0", {
        timeSeries: [
          { date: "2024-01-01", value: 100 },
          { date: "2025-01-01", value: 200 },
          { date: "2026-01-01", value: 300 }
        ]
      }),
      // 1.5 years delay from 2026-01-01 targets 2024-07-01 (halfway between 100 and 200)
      node("interpolatedLag", "delay($historicalMetric, 1.5 year, 0)")
    ];

    const r = await baseline(nodes);
    // Linear interpolation halfway between 100 and 200 is ~150
    expect(r.nodesValues.interpolatedLag[0]).toBeCloseTo(150, 0);
  });

  it("drives simulation forward from imported predicted points on an exogenous factor", async () => {
    const nodes = [
      node("predictedDemand", "0", {
        timeSeries: [
          { date: "2025-01-01", value: 1000, isPredicted: false },
          { date: "2026-01-01", value: 1200, isPredicted: false },
          { date: "2027-01-01", value: 1500, isPredicted: true },
          { date: "2028-01-01", value: 1800, isPredicted: true },
          { date: "2029-01-01", value: 2200, isPredicted: true },
          { date: "2030-01-01", value: 2600, isPredicted: true }
        ]
      }),
      node("revenue", "$predictedDemand * 10")
    ];

    const r = await baseline(nodes);

    expect(r.nodesValues.predictedDemand[0]).toBeCloseTo(1200, 0);
    expect(r.nodesValues.revenue[0]).toBeCloseTo(12000, 0);

    // At step 1 (2027-01-01): predictedDemand is ~1500 -> revenue is ~15000
    expect(r.nodesValues.predictedDemand[1]).toBeCloseTo(1500, -1);
    expect(r.nodesValues.revenue[1]).toBeCloseTo(15000, -2);

    // At step 2 (2028-01-01): predictedDemand is ~1800 -> revenue is ~18000
    expect(r.nodesValues.predictedDemand[2]).toBeCloseTo(1800, -1);
    expect(r.nodesValues.revenue[2]).toBeCloseTo(18000, -2);
  });

  it("preserves units across historical series delay calculations", async () => {
    const nodes = [
      node("expenditure", "0", {
        unit: "USD",
        timeSeries: [
          { date: "2024-01-01", value: 4000 },
          { date: "2025-01-01", value: 6000 },
          { date: "2026-01-01", value: 8000 }
        ]
      }),
      node("budgetGrowth", "delay($expenditure, 1 year) * 1.1", { unit: "USD" })
    ];

    const r = await baseline(nodes);
    // At step 0: ~6000 USD * 1.1 = ~6600 USD
    expect(r.nodesValues.budgetGrowth[0]).toBeCloseTo(6600, -1);
  });
});
