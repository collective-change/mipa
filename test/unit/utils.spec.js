import { describe, it, expect } from "vitest";
import { reactive } from "vue";
import { toPlain } from "@/utils/util-toPlain";
import { getAcronym } from "@/utils/util-getAcronym";

describe("toPlain", () => {
  it("produces structured-cloneable copies of reactive data", () => {
    const node = { a: 1, nested: { list: [1, 2, { b: 3 }] } };
    Object.defineProperty(node, "id", { value: "n1", enumerable: false });
    const state = reactive({ nodes: [node] });

    const plain = toPlain(state);
    expect(() => structuredClone(plain)).not.toThrow();
    expect(plain.nodes[0]).toEqual({ a: 1, nested: { list: [1, 2, { b: 3 }] }, id: "n1" });
  });

  it("leaves class instances (e.g. Date) intact", () => {
    const d = new Date(0);
    expect(toPlain(reactive({ d })).d).toBe(d);
  });
});

describe("getAcronym", () => {
  it("joins first letters", () => {
    expect(getAcronym("return on investment")).toBe("roi");
  });
});
