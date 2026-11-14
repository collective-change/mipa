import { uid, Notify } from "quasar";
import { firebaseDb, firebaseAuth } from "@/boot/firebase";
import { collection, doc, setDoc } from "firebase/firestore";
import { firestoreAction } from "./firestore-bind";
import { showErrorMessage } from "@/utils/util-show-error-message";
import { slugify } from "@/utils/util-slugify";
import { i18n } from "@/boot/i18n";

const state = {
  currentUser: null,
  currentOrgUsers: null
};

const mutations = {
  /*clearOrgs(state) {
    state.orgs = null;
  }*/
};
const actions = {
  updateUser({ dispatch }, payload) {
    //console.log(payload);
    setDoc(doc(firebaseDb, "users", payload.id), payload.updates, {
      merge: true
    })
      .then(function() {
        //let keys = Object.keys(payload.updates);
        //console.log("keys: ", keys);
        //Notify.create(i18n.global.t("toastUserUpdated"));
      })
      .catch(function(error) {
        showErrorMessage("Error updating user information", error.message);
      });
  },

  bindCurrentUser: firestoreAction(({ bindFirestoreRef }) => {
    let userId = firebaseAuth.currentUser.uid;
    // return the promise returned by `bindFirestoreRef`
    return bindFirestoreRef(
      "currentUser",
      doc(firebaseDb, "users", userId),
      {
        maxRefDepth: 1,
        wait: true //this also forces reset: false
      }
    );
  }),

  unbindCurrentUser: firestoreAction(({ unbindFirestoreRef }) => {
    unbindFirestoreRef("currentUser", false); //don't reset data when unbinding
  }),

  // Members' names and emails, from orgs/{orgId}/members (the users
  // collection is private to each user).
  bindCurrentOrgUsers: firestoreAction(({ bindFirestoreRef }, orgId) => {
    // return the promise returned by `bindFirestoreRef`
    return bindFirestoreRef(
      "currentOrgUsers",
      collection(firebaseDb, "orgs", orgId, "members"),
      {
        maxRefDepth: 1,
        wait: true //this also forces reset: false
      }
    );
  }),

  unbindCurrentOrgUsers: firestoreAction(({ unbindFirestoreRef }) => {
    unbindFirestoreRef("currentOrgUsers", true);
  })
};

const getters = {
  currentOrgUsers: state => {
    if (!state.currentOrgUsers) {
      return [];
    }
    let temp = state.currentOrgUsers.map(user => ({ ...user, id: user.id }));
    return temp;
  }
};

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters
};
