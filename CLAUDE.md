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
  Formula: `actionLeverage = (netBenefitNpv * totalRoi / outstandingDirectCosts) * sign(net)`.
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
