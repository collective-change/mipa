//import Vue from "vue";
//import { uid, Notify } from "quasar";
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";
//import { vuexfireMutations, firestoreAction } from "vuexfire";
import { showErrorMessage } from "src/functions/function-show-error-message";
import { slugify } from "src/functions/function-slugify";

const state = {
  teams: [],
  data: {},
  teamsDownloaded: false
};

// const mutations = {
//   //synchronous
//   setTeamsDownloaded(state, value) {
//     state.teamsDownloaded = value;
//   }
// };

const actions = {
  //may be asynchronous or synchronous
  updateTeam({ dispatch }, teamUpdates) {
    dispatch("patch", teamUpdates);
  },
  deleteTeam({ dispatch }, id) {
    dispatch("delete", id);
  },
  addTeam({ dispatch }, team) {
    team.users = [firebaseAuth.currentUser.uid];
    team.superAdmins = [firebaseAuth.currentUser.uid];
    team.nameSlug = slugify(team.name);
    dispatch("insert", team);
  },

  fbReadData({ dispatch }) {
    let userId = firebaseAuth.currentUser.uid;
    // dispatch("openDBChannel", {
    //   where: [["users", "array-contains", userId]]
    // })
    dispatch("openDBChannel")
      .catch(function(error) {
        console.log("Error retrieving teams");
        showErrorMessage("Error retrieving teams", error.message);
        this.$router.replace("/auth");
      })
      .then(console.log("data read ", state.data));
    //commit("setTeamsDownloaded", true);
  }
  // fbAddTeam({}, payload) {
  //   //let userId = firebaseAuth.currentUser.uid;
  //   let teamsRef = firebaseDb.collection("teams");
  //   teamsRef
  //     //.doc(payload.id)
  //     //.set(payload.team)
  //     .add(payload.team)
  //     .then(function() {
  //       Notify.create("Team added!");
  //     })
  //     .catch(function(error) {
  //       showErrorMessage("Error adding team", error.message);
  //     });
  // },
  // fbUpdateTeam({}, payload) {
  //   //let userId = firebaseAuth.currentUser.uid;
  //   let teamsRef = firebaseDb.collection("teams");
  //   teamsRef
  //     .doc(payload.id)
  //     .set(payload.updates, { merge: true })
  //     .then(function() {
  //       let keys = Object.keys(payload.updates);
  //       //console.log("keys: ", keys);
  //       Notify.create("Team updated!");
  //     })
  //     .catch(function(error) {
  //       showErrorMessage("Error updating team", error.message);
  //     });
  // },
  // fbDeleteTeam({}, teamId) {
  //   let userId = firebaseAuth.currentUser.uid;
  //   let teamsRef = firebaseDb.collection("teams");
  //   teamsRef
  //     .doc(teamId)
  //     .delete()
  //     .then(function() {
  //       Notify.create("Team deleted!");
  //     })
  //     .catch(function(error) {
  //       showErrorMessage("Error removing team", error.message);
  //     });
  // }
};

export default {
  firestorePath: "teams",
  firestoreRefType: "collection", // or 'doc'
  moduleName: "teams",
  statePropName: "data",
  namespaced: true, // automatically added
  state,
  actions
};
