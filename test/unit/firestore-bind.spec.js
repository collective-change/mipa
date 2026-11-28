import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPinia, defineStore } from "pinia";

// Fake Firestore listener so the binding helper can be tested offline.
let listeners = [];
vi.mock("firebase/firestore", () => {
  class DocumentReference {}
  return {
    DocumentReference,
    onSnapshot: (ref, next, error) => {
      const l = { ref, next, error, unsubscribed: false };
      listeners.push(l);
      return () => (l.unsubscribed = true);
    }
  };
});

const { firestoreAction } = await import("@/store/firestore-bind");
const { DocumentReference } = await import("firebase/firestore");

const docSnap = (id, data) => ({ id, exists: () => data != null, data: () => ({ ...data }) });

const useThingsStore = defineStore("things", {
  state: () => ({ list: [], one: null }),
  actions: {
    bindList: firestoreAction(({ bindFirestoreRef }, ref) => bindFirestoreRef("list", ref, { wait: true })),
    bindOne: firestoreAction(({ bindFirestoreRef }, ref) => bindFirestoreRef("one", ref)),
    unbindList: firestoreAction(({ unbindFirestoreRef }, reset) => unbindFirestoreRef("list", reset))
  }
});

function makeStore() {
  return useThingsStore(createPinia());
}

beforeEach(() => (listeners = []));

describe("firestoreAction", () => {
  it("binds a query and resolves on the first snapshot", async () => {
    const store = makeStore();
    const p = store.bindList({});
    listeners[0].next({ docs: [docSnap("a", { n: 1 }), docSnap("b", { n: 2 })] });
    const value = await p;

    expect(value).toHaveLength(2);
    expect(store.list.map(x => x.id)).toEqual(["a", "b"]);
    expect(Object.keys(store.list[0])).toEqual(["n"]); // id is non-enumerable

    listeners[0].next({ docs: [docSnap("c", { n: 3 })] });
    expect(store.list.map(x => x.id)).toEqual(["c"]);
  });

  it("binds a document reference", async () => {
    const store = makeStore();
    const p = store.bindOne(new DocumentReference());
    listeners[0].next(docSnap("x", { name: "X" }));
    await p;
    expect(store.one).toEqual({ name: "X" });
    expect(store.one.id).toBe("x");
  });

  it("rebinding unsubscribes the previous listener", async () => {
    const store = makeStore();
    store.bindList({});
    store.bindList({});
    expect(listeners[0].unsubscribed).toBe(true);
    expect(listeners[1].unsubscribed).toBe(false);
  });

  it("unbind with reset clears state; without reset keeps it", async () => {
    const store = makeStore();
    const p = store.bindList({});
    listeners[0].next({ docs: [docSnap("a", { n: 1 })] });
    await p;
    store.unbindList(false);
    expect(store.list).toHaveLength(1);
    expect(listeners[0].unsubscribed).toBe(true);
    store.unbindList(true);
    expect(store.list).toEqual([]);
  });

  it("rejects when the first snapshot errors", async () => {
    const store = makeStore();
    const p = store.bindList({});
    listeners[0].error(new Error("permission-denied"));
    await expect(p).rejects.toThrow("permission-denied");
  });

  it("logs (and keeps the last value) when the listener errors after the first snapshot", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = makeStore();
    const p = store.bindList({});
    listeners[0].next({ docs: [docSnap("a", { n: 1 })] });
    await p;

    const lateError = new Error("unavailable");
    listeners[0].error(lateError);

    expect(consoleSpy).toHaveBeenCalledWith('Firestore listener "list" failed:', lateError);
    expect(store.list.map((x) => x.id)).toEqual(["a"]);
    consoleSpy.mockRestore();
  });

  it("stores null for a document that does not exist", async () => {
    const store = makeStore();
    const p = store.bindOne(new DocumentReference());
    listeners[0].next(docSnap("gone", null));
    await expect(p).resolves.toBeNull();
    expect(store.one).toBeNull();
  });

  it("keeps updating a document binding after it resolves and logs later errors", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = makeStore();
    const p = store.bindOne(new DocumentReference());
    listeners[0].next(docSnap("x", { name: "X" }));
    listeners[0].next(docSnap("x", { name: "X2" }));
    await expect(p).resolves.toEqual({ name: "X" });
    expect(store.one).toEqual({ name: "X2" });
    listeners[0].error(new Error("late"));
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });
});
