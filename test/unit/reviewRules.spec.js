import { describe, it, beforeAll, afterAll } from "vitest";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import fs from "fs";
import path from "path";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";

// MIPA-43: automated reviews are written once by Cloud Functions and never
// edited from a browser, so a stored review keeps the version it used.
describe("MIPA-43: review records rules (Emulator Verified)", { timeout: 60000 }, () => {
  let testEnv;

  beforeAll(async () => {
    const rules = fs.readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf8");
    testEnv = await initializeTestEnvironment({
      projectId: "demo-mipa",
      firestore: { host: "127.0.0.1", port: 5002, rules }
    });
  }, 60000);

  afterAll(async () => {
    if (testEnv) await testEnv.cleanup();
  }, 30000);

  it("members read reviews; nobody writes, edits or deletes them from a browser", async () => {
    const orgId = `org-review-${Date.now()}`;
    const reviewPath = `orgs/${orgId}/reviews/key1`;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, `orgs/${orgId}`), { users: ["member", "admin"], superAdmins: ["admin"] });
      await setDoc(doc(db, `orgs/${orgId}/members/member`), { role: "member" });
      await setDoc(doc(db, `orgs/${orgId}/members/admin`), { role: "admin" });
      await setDoc(doc(db, reviewPath), {
        provenance: { provider: "anthropic", model: "claude-3-5-sonnet-20241022", methodologyVersion: "1.0.0" }
      });
    });

    const member = testEnv.authenticatedContext("member").firestore();
    const admin = testEnv.authenticatedContext("admin").firestore();
    const stranger = testEnv.authenticatedContext("stranger").firestore();
    const anon = testEnv.unauthenticatedContext().firestore();

    await assertSucceeds(getDoc(doc(member, reviewPath)));
    await assertFails(getDoc(doc(stranger, reviewPath)));
    await assertFails(getDoc(doc(anon, reviewPath)));

    for (const db of [member, admin]) {
      await assertFails(setDoc(doc(db, `orgs/${orgId}/reviews/forged`), { provenance: {} }));
      await assertFails(updateDoc(doc(db, reviewPath), { "provenance.model": "claude-opus-5-5" }));
      await assertFails(deleteDoc(doc(db, reviewPath)));
    }
  });
});
