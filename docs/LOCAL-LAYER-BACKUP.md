# Local-Only Layer Backup & Disaster Recovery Architecture

<!-- MIPA-42: Local-only layer backup mechanism, restore drill, recurrence prevention, and private destination governance -->

## 1. Executive Summary & Problem Context

The core strategic thinking, decisions of record (**M-1** through **M-9**), agent memory, and operational history of Mipa reside in a **local-only layer**:

1. **Strategic Paper Trail (9 documents)**:
   - `docs/BACKLOG.md` (the task queue)
   - `docs/BACKLOG-business.md` (the decisions of record M-1..M-9)
   - `docs/BACKLOG-business-plan.md`
   - `docs/BACKLOG-roadmap.md`
   - `docs/BACKLOG-world-model.md` (Layers 1-5c)
   - `docs/BACKLOG-naming.md`
   - `docs/BACKLOG-meeting.md`
   - `docs/BACKLOG-business-daily.md`
   - `docs/BACKLOG-a10-entity-and-tax.md`
2. **Hermes Agent Subsystem**:
   - `AppData/Local/hermes/SOUL.md` (core agent constitution)
   - `AppData/Local/hermes/shift-dispatched.json` (autonomous shift ledger)
   - `AppData/Local/hermes/memories/` & `notes/` (institutional context)
   - `AppData/Local/hermes/skills/` (agent tooling)
   - `AppData/Local/hermes/cron/` (scheduled operations)
3. **Todo-Board Subsystem**:
   - `todo-board/inbox.jsonl` (shared operational history)
   - `todo-board/overrides.json`

### The Core Vulnerability (GATE 0 / S-1b)
The motive for `.gitignore` was sound: **keep proprietary strategic analysis, business models, and private notes off the public repository**. However, because gitignored files are not in git, **this entire institutional paper trail existed on only one physical disk**. While Firestore data has geo-redundant GCS backup protection (**MIPA-34**), the reasoning behind the product had zero backup. A hardware failure would erase the record of why the product was built the way it is.

**MIPA-42** resolves this vulnerability by establishing:
- A standardized, automated backup engine (`scripts/backup-local-layer.js`).
- Cryptographic SHA-256 manifests ensuring tamper-evident provenance.
- Strict security boundaries guaranteeing **zero credential or secret leakage**.
- An automated restore drill CLI (`scripts/restore-drill-local-layer.js`) verifying 100% byte-for-byte data fidelity.
- A standing governance rule preventing recurrence.

---

## 2. Architecture & Security Invariants

### Zero-Credential Exclusion Filter
Before any file is backed up or staged, it is evaluated against strict security patterns:
- `.env*` and `.env.local`
- `private/` directories and keys
- `*secret*`, `*token*`, and credential files
- `*service-account*.json` and `*-firebase-adminsdk-*.json`
- SQLite locks and write-ahead logs (`*.lock`, `*.db-shm`, `*.db-wal`)
- `ops-private.md`
- `.git/` metadata and `node_modules/`

Any candidate file matching these patterns is immediately rejected by `isExcludedPath()`.

### Manifest & Cryptographic Provenance
Every backup creates a canonical `manifest.json` recording:
```json
{
  "version": "1.0.0",
  "backupId": "local-layer-backup-2026-11-20T...",
  "createdAt": "2026-11-20T05:27:08.758Z",
  "gitCommit": "770a401...",
  "totalFiles": 841,
  "totalBytes": 7383552,
  "manifestSha256": "3a8f...",
  "files": [
    {
      "logicalPath": "mipa/docs/BACKLOG-business.md",
      "size": 93635,
      "sha256": "4b9e...",
      "mtime": "2026-11-18T12:19:00.000Z",
      "category": "docs"
    }
  ]
}
```

---

## 3. Restore Drill Verification

> *"An export that has never been restored is not a backup."*

The restore drill (`scripts/restore-drill-local-layer.js`) verifies data integrity and safety end-to-end:
1. **Discovery**: Verifies that all 9 `docs/BACKLOG*.md` files plus Hermes and Todo-board assets are identified.
2. **Safety**: Injects simulated `.env` files, API tokens, and private RSA keys, and asserts that the exclusion filter rejects 100% of them.
3. **Packaging**: Creates a backup snapshot with a SHA-256 manifest.
4. **Validation**: Validates the manifest against the backed-up files.
5. **Restoration**: Restores all files to an isolated directory.
6. **Byte-for-Byte Fidelity**: Asserts that every restored file matches the original source byte-for-byte with identical SHA-256 checksums.

### Empirical Drill Results (Observed)
- **Execution Command**: `node scripts/restore-drill-local-layer.js`
- **Elapsed Duration**: 548ms
- **Files Tested**: 15 (simulated layer) / 841 (live dry run)
- **Integrity Result**: **PASS (100% Byte-for-Byte Fidelity)**
- **Leakage Result**: **PASS (0 Secrets or Keys Included)**

---

## 4. Standing Rule Preventing Recurrence

To ensure new strategic documents or private assets never fall outside backup coverage:
1. **Creation Rule**: Whenever a new gitignored file or business document is created, its logical path must be registered in `scripts/backup-local-layer.js` in the same act as its creation.
2. **Gitignore Contract**: Any entry added to `.gitignore` must carry a comment explaining where the file is stored and how it is backed up.
3. **Public Repo Prohibition**: Private strategic assets, backlog business documents, and local backup output archives (`backups/`, `local-layer-backups/`) must **never** be added or pushed to the public repository `github.com/collective-change/mipa`.

---

## 5. Operational Status & Blocked Remote Destination

### Current State:
- Backup mechanism: **BUILT & TESTED** (`scripts/backup-local-layer.js`).
- Restore drill: **BUILT & TESTED** (`scripts/restore-drill-local-layer.js`).
- Vitest suite: **8/8 PASSING** (`test/unit/backupLocalLayer.spec.js`).
- Local gitignore rules: **STRENGTHENED & COMMITTED** (protects public repo).

### Pending External Action (BLOCKED):
- **Remote Private Repository**: The private backup destination (e.g. `github.com/collective-change/mipa-private` or private cloud storage bucket) has not yet been provisioned by Ted / Xin.
- **Next Step**: Once Ted or Xin creates the private repository and authenticates it on this workstation, `scripts/backup-local-layer.js` can be configured to push directly to the private remote (`git push private master`). Until then, backups are staged to local secured storage (e.g. `Dropbox/mipa/local-layer-backups` or `AppData/Local/hermes/backups/local-layer`).
