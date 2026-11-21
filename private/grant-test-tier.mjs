/**
 * Layer 1 Test-Tier Whitelist Grant Script (MIPA-67).
 *
 * Uses the Admin SDK to write existing billing fields (`subscriptionTier`,
 * `seatLimit: 5`, `subscriptionStatus: "test-grant"`) and `[TEST]` name prefix
 * onto explicitly whitelisted orgs without modifying product code or adding bypass flags.
 * Every applied grant is appended to a JSONL access log.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const TEST_PREFIX = "[TEST]";

/**
 * Ensures an organization name carries the `[TEST]` prefix without duplicating it.
 *
 * @param {string} name Existing organization name
 * @returns {string} Prefixed organization name
 */
export function formatTestOrgName(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return TEST_PREFIX;
  if (trimmed.startsWith(TEST_PREFIX)) return trimmed;
  return `${TEST_PREFIX} ${trimmed}`;
}

/**
 * Appends a single audit entry to the JSONL access log.
 *
 * @param {string} accessLogPath Path to JSONL log file
 * @param {Object} entry Serializable audit record
 */
export function appendAccessLog(accessLogPath, entry) {
  if (!accessLogPath || typeof accessLogPath !== "string") {
    throw new Error("accessLogPath must be a non-empty string");
  }
  const dir = path.dirname(accessLogPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(accessLogPath, `${JSON.stringify(entry)}\n`, "utf8");
}

function normalizeWhitelist(whitelist) {
  const items = whitelist instanceof Set ? Array.from(whitelist) : Array.isArray(whitelist) ? whitelist : [];
  return new Set(
    items
      .filter(v => typeof v === "string")
      .map(v => v.trim())
      .filter(Boolean)
  );
}

/**
 * Grants the 5-seat test tier to a whitelisted organization and logs the write.
 *
 * @param {Object} params
 * @param {Object} params.db Firestore Admin SDK instance
 * @param {string} params.orgId Target organization document ID
 * @param {string[]|Set<string>} params.whitelist Explicitly allowed org IDs
 * @param {string} [params.tier="starter"] Subscription tier name
 * @param {number} [params.seatLimit=5] Seat limit to write
 * @param {string} [params.actor="private/grant-test-tier"] Operator identifier
 * @param {string} [params.reason="MIPA-67 test-tier whitelist grant"] Justification recorded in access log
 * @param {string} [params.accessLogPath] JSONL path required when dryRun is false
 * @param {boolean} [params.dryRun=true] When true, previews the update without mutating Firestore
 * @param {Function} [params.now] Clock returning ISO timestamp string
 * @returns {Promise<{ applied: boolean, orgId: string, updates: Object, logEntry: Object }>}
 */
export async function grantTestTierToOrg({
  db,
  orgId,
  whitelist,
  tier = "starter",
  seatLimit = 5,
  actor = "private/grant-test-tier",
  reason = "MIPA-67 test-tier whitelist grant",
  accessLogPath,
  dryRun = true,
  now = () => new Date().toISOString()
}) {
  if (!db || typeof db.doc !== "function") {
    throw new Error("Firestore db instance with doc() is required");
  }
  const allowedOrgs = normalizeWhitelist(whitelist);
  if (typeof orgId !== "string" || !orgId.trim() || !allowedOrgs.has(orgId.trim())) {
    throw new Error(`Org "${orgId}" is not in the test-tier whitelist`);
  }

  const cleanOrgId = orgId.trim();
  const orgRef = db.doc(`orgs/${cleanOrgId}`);
  const snap = await orgRef.get();
  if (!snap.exists) {
    throw new Error(`Org "${cleanOrgId}" does not exist`);
  }

  const current = (typeof snap.data === "function" ? snap.data() : {}) || {};
  const nextName = formatTestOrgName(current.name || cleanOrgId);
  const updates = {
    name: nextName,
    subscriptionTier: tier,
    seatLimit: Number(seatLimit) || 5,
    subscriptionStatus: "test-grant"
  };

  const logEntry = {
    timestamp: now(),
    action: "test-tier-grant",
    actor,
    reason,
    orgId: cleanOrgId,
    dryRun: Boolean(dryRun),
    previous: {
      name: current.name ?? null,
      subscriptionTier: current.subscriptionTier ?? "community",
      seatLimit: current.seatLimit ?? 1,
      subscriptionStatus: current.subscriptionStatus ?? null
    },
    granted: updates
  };

  if (!dryRun) {
    if (!accessLogPath) {
      throw new Error("accessLogPath is required when applying a test-tier grant");
    }
    await orgRef.set(updates, { merge: true });
    appendAccessLog(accessLogPath, logEntry);
  }

  return {
    applied: !dryRun,
    orgId: cleanOrgId,
    updates,
    logEntry
  };
}

function parseCliArgs(argv) {
  const args = {
    whitelist: path.resolve(process.cwd(), "private/whitelist.local.json"),
    accessLog: path.resolve(process.cwd(), "private/access-log.jsonl"),
    orgIds: [],
    all: false,
    apply: false,
    actor: process.env.MIPA_OPERATOR || "private/grant-test-tier",
    reason: "MIPA-67 test-tier whitelist grant",
    projectId: process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || "demo-mipa",
    credentialPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || ""
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--whitelist" && argv[i + 1]) args.whitelist = path.resolve(process.cwd(), argv[++i]);
    else if (arg === "--access-log" && argv[i + 1]) args.accessLog = path.resolve(process.cwd(), argv[++i]);
    else if (arg === "--org" && argv[i + 1]) args.orgIds.push(argv[++i]);
    else if (arg === "--actor" && argv[i + 1]) args.actor = argv[++i];
    else if (arg === "--reason" && argv[i + 1]) args.reason = argv[++i];
    else if (arg === "--project" && argv[i + 1]) args.projectId = argv[++i];
    else if (arg === "--credential" && argv[i + 1]) args.credentialPath = path.resolve(process.cwd(), argv[++i]);
    else if (arg === "--all") args.all = true;
    else if (arg === "--apply") args.apply = true;
  }
  return args;
}

function loadWhitelistFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Whitelist file not found: ${filePath}`);
  }
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.orgIds)) return raw.orgIds;
  throw new Error("Whitelist JSON must be an array of org IDs or { orgIds: string[] }");
}

async function runCli() {
  const args = parseCliArgs(process.argv.slice(2));
  const whitelist = loadWhitelistFile(args.whitelist);
  const targets = args.all ? whitelist : args.orgIds;
  if (!targets.length) {
    throw new Error("Specify --org <orgId> or --all (dry-run by default; add --apply to write)");
  }

  const req = createRequire(path.resolve(process.cwd(), "functions/package.json"));
  const { initializeApp, cert, getApps } = req("firebase-admin/app");
  const { getFirestore } = req("firebase-admin/firestore");

  if (!getApps().length) {
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      initializeApp({ projectId: args.projectId });
    } else if (args.credentialPath && fs.existsSync(args.credentialPath)) {
      const sa = JSON.parse(fs.readFileSync(args.credentialPath, "utf8"));
      initializeApp({ credential: cert(sa), projectId: sa.project_id || args.projectId });
    } else {
      throw new Error(
        "Refusing to initialize without FIRESTORE_EMULATOR_HOST or explicit --credential / GOOGLE_APPLICATION_CREDENTIALS"
      );
    }
  }

  const db = getFirestore();
  for (const orgId of targets) {
    const res = await grantTestTierToOrg({
      db,
      orgId,
      whitelist,
      actor: args.actor,
      reason: args.reason,
      accessLogPath: args.accessLog,
      dryRun: !args.apply
    });
    console.log(JSON.stringify(res));
  }
}

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  runCli().catch(err => {
    console.error("grant-test-tier error:", err.message);
    process.exit(1);
  });
}
