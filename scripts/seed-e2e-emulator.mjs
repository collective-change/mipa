import fs from "node:fs";
import path from "node:path";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";

const PROJECT_ID = "demo-mipa";
const AUTH_EMULATOR = "http://127.0.0.1:9099";

async function seedAuthUser(email, password) {
  const clearRes = await fetch(`${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
    method: "DELETE"
  });
  if (!clearRes.ok) {
    throw new Error(`Failed to clear Auth emulator accounts: ${clearRes.status} ${clearRes.statusText}`);
  }

  const signUpRes = await fetch(
    `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true
      })
    }
  );
  if (!signUpRes.ok) {
    const errText = await signUpRes.text();
    throw new Error(`Failed to create emulator E2E user: ${signUpRes.status} ${errText}`);
  }
  const data = await signUpRes.json();
  if (!data.localId) {
    throw new Error("Auth emulator did not return localId for E2E user");
  }
  return data.localId;
}

async function main() {
  const testEmail = process.env.TEST_USER_EMAIL;
  const testPassword = process.env.TEST_USER_PASSWORD;
  if (!testEmail || !testPassword) {
    throw new Error("TEST_USER_EMAIL and TEST_USER_PASSWORD must both be set to seed the E2E emulator");
  }

  const uid = await seedAuthUser(testEmail, testPassword);
  const rules = fs.readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf8");
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: "127.0.0.1",
      port: 5002,
      rules
    }
  });

  try {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, `users/${uid}`), {
        uid,
        email: testEmail,
        displayName: "E2E Viewer"
      });
      await setDoc(doc(db, "orgs/ZpZkSmHRzIpI2CvnR9Lh"), {
        name: "Mipa Ops",
        nameSlug: "mipa-ops",
        users: [uid],
        superAdmins: ["owner-admin-1"],
        admins: ["owner-admin-1"],
        seatLimit: 5
      });
      await setDoc(doc(db, `orgs/ZpZkSmHRzIpI2CvnR9Lh/members/${uid}`), {
        role: "member",
        email: testEmail
      });
      await setDoc(doc(db, "models/ZpZkSmHRzIpI2CvnR9Lh"), {
        name: "Mipa Ops Main Model",
        orgId: "ZpZkSmHRzIpI2CvnR9Lh",
        isOrgMainModel: true,
        isPublic: false,
        owners: { users: ["owner-admin-1"] },
        editors: { users: ["owner-admin-1"] },
        viewers: { org: ["ZpZkSmHRzIpI2CvnR9Lh"], users: [], emails: [] },
        nodeGroups: []
      });
      await setDoc(doc(db, "models/ZpZkSmHRzIpI2CvnR9Lh/nodes/node_1"), {
        id: "node_1",
        name: "Operational Readiness",
        symbol: "readiness",
        symbolFormula: "100",
        sysFormula: "100",
        unit: "points",
        class: "input",
        influencers: [],
        influencees: [],
        blockingInfluencers: [],
        unusedInfluencers: [],
        isNew: false
      });
      await setDoc(doc(db, "models/model-unauthorized"), {
        name: "Restricted Model",
        orgId: "org-unauthorized",
        isOrgMainModel: true,
        isPublic: false,
        owners: { users: ["other-owner"] },
        editors: { users: ["other-owner"] },
        viewers: { org: ["org-unauthorized"], users: [], emails: [] },
        nodeGroups: []
      });
    });
    console.log(`Seeded E2E emulator state for uid=${uid}`);
  } finally {
    await testEnv.cleanup();
  }
}

main().catch(err => {
  console.error("Failed to seed E2E emulator:", err);
  process.exit(1);
});
