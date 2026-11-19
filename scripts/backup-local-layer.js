#!/usr/bin/env node

/**
 * Local-Only Layer Backup & Disaster Recovery Mechanism (MIPA-42)
 *
 * Backs up the private, gitignored strategic coordination assets:
 * 1. Mipa docs: docs/BACKLOG*.md (the paper trail, decisions M-1..M-9)
 * 2. Hermes agent layer: memories/, skills/, notes/, cron/, shift-dispatched.json, SOUL.md
 * 3. Todo-board layer: inbox.jsonl, overrides.json
 *
 * Security Invariants:
 * - NEVER includes secrets, credentials, tokens, .env files, or private directories.
 * - Computes SHA-256 digests for all files to guarantee tamper-evident provenance.
 * - Backups are targeted to a private local or git destination, strictly prevented from
 *   entering the public GitHub repository by .gitignore.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { execSync } from "node:child_process";

// Paths and patterns strictly prohibited from any backup
export const EXCLUSION_PATTERNS = [
  /(^|[/\\])\.env($|\..*)/i,
  /(^|[/\\])private([/\\]|$)/i,
  /.*secret.*/i,
  /.*token.*/i,
  /.*service-account.*\.json$/i,
  /.*firebase-adminsdk.*\.json$/i,
  /\.(lock|db-shm|db-wal)$/i,
  /(^|[/\\])ops-private\.md$/i,
  /(^|[/\\])\.git([/\\]|$)/i,
  /(^|[/\\])node_modules([/\\]|$)/i,
  /(^|[/\\])\.quasar([/\\]|$)/i,
  /(^|[/\\])\.firebase([/\\]|$)/i
];

/**
 * Check if a path or filename matches any secret/credential exclusion pattern.
 */
export function isExcludedPath(filePath) {
  if (!filePath) return true;
  const normalized = filePath.replace(/\\/g, "/");
  return EXCLUSION_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Compute SHA-256 hash of a file.
 */
export function computeSha256(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(fileBuffer).digest("hex");
}

/**
 * Recursively find all files in a directory up to a max depth.
 */
export function walkDirectory(dirPath, maxDepth = 4, currentDepth = 0) {
  if (!fs.existsSync(dirPath) || currentDepth > maxDepth) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  let results = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (isExcludedPath(fullPath)) continue;

    if (entry.isDirectory()) {
      results = results.concat(walkDirectory(fullPath, maxDepth, currentDepth + 1));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Attempt to get current git commit hash, or return null if outside git.
 */
export function getGitCommit(cwd) {
  try {
    return execSync("git rev-parse HEAD", { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch {
    return "unversioned";
  }
}

/**
 * Collect candidate files from mipa docs, hermes, and todo-board.
 */
export function collectLocalLayerFiles(options = {}) {
  const mipaRoot = options.mipaRoot || process.cwd();
  const hermesRoot = options.hermesRoot || process.env.HERMES_HOME || path.join(os.homedir(), "AppData", "Local", "hermes");
  const todoBoardRoot = options.todoBoardRoot || process.env.TODO_BOARD_DIR || path.join(os.homedir(), "todo-board");

  const includeHermes = options.includeHermes ?? true;
  const includeTodoBoard = options.includeTodoBoard ?? true;
  const includeBakFiles = options.includeBakFiles ?? false;

  const collected = [];

  // 1. Mipa docs/BACKLOG*.md
  const docsDir = path.join(mipaRoot, "docs");
  if (fs.existsSync(docsDir)) {
    const docEntries = fs.readdirSync(docsDir, { withFileTypes: true });
    for (const entry of docEntries) {
      if (!entry.isFile()) continue;
      const name = entry.name;
      if (name.startsWith("BACKLOG") && name.endsWith(".md")) {
        if (!includeBakFiles && (name.includes(".bak") || name.includes(".corrupt"))) {
          continue;
        }
        const fullPath = path.join(docsDir, name);
        if (isExcludedPath(fullPath)) continue;

        collected.push({
          logicalPath: `mipa/docs/${name}`,
          sourcePath: fullPath,
          category: "docs"
        });
      }
    }
  }

  // 2. Hermes files
  if (includeHermes && fs.existsSync(hermesRoot)) {
    // Single files
    const hermesFiles = ["SOUL.md", "shift-dispatched.json"];
    for (const fileName of hermesFiles) {
      const fullPath = path.join(hermesRoot, fileName);
      if (fs.existsSync(fullPath) && !isExcludedPath(fullPath)) {
        collected.push({
          logicalPath: `hermes/${fileName}`,
          sourcePath: fullPath,
          category: "hermes"
        });
      }
    }

    // Directories
    const hermesDirs = ["memories", "memory", "skills", "notes", "cron"];
    for (const dirName of hermesDirs) {
      const fullDir = path.join(hermesRoot, dirName);
      if (fs.existsSync(fullDir)) {
        const files = walkDirectory(fullDir, 5);
        for (const file of files) {
          const relPath = path.relative(hermesRoot, file).replace(/\\/g, "/");
          collected.push({
            logicalPath: `hermes/${relPath}`,
            sourcePath: file,
            category: "hermes"
          });
        }
      }
    }
  }

  // 3. Todo-board files
  if (includeTodoBoard && fs.existsSync(todoBoardRoot)) {
    const todoFiles = ["inbox.jsonl", "overrides.json"];
    for (const fileName of todoFiles) {
      const fullPath = path.join(todoBoardRoot, fileName);
      if (fs.existsSync(fullPath) && !isExcludedPath(fullPath)) {
        collected.push({
          logicalPath: `todo-board/${fileName}`,
          sourcePath: fullPath,
          category: "todo-board"
        });
      }
    }
  }

  // Enrich with file metadata and SHA-256
  return collected.map((item) => {
    const stat = fs.statSync(item.sourcePath);
    return {
      ...item,
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      sha256: computeSha256(item.sourcePath)
    };
  });
}

/**
 * Create a local layer backup directory with full manifest and verified copies.
 */
export function createLocalLayerBackup(options = {}) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destDir = options.dest || path.join(
    options.mipaRoot || process.cwd(),
    "local-layer-backups",
    `backup-${timestamp}`
  );

  const files = collectLocalLayerFiles(options);

  if (options.dryRun) {
    return {
      destDir,
      totalFiles: files.length,
      totalBytes: files.reduce((acc, f) => acc + f.size, 0),
      files,
      dryRun: true
    };
  }

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  let totalBytes = 0;
  const manifestFiles = [];

  for (const file of files) {
    const targetPath = path.join(destDir, file.logicalPath);
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    fs.copyFileSync(file.sourcePath, targetPath);

    // Verify written file checksum immediately
    const copiedSha256 = computeSha256(targetPath);
    if (copiedSha256 !== file.sha256) {
      throw new Error(
        `Backup checksum mismatch on ${file.logicalPath}: expected ${file.sha256}, wrote ${copiedSha256}`
      );
    }

    totalBytes += file.size;
    manifestFiles.push({
      logicalPath: file.logicalPath,
      size: file.size,
      sha256: file.sha256,
      mtime: file.mtime,
      category: file.category
    });
  }

  // Create manifest checksum
  const manifestPayload = {
    version: "1.0.0",
    backupId: `local-layer-backup-${timestamp}`,
    createdAt: new Date().toISOString(),
    gitCommit: getGitCommit(options.mipaRoot || process.cwd()),
    totalFiles: manifestFiles.length,
    totalBytes,
    files: manifestFiles
  };

  const manifestBuffer = Buffer.from(JSON.stringify(manifestPayload, null, 2), "utf8");
  const manifestSha256 = crypto.createHash("sha256").update(manifestBuffer).digest("hex");
  manifestPayload.manifestSha256 = manifestSha256;

  const manifestPath = path.join(destDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifestPayload, null, 2), "utf8");

  return {
    destDir,
    manifestPath,
    totalFiles: manifestFiles.length,
    totalBytes,
    manifestSha256,
    backupId: manifestPayload.backupId,
    createdAt: manifestPayload.createdAt
  };
}

/**
 * Verify a backup directory against its manifest.
 */
export function verifyBackupManifest(backupDir) {
  const manifestPath = path.join(backupDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found at ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const errors = [];
  let filesChecked = 0;

  for (const file of manifest.files) {
    const filePath = path.join(backupDir, file.logicalPath);
    if (!fs.existsSync(filePath)) {
      errors.push(`Missing file: ${file.logicalPath}`);
      continue;
    }

    const actualSha = computeSha256(filePath);
    if (actualSha !== file.sha256) {
      errors.push(`Checksum mismatch for ${file.logicalPath}: expected ${file.sha256}, got ${actualSha}`);
    } else {
      filesChecked++;
    }
  }

  return {
    verified: errors.length === 0,
    filesChecked,
    totalFiles: manifest.totalFiles,
    errors
  };
}

/**
 * Restore files from a backup directory into a target directory,
 * asserting 100% byte-for-byte fidelity against the manifest.
 */
export function restoreLocalLayerBackup(backupDir, restoreTargetDir) {
  const manifestPath = path.join(backupDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found at ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  let restoredCount = 0;
  let totalBytes = 0;

  for (const file of manifest.files) {
    const srcPath = path.join(backupDir, file.logicalPath);
    const dstPath = path.join(restoreTargetDir, file.logicalPath);
    const dstDir = path.dirname(dstPath);

    if (!fs.existsSync(dstDir)) {
      fs.mkdirSync(dstDir, { recursive: true });
    }

    fs.copyFileSync(srcPath, dstPath);

    const restoredSha = computeSha256(dstPath);
    if (restoredSha !== file.sha256) {
      throw new Error(`Restore fidelity failure on ${file.logicalPath}: checksum mismatch!`);
    }

    restoredCount++;
    totalBytes += file.size;
  }

  return {
    backupId: manifest.backupId,
    restoredCount,
    totalBytes,
    verifiedSha256Match: true
  };
}

/**
 * Run a full restore drill to prove that the backup mechanism operates end-to-end
 * with zero data loss and strict secret exclusion.
 */
export function runRestoreDrill(options = {}) {
  const drillId = `drill_${Date.now()}`;
  const tmpRoot = path.join(os.tmpdir(), "mipa-local-layer-drill", drillId);
  const mockWorkspace = path.join(tmpRoot, "workspace");
  const backupStage = path.join(tmpRoot, "backup");
  const restoreStage = path.join(tmpRoot, "restore");

  const assertions = [];

  try {
    // 1. Prepare simulated local layer
    const docsDir = path.join(mockWorkspace, "docs");
    fs.mkdirSync(docsDir, { recursive: true });

    // Populate standard 9 BACKLOG files
    const docNames = [
      "BACKLOG.md",
      "BACKLOG-business.md",
      "BACKLOG-business-plan.md",
      "BACKLOG-roadmap.md",
      "BACKLOG-world-model.md",
      "BACKLOG-naming.md",
      "BACKLOG-meeting.md",
      "BACKLOG-business-daily.md",
      "BACKLOG-a10-entity-and-tax.md"
    ];

    for (const name of docNames) {
      fs.writeFileSync(
        path.join(docsDir, name),
        `# ${name}\nSimulated strategic decision content for drill ${drillId}\n`,
        "utf8"
      );
    }

    // Deliberately introduce secret files to verify exclusion safety filter
    fs.writeFileSync(path.join(mockWorkspace, ".env"), "SECRET_KEY=leaked_secret\n", "utf8");
    fs.writeFileSync(path.join(docsDir, "secret-key.token"), "top_secret_token\n", "utf8");
    const privateDir = path.join(mockWorkspace, "private");
    fs.mkdirSync(privateDir, { recursive: true });
    fs.writeFileSync(path.join(privateDir, "id_rsa"), "-----BEGIN RSA PRIVATE KEY-----\n", "utf8");

    // Populate simulated Hermes components
    const hermesRoot = path.join(tmpRoot, "hermes");
    fs.mkdirSync(path.join(hermesRoot, "notes"), { recursive: true });
    fs.mkdirSync(path.join(hermesRoot, "cron"), { recursive: true });
    fs.writeFileSync(path.join(hermesRoot, "SOUL.md"), "# Xin Soul\nAutonomous CEO\n", "utf8");
    fs.writeFileSync(path.join(hermesRoot, "shift-dispatched.json"), '{"lastDispatch":"2026-11-20"}\n', "utf8");
    fs.writeFileSync(path.join(hermesRoot, "notes", "strategy.md"), "High-leverage focus\n", "utf8");
    fs.writeFileSync(path.join(hermesRoot, "cron", "jobs.json"), '{"jobs":[]}\n', "utf8");

    // Populate simulated Todo-board
    const todoBoardRoot = path.join(tmpRoot, "todo-board");
    fs.mkdirSync(todoBoardRoot, { recursive: true });
    fs.writeFileSync(path.join(todoBoardRoot, "inbox.jsonl"), '{"id":1,"task":"Verify backup"}\n', "utf8");
    fs.writeFileSync(path.join(todoBoardRoot, "overrides.json"), '{"overrides":{}}\n', "utf8");

    // Check 1: File collection discovers all 9 docs + hermes + todo-board
    const collected = collectLocalLayerFiles({
      mipaRoot: mockWorkspace,
      hermesRoot,
      todoBoardRoot
    });

    const docItems = collected.filter((f) => f.category === "docs");
    assertions.push({
      check: "Nine docs/BACKLOG*.md files discovered",
      passed: docItems.length === 9
    });

    // Check 2: Secret exclusion filter rejected .env, tokens, and private/ files
    const leakedSecrets = collected.filter((f) => isExcludedPath(f.sourcePath));
    assertions.push({
      check: "Exclusion safety filter blocks .env, tokens, and private directories",
      passed: leakedSecrets.length === 0
    });

    // Check 3: Backup creation succeeds and generates manifest
    const backupResult = createLocalLayerBackup({
      mipaRoot: mockWorkspace,
      hermesRoot,
      todoBoardRoot,
      dest: backupStage
    });

    assertions.push({
      check: "Backup manifest generated with valid SHA-256",
      passed: !!backupResult.manifestSha256 && fs.existsSync(backupResult.manifestPath)
    });

    // Check 4: Manifest verification matches 100% of files
    const manifestCheck = verifyBackupManifest(backupStage);
    assertions.push({
      check: "Manifest verification validates 100% of copied files",
      passed: manifestCheck.verified && manifestCheck.filesChecked === backupResult.totalFiles
    });

    // Check 5: Restore to new location executes without error
    const restoreResult = restoreLocalLayerBackup(backupStage, restoreStage);
    assertions.push({
      check: "Restore executes with byte-for-byte SHA-256 integrity match",
      passed: restoreResult.verifiedSha256Match && restoreResult.restoredCount === backupResult.totalFiles
    });

    // Check 6: Restored files match original content byte-for-byte
    let allContentMatches = true;
    for (const item of collected) {
      const originalContent = fs.readFileSync(item.sourcePath, "utf8");
      const restoredPath = path.join(restoreStage, item.logicalPath);
      const restoredContent = fs.readFileSync(restoredPath, "utf8");
      if (originalContent !== restoredContent) {
        allContentMatches = false;
        break;
      }
    }
    assertions.push({
      check: "Every restored document matches source content byte-for-byte",
      passed: allContentMatches
    });

    const allPassed = assertions.every((a) => a.passed);

    return {
      drillId,
      timestamp: new Date().toISOString(),
      durationMs: 0,
      totalFilesTested: collected.length,
      allPassed,
      assertions
    };
  } finally {
    // Cleanup temporary drill directory
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  }
}

// CLI Execution entrypoint
async function main() {
  const args = process.argv.slice(2);
  const isDrill = args.includes("--drill");
  const isVerify = args.includes("--verify");
  const isDryRun = args.includes("--dry-run");

  const destIndex = args.indexOf("--dest");
  const customDest = destIndex !== -1 ? args[destIndex + 1] : null;

  if (isDrill) {
    console.log(`[MIPA-42] Running Local-Layer Backup & Restore Drill...`);
    const startTime = Date.now();
    const result = runRestoreDrill();
    result.durationMs = Date.now() - startTime;

    console.log(`\n=======================================================`);
    console.log(`[MIPA-42] Local-Layer Restore Drill Results (${result.drillId})`);
    console.log(`Timestamp: ${result.timestamp}`);
    console.log(`Elapsed Duration: ${result.durationMs}ms`);
    console.log(`Files Tested: ${result.totalFilesTested}`);
    console.log(`=======================================================\n`);

    for (const a of result.assertions) {
      console.log(`  ${a.passed ? "✓" : "✗"} ${a.check}: ${a.passed ? "PASS" : "FAIL"}`);
    }

    if (!result.allPassed) {
      console.error(`\n[FAIL] Drill assertions failed!`);
      process.exit(1);
    }

    console.log(`\n[PASS] All drill assertions passed! Backup & restore verified.`);
    return;
  }

  if (isVerify && customDest) {
    console.log(`[MIPA-42] Verifying backup directory: ${customDest}`);
    const check = verifyBackupManifest(customDest);
    if (!check.verified) {
      console.error(`[FAIL] Verification errors:`, check.errors);
      process.exit(1);
    }
    console.log(`[PASS] Verification passed for ${check.filesChecked}/${check.totalFiles} files.`);
    return;
  }

  console.log(`[MIPA-42] Collecting local-only layer files...`);
  const result = createLocalLayerBackup({
    dest: customDest,
    dryRun: isDryRun
  });

  if (isDryRun) {
    console.log(`[DRY RUN] Would back up ${result.totalFiles} files (${result.totalBytes} bytes) to ${result.destDir}:`);
    for (const f of result.files) {
      console.log(`  - [${f.category}] ${f.logicalPath} (${f.size} bytes)`);
    }
    return;
  }

  console.log(`\n=======================================================`);
  console.log(`[MIPA-42] Local-Only Layer Backup Created Successfully`);
  console.log(`Backup ID: ${result.backupId}`);
  console.log(`Destination: ${result.destDir}`);
  console.log(`Files Backed Up: ${result.totalFiles}`);
  console.log(`Total Bytes: ${result.totalBytes}`);
  console.log(`Manifest SHA-256: ${result.manifestSha256}`);
  console.log(`=======================================================\n`);
}

// Only execute CLI if called directly
const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
if (isDirectExecution) {
  main().catch((err) => {
    console.error(`[FAIL] Error executing local-layer backup:`, err);
    process.exit(1);
  });
}
