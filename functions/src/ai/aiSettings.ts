// An organization's AI provider settings.
//
// Data:
//   orgAiSettings/{orgId}  provider, model, baseUrl, keyLast4, managers[],
//                          updatedBy, updateTime. Members can read it; only
//                          these functions write it.
//   orgSecrets/{orgId}     sealedKey. No browser can read or write it.
//
// Who may change the settings: the organization's admins (superAdmins) and
// any members an admin names as AI settings managers.

import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { aiKeyEncryptionKey, seal, open } from "./keyBox";
import { adapterFor, ProviderId, ProviderReplyError, ProviderSettings } from "./providers";

const PROVIDERS: ProviderId[] = ["anthropic", "openai-compatible"];

function requireAuth(request: CallableRequest) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Please sign in.");
  return request.auth;
}

function requireString(value: unknown, name: string, max = 500): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > max) {
    throw new HttpsError("invalid-argument", `${name} is required.`);
  }
  return value.trim();
}

async function loadOrg(orgId: string) {
  const org = await getFirestore().doc(`orgs/${orgId}`).get();
  if (!org.exists) throw new HttpsError("not-found", "Organization not found.");
  return org.data() as { users?: string[]; superAdmins?: string[] };
}

export async function canManageAi(orgId: string, uid: string): Promise<boolean> {
  const org = await loadOrg(orgId);
  if ((org.superAdmins || []).includes(uid)) return true;
  const settings = await getFirestore().doc(`orgAiSettings/${orgId}`).get();
  const managers: string[] = settings.get("managers") || [];
  return managers.includes(uid) && (org.users || []).includes(uid);
}

// The organization's provider settings and decrypted key, for server use.
export async function loadProvider(
  orgId: string
): Promise<{ settings: ProviderSettings; apiKey: string } | null> {
  const db = getFirestore();
  const [settings, secret] = await Promise.all([
    db.doc(`orgAiSettings/${orgId}`).get(),
    db.doc(`orgSecrets/${orgId}`).get()
  ]);
  if (!settings.exists || !secret.exists || !settings.get("provider")) return null;
  return {
    settings: {
      provider: settings.get("provider"),
      model: settings.get("model"),
      baseUrl: settings.get("baseUrl") || undefined
    },
    apiKey: open(secret.get("sealedKey"), aiKeyEncryptionKey.value())
  };
}

function providerMessage(error: unknown): HttpsError {
  if (error instanceof ProviderReplyError) {
    return new HttpsError("failed-precondition", error.message, { reason: error.reason });
  }
  return new HttpsError("internal", "Couldn't check the connection.");
}

/** Connect or change the organization's AI provider. Tests it first. */
export const setAiSettings = onCall({ secrets: [aiKeyEncryptionKey] }, async (request) => {
  const auth = requireAuth(request);
  const orgId = requireString(request.data?.orgId, "orgId");
  if (!(await canManageAi(orgId, auth.uid))) {
    throw new HttpsError("permission-denied", "Only admins and AI settings managers can do this.");
  }
  const provider = request.data?.provider as ProviderId;
  if (!PROVIDERS.includes(provider)) throw new HttpsError("invalid-argument", "Unknown provider.");
  const model = requireString(request.data?.model, "model", 200);
  const baseUrl =
    provider == "openai-compatible" ? requireString(request.data?.baseUrl, "baseUrl", 500) : "";
  if (baseUrl && !/^https:\/\/[^\s]+$/.test(baseUrl)) {
    throw new HttpsError("invalid-argument", "The endpoint must be an https:// address.");
  }

  const db = getFirestore();
  // A new key replaces the stored one; without one, keep the stored key.
  let apiKey: string | undefined =
    typeof request.data?.apiKey == "string" && request.data.apiKey.trim()
      ? request.data.apiKey.trim()
      : undefined;
  if (!apiKey) {
    const existing = await loadProvider(orgId);
    if (!existing) throw new HttpsError("invalid-argument", "An API key is required.");
    apiKey = existing.apiKey;
  }
  if (apiKey.length > 1000) throw new HttpsError("invalid-argument", "That API key is too long.");

  try {
    await adapterFor({ provider, model, baseUrl }, apiKey).test();
  } catch (error) {
    throw providerMessage(error);
  }

  const batch = db.batch();
  batch.set(db.doc(`orgSecrets/${orgId}`), {
    sealedKey: seal(apiKey, aiKeyEncryptionKey.value())
  });
  batch.set(
    db.doc(`orgAiSettings/${orgId}`),
    {
      provider,
      model,
      baseUrl,
      keyLast4: apiKey.slice(-4),
      updatedBy: auth.uid,
      updateTime: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
  await batch.commit();
  return { ok: true };
});

/** Turn AI off for the organization: forget the provider and key. */
export const disconnectAi = onCall(async (request) => {
  const auth = requireAuth(request);
  const orgId = requireString(request.data?.orgId, "orgId");
  if (!(await canManageAi(orgId, auth.uid))) {
    throw new HttpsError("permission-denied", "Only admins and AI settings managers can do this.");
  }
  const db = getFirestore();
  const batch = db.batch();
  batch.delete(db.doc(`orgSecrets/${orgId}`));
  // Keep the list of managers; clear the provider.
  batch.set(
    db.doc(`orgAiSettings/${orgId}`),
    {
      provider: FieldValue.delete(),
      model: FieldValue.delete(),
      baseUrl: FieldValue.delete(),
      keyLast4: FieldValue.delete(),
      updatedBy: auth.uid,
      updateTime: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
  await batch.commit();
  return { ok: true };
});

/** Admins choose which members may also change the AI settings. */
export const setAiManagers = onCall(async (request) => {
  const auth = requireAuth(request);
  const orgId = requireString(request.data?.orgId, "orgId");
  const org = await loadOrg(orgId);
  if (!(org.superAdmins || []).includes(auth.uid)) {
    throw new HttpsError("permission-denied", "Only admins can do this.");
  }
  const managers = request.data?.managers;
  if (!Array.isArray(managers) || managers.some((m) => typeof m != "string")) {
    throw new HttpsError("invalid-argument", "managers must be a list of members.");
  }
  const members = new Set(org.users || []);
  const valid = [...new Set(managers as string[])].filter((m) => members.has(m));
  await getFirestore().doc(`orgAiSettings/${orgId}`).set(
    { managers: valid, updatedBy: auth.uid, updateTime: FieldValue.serverTimestamp() },
    { merge: true }
  );
  return { managers: valid };
});
