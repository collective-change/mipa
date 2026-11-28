/**
 * Ops Issue Store Provisioning, Idempotence & Verification CLI (todo281, step 1B)
 *
 * Commands:
 *   node scripts/provision-ops-store.mjs counts [--project <id>] [--credential <path>]
 *   node scripts/provision-ops-store.mjs provision [--apply] [--project <id>] [--credential <path>]
 *   node scripts/provision-ops-store.mjs poll [--since <sha>] [--project <id>] [--credential <path>]
 *   node scripts/provision-ops-store.mjs verify-client-denial [--project <id>] [--env <path>]
 *
 * Security & Privacy Invariants:
 * - Never prints credentials, API keys, service account private keys, UIDs, or email addresses.
 * - `provision` is non-destructive and idempotent: running `--apply` twice with no intervening
 *   store changes writes 0 documents and leaves all counts and digest_sha identical.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

function parseEnvFile(envPath) {
  const out = {};
  if (!envPath || !fs.existsSync(envPath)) return out;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    out[key] = val;
  }
  return out;
}

export function parseArgs(argv) {
  const args = {
    command: argv[0] || "counts",
    projectId: process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || "",
    credentialPath:
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      path.join(REPO_ROOT, "service-account.json"),
    envPath: path.join(REPO_ROOT, ".env"),
    apply: false,
    sinceSha: ""
  };

  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project" && argv[i + 1]) args.projectId = argv[++i];
    else if (a === "--credential" && argv[i + 1]) args.credentialPath = path.resolve(argv[++i]);
    else if (a === "--env" && argv[i + 1]) args.envPath = path.resolve(argv[++i]);
    else if (a === "--since" && argv[i + 1]) args.sinceSha = argv[++i];
    else if (a === "--apply") args.apply = true;
  }
  return args;
}

async function loadCompiledOpsModule() {
  const compiledPath = path.join(REPO_ROOT, "functions", "lib", "ops", "opsStoreManager.js");
  if (!fs.existsSync(compiledPath)) {
    throw new Error(
      `Compiled opsStoreManager not found at ${compiledPath}. Run 'npm --prefix functions run build' first.`
    );
  }
  return import(pathToFileURL(compiledPath).href);
}

function initAdminFirestore(args) {
  const req = createRequire(path.join(REPO_ROOT, "functions", "package.json"));
  const { initializeApp, cert, getApps } = req("firebase-admin/app");
  const { getFirestore } = req("firebase-admin/firestore");

  if (!getApps().length) {
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      initializeApp({ projectId: args.projectId || "demo-mipa" });
    } else if (args.credentialPath && fs.existsSync(args.credentialPath)) {
      const sa = JSON.parse(fs.readFileSync(args.credentialPath, "utf8"));
      initializeApp({
        credential: cert(sa),
        projectId: args.projectId || sa.project_id
      });
    } else {
      throw new Error(
        "Refusing to initialize Admin SDK without FIRESTORE_EMULATOR_HOST or valid --credential."
      );
    }
  }
  return getFirestore();
}

/**
 * Wraps a Firestore instance to count exact single-document vs collection reads.
 */
export function instrumentFirestoreReadCounter(db) {
  const metrics = {
    docGets: 0,
    collectionQueries: 0,
    pathsRead: []
  };
  const instrumented = {
    doc(docPath) {
      const realDoc = db.doc(docPath);
      return {
        get: async (...rest) => {
          metrics.docGets += 1;
          metrics.pathsRead.push(docPath);
          return realDoc.get(...rest);
        }
      };
    },
    collection(colPath) {
      const realCol = db.collection(colPath);
      return new Proxy(realCol, {
        get(target, prop) {
          if (prop === "get") {
            return async (...rest) => {
              metrics.collectionQueries += 1;
              metrics.pathsRead.push(`${colPath}/*`);
              return target.get(...rest);
            };
          }
          const val = target[prop];
          return typeof val === "function" ? val.bind(target) : val;
        }
      });
    }
  };
  return { db: instrumented, metrics };
}

async function runVerifyClientDenial(args) {
  const envVars = parseEnvFile(args.envPath);
  const projectId = args.projectId || envVars.projectId || "mipa-2";
  const apiKey = envVars.apiKey || "demo-api-key";

  const { initializeApp, deleteApp } = await import("firebase/app");
  const {
    getFirestore,
    connectFirestoreEmulator,
    doc,
    setDoc,
    terminate
  } = await import("firebase/firestore");

  const appName = `ops-denial-probe-${Date.now()}`;
  const app = initializeApp({ apiKey, projectId }, appName);
  const clientDb = getFirestore(app);

  if (process.env.FIRESTORE_EMULATOR_HOST) {
    const [host, portStr] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
    connectFirestoreEmulator(clientDb, host, Number(portStr || 5002));
  }

  const probePath = "ops/items/all/todo281_unauth_denial_probe";
  try {
    await setDoc(doc(clientDb, probePath), {
      code: "todo281_unauth_denial_probe",
      attempted_at: new Date().toISOString()
    });
    console.error(
      JSON.stringify({
        ok: false,
        error: "SECURITY FAILURE: unauthenticated write unexpectedly succeeded!",
        projectId,
        probePath
      })
    );
    process.exitCode = 1;
  } catch (err) {
    const errorCode = String(err?.code || "unknown");
    const isPermissionDenied = errorCode.includes("permission-denied");
    const payload = {
      ok: isPermissionDenied,
      denied: isPermissionDenied,
      projectId,
      auth: "unauthenticated",
      probePath,
      errorName: err?.name || "Error",
      errorCode,
      errorMessage: String(err?.message || err)
    };
    if (isPermissionDenied) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.error(JSON.stringify(payload, null, 2));
      process.exitCode = 1;
    }
  } finally {
    await terminate(clientDb).catch(() => {});
    await deleteApp(app).catch(() => {});
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === "verify-client-denial") {
    await runVerifyClientDenial(args);
    return;
  }

  const ops = await loadCompiledOpsModule();
  const db = initAdminFirestore(args);

  if (args.command === "counts") {
    const counts = await ops.readBackOpsCounts(db);
    console.log(JSON.stringify(counts, null, 2));
    return;
  }

  if (args.command === "provision") {
    const result = await ops.provisionOpsStore(db, {
      actor: "cli:provision-ops-store",
      dryRun: !args.apply
    });
    // Strip raw by_marker/by_stage/by_lane maps? No, those are pure integer card counts (no PII).
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.command === "poll") {
    const { db: countedDb, metrics } = instrumentFirestoreReadCounter(db);
    const pollRes = await ops.pollOpsDigest(countedDb, args.sinceSha || undefined);
    console.log(
      JSON.stringify(
        {
          exists: pollRes.exists,
          changed: pollRes.changed,
          readsIssued: pollRes.readsIssued,
          measuredFirestoreReads: {
            docGets: metrics.docGets,
            collectionQueries: metrics.collectionQueries,
            pathsRead: metrics.pathsRead
          },
          digest_sha: pollRes.digest?.digest_sha ?? null,
          revision: pollRes.digest?.revision ?? null,
          counts: pollRes.digest?.counts ?? null
        },
        null,
        2
      )
    );
    return;
  }

  throw new Error(`Unknown command "${args.command}". Expected: counts | provision | poll | verify-client-denial`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  main().catch((err) => {
    console.error("provision-ops-store error:", err?.message || err);
    process.exit(1);
  });
}
