---
trigger: always_on
---

# Mipa Project Instructions & Guidelines

Repository: https://github.com/collective-change/mipa
Working branch: `modernize-2026`
Production: Firebase project `mipa-2` → https://mipa.collective-change.org

## Core System & Domain
- **What mipa is**: A strategic coordination web application for collective-change.org. Organizations build a system-dynamics model of how they work (factors + formulas), add actions with their impacts, and mipa simulates them to rank actions by leverage.
- **First users**: Tzu Chi Foundation (CEO's office); UI in English and Traditional Chinese.
- **Leverage calculation**: Leverage is NOT "good done per hour".
  Formula: `actionLeverage = (netBenefitNpv * totalRoi / outstandingDirectCosts) * sign(net)`.
- **Naming & Language**:
  - Use plain language: "factor" (not node), "short name" (not symbol), "uses / used by".
  - Chinese leverage term is 效應比.
  - Every new UI string must go in BOTH `en-us` and `zh-tw` (`src/i18n/*/index.js`). No duplicate keys; avoid `@`, `|`, `{` literals in messages.

## Tech Stack & Architecture
- **App**: Vue 3 (Options API), Quasar 2 (`@quasar/app-vite` 3, PWA mode), Vuex 4 with custom Firestore binder (`src/store/firestore-bind.js`), Firebase JS SDK (modular), `vue-i18n` (legacy mode), D3 graphs.
- **Calculation engine**: `mathjs` 15 in a web worker (`src/workers/calcWorker.js`).
  *Calculations always run on the user's device (never on the server).*
- **Cloud Functions**: `functions/` (Node 22, TypeScript, `firebase-functions` v2):
  `acceptInvitation`, `removeMember`, `setMemberRole`, `setAiSettings`, `disconnectAi`, `setAiManagers`, `draftModel`, `updateExchangeRates`.
- **AI ("Draft my model")**: Organizations bring their own provider (Anthropic via `@anthropic-ai/sdk`, or any OpenAI-compatible endpoint). Keys encrypted with AES-256-GCM (`AI_KEY_ENCRYPTION_KEY`) in `orgSecrets/{orgId}`.

## Security Rules
- Org members via `orgs/{orgId}/members/{uid}`.
- User profiles private; chats member-only.
- Only `superAdmins` change membership.
- Model subcollections other than `nodes` are closed to browsers.

## Dev & Test Commands
```bash
npm run dev                  # Quasar dev server (port 9000)
npm run lint                 # ESLint check
npm test                     # Vitest
npm test --prefix functions  # Cloud functions tests
```
- Emulators (when `useEmulators=true` in `.env`):
  `firebase emulators:start --only auth,firestore,functions --project demo-mipa --import initial-firestore-emulator-data`
