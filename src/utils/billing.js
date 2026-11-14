import { httpsCallable } from "firebase/functions";
import { firebaseFunctions } from "@/boot/firebase";

export const TIER_DEFINITIONS = {
  community: {
    key: "community",
    name: "Community",
    seatLimit: 1,
    priceMonthly: 0,
    priceAnnual: 0,
    features: ["1 active model builder", "Unlimited public view-only links", "Full Math.js simulation engine", "Client-side private calculations"]
  },
  starter: {
    key: "starter",
    name: "Starter",
    seatLimit: 5,
    priceMonthly: 29,
    priceAnnual: 290,
    features: ["5 collaborating members", "Unlimited models & actions", "BYO AI key integration", "Monte Carlo risk bounds"]
  },
  growth: {
    key: "growth",
    name: "Growth",
    seatLimit: 20,
    priceMonthly: 79,
    priceAnnual: 790,
    features: ["20 collaborating members", "Multi-model portfolio optimizer", "Immutable governance snapshots", "Priority email support"]
  },
  pro: {
    key: "pro",
    name: "Pro",
    seatLimit: 50,
    priceMonthly: 199,
    priceAnnual: 1990,
    features: ["50 collaborating members", "White-label decision briefs", "Cross-lingual team translation", "Dedicated account onboarding"]
  },
  enterprise: {
    key: "enterprise",
    name: "Enterprise",
    seatLimit: 150,
    priceMonthly: 499,
    priceAnnual: 4990,
    features: ["150 collaborating members", "Custom system dynamics archetypes", "Form W-8BEN tax-exempt invoicing", "Custom SLA & audit logging"]
  }
};

/**
 * Request an authenticated Lemon Squeezy checkout URL for upgrading an organization.
 *
 * @param {{ orgId: string, tier: string, billingCycle?: "monthly" | "annual" }} params
 * @returns {Promise<{ checkoutUrl: string, sandbox?: boolean }>}
 */
export async function requestCheckoutUrl({ orgId, tier = "starter", billingCycle = "monthly" }) {
  if (!orgId) throw new Error("orgId is required");
  const fn = httpsCallable(firebaseFunctions, "getCheckoutUrl");
  const result = await fn({ orgId, tier, billingCycle });
  return result.data;
}

/**
 * Request an authenticated Lemon Squeezy Customer Portal URL for card updates or cancellation.
 *
 * @param {{ orgId: string }} params
 * @returns {Promise<{ portalUrl: string }>}
 */
export async function requestCustomerPortalUrl({ orgId }) {
  if (!orgId) throw new Error("orgId is required");
  const fn = httpsCallable(firebaseFunctions, "getCustomerPortalUrl");
  const result = await fn({ orgId });
  return result.data;
}

/**
 * Formats a seat limit string for display.
 *
 * @param {number} seatLimit
 * @returns {string}
 */
export function formatSeatLimit(seatLimit) {
  if (!seatLimit || seatLimit <= 1) return "1 seat";
  return `${seatLimit} seats`;
}
