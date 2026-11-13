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

Stack: Vue 3, Quasar 2 (Vite), Vuex 4, Firebase JS SDK (modular), mathjs, D3.

This program is released under GNU Affero General Public License v3.0
