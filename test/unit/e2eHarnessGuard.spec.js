import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".vue"]);
const CREDENTIAL_FALLBACK_RE = /process\.env\.[A-Za-z0-9_]+\s*(?:\|\||\?\?)\s*['"`]/;

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath));
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }
  return results;
}

describe("MIPA-64: E2E Harness Target & Credential Fallback Guards", () => {
  it("contains zero process.env.<NAME> || <literal> fallbacks across test/e2e and src", () => {
    const root = process.cwd();
    const scannedFiles = [
      ...walkFiles(path.join(root, "test/e2e")),
      ...walkFiles(path.join(root, "src"))
    ];
    expect(scannedFiles.length).toBeGreaterThan(0);

    const violations = [];
    for (const filePath of scannedFiles) {
      const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
      lines.forEach((line, idx) => {
        if (CREDENTIAL_FALLBACK_RE.test(line)) {
          violations.push(`${path.relative(root, filePath)}:${idx + 1}: ${line.trim()}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it("targets the local app and Auth/Firestore emulators explicitly instead of defaulting to production", () => {
    const root = process.cwd();
    const pwConfig = fs.readFileSync(path.join(root, "playwright.config.js"), "utf8");
    expect(pwConfig).not.toContain("https://collective-change.org");
    expect(pwConfig).toContain("http://127.0.0.1:9000");
    expect(pwConfig).toContain("webServer:");

    const ciWorkflow = fs.readFileSync(path.join(root, ".github/workflows/node.js.yml"), "utf8");
    expect(ciWorkflow).toContain("BASE_URL: http://127.0.0.1:9000");
    expect(ciWorkflow).toContain("emulators:exec --only auth,firestore --project demo-mipa");
    expect(ciWorkflow).toContain("scripts/seed-e2e-emulator.mjs");
  });

  it("enforces fail-loud authentication and unconditional access checks in E2E login specs", () => {
    const root = process.cwd();
    const orgViewer = fs.readFileSync(path.join(root, "test/e2e/org-viewer.spec.js"), "utf8");
    const userFunnel = fs.readFileSync(path.join(root, "test/e2e/user-funnel.spec.js"), "utf8");

    for (const specContent of [orgViewer, userFunnel]) {
      expect(specContent).not.toContain("test.skip(");
      expect(specContent).toContain("not.toHaveURL(/\\/auth\\b/");
    }

    expect(orgViewer).not.toContain("hasSvg || hasNoAccess");
    expect(orgViewer).not.toMatch(/if\s*\(\s*await\s+noAccessBox\.isVisible\(\)\s*\)/);
    expect(orgViewer).toContain("expect(svgGraph).toBeVisible");
    expect(orgViewer).toContain("expect(noAccessBox).toBeVisible");
  });
});
