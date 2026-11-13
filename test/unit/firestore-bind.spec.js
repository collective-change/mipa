import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStore } from "vuex";

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

const { firestoreAction, firestoreMutations } = await import("@/store/firestore-bind");
const { DocumentReference } = await import("firebase/firestore");

const docSnap = (id, data) => ({ id, exists: () => data != null, data: () => ({ ...data }) });

function makeStore() {
  return createStore({
    mutations: firestoreMutations,
    modules: {
      things: {
        namespaced: true,
        state: { list: [], one: null },
        actions: {
          bindList: firestoreAction(({ bindFirestoreRef }, ref) => bindFirestoreRef("list", ref, { wait: true })),
          bindOne: firestoreAction(({ bindFirestoreRef }, ref) => bindFirestoreRef("one", ref)),
          unbindList: firestoreAction(({ unbindFirestoreRef }, reset) => unbindFirestoreRef("list", reset))
        }
      }
    }
  });
}

beforeEach(() => (listeners = []));

describe("firestoreAction", () => {
  it("binds a query and resolves on the first snapshot", async () => {
    const store = makeStore();
    const p = store.dispatch("things/bindList", {});
    listeners[0].next({ docs: [docSnap("a", { n: 1 }), docSnap("b", { n: 2 })] });
    const value = await p;

    expect(value).toHaveLength(2);
    expect(store.state.things.list.map(x => x.id)).toEqual(["a", "b"]);
    expect(Object.keys(store.state.things.list[0])).toEqual(["n"]); // id is non-enumerable

    listeners[0].next({ docs: [docSnap("c", { n: 3 })] });
    expect(store.state.things.list.map(x => x.id)).toEqual(["c"]);
  });

  it("binds a document reference", async () => {
    const store = makeStore();
    const p = store.dispatch("things/bindOne", new DocumentReference());
    listeners[0].next(docSnap("x", { name: "X" }));
    await p;
    expect(store.state.things.one).toEqual({ name: "X" });
    expect(store.state.things.one.id).toBe("x");
  });

  it("rebinding unsubscribes the previous listener", async () => {
    const store = makeStore();
    store.dispatch("things/bindList", {});
    store.dispatch("things/bindList", {});
    expect(listeners[0].unsubscribed).toBe(true);
    expect(listeners[1].unsubscribed).toBe(false);
  });

  it("unbind with reset clears state; without reset keeps it", async () => {
    const store = makeStore();
    const p = store.dispatch("things/bindList", {});
    listeners[0].next({ docs: [docSnap("a", { n: 1 })] });
    await p;
    store.dispatch("things/unbindList", false);
    expect(store.state.things.list).toHaveLength(1);
    expect(listeners[0].unsubscribed).toBe(true);
    store.dispatch("things/unbindList", true);
    expect(store.state.things.list).toEqual([]);
  });

  it("rejects when the first snapshot errors", async () => {
    const store = makeStore();
    const p = store.dispatch("things/bindList", {});
    listeners[0].error(new Error("permission-denied"));
    await expect(p).rejects.toThrow("permission-denied");
  });
});
