// @vitest-environment node
//
// Applying an AI draft to an existing model, and checking that the result
// calculates in the real calculation worker.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { message, runCalc, mockFirebaseModules, FIXED_NOW } from "./harness.js";
import { compileDraftNodes, compileModelDraft, roleNodesOf } from "@/utils/util-model-draft";

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

// A new organization's model: the seven starter factors.
function starterModel() {
  return compileDraftNodes(
    {
      factors: [
        { symbol: "averageEffortCostPerHour", formula: "10", unit: "USD" },
        { symbol: "oneTimeEffort", formula: "0", unit: "workhours" },
        { symbol: "oneTimeSpending", formula: "0", unit: "USD" },
        { symbol: "costToOrganizationDuringInterval", formula: "0", unit: "USD" },
        { symbol: "costToWorldDuringInterval", formula: "0", unit: "USD" },
        { symbol: "benefitToOrganizationDuringInterval", formula: "0", unit: "USD" },
        { symbol: "benefitToWorldDuringInterval", formula: "0", unit: "USD" }
      ]
    },
    symbol => "old_" + symbol
  );
}

const bakeryDraft = {
  factors: [
    { symbol: "loavesSold", name: "loaves sold", formula: "3000", unit: "" },
    { symbol: "pricePerLoaf", name: "price", formula: "4", unit: "USD" },
    { symbol: "salesIncome", name: "sales", formula: "loavesSold * pricePerLoaf", unit: "USD" },
    { symbol: "wages", name: "wages", formula: "11200", unit: "USD" }
  ],
  changesToExisting: [
    { symbol: "benefitToOrganizationDuringInterval", newFormula: "salesIncome" },
    {
      symbol: "costToOrganizationDuringInterval",
      newFormula:
        "wages + oneTimeSpending + oneTimeEffort / (1 workhour) * averageEffortCostPerHour"
    }
  ]
};

describe("applying a draft to a model", () => {
  it("links new factors to each other and to existing ones", () => {
    const existing = starterModel();
    const { creates, updates, problems } = compileModelDraft(bakeryDraft, existing, s => "new_" + s);
    expect(problems).toEqual([]);
    const sales = creates.find(n => n.symbol == "salesIncome");
    expect(sales.sysFormula).toBe("$new_loavesSold * $new_pricePerLoaf");
    expect(sales.influencees).toEqual(["old_benefitToOrganizationDuringInterval"]);
    expect(sales.class).toBe("state");

    const benefit = updates.find(u => u.id == "old_benefitToOrganizationDuringInterval");
    expect(benefit.fields.sysFormula).toBe("$new_salesIncome");
    expect(benefit.fields.influencers).toEqual(["new_salesIncome"]);
    expect(benefit.previous.sysFormula).toBe("0");
    expect(benefit.previous.influencers).toEqual([]);

    // existing factors used by a changed formula gain it as an influencee
    const spending = updates.find(u => u.id == "old_oneTimeSpending");
    expect(spending.fields.influencees).toEqual(["old_costToOrganizationDuringInterval"]);
    expect(spending.previous.influencees).toEqual([]);
  });

  it("drops links a changed formula no longer uses", () => {
    const existing = starterModel();
    const first = compileModelDraft(bakeryDraft, existing, s => "new_" + s);
    // apply the first draft, then change costs to wages only
    const applied = existing.map(n => {
      const u = first.updates.find(x => x.id == n.id);
      return u ? { ...n, ...u.fields } : n;
    });
    const all = [...applied, ...first.creates];
    const second = compileModelDraft(
      { factors: [], changesToExisting: [{ symbol: "costToOrganizationDuringInterval", newFormula: "wages" }] },
      all,
      s => "x_" + s
    );
    const spending = second.updates.find(u => u.id == "old_oneTimeSpending");
    expect(spending.fields.influencees).toEqual([]);
  });

  it("reports duplicate and clashing short names and unreadable formulas", () => {
    const existing = starterModel();
    const { creates, problems } = compileModelDraft(
      {
        factors: [
          { symbol: "oneTimeEffort", formula: "1" },
          { symbol: "a", formula: "1" },
          { symbol: "a", formula: "2" },
          { symbol: "b", formula: "2 +* 3" },
          { symbol: "has space", formula: "1" }
        ],
        changesToExisting: [{ symbol: "missing", newFormula: "1" }]
      },
      existing,
      s => s
    );
    expect(creates).toEqual([]);
    expect(problems).toHaveLength(5);
  });

  it("gives a model the calculation worker can run", async () => {
    const existing = starterModel();
    const { creates, updates } = compileModelDraft(bakeryDraft, existing, s => "new_" + s);
    const nodes = [
      ...existing.map(n => {
        const u = updates.find(x => x.id == n.id);
        return u ? { ...n, ...u.fields } : n;
      }),
      ...creates
    ];
    const run = await runCalc(message(nodes, { roleNodes: roleNodesOf(nodes) }));
    expect(run.error).toBeUndefined();
    expect(run.results[0].nodesValues.old_benefitToOrganizationDuringInterval[0]).toBe(12000);
    expect(run.results[0].nodesValues.old_costToOrganizationDuringInterval[0]).toBe(11200);
  });
});
