import { firebaseDb } from "@/boot/firebase";
import { collection, addDoc, serverTimestamp, getDocs, query, collectionGroup, where } from "firebase/firestore";

export const ALLOWED_SECTORS = [
  "foundation",
  "ngo",
  "academic",
  "government",
  "social_enterprise",
  "consulting",
  "other"
];

const EMAIL_REGEX = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

/**
 * Validate an early access waitlist payload.
 *
 * @param {Object} payload
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateWaitlistPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Invalid payload" };
  }

  const email = (payload.email || "").trim().toLowerCase();
  if (!email || !EMAIL_REGEX.test(email)) {
    return { valid: false, error: "Invalid email address" };
  }

  if (payload.name && typeof payload.name === "string" && payload.name.trim().length > 100) {
    return { valid: false, error: "Name too long (max 100 characters)" };
  }

  if (payload.orgName && typeof payload.orgName === "string" && payload.orgName.trim().length > 150) {
    return { valid: false, error: "Organization name too long (max 150 characters)" };
  }

  if (payload.note && typeof payload.note === "string" && payload.note.trim().length > 1000) {
    return { valid: false, error: "Note too long (max 1000 characters)" };
  }

  return { valid: true };
}

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
    console.warn("Could not query invitations for early access check:", err);
    return false;
  }
}

/**
 * Submit an early access application to Firestore.
 *
 * @param {Object} payload
 * @returns {Promise<{ success: boolean, id?: string, error?: string }>}
 */
export async function submitEarlyAccessRequest(payload) {
  const validation = validateWaitlistPayload(payload);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const cleanData = {
    email: payload.email.trim().toLowerCase(),
    name: (payload.name || "").trim(),
    orgName: (payload.orgName || "").trim(),
    sector: payload.sector || "ngo",
    note: (payload.note || "").trim(),
    locale: payload.locale || "en-us",
    status: "pending",
    submittedAt: serverTimestamp()
  };

  const docRef = await addDoc(collection(firebaseDb, "earlyAccessRequests"), cleanData);
  return { success: true, id: docRef.id };
}
