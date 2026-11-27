import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  isExcludedPath,
  computeSha256,
  collectLocalLayerFiles,
  createLocalLayerBackup,
  verifyBackupManifest,
  restoreLocalLayerBackup,
  runRestoreDrill
} from "../../scripts/backup-local-layer.js";

describe("MIPA-42: Local-Only Layer Backup & Disaster Recovery", () => {
  let tmpDir;
  let mockWorkspace;
  let mockHermes;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `mipa-test-backup-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mockWorkspace = path.join(tmpDir, "mipa");
    mockHermes = path.join(tmpDir, "hermes");

    fs.mkdirSync(mockWorkspace, { recursive: true });
    fs.mkdirSync(path.join(mockHermes, "notes"), { recursive: true });
    fs.mkdirSync(path.join(mockHermes, "cron"), { recursive: true });

    // Populate Hermes assets (note: docs/BACKLOG*.md and todo-board were retired on 2026-11-26)
    fs.writeFileSync(path.join(mockHermes, "SOUL.md"), "# Xin Soul\nAutonomous CEO\n");
    fs.writeFileSync(path.join(mockHermes, "shift-dispatched.json"), '{"dispatched":true}\n');
    fs.writeFileSync(path.join(mockHermes, "notes", "strategy.md"), "Strategy note\n");
    fs.writeFileSync(path.join(mockHermes, "cron", "jobs.json"), '{"jobs":[]}\n');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe("1. Safety & Exclusion Invariants (Zero Credential Leakage)", () => {
    it("rejects .env, tokens, service accounts, and private directories", () => {
      expect(isExcludedPath(".env")).toBe(true);
      expect(isExcludedPath(".env.production")).toBe(true);
      expect(isExcludedPath("C:/Users/tedhw/.env.local")).toBe(true);
      expect(isExcludedPath("C:/Users/tedhw/private/key.pem")).toBe(true);
      expect(isExcludedPath("ops-private.md")).toBe(true);
      expect(isExcludedPath("github-token.env")).toBe(true);
      expect(isExcludedPath("mipa-firebase-adminsdk-12345.json")).toBe(true);
      expect(isExcludedPath("google-service-account.json")).toBe(true);
      expect(isExcludedPath("state.db.lock")).toBe(true);
      expect(isExcludedPath("state.db-wal")).toBe(true);
      expect(isExcludedPath(".git/config")).toBe(true);
      expect(isExcludedPath("node_modules/vue/package.json")).toBe(true);
    });

    it("allows non-secret local-layer markdown, json, and metadata files", () => {
      expect(isExcludedPath("hermes/SOUL.md")).toBe(false);
      expect(isExcludedPath("hermes/shift-dispatched.json")).toBe(false);
      expect(isExcludedPath("hermes/notes/strategy.md")).toBe(false);
      expect(isExcludedPath("hermes/cron/jobs.json")).toBe(false);
    });
  });

  describe("2. Local Layer File Discovery", () => {
    it("collects Hermes assets and excludes secret files", () => {
      // Add deliberate secret files to workspace
      fs.writeFileSync(path.join(mockWorkspace, ".env"), "API_KEY=leak\n");
      const privateDir = path.join(mockWorkspace, "private");
      fs.mkdirSync(privateDir, { recursive: true });
      fs.writeFileSync(path.join(privateDir, "id_rsa"), "rsa\n");
      fs.writeFileSync(path.join(mockHermes, "secret.token"), "token\n");

      const files = collectLocalLayerFiles({
        mipaRoot: mockWorkspace,
        hermesRoot: mockHermes
      });

      const hermesFiles = files.filter((f) => f.category === "hermes");
      expect(hermesFiles.length).toBe(4);

      // Verify no secret entered
      const leaked = files.filter((f) => isExcludedPath(f.sourcePath));
      expect(leaked.length).toBe(0);

      expect(hermesFiles.some((f) => f.logicalPath === "hermes/SOUL.md")).toBe(true);
      expect(hermesFiles.some((f) => f.logicalPath === "hermes/shift-dispatched.json")).toBe(true);
      expect(hermesFiles.some((f) => f.logicalPath === "hermes/notes/strategy.md")).toBe(true);
      expect(hermesFiles.some((f) => f.logicalPath === "hermes/cron/jobs.json")).toBe(true);
    });

    it("handles missing Hermes gracefully without crashing", () => {
      const files = collectLocalLayerFiles({
        mipaRoot: mockWorkspace,
        hermesRoot: path.join(tmpDir, "non-existent-hermes")
      });

      expect(files.length).toBe(0);
    });
  });

  describe("3. Backup Creation & Manifest Generation", () => {
    it("creates backup copies and generates verifiable manifest.json", () => {
      const backupDir = path.join(tmpDir, "target-backup");
      const result = createLocalLayerBackup({
        mipaRoot: mockWorkspace,
        hermesRoot: mockHermes,
        dest: backupDir
      });

      expect(result.totalFiles).toBe(4);
      expect(result.totalBytes).toBeGreaterThan(0);
      expect(fs.existsSync(result.manifestPath)).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(result.manifestPath, "utf8"));
      expect(manifest.version).toBe("1.0.0");
      expect(manifest.files.length).toBe(result.totalFiles);
      expect(manifest.manifestSha256).toBeDefined();

      // Verify manifest check passes
      const check = verifyBackupManifest(backupDir);
      expect(check.verified).toBe(true);
      expect(check.filesChecked).toBe(result.totalFiles);
      expect(check.errors.length).toBe(0);
    });

    it("detects corrupted or modified files against manifest", () => {
      const backupDir = path.join(tmpDir, "corrupted-backup");
      createLocalLayerBackup({
        mipaRoot: mockWorkspace,
        hermesRoot: mockHermes,
        dest: backupDir
      });

      // Deliberately tamper with one file
      const tamperedPath = path.join(backupDir, "hermes/SOUL.md");
      fs.appendFileSync(tamperedPath, "\nTAMPERED CONTENT\n");

      const check = verifyBackupManifest(backupDir);
      expect(check.verified).toBe(false);
      expect(check.errors.length).toBe(1);
      expect(check.errors[0]).toContain("Checksum mismatch for hermes/SOUL.md");
    });
  });

  describe("4. Restore Mechanism & Data Fidelity", () => {
    it("restores files to destination with 100% byte-for-byte SHA-256 match", () => {
      const backupDir = path.join(tmpDir, "source-backup");
      createLocalLayerBackup({
        mipaRoot: mockWorkspace,
        hermesRoot: mockHermes,
        dest: backupDir
      });

      const restoreDir = path.join(tmpDir, "restored-target");
      const restoreResult = restoreLocalLayerBackup(backupDir, restoreDir);

      expect(restoreResult.verifiedSha256Match).toBe(true);
      expect(restoreResult.restoredCount).toBe(4);

      // Verify restored content matches original byte-for-byte
      const originalSoul = fs.readFileSync(path.join(mockHermes, "SOUL.md"), "utf8");
      const restoredSoul = fs.readFileSync(path.join(restoreDir, "hermes/SOUL.md"), "utf8");
      expect(restoredSoul).toBe(originalSoul);

      const originalStrategy = fs.readFileSync(path.join(mockHermes, "notes", "strategy.md"), "utf8");
      const restoredStrategy = fs.readFileSync(path.join(restoreDir, "hermes/notes/strategy.md"), "utf8");
      expect(restoredStrategy).toBe(originalStrategy);
    });
  });

  describe("5. End-to-End Restore Drill", () => {
    it("runs complete restore drill and passes all checklist assertions", () => {
      const drill = runRestoreDrill();

      expect(drill.allPassed).toBe(true);
      expect(drill.totalFilesTested).toBe(4);
      expect(drill.assertions.length).toBe(6);
      expect(drill.assertions.every((a) => a.passed)).toBe(true);
    });
  });
});
