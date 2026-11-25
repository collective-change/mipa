import { describe, it, beforeAll, afterAll } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} from "@firebase/rules-unit-testing";
import fs from "fs";
import path from "path";
import { doc, getDoc, setDoc, query, collectionGroup, where, getDocs, addDoc, collection } from "firebase/firestore";

describe("MIPA-18: Invitations & Early Access Rules (Emulator Verified)", { timeout: 60000 }, () => {
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

  it("verifies permissions for unauthenticated, stranger, invited, and admin accounts", async () => {
    const orgId = `org-invite-${Date.now()}`;
    const inviteId = "inv-1";
    const invitedEmail = "leader@tzuchi.org.tw";

    // 1. Seed org and invitation as admin
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, `orgs/${orgId}`), {
        name: "Disaster Relief Org",
        users: ["admin-uid"],
        superAdmins: ["admin-uid"],
        seatLimit: 5
      });
      await setDoc(doc(adminDb, `orgs/${orgId}/invitations/${inviteId}`), {
        email: invitedEmail,
        role: "member",
        orgId,
        orgName: "Disaster Relief Org",
        invitedBy: "admin-uid"
      });
    });

    // 2. Unauthenticated context: MUST be denied reading invitations
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(unauthDb, `orgs/${orgId}/invitations/${inviteId}`)));
    await assertFails(getDocs(query(collectionGroup(unauthDb, "invitations"), where("email", "==", invitedEmail))));

    // 3. Stranger signed in (different email): MUST be denied reading this invitation
    const strangerDb = testEnv.authenticatedContext("stranger-uid", {
      email: "stranger@other.org"
    }).firestore();
    await assertFails(getDoc(doc(strangerDb, `orgs/${orgId}/invitations/${inviteId}`)));
    await assertFails(getDocs(query(collectionGroup(strangerDb, "invitations"), where("email", "==", invitedEmail))));

    // 4. Invited user signed in (matching email): MUST succeed reading direct doc and collectionGroup
    const invitedDb = testEnv.authenticatedContext("invited-uid", {
      email: invitedEmail,
      email_verified: true
    }).firestore();
    await assertSucceeds(getDoc(doc(invitedDb, `orgs/${orgId}/invitations/${inviteId}`)));
    await assertSucceeds(getDocs(query(collectionGroup(invitedDb, "invitations"), where("email", "==", invitedEmail))));

    // 5. Invited user with mixed-case email token: MUST succeed
    const mixedCaseDb = testEnv.authenticatedContext("mixed-uid", {
      email: "Leader@TzuChi.Org.TW",
      email_verified: true
    }).firestore();
    await assertSucceeds(getDoc(doc(mixedCaseDb, `orgs/${orgId}/invitations/${inviteId}`)));
    await assertSucceeds(getDocs(query(collectionGroup(mixedCaseDb, "invitations"), where("email", "==", invitedEmail))));

    // 6. Org Admin: MUST succeed reading all org invitations and creating new ones
    const adminDb = testEnv.authenticatedContext("admin-uid", {
      email: "admin@tzuchi.org.tw"
    }).firestore();
    await assertSucceeds(getDoc(doc(adminDb, `orgs/${orgId}/invitations/${inviteId}`)));
    await assertSucceeds(
      setDoc(doc(adminDb, `orgs/${orgId}/invitations/inv-new`), {
        email: "newcolleague@tzuchi.org.tw",
        role: "member",
        orgId,
        invitedBy: "admin-uid"
      })
    );

    // 7. Non-admin cannot create invitations in org
    await assertFails(
      setDoc(doc(invitedDb, `orgs/${orgId}/invitations/inv-bad`), {
        email: "bad@tzuchi.org.tw",
        role: "member",
        orgId,
        invitedBy: "invited-uid"
      })
    );
  });
});
