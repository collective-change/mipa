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

const { useModelStore } = await import("@/store/store-model.js");
const { createPinia } = await import("pinia");
const store = useModelStore(createPinia());

describe("disbandNodeGroup", () => {
  it("clears parentId on child groups so they stay listed at the top level", async () => {
    store.currentModel = { id: "model1" };
    currentNodeGroups = [
      { id: "parent", nodeIds: [] },
      { id: "child", nodeIds: [], parentId: "parent" },
      { id: "grandchild", nodeIds: [], parentId: "child" }
    ];

    await store.disbandNodeGroup("parent");

    const groups = written.nodeGroups;
    expect(groups.map(g => g.id)).toEqual(["child", "grandchild"]);
    // The child is no longer attached to the deleted parent, so the
    // node group list (which nests from parentId == undefined / key absent) can still show it.
    const child = groups.find(g => g.id === "child");
    // Top-level groups omit parentId entirely (key absent). Strictly assert the representation.
    expect(child).not.toHaveProperty("parentId");
    expect("parentId" in child).toBe(false);
    // Its own children keep pointing at it.
    expect(groups.find(g => g.id === "grandchild").parentId).toBe("child");
  });

  it("re-attaches child groups to the disbanded group's parent in a three-level tree", async () => {
    store.currentModel = { id: "model1" };
    currentNodeGroups = [
      { id: "root", nodeIds: [] },
      { id: "parent", nodeIds: [], parentId: "root" },
      { id: "child", nodeIds: [], parentId: "parent" }
    ];

    await store.disbandNodeGroup("parent");

    const groups = written.nodeGroups;
    expect(groups.map(g => g.id)).toEqual(["root", "child"]);
    expect(groups.find(g => g.id === "child").parentId).toBe("root");
  });

  it("MIPA-31: uses one consistent word across menu item, confirm dialog and both toasts in all 5 locales", async () => {
    const enUs = (await import("@/i18n/en-us/index.js")).default;
    const es = (await import("@/i18n/es/index.js")).default;
    const ja = (await import("@/i18n/ja/index.js")).default;
    const zhCn = (await import("@/i18n/zh-cn/index.js")).default;
    const zhTw = (await import("@/i18n/zh-tw/index.js")).default;

    // English: 'disband'
    expect(enUs.Ungroup.toLowerCase()).toContain("disband");
    expect(enUs.confirmDisbandGroup.toLowerCase()).toContain("disband");
    expect(enUs.toastUngrouped.toLowerCase()).toContain("disband");
    expect(enUs.toastUngroupFailed.toLowerCase()).toContain("disband");

    // Traditional Chinese: '解散'
    expect(zhTw.Ungroup).toContain("解散");
    expect(zhTw.confirmDisbandGroup).toContain("解散");
    expect(zhTw.toastUngrouped).toContain("解散");
    expect(zhTw.toastUngroupFailed).toContain("解散");

    // Simplified Chinese: '解散'
    expect(zhCn.Ungroup).toContain("解散");
    expect(zhCn.confirmDisbandGroup).toContain("解散");
    expect(zhCn.toastUngrouped).toContain("解散");
    expect(zhCn.toastUngroupFailed).toContain("解散");

    // Spanish: 'disolver'
    expect(es.Ungroup.toLowerCase()).toContain("disolver");
    expect(es.confirmDisbandGroup.toLowerCase()).toContain("disolver");
    expect(es.toastUngrouped.toLowerCase()).toContain("disuelt");
    expect(es.toastUngroupFailed.toLowerCase()).toContain("disolver");

    // Japanese: '解散'
    expect(ja.Ungroup).toContain("解散");
    expect(ja.confirmDisbandGroup).toContain("解散");
    expect(ja.toastUngrouped).toContain("解散");
    expect(ja.toastUngroupFailed).toContain("解散");
  });
});
