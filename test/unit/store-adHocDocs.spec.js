import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";

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

const { useAdHocDocsStore } = await import("@/store/store-adHocDocs");

const makeDocSnap = (id, data) => ({
  id,
  exists: () => data != null,
  data: () => ({ ...data })
});

describe("store-adHocDocs (Pinia)", () => {
  beforeEach(() => {
    listeners = [];
    setActivePinia(createPinia());
  });

  it("starts with null appSummary and exchangeRates", () => {
    const store = useAdHocDocsStore();
    expect(store.appSummary).toBeNull();
    expect(store.exchangeRates).toBeNull();
  });

  it("binds appSummary document and preserves cached data on unbindAppSummary", async () => {
    const store = useAdHocDocsStore();
    const bindPromise = store.bindAppSummary();
    expect(listeners).toHaveLength(1);
    expect(listeners[0].ref.path).toBe("adHocDocs/appSummary");

    listeners[0].next(makeDocSnap("appSummary", { promptToReloadNumber: 4 }));
    await bindPromise;

    expect(store.appSummary).toEqual({ promptToReloadNumber: 4 });
    expect(store.appSummary.id).toBe("appSummary");

    store.unbindAppSummary();
    expect(listeners[0].unsubscribed).toBe(true);
    expect(store.appSummary).toEqual({ promptToReloadNumber: 4 });
  });

  it("binds exchangeRates document and preserves cached data on unbindExchangeRates", async () => {
    const store = useAdHocDocsStore();
    const bindPromise = store.bindExchangeRates();
    expect(listeners).toHaveLength(1);
    expect(listeners[0].ref.path).toBe("adHocDocs/exchangeRates");

    const ratesPayload = { base: "USD", rates: { USD: 1, TWD: 32 } };
    listeners[0].next(makeDocSnap("exchangeRates", ratesPayload));
    await bindPromise;

    expect(store.exchangeRates).toEqual(ratesPayload);

    store.unbindExchangeRates();
    expect(listeners[0].unsubscribed).toBe(true);
    expect(store.exchangeRates).toEqual(ratesPayload);
  });
});
