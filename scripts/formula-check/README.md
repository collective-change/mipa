# Formula check (mathjs 8 → 15)

Before deploying the 2026 modernization, run this read-only script against
production. It lists node formulas whose meaning changes under the new mathjs.

The old production calculator used mathjs **8.1.1**; the app now uses **15.2.0**.
The known change: a negative number divided by a number and followed directly
by a symbol or unit is grouped differently.

| Formula     | Old (8.1.1)       | New (15.2.0)       |
|-------------|-------------------|--------------------|
| `-1/2 x`    | `-1 / (2 * x)`    | `(-1 / 2) * x`     |
| `-3/4 USD`  | `-3 / (4 * USD)`  | `(-3 / 4) * USD`   |
| `1/2 x`     | unchanged         | unchanged          |

The script compares the parsed structure of every formula under both versions,
so it also catches any other parsing change, not only this one. It checks both
`symbolFormula` (what users type) and `sysFormula` (what the calculator runs).
It does not detect changes in how built-in functions *evaluate*.

## Run

```bash
cd scripts/formula-check
npm install
gcloud auth application-default login   # or set GOOGLE_APPLICATION_CREDENTIALS
node check.mjs --project <firebase-project-id>
```

Add `--json` for machine-readable output. Exit code is 1 when any formula
changes meaning (or stops/starts parsing), 0 otherwise. To try it on the
emulator, set `FIRESTORE_EMULATOR_HOST=127.0.0.1:5002`.

## Fixing a reported formula

Edit the node in mipa and add parentheses to state the intended meaning, e.g.
`-1 / (2 x)` or `(-1/2) x`. Saving the node regenerates `sysFormula`.

## Tests

```bash
npm test
```
