import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("MIPA-52: Production Deploy Workflow Multi-Region Cleanup & Force Flags", () => {
  const deployWorkflowPath = path.resolve(__dirname, "../../.github/workflows/deploy.yml");
  const deployWorkflowContent = fs.readFileSync(deployWorkflowPath, "utf8");

  const setupWorkflowPath = path.resolve(__dirname, "../../.github/workflows/production-setup.yml");
  const setupWorkflowContent = fs.readFileSync(setupWorkflowPath, "utf8");

  function getDeclaredFunctionRegions() {
    const regions = new Set(["us-central1"]); // default region for unassigned functions
    function scanDir(dir) {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        const fullPath = path.join(dir, f);
        if (fs.statSync(fullPath).isDirectory()) {
          scanDir(fullPath);
        } else if (fullPath.endsWith(".ts") || fullPath.endsWith(".js")) {
          const content = fs.readFileSync(fullPath, "utf8");
          const matches = content.matchAll(/region:\s*["']([^"']+)["']/g);
          for (const m of matches) {
            regions.add(m[1]);
          }
        }
      }
    }
    scanDir(path.resolve(__dirname, "../../functions/src"));
    return Array.from(regions).sort();
  }

  it("finds all declared function regions in functions/src", () => {
    const declaredRegions = getDeclaredFunctionRegions();
    expect(declaredRegions).toContain("us-central1");
    expect(declaredRegions).toContain("asia-east1");
  });

  it("ensures deploy.yml cleanup policy step loops over all declared function regions including asia-east1", () => {
    const declaredRegions = getDeclaredFunctionRegions();
    for (const region of declaredRegions) {
      expect(
        deployWorkflowContent,
        `deploy.yml must set cleanup policy for region '${region}'`
      ).toContain(region);
    }
    expect(deployWorkflowContent).toContain("for loc in us-central1 asia-east1");
    expect(deployWorkflowContent).toContain("--location \"$loc\"");
    expect(deployWorkflowContent).toContain("--force");
  });

  it("ensures deploy.yml invokes firebase deploy with --force to prevent region policy lockouts", () => {
    const deployStep = deployWorkflowContent.slice(deployWorkflowContent.indexOf("name: Deploy to Firebase"));
    expect(deployStep).toContain("--force");
    expect(deployStep).toContain("--non-interactive");
  });

  it("ensures production-setup.yml cleanup policy and deploy steps also include asia-east1 and --force", () => {
    expect(setupWorkflowContent).toContain("for loc in us-central1 asia-east1");
    expect(setupWorkflowContent).toContain("--location \"$loc\"");

    const migrateDeployStep = setupWorkflowContent.slice(setupWorkflowContent.indexOf("name: Deploy to Firebase"));
    expect(migrateDeployStep).toContain("--force");
  });
});
