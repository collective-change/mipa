# Developer test helpers

Scripts used during development to check mipa against the local Firebase
emulators. They are not part of CI. Screenshots and logs go to
`scripts/dev/shots/` (git-ignored).

## Prerequisites

```bash
# emulators (demo project, seeded data)
(cd functions && npm run build)
firebase emulators:start --only auth,firestore,functions --project demo-mipa \
  --import initial-firestore-emulator-data
# app against the emulators: useEmulators=true in .env
npm run dev            # http://localhost:9000
```

If an HTTP(S) proxy is configured, set `NO_PROXY=localhost,127.0.0.1` for both
the emulators and these scripts. For the functions emulator, put
`AI_KEY_ENCRYPTION_KEY=<openssl rand -base64 32>` in `functions/.secret.local`.
Walkthroughs use Playwright with Chromium (`require("playwright")`).
Each walkthrough signs in as the email you pass; create that account first in the
Auth emulator (`accounts:signUp`, password `correct-horse-42`).

## Security rules and functions (emulators only)

| Script | Checks |
|---|---|
| `rules-test.cjs` | Members, private profiles, chats (14 allow/deny cases) |
| `rules-ai-test.cjs` | Models, nodes, `aiDrafts`, `orgAiSettings`, `orgSecrets` (13 cases) |
| `members-functions-test.cjs` | Invitations, accepting, removing, roles, last-admin rule, model access (25 cases; needs the functions emulator) |

```bash
node scripts/dev/rules-test.cjs
```

## UI walkthroughs (emulators + dev server)

| Script | Walks through |
|---|---|
| `walkthrough-sample-org.cjs <email> [locale]` | Create the sample organization, calculate, recalculate actions |
| `walkthrough-role-costs.cjs <email> [locale]` | Hourly-cost menu on an action, adding a role's hourly cost |
| `walkthrough-ai-draft.cjs <email>` | Add an organization, connect the fake AI provider, draft with questions, automatic repair, ask for changes, add and remove the draft (start `fake-ai-provider.cjs` first) |
| `walkthrough-ai-draft-zh.cjs <email>` | The draft dialog in Chinese (needs an organization with a provider connected) |
| `lib.cjs` | Shared helpers (sign in as the seeded `alex@example.org`, screenshots) |

## Fake AI provider

`fake-ai-provider.cjs` is an OpenAI-compatible server on `http://127.0.0.1:8787/v1`
that asks two questions, returns a draft with a deliberate unit mistake, fixes it
when given the calculation error, and adds solar panels when asked. It logs what it
received to `shots/fake-ai-log.json`. The functions emulator accepts this http
address; deployed functions accept https only.

```bash
node scripts/dev/fake-ai-provider.cjs
```

## Other

- `i18n-duplicate-keys.mjs`: counts keys in `src/i18n/{en-us,zh-tw}` and lists duplicates.
