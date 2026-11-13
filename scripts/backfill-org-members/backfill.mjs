#!/usr/bin/env node
// One-time migration for the 2026 security rules: user profiles became
// private, and members of an organization now see each other's name and email
// in orgs/{orgId}/members/{uid}. This copies them there for existing
// organizations. Safe to run more than once.
//
// Usage: node backfill.mjs --project <firebase-project-id> [--dry-run]
// Credentials: Application Default Credentials or GOOGLE_APPLICATION_CREDENTIALS;
// set FIRESTORE_EMULATOR_HOST to run against an emulator.

import { parseArgs } from "node:util";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const { values } = parseArgs({
  options: {
    project: { type: "string" },
    "dry-run": { type: "boolean", default: false }
  }
});
if (!values.project) {
  console.error("Usage: node backfill.mjs --project <firebase-project-id> [--dry-run]");
  process.exit(2);
}

initializeApp(
  process.env.FIRESTORE_EMULATOR_HOST
    ? { projectId: values.project }
    : { projectId: values.project, credential: applicationDefault() }
);
const db = getFirestore();

let written = 0;
let missing = 0;
const orgs = await db.collection("orgs").get();
for (const org of orgs.docs) {
  for (const uid of org.get("users") || []) {
    const user = await db.doc(`users/${uid}`).get();
    if (!user.exists) {
      console.warn(`org ${org.id}: no user profile for ${uid}`);
      missing++;
      continue;
    }
    const email = user.get("email") || "";
    const member = {
      email,
      displayName: user.get("displayName") || email.split("@")[0]
    };
    if (!values["dry-run"]) {
      await db.doc(`orgs/${org.id}/members/${uid}`).set(member, { merge: true });
    }
    written++;
  }
}
console.log(
  `${values["dry-run"] ? "Would write" : "Wrote"} ${written} member entries ` +
    `for ${orgs.size} organizations (${missing} users without a profile).`
);
