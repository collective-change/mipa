import Vue from "vue";
import { uid, Notify } from "quasar";
import { firebase, firebaseDb, firebaseAuth } from "boot/firebase";
import { firestoreAction } from "vuexfire";
import { showErrorMessage } from "src/functions/function-show-error-message";

const state = {
  nodes: {
    a: {
      id: "a",
      name: "A"
      // name: { en: "A", zh_tw: "甲" },
      // formula: {}, //a formula object
      // unit: { id: 287, unitObject: {} },
      // hasDetails: ["notes", "refUrls"],
      // chatId: "achat"
    },
    b: { id: "b", name: "B" },
    c: { id: "c", name: "C" },
    d: { id: "d", name: "D" },
    e: { id: "e", name: "E" },
    f: { id: "f", name: "F" },
    g: { id: "g", name: "G" }
  },
  links: {
    //in the objects below, so=source, ta=target, pd=partial derivative, cm=current multiplier
    // l1: { so: "a", ta: "b", pd: {}, cm: 2 },
    // l2: { so: "a", ta: "c", pd: {}, cm: 20 },
    // l3: { so: "a", ta: "f", pd: {}, cm: 10 },
    // l4: { so: "b", ta: "d", pd: {}, cm: 50 },
    // l5: { so: "c", ta: "f", pd: {}, cm: 1 },
    // l6: { so: "d", ta: "g", pd: {}, cm: 0.1 },
    // l7: { so: "e", ta: "f", pd: {}, cm: 5 }
    l1: { id: "l1", source: "a", target: "b", pd: {}, cm: 2 },
    l2: { id: "l2", source: "a", target: "c", pd: {}, cm: 20 },
    l3: { id: "l3", source: "a", target: "f", pd: {}, cm: 10 },
    l4: { id: "l4", source: "b", target: "d", pd: {}, cm: 50 },
    l5: { id: "l5", source: "c", target: "f", pd: {}, cm: 1 },
    l6: { id: "l6", source: "d", target: "f", pd: {}, cm: 1 },
    l7: { id: "l7", source: "d", target: "g", pd: {}, cm: 0.1 },
    l8: { id: "l8", source: "e", target: "f", pd: {}, cm: 5 }
  },
  modelDownloaded: false,
  focusedNode: {}
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
  detachUserOrgsListenerAction() {
    this.detachUserOrgsListener();
  },
  fbReadData({ commit }) {
    //console.log("start reading data from Firebase");
    //console.log(firebaseAuth.currentUser.uid);
    let userId = firebaseAuth.currentUser.uid;
    let orgs = firebaseDb.collection("orgs");
    let userOrgs = orgs.where("users", "array-contains", userId);

    // initial check for data
    userOrgs
      .get()
      .then(function(docs) {
        commit("setOrgsDownloaded", true);
        //console.log("downloaded userOrgs: ", docs);
      })
      .catch(function(error) {
        console.log("Error retrieving userOrgs");
        showErrorMessage("Error retrieving orgs", error.message);
        this.$router.replace("/auth");
      });

    this.detachUserOrgsListener = userOrgs.onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === "added") {
          //console.log("New org: ", change.doc.data());
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
  actions
};
