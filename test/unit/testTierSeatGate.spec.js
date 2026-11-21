// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import {
  formatTestOrgName,
  appendAccessLog,
  grantTestTierToOrg
} from "../../private/grant-test-tier.mjs";

const requireFromFunctions = createRequire(path.resolve(process.cwd(), "functions/package.json"));

function createInMemoryAdminDb(initialOrgs = {}) {
  const stores = {
    orgs: new Map(Object.entries(initialOrgs).map(([id, data]) => [id, structuredClone(data)])),
    invitations: new Map(),
    members: new Map()
  };
  let inviteSeq = 0;

  function resolveCollection(colPath) {
    const m = /^orgs\/([^/]+)\/(invitations|members)$/.exec(colPath);
    if (m) {
      return { store: m[2] === "invitations" ? stores.invitations : stores.members, orgId: m[1] };
    }
    return null;
  }

  function makeDocRef(docPath) {
    return {
      path: docPath,
      id: path.posix.basename(docPath),
      async get() {
        if (docPath.startsWith("orgs/")) {
          const rest = docPath.slice("orgs/".length);
          const parts = rest.split("/");
          if (parts.length === 1) {
            const data = stores.orgs.get(parts[0]);
            return {
              exists: Boolean(data),
              data: () => structuredClone(data),
              get: k => (data ? data[k] : undefined)
            };
          }
          if (parts.length === 3 && parts[1] === "invitations") {
            const orgInv = stores.invitations.get(parts[0]) || new Map();
            const data = orgInv.get(parts[2]);
            return {
              exists: Boolean(data),
              data: () => structuredClone(data),
              get: k => (data ? data[k] : undefined)
            };
          }
        }
        return { exists: false, data: () => undefined, get: () => undefined };
      },
      async set(data, opts = {}) {
        if (docPath.startsWith("orgs/") && docPath.split("/").length === 2) {
          const id = docPath.split("/")[1];
          const prev = stores.orgs.get(id) || {};
          stores.orgs.set(id, opts.merge ? { ...prev, ...structuredClone(data) } : structuredClone(data));
          return;
        }
        const parts = docPath.split("/");
        if (parts.length === 4 && parts[0] === "orgs" && parts[2] === "invitations") {
          const col = stores.invitations.get(parts[1]) || new Map();
          col.set(parts[3], structuredClone(data));
          stores.invitations.set(parts[1], col);
        } else if (parts.length === 4 && parts[0] === "orgs" && parts[2] === "members") {
          const col = stores.members.get(parts[1]) || new Map();
          col.set(parts[3], structuredClone(data));
          stores.members.set(parts[1], col);
        }
      },
      collection(sub) {
        return makeCollectionRef(`${docPath}/${sub}`);
      }
    };
  }

  function makeCollectionRef(colPath) {
    return {
      path: colPath,
      doc(docId) {
        const id = docId || `inv_${++inviteSeq}`;
        return makeDocRef(`${colPath}/${id}`);
      },
      where() {
        return {
          async get() {
            return { docs: [] };
          }
        };
      },
      async get() {
        const resolved = resolveCollection(colPath);
        if (!resolved) return { docs: [] };
        const map = resolved.store.get(resolved.orgId) || new Map();
        const docs = Array.from(map.entries()).map(([id, data]) => ({
          id,
          ref: makeDocRef(`${colPath}/${id}`),
          data: () => structuredClone(data),
          get: k => data[k]
        }));
        return { docs };
      }
    };
  }

  return {
    stores,
    doc: docPath => makeDocRef(docPath),
    collection: colPath => makeCollectionRef(colPath),
    async runTransaction(fn) {
      const tx = {
        get: async refOrQuery => (typeof refOrQuery.get === "function" ? refOrQuery.get() : { docs: [] }),
        set: (ref, data, opts) => ref.set(data, opts),
        update: async (ref, updates) => {
          const snap = await ref.get();
          const current = snap.data() || {};
          const next = { ...current };
          for (const [k, v] of Object.entries(updates)) {
            if (v && v.__arrayUnion) {
              const arr = Array.isArray(next[k]) ? [...next[k]] : [];
              for (const item of v.__arrayUnion) {
                if (!arr.includes(item)) arr.push(item);
              }
              next[k] = arr;
            } else {
              next[k] = v;
            }
          }
          await ref.set(next, { merge: false });
        },
        delete: async ref => {
          const parts = ref.path.split("/");
          if (parts.length === 4 && parts[0] === "orgs" && parts[2] === "invitations") {
            const col = stores.invitations.get(parts[1]);
            if (col) col.delete(parts[3]);
          }
        }
      };
      return fn(tx);
    }
  };
}

function collectSourceFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(full));
    } else if (/\.(js|mjs|cjs|ts|vue)$/.test(entry.name) && !/\.test\.|\.spec\./.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

describe("MIPA-67 Layer 1: Whitelist Test-Tier Grant & No-Bypass Guard", () => {
  let tmpDir;
  let accessLogPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mipa-67-layer1-"));
    accessLogPath = path.join(tmpDir, "access-log.jsonl");
  });

  it("prefixes [TEST] once cleanly without duplicating it", () => {
    expect(formatTestOrgName("Riverside Team")).toBe("[TEST] Riverside Team");
    expect(formatTestOrgName("[TEST] Riverside Team")).toBe("[TEST] Riverside Team");
    expect(formatTestOrgName("  ")).toBe("[TEST]");
  });

  it("refuses non-whitelisted or missing orgs before any write", async () => {
    const db = createInMemoryAdminDb({
      "org-real": { name: "Real Customer", users: ["u1"], seatLimit: 1 }
    });

    await expect(
      grantTestTierToOrg({
        db,
        orgId: "org-real",
        whitelist: ["org-whitelisted"],
        accessLogPath,
        dryRun: false
      })
    ).rejects.toThrow(/not in the test-tier whitelist/i);

    await expect(
      grantTestTierToOrg({
        db,
        orgId: "org-missing",
        whitelist: ["org-missing"],
        accessLogPath,
        dryRun: false
      })
    ).rejects.toThrow(/does not exist/i);

    expect(db.stores.orgs.get("org-real").seatLimit).toBe(1);
    expect(fs.existsSync(accessLogPath)).toBe(false);
  });

  it("supports dryRun previews without writing to Firestore or the access log", async () => {
    const db = createInMemoryAdminDb({
      "org-test-1": { name: "Teammates Persona", users: ["u1"], seatLimit: 1 }
    });

    const result = await grantTestTierToOrg({
      db,
      orgId: "org-test-1",
      whitelist: ["org-test-1"],
      accessLogPath,
      dryRun: true
    });

    expect(result.applied).toBe(false);
    expect(result.updates).toEqual({
      name: "[TEST] Teammates Persona",
      subscriptionTier: "starter",
      seatLimit: 5,
      subscriptionStatus: "test-grant"
    });
    expect(db.stores.orgs.get("org-test-1").seatLimit).toBe(1);
    expect(fs.existsSync(accessLogPath)).toBe(false);
  });

  it("writes existing billing fields without isTest bypass and records JSONL access log entry", async () => {
    const db = createInMemoryAdminDb({
      "org-test-1": {
        name: "Teammates Persona",
        users: ["u1"],
        subscriptionTier: "community",
        seatLimit: 1
      }
    });

    const result = await grantTestTierToOrg({
      db,
      orgId: "org-test-1",
      whitelist: ["org-test-1"],
      actor: "ops@collective-change.org",
      reason: "teammates persona verification",
      accessLogPath,
      dryRun: false,
      now: () => "2026-11-21T09:45:00.000Z"
    });

    expect(result.applied).toBe(true);
    const saved = db.stores.orgs.get("org-test-1");
    expect(saved.name).toBe("[TEST] Teammates Persona");
    expect(saved.subscriptionTier).toBe("starter");
    expect(saved.seatLimit).toBe(5);
    expect(saved.subscriptionStatus).toBe("test-grant");
    expect("isTest" in saved).toBe(false);

    const lines = fs.readFileSync(accessLogPath, "utf8").trim().split(/\r?\n/);
    expect(lines).toHaveLength(1);
    const logged = JSON.parse(lines[0]);
    expect(logged).toEqual({
      timestamp: "2026-11-21T09:45:00.000Z",
      action: "test-tier-grant",
      actor: "ops@collective-change.org",
      reason: "teammates persona verification",
      orgId: "org-test-1",
      dryRun: false,
      previous: {
        name: "Teammates Persona",
        subscriptionTier: "community",
        seatLimit: 1,
        subscriptionStatus: null
      },
      granted: {
        name: "[TEST] Teammates Persona",
        subscriptionTier: "starter",
        seatLimit: 5,
        subscriptionStatus: "test-grant"
      }
    });

    // Direct appendAccessLog helper also appends cleanly
    appendAccessLog(accessLogPath, { timestamp: "2026-11-21T09:46:00.000Z", action: "noop" });
    expect(fs.readFileSync(accessLogPath, "utf8").trim().split(/\r?\n/)).toHaveLength(2);
  });

  it("refuses the 6th invite at seatLimit: 5 inside the real createInvitation transaction", async () => {
    const mockDb = createInMemoryAdminDb({
      "org-gate-unit": {
        name: "Teammates Unit",
        users: [],
        superAdmins: ["admin-1"],
        subscriptionTier: "community",
        seatLimit: 1
      }
    });

    await grantTestTierToOrg({
      db: mockDb,
      orgId: "org-gate-unit",
      whitelist: ["org-gate-unit"],
      accessLogPath,
      dryRun: false
    });

    const fsAdmin = requireFromFunctions("firebase-admin/firestore");
    const getFsSpy = vi.spyOn(fsAdmin, "getFirestore").mockReturnValue(mockDb);
    const tsSpy = vi.spyOn(fsAdmin.FieldValue, "serverTimestamp").mockReturnValue("__SERVER_TIMESTAMP__");
    const unionSpy = vi
      .spyOn(fsAdmin.FieldValue, "arrayUnion")
      .mockImplementation((...items) => ({ __arrayUnion: items }));

    try {
      const { createInvitation } = await import("../../functions/src/orgMembers?unit=1");

      for (let i = 1; i <= 5; i++) {
        const res = await createInvitation.run({
          auth: { uid: "admin-1", token: { email: "admin@example.org", name: "Admin" } },
          data: { orgId: "org-gate-unit", email: `invite${i}@example.org`, role: "member" }
        });
        expect(res.success).toBe(true);
      }

      await expect(
        createInvitation.run({
          auth: { uid: "admin-1", token: { email: "admin@example.org", name: "Admin" } },
          data: { orgId: "org-gate-unit", email: "invite6@example.org", role: "member" }
        })
      ).rejects.toMatchObject({
        code: "failed-precondition",
        message: expect.stringMatching(/Seat limit \(5\) reached/)
      });
    } finally {
      getFsSpy.mockRestore();
      tsSpy.mockRestore();
      unionSpy.mockRestore();
    }
  });

  it("verifies zero org.isTest or skipLimit bypass flags exist in product source or firestore.rules", () => {
    const root = process.cwd();
    const targets = [
      ...collectSourceFiles(path.join(root, "src")),
      ...collectSourceFiles(path.join(root, "functions/src")),
      path.join(root, "firestore.rules")
    ];

    const violations = [];
    for (const filePath of targets) {
      const content = fs.readFileSync(filePath, "utf8");
      if (/\borg\.isTest\b|\bskipLimit\b|['"]isTest['"]/.test(content)) {
        violations.push(path.relative(root, filePath));
      }
    }
    expect(violations).toEqual([]);
  });
});

describe("MIPA-67 Layer 2: Firestore Emulator 5-Seat Gate Verification", { timeout: 60000 }, () => {
  let testEnv;
  let adminDb;
  let createInvitation;
  let acceptInvitation;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:5002";
    const rules = fs.readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf8");
    testEnv = await initializeTestEnvironment({
      projectId: "demo-mipa",
      firestore: {
        host: "127.0.0.1",
        port: 5002,
        rules
      }
    });

    const { initializeApp, getApps } = requireFromFunctions("firebase-admin/app");
    const { getFirestore } = requireFromFunctions("firebase-admin/firestore");
    if (!getApps().length) {
      initializeApp({ projectId: "demo-mipa" });
    }
    adminDb = getFirestore();

    vi.resetModules();
    ({ createInvitation, acceptInvitation } = await import("../../functions/src/orgMembers"));
  }, 60000);

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  }, 30000);

  it("refuses the 6th invite at seatLimit: 5 after granting test-grant tier via Admin SDK", async () => {
    const orgId = `org-mipa67-gate-${Date.now()}`;
    const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "mipa-67-emu-log-"));
    const accessLogPath = path.join(logDir, "access-log.jsonl");

    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, `orgs/${orgId}`), {
        name: "Teammates Persona Org",
        users: [],
        superAdmins: ["admin-1"],
        subscriptionTier: "community",
        seatLimit: 1
      });
    });

    const grant = await grantTestTierToOrg({
      db: adminDb,
      orgId,
      whitelist: [orgId],
      accessLogPath,
      dryRun: false
    });
    expect(grant.applied).toBe(true);

    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      const orgSnap = await getDoc(doc(db, `orgs/${orgId}`));
      expect(orgSnap.data()).toMatchObject({
        name: "[TEST] Teammates Persona Org",
        subscriptionTier: "starter",
        seatLimit: 5,
        subscriptionStatus: "test-grant"
      });
    });

    const adminAuth = { uid: "admin-1", token: { email: "admin@example.org", name: "Admin" } };
    for (let i = 1; i <= 5; i++) {
      const res = await createInvitation.run({
        auth: adminAuth,
        data: { orgId, email: `invite${i}@example.org`, role: "member" }
      });
      expect(res.success).toBe(true);
    }

    await expect(
      createInvitation.run({
        auth: adminAuth,
        data: { orgId, email: "invite6@example.org", role: "member" }
      })
    ).rejects.toMatchObject({
      code: "failed-precondition",
      message: expect.stringMatching(/Seat limit \(5\) reached/)
    });

    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      const invitesSnap = await getDocs(collection(db, `orgs/${orgId}/invitations`));
      expect(invitesSnap.docs).toHaveLength(5);
    });
  });

  it("counts existing org members toward seatLimit: 5 and refuses the 6th seat on both createInvitation and acceptInvitation", async () => {
    const orgId = `org-mipa67-members-${Date.now()}`;
    const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "mipa-67-emu-log2-"));
    const accessLogPath = path.join(logDir, "access-log.jsonl");

    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, `orgs/${orgId}`), {
        name: "Five Seat Capacity Org",
        users: ["admin-1"],
        superAdmins: ["admin-1"],
        subscriptionTier: "community",
        seatLimit: 1
      });
    });

    await grantTestTierToOrg({
      db: adminDb,
      orgId,
      whitelist: [orgId],
      accessLogPath,
      dryRun: false
    });

    const adminAuth = { uid: "admin-1", token: { email: "admin@example.org", name: "Admin" } };
    // 1 active member + 4 pending invites = 5 committed seats
    for (let i = 1; i <= 4; i++) {
      const res = await createInvitation.run({
        auth: adminAuth,
        data: { orgId, email: `member${i}@example.org`, role: "member" }
      });
      expect(res.success).toBe(true);
    }

    // 5th pending invite would commit a 6th seat -> refused
    await expect(
      createInvitation.run({
        auth: adminAuth,
        data: { orgId, email: "member5@example.org", role: "member" }
      })
    ).rejects.toMatchObject({
      code: "failed-precondition",
      message: expect.stringMatching(/Seat limit \(5\) reached/)
    });

    // When 5 active members already occupy users[], a 6th user accepting an invitation is refused
    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(
        doc(db, `orgs/${orgId}`),
        { users: ["u1", "u2", "u3", "u4", "u5"] },
        { merge: true }
      );
      await setDoc(doc(db, `orgs/${orgId}/invitations/inv-sixth`), {
        email: "sixth@example.org",
        role: "member",
        orgId
      });
    });

    await expect(
      acceptInvitation.run({
        auth: { uid: "u6", token: { email: "sixth@example.org", email_verified: true, name: "Sixth" } },
        data: { orgId, invitationId: "inv-sixth" }
      })
    ).rejects.toMatchObject({
      code: "failed-precondition",
      message: expect.stringMatching(/reached its seat limit \(5\)/)
    });
  });
});
