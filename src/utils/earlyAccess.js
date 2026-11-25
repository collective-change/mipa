import { firebaseDb, firebaseFunctions, firebaseAuth } from "@/boot/firebase";
import { httpsCallable } from "firebase/functions";
import { getDocs, query, collectionGroup, where } from "firebase/firestore";

const EMAIL_REGEX = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

/**
 * Check if an email has any pending organization invitations.
 *
 * @param {string} email
 * @returns {Promise<boolean>}
 */
export async function checkEmailHasPendingInvitation(email) {
  if (!email || typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(normalized)) return false;

  try {
    const q = query(collectionGroup(firebaseDb, "invitations"), where("email", "==", normalized));
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (err) {
    console.warn("Could not query invitations for access check:", err);
    return false;
  }
}

/**
 * Verify whether an authenticated user has access (has pending invite or belongs to an org).
 * Queries server-side Cloud Function checkUserAccess first; falls back to authenticated Firestore query.
 *
 * @param {Object} [user]
 * @returns {Promise<{ allowed: boolean, hasInvite: boolean, isMember: boolean }>}
 */
export async function verifyUserAccess(user) {
  const currentUser = user || (firebaseAuth && firebaseAuth.currentUser);
  if (!currentUser) {
    return { allowed: false, hasInvite: false, isMember: false };
  }

  // 1. Server-side verification via Cloud Function
  if (firebaseFunctions) {
    try {
      const fn = httpsCallable(firebaseFunctions, "checkUserAccess");
      const res = await fn();
      if (res && res.data && typeof res.data.allowed === "boolean") {
        return res.data;
      }
    } catch (err) {
      console.warn("checkUserAccess function unavailable, falling back to authenticated query:", err.message);
    }
  }

  // 2. Fallback: authenticated query to invitations
  const email = (currentUser.email || "").trim().toLowerCase();
  if (!email) {
    return { allowed: false, hasInvite: false, isMember: false };
  }

  const hasInvite = await checkEmailHasPendingInvitation(email);
  return { allowed: hasInvite, hasInvite, isMember: false };
}
