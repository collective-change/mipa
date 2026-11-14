import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  TIER_DEFINITIONS,
  formatSeatLimit,
  requestCheckoutUrl,
  requestCustomerPortalUrl
} from "@/utils/billing";

// Mock Firebase functions
vi.mock("@/boot/firebase", () => ({
  firebaseFunctions: {}
}));

const mockCallable = vi.fn(async (params) => {
  if (params.tier === "pro") {
    return { data: { checkoutUrl: "https://mipa.lemonsqueezy.com/checkout/buy/pro-variant" } };
  }
  return { data: { checkoutUrl: "https://mipa.lemonsqueezy.com/checkout/buy/mock-starter", sandbox: true } };
});

const mockPortalCallable = vi.fn(async () => {
  return { data: { portalUrl: "https://mipa.lemonsqueezy.com/billing/portal/xyz" } };
});

vi.mock("firebase/functions", () => ({
  httpsCallable: vi.fn((_functions, name) => {
    if (name === "getCustomerPortalUrl") {
      return mockPortalCallable;
    }
    return mockCallable;
  })
}));

describe("billing.js utility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("TIER_DEFINITIONS", () => {
    it("defines tiers with accurate seat limits and features", () => {
      expect(TIER_DEFINITIONS.community.seatLimit).toBe(1);
      expect(TIER_DEFINITIONS.starter.seatLimit).toBe(5);
      expect(TIER_DEFINITIONS.growth.seatLimit).toBe(20);
      expect(TIER_DEFINITIONS.pro.seatLimit).toBe(50);
      expect(TIER_DEFINITIONS.enterprise.seatLimit).toBe(150);

      expect(TIER_DEFINITIONS.starter.priceMonthly).toBe(29);
      expect(TIER_DEFINITIONS.pro.priceAnnual).toBe(1990);
    });
  });

  describe("formatSeatLimit", () => {
    it("formats singular and plural seat counts", () => {
      expect(formatSeatLimit(1)).toBe("1 seat");
      expect(formatSeatLimit(0)).toBe("1 seat");
      expect(formatSeatLimit(null)).toBe("1 seat");
      expect(formatSeatLimit(5)).toBe("5 seats");
      expect(formatSeatLimit(50)).toBe("50 seats");
    });
  });

  describe("requestCheckoutUrl", () => {
    it("throws error when orgId is omitted", async () => {
      await expect(requestCheckoutUrl({})).rejects.toThrow("orgId is required");
    });

    it("invokes Cloud Function and returns checkout URL", async () => {
      const res = await requestCheckoutUrl({ orgId: "org-1", tier: "pro", billingCycle: "annual" });
      expect(res.checkoutUrl).toContain("pro-variant");
      expect(mockCallable).toHaveBeenCalledWith({
        orgId: "org-1",
        tier: "pro",
        billingCycle: "annual"
      });
    });
  });

  describe("requestCustomerPortalUrl", () => {
    it("throws error when orgId is omitted", async () => {
      await expect(requestCustomerPortalUrl({})).rejects.toThrow("orgId is required");
    });

    it("invokes Cloud Function and returns customer portal URL", async () => {
      const res = await requestCustomerPortalUrl({ orgId: "org-1" });
      expect(res.portalUrl).toContain("mipa.lemonsqueezy.com/billing/portal");
      expect(mockPortalCallable).toHaveBeenCalledWith({ orgId: "org-1" });
    });
  });
});
