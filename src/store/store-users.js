import { defineStore } from "pinia";
import { firebaseDb, firebaseAuth } from "@/boot/firebase";
import { collection, doc, setDoc } from "firebase/firestore";
import { firestoreAction } from "./firestore-bind";
import { showErrorMessage } from "@/utils/util-show-error-message";

export const useUsersStore = defineStore("users", {
  state: () => ({
    currentUser: null,
    currentOrgUsers: null
  }),

  getters: {
    orgUsers: (state) => {
      if (!state.currentOrgUsers) {
        return [];
      }
      return state.currentOrgUsers.map((user) => ({ ...user, id: user.id }));
    }
  },

  actions: {
    updateUser(payload) {
      return setDoc(doc(firebaseDb, "users", payload.id), payload.updates, {
        merge: true
      }).catch(function (error) {
        showErrorMessage("Error updating user information", error.message);
      });
    },

    bindCurrentUser: firestoreAction(({ bindFirestoreRef }) => {
      const userId = firebaseAuth.currentUser.uid;
      return bindFirestoreRef(
        "currentUser",
        doc(firebaseDb, "users", userId),
        {
          wait: true // this also forces reset: false
        }
      );
    }),

    unbindCurrentUser: firestoreAction(({ unbindFirestoreRef }) => {
      unbindFirestoreRef("currentUser", false); // don't reset data when unbinding
    }),

    // Members' names and emails, from orgs/{orgId}/members (the users
    // collection is private to each user).
    bindCurrentOrgUsers: firestoreAction(({ bindFirestoreRef }, orgId) => {
      return bindFirestoreRef(
        "currentOrgUsers",
        collection(firebaseDb, "orgs", orgId, "members"),
        {
          wait: true // this also forces reset: false
        }
      );
    }),

    unbindCurrentOrgUsers: firestoreAction(({ unbindFirestoreRef }) => {
      unbindFirestoreRef("currentOrgUsers", true);
    })
  }
});

export default useUsersStore;
