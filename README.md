# Longecho

![Node.js CI](https://github.com/collective-change/mipa/workflows/Node.js%20CI/badge.svg)

Longecho is strategic coordination software to help humanity achieve sustainability, stewarded by [collective-change.org](https://collective-change.org).

Collective Change provides the organizational and open-governance foundation, while Longecho is the strategic dynamics product. It helps organizations coordinate their activities, considering both organizational targets and the welfare of the wider world. Through helping businesses and non-profits succeed while transitioning to a sustainable economy, we hope to catalyze the urgent change needed to stop climate change before global warming reaches tipping point.

For more information, please check out 
* https://collective-change.org -- canonical production deployment
* https://mipa.collective-change.org -- alternate production URL
* https://github.com/collective-change/mipa/wiki -- the wiki for developers

## Development

Requires Node.js 22.22+ and the [Firebase CLI](https://firebase.google.com/docs/cli).

```bash
npm install                 # also installs src-pwa dependencies on first build
cp .env_sample .env         # fill in your Firebase web app config
npm run dev                 # dev server (SPA); npm run dev:pwa for PWA mode
npm run lint
npm test                    # Vitest unit tests
npm run build               # production PWA build -> dist/pwa
```

To develop against local emulators instead of a real Firebase project, set
`useEmulators=true` in `.env` and run:

```bash
firebase emulators:start --only auth,firestore --project demo-mipa \
  --import initial-firestore-emulator-data
```

Cloud Functions live in `functions/` (Node 22, TypeScript). Configure them with
`functions/.env` (see `.env.example`) and the `FIXER_IO_ACCESS_KEY` secret
(`firebase functions:secrets:set FIXER_IO_ACCESS_KEY`).

To try AI drafting locally, build the functions (`cd functions && npm run
build`), add `AI_KEY_ENCRYPTION_KEY=<openssl rand -base64 32>` to
`functions/.secret.local` (not committed), and start the emulators with
`functions` too. In the emulator only, an OpenAI-compatible endpoint may be a
mock server on `http://127.0.0.1`; deployed functions accept https only.

## Deploying

The live app is a Firebase project: Hosting serves `dist/pwa`, plus Firestore
rules and indexes, a scheduled Cloud Function (`updateExchangeRates`) and
callable functions for membership and AI drafting.
Cloud Functions need the project on the Blaze plan.

### First deploy of the 2026 version

The simplest way is the **Production setup** workflow (Actions tab > Production
setup > Run workflow), after setting the repository secret and variables
listed under "Automatic deploys" below:

1. Run it with mode `check`. It changes nothing: it lists the project's Cloud
   Functions and secrets, the formulas whose meaning changes under the new
   mathjs version, and which members it would copy.
2. If the project has no `FIXER_IO_ACCESS_KEY` secret yet, add the fixer.io
   key as a repository secret with that name.
3. Run it with mode `migrate`. It creates missing secrets (generating
   `AI_KEY_ENCRYPTION_KEY` itself), deletes the old 1st-generation
   `updateExchangeRates`, runs lint, tests and the build, deploys, and copies
   members into each organization's member list.

After that, every push to `master` deploys through `deploy.yml`.

**Master is the only integration branch, and merging to it is a production event.**
Since 2026-11-18 the intermediate `modernize-2026` branch is gone: work branches off
`master`, pull requests target `master`, and the merge itself ships. This is deliberate -
continuous deployment, chosen by the maintainer on 2026-11-18 - so treat a merge to
`master` as a release, not as bookkeeping. A red Deploy run on `master` means production
did **not** move.

The same steps by hand, for a project owner with the Firebase CLI:

1. Merge into `master` and check it out. Create `.env` from `.env_sample` with
   the production web app config (Firebase console > Project settings > Your
   apps) and `useEmulators=false`.
2. Create `functions/.env` from `functions/.env.example`. The values the old
   deployment used are shown by `firebase functions:config:get`.
3. Store the exchange-rate API key: `firebase functions:secrets:set FIXER_IO_ACCESS_KEY`.
   Create the key that encrypts organizations' AI provider keys (32 random
   bytes; keep it, because changing it makes stored provider keys unreadable
   and organizations would have to reconnect):
   `openssl rand -base64 32 | firebase functions:secrets:set AI_KEY_ENCRYPTION_KEY --data-file -`
4. Delete the old 1st-generation function once; Firebase can't convert it to
   2nd generation in place (use the region from step 2):
   `firebase functions:delete updateExchangeRates --region us-central1`
5. Build and deploy:

   ```bash
   npm ci && npm run build
   firebase use <project-id>
   firebase hosting:channel:deploy preview --expires 7d   # optional preview URL (uses live data)
   firebase deploy --only firestore:rules,firestore:indexes,functions,hosting
   ```

6. Right after the deploy, copy members' names and emails into each
   organization's member list. User profiles are now private to each user,
   and members see each other through `orgs/{orgId}/members`:

   ```bash
   cd scripts/backfill-org-members && npm install
   node backfill.mjs --project <project-id>
   ```

Browsers that still have the old app installed pick up the new one by
themselves: `public/service-worker.js` replaces the old service worker,
clears its caches and reloads the tab.

### Automatic deploys

`.github/workflows/deploy.yml` deploys **every push to `master`** - the merge
*is* the release, with no separate release step (continuous deployment, 2026-11-18) - and
can also be run by hand from the Actions tab. It runs lint and the build first, and skips
the deploy until these are set in the repository settings
(Settings > Secrets and variables > Actions):

The unit suite is **not** run by this workflow: it has no emulator and no Java, so the
emulator-backed specs (`stakeholderViewerRules.spec.js` and friends) cannot run in it. The
full suite gates every pull request in `node.js.yml`, and `master` only moves through a
green pull request. Restoring the suite here *properly* is MIPA-48 - it must not simply be
wrapped in `emulators:exec`, because the step above writes the production `.env` into the
repository and an emulator environment leaking into the build would ship a production
build pointing at the emulators.

- Secret `FIREBASE_SERVICE_ACCOUNT`: a JSON key for a service account in the
  Firebase project (Google Cloud console > IAM > Service accounts). It needs
  permission to deploy Hosting, Firestore rules and indexes, and 2nd-gen
  Cloud Functions with a secret and a schedule: grant it *Editor*,
  *Service Account User*, *Secret Manager Admin*, *Cloud Functions Admin*
  and *Cloud Run Admin* (the last two let the deploy make callable
  functions reachable from the app). If a deploy fails with a permission
  error, the log names the missing permission.
- In projects created or updated since 2024, Cloud Build runs as the
  default compute service account (`<project number>-compute@developer.gserviceaccount.com`).
  Grant it *Cloud Build Service Account*, or building functions fails with
  "missing permission on the build service account".
- Variable `APP_ENV_FILE`: the full contents of the production `.env`. Its
  `projectId` is the project deployed to. (This config is public: it ships
  in the app.)
- Variable `FUNCTIONS_ENV_FILE` (optional): contents of `functions/.env`.

Deploys run in the `production` environment, so an owner can require an
approval before each deploy (Settings > Environments > production).

## Decision Register Backups & Permanence (MIPA-34)

Longecho's decision register records are **permanent, citable, versioned, and not erasable** (Decisions M-1, M-6).
- **Scheduled Exports**: Managed Firestore export runs daily at 03:00 UTC via `scheduledFirestoreBackup` Cloud Function.
- **Retention Tiers**: 30-day operational rolling recovery (GCS Standard), 1-year monthly archives (GCS Coldline), and 7-year statutory audit retention (GCS Archive).
- **Restore Verification**: Exercise and verify backup restore drills using `node scripts/restore-drill.js`.
- Details, disaster recovery runbook, and margin guard unit economics are documented in [`docs/REGISTER-PERMANENCE.md`](file:///docs/REGISTER-PERMANENCE.md).

Stack: Vue 3, Quasar 2 (Vite), Vuex 4, Firebase JS SDK (modular), mathjs, D3.

This program is released under GNU Affero General Public License v3.0
