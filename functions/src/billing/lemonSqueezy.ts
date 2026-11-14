import * as crypto from "crypto";
import { onRequest, Request, Response } from "firebase-functions/v2/https";
import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

export interface LemonSqueezyWebhookMeta {
  event_name: string;
  custom_data?: {
    orgId?: string;
    userId?: string;
    [key: string]: unknown;
  };
}

export interface LemonSqueezySubscriptionAttributes {
  customer_id: number | string;
  status: "active" | "past_due" | "unpaid" | "cancelled" | "expired" | "paused" | string;
  product_name?: string;
  variant_name?: string;
  variant_id?: number | string;
  urls?: {
    customer_portal?: string;
    update_payment_method?: string;
  };
  renews_at?: string | null;
  ends_at?: string | null;
  first_subscription_item?: {
    meta?: {
      custom_data?: {
        orgId?: string;
      };
    };
  };
}

export interface LemonSqueezyWebhookPayload {
  meta: LemonSqueezyWebhookMeta;
  data: {
    id: string | number;
    type: string;
    attributes: LemonSqueezySubscriptionAttributes;
  };
}

export type SubscriptionTier = "community" | "starter" | "growth" | "pro" | "enterprise";

export interface TierInfo {
  tier: SubscriptionTier;
  seatLimit: number;
  billingCycle: "monthly" | "annual";
}

/**
 * Resolves subscription tier and seat limit from Lemon Squeezy product/variant names.
 */
export function resolveTierInfo(variantName = "", productName = ""): TierInfo {
  const combined = `${productName} ${variantName}`.toLowerCase();

  const billingCycle: "monthly" | "annual" = combined.includes("annual") || combined.includes("yearly")
    ? "annual"
    : "monthly";

  if (combined.includes("enterprise")) {
    return { tier: "enterprise", seatLimit: 150, billingCycle };
  }
  if (combined.includes("pro")) {
    return { tier: "pro", seatLimit: 50, billingCycle };
  }
  if (combined.includes("growth")) {
    return { tier: "growth", seatLimit: 20, billingCycle };
  }
  if (combined.includes("starter")) {
    return { tier: "starter", seatLimit: 5, billingCycle };
  }

  // Default to starter tier if subscribed to unknown paid plan
  return { tier: "starter", seatLimit: 5, billingCycle };
}

/**
 * Verify cryptographic HMAC-SHA256 signature from Lemon Squeezy webhook header.
 */
export function verifyLemonSqueezySignature(rawBody: string | Buffer, signatureHeader: string | undefined, secret: string): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }
  try {
    const hmac = crypto.createHmac("sha256", secret);
    const digest = hmac.update(rawBody).digest("hex");
    const signatureBuffer = Buffer.from(signatureHeader, "hex");
    const digestBuffer = Buffer.from(digest, "hex");
    if (signatureBuffer.length !== digestBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(signatureBuffer, digestBuffer);
  } catch (err) {
    console.error("Signature verification error:", err);
    return false;
  }
}

/**
 * Process a validated Lemon Squeezy webhook payload and update Firestore.
 */
export async function processWebhookPayload(payload: LemonSqueezyWebhookPayload, eventId?: string): Promise<{ success: boolean; action: string; orgId?: string }> {
  const eventName = payload.meta?.event_name;
  const customData = payload.meta?.custom_data;
  const attributes = payload.data?.attributes;
  const orgId = customData?.orgId || attributes?.first_subscription_item?.meta?.custom_data?.orgId;

  if (!orgId) {
    console.warn("Lemon Squeezy event received without orgId:", eventName, payload.data?.id);
    return { success: false, action: "missing_org_id" };
  }

  const db = getFirestore();
  const orgRef = db.doc(`orgs/${orgId}`);

  // Idempotency check if eventId is provided
  if (eventId) {
    const eventRef = db.doc(`billingEvents/${eventId}`);
    const eventDoc = await eventRef.get();
    if (eventDoc.exists) {
      return { success: true, action: "duplicate_skipped", orgId };
    }
  }

  const status = attributes.status;
  const tierInfo = resolveTierInfo(attributes.variant_name || "", attributes.product_name || "");

  if (eventName === "subscription_created" || eventName === "subscription_updated") {
    await orgRef.set(
      {
        subscriptionTier: tierInfo.tier,
        seatLimit: tierInfo.seatLimit,
        billingCycle: tierInfo.billingCycle,
        subscriptionStatus: status,
        lemonSqueezySubscriptionId: String(payload.data.id),
        lemonSqueezyCustomerId: String(attributes.customer_id),
        customerPortalUrl: attributes.urls?.customer_portal || null,
        updatePaymentMethodUrl: attributes.urls?.update_payment_method || null,
        subscriptionRenewsAt: attributes.renews_at || null,
        subscriptionEndsAt: attributes.ends_at || null,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    if (eventId) {
      await db.doc(`billingEvents/${eventId}`).set({
        processedAt: FieldValue.serverTimestamp(),
        eventName,
        orgId
      });
    }

    return { success: true, action: "subscription_synced", orgId };
  }

  if (eventName === "subscription_cancelled" || eventName === "subscription_expired") {
    const isExpired = status === "expired" || eventName === "subscription_expired";
    await orgRef.set(
      {
        subscriptionStatus: status,
        subscriptionEndsAt: attributes.ends_at || null,
        ...(isExpired
          ? {
              subscriptionTier: "community",
              seatLimit: 1
            }
          : {}),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    if (eventId) {
      await db.doc(`billingEvents/${eventId}`).set({
        processedAt: FieldValue.serverTimestamp(),
        eventName,
        orgId
      });
    }

    return { success: true, action: isExpired ? "downgraded_to_community" : "cancellation_recorded", orgId };
  }

  if (eventName === "subscription_payment_failed") {
    await orgRef.set(
      {
        subscriptionStatus: "past_due",
        updatePaymentMethodUrl: attributes.urls?.update_payment_method || null,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    return { success: true, action: "payment_failed_marked", orgId };
  }

  return { success: true, action: "unhandled_event_ignored", orgId };
}

/**
 * HTTP Webhook endpoint for Lemon Squeezy Merchant of Record notifications.
 */
export const lemonSqueezyWebhook = onRequest(async (req: Request, res: Response) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const webhookSecret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET || "";
  const signature = req.headers["x-signature"] as string | undefined;

  // In production outside emulator, require secret and signature
  const isEmulator = Boolean(process.env.FUNCTIONS_EMULATOR);
  if (!isEmulator) {
    if (!webhookSecret || !signature) {
      res.status(401).send("Unauthorized: Missing webhook secret or signature");
      return;
    }

    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody || Buffer.from(JSON.stringify(req.body));
    const isValid = verifyLemonSqueezySignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      res.status(401).send("Unauthorized: Invalid signature");
      return;
    }
  }

  try {
    const payload = req.body as LemonSqueezyWebhookPayload;
    const eventId = req.headers["x-event-id"] as string | undefined;
    const result = await processWebhookPayload(payload, eventId);
    res.status(200).json(result);
  } catch (err: unknown) {
    console.error("Failed to process Lemon Squeezy webhook:", err);
    res.status(500).send("Internal Server Error");
  }
});

/**
 * Callable Function: Generate checkout URL for organization tier upgrade.
 */
export const getCheckoutUrl = onCall(async (request: CallableRequest) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Please sign in to manage billing.");
  }

  const orgId = request.data?.orgId;
  const tier = (request.data?.tier || "starter") as SubscriptionTier;
  const billingCycle = (request.data?.billingCycle || "monthly") as "monthly" | "annual";

  if (!orgId || typeof orgId !== "string") {
    throw new HttpsError("invalid-argument", "orgId is required.");
  }

  const db = getFirestore();
  const orgDoc = await db.doc(`orgs/${orgId}`).get();
  if (!orgDoc.exists) {
    throw new HttpsError("not-found", "Organization not found.");
  }

  const superAdmins = (orgDoc.get("superAdmins") as string[]) || [];
  if (!superAdmins.includes(request.auth.uid)) {
    throw new HttpsError("permission-denied", "Only organization administrators can initiate billing checkouts.");
  }

  const apiKey = process.env.LEMON_SQUEEZY_API_KEY;
  const storeId = process.env.LEMON_SQUEEZY_STORE_ID;
  const variantId = request.data?.variantId || process.env[`LEMON_SQUEEZY_VARIANT_${tier.toUpperCase()}_${billingCycle.toUpperCase()}`];

  // If live Lemon Squeezy API credentials are configured, call Lemon Squeezy API
  if (apiKey && storeId && variantId) {
    try {
      const response = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Accept": "application/vnd.api+json",
          "Content-Type": "application/vnd.api+json"
        },
        body: JSON.stringify({
          data: {
            type: "checkouts",
            attributes: {
              checkout_data: {
                custom: {
                  orgId,
                  userId: request.auth.uid
                },
                email: request.auth.token.email || undefined,
                name: request.auth.token.name || undefined
              }
            },
            relationships: {
              store: {
                data: { type: "stores", id: String(storeId) }
              },
              variant: {
                data: { type: "variants", id: String(variantId) }
              }
            }
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Lemon Squeezy API error: ${response.status} ${errorText}`);
      }

      const resJson = await response.json();
      return {
        checkoutUrl: resJson.data?.attributes?.url
      };
    } catch (err: unknown) {
      console.error("Error creating Lemon Squeezy checkout:", err);
      throw new HttpsError("internal", "Failed to create checkout session with Merchant of Record.");
    }
  }

  // Graceful fallback for test/sandbox/emulator environments
  const mockCheckoutUrl = `https://mipa.lemonsqueezy.com/checkout/buy/mock-${tier}-${billingCycle}?checkout[custom][orgId]=${encodeURIComponent(orgId)}`;
  return { checkoutUrl: mockCheckoutUrl, sandbox: true };
});

/**
 * Callable Function: Retrieve Customer Portal link for managing cards and subscriptions.
 */
export const getCustomerPortalUrl = onCall(async (request: CallableRequest) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Please sign in.");
  }

  const orgId = request.data?.orgId;
  if (!orgId || typeof orgId !== "string") {
    throw new HttpsError("invalid-argument", "orgId is required.");
  }

  const db = getFirestore();
  const orgDoc = await db.doc(`orgs/${orgId}`).get();
  if (!orgDoc.exists) {
    throw new HttpsError("not-found", "Organization not found.");
  }

  const superAdmins = (orgDoc.get("superAdmins") as string[]) || [];
  if (!superAdmins.includes(request.auth.uid)) {
    throw new HttpsError("permission-denied", "Only organization administrators can access the customer portal.");
  }

  const customerPortalUrl = orgDoc.get("customerPortalUrl") as string | undefined;
  if (!customerPortalUrl) {
    throw new HttpsError("not-found", "No active Merchant of Record subscription or billing portal found for this organization.");
  }

  return { portalUrl: customerPortalUrl };
});
