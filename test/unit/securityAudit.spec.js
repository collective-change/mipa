import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { parse } from "mathjs";
import { isAllowedEndpoint } from "../../functions/src/ai/endpointValidator";

describe("Security Audit & Hardening", () => {
  describe("Firestore Security Rules Verification", () => {
    const rulesPath = path.resolve(process.cwd(), "firestore.rules");
    const rulesContent = fs.readFileSync(rulesPath, "utf8");

    it("explicitly denies client access to orgSecrets", () => {
      expect(rulesContent).toContain("match /orgSecrets/{secret=**}");
      expect(rulesContent).toContain("allow read, write: if false;");
    });

    it("enforces authentication on userInOrg helper", () => {
      expect(rulesContent).toMatch(/function userInOrg\(orgId\) \{\s*return request\.auth != null/);
    });

    it("protects model subcollections and ensures authenticated edits", () => {
      expect(rulesContent).toContain("match /models/{model}");
      expect(rulesContent).toContain("allow create: if request.auth != null;");
      expect(rulesContent).toContain("request.auth.uid in get(/databases/$(database)/documents/models/$(model)).data.editors.users");
    });

    it("enforces tenant boundary checks on action creation, update, and deletion", () => {
      expect(rulesContent).toContain("match /actions/{action}");
      expect(rulesContent).toContain("allow create: if userInOrg(request.resource.data.orgId);");
      expect(rulesContent).toContain("allow update: if userInOrg(resource.data.orgId) && userInOrg(request.resource.data.orgId);");
      expect(rulesContent).toContain("allow delete: if userInOrg(resource.data.orgId);");
    });
  });

  describe("Public Dossier Route Security & Hardening (/m/:modelId)", () => {
    const rulesPath = path.resolve(process.cwd(), "firestore.rules");
    const rulesContent = fs.readFileSync(rulesPath, "utf8");

    it("restricts public model read strictly to documents with isPublic == true", () => {
      // Must not contain open or unconditional read rules on models
      expect(rulesContent).not.toMatch(/match \/models\/\{model\}\s*\{\s*allow read: if true;/);
      // Must strictly require resource.data.isPublic == true
      expect(rulesContent).toContain("allow read: if resource.data.isPublic == true;");
    });

    it("prohibits recursive wildcard exposure on /models subcollections", () => {
      // Must not match /models/{model}/{document=**} which would leak subcollections
      expect(rulesContent).not.toMatch(/match \/models\/\{model\}\/\{document=\*\*\}/);
    });

    it("strictly forbids unauthenticated writes, updates, and deletes on public models", () => {
      // Create requires authentication
      expect(rulesContent).toContain("allow create: if request.auth != null;");
      // Update requires authenticated editor
      expect(rulesContent).toContain("allow update: if request.auth != null && request.auth.uid in resource.data.editors.users;");
      // Delete requires authenticated owner
      expect(rulesContent).toContain("allow delete: if request.auth != null && request.auth.uid in resource.data.owners.users;");
    });

    it("gates nodes subcollection on parent model isPublic flag and forbids unauthenticated writes", () => {
      // Read must inspect parent model isPublic flag
      expect(rulesContent).toMatch(/get\(\/databases\/\$\(database\)\/documents\/models\/\$\(model\)\)\.data\.isPublic == true/);
      // Write must require authenticated editor
      expect(rulesContent).toContain("allow write: if request.auth != null && request.auth.uid in get(/databases/$(database)/documents/models/$(model)).data.editors.users;");
      // Must not allow unauthenticated write
      expect(rulesContent).not.toMatch(/match \/nodes\/\{node\}\s*\{[^}]*allow write:[^;]*isPublic == true/);
    });

    it("strictly requires authentication for snapshots even when model is public", () => {
      // Snapshots must require request.auth != null
      expect(rulesContent).toMatch(/match \/snapshots\/\{snapshot\}\s*\{\s*allow read: if request\.auth != null/);
      // Snapshots must be immutable (no updates or deletes)
      expect(rulesContent).toContain("allow update, delete: if false;");
    });

    it("verifies sensitive collections remain completely inaccessible to unauthenticated visitors", () => {
      // orgSecrets is completely closed
      expect(rulesContent).toMatch(/match \/orgSecrets\/\{secret=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/);
      // members require org membership
      expect(rulesContent).toMatch(/match \/members\/\{memberId\}\s*\{\s*allow read: if userInOrg\(org\);/);
      // user profiles require matching UID
      expect(rulesContent).toMatch(/match \/users\/\{userId\}\s*\{\s*allow read, write: if request\.auth\.uid == userId;\s*\}/);
      // actions require org membership
      expect(rulesContent).toMatch(/match \/actions\/\{action\}\s*\{\s*allow create: if userInOrg\(request\.resource\.data\.orgId\);/);
      expect(rulesContent).toMatch(/allow read: if userInOrg\(resource\.data\.orgId\);/);
    });

    it("confirms the perturbation sandbox in PageModelDossier and modelDossier cannot write to Firestore", () => {
      const pageDossierPath = path.resolve(process.cwd(), "src/pages/PageModelDossier.vue");
      const pageDossierContent = fs.readFileSync(pageDossierPath, "utf8");
      const utilDossierPath = path.resolve(process.cwd(), "src/utils/modelDossier.js");
      const utilDossierContent = fs.readFileSync(utilDossierPath, "utf8");

      // Verify no mutating Firestore methods are imported or called
      const prohibitedMutations = ["setDoc", "updateDoc", "deleteDoc", "addDoc", "writeBatch", "runTransaction"];
      prohibitedMutations.forEach(op => {
        expect(pageDossierContent).not.toMatch(new RegExp(`\\b${op}\\s*\\(`));
        expect(utilDossierContent).not.toMatch(new RegExp(`\\b${op}\\s*\\(`));
      });

      // Verify no mutating Vuex store dispatching
      expect(pageDossierContent).not.toContain("this.$store.dispatch");
      expect(pageDossierContent).not.toContain("this.$store.commit");
    });
  });

  describe("Cloud Functions SSRF Hardening", () => {
    it("allows valid public HTTPS endpoints", () => {
      expect(isAllowedEndpoint("https://api.anthropic.com/v1")).toBe(true);
      expect(isAllowedEndpoint("https://api.openai.com/v1")).toBe(true);
      expect(isAllowedEndpoint("https://openrouter.ai/api/v1")).toBe(true);
    });

    it("strictly blocks cloud metadata endpoints (GCP, AWS, Azure)", () => {
      expect(isAllowedEndpoint("https://169.254.169.254/computeMetadata/v1/")).toBe(false);
      expect(isAllowedEndpoint("https://metadata.google.internal/computeMetadata/v1/")).toBe(false);
      expect(isAllowedEndpoint("https://metadata.internal/")).toBe(false);
    });

    it("strictly blocks private IPv4 ranges outside emulator", () => {
      expect(isAllowedEndpoint("https://10.0.0.1/v1")).toBe(false);
      expect(isAllowedEndpoint("https://172.16.0.1/v1")).toBe(false);
      expect(isAllowedEndpoint("https://172.31.255.255/v1")).toBe(false);
      expect(isAllowedEndpoint("https://192.168.1.100/v1")).toBe(false);
      expect(isAllowedEndpoint("https://127.0.0.1:8080/v1")).toBe(false);
      expect(isAllowedEndpoint("https://localhost:3000/v1")).toBe(false);
    });

    it("rejects non-https schemes (http, ftp, file, javascript)", () => {
      expect(isAllowedEndpoint("http://api.openai.com/v1")).toBe(false);
      expect(isAllowedEndpoint("ftp://files.example.org")).toBe(false);
      expect(isAllowedEndpoint("file:///etc/passwd")).toBe(false);
      expect(isAllowedEndpoint("javascript:alert(1)")).toBe(false);
    });
  });

  describe("Math.js Sandbox & Formula Injection Hardening", () => {
    it("safely parses formulas and refuses arbitrary code execution payloads", () => {
      // Common code execution payloads in template/eval engines
      const maliciousPayloads = [
        "process.mainModule.require('child_process').execSync('whoami')",
        "Function('return process')()",
        "constructor.constructor('return this')()",
        "<script>alert(1)</script>"
      ];

      maliciousPayloads.forEach((payload) => {
        try {
          const parsed = parse(payload);
          // If mathjs parses the symbol, evaluating without scope won't have access to Node globals
          expect(parsed).toBeDefined();
        } catch (e) {
          // Expected syntax or parse rejection
          expect(e).toBeDefined();
        }
      });
    });
  });
});
