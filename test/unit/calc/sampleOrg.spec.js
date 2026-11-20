// @vitest-environment node
//
// The sample organization must calculate without errors and teach what it
// is meant to: recruiting volunteers does good, more food alone does little
// (volunteer hours are the bottleneck), and a glossy report only costs.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { message, runCalc, mockFirebaseModules, FIXED_NOW } from "./harness.js";
import { compileDraftNodes, roleNodesOf } from "@/utils/util-model-draft";
import { buildSampleOrg } from "@/utils/sample-org";
import { buildSampleDossierData } from "@/utils/modelDossier";
import enUs from "@/i18n/en-us/index.js";
import zhTw from "@/i18n/zh-tw/index.js";

const fb = mockFirebaseModules(() => []);
let nextAutoId = 1;
const batchWrites = [];
const addedDocs = [];
const setDocs = [];

const makeRef = (colPath, id) => {
  const docId = id || `auto_${nextAutoId++}`;
  return { id: docId, path: `${colPath}/${docId}` };
};

vi.mock("firebase/app", () => fb.app);
vi.mock("firebase/auth", () => fb.auth);
vi.mock("firebase/functions", () => ({
  getFunctions: () => ({}),
  httpsCallable: () => vi.fn()
}));
vi.mock("firebase/firestore", () => ({
  ...fb.firestore,
  collection: (_db, ...segments) => ({ path: segments.join("/") }),
  doc: (colOrDb, ...segments) =>
    typeof colOrDb?.path === "string"
      ? makeRef(colOrDb.path, segments[0])
      : makeRef(segments.slice(0, -1).join("/"), segments[segments.length - 1]),
  addDoc: vi.fn(async (colRef, data) => {
    const ref = makeRef(colRef.path);
    addedDocs.push({ ref, data: structuredClone(data) });
    return ref;
  }),
  setDoc: vi.fn(async (ref, data, options) => {
    setDocs.push({ ref, data: structuredClone(data), options });
  }),
  deleteDoc: vi.fn(async () => {}),
  orderBy: vi.fn((field, dir) => ({ field, dir })),
  serverTimestamp: vi.fn(() => "__SERVER_TIMESTAMP__"),
  writeBatch: vi.fn(() => ({
    set: (ref, data, options) => {
      batchWrites.push({ ref, data: structuredClone(data), options });
    },
    commit: vi.fn(async () => {})
  }))
}));
vi.mock("@/boot/firebase", () => ({
  firebaseConfig: { projectId: "demo-mipa", apiKey: "test" },
  useEmulators: false,
  firebaseDb: {},
  firebaseFunctions: {},
  firebaseAuth: {
    currentUser: {
      uid: "u_cfo_1",
      email: "cfo@example.org",
      displayName: "CFO"
    }
  }
}));
vi.mock("@/store/firestore-bind", () => ({
  firestoreAction: fn => fn
}));
vi.mock("@/utils/util-show-error-message", () => ({
  showErrorMessage: vi.fn()
}));
vi.mock("quasar", () => {
  let uidCounter = 1;
  return {
    uid: () => `q_uid_${uidCounter++}`,
    Notify: { create: vi.fn() }
  };
});

beforeEach(() => {
  nextAutoId = 1;
  batchWrites.length = 0;
  addedDocs.length = 0;
  setDocs.length = 0;
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
    effortCostPerHrType: a.effortCostSymbol ? "use_factor" : "use_average",
    effortCostNodeId: a.effortCostSymbol ? "id_" + a.effortCostSymbol : null,
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

    // the supermarket partnership is run by the coordinator: 60 h at 25/h
    const supermarkets = actionResults.actionsResults.find(r => r.id == "supermarkets");
    expect(supermarkets.effectiveChainedCostsAndImpacts.estEffortCosts).toBe(1500);
  });

  it("calculates in Taiwan dollars too", async () => {
    const { nodes, roleNodes } = compileSample(zhTw, "TWD");
    const run = await runCalc(message(nodes, { roleNodes, simulationParams }));
    expect(run.error).toBeUndefined();
  });

  it("pre-calculates all three sample actions on creation with non-null leverage without Recalculate", async () => {
    const originalWorker = globalThis.Worker;
    globalThis.Worker = class NodeCalcWorkerAdapter {
      constructor() {
        this.onmessage = null;
        this.onerror = null;
      }
      postMessage(msg) {
        runCalc(msg)
          .then(run => {
            if (run.error) {
              if (this.onmessage) this.onmessage({ data: run.error });
              return;
            }
            for (const result of run.results) {
              if (this.onmessage) this.onmessage({ data: result });
            }
          })
          .catch(err => {
            if (this.onerror) this.onerror({ message: err.message });
          });
      }
      terminate() {}
    };

    try {
      const orgsModule = (await import("@/store/store-orgs")).default;
      const dispatched = [];
      const dispatch = vi.fn(async (type, payload) => {
        dispatched.push({ type, payload });
      });

      const created = await orgsModule.actions.createSampleOrg({
        dispatch,
        rootState: { adHocDocs: { exchangeRates: { base: "USD", rates: { USD: 1, TWD: 30, EUR: 0.8 } } } }
      });

      expect(created.orgId).toBeTruthy();
      expect(created.nameSlug).toBeTruthy();

      const writtenActions = batchWrites
        .filter(w => w.ref.path.startsWith("actions/"))
        .map(w => w.data);
      expect(writtenActions).toHaveLength(3);

      for (const action of writtenActions) {
        expect(typeof action.actionLeverage).toBe("number");
        expect(Number.isFinite(action.actionLeverage)).toBe(true);
        expect(action.actionLeverage).not.toBeNull();
        expect(action.effectiveResultsNumbers?.actionLeverage).toBe(action.actionLeverage);
        expect(action.branchAndBlockeesResultsNumbers?.actionLeverage).toBe(action.actionLeverage);
        expect(action.effectiveChainedCostsAndImpacts).toBeDefined();
      }

      const byTitle = Object.fromEntries(writtenActions.map(a => [a.title, a]));
      expect(byTitle[enUs.sample.actions.recruit.title].actionLeverage).toBeGreaterThan(0);
      expect(byTitle[enUs.sample.actions.supermarkets.title].actionLeverage).toBeLessThan(0);
      expect(byTitle[enUs.sample.actions.report.title].actionLeverage).toBeLessThan(0);

      const baselineSave = dispatched.find(d => d.type === "calcResults/saveBaseline");
      expect(baselineSave).toBeDefined();
      expect(baselineSave.payload.resultsType).toBe("baseline");
    } finally {
      globalThis.Worker = originalWorker;
    }
  });

  it("MIPA-60: buildSampleDossierData matches calcWorker runCalc action metrics", async () => {
    const { nodes, roleNodes, actions } = compileSample(enUs, "USD");
    const run = await runCalc(
      message(nodes, { calculationType: "actions", roleNodes, actions, simulationParams })
    );
    expect(run.error).toBeUndefined();
    const [, actionResults] = run.results;
    const byWorkerId = Object.fromEntries(
      actionResults.actionsResults.map(r => [r.id, r.effectiveResultsNumbers])
    );

    const dossierData = buildSampleDossierData({
      modelId: "sample",
      t: translator(enUs),
      locale: "en-us"
    });
    expect(dossierData.nodes).toHaveLength(20);
    expect(dossierData.actions).toHaveLength(3);

    for (const action of dossierData.actions) {
      const workerNums = byWorkerId[action.key];
      expect(action.outstandingDirectCosts).toBeCloseTo(workerNums.outstandingDirectCosts, 4);
      expect(action.marginalTotalBenefitNpv).toBeCloseTo(workerNums.marginalTotalBenefitNpv, 2);
      expect(action.totalRoi).toBeCloseTo(workerNums.totalRoi, 4);
      expect(action.actionLeverage).toBeCloseTo(workerNums.actionLeverage, 4);
    }
  });
});
