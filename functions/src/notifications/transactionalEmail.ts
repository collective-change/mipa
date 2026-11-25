/**
 * Transactional Email Service, Domain Auth Verification, Rate Limiting & Flows (MIPA-44)
 *
 * Provides a provider-agnostic transactional email dispatcher supporting Resend,
 * SendGrid, custom HTTPS webhook transports, and an in-memory/Firestore emulator
 * outbox so tests and local emulators never need a live email provider.
 *
 * Integrates with MIPA-36 alerting (`dispatchProductionAlert`) so delivery
 * failures and rate-limit bursts are surfaced visibly.
 */

import { promises as dnsPromises } from "node:dns";
import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getAuth } from "firebase-admin/auth";
import { Firestore, getFirestore, FieldValue } from "firebase-admin/firestore";
import { aiKeyEncryptionKey, open } from "../ai/keyBox";
import { dispatchProductionAlert } from "../monitoring/alerting";

export type EmailProvider = "resend" | "sendgrid" | "webhook" | "emulator" | "unconfigured";
export type EmailCategory = "invitation" | "password_reset" | "weekly_digest" | "transactional";

export const DEFAULT_SENDING_DOMAIN = "collective-change.org";
export const DEFAULT_FROM_ADDRESS = "notifications@collective-change.org";
export const DEFAULT_FROM_NAME = "Longecho";
export const DEFAULT_BASE_URL = "https://collective-change.org";

export const EMAIL_RATE_LIMITS = {
  PER_RECIPIENT_MAX: 5,
  PER_RECIPIENT_RESET_MAX: 3,
  PER_ACTOR_MAX: 30,
  WINDOW_MS: 15 * 60 * 1000,
  COOLDOWN_MS: 30 * 1000
} as const;

export interface RequiredDnsRecordSpec {
  purpose: "SPF" | "DKIM_RESEND" | "DKIM_SENDGRID_1" | "DKIM_SENDGRID_2" | "RETURN_PATH_MX" | "RETURN_PATH_SPF" | "DMARC";
  type: "TXT" | "CNAME" | "MX";
  host: string;
  value: string;
  priority?: number;
  notes: string;
}

export const REQUIRED_DNS_RECORDS: readonly RequiredDnsRecordSpec[] = [
  {
    purpose: "SPF",
    type: "TXT",
    host: "@",
    value: "v=spf1 include:_spf.firebasemail.com include:amazonses.com include:sendgrid.net ~all",
    notes: "Authorizes Firebase Auth, Resend (Amazon SES), and SendGrid to send for collective-change.org."
  },
  {
    purpose: "DKIM_RESEND",
    type: "TXT",
    host: "resend._domainkey",
    value: "p=<RESEND_GENERATED_PUBLIC_KEY>",
    notes: "Primary DKIM signing key copied from Resend Dashboard -> Domains -> collective-change.org."
  },
  {
    purpose: "DKIM_SENDGRID_1",
    type: "CNAME",
    host: "s1._domainkey",
    value: "s1.domainkey.u<ID>.wl.sendgrid.net",
    notes: "Optional SendGrid fallback DKIM selector 1 if using SendGrid instead of Resend."
  },
  {
    purpose: "DKIM_SENDGRID_2",
    type: "CNAME",
    host: "s2._domainkey",
    value: "s2.domainkey.u<ID>.wl.sendgrid.net",
    notes: "Optional SendGrid fallback DKIM selector 2 if using SendGrid instead of Resend."
  },
  {
    purpose: "RETURN_PATH_MX",
    type: "MX",
    host: "send",
    value: "feedback-smtp.us-east-1.amazonses.com",
    priority: 10,
    notes: "Resend bounce/return-path MX record for send.collective-change.org."
  },
  {
    purpose: "RETURN_PATH_SPF",
    type: "TXT",
    host: "send",
    value: "v=spf1 include:amazonses.com ~all",
    notes: "SPF alignment for custom Return-Path subdomain send.collective-change.org."
  },
  {
    purpose: "DMARC",
    type: "TXT",
    host: "_dmarc",
    value: "v=DMARC1; p=quarantine; rua=mailto:dmarc@collective-change.org; pct=100; adkim=s; aspf=s",
    notes: "Strict DKIM and SPF alignment with quarantine policy and aggregate reporting."
  }
];

export interface DnsResolver {
  resolveTxt: (hostname: string) => Promise<string[][]>;
  resolveCname?: (hostname: string) => Promise<string[]>;
}

export interface DomainEmailAuthStatus {
  domain: string;
  verified: boolean;
  observedAt: string;
  spf: { valid: boolean; records: string[] };
  dkim: { valid: boolean; selectorsFound: string[]; records: string[] };
  dmarc: { valid: boolean; records: string[] };
  requiredRecords: readonly RequiredDnsRecordSpec[];
  error?: string;
}

export interface TransactionalEmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  category?: EmailCategory;
  fromAddress?: string;
  fromName?: string;
  replyTo?: string;
  actorId?: string;
  orgId?: string;
  metadata?: Record<string, unknown>;
}

export interface OutboxEntry extends TransactionalEmailMessage {
  messageId: string;
  sentAt: string;
}

export interface SendEmailResult {
  sent: boolean;
  provider: EmailProvider;
  messageId?: string;
  error?: string;
  rateLimited?: boolean;
  retryAfterSeconds?: number;
}

export interface TransportPayload {
  provider: Exclude<EmailProvider, "emulator" | "unconfigured">;
  from: string;
  fromAddress: string;
  fromName: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export interface SendEmailOptions {
  provider?: Exclude<EmailProvider, "emulator" | "unconfigured">;
  apiKey?: string;
  webhookUrl?: string;
  useEmulatorMock?: boolean;
  requireLiveProvider?: boolean;
  skipRateLimit?: boolean;
  skipFirestoreLog?: boolean;
  maxPerRecipient?: number;
  maxPerActor?: number;
  windowMs?: number;
  cooldownMs?: number;
  nowMs?: number;
  transport?: (payload: TransportPayload) => Promise<{ messageId?: string }>;
  fetchImpl?: typeof fetch;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  reason?: string;
  retryAfterSeconds?: number;
  recipientCount: number;
  actorCount: number;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const memoryRateLimitBuckets = new Map<string, number[]>();
const emulatorOutbox: OutboxEntry[] = [];

export function getEmulatorOutbox(): OutboxEntry[] {
  return [...emulatorOutbox];
}

export function clearEmulatorOutbox(): void {
  emulatorOutbox.length = 0;
}

export function resetEmailRateLimits(): void {
  memoryRateLimitBuckets.clear();
}

export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(normalizeEmail(email));
}

/**
 * Verifies SPF, DKIM, and DMARC TXT/CNAME records for the sending domain.
 * Never throws on DNS lookup errors; returns the exact observed status.
 */
export async function verifyDomainEmailAuth(
  domain = DEFAULT_SENDING_DOMAIN,
  customResolver?: DnsResolver
): Promise<DomainEmailAuthStatus> {
  const resolver: DnsResolver = customResolver || {
    resolveTxt: (host) => dnsPromises.resolveTxt(host),
    resolveCname: (host) => dnsPromises.resolveCname(host)
  };
  const observedAt = new Date().toISOString();
  const spfRecords: string[] = [];
  const dkimRecords: string[] = [];
  const selectorsFound: string[] = [];
  const dmarcRecords: string[] = [];
  const errors: string[] = [];

  const readTxt = async (host: string): Promise<string[]> => {
    try {
      const entries = await resolver.resolveTxt(host);
      return entries.map((chunks) => chunks.join(""));
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code !== "ENODATA" && code !== "ENOTFOUND") {
        errors.push(`${host}: ${err instanceof Error ? err.message : String(err)}`);
      }
      return [];
    }
  };

  const rootTxt = await readTxt(domain);
  for (const record of rootTxt) {
    if (record.toLowerCase().includes("v=spf1")) {
      spfRecords.push(record);
    }
  }

  const dmarcTxt = await readTxt(`_dmarc.${domain}`);
  for (const record of dmarcTxt) {
    if (record.toLowerCase().includes("v=dmarc1")) {
      dmarcRecords.push(record);
    }
  }

  const dkimSelectors = ["resend._domainkey", "s1._domainkey", "s2._domainkey", "firebase1._domainkey", "firebase2._domainkey"];
  for (const selector of dkimSelectors) {
    const fqdn = `${selector}.${domain}`;
    const txt = await readTxt(fqdn);
    const keyTxt = txt.filter((r) => r.includes("p=") || r.toLowerCase().includes("v=dkim1"));
    if (keyTxt.length > 0) {
      selectorsFound.push(selector);
      dkimRecords.push(...keyTxt);
      continue;
    }
    if (typeof resolver.resolveCname === "function") {
      try {
        const cnames = await resolver.resolveCname(fqdn);
        if (cnames.length > 0) {
          selectorsFound.push(selector);
          dkimRecords.push(...cnames.map((c) => `CNAME ${c}`));
        }
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code !== "ENODATA" && code !== "ENOTFOUND") {
          errors.push(`${fqdn}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  const spfValid = spfRecords.length > 0;
  const dkimValid = selectorsFound.length > 0;
  const dmarcValid = dmarcRecords.length > 0;

  return {
    domain,
    verified: spfValid && dkimValid && dmarcValid,
    observedAt,
    spf: { valid: spfValid, records: spfRecords },
    dkim: { valid: dkimValid, selectorsFound, records: dkimRecords },
    dmarc: { valid: dmarcValid, records: dmarcRecords },
    requiredRecords: REQUIRED_DNS_RECORDS,
    ...(errors.length > 0 ? { error: errors.join("; ") } : {})
  };
}

async function readPersistedRateBucket(db: Firestore | null | undefined, bucketKey: string): Promise<number[] | null> {
  if (!db || typeof db.collection !== "function") return null;
  try {
    const col = db.collection("mailRateLimits");
    if (!col || typeof col.doc !== "function") return null;
    const snap = await col.doc(bucketKey).get();
    if (!snap.exists) return [];
    const data = typeof snap.data === "function" ? snap.data() : undefined;
    const raw = data?.timestamps;
    return Array.isArray(raw) ? raw.filter((n): n is number => typeof n === "number") : [];
  } catch {
    return null;
  }
}

async function writePersistedRateBucket(
  db: Firestore | null | undefined,
  bucketKey: string,
  timestamps: number[]
): Promise<void> {
  if (!db || typeof db.collection !== "function") return;
  try {
    const col = db.collection("mailRateLimits");
    if (!col || typeof col.doc !== "function") return;
    await col.doc(bucketKey).set(
      {
        timestamps,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  } catch {
    // Non-fatal in test mocks or transient Firestore errors; memory bucket still protects this instance
  }
}

async function recordMailLog(
  db: Firestore | null | undefined,
  entry: Record<string, unknown>,
  skipFirestoreLog?: boolean
): Promise<void> {
  if (skipFirestoreLog || !db || typeof db.collection !== "function") return;
  try {
    const col = db.collection("mailLogs");
    if (col && typeof col.add === "function") {
      await col.add({
        ...entry,
        createdAt: FieldValue.serverTimestamp(),
        isoTime: new Date().toISOString()
      });
    }
  } catch (err) {
    logger.warn("[TransactionalEmail] Failed to write mailLogs entry:", err);
  }
}

async function recordOutboxDoc(
  db: Firestore | null | undefined,
  entry: OutboxEntry,
  skipFirestoreLog?: boolean
): Promise<void> {
  if (skipFirestoreLog || !db || typeof db.collection !== "function") return;
  try {
    const col = db.collection("mailOutbox");
    if (col && typeof col.add === "function") {
      await col.add({
        ...entry,
        createdAt: FieldValue.serverTimestamp()
      });
    }
  } catch {
    // Optional emulator persistence
  }
}

function safeDocKey(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Enforces sliding-window rate limits per recipient and per actor/organization,
 * plus an optional minimum cooldown between identical recipient+category sends.
 */
export async function checkAndRecordEmailRateLimit(
  db: Firestore | null | undefined,
  params: {
    recipientEmail: string;
    category: EmailCategory;
    actorId?: string;
    maxPerRecipient?: number;
    maxPerActor?: number;
    windowMs?: number;
    cooldownMs?: number;
    nowMs?: number;
  }
): Promise<RateLimitCheckResult> {
  const now = params.nowMs ?? Date.now();
  const windowMs = params.windowMs ?? EMAIL_RATE_LIMITS.WINDOW_MS;
  const maxPerRecipient =
    params.maxPerRecipient ??
    (params.category === "password_reset"
      ? EMAIL_RATE_LIMITS.PER_RECIPIENT_RESET_MAX
      : EMAIL_RATE_LIMITS.PER_RECIPIENT_MAX);
  const maxPerActor = params.maxPerActor ?? EMAIL_RATE_LIMITS.PER_ACTOR_MAX;
  const cooldownMs = params.cooldownMs ?? 0;

  const cleanRecipient = normalizeEmail(params.recipientEmail);
  const recipientKey = safeDocKey(`rcpt_${params.category}_${cleanRecipient}`);
  const cutoff = now - windowMs;

  const persistedRecipient = await readPersistedRateBucket(db, recipientKey);
  const baseRecipientTimestamps = persistedRecipient ?? memoryRateLimitBuckets.get(recipientKey) ?? [];
  const activeRecipient = baseRecipientTimestamps.filter((ts) => ts > cutoff);

  if (cooldownMs > 0 && activeRecipient.length > 0) {
    const lastSent = activeRecipient[activeRecipient.length - 1];
    const elapsed = now - lastSent;
    if (elapsed < cooldownMs) {
      const retryAfterSeconds = Math.max(1, Math.ceil((cooldownMs - elapsed) / 1000));
      return {
        allowed: false,
        reason: `Too many ${params.category} emails sent to this address. Please wait ${retryAfterSeconds}s before trying again.`,
        retryAfterSeconds,
        recipientCount: activeRecipient.length,
        actorCount: 0
      };
    }
  }

  if (activeRecipient.length >= maxPerRecipient) {
    const oldest = activeRecipient[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return {
      allowed: false,
      reason: `Email rate limit reached for ${cleanRecipient} (${maxPerRecipient} per ${Math.round(windowMs / 60000)}m). Please try again later.`,
      retryAfterSeconds,
      recipientCount: activeRecipient.length,
      actorCount: 0
    };
  }

  let actorKey: string | null = null;
  let activeActor: number[] = [];
  if (params.actorId) {
    actorKey = safeDocKey(`actor_${params.actorId}`);
    const persistedActor = await readPersistedRateBucket(db, actorKey);
    const baseActorTimestamps = persistedActor ?? memoryRateLimitBuckets.get(actorKey) ?? [];
    activeActor = baseActorTimestamps.filter((ts) => ts > cutoff);

    if (activeActor.length >= maxPerActor) {
      const oldest = activeActor[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      return {
        allowed: false,
        reason: `Organization/sender email rate limit reached (${maxPerActor} per ${Math.round(windowMs / 60000)}m). Please try again later.`,
        retryAfterSeconds,
        recipientCount: activeRecipient.length,
        actorCount: activeActor.length
      };
    }
  }

  const nextRecipient = [...activeRecipient, now];
  memoryRateLimitBuckets.set(recipientKey, nextRecipient);
  await writePersistedRateBucket(db, recipientKey, nextRecipient);

  if (actorKey) {
    const nextActor = [...activeActor, now];
    memoryRateLimitBuckets.set(actorKey, nextActor);
    await writePersistedRateBucket(db, actorKey, nextActor);
  }

  return {
    allowed: true,
    recipientCount: nextRecipient.length,
    actorCount: actorKey ? activeActor.length + 1 : 0
  };
}

async function resolveApiKeyFromVault(db: Firestore | null | undefined): Promise<string> {
  if (!db || typeof db.doc !== "function") return "";
  try {
    const secretDoc = await db.doc("orgSecrets/_system_email").get();
    if (!secretDoc.exists) return "";
    const sealed = secretDoc.get("sealedApiKey") as string | undefined;
    if (!sealed) return "";
    const encKey = aiKeyEncryptionKey.value();
    if (!encKey) return "";
    return open(sealed, encKey).trim();
  } catch {
    return "";
  }
}

function inferProvider(explicit: SendEmailOptions["provider"], apiKey: string, webhookUrl?: string): Exclude<EmailProvider, "emulator" | "unconfigured"> {
  if (explicit) return explicit;
  if (webhookUrl || process.env.EMAIL_WEBHOOK_URL) return "webhook";
  const envProvider = (process.env.TRANSACTIONAL_EMAIL_PROVIDER || "").toLowerCase().trim();
  if (envProvider === "sendgrid" || apiKey.startsWith("SG.")) return "sendgrid";
  if (envProvider === "webhook") return "webhook";
  return "resend";
}

/**
 * Provider-agnostic transactional email dispatcher.
 * Supports Resend (HTTP API), SendGrid (HTTP API), custom HTTPS webhook,
 * and an emulator outbox mock. Emits MIPA-36 alerts on failures or rate-limit blocks.
 */
export async function sendTransactionalEmail(
  db: Firestore | null | undefined,
  message: TransactionalEmailMessage,
  options: SendEmailOptions = {}
): Promise<SendEmailResult> {
  const cleanTo = normalizeEmail(message.to);
  if (!isValidEmail(cleanTo)) {
    return { sent: false, provider: "unconfigured", error: "Invalid recipient email address." };
  }

  const category: EmailCategory = message.category || "transactional";
  const fromAddress = message.fromAddress || process.env.TRANSACTIONAL_EMAIL_FROM || DEFAULT_FROM_ADDRESS;
  const fromName = message.fromName || process.env.TRANSACTIONAL_EMAIL_FROM_NAME || DEFAULT_FROM_NAME;
  const formattedFrom = `${fromName} <${fromAddress}>`;

  if (!options.skipRateLimit) {
    const limitResult = await checkAndRecordEmailRateLimit(db, {
      recipientEmail: cleanTo,
      category,
      actorId: message.actorId,
      maxPerRecipient: options.maxPerRecipient,
      maxPerActor: options.maxPerActor,
      windowMs: options.windowMs,
      cooldownMs: options.cooldownMs,
      nowMs: options.nowMs
    });

    if (!limitResult.allowed) {
      await recordMailLog(
        db,
        {
          to: cleanTo,
          category,
          subject: message.subject,
          status: "rate_limited",
          reason: limitResult.reason,
          actorId: message.actorId || null,
          orgId: message.orgId || null
        },
        options.skipFirestoreLog
      );
      await dispatchProductionAlert({
        severity: "WARNING",
        component: "transactional-email",
        summary: `Rate limit triggered for ${category} email`,
        details: { to: cleanTo, actorId: message.actorId || null, reason: limitResult.reason },
        skipFirestore: !db || options.skipFirestoreLog
      });
      return {
        sent: false,
        provider: "unconfigured",
        rateLimited: true,
        retryAfterSeconds: limitResult.retryAfterSeconds,
        error: limitResult.reason
      };
    }
  }

  let apiKey = (
    options.apiKey ??
    process.env.TRANSACTIONAL_EMAIL_API_KEY ??
    process.env.RESEND_API_KEY ??
    process.env.SENDGRID_API_KEY ??
    ""
  ).trim();

  if (!apiKey && !options.useEmulatorMock && !options.transport) {
    apiKey = await resolveApiKeyFromVault(db);
  }

  const webhookUrl = options.webhookUrl || process.env.EMAIL_WEBHOOK_URL;
  const inEmulatorEnv = process.env.FUNCTIONS_EMULATOR === "true";
  const isProdNode = process.env.NODE_ENV === "production" && !inEmulatorEnv;

  const shouldUseEmulatorMock =
    options.useEmulatorMock === true ||
    (!options.transport &&
      !options.requireLiveProvider &&
      ((inEmulatorEnv && !options.apiKey) || (!apiKey && !webhookUrl && !isProdNode)));

  if (shouldUseEmulatorMock) {
    const messageId = `emul-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const outboxEntry: OutboxEntry = {
      ...message,
      to: cleanTo,
      category,
      fromAddress,
      fromName,
      messageId,
      sentAt: new Date().toISOString()
    };
    emulatorOutbox.push(outboxEntry);
    await recordOutboxDoc(db, outboxEntry, options.skipFirestoreLog);
    await recordMailLog(
      db,
      {
        to: cleanTo,
        category,
        subject: message.subject,
        provider: "emulator",
        status: "sent",
        messageId,
        orgId: message.orgId || null
      },
      options.skipFirestoreLog
    );
    return { sent: true, provider: "emulator", messageId };
  }

  if (!options.transport && !apiKey && !webhookUrl) {
    const errMsg = "Transactional email provider API key is not configured (set TRANSACTIONAL_EMAIL_API_KEY).";
    await recordMailLog(
      db,
      {
        to: cleanTo,
        category,
        subject: message.subject,
        provider: "unconfigured",
        status: "failed",
        error: errMsg,
        orgId: message.orgId || null
      },
      options.skipFirestoreLog
    );
    await dispatchProductionAlert({
      severity: "CRITICAL",
      component: "transactional-email",
      summary: "Transactional email provider API key missing in production",
      details: { to: cleanTo, category, orgId: message.orgId || null },
      error: errMsg,
      skipFirestore: !db || options.skipFirestoreLog
    });
    return { sent: false, provider: "unconfigured", error: errMsg };
  }

  const provider = inferProvider(options.provider, apiKey, webhookUrl);
  const payload: TransportPayload = {
    provider,
    from: formattedFrom,
    fromAddress,
    fromName,
    to: cleanTo,
    subject: message.subject,
    html: message.html,
    text: message.text,
    ...(message.replyTo ? { replyTo: message.replyTo } : {})
  };

  try {
    let messageId: string | undefined;

    if (options.transport) {
      const res = await options.transport(payload);
      messageId = res?.messageId || `${provider}-${Date.now()}`;
    } else {
      const fetchFn = options.fetchImpl || fetch;
      messageId = await dispatchViaHttpProvider(fetchFn, payload, apiKey, webhookUrl);
    }

    await recordMailLog(
      db,
      {
        to: cleanTo,
        category,
        subject: message.subject,
        provider,
        status: "sent",
        messageId: messageId || null,
        orgId: message.orgId || null
      },
      options.skipFirestoreLog
    );

    return { sent: true, provider, messageId };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[TransactionalEmail] Failed to send ${category} email via ${provider}:`, errMsg);

    await recordMailLog(
      db,
      {
        to: cleanTo,
        category,
        subject: message.subject,
        provider,
        status: "failed",
        error: errMsg,
        orgId: message.orgId || null
      },
      options.skipFirestoreLog
    );

    await dispatchProductionAlert({
      severity: "ERROR",
      component: "transactional-email",
      summary: `Failed to deliver ${category} email via ${provider}`,
      details: { to: cleanTo, category, provider, orgId: message.orgId || null },
      error: errMsg,
      skipFirestore: !db || options.skipFirestoreLog
    });

    return { sent: false, provider, error: errMsg };
  }
}

async function dispatchViaHttpProvider(
  fetchFn: typeof fetch,
  payload: TransportPayload,
  apiKey: string,
  webhookUrl?: string
): Promise<string> {
  if (payload.provider === "resend") {
    const response = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: payload.from,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        ...(payload.replyTo ? { reply_to: payload.replyTo } : {})
      }),
      signal: AbortSignal.timeout(15_000)
    });

    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(`Resend API error ${response.status}: ${bodyText}`);
    }
    const json = (await response.json()) as { id?: string };
    return json.id || `resend-${Date.now()}`;
  }

  if (payload.provider === "sendgrid") {
    const response = await fetchFn("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: payload.to }] }],
        from: { email: payload.fromAddress, name: payload.fromName },
        subject: payload.subject,
        content: [
          { type: "text/plain", value: payload.text },
          { type: "text/html", value: payload.html }
        ],
        ...(payload.replyTo ? { reply_to: { email: payload.replyTo } } : {})
      }),
      signal: AbortSignal.timeout(15_000)
    });

    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(`SendGrid API error ${response.status}: ${bodyText}`);
    }
    const sgId = response.headers.get("x-message-id");
    return sgId || `sendgrid-${Date.now()}`;
  }

  if (!webhookUrl || !webhookUrl.startsWith("https://")) {
    throw new Error("Webhook email transport requires an https:// EMAIL_WEBHOOK_URL.");
  }

  const response = await fetchFn(webhookUrl, {
    method: "POST",
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text
    }),
    signal: AbortSignal.timeout(15_000)
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Email webhook error ${response.status}: ${bodyText}`);
  }
  return `webhook-${Date.now()}`;
}

export interface InvitationEmailInput {
  recipientEmail: string;
  orgName: string;
  orgId: string;
  role: "member" | "admin";
  invitedByName: string;
  invitedBy?: string;
  invitationId: string;
  locale?: string;
  baseUrl?: string;
}

/**
 * Formats an organization invitation email in English or Traditional Chinese.
 */
export function formatInvitationEmail(
  input: InvitationEmailInput
): { subject: string; html: string; text: string; actionUrl: string } {
  const baseUrl = (input.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const cleanEmail = normalizeEmail(input.recipientEmail);
  const actionUrl = `${baseUrl}/auth?tab=register&email=${encodeURIComponent(cleanEmail)}&orgId=${encodeURIComponent(
    input.orgId
  )}&invitationId=${encodeURIComponent(input.invitationId)}`;
  const isZh = (input.locale || "").toLowerCase().startsWith("zh");
  const inviter = input.invitedByName || (isZh ? "組織管理員" : "An administrator");
  const orgDisplay = input.orgName || (isZh ? "Longecho 組織" : "a Longecho organization");

  if (isZh) {
    const roleLabel = input.role === "admin" ? "管理員" : "成員";
    const subject = `邀請您加入 ${orgDisplay} — Longecho 策略協調平台`;
    const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang TC', 'Noto Sans TC', sans-serif; background: #f9fafb; margin: 0; padding: 24px; color: #1f2937;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;">
    <div style="background: #1976d2; padding: 20px 24px; color: #ffffff;">
      <div style="font-size: 12px; font-weight: 600; letter-spacing: 0.05em;">Longecho 策略協調平台</div>
      <h1 style="margin: 6px 0 0; font-size: 20px;">組織加入邀請</h1>
    </div>
    <div style="padding: 24px;">
      <p style="margin: 0 0 12px; font-size: 15px;">您好，</p>
      <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6;">
        <strong>${escapeHtml(inviter)}</strong> 邀請您以「<strong>${escapeHtml(roleLabel)}</strong>」身分加入 <strong>${escapeHtml(orgDisplay)}</strong>。
      </p>
      <p style="margin: 0 0 20px; font-size: 14px; color: #4b5563; line-height: 1.6;">
        請使用此電子郵件信箱（${escapeHtml(cleanEmail)}）建立帳號或登入，並在首頁接受邀請：
      </p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${actionUrl}" style="background: #1976d2; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">
          註冊並接受邀請
        </a>
      </div>
      <p style="margin: 16px 0 0; font-size: 12px; color: #6b7280; word-break: break-all;">
        若按鈕無法點擊，請複製此連結至瀏覽器：<br>${escapeHtml(actionUrl)}
      </p>
    </div>
  </div>
</body>
</html>`;
    const text = `${inviter} 邀請您以「${roleLabel}」身分加入 ${orgDisplay}。\n\n請使用 ${cleanEmail} 前往以下連結註冊或登入並接受邀請：\n${actionUrl}\n`;
    return { subject, html, text, actionUrl };
  }

  const roleLabel = input.role === "admin" ? "Admin" : "Member";
  const subject = `You are invited to join ${orgDisplay} on Longecho`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f9fafb; margin: 0; padding: 24px; color: #1f2937;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;">
    <div style="background: #1976d2; padding: 20px 24px; color: #ffffff;">
      <div style="font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;">Longecho Strategic Coordination</div>
      <h1 style="margin: 6px 0 0; font-size: 20px;">Organization Invitation</h1>
    </div>
    <div style="padding: 24px;">
      <p style="margin: 0 0 12px; font-size: 15px;">Hello,</p>
      <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6;">
        <strong>${escapeHtml(inviter)}</strong> invited you to join <strong>${escapeHtml(orgDisplay)}</strong> as a <strong>${escapeHtml(roleLabel)}</strong>.
      </p>
      <p style="margin: 0 0 20px; font-size: 14px; color: #4b5563; line-height: 1.6;">
        Create an account or sign in with <strong>${escapeHtml(cleanEmail)}</strong> to accept your invitation on your dashboard:
      </p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${actionUrl}" style="background: #1976d2; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">
          Accept Invitation
        </a>
      </div>
      <p style="margin: 16px 0 0; font-size: 12px; color: #6b7280; word-break: break-all;">
        If the button does not work, open this link in your browser:<br>${escapeHtml(actionUrl)}
      </p>
    </div>
  </div>
</body>
</html>`;
  const text = `${inviter} invited you to join ${orgDisplay} as a ${roleLabel}.\n\nCreate an account or sign in with ${cleanEmail} to accept your invitation:\n${actionUrl}\n`;
  return { subject, html, text, actionUrl };
}

/**
 * Sends an organization invitation email with rate-limit enforcement.
 */
export async function sendInvitationEmail(
  db: Firestore | null | undefined,
  input: InvitationEmailInput,
  options: SendEmailOptions & { throwOnRateLimit?: boolean; throwOnFailure?: boolean } = {}
): Promise<SendEmailResult> {
  const formatted = formatInvitationEmail(input);
  const result = await sendTransactionalEmail(
    db,
    {
      to: input.recipientEmail,
      subject: formatted.subject,
      html: formatted.html,
      text: formatted.text,
      category: "invitation",
      actorId: input.invitedBy || input.orgId,
      orgId: input.orgId,
      metadata: {
        invitationId: input.invitationId,
        role: input.role
      }
    },
    options
  );

  if (result.rateLimited && options.throwOnRateLimit !== false) {
    throw new HttpsError("resource-exhausted", result.error || "Too many invitations sent. Please try again later.");
  }
  if (!result.sent && options.throwOnFailure) {
    throw new HttpsError("internal", result.error || "Failed to deliver invitation email.");
  }
  return result;
}

/**
 * Formats a password-reset email in English or Traditional Chinese.
 */
export function formatPasswordResetEmail(input: {
  recipientEmail: string;
  resetLink: string;
  locale?: string;
  baseUrl?: string;
}): { subject: string; html: string; text: string } {
  const isZh = (input.locale || "").toLowerCase().startsWith("zh");
  const cleanEmail = normalizeEmail(input.recipientEmail);

  if (isZh) {
    const subject = "重設您的 Longecho 密碼";
    const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang TC', 'Noto Sans TC', sans-serif; background: #f9fafb; margin: 0; padding: 24px; color: #1f2937;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;">
    <div style="background: #1976d2; padding: 20px 24px; color: #ffffff;">
      <div style="font-size: 12px; font-weight: 600; letter-spacing: 0.05em;">Longecho 策略協調平台</div>
      <h1 style="margin: 6px 0 0; font-size: 20px;">密碼重設要求</h1>
    </div>
    <div style="padding: 24px;">
      <p style="margin: 0 0 12px; font-size: 15px;">您好，</p>
      <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6;">
        我們收到重設 <strong>${escapeHtml(cleanEmail)}</strong> Longecho 帳號密碼的要求。
      </p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${escapeHtml(input.resetLink)}" style="background: #1976d2; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">
          重設密碼
        </a>
      </div>
      <p style="margin: 0 0 12px; font-size: 13px; color: #4b5563; line-height: 1.6;">
        若您未提出此要求，請忽略這封電子郵件，您的密碼不會有任何變更。
      </p>
      <p style="margin: 16px 0 0; font-size: 12px; color: #6b7280; word-break: break-all;">
        重設連結：<br>${escapeHtml(input.resetLink)}
      </p>
    </div>
  </div>
</body>
</html>`;
    const text = `我們收到重設 ${cleanEmail} Longecho 帳號密碼的要求。\n\n請開啟以下連結重設您的密碼：\n${input.resetLink}\n\n若您未提出此要求，請忽略這封郵件。\n`;
    return { subject, html, text };
  }

  const subject = "Reset your Longecho password";
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f9fafb; margin: 0; padding: 24px; color: #1f2937;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;">
    <div style="background: #1976d2; padding: 20px 24px; color: #ffffff;">
      <div style="font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;">Longecho Strategic Coordination</div>
      <h1 style="margin: 6px 0 0; font-size: 20px;">Password Reset Request</h1>
    </div>
    <div style="padding: 24px;">
      <p style="margin: 0 0 12px; font-size: 15px;">Hello,</p>
      <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6;">
        We received a request to reset the password for your Longecho account (<strong>${escapeHtml(cleanEmail)}</strong>).
      </p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${escapeHtml(input.resetLink)}" style="background: #1976d2; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">
          Reset Password
        </a>
      </div>
      <p style="margin: 0 0 12px; font-size: 13px; color: #4b5563; line-height: 1.6;">
        If you did not request a password reset, you can safely ignore this email.
      </p>
      <p style="margin: 16px 0 0; font-size: 12px; color: #6b7280; word-break: break-all;">
        Reset link:<br>${escapeHtml(input.resetLink)}
      </p>
    </div>
  </div>
</body>
</html>`;
  const text = `We received a request to reset the password for your Longecho account (${cleanEmail}).\n\nOpen this link to reset your password:\n${input.resetLink}\n\nIf you did not request a password reset, you can safely ignore this email.\n`;
  return { subject, html, text };
}

export interface PasswordResetOptions extends SendEmailOptions {
  generateResetLink?: (email: string, continueUrl: string) => Promise<string>;
}

/**
 * Generates a Firebase Auth password-reset link and sends it via the
 * transactional email dispatcher with rate limiting and silent unknown-user protection.
 */
export async function executePasswordResetRequest(
  db: Firestore | null | undefined,
  params: { email: string; locale?: string; baseUrl?: string },
  options: PasswordResetOptions = {}
): Promise<{ success: boolean; sent: boolean; provider?: EmailProvider; messageId?: string; reason?: string }> {
  const cleanEmail = normalizeEmail(params.email);
  if (!isValidEmail(cleanEmail)) {
    throw new HttpsError("invalid-argument", "Please enter a valid email address.");
  }

  const baseUrl = (params.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const continueUrl = `${baseUrl}/auth`;

  const rateLimit = await checkAndRecordEmailRateLimit(db, {
    recipientEmail: cleanEmail,
    category: "password_reset",
    actorId: `reset_${cleanEmail}`,
    maxPerRecipient: options.maxPerRecipient ?? EMAIL_RATE_LIMITS.PER_RECIPIENT_RESET_MAX,
    maxPerActor: options.maxPerActor ?? EMAIL_RATE_LIMITS.PER_RECIPIENT_RESET_MAX,
    windowMs: options.windowMs,
    cooldownMs: options.cooldownMs,
    nowMs: options.nowMs
  });

  if (!rateLimit.allowed) {
    await recordMailLog(
      db,
      {
        to: cleanEmail,
        category: "password_reset",
        status: "rate_limited",
        reason: rateLimit.reason
      },
      options.skipFirestoreLog
    );
    await dispatchProductionAlert({
      severity: "WARNING",
      component: "transactional-email",
      summary: "Password-reset rate limit triggered",
      details: { to: cleanEmail, reason: rateLimit.reason },
      skipFirestore: !db || options.skipFirestoreLog
    });
    throw new HttpsError("resource-exhausted", rateLimit.reason || "Too many password reset requests.");
  }

  let resetLink: string;
  const inEmulatorOrTest =
    options.useEmulatorMock === true ||
    process.env.FUNCTIONS_EMULATOR === "true" ||
    (process.env.NODE_ENV !== "production" && !options.requireLiveProvider);

  try {
    resetLink = options.generateResetLink
      ? await options.generateResetLink(cleanEmail, continueUrl)
      : await getAuth().generatePasswordResetLink(cleanEmail, { url: continueUrl });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || "";
    if (code === "auth/user-not-found") {
      // Never leak whether an account exists to unauthenticated callers
      return { success: true, sent: false, reason: "user_not_found_silent" };
    }
    if (inEmulatorOrTest) {
      const token = Buffer.from(`${cleanEmail}:${Date.now()}`).toString("base64url");
      resetLink = `${continueUrl}?mode=resetPassword&oobCode=emul-${token}&email=${encodeURIComponent(cleanEmail)}`;
    } else {
      const errMsg = err instanceof Error ? err.message : String(err);
      await dispatchProductionAlert({
        severity: "ERROR",
        component: "transactional-email",
        summary: "Failed to generate Firebase Auth password reset link",
        details: { to: cleanEmail },
        error: errMsg,
        skipFirestore: !db || options.skipFirestoreLog
      });
      throw new HttpsError("internal", "Unable to process password reset request right now.");
    }
  }

  const formatted = formatPasswordResetEmail({
    recipientEmail: cleanEmail,
    resetLink,
    locale: params.locale,
    baseUrl
  });

  const sendResult = await sendTransactionalEmail(
    db,
    {
      to: cleanEmail,
      subject: formatted.subject,
      html: formatted.html,
      text: formatted.text,
      category: "password_reset"
    },
    {
      ...options,
      skipRateLimit: true // Already checked and recorded above
    }
  );

  if (!sendResult.sent) {
    throw new HttpsError("internal", sendResult.error || "Failed to send password reset email.");
  }

  return {
    success: true,
    sent: true,
    provider: sendResult.provider,
    messageId: sendResult.messageId
  };
}

/**
 * Callable Cloud Function: sends a rate-limited transactional password-reset email.
 */
export const requestPasswordReset = onCall(
  { secrets: [aiKeyEncryptionKey] },
  async (request: CallableRequest) => {
    const email = typeof request.data?.email === "string" ? request.data.email : "";
    const locale = typeof request.data?.locale === "string" ? request.data.locale : "en-us";
    const db = getFirestore();
    return executePasswordResetRequest(db, { email, locale });
  }
);
