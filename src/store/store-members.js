// Organization membership: invitations, roles and removal.
// Accepting, removing and role changes run in Cloud Functions
// (functions/src/orgMembers.ts) so member lists and model access change
// together; invitations themselves are plain Firestore documents.
import { Notify } from "quasar";
import { httpsCallable } from "firebase/functions";
import { sendEmailVerification } from "firebase/auth";
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  query,
  serverTimestamp,
  where
} from "firebase/firestore";
import { firebaseAuth, firebaseDb, firebaseFunctions } from "@/boot/firebase";
import { firestoreAction } from "./firestore-bind";
import { showErrorMessage } from "@/utils/util-show-error-message";
import { i18n } from "@/boot/i18n";

const t = (key, values) => i18n.global.t(key, values);

async function call(name, data) {
  try {
    await httpsCallable(firebaseFunctions, name)(data);
    return true;
  } catch (error) {
    showErrorMessage(t("Something went wrong"), error.message);
    return false;
  }
}

const state = {
  myInvitations: [],
  orgInvitations: []
};

const actions = {
  async inviteMember({}, { org, email, role }) {
    const user = firebaseAuth.currentUser;
    try {
      await addDoc(collection(firebaseDb, "orgs", org.id, "invitations"), {
        email: email.trim().toLowerCase(),
        role,
        orgId: org.id,
        orgName: org.name,
        invitedBy: user.uid,
        invitedByName: user.email,
        createTime: serverTimestamp()
      });
      Notify.create({ type: "positive", message: t("Invitation created") });
      return true;
    } catch (error) {
      showErrorMessage(t("Something went wrong"), error.message);
      return false;
    }
  },

  // Used by admins (withdraw) and by the invited person (decline).
  async deleteInvitation({}, { orgId, invitationId }) {
    try {
      await deleteDoc(doc(firebaseDb, "orgs", orgId, "invitations", invitationId));
    } catch (error) {
      showErrorMessage(t("Something went wrong"), error.message);
    }
  },

  async acceptInvitation({}, { orgId, invitationId }) {
    const ok = await call("acceptInvitation", { orgId, invitationId });
    if (ok) Notify.create({ type: "positive", message: t("You joined the organization") });
    return ok;
  },

  removeMember({}, { orgId, memberId }) {
    return call("removeMember", { orgId, memberId });
  },

  setMemberRole({}, { orgId, memberId, role }) {
    return call("setMemberRole", { orgId, memberId, role });
  },

  async sendVerificationEmail() {
    try {
      await sendEmailVerification(firebaseAuth.currentUser);
      Notify.create(t("Verification email sent"));
    } catch (error) {
      showErrorMessage(t("Something went wrong"), error.message);
    }
  },

  // After the user clicks the link in the email: refresh the sign-in token
  // so the server sees the verified address. Returns whether it is verified.
  async refreshEmailVerified() {
    const user = firebaseAuth.currentUser;
    await user.reload();
    await user.getIdToken(true);
    return user.emailVerified;
  },

  bindMyInvitations: firestoreAction(({ bindFirestoreRef }) => {
    const email = (firebaseAuth.currentUser.email || "").toLowerCase();
    return bindFirestoreRef(
      "myInvitations",
      query(collectionGroup(firebaseDb, "invitations"), where("email", "==", email)),
      { maxRefDepth: 1, wait: true }
    );
  }),
  unbindMyInvitations: firestoreAction(({ unbindFirestoreRef }) => {
    unbindFirestoreRef("myInvitations", true);
  }),

  bindOrgInvitations: firestoreAction(({ bindFirestoreRef }, orgId) => {
    return bindFirestoreRef(
      "orgInvitations",
      collection(firebaseDb, "orgs", orgId, "invitations"),
      { maxRefDepth: 1, wait: true }
    );
  }),
  unbindOrgInvitations: firestoreAction(({ unbindFirestoreRef }) => {
    unbindFirestoreRef("orgInvitations", true);
  })
};

export default {
  namespaced: true,
  state,
  actions
};
