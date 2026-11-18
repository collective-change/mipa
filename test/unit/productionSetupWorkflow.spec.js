import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Production Setup Workflow & Secrets (MIPA-28)", () => {
  const workflowPath = path.resolve(__dirname, "../../.github/workflows/production-setup.yml");
  const workflowContent = fs.readFileSync(workflowPath, "utf8");

  function getFunctionsSecrets() {
    const secrets = new Set();
    function scanDir(dir) {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        const fullPath = path.join(dir, f);
        if (fs.statSync(fullPath).isDirectory()) {
          scanDir(fullPath);
        } else if (fullPath.endsWith(".ts") || fullPath.endsWith(".js")) {
          const content = fs.readFileSync(fullPath, "utf8");
          const matches = content.matchAll(/defineSecret\(['"]([^'"]+)['"]\)/g);
          for (const m of matches) {
            secrets.add(m[1]);
          }
        }
      }
    }
    scanDir(path.resolve(__dirname, "../../functions/src"));
    return Array.from(secrets).sort();
  }

  it("finds all defineSecret names in functions/src", () => {
    const declaredSecrets = getFunctionsSecrets();
    expect(declaredSecrets).toContain("FIXER_IO_ACCESS_KEY");
    expect(declaredSecrets).toContain("AI_KEY_ENCRYPTION_KEY");
    expect(declaredSecrets).toContain("SYSTEM_AI_PROVIDER_KEY");
  });

  it("ensures the check probe list in production-setup.yml includes or derives every defined secret", () => {
    const declaredSecrets = getFunctionsSecrets();
    expect(workflowContent).toContain("defineSecret");

    // Must include comment about keeping the list in step with grep -rn defineSecret functions/src
    expect(workflowContent).toMatch(/grep -rn defineSecret functions\/src/);

    // Each declared secret must be accounted for in the check step or its fallback list
    for (const secret of declaredSecrets) {
      expect(workflowContent, `production-setup.yml must reference secret '${secret}'`).toContain(secret);
    }
  });

  it("ensures migrate fails loudly with exact command for SYSTEM_AI_PROVIDER_KEY and never invents a value", () => {
    expect(workflowContent).toContain("firebase functions:secrets:set SYSTEM_AI_PROVIDER_KEY");

    // Verify AI_KEY_ENCRYPTION_KEY can generate random bytes, but SYSTEM_AI_PROVIDER_KEY never does
    const migrateSection = workflowContent.slice(workflowContent.indexOf("name: Create missing secrets"));
    expect(migrateSection).toContain("openssl rand -base64 32 | tr -d '\\n' | gcloud secrets create AI_KEY_ENCRYPTION_KEY");

    // Ensure openssl rand is NOT used for SYSTEM_AI_PROVIDER_KEY
    expect(migrateSection).not.toMatch(/openssl rand.*SYSTEM_AI_PROVIDER_KEY/);
    expect(migrateSection).not.toMatch(/SYSTEM_AI_PROVIDER_KEY.*openssl rand/);
  });

  it("distinguishes absent from unreadable in check mode", () => {
    const checkSecretsStep = workflowContent.slice(
      workflowContent.indexOf("name: Secrets in the project"),
      workflowContent.indexOf("name: Old exchange-rate key")
    );

    // Check step must report absent vs unreadable
    expect(checkSecretsStep).toContain("echo \"$name: absent\"");
    expect(checkSecretsStep).toContain("unreadable");
    expect(checkSecretsStep).toContain("permission denied");
    expect(checkSecretsStep).toContain("echo \"$name: exists\"");
  });

  it("ensures secret values are never printed by redirecting stdout to /dev/null", () => {
    const checkSecretsStep = workflowContent.slice(
      workflowContent.indexOf("name: Secrets in the project"),
      workflowContent.indexOf("name: Old exchange-rate key")
    );

    // Any call to versions access must redirect stdout to /dev/null
    expect(checkSecretsStep).toMatch(/versions access latest.*>\/dev\/null/);
  });
});
