import Vue from "vue";
import { uid, Notify } from "quasar";
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";
import { showErrorMessage } from "src/functions/function-show-error-message";
import { slugify } from "src/functions/function-slugify";

const state = {
  orgs: {
    // ID1: {
    //   name: "Org 1"
    // },
    // ID2: {
    //   name: "Org 2"
    // },
    // ID3: {
    //   name: "Org 3"
    // }
  },
  orgsDownloaded: false
};

const mutations = {
  //synchronous
  updateOrg(state, payload) {
    Object.assign(state.orgs[payload.id], payload.updates);
  },
  deleteOrg(state, id) {
    Vue.delete(state.orgs, id);
  },
  addOrg(state, payload) {
    Vue.set(state.orgs, payload.id, payload.org);
  },
  clearOrgs(state) {
    state.orgs = {};
  },
  setSearch(state, value) {
    state.search = value;
  },
  setSort(state, value) {
    state.sort = value;
  },
  setOrgsDownloaded(state, value) {
    state.orgsDownloaded = value;
  }
};

const actions = {
  //may be asynchronous or synchronous
  updateOrg({ dispatch }, payload) {
    dispatch("fbUpdateOrg", payload);
  },
  deleteOrg({ dispatch }, id) {
    dispatch("fbDeleteOrg", id);
  },
  addOrg({ dispatch }, org) {
    org.users = [firebaseAuth.currentUser.uid];
    org.superAdmins = [firebaseAuth.currentUser.uid];
    //let timestampNow = firebase.firestore.FieldValue.serverTimestamp();
    org.createTime = firebase.firestore.FieldValue.serverTimestamp();
    org.createdBy = firebaseAuth.currentUser.uid;
    org.nameSlug = slugify(org.name);
    let payload = {
      org: org
    };
    dispatch("fbAddOrg", payload);
  },
  setSearch({ commit }, value) {
    commit("setSearch", value);
  },
  setSort({ commit }, value) {
    commit("setSort", value);
  },
  //detachListener() {},
  fbReadData({ commit }) {
    console.log("start reading data from Firebase");
    let userId = firebaseAuth.currentUser.uid;
    //userId = "AOoVZSkgp2WYae35UPLb8zqsL7A3";
    let orgs = firebaseDb.collection("orgs");
    let userOrgs = orgs.where("users", "array-contains", userId);

    // initial check for data
    userOrgs
      .get()
      .then(function(docs) {
        commit("setOrgsDownloaded", true);
        console.log("downloaded userOrgs: ", docs);
      })
      .catch(function(error) {
        console.log("Error retrieving userOrgs");
        showErrorMessage("Error retrieving orgs", error.message);
        this.$router.replace("/auth");
      });

    this.detachListener = userOrgs.onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === "added") {
          console.log("New org: ", change.doc.data());
          let payload = {
            id: change.doc.id,
            org: change.doc.data()
          };
          commit("addOrg", payload);
        }
        if (change.type === "modified") {
          //console.log("Modified org: ", change.doc.data());
          let payload = {
            id: change.doc.id,
            updates: change.doc.data()
          };
          commit("updateOrg", payload);
        }
        if (change.type === "removed") {
          commit("deleteOrg", change.doc.id);
        }
      });
    });
  },
  fbAddOrg({}, payload) {
    //let userId = firebaseAuth.currentUser.uid;
    let orgsRef = firebaseDb.collection("orgs");
    orgsRef
      //.doc(payload.id)
      //.set(payload.org)
      .add(payload.org)
      .then(function() {
        Notify.create("Organization added!");
      })
      .catch(function(error) {
        showErrorMessage("Error adding organization", error.message);
      });
  },
  fbUpdateOrg({}, payload) {
    //let userId = firebaseAuth.currentUser.uid;
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
  fbDeleteOrg({}, orgId) {
    let userId = firebaseAuth.currentUser.uid;
    let orgsRef = firebaseDb.collection("orgs");
    orgsRef
      .doc(orgId)
      .delete()
      .then(function() {
        Notify.create("Org deleted!");
      })
      .catch(function(error) {
        showErrorMessage("Error removing organization", error.message);
      });
  }
};

export default {
  namespaced: true,
  state,
  mutations,
  actions
};
