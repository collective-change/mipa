import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

function requireAuth(request: CallableRequest) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Please sign in.");
  }
  return request.auth;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpsError("invalid-argument", `${name} is required.`);
  }
  return value.trim();
}

/**
 * Deletes all documents in a specified Firestore collection/subcollection path.
 */
export async function deleteCollectionDocs(
  db: FirebaseFirestore.Firestore,
  collectionPath: string
): Promise<number> {
  const snap = await db.collection(collectionPath).get();
  if (snap.empty) return 0;

  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  return snap.size;
}

/**
 * Handles model deletion for an organization.
 *
 * Grounded in Decision M-6 / M-8 ("Revocation != erasure"):
 * - Publicly published models (isPublic === true) are retained with a dated tombstone/archived marker
 *   so counterparty citations and public register integrity remain intact.
 * - Private models and all private subcollections (nodes, snapshots, aiDrafts) are completely deleted.
 */
export async function handleOrgModelsDeletion(
  db: FirebaseFirestore.Firestore,
  orgId: string,
  deletedByUid: string
): Promise<{ retainedPublicCount: number; deletedPrivateCount: number }> {
  const modelsSnap = await db.collection("models").where("orgId", "==", orgId).get();
  let retainedPublicCount = 0;
  let deletedPrivateCount = 0;

  for (const modelDoc of modelsSnap.docs) {
    const data = modelDoc.data();
    if (data.isPublic === true) {
      // Retain published model with dated revocation notice
      await modelDoc.ref.update({
        isArchived: true,
        revokedAt: new Date().toISOString(),
        revokedBy: deletedByUid,
        archivedReason: "Organization deleted"
      });
      // Purge private drafts subcollection while keeping public nodes
      await deleteCollectionDocs(db, `models/${modelDoc.id}/aiDrafts`);
      retainedPublicCount++;
    } else {
      // Private model: purge all subcollections and delete document
      await deleteCollectionDocs(db, `models/${modelDoc.id}/nodes`);
      await deleteCollectionDocs(db, `models/${modelDoc.id}/snapshots`);
      await deleteCollectionDocs(db, `models/${modelDoc.id}/aiDrafts`);
      await modelDoc.ref.delete();
      deletedPrivateCount++;
    }
  }

  return { retainedPublicCount, deletedPrivateCount };
}

/**
 * Internal helper to delete an entire organization and all its associated
 * private resources while honoring register permanence for published dossiers.
 */
export async function executeOrgDeletion(
  db: FirebaseFirestore.Firestore,
  orgId: string,
  deletedByUid: string
) {
  // 1. Process and clean up models (honoring "Revocation != erasure")
  const modelStats = await handleOrgModelsDeletion(db, orgId, deletedByUid);

  // 2. Delete actions belonging to the org
  const actionsSnap = await db.collection("actions").where("orgId", "==", orgId).get();
  if (!actionsSnap.empty) {
    const batch = db.batch();
    actionsSnap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  // 3. Delete chats belonging to the org
  const chatsSnap = await db.collection("chats").where("orgId", "==", orgId).get();
  if (!chatsSnap.empty) {
    const batch = db.batch();
    chatsSnap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  // 4. Delete org subcollections (members and invitations)
  await deleteCollectionDocs(db, `orgs/${orgId}/members`);
  await deleteCollectionDocs(db, `orgs/${orgId}/invitations`);

  // 5. Delete org AI settings & secrets
  await db.doc(`orgAiSettings/${orgId}`).delete().catch(() => {});
  await db.doc(`orgSecrets/${orgId}`).delete().catch(() => {});

  // 6. Delete the organization document itself
  await db.doc(`orgs/${orgId}`).delete();

  return {
    orgId,
    ...modelStats,
    deletedActionsCount: actionsSnap.size,
    deletedChatsCount: chatsSnap.size
  };
}

/**
 * Callable Function: Delete an organization.
 * Only organization superAdmins may delete the organization.
 */
export const deleteOrganization = onCall(async (request: CallableRequest) => {
  const auth = requireAuth(request);
  const orgId = requireString(request.data?.orgId, "orgId");

  const db = getFirestore();
  const orgDoc = await db.doc(`orgs/${orgId}`).get();
  if (!orgDoc.exists) {
    throw new HttpsError("not-found", "Organization not found.");
  }

  const superAdmins = (orgDoc.get("superAdmins") as string[]) || [];
  if (!superAdmins.includes(auth.uid)) {
    throw new HttpsError(
      "permission-denied",
      "Only organization administrators can delete an organization."
    );
  }

  const result = await executeOrgDeletion(db, orgId, auth.uid);
  return { success: true, ...result };
});

/**
 * Callable Function: Self-service deletion of a user account.
 * - Deletes or disaffiliates from all organizations.
 * - Deletes user's profile document.
 * - Deletes user from Firebase Authentication.
 */
export const deleteUserAccount = onCall(async (request: CallableRequest) => {
  const auth = requireAuth(request);
  const uid = auth.uid;

  const db = getFirestore();

  // 1. Process organizations where the user is listed in users
  const orgsSnap = await db.collection("orgs").where("users", "array-contains", uid).get();
  const deletedOrgs: string[] = [];
  const disaffiliatedOrgs: string[] = [];

  for (const orgDoc of orgsSnap.docs) {
    const orgData = orgDoc.data();
    const users: string[] = orgData.users || [];
    const superAdmins: string[] = orgData.superAdmins || [];

    if (users.length <= 1) {
      // Sole member: execute complete organization deletion
      await executeOrgDeletion(db, orgDoc.id, uid);
      deletedOrgs.push(orgDoc.id);
    } else {
      // Multiple members: remove this user from membership and admin arrays
      const remainingUsers = users.filter((u) => u !== uid);
      let remainingAdmins = superAdmins.filter((u) => u !== uid);
      if (remainingAdmins.length === 0 && remainingUsers.length > 0) {
        // Transfer admin role to first remaining user to avoid orphaned org
        remainingAdmins = [remainingUsers[0]];
      }
      await orgDoc.ref.update({
        users: remainingUsers,
        superAdmins: remainingAdmins
      });
      await db.doc(`orgs/${orgDoc.id}/members/${uid}`).delete().catch(() => {});
      disaffiliatedOrgs.push(orgDoc.id);
    }
  }

  // 2. Delete user profile document
  await db.doc(`users/${uid}`).delete().catch(() => {});

  // 3. Delete user in Firebase Authentication
  try {
    await getAuth().deleteUser(uid);
  } catch (err: unknown) {
    console.warn("Could not delete auth user record (may already be removed):", err);
  }

  return {
    success: true,
    deletedUid: uid,
    deletedOrgs,
    disaffiliatedOrgs
  };
});
