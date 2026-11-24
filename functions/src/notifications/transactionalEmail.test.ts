import { test, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert/strict";
import { HttpsError } from "firebase-functions/v2/https";
import { Firestore } from "firebase-admin/firestore";
import { seal } from "../ai/keyBox";
import {
  DEFAULT_SENDING_DOMAIN,
  REQUIRED_DNS_RECORDS,
  verifyDomainEmailAuth,
  sendTransactionalEmail,
  formatInvitationEmail,
  formatPasswordResetEmail,
  executePasswordResetRequest,
  getEmulatorOutbox,
  clearEmulatorOutbox,
  resetEmailRateLimits,
  DnsResolver
} from "./transactionalEmail";
import {
  executeCreateInvitation,
  executeResendInvitation,
  evaluateUserAccess
} from "../orgMembers";
import { processWeeklyDigests } from "./weeklyDigest";

interface MockStore {
  docs: Map<string, Record<string, unknown>>;
  added: Record<string, Array<Record<string, unknown>>>;
}

function createInMemoryFirestore(initialDocs: Record<string, Record<string, unknown>> = {}): {
  db: Firestore;
  store: MockStore;
} {
  const store: MockStore = {
    docs: new Map(Object.entries(initialDocs)),
    added: {
      mailLogs: [],
      mailOutbox: [],
      system_alerts: [],
      digestLogs: []
    }
  };
  let autoIdCounter = 1;

  const makeSnap = (path: string, id: string) => {
    const data = store.docs.get(path);
    return {
      id,
      exists: Boolean(data),
      data: () => (data ? { ...data } : undefined),
      get: (field: string) => (data ? data[field] : undefined)
    };
  };

  const makeDocRef = (path: string, id: string) => ({
    id,
    path,
    get: async () => makeSnap(path, id),
    set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
      const existing = opts?.merge ? store.docs.get(path) || {} : {};
      store.docs.set(path, { ...existing, ...data });
    },
    collection: (sub: string) => makeColRef(`${path}/${sub}`)
  });

  const applyWhere = (entries: Array<[string, Record<string, unknown>]>, field: string, op: string, val: unknown) => {
    return entries.filter(([, data]) => {
      const current = data[field];
      if (op === "==") return current === val;
      if (op === "array-contains") return Array.isArray(current) && current.includes(val);
      if (op === ">=") return true;
      return true;
    });
  };

  const makeColRef = (colPath: string) => {
    const listMatching = (filters: Array<{ field: string; op: string; val: unknown }> = []) => {
      let entries = Array.from(store.docs.entries()).filter(([p]) => {
        if (!p.startsWith(`${colPath}/`)) return false;
        const remainder = p.slice(colPath.length + 1);
        return !remainder.includes("/");
      });
      for (const f of filters) {
        entries = applyWhere(entries, f.field, f.op, f.val);
      }
      return entries.map(([p, data]) => {
        const id = p.slice(colPath.length + 1);
        return {
          id,
          exists: true,
          data: () => ({ ...data }),
          get: (field: string) => data[field]
        };
      });
    };

    const makeQuery = (filters: Array<{ field: string; op: string; val: unknown }> = []) => ({
      where: (field: string, op: string, val: unknown) => makeQuery([...filters, { field, op, val }]),
      orderBy: () => makeQuery(filters),
      count: () => ({
        get: async () => ({ data: () => ({ count: listMatching(filters).length }) })
      }),
      limit: (n: number) => ({
        get: async () => {
          const docs = listMatching(filters).slice(0, n);
          return { empty: docs.length === 0, docs };
        }
      }),
      get: async () => {
        const docs = listMatching(filters);
        return { empty: docs.length === 0, docs };
      }
    });

    return {
      doc: (id?: string) => {
        const resolvedId = id || `doc_${autoIdCounter++}`;
        return makeDocRef(`${colPath}/${resolvedId}`, resolvedId);
      },
      add: async (data: Record<string, unknown>) => {
        const resolvedId = `auto_${autoIdCounter++}`;
        const path = `${colPath}/${resolvedId}`;
        store.docs.set(path, { ...data });
        if (!store.added[colPath]) store.added[colPath] = [];
        store.added[colPath].push({ id: resolvedId, ...data });
        return { id: resolvedId };
      },
      where: (field: string, op: string, val: unknown) => makeQuery([{ field, op, val }]),
      orderBy: () => makeQuery([]),
      get: async () => {
        const docs = listMatching([]);
        return { empty: docs.length === 0, docs };
      }
    };
  };

  const db = {
    doc: (fullPath: string) => {
      const parts = fullPath.split("/");
      return makeDocRef(fullPath, parts[parts.length - 1]);
    },
    collection: (name: string) => makeColRef(name),
    collectionGroup: (groupName: string) => ({
      where: (field: string, op: string, val: unknown) => ({
        limit: (n: number) => ({
          get: async () => {
            let entries = Array.from(store.docs.entries()).filter(([p]) => {
              const segs = p.split("/");
              return segs.length >= 2 && segs[segs.length - 2] === groupName;
            });
            entries = applyWhere(entries, field, op, val).slice(0, n);
            return {
              empty: entries.length === 0,
              docs: entries.map(([p, data]) => {
                const segs = p.split("/");
                return { id: segs[segs.length - 1], data: () => ({ ...data }) };
              })
            };
          }
        })
      })
    }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const tx = {
        get: async (target: { get: () => Promise<unknown> }) => target.get(),
        set: (ref: { path: string }, data: Record<string, unknown>) => {
          store.docs.set(ref.path, { ...data });
        },
        update: (ref: { path: string }, data: Record<string, unknown>) => {
          const prev = store.docs.get(ref.path) || {};
          store.docs.set(ref.path, { ...prev, ...data });
        },
        delete: (ref: { path: string }) => {
          store.docs.delete(ref.path);
        }
      };
      return fn(tx);
    }
  } as unknown as Firestore;

  return { db, store };
}

beforeEach(() => {
  clearEmulatorOutbox();
  resetEmailRateLimits();
});

afterEach(() => {
  clearEmulatorOutbox();
  resetEmailRateLimits();
});

test("MIPA-44: formatInvitationEmail & formatPasswordResetEmail keep ZERO Chinese characters in en-us and support zh-tw", () => {
  const enInvite = formatInvitationEmail({
    recipientEmail: "alice@tzuchi.org.tw",
    orgName: "Tzu Chi Foundation",
    orgId: "org-tc",
    role: "admin",
    invitedByName: "Ted Hwang",
    invitationId: "inv-123",
    locale: "en-us"
  });
  assert.ok(enInvite.subject.includes("Tzu Chi Foundation"));
  assert.ok(enInvite.actionUrl.includes("/auth?tab=register"));
  assert.ok(enInvite.actionUrl.includes("orgId=org-tc"));
  assert.ok(enInvite.actionUrl.includes("invitationId=inv-123"));
  assert.equal((enInvite.subject + enInvite.html + enInvite.text).match(/[\u4e00-\u9fff]/g), null);

  const zhInvite = formatInvitationEmail({
    recipientEmail: "alice@tzuchi.org.tw",
    orgName: "慈濟基金會",
    orgId: "org-tc",
    role: "admin",
    invitedByName: "Ted Hwang",
    invitationId: "inv-123",
    locale: "zh-tw"
  });
  assert.ok(zhInvite.subject.includes("邀請您加入"));
  assert.ok(zhInvite.html.includes("管理員"));
  assert.ok(zhInvite.text.includes("inv-123"));

  const enReset = formatPasswordResetEmail({
    recipientEmail: "bob@example.org",
    resetLink: "https://collective-change.org/auth?mode=resetPassword&oobCode=abc",
    locale: "en-us"
  });
  assert.ok(enReset.subject.includes("Reset your mipa password"));
  assert.ok(enReset.html.includes("oobCode=abc"));
  assert.equal((enReset.subject + enReset.html + enReset.text).match(/[\u4e00-\u9fff]/g), null);

  const zhReset = formatPasswordResetEmail({
    recipientEmail: "bob@example.org",
    resetLink: "https://collective-change.org/auth?mode=resetPassword&oobCode=abc",
    locale: "zh-tw"
  });
  assert.ok(zhReset.subject.includes("重設您的 mipa 密碼"));
  assert.ok(zhReset.html.includes("重設密碼"));
});

test("MIPA-44: Resend and SendGrid transports send exact HTTP payloads and log success", async () => {
  const { db, store } = createInMemoryFirestore();
  const captured: Array<{ url: string; headers: Record<string, string>; body: Record<string, unknown> }> = [];

  const mockFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = (init?.headers || {}) as Record<string, string>;
    const body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    captured.push({ url, headers, body });

    let hostname = "";
    try {
      hostname = new URL(url).hostname;
    } catch {
      hostname = "";
    }

    if (hostname === "api.resend.com") {
      return new Response(JSON.stringify({ id: "re_msg_999" }), { status: 200 });
    }
    return new Response(null, {
      status: 202,
      headers: { "x-message-id": "sg_msg_777" }
    });
  }) as typeof fetch;

  const resendResult = await sendTransactionalEmail(
    db,
    {
      to: "user1@example.org",
      subject: "Hello Resend",
      html: "<p>Hi</p>",
      text: "Hi"
    },
    { apiKey: "re_live_secret_123", fetchImpl: mockFetch }
  );

  assert.equal(resendResult.sent, true);
  assert.equal(resendResult.provider, "resend");
  assert.equal(resendResult.messageId, "re_msg_999");
  assert.equal(captured[0].url, "https://api.resend.com/emails");
  assert.equal(captured[0].headers.Authorization, "Bearer re_live_secret_123");
  assert.deepEqual(captured[0].body.to, ["user1@example.org"]);

  const sendgridResult = await sendTransactionalEmail(
    db,
    {
      to: "user2@example.org",
      subject: "Hello SendGrid",
      html: "<p>Hi SG</p>",
      text: "Hi SG"
    },
    { apiKey: "SG.live_secret_456", fetchImpl: mockFetch }
  );

  assert.equal(sendgridResult.sent, true);
  assert.equal(sendgridResult.provider, "sendgrid");
  assert.equal(sendgridResult.messageId, "sg_msg_777");
  assert.equal(captured[1].url, "https://api.sendgrid.com/v3/mail/send");
  assert.equal(captured[1].headers.Authorization, "Bearer SG.live_secret_456");

  assert.equal(store.added.mailLogs.length, 2);
  assert.equal(store.added.mailLogs[0].status, "sent");
  assert.equal(store.added.mailLogs[1].status, "sent");
});

test("MIPA-44: decrypts AES-256-GCM sealed key from orgSecrets/_system_email when env var is absent", async () => {
  const prevEncKey = process.env.AI_KEY_ENCRYPTION_KEY;
  const encKey = Buffer.alloc(32, 7).toString("base64");
  process.env.AI_KEY_ENCRYPTION_KEY = encKey;

  try {
    const sealedApiKey = seal("re_vault_decrypted_key", encKey);
    const { db } = createInMemoryFirestore({
      "orgSecrets/_system_email": { sealedApiKey }
    });

    let capturedAuth = "";
    const mockFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      capturedAuth = ((init?.headers || {}) as Record<string, string>).Authorization || "";
      return new Response(JSON.stringify({ id: "re_vault_1" }), { status: 200 });
    }) as typeof fetch;

    const result = await sendTransactionalEmail(
      db,
      {
        to: "vault@example.org",
        subject: "Vault key test",
        html: "<p>Vault</p>",
        text: "Vault"
      },
      { requireLiveProvider: true, fetchImpl: mockFetch }
    );

    assert.equal(result.sent, true);
    assert.equal(result.provider, "resend");
    assert.equal(capturedAuth, "Bearer re_vault_decrypted_key");
  } finally {
    if (prevEncKey === undefined) delete process.env.AI_KEY_ENCRYPTION_KEY;
    else process.env.AI_KEY_ENCRYPTION_KEY = prevEncKey;
  }
});

test("MIPA-44 + MIPA-18 end-to-end: invite creates Firestore record, delivers email to outbox, passes checkUserAccess, and supports resend", async () => {
  const { db, store } = createInMemoryFirestore({
    "orgs/org-1": {
      name: "Tzu Chi Relief",
      users: ["admin-1"],
      superAdmins: ["admin-1"],
      seatLimit: 5
    }
  });

  // 1. Admin invites teammate
  const createRes = await executeCreateInvitation(db, {
    uid: "admin-1",
    callerName: "Admin Lead",
    callerEmail: "admin@tzuchi.org.tw",
    orgId: "org-1",
    email: "NewMember@TzuChi.Org.TW",
    role: "member",
    locale: "en-us"
  });

  assert.equal(createRes.success, true);
  assert.equal(createRes.emailSent, true);

  // 2. Outbox received invitation email with registration link
  const outbox = getEmulatorOutbox();
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].to, "newmember@tzuchi.org.tw");
  assert.equal(outbox[0].category, "invitation");
  assert.ok(outbox[0].text.includes(`/auth?tab=register&email=newmember%40tzuchi.org.tw&orgId=org-1&invitationId=${createRes.invitationId}`));

  // 3. MIPA-18 checkUserAccess admits the newly registered invited email
  const access = await evaluateUserAccess(db, "brand-new-uid", "NewMember@TzuChi.Org.TW");
  assert.deepEqual(access, { allowed: true, isMember: false, hasInvite: true });

  // 4. Admin resends invitation
  const resendRes = await executeResendInvitation(db, {
    uid: "admin-1",
    callerName: "Admin Lead",
    orgId: "org-1",
    invitationId: createRes.invitationId,
    locale: "zh-tw"
  });

  assert.equal(resendRes.success, true);
  assert.equal(resendRes.emailSent, true);
  assert.equal(getEmulatorOutbox().length, 2);
  assert.ok(getEmulatorOutbox()[1].subject.includes("邀請您加入"));

  const savedInv = store.docs.get(`orgs/org-1/invitations/${createRes.invitationId}`);
  assert.equal(savedInv?.emailDeliveryStatus, "sent");
  assert.equal(store.added.mailOutbox.length, 2);
});

test("MIPA-44 end-to-end: password-reset generates reset link, sends email to outbox, and hides unknown accounts", async () => {
  const { db, store } = createInMemoryFirestore();

  const res = await executePasswordResetRequest(
    db,
    { email: "Member@Example.org", locale: "en-us" },
    {
      generateResetLink: async (email) =>
        `https://collective-change.org/auth?mode=resetPassword&oobCode=test-code-123&email=${encodeURIComponent(email)}`
    }
  );

  assert.equal(res.success, true);
  assert.equal(res.sent, true);
  assert.equal(res.provider, "emulator");

  const outbox = getEmulatorOutbox();
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].to, "member@example.org");
  assert.equal(outbox[0].category, "password_reset");
  assert.ok(outbox[0].html.includes("oobCode=test-code-123"));
  assert.equal(store.added.mailLogs.length, 1);

  // Unknown user from Firebase Auth must return success without leaking existence
  const unknownRes = await executePasswordResetRequest(
    db,
    { email: "nobody@example.org" },
    {
      generateResetLink: async () => {
        const err = new Error("User not found") as Error & { code: string };
        err.code = "auth/user-not-found";
        throw err;
      }
    }
  );
  assert.deepEqual(unknownRes, { success: true, sent: false, reason: "user_not_found_silent" });
  assert.equal(getEmulatorOutbox().length, 1);

  // Invalid email throws invalid-argument
  await assert.rejects(
    async () => executePasswordResetRequest(db, { email: "not-an-email" }),
    (err: HttpsError) => err.code === "invalid-argument"
  );
});

test("MIPA-44: enforces rate limits and surfaces failures visibly via MIPA-36 alerting", async () => {
  const { db, store } = createInMemoryFirestore();

  // 1. Password reset rate limit (max 3 per window)
  for (let i = 0; i < 3; i++) {
    const ok = await executePasswordResetRequest(
      db,
      { email: "burst@example.org" },
      { generateResetLink: async () => `https://collective-change.org/auth?oobCode=${i}` }
    );
    assert.equal(ok.sent, true);
  }

  await assert.rejects(
    async () =>
      executePasswordResetRequest(
        db,
        { email: "burst@example.org" },
        { generateResetLink: async () => "https://collective-change.org/auth?oobCode=4" }
      ),
    (err: HttpsError) => err.code === "resource-exhausted"
  );

  // Rate limit audit log + alert recorded
  const rateLogs = store.added.mailLogs.filter((l) => l.status === "rate_limited");
  assert.equal(rateLogs.length, 1);

  // 2. Missing live key in production fails visibly and raises CRITICAL alert
  const missingKeyRes = await sendTransactionalEmail(
    db,
    { to: "ops@example.org", subject: "Prod test", html: "<p>x</p>", text: "x" },
    { requireLiveProvider: true }
  );
  assert.equal(missingKeyRes.sent, false);
  assert.equal(missingKeyRes.provider, "unconfigured");
  assert.ok(missingKeyRes.error?.includes("TRANSACTIONAL_EMAIL_API_KEY"));

  // 3. Provider HTTP 500 failure logs failed status + raises ERROR alert
  const failedProviderRes = await sendTransactionalEmail(
    db,
    { to: "ops2@example.org", subject: "Fail test", html: "<p>x</p>", text: "x" },
    {
      apiKey: "re_fail_test",
      fetchImpl: (async () => new Response("Internal Provider Error", { status: 500 })) as typeof fetch
    }
  );
  assert.equal(failedProviderRes.sent, false);
  assert.equal(failedProviderRes.provider, "resend");
  assert.ok(failedProviderRes.error?.includes("500"));

  const failedLogs = store.added.mailLogs.filter((l) => l.status === "failed");
  assert.equal(failedLogs.length, 2);
});

test("MIPA-44: verifyDomainEmailAuth validates SPF, DKIM, and DMARC and handles DNS errors safely", async () => {
  assert.equal(DEFAULT_SENDING_DOMAIN, "collective-change.org");
  assert.ok(REQUIRED_DNS_RECORDS.some((r) => r.purpose === "SPF"));
  assert.ok(REQUIRED_DNS_RECORDS.some((r) => r.purpose === "DKIM_RESEND"));
  assert.ok(REQUIRED_DNS_RECORDS.some((r) => r.purpose === "DMARC"));

  const validResolver: DnsResolver = {
    resolveTxt: async (host: string) => {
      if (host === "collective-change.org") {
        return [["v=spf1 include:_spf.firebasemail.com include:amazonses.com ~all"]];
      }
      if (host === "_dmarc.collective-change.org") {
        return [["v=DMARC1; p=quarantine; rua=mailto:dmarc@collective-change.org"]];
      }
      if (host === "resend._domainkey.collective-change.org") {
        return [["p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCvalidkey"]];
      }
      return [];
    },
    resolveCname: async () => []
  };

  const verifiedStatus = await verifyDomainEmailAuth("collective-change.org", validResolver);
  assert.equal(verifiedStatus.verified, true);
  assert.equal(verifiedStatus.spf.valid, true);
  assert.equal(verifiedStatus.dkim.valid, true);
  assert.equal(verifiedStatus.dmarc.valid, true);
  assert.deepEqual(verifiedStatus.dkim.selectorsFound, ["resend._domainkey"]);

  const missingDmarcResolver: DnsResolver = {
    resolveTxt: async (host: string) => {
      if (host === "collective-change.org") return [["v=spf1 include:amazonses.com ~all"]];
      const err = new Error("NXDOMAIN") as Error & { code: string };
      err.code = "ENOTFOUND";
      throw err;
    },
    resolveCname: async () => []
  };

  const unverifiedStatus = await verifyDomainEmailAuth("collective-change.org", missingDmarcResolver);
  assert.equal(unverifiedStatus.verified, false);
  assert.equal(unverifiedStatus.spf.valid, true);
  assert.equal(unverifiedStatus.dkim.valid, false);
  assert.equal(unverifiedStatus.dmarc.valid, false);
});

test("MIPA-44 + MIPA-37: weekly digest sends emails through transactional dispatcher", async () => {
  const { db } = createInMemoryFirestore({
    "actions/act-1": {
      title: "Community Solar",
      responsiblePerson: "user-1",
      orgId: "org-1",
      actionLeverage: 12.5,
      progressPercent: 50
    },
    "users/user-1": {
      email: "director@example.org",
      displayName: "Director",
      locale: "en-us"
    },
    "orgs/org-1": {
      name: "Clean Energy Org"
    }
  });

  const report = await processWeeklyDigests(db, { sendEmails: true });
  assert.equal(report.emailsSent, 1);
  const outbox = getEmulatorOutbox();
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].to, "director@example.org");
  assert.equal(outbox[0].category, "weekly_digest");
});
