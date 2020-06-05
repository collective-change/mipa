import { uid, Notify } from "quasar";
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";
import { firestoreAction } from "vuexfire";
import { showErrorMessage } from "src/utils/util-show-error-message";
import { slugify } from "src/utils/util-slugify";

const state = {
  currentOrg: null,
  orgs: null
};

const mutations = {
  clearOrgs(state) {
    state.orgs = null;
  }
};
const actions = {
  updateOrg({ dispatch }, payload) {
    console.log(payload);
    if (payload.updates.name) {
      payload.updates.nameSlug = slugify(payload.updates.name);
    }
    firebaseDb
      .collection("orgs")
      .doc(payload.id)
      .set(payload.updates, { merge: true })
      .then(function() {
        let keys = Object.keys(payload.updates);
        //console.log("keys: ", keys);
        Notify.create("Organization updated!");
      })
      .catch(function(error) {
        showErrorMessage("Error updating organization", error.message);
      });
  },
  deleteOrg({ dispatch }, orgId) {
    //let userId = firebaseAuth.currentUser.uid;
    firebaseDb
      .collection("orgs")
      .doc(orgId)
      .delete()
      .then(function() {
        Notify.create("Org deleted!");
      })
      .catch(function(error) {
        showErrorMessage("Error deleting organization", error.message);
      });
  },
  addOrg({ dispatch }, org) {
    //add organization and its main model
    org.users = [firebaseAuth.currentUser.uid];
    org.superAdmins = [firebaseAuth.currentUser.uid];
    //let timestampNow = firebase.firestore.FieldValue.serverTimestamp();
    org.createTime = firebase.firestore.FieldValue.serverTimestamp();
    org.createdBy = firebaseAuth.currentUser.uid;
    org.nameSlug = slugify(org.name);
    firebaseDb
      .collection("orgs")
      .add(org)
      .then(function(docRef) {
        //console.log(docRef.id);
        dispatch(
          "model/addModel",
          { orgId: docRef.id, modelId: docRef.id },
          { root: true }
        );
        Notify.create("Organization added!");
      })
      .catch(function(error) {
        showErrorMessage("Error adding organization", error.message);
      });
  },
  bindOrgs: firestoreAction(({ bindFirestoreRef }) => {
    let userId = firebaseAuth.currentUser.uid;
    // return the promise returned by `bindFirestoreRef`
    return bindFirestoreRef(
      "orgs",
      firebaseDb
        .collection("orgs")
        .where("users", "array-contains", userId)
        .orderBy("name", "asc")
        .orderBy("goal", "asc"),
      {
        maxRefDepth: 1,
        reset: false,
        wait: true
      }
    );
  }),
  unbindOrgs: firestoreAction(({ unbindFirestoreRef }) => {
    unbindFirestoreRef("orgs", false); //don't reset data when unbinding
  }),

  bindCurrentOrg: firestoreAction(({ bindFirestoreRef }, orgId) => {
    let userId = firebaseAuth.currentUser.uid;
    // return the promise returned by `bindFirestoreRef`
    return bindFirestoreRef(
      "currentOrg",
      firebaseDb.collection("orgs").doc(orgId),
      {
        reset: true,
        maxRefDepth: 1,
        wait: true
      }
    );
  }),

  unbindCurrentOrg: firestoreAction(({ unbindFirestoreRef }) => {
    unbindFirestoreRef("currentOrg", true);
  })
};

export default {
  namespaced: true,
  state,
  mutations,
  actions
};
