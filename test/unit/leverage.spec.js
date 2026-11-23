import { describe, it, expect } from "vitest";
import { signedSqrt } from "@/utils/leverage";

describe("signedSqrt helper (todo242)", () => {
  it("handles null, undefined, NaN, and non-finite numbers safely by returning null", () => {
    expect(signedSqrt(null)).toBeNull();
    expect(signedSqrt(undefined)).toBeNull();
    expect(signedSqrt(NaN)).toBeNull();
    expect(signedSqrt(Infinity)).toBeNull();
    expect(signedSqrt(-Infinity)).toBeNull();
  });

  it("calculates sign-preserving square root for positive and negative numbers", () => {
    expect(signedSqrt(0)).toBe(0);
    expect(signedSqrt(1)).toBe(1);
    expect(signedSqrt(-1)).toBe(-1);
    expect(signedSqrt(4)).toBe(2);
    expect(signedSqrt(-4)).toBe(-2);
    expect(signedSqrt(19.36)).toBeCloseTo(4.4, 6);
    expect(signedSqrt(-0.25)).toBeCloseTo(-0.5, 6);
  });

  it("preserves strict monotonicity across negative, zero, and positive domains", () => {
    const values = [-100, -16, -4, -1, -0.25, 0, 0.25, 1, 4, 16, 100];
    const transformed = values.map(v => signedSqrt(v));
    for (let i = 0; i < transformed.length - 1; i++) {
      expect(transformed[i]).toBeLessThan(transformed[i + 1]);
    }
  });
});
