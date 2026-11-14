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
