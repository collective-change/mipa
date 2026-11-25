// Organization membership: accepting invitations, removing members and
// changing roles. These run on the server so the organization's member lists
// and its models' access lists always change together.
//
// Data:
//   orgs/{orgId}                     users[], superAdmins[] (admins)
//   orgs/{orgId}/members/{uid}       email, displayName (visible to members)
//   orgs/{orgId}/invitations/{id}    email (lowercase), role, orgName,
//                                    invitedBy, invitedByName, createTime
//   models/{modelId}                 viewers.org[] names the organization;
//                                    editors.users[], owners.users[]

import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { Firestore, getFirestore, FieldValue, Transaction } from "firebase-admin/firestore";
import { aiKeyEncryptionKey } from "./ai/keyBox";
import { sendInvitationEmail, SendEmailOptions } from "./notifications/transactionalEmail";

type Role = "member" | "admin";

function requireAuth(request: CallableRequest) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Please sign in.");
  }
  return request.auth;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value === "") {
    throw new HttpsError("invalid-argument", `${name} is required.`);
  }
  return value;
}

function requireRole(value: unknown): Role {
  if (value !== "member" && value !== "admin") {
    throw new HttpsError("invalid-argument", "role must be member or admin.");
  }
  return value;
}

async function orgModelRefs(tx: Transaction, orgId: string) {
  const db = getFirestore();
  const [byOrgId, byLegacy] = await Promise.all([
    tx.get(db.collection("models").where("orgId", "==", orgId)),
    tx.get(db.collection("models").where("viewers.org", "array-contains", orgId))
  ]);
  const refs = new Map<string, FirebaseFirestore.DocumentReference>();
  for (const d of byOrgId.docs) refs.set(d.id, d.ref);
  for (const d of byLegacy.docs) refs.set(d.id, d.ref);
  return Array.from(refs.values());
}

export function checkSeatCapacity(usersCount: number, pendingInvitesCount: number, seatLimit: number): { allowed: boolean; remaining: number } {
  const effectiveLimit = seatLimit > 0 ? seatLimit : 1;
  const used = usersCount + pendingInvitesCount;
  return {
    allowed: used < effectiveLimit,
    remaining: Math.max(0, effectiveLimit - used)
  };
}

/** The signed-in user accepts an invitation addressed to their email. */
export const acceptInvitation = onCall(async (request) => {
  const auth = requireAuth(request);
  const orgId = requireString(request.data?.orgId, "orgId");
  const invitationId = requireString(request.data?.invitationId, "invitationId");
  const email = (auth.token.email || "").toLowerCase();
  if (!auth.token.email_verified) {
    throw new HttpsError(
      "failed-precondition",
      "Please verify your email address before accepting invitations."
    );
  }

  const db = getFirestore();
  const orgRef = db.doc(`orgs/${orgId}`);
  const invitationRef = orgRef.collection("invitations").doc(invitationId);

  await db.runTransaction(async (tx) => {
    const [org, invitation] = await Promise.all([
      tx.get(orgRef),
      tx.get(invitationRef),
    ]);
    if (!org.exists || !invitation.exists) {
      throw new HttpsError("not-found", "This invitation no longer exists.");
    }
    if (invitation.get("email") !== email) {
      throw new HttpsError(
        "permission-denied",
        "This invitation is for a different email address."
      );
    }

    const currentUsers = (org.get("users") as string[]) || [];
    const seatLimit = Number(org.get("seatLimit")) || 1;
    if (!currentUsers.includes(auth.uid) && currentUsers.length >= seatLimit) {
      throw new HttpsError(
        "failed-precondition",
        `The organization has reached its seat limit (${seatLimit}). Please ask an administrator to upgrade the workspace tier.`
      );
    }

    const modelRefs = await orgModelRefs(tx, orgId);

    const role: Role = invitation.get("role") === "admin" ? "admin" : "member";
    tx.update(orgRef, {
      users: FieldValue.arrayUnion(auth.uid),
      ...(role === "admin"
        ? { superAdmins: FieldValue.arrayUnion(auth.uid) }
        : {}),
    });
    tx.set(orgRef.collection("members").doc(auth.uid), {
      email,
      displayName: auth.token.name || email.split("@")[0],
    });
    for (const ref of modelRefs) {
      tx.update(ref, { "editors.users": FieldValue.arrayUnion(auth.uid) });
    }
    tx.delete(invitationRef);
  });
  return { orgId };
});

export interface CreateInvitationInput {
  uid: string;
  callerName?: string;
  callerEmail?: string;
  orgId: string;
  email: string;
  role: Role;
  locale?: string;
}

export async function executeCreateInvitation(
  db: Firestore,
  input: CreateInvitationInput,
  emailOptions?: SendEmailOptions & { throwOnRateLimit?: boolean; throwOnFailure?: boolean }
): Promise<{ success: boolean; invitationId: string; emailSent: boolean; messageId?: string }> {
  const orgRef = db.doc(`orgs/${input.orgId}`);
  const invitationsCol = orgRef.collection("invitations");
  const cleanEmail = input.email.trim().toLowerCase();
  const inviterName = input.callerName || input.callerEmail || "";

  const { invitationId, orgName } = await db.runTransaction(async (tx) => {
    const org = await tx.get(orgRef);
    if (!org.exists) {
      throw new HttpsError("not-found", "Organization does not exist.");
    }
    const superAdmins = (org.get("superAdmins") as string[]) || [];
    if (!superAdmins.includes(input.uid)) {
      throw new HttpsError("permission-denied", "Only administrators can invite new members.");
    }

    const currentUsers = (org.get("users") as string[]) || [];
    const seatLimit = Number(org.get("seatLimit")) || 1;

    // Check pending invitations
    const pendingInvites = await tx.get(invitationsCol);
    const capacity = checkSeatCapacity(currentUsers.length, pendingInvites.docs.length, seatLimit);

    if (!capacity.allowed) {
      throw new HttpsError(
        "failed-precondition",
        `Seat limit (${seatLimit}) reached for this organization tier. Please upgrade your tier or remove inactive members to invite more teammates.`
      );
    }

    const newDocRef = invitationsCol.doc();
    const resolvedOrgName = (org.get("name") as string) || "";
    tx.set(newDocRef, {
      email: cleanEmail,
      role: input.role,
      orgId: input.orgId,
      orgName: resolvedOrgName,
      invitedBy: input.uid,
      invitedByName: inviterName,
      createTime: FieldValue.serverTimestamp()
    });

    return { invitationId: newDocRef.id, orgName: resolvedOrgName };
  });

  const mailRes = await sendInvitationEmail(
    db,
    {
      recipientEmail: cleanEmail,
      orgId: input.orgId,
      orgName,
      role: input.role,
      invitedBy: input.uid,
      invitedByName: inviterName,
      invitationId,
      locale: input.locale
    },
    emailOptions
  );

  const invRef = invitationsCol.doc(invitationId);
  if (typeof invRef?.set === "function") {
    await invRef.set(
      {
        lastSentTime: FieldValue.serverTimestamp(),
        emailDeliveryStatus: mailRes.sent ? "sent" : "failed",
        lastMessageId: mailRes.messageId || null
      },
      { merge: true }
    );
  }

  return {
    success: true,
    invitationId,
    emailSent: mailRes.sent,
    ...(mailRes.messageId ? { messageId: mailRes.messageId } : {})
  };
}

/** An administrator invites someone by email, enforcing tier seat limit and sending invitation email. */
export const createInvitation = onCall({ secrets: [aiKeyEncryptionKey] }, async (request) => {
  const auth = requireAuth(request);
  const orgId = requireString(request.data?.orgId, "orgId");
  const email = requireString(request.data?.email, "email").trim().toLowerCase();
  const role = requireRole(request.data?.role);
  const locale = typeof request.data?.locale === "string" ? request.data.locale : undefined;

  const db = getFirestore();
  return executeCreateInvitation(db, {
    uid: auth.uid,
    callerName: auth.token.name,
    callerEmail: auth.token.email,
    orgId,
    email,
    role,
    locale
  });
});

export interface ResendInvitationInput {
  uid: string;
  callerName?: string;
  callerEmail?: string;
  orgId: string;
  invitationId: string;
  locale?: string;
}

export async function executeResendInvitation(
  db: Firestore,
  input: ResendInvitationInput,
  emailOptions?: SendEmailOptions & { throwOnRateLimit?: boolean; throwOnFailure?: boolean }
): Promise<{ success: boolean; invitationId: string; emailSent: boolean; messageId?: string }> {
  const orgRef = db.doc(`orgs/${input.orgId}`);
  const invitationRef = orgRef.collection("invitations").doc(input.invitationId);
  const [org, invitation] = await Promise.all([orgRef.get(), invitationRef.get()]);

  if (!org.exists) {
    throw new HttpsError("not-found", "Organization does not exist.");
  }
  const superAdmins = (org.get("superAdmins") as string[]) || [];
  if (!superAdmins.includes(input.uid)) {
    throw new HttpsError("permission-denied", "Only administrators can resend invitations.");
  }
  if (!invitation.exists) {
    throw new HttpsError("not-found", "This invitation no longer exists.");
  }

  const email = String(invitation.get("email") || "").trim().toLowerCase();
  const role: Role = invitation.get("role") === "admin" ? "admin" : "member";
  const orgName = String(invitation.get("orgName") || org.get("name") || "");
  const invitedByName = String(
    invitation.get("invitedByName") || input.callerName || input.callerEmail || ""
  );

  const mailRes = await sendInvitationEmail(
    db,
    {
      recipientEmail: email,
      orgId: input.orgId,
      orgName,
      role,
      invitedBy: input.uid,
      invitedByName,
      invitationId: input.invitationId,
      locale: input.locale
    },
    emailOptions
  );

  if (typeof invitationRef.set === "function") {
    await invitationRef.set(
      {
        lastSentTime: FieldValue.serverTimestamp(),
        resendCount: FieldValue.increment(1),
        emailDeliveryStatus: mailRes.sent ? "sent" : "failed",
        lastMessageId: mailRes.messageId || null
      },
      { merge: true }
    );
  }

  return {
    success: true,
    invitationId: input.invitationId,
    emailSent: mailRes.sent,
    ...(mailRes.messageId ? { messageId: mailRes.messageId } : {})
  };
}

/** An administrator resends a pending organization invitation email (rate-limited). */
export const resendInvitation = onCall({ secrets: [aiKeyEncryptionKey] }, async (request) => {
  const auth = requireAuth(request);
  const orgId = requireString(request.data?.orgId, "orgId");
  const invitationId = requireString(request.data?.invitationId, "invitationId");
  const locale = typeof request.data?.locale === "string" ? request.data.locale : undefined;

  const db = getFirestore();
  return executeResendInvitation(db, {
    uid: auth.uid,
    callerName: auth.token.name,
    callerEmail: auth.token.email,
    orgId,
    invitationId,
    locale
  });
});

/**
 * An admin removes a member, or a member leaves (memberId = own uid).
 * The last admin can't leave or be removed.
 */
export const removeMember = onCall(async (request) => {
  const auth = requireAuth(request);
  const orgId = requireString(request.data?.orgId, "orgId");
  const memberId = requireString(request.data?.memberId, "memberId");

  const db = getFirestore();
  const orgRef = db.doc(`orgs/${orgId}`);
  await db.runTransaction(async (tx) => {
    const org = await tx.get(orgRef);
    if (!org.exists) throw new HttpsError("not-found", "Organization not found.");
    const users: string[] = org.get("users") || [];
    const admins: string[] = org.get("superAdmins") || [];
    const callerIsAdmin = admins.includes(auth.uid);
    if (memberId !== auth.uid && !callerIsAdmin) {
      throw new HttpsError("permission-denied", "Only admins can remove members.");
    }
    if (!users.includes(memberId)) {
      throw new HttpsError("not-found", "Not a member of this organization.");
    }
    if (admins.includes(memberId) && admins.length === 1) {
      throw new HttpsError(
        "failed-precondition",
        "Make someone else an admin first: an organization needs at least one admin."
      );
    }
    const modelRefs = await orgModelRefs(tx, orgId);

    tx.update(orgRef, {
      users: FieldValue.arrayRemove(memberId),
      superAdmins: FieldValue.arrayRemove(memberId),
    });
    tx.delete(orgRef.collection("members").doc(memberId));
    for (const ref of modelRefs) {
      tx.update(ref, {
        "editors.users": FieldValue.arrayRemove(memberId),
        "owners.users": FieldValue.arrayRemove(memberId),
      });
    }
  });
  return { orgId };
});

/** An admin makes a member an admin, or an admin a member. */
export const setMemberRole = onCall(async (request) => {
  const auth = requireAuth(request);
  const orgId = requireString(request.data?.orgId, "orgId");
  const memberId = requireString(request.data?.memberId, "memberId");
  const role = requireRole(request.data?.role);

  const db = getFirestore();
  const orgRef = db.doc(`orgs/${orgId}`);
  await db.runTransaction(async (tx) => {
    const org = await tx.get(orgRef);
    if (!org.exists) throw new HttpsError("not-found", "Organization not found.");
    const users: string[] = org.get("users") || [];
    const admins: string[] = org.get("superAdmins") || [];
    if (!admins.includes(auth.uid)) {
      throw new HttpsError("permission-denied", "Only admins can change roles.");
    }
    if (!users.includes(memberId)) {
      throw new HttpsError("not-found", "Not a member of this organization.");
    }
    if (role === "member" && admins.includes(memberId) && admins.length === 1) {
      throw new HttpsError(
        "failed-precondition",
        "An organization needs at least one admin."
      );
    }
    tx.update(orgRef, {
      superAdmins:
        role === "admin"
          ? FieldValue.arrayUnion(memberId)
          : FieldValue.arrayRemove(memberId),
    });
  });
  return { orgId };
});

export async function evaluateUserAccess(
  db: FirebaseFirestore.Firestore,
  uid: string,
  email: string
): Promise<{ allowed: boolean; isMember: boolean; hasInvite: boolean }> {
  const cleanEmail = (email || "").toLowerCase().trim();

  if (uid) {
    const orgsSnap = await db.collection("orgs").where("users", "array-contains", uid).limit(1).get();
    if (!orgsSnap.empty) {
      return { allowed: true, isMember: true, hasInvite: false };
    }
  }

  if (cleanEmail) {
    const invitesSnap = await db.collectionGroup("invitations").where("email", "==", cleanEmail).limit(1).get();
    if (!invitesSnap.empty) {
      return { allowed: true, isMember: false, hasInvite: true };
    }
  }

  return { allowed: false, isMember: false, hasInvite: false };
}

/**
 * Verifies whether the authenticated user has pending invitations or is already an org member.
 * Runs on the server so the client does not rely on unauthenticated or brittle queries.
 */
export const checkUserAccess = onCall(async (request) => {
  const auth = requireAuth(request);
  const email = (auth.token.email || "").toLowerCase().trim();
  const uid = auth.uid;
  const db = getFirestore();
  return evaluateUserAccess(db, uid, email);
});
