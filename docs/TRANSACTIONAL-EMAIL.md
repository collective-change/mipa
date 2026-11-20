# Transactional Email, Domain Authentication & Delivery Architecture (MIPA-44)

This document describes mipa's transactional email architecture for `collective-change.org` (`mipa-2`), including provider configuration, secret management, required DNS authentication records (SPF, DKIM, DMARC), rate limiting, emulator behavior, and MIPA-36 alerting integration.

---

## 1. Provider-Agnostic Architecture & Secret Storage

Transactional email is handled server-side by `functions/src/notifications/transactionalEmail.ts` (`sendTransactionalEmail`) and shared across:
- **Organization Invitations**: `createInvitation` and `resendInvitation` (`functions/src/orgMembers.ts`)
- **Password Resets**: `requestPasswordReset` (`functions/src/notifications/transactionalEmail.ts`)
- **Monday Strategic Digests**: `processWeeklyDigests` / `sendWeeklyStrategicDigest` (`functions/src/notifications/weeklyDigest.ts`)

### Supported Transports
1. **Resend** (`https://api.resend.com/emails`) — primary provider (detected automatically when API key starts with `re_` or `TRANSACTIONAL_EMAIL_PROVIDER=resend`). Uses native `fetch` with zero extra npm dependencies.
2. **SendGrid** (`https://api.sendgrid.com/v3/mail/send`) — compatible provider (detected when API key starts with `SG.` or `TRANSACTIONAL_EMAIL_PROVIDER=sendgrid`).
3. **Custom HTTPS Webhook** (`EMAIL_WEBHOOK_URL`) — for self-hosted/relay setups requiring an `https://` endpoint.
4. **Emulator Outbox Mock** — active automatically when `FUNCTIONS_EMULATOR=true` (without an explicit override) or in non-production test environments with no provider key. Records messages in-memory (`getEmulatorOutbox()`) and writes them to Firestore `mailOutbox` and `mailLogs` so tests and local development require no live email provider.

### Secret Locations (Never in Git)
The provider API key must **never** be committed to the repository. `sendTransactionalEmail` resolves credentials in the following order:
1. Environment / secret runtime configuration:
   - `TRANSACTIONAL_EMAIL_API_KEY` (or `RESEND_API_KEY` / `SENDGRID_API_KEY`) configured via:
     - **Local emulators**: `functions/.secret.local` (`*.secret*` is listed in `.gitignore`).
     - **Production**: Cloud Functions environment configuration (`FUNCTIONS_ENV_FILE` / Cloud Run env secret).
2. Encrypted Firestore vault document `orgSecrets/_system_email` (`sealedApiKey`), encrypted at rest with AES-256-GCM using `AI_KEY_ENCRYPTION_KEY` (`functions/src/ai/keyBox.ts`). `orgSecrets` has `allow read, write: if false` in `firestore.rules`.

Optional sender overrides (non-secret):
- `TRANSACTIONAL_EMAIL_FROM` (defaults to `notifications@collective-change.org`)
- `TRANSACTIONAL_EMAIL_FROM_NAME` (defaults to `mipa`)
- `TRANSACTIONAL_EMAIL_PROVIDER` (`resend` | `sendgrid` | `webhook`)

---

## 2. Domain Authentication Records (`collective-change.org`)

To prevent organization invitations and password-reset emails from landing in spam or failing DMARC checks, the following DNS records must be configured on `collective-change.org`.

### Required DNS Records (`REQUIRED_DNS_RECORDS`)

| Purpose | Type | Host / Name | Value / Target | Priority |
| :--- | :--- | :--- | :--- | :--- |
| **SPF** | `TXT` | `@` (`collective-change.org`) | `v=spf1 include:_spf.firebasemail.com include:amazonses.com include:sendgrid.net ~all` | — |
| **DKIM (Resend)** | `TXT` | `resend._domainkey.collective-change.org` | `p=<RESEND_GENERATED_PUBLIC_KEY>` (copied from Resend Domain dashboard) | — |
| **Return-Path MX** | `MX` | `send.collective-change.org` | `feedback-smtp.us-east-1.amazonses.com` | `10` |
| **Return-Path SPF** | `TXT` | `send.collective-change.org` | `v=spf1 include:amazonses.com ~all` | — |
| **DMARC** | `TXT` | `_dmarc.collective-change.org` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@collective-change.org; pct=100; adkim=s; aspf=s` | — |
| **DKIM (SendGrid, if used)** | `CNAME` | `s1._domainkey.collective-change.org` | `s1.domainkey.u<ID>.wl.sendgrid.net` | — |
| **DKIM (SendGrid, if used)** | `CNAME` | `s2._domainkey.collective-change.org` | `s2.domainkey.u<ID>.wl.sendgrid.net` | — |

### Observed DNS Verification State
- **Environment check (2026-11-20)**: Running `Resolve-DnsName -Name collective-change.org -Type TXT` inside the offline build environment exited with code `1` and no DNS records returned (external DNS queries are blocked by sandbox network isolation).
- **Automated verifier**: `verifyDomainEmailAuth("collective-change.org")` in `functions/src/notifications/transactionalEmail.ts` checks `@` (`v=spf1`), `_dmarc.collective-change.org` (`v=dmarc1`), and DKIM selectors (`resend._domainkey`, `s1._domainkey`, `s2._domainkey`, `firebase1._domainkey`, `firebase2._domainkey`).

### Remaining Manual Steps for Ted (Account & DNS Provisioning)
1. **Create provider account & API key**:
   - Sign up at Resend (recommended) and add domain `collective-change.org`.
   - Generate a sending-scoped API key (`re_...`).
2. **Add DNS records at your DNS host for `collective-change.org`**:
   - Add the exact `SPF`, `DMARC`, `DKIM` (`resend._domainkey`), and `send` Return-Path (`MX` + `TXT`) records shown in the Resend domain setup screen (matching the table above).
   - Verify the domain in the Resend dashboard until SPF, DKIM, and DMARC show **Verified**.
   - Optionally verify live DNS from your terminal:
     ```bash
     dig TXT collective-change.org +short
     dig TXT resend._domainkey.collective-change.org +short
     dig TXT _dmarc.collective-change.org +short
     ```
3. **Provision the secret on production (`mipa-2`)**:
   - Store `TRANSACTIONAL_EMAIL_API_KEY=<re_...>` in your production `FUNCTIONS_ENV_FILE` repository variable (or on the Cloud Functions runtime / encrypted `orgSecrets/_system_email` document using `seal()` from `functions/src/ai/keyBox.ts`).

---

## 3. End-to-End Flows

### Invitation Flow (`A-15` Invite-Only + `MIPA-18`)
1. Organization admin submits an invite on `PageOrgMembers.vue` -> `store-members.js` `inviteMember` (or `resendInvitation`).
2. `createInvitation` / `resendInvitation` Cloud Functions enforce admin role and tier seat limits (`checkSeatCapacity`), create/update `orgs/{orgId}/invitations/{invitationId}`, and invoke `sendInvitationEmail`.
3. The invitee receives a bilingual (`en-us` or `zh-tw`) email containing a direct sign-up/sign-in link:
   `https://collective-change.org/auth?tab=register&email=<email>&orgId=<orgId>&invitationId=<invitationId>`
4. When the invitee registers or signs in via OAuth, `MIPA-18`'s post-auth `verifyUserAccess` -> `checkUserAccess` matches the pending invitation in `orgs/*/invitations` and grants access to `/orgs`, where `acceptInvitation` adds them to the organization and its models.

### Password-Reset Flow
1. On `/auth`, the user clicks **Forgot password?** -> `store-auth.js` `sendPasswordResetEmail`.
2. `store-auth.js` invokes the `requestPasswordReset` callable Cloud Function (with fallback to Firebase Auth client SDK only if Functions are unavailable in a client-only emulator setup).
3. `executePasswordResetRequest` validates the email, enforces the strict `password_reset` rate limit (max 3 requests per 15-minute window), generates a Firebase Auth reset link via `getAuth().generatePasswordResetLink(...)` (silently succeeding on `auth/user-not-found` so account existence is never leaked), and sends the branded reset email through `sendTransactionalEmail`.

---

## 4. Rate Limiting & MIPA-36 Failure Visibility

- **Rate Limits (`EMAIL_RATE_LIMITS`)**:
  - Invitations / general transactional emails: **5 per recipient** per **15-minute** sliding window, **30 per sender/actor** per 15 minutes.
  - Password resets: **3 per recipient** per **15-minute** sliding window.
  - Persisted in `mailRateLimits/{bucketKey}` with an in-memory fallback for rapid local enforcement.
  - Rate-limit violations return HTTP `resource-exhausted`, log `status: "rate_limited"` to `mailLogs`, and emit a `WARNING` alert via `dispatchProductionAlert`.
- **Failure Visibility (MIPA-36)**:
  - Missing provider key in production (`requireLiveProvider` / `NODE_ENV=production`) writes `status: "failed"` to `mailLogs` and emits a `CRITICAL` alert via `dispatchProductionAlert` (`telegram:8949762543:1471` + `system_alerts`).
  - Provider HTTP errors (`4xx`/`5xx`) or network failures write `status: "failed"` to `mailLogs` and emit an `ERROR` alert via `dispatchProductionAlert`.
