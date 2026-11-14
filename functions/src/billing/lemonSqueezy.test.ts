import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as crypto from "crypto";
import {
  resolveTierInfo,
  verifyLemonSqueezySignature,
  LemonSqueezyWebhookPayload
} from "./lemonSqueezy";

test("resolveTierInfo accurately resolves tier, seat limits and billing cycles", () => {
  const proMonthly = resolveTierInfo("Pro Monthly", "Mipa Strategic Suite");
  assert.equal(proMonthly.tier, "pro");
  assert.equal(proMonthly.seatLimit, 50);
  assert.equal(proMonthly.billingCycle, "monthly");

  const growthAnnual = resolveTierInfo("Growth Plan - Annual", "Mipa");
  assert.equal(growthAnnual.tier, "growth");
  assert.equal(growthAnnual.seatLimit, 20);
  assert.equal(growthAnnual.billingCycle, "annual");

  const starterYearly = resolveTierInfo("Starter Yearly", "Mipa");
  assert.equal(starterYearly.tier, "starter");
  assert.equal(starterYearly.seatLimit, 5);
  assert.equal(starterYearly.billingCycle, "annual");

  const enterprise = resolveTierInfo("Enterprise Dedicated", "Mipa Global");
  assert.equal(enterprise.tier, "enterprise");
  assert.equal(enterprise.seatLimit, 150);
  assert.equal(enterprise.billingCycle, "monthly");

  const unknown = resolveTierInfo("Custom NGO Tier", "Mipa");
  assert.equal(unknown.tier, "starter");
  assert.equal(unknown.seatLimit, 5);
});

test("verifyLemonSqueezySignature validates HMAC SHA-256 signatures accurately", () => {
  const secret = "test_signing_secret_987654";
  const body = JSON.stringify({ event: "test", data: { id: "sub_123" } });
  const validSignature = crypto.createHmac("sha256", secret).update(body).digest("hex");

  assert.equal(verifyLemonSqueezySignature(body, validSignature, secret), true);
  assert.equal(verifyLemonSqueezySignature(Buffer.from(body), validSignature, secret), true);

  // Invalid signature
  const invalidSignature = "abcdef0123456789".repeat(4);
  assert.equal(verifyLemonSqueezySignature(body, invalidSignature, secret), false);

  // Missing or corrupted parameters
  assert.equal(verifyLemonSqueezySignature(body, undefined, secret), false);
  assert.equal(verifyLemonSqueezySignature(body, validSignature, ""), false);
  assert.equal(verifyLemonSqueezySignature(body, "too_short", secret), false);
});

test("LemonSqueezyWebhookPayload schema typing conforms to spec", () => {
  const mockPayload: LemonSqueezyWebhookPayload = {
    meta: {
      event_name: "subscription_created",
      custom_data: {
        orgId: "org-test-123",
        userId: "user-456"
      }
    },
    data: {
      id: "sub_9999",
      type: "subscriptions",
      attributes: {
        customer_id: 12345,
        status: "active",
        product_name: "Mipa Strategy",
        variant_name: "Pro Monthly",
        variant_id: "var_888",
        urls: {
          customer_portal: "https://mipa.lemonsqueezy.com/billing/portal/abc",
          update_payment_method: "https://mipa.lemonsqueezy.com/billing/payment/abc"
        },
        renews_at: "2026-12-15T00:00:00Z",
        ends_at: null
      }
    }
  };

  assert.equal(mockPayload.meta.event_name, "subscription_created");
  assert.equal(mockPayload.meta.custom_data?.orgId, "org-test-123");
  assert.equal(mockPayload.data.attributes.status, "active");
});
