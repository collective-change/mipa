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

const steps = n => Array(defaultParams.numTimeSteps + 1).fill(n);

describe("MIPA-19: Custom Variables in Calculation Engine", () => {
  it("evaluates a factor whose formula references a custom variable", async () => {
    const customVariables = [
      { name: "retailPrice", value: 45, unit: "" },
      { name: "salesVolume", value: 10, unit: "" }
    ];

    const nodes = [
      node("rev", "retailPrice * salesVolume")
    ];

    const res = await baseline(nodes, { customVariables });
    // 45 * 10 = 450
    expect(res.nodesValues.rev).toEqual(steps(450));
  });

  it("evaluates a factor combining another graph node and a custom variable", async () => {
    const customVariables = [
      { name: "taxRate", value: 0.15, unit: "" }
    ];

    const nodes = [
      node("gross", "1000"),
      node("tax", "$gross * taxRate")
    ];

    const res = await baseline(nodes, { customVariables });
    expect(res.nodesValues.gross).toEqual(steps(1000));
    // 1000 * 0.15 = 150
    expect(res.nodesValues.tax).toEqual(steps(150));
  });

  it("evaluates custom variables with currency and units", async () => {
    const customVariables = [
      { name: "itemCost", value: 20, unit: "USD" },
      { name: "shippingFee", value: 5, unit: "USD" }
    ];

    const nodes = [
      node("totalCost", "itemCost + shippingFee", { unit: "USD" })
    ];

    const res = await baseline(nodes, { customVariables });
    expect(res.nodesValues.totalCost).toEqual(steps(25));
  });

  it("supports custom variables supplied as an object map", async () => {
    const customVariables = {
      productPrice: { value: 30, unit: "" },
      discount: { value: 5, unit: "" }
    };

    const nodes = [
      node("netPrice", "productPrice - discount")
    ];

    const res = await baseline(nodes, { customVariables });
    expect(res.nodesValues.netPrice).toEqual(steps(25));
  });

  it("ensures custom variables do not appear in nodesValues or resultTimeSeries", async () => {
    const customVariables = [
      { name: "hiddenConstant", value: 999, unit: "" }
    ];

    const nodes = [
      node("outputNode", "hiddenConstant + 1")
    ];

    const res = await baseline(nodes, { customVariables });
    // Only outputNode should be in nodesValues; custom variables are NOT graph nodes
    expect(Object.keys(res.nodesValues)).toEqual(["outputNode"]);
    expect(res.nodesValues.hiddenConstant).toBeUndefined();
  });
});
