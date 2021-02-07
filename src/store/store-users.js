import { uid, Notify } from "quasar";
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";
import { firestoreAction } from "vuexfire";
import { showErrorMessage } from "src/utils/util-show-error-message";
import { slugify } from "src/utils/util-slugify";

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
    firebaseDb
      .collection("users")
      .doc(payload.id)
      .set(payload.updates, { merge: true })
      .then(function() {
        //let keys = Object.keys(payload.updates);
        //console.log("keys: ", keys);
        //Notify.create("User information updated!");
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
      firebaseDb.collection("users").doc(userId),
      {
        maxRefDepth: 1,
        wait: true //this also forces reset: false
      }
    );
  }),

  unbindCurrentUser: firestoreAction(({ unbindFirestoreRef }) => {
    unbindFirestoreRef("currentUser", false); //don't reset data when unbinding
  }),

  bindCurrentOrgUsers: firestoreAction(({ bindFirestoreRef }, orgUserIds) => {
    // return the promise returned by `bindFirestoreRef`
    return bindFirestoreRef(
      "currentOrgUsers",
      firebaseDb
        .collection("users")
        .where(firebase.firestore.FieldPath.documentId(), "in", orgUserIds),
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
    let temp = state.currentOrgUsers.map(user => ({ ...user, id: user.uid }));
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
