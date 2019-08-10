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
  modelDownloaded: false
};

const actions = {
  // //may be asynchronous or synchronous
  // bindTeams: firestoreAction(({ bindFirestoreRef }) => {
  //   // return the promise returned by `bindFirestoreRef`
  //   return bindFirestoreRef("teams", firebaseDb.collection("teams"), {
  //     reset: false
  //   });
  // }),
  // unbindTeams: firestoreAction(({ unbindFirestoreRef }) => {
  //   unbindFirestoreRef("teams");
  // }),
  // addTeam({ }, team) {
  //   team.users = [firebaseAuth.currentUser.uid];
  //   team.superAdmins = [firebaseAuth.currentUser.uid];
  //   team.nameSlug = slugify(team.name);
  //   team.createTime = firebase.firestore.FieldValue.serverTimestamp();
  //   team.createdBy = firebaseAuth.currentUser.uid;
  //   firebaseDb
  //     .collection("teams")
  //     .add(team)
  //     .then(function () {
  //       Notify.create("Team added!");
  //     })
  //     .catch(function (error) {
  //       showErrorMessage("Error adding team", error.message);
  //     });
  // },
  // updateTeam({ }, payload) {
  //   payload.updates.updateTime = firebase.firestore.FieldValue.serverTimestamp();
  //   payload.updates.updatedBy = firebaseAuth.currentUser.uid;
  //   let teamsRef = firebaseDb.collection("teams");
  //   teamsRef
  //     .doc(payload.id)
  //     .set(payload.updates, { merge: true })
  //     .then(function () {
  //       let keys = Object.keys(payload.updates);
  //       //console.log("keys: ", keys);
  //       Notify.create("Team updated!");
  //     })
  //     .catch(function (error) {
  //       showErrorMessage("Error updating team", error.message);
  //     });
  // },
  // deleteTeam({ }, id) {
  //   //let userId = firebaseAuth.currentUser.uid;
  //   firebaseDb
  //     .collection("teams")
  //     .doc(id)
  //     .delete()
  //     .then(function () {
  //       Notify.create("Team deleted!");
  //     })
  //     .catch(function (error) {
  //       showErrorMessage("Error delete team", error.message);
  //     });
  // }
};

export default {
  namespaced: true,
  state,
  actions
};
