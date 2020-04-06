import Vue from "vue";
import { uid, Notify } from "quasar";
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";
import { firestoreAction } from "vuexfire";
import { showErrorMessage } from "src/utils/util-show-error-message";
import { slugify } from "src/utils/util-slugify";

const state = {
  orgs: null
  //detachUserOrgsListener: null
};

const mutations = {
  //synchronous
  /*updateOrg(state, payload) {
    Object.assign(state.orgs[payload.id], payload.updates);
  },*/
  /*deleteOrg(state, id) {
    Vue.delete(state.orgs, id);
  },*/
  /*addOrg(state, payload) {
    Vue.set(state.orgs, payload.id, payload.org);
  },*/
  clearOrgs(state) {
    state.orgs = {};
  },
  setSearch(state, value) {
    state.search = value;
  },
  setSort(state, value) {
    state.sort = value;
  }
};
const actions = {
  //may be asynchronous or synchronous

  updateOrg({ dispatch }, payload) {
    let orgsRef = firebaseDb.collection("orgs");
    orgsRef
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
    console.log(orgId);
    let orgsRef = firebaseDb.collection("orgs");
    orgsRef
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
    org.users = [firebaseAuth.currentUser.uid];
    org.superAdmins = [firebaseAuth.currentUser.uid];
    //let timestampNow = firebase.firestore.FieldValue.serverTimestamp();
    org.createTime = firebase.firestore.FieldValue.serverTimestamp();
    org.createdBy = firebaseAuth.currentUser.uid;
    org.nameSlug = slugify(org.name);
    let orgsRef = firebaseDb.collection("orgs");
    orgsRef
      //.doc(payload.id)
      //.set(payload.org)
      .add(org)
      .then(function() {
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
        maxRefDepth: 1
      }
    );
  }),
  unbindOrgs: firestoreAction(({ unbindFirestoreRef }) => {
    unbindFirestoreRef("orgs", false); //don't reset data when unbinding
  })
};

export default {
  namespaced: true,
  state,
  mutations,
  actions
};
