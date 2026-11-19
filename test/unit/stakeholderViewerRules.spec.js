import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} from "@firebase/rules-unit-testing";
import fs from "fs";
import path from "path";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";

describe("MIPA-15: Stakeholder Viewer Firestore Security Rules (Emulator Verified)", { timeout: 60000 }, () => {
  let testEnv;

  beforeAll(async () => {
    const rules = fs.readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf8");
    testEnv = await initializeTestEnvironment({
      projectId: "demo-mipa",
      firestore: {
        host: "127.0.0.1",
        port: 5002,
        rules
      }
    });
  }, 60000);

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  }, 30000);

  it("proves that a stakeholder viewer can read models, nodes, and snapshots, but is refused on EVERY write path", async () => {
    const unique = Date.now();
    const modelId = `model-stakeholder-${unique}`;
    const orgId = `org-stakeholder-${unique}`;

    // 1. Seed initial data as admin using testEnv.withSecurityRulesDisabled
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      // Org doc
      await setDoc(doc(adminDb, `orgs/${orgId}`), {
        name: "Community Org",
        users: ["admin-1"],
        superAdmins: ["admin-1"],
        seatLimit: 1
      });
      // Model doc with owners, editors, and viewers (both UID and email)
      await setDoc(doc(adminDb, `models/${modelId}`), {
        name: "Community Model",
        isPublic: false,
        orgId,
        owners: { users: ["admin-1"] },
        editors: { users: ["editor-1"] },
        viewers: {
          users: ["viewer-uid"],
          emails: ["viewer@stakeholder.org"]
        }
      });
      // Node doc inside model
      await setDoc(doc(adminDb, `models/${modelId}/nodes/node-1`), {
        name: "Cash Reserves",
        symbol: "cash",
        formula: "100"
      });
      // Snapshot doc inside model
      await setDoc(doc(adminDb, `models/${modelId}/snapshots/snap-1`), {
        title: "Q4 Baseline",
        nodesCount: 1
      });
      // Action doc
      await setDoc(doc(adminDb, `actions/action-1`), {
        title: "Launch Volunteer Drive",
        orgId
      });
    });

    // 2. Viewer signed in by UID
    const viewerContext = testEnv.authenticatedContext("viewer-uid", {
      email: "other@example.com",
      email_verified: true
    });
    const viewerDb = viewerContext.firestore();

    // READ PATHS: Must succeed for viewer
    await assertSucceeds(getDoc(doc(viewerDb, `models/${modelId}`)));
    await assertSucceeds(getDoc(doc(viewerDb, `models/${modelId}/nodes/node-1`)));
    await assertSucceeds(getDoc(doc(viewerDb, `models/${modelId}/snapshots/snap-1`)));

    // WRITE PATHS: Every write path MUST be refused for viewer
    await assertFails(updateDoc(doc(viewerDb, `models/${modelId}`), { name: "Malicious Edit" }));
    await assertFails(deleteDoc(doc(viewerDb, `models/${modelId}`)));
    await assertFails(setDoc(doc(viewerDb, `models/${modelId}/nodes/node-new`), { name: "Rogue Node" }));
    await assertFails(updateDoc(doc(viewerDb, `models/${modelId}/nodes/node-1`), { formula: "999" }));
    await assertFails(deleteDoc(doc(viewerDb, `models/${modelId}/nodes/node-1`)));
    await assertFails(setDoc(doc(viewerDb, `models/${modelId}/snapshots/snap-new`), { title: "Rogue Snap" }));
    await assertFails(setDoc(doc(viewerDb, `actions/action-new`), { title: "Rogue Action", orgId }));
    await assertFails(updateDoc(doc(viewerDb, `actions/action-1`), { title: "Modified Action" }));
    await assertFails(deleteDoc(doc(viewerDb, `actions/action-1`)));

    // 3. Viewer signed in by email (different UID but matching viewer email)
    const emailViewerContext = testEnv.authenticatedContext("viewer-diff-uid", {
      email: "viewer@stakeholder.org",
      email_verified: true
    });
    const emailViewerDb = emailViewerContext.firestore();

    await assertSucceeds(getDoc(doc(emailViewerDb, `models/${modelId}`)));
    await assertSucceeds(getDoc(doc(emailViewerDb, `models/${modelId}/nodes/node-1`)));
    await assertSucceeds(getDoc(doc(emailViewerDb, `models/${modelId}/snapshots/snap-1`)));
    await assertFails(updateDoc(doc(emailViewerDb, `models/${modelId}`), { name: "Malicious Edit" }));
    await assertFails(setDoc(doc(emailViewerDb, `models/${modelId}/nodes/node-email`), { name: "Rogue Node" }));

    // 4. Stranger signed in (uninvited, not in editors or viewers)
    const strangerContext = testEnv.authenticatedContext("stranger-uid", {
      email: "stranger@unknown.com"
    });
    const strangerDb = strangerContext.firestore();

    await assertFails(getDoc(doc(strangerDb, `models/${modelId}`)));
    await assertFails(getDoc(doc(strangerDb, `models/${modelId}/nodes/node-1`)));
    await assertFails(getDoc(doc(strangerDb, `models/${modelId}/snapshots/snap-1`)));

    // 5. Editor signed in: can update model and write nodes
    const editorContext = testEnv.authenticatedContext("editor-1", {
      email: "editor@collective-change.org"
    });
    const editorDb = editorContext.firestore();

    await assertSucceeds(updateDoc(doc(editorDb, `models/${modelId}`), { name: "Legitimate Update" }));
    await assertSucceeds(setDoc(doc(editorDb, `models/${modelId}/nodes/node-2`), {
      name: "New Factor",
      symbol: "nf",
      formula: "50"
    }));
  });

  it("proves that an org-level viewer (viewers.org) can read models, nodes, and snapshots, while non-members are denied and writes are refused (MIPA-51)", async () => {
    const unique = Date.now() + 1;
    const modelId = `model-org-viewer-${unique}`;
    const orgId = `org-mipa-ops-${unique}`;
    const otherOrgId = `org-other-${unique}`;

    // Seed data: legacy model where viewers = { org: [orgId] } and no viewers.users / viewers.emails
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      // Target Org doc with two members: creator/editor and regular member
      await setDoc(doc(adminDb, `orgs/${orgId}`), {
        name: "Mipa Ops Org",
        users: ["editor-uid", "org-member-uid"],
        superAdmins: ["editor-uid"],
        seatLimit: 5
      });
      // Other Org doc
      await setDoc(doc(adminDb, `orgs/${otherOrgId}`), {
        name: "Other Org",
        users: ["other-org-user-uid"],
        superAdmins: ["other-org-user-uid"]
      });
      // Model carrying the legacy viewers.org shape
      await setDoc(doc(adminDb, `models/${modelId}`), {
        name: "Main",
        isPublic: false,
        orgId,
        owners: { users: ["editor-uid"] },
        editors: { users: ["editor-uid"] },
        viewers: {
          org: [orgId]
        }
      });
      // Node inside model
      await setDoc(doc(adminDb, `models/${modelId}/nodes/node-alpha`), {
        name: "Gross Margin",
        symbol: "gm",
        formula: "0.45"
      });
      // Snapshot inside model
      await setDoc(doc(adminDb, `models/${modelId}/snapshots/snap-init`), {
        title: "Initial Snapshot",
        nodesCount: 1
      });
    });

    // 1. Regular org member (in org.users, but NOT in editors.users or viewers.users)
    const orgMemberContext = testEnv.authenticatedContext("org-member-uid", {
      email: "member@mipa-ops.org",
      email_verified: true
    });
    const orgMemberDb = orgMemberContext.firestore();

    // Must SUCCEED reading model, nodes, and snapshots
    await assertSucceeds(getDoc(doc(orgMemberDb, `models/${modelId}`)));
    await assertSucceeds(getDoc(doc(orgMemberDb, `models/${modelId}/nodes/node-alpha`)));
    await assertSucceeds(getDoc(doc(orgMemberDb, `models/${modelId}/snapshots/snap-init`)));

    // Must FAIL on all write operations
    await assertFails(updateDoc(doc(orgMemberDb, `models/${modelId}`), { name: "Hacked Main" }));
    await assertFails(deleteDoc(doc(orgMemberDb, `models/${modelId}`)));
    await assertFails(setDoc(doc(orgMemberDb, `models/${modelId}/nodes/node-rogue`), { name: "Rogue Node" }));
    await assertFails(updateDoc(doc(orgMemberDb, `models/${modelId}/nodes/node-alpha`), { formula: "0.99" }));
    await assertFails(deleteDoc(doc(orgMemberDb, `models/${modelId}/nodes/node-alpha`)));
    await assertFails(setDoc(doc(orgMemberDb, `models/${modelId}/snapshots/snap-rogue`), { title: "Rogue Snap" }));

    // 2. User from a DIFFERENT org (in otherOrg.users, NOT in target org)
    const otherOrgUserContext = testEnv.authenticatedContext("other-org-user-uid", {
      email: "stranger@other-org.com"
    });
    const otherOrgUserDb = otherOrgUserContext.firestore();

    // Must FAIL reading model, nodes, and snapshots
    await assertFails(getDoc(doc(otherOrgUserDb, `models/${modelId}`)));
    await assertFails(getDoc(doc(otherOrgUserDb, `models/${modelId}/nodes/node-alpha`)));
    await assertFails(getDoc(doc(otherOrgUserDb, `models/${modelId}/snapshots/snap-init`)));

    // 3. User with no org at all
    const noOrgUserContext = testEnv.authenticatedContext("lonely-user-uid", {
      email: "lonely@nowhere.com"
    });
    const noOrgUserDb = noOrgUserContext.firestore();

    await assertFails(getDoc(doc(noOrgUserDb, `models/${modelId}`)));
    await assertFails(getDoc(doc(noOrgUserDb, `models/${modelId}/nodes/node-alpha`)));
    await assertFails(getDoc(doc(noOrgUserDb, `models/${modelId}/snapshots/snap-init`)));

    // 4. Also verify string form: viewers: { org: orgId }
    const modelStringId = `model-org-string-${unique}`;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, `models/${modelStringId}`), {
        name: "Main String Form",
        isPublic: false,
        orgId,
        owners: { users: ["editor-uid"] },
        editors: { users: ["editor-uid"] },
        viewers: {
          org: orgId
        }
      });
      await setDoc(doc(adminDb, `models/${modelStringId}/nodes/node-beta`), {
        name: "Operating Costs",
        symbol: "opex",
        formula: "5000"
      });
    });

    await assertSucceeds(getDoc(doc(orgMemberDb, `models/${modelStringId}`)));
    await assertSucceeds(getDoc(doc(orgMemberDb, `models/${modelStringId}/nodes/node-beta`)));
    await assertFails(getDoc(doc(otherOrgUserDb, `models/${modelStringId}`)));
    await assertFails(getDoc(doc(otherOrgUserDb, `models/${modelStringId}/nodes/node-beta`)));
  });
});
