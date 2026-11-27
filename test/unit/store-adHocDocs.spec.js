import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStore } from "vuex";

let listeners = [];
vi.mock("firebase/firestore", () => {
  class DocumentReference {
    constructor(path) {
      this.path = path;
    }
  }
  return {
    DocumentReference,
    doc: (_db, ...segments) => new DocumentReference(segments.join("/")),
    onSnapshot: (ref, next, error) => {
      const entry = { ref, next, error, unsubscribed: false };
      listeners.push(entry);
      return () => {
        entry.unsubscribed = true;
      };
    }
  };
});

vi.mock("@/boot/firebase", () => ({
  firebaseDb: {}
}));

const { firestoreMutations } = await import("@/store/firestore-bind");
const adHocDocsModule = (await import("@/store/store-adHocDocs")).default;

const makeDocSnap = (id, data) => ({
  id,
  exists: () => data != null,
  data: () => ({ ...data })
});

function makeTestStore() {
  return createStore({
    mutations: { ...firestoreMutations },
    modules: {
      adHocDocs: {
        ...adHocDocsModule,
        state: () => ({
          appSummary: null,
          exchangeRates: null
        })
      }
    }
  });
}

describe("store-adHocDocs characterization", () => {
  beforeEach(() => {
    listeners = [];
  });

  it("starts with null appSummary and exchangeRates", () => {
    const store = makeTestStore();
    expect(store.state.adHocDocs.appSummary).toBeNull();
    expect(store.state.adHocDocs.exchangeRates).toBeNull();
  });

  it("binds appSummary document and preserves cached data on unbindAppSummary", async () => {
    const store = makeTestStore();
    const bindPromise = store.dispatch("adHocDocs/bindAppSummary");
    expect(listeners).toHaveLength(1);
    expect(listeners[0].ref.path).toBe("adHocDocs/appSummary");

    listeners[0].next(makeDocSnap("appSummary", { promptToReloadNumber: 4 }));
    await bindPromise;

    expect(store.state.adHocDocs.appSummary).toEqual({ promptToReloadNumber: 4 });
    expect(store.state.adHocDocs.appSummary.id).toBe("appSummary");

    store.dispatch("adHocDocs/unbindAppSummary");
    expect(listeners[0].unsubscribed).toBe(true);
    expect(store.state.adHocDocs.appSummary).toEqual({ promptToReloadNumber: 4 });
  });

  it("binds exchangeRates document and preserves cached data on unbindExchangeRates", async () => {
    const store = makeTestStore();
    const bindPromise = store.dispatch("adHocDocs/bindExchangeRates");
    expect(listeners).toHaveLength(1);
    expect(listeners[0].ref.path).toBe("adHocDocs/exchangeRates");

    const ratesPayload = { base: "USD", rates: { USD: 1, TWD: 32 } };
    listeners[0].next(makeDocSnap("exchangeRates", ratesPayload));
    await bindPromise;

    expect(store.state.adHocDocs.exchangeRates).toEqual(ratesPayload);

    store.dispatch("adHocDocs/unbindExchangeRates");
    expect(listeners[0].unsubscribed).toBe(true);
    expect(store.state.adHocDocs.exchangeRates).toEqual(ratesPayload);
  });
});
