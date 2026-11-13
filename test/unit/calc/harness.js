// Runs the calculation web worker in-process for tests.
//
// Each run loads a fresh copy of the worker module (the app also creates a
// new Worker per calculation), sends it the same message the app sends from
// store-calculator.js, and collects everything it posts back. Messages go
// through structuredClone, like real worker messages, so results that could
// not cross the worker boundary fail the test.
//
// Firebase must be mocked by the test file (vi.mock is hoisted per file);
// see mockFirebase() below.

import { vi } from "vitest";

export const FIXED_NOW = new Date("2026-01-01T00:00:00Z");
export const YEAR_S = 31556952;

export const defaultParams = {
  numTimeSteps: 4,
  timeStepNumber: 1,
  timeStepUnit: "year",
  timeStepGrowthRate: 0,
  orgWeightingFactor: 1,
  worldWeightingFactor: 1
};

export const defaultExchangeRates = {
  base: "USD",
  rates: { USD: 1, TWD: 32, EUR: 0.8 }
};

// Node as stored in Firestore. sysFormula refers to other nodes as $<id>.
export function node(id, sysFormula, extra = {}) {
  return {
    id,
    name: extra.name || id,
    symbol: extra.symbol || id,
    sysFormula,
    symbolFormula: extra.symbolFormula ?? sysFormula,
    unit: "",
    blockingInfluencers: [],
    ...extra
  };
}

export function message(modelNodes, overrides = {}) {
  return {
    firebaseConfig: { projectId: "demo-mipa", apiKey: "test" },
    useEmulators: false,
    calculationType: "baseline",
    orgId: "org1",
    modelId: "model1",
    modelNodes,
    exchangeRates: defaultExchangeRates,
    simulationParams: defaultParams,
    roleNodes: {},
    actions: null,
    currentUserId: "user1",
    ...overrides
  };
}

const isFinal = m =>
  typeof m === "string" ||
  (m && typeof m === "object" && ("resultsType" in m || "errorType" in m));

// Returns { messages, results, error } once the worker posts the results of
// the requested calculation type or an error.
export async function runCalc(msg) {
  vi.resetModules();
  const messages = [];
  const post = m => messages.push(structuredClone(m));
  globalThis.self = globalThis;
  globalThis.postMessage = post;
  globalThis.onmessage = null;
  globalThis.indexedDB = { open: () => ({}) }; // results caching isn't under test

  await import("@/workers/calcWorker.js");
  globalThis.onmessage({ data: structuredClone(msg) });

  const done = () =>
    messages.some(
      m =>
        isFinal(m) &&
        (typeof m === "string" ||
          "errorType" in m ||
          m.resultsType === msg.calculationType)
    );
  await vi.waitFor(
    () => {
      if (!done()) throw new Error("calculation still running");
    },
    { timeout: 10000, interval: 5 }
  );

  const error = messages.find(
    m => typeof m === "string" || (m && "errorType" in m)
  );
  const results = messages.filter(m => m && m.resultsType);
  return { messages, results, error };
}

export function mockFirebaseModules(actionsInFirestore) {
  return {
    app: { initializeApp: () => ({}) },
    auth: {
      getAuth: () => ({ authStateReady: async () => {} }),
      connectAuthEmulator: () => {}
    },
    firestore: {
      getFirestore: () => ({}),
      connectFirestoreEmulator: () => {},
      collection: () => ({}),
      where: (field, op, value) => ({ field, op, value }),
      query: (_col, ...wheres) => ({ wheres }),
      getDocs: async q => {
        const ids = q.wheres.find(w => w.field === "id").value;
        const docs = actionsInFirestore().filter(a => ids.includes(a.id));
        return {
          size: docs.length,
          forEach: cb => docs.forEach(a => cb({ data: () => structuredClone(a) }))
        };
      }
    }
  };
}
