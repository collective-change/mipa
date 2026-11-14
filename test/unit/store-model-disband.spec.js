import { describe, it, expect, vi } from "vitest";

// Capture what disbandNodeGroup writes back to the model document.
let written = null;
let currentNodeGroups = [];

vi.mock("firebase/firestore", () => ({
  doc: (...args) => ({ path: args.slice(1).join("/") }),
  runTransaction: async (_db, fn) => {
    const t = {
      get: async () => ({ data: () => ({ nodeGroups: currentNodeGroups }) }),
      update: (_ref, data) => (written = data)
    };
    return fn(t);
  },
  collection: () => ({}),
  addDoc: async () => ({}),
  arrayRemove: () => ({}),
  arrayUnion: () => ({}),
  deleteDoc: async () => ({}),
  getDocs: async () => ({ docs: [] }),
  serverTimestamp: () => ({}),
  setDoc: async () => ({}),
  updateDoc: async () => ({}),
  writeBatch: () => ({})
}));
vi.mock("@/boot/firebase", () => ({ firebaseDb: {}, firebaseAuth: {} }));
vi.mock("@/boot/i18n", () => ({ i18n: { global: { t: k => k } } }));
vi.mock("quasar", () => ({ uid: () => "x", Notify: { create: () => {} } }));
vi.mock("@/utils/util-show-error-message", () => ({ showErrorMessage: () => {} }));

const storeModel = (await import("@/store/store-model.js")).default;
const { actions, state } = storeModel;

describe("disbandNodeGroup", () => {
  it("clears parentId on child groups so they stay listed at the top level", async () => {
    state.currentModel = { id: "model1" };
    currentNodeGroups = [
      { id: "parent", nodeIds: [], parentId: null },
      { id: "child", nodeIds: [], parentId: "parent" },
      { id: "grandchild", nodeIds: [], parentId: "child" }
    ];

    await actions.disbandNodeGroup({}, "parent");

    const groups = written.nodeGroups;
    expect(groups.map(g => g.id)).toEqual(["child", "grandchild"]);
    // The child is no longer attached to the deleted parent, so the
    // node group list (which nests from parentId == null) can still show it.
    const child = groups.find(g => g.id === "child");
    expect(child.parentId ?? null).toBeNull();
    // Its own children keep pointing at it.
    expect(groups.find(g => g.id === "grandchild").parentId).toBe("child");
  });

  it("re-attaches child groups to the disbanded group's parent in a three-level tree", async () => {
    state.currentModel = { id: "model1" };
    currentNodeGroups = [
      { id: "root", nodeIds: [], parentId: null },
      { id: "parent", nodeIds: [], parentId: "root" },
      { id: "child", nodeIds: [], parentId: "parent" }
    ];

    await actions.disbandNodeGroup({}, "parent");

    const groups = written.nodeGroups;
    expect(groups.map(g => g.id)).toEqual(["root", "child"]);
    expect(groups.find(g => g.id === "child").parentId).toBe("root");
  });
});
