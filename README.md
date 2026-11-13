# mipa

![Node.js CI](https://github.com/collective-change/mipa/workflows/Node.js%20CI/badge.svg)

Mipa is strategic coordination software to help humanity achieve sustainability. 

The name comes from the first letters of Model, Ideate, Prioritize, and Achieve, the four activity types that an organization shuold do to reach its goal. This software helps an organization coordinate these activities, considering both organizational targets and welfare of the wider world. Through helping businesses succeed while transitioning to a sustainable economy, we hope to catalyze the urgent change needed to stop climate change before global warming reaches tipping point.

For more information, please check out 
* https://collective-change.org -- the citizens' effort driving the development of mipa
* https://mipa.collective-change.org -- the production instance of mipa
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

## Deploying

The live app is a Firebase project: Hosting serves `dist/pwa`, plus Firestore
rules and indexes and one scheduled Cloud Function (`updateExchangeRates`).
Cloud Functions need the project on the Blaze plan.

### First deploy of the 2026 version (manual, by a project owner)

1. Merge into `master` and check it out. Create `.env` from `.env_sample` with
   the production web app config (Firebase console > Project settings > Your
   apps) and `useEmulators=false`.
2. Create `functions/.env` from `functions/.env.example`. The values the old
   deployment used are shown by `firebase functions:config:get`.
3. Store the exchange-rate API key: `firebase functions:secrets:set FIXER_IO_ACCESS_KEY`.
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

Browsers that still have the old app installed pick up the new one by
themselves: `public/service-worker.js` replaces the old service worker,
clears its caches and reloads the tab.

### Automatic deploys

`.github/workflows/deploy.yml` deploys every push to `master` (and can be run
by hand from the Actions tab). It runs lint, tests and the build first, and
skips the deploy until these are set in the repository settings
(Settings > Secrets and variables > Actions):

- Secret `FIREBASE_SERVICE_ACCOUNT`: a JSON key for a service account in the
  Firebase project (Google Cloud console > IAM > Service accounts). It needs
  permission to deploy Hosting, Firestore rules and indexes, and 2nd-gen
  Cloud Functions with a secret and a schedule. Granting it *Editor* and
  *Secret Manager Admin* is the simple option; if a deploy fails with a
  permission error, the log names the missing permission.
- Variable `APP_ENV_FILE`: the full contents of the production `.env`. Its
  `projectId` is the project deployed to. (This config is public: it ships
  in the app.)
- Variable `FUNCTIONS_ENV_FILE` (optional): contents of `functions/.env`.

Deploys run in the `production` environment, so an owner can require an
approval before each deploy (Settings > Environments > production).

Stack: Vue 3, Quasar 2 (Vite), Vuex 4, Firebase JS SDK (modular), mathjs, D3.

This program is released under GNU Affero General Public License v3.0
