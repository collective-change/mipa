# Factor Symbol Migration (Chinese / non-ASCII -> Meaningful English)

Migrates factor symbols from non-ASCII/Chinese characters to clean, meaningful English ASCII camelCase short names, while preserving human-readable factor names in Chinese.

## What this does
1. Scans Firestore models for factors whose `symbol` contains non-ASCII characters.
2. Maps each factor's symbol to a meaningful English domain term (or uses an explicit mapping from `mappings.json`).
3. Renames the factor `symbol` and updates its `symbolFormula`.
4. Safely updates any referring `symbolFormula`s throughout the model using Unicode-aware identifier boundaries (without touching `sysFormula`, which uses internal `$nodeId` and already calculates correctly).

## Usage

### 1. Dry Run (read-only)
Inspect what would change without modifying Firestore:
```bash
cd scripts/fix-chinese-symbols
npm install
node migrate.mjs --project mipa-2
```

### 2. Export Mappings for Review
Dump proposed English names to a JSON file to inspect or customize:
```bash
node migrate.mjs --project mipa-2 --dump-mappings proposed-mappings.json
```

If you want to customize any proposed English name, edit `mappings.json` (or pass `--mappings <path>`):
```json
{
  "nodeIdOrChineseSymbol": "customEnglishSymbol"
}
```

### 3. Apply Migration
Apply the updates to Firestore:
```bash
node migrate.mjs --project mipa-2 --apply
```

Credentials:
- Local: Run `gcloud auth application-default login` or set `GOOGLE_APPLICATION_CREDENTIALS`.
- Emulator: Set `FIRESTORE_EMULATOR_HOST=127.0.0.1:5002`.

## Tests

```bash
npm test
```
