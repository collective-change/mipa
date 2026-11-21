# mipa – Project Instructions & Architecture Guidelines

Repository: https://github.com/collective-change/mipa
Working branch: `modernize-2026`
Production: Firebase project `mipa-2` → https://collective-change.org (canonical) / https://mipa.collective-change.org

---

## 1. What mipa is
A strategic coordination web application for [collective-change.org](https://collective-change.org): organizations build a system-dynamics model of how they work (factors + formulas), add actions with their impacts, and mipa simulates them to rank actions by leverage.
First users: Tzu Chi Foundation (CEO's office); UI in English and Traditional Chinese.

## 2. Tech Stack
- **App**: Vue 3 (Options API), Quasar 2 (`@quasar/app-vite` 3, PWA mode), Vuex 4 with a custom Firestore binder (`src/store/firestore-bind.js`), Firebase JS SDK (modular), `vue-i18n` (legacy mode; `en-us`, `zh-tw` in `src/i18n/*/index.js`), D3 graphs.
- **Calculation engine**: `mathjs` 15 in a web worker (`src/workers/calcWorker.js`).
  *Calculations always run on the user's device (never on the server).*
- **Cloud Functions**: `functions/` (Node 22, TypeScript, `firebase-functions` v2):
  `acceptInvitation`, `removeMember`, `setMemberRole`, `setAiSettings`, `disconnectAi`, `setAiManagers`, `draftModel`, `updateExchangeRates` (scheduled).
- **AI ("Draft my model")**: Organizations bring their own provider (Anthropic via `@anthropic-ai/sdk`, or any OpenAI-compatible endpoint). mipa never pays for AI. Keys sealed with AES-256-GCM (`AI_KEY_ENCRYPTION_KEY` secret) in `orgSecrets/{orgId}`.

## 3. Conventions & Rules
- **Plain language for newcomers**: "factor" (not node), "short name" (not symbol), "uses / used by"; Chinese leverage term is 效應比. Every new UI string goes in BOTH `en-us` and `zh-tw` (no duplicate keys; avoid `@`, `|`, `{` literals in messages).
- **"Leverage" is NOT "good done per hour"**:
  Formula: `actionLeverage = (netBenefitNpv * totalRoi / outstandingDirectCosts) * sign(net)`. The metric scales quadratically with net benefit (net² / [C · (C + E)]), strongly rewarding high net gains achieved with minimal direct spending. When outstanding direct costs C <= 0, leverage is null.
- **Security rules**:
  - Org members via `orgs/{orgId}/members/{uid}`.
  - User profiles private; chats member-only.
  - Only admins (`superAdmins`) change membership.
  - Model subcollections other than `nodes` are closed to browsers.
- **Privacy**: No promise that AI providers don't train on data; the org picks a provider.
  Contact: GitHub issues for questions and feedback; GitHub Security Advisories for private security matters.
- **Git workflow**:
  - Develop on `modernize-2026`.
  - Open a PR to `master`, squash-merge when CI is green.
  - Then `git merge -s ours origin/master` into the branch (force push is blocked).

## 4. Dev, Build & Test Workflows
```bash
# Installation
npm ci && npm ci --prefix src-pwa && npm ci --prefix functions

# Development
npm run dev                  # Quasar dev server (port 9000)
npm run lint                 # ESLint check
npm test                     # Vitest: calc worker black-box tests, sample org, AI draft compile
npm run build                # PWA build -> dist/pwa
npm test --prefix functions  # builds functions + node --test (keys, reply parsing, prompts)
```

### Firebase Emulators (set `useEmulators=true` in `.env`)
```bash
firebase emulators:start --only auth,firestore,functions --project demo-mipa --import initial-firestore-emulator-data
```
- Ports: Firestore 5002, Auth 9099, Functions 5001.
- If a proxy is set, export `NO_PROXY=localhost,127.0.0.1` or rule reloads fail.
- For local AI testing: set `AI_KEY_ENCRYPTION_KEY=<openssl rand -base64 32>` in `functions/.secret.local`. In emulator only, an OpenAI-compatible endpoint may point to `http://127.0.0.1:<port>/v1`.

## 5. Deployment
- Every push to `master` deploys via `.github/workflows/deploy.yml` (lint, tests, build, then rules, indexes, functions, hosting).
- One-time/maintenance: `.github/workflows/production-setup.yml` (Actions → Run workflow) with modes `check` (read-only), `migrate`, `functions`.

## 6. Open Follow-ups
- AI draft quality evaluation (~20 descriptions, EN/ZH) against real Claude models.
- Gemini / OpenAI native adapters; privacy policy legal review.

## 7. Completed Follow-ups
- Chinese short names: migrated 40 live factors with Chinese short names and 55 factors with missing/invalid symbols in production `mipa-2` to meaningful English ASCII symbols; updated referring formulas; updated AddNode.vue and NodeSummary.vue with short name input and uniqueness validation.

## Never paste production log output into a tracked file

This repository is PUBLIC, so committing is publishing. A smoke-test document once quoted a
production log verbatim and published four real email addresses (including two third parties')
and an account UID. Redacting them in HEAD does not unpublish them - they stay in git history.

- **Synthesise an example** (`<recipient-1@example.org>`); never paste a real address, UID, token or
  identifier that came from a live system.
- **Never hardcode a credential as a test fallback** (`process.env.X || "secret"`): the fallback is
  the leak. Require the variable and throw when it is absent.
- Reviewers: a diff that adds a line looking like log output is a publication decision, not a doc edit.

## Before you build an automation: three rules

An automation here is a cron job, a `scripts/` helper, a Cloud Function, a workflow step, or an agent
loop. Three things are true of every one of them, and each has already gone wrong in this repository.

- **Instrument before automating.** A process that has run fewer than a handful of times gets **a log
  and a counter**, not a system: automating a rare event costs the most and breaks the most. **And the
  counter must be able to read non-zero** - a dashboard that has only ever shown `0` has not been
  tested, it has been decorated.
- **It must fail loudly.** Silent failure is the default: a webhook that stops firing, a form that
  drops a submission, a heading a parser cannot match, an `add` that returns `ok:true` while changing
  nothing, a send whose "response" is an echo of what you sent. For each new one, state **the sentinel
  that notices** and **the human it wakes**. Verify on the other side of the call, against that side's
  own state - never against the reply the call returned.
- **It must include its own removal.** Anything that creates - files, records, exports, logs, backups -
  needs a retention rule in the same change. Measured 2026-11-21: ~140 `.bak` files in `docs/` with no
  retention rule, most of them from a "back up before editing" habit.

**Two boundaries here that are not engineering choices.**

- **No automation may manufacture attention.** No cold outreach, no nagging growth loops, nothing that
  spends someone else's attention without their consent. The only legitimate acquisition is being
  findable, and being worth telling someone about. (Ted, M-9: *"We cannot force people, we can only
  remind them."*)
- **No automation may decide something that can hurt a person:** removing someone's content, taking
  money back, naming a person, contacting a third party about their conduct. Intake, triage, drafting,
  scheduling, reminding and recording may be automated. **Adjudication may not.**

