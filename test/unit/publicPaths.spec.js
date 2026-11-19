import { describe, it, expect } from "vitest";
import { PUBLIC_PATHS, isPublicPath } from "@/router/public-paths";

describe("public-paths.js", () => {
  it("includes standard public routes", () => {
    expect(PUBLIC_PATHS).toContain("/");
    expect(PUBLIC_PATHS).toContain("/auth");
    expect(PUBLIC_PATHS).toContain("/privacy");
    expect(PUBLIC_PATHS).toContain("/terms");
    expect(PUBLIC_PATHS).toContain("/about");
    expect(PUBLIC_PATHS).toContain("/coverage");
  });

  it("identifies static and dynamic public routes via isPublicPath", () => {
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/auth")).toBe(true);
    expect(isPublicPath("/privacy")).toBe(true);
    expect(isPublicPath("/terms")).toBe(true);
    expect(isPublicPath("/coverage")).toBe(true);
    expect(isPublicPath("/m/relief-surge-model")).toBe(true);
    expect(isPublicPath("/m/test-model-123")).toBe(true);
    expect(isPublicPath("/records/mipa-mission-coverage-v1")).toBe(true);

    expect(isPublicPath("/orgs")).toBe(false);
    expect(isPublicPath("/org/clean-ocean/model/org1/mod2")).toBe(false);
    expect(isPublicPath("/settings")).toBe(false);
    expect(isPublicPath("")).toBe(false);
    expect(isPublicPath(null)).toBe(false);
  });
});
