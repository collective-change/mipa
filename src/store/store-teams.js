import Vue from "vue";
import { uid, Notify } from "quasar";
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";
import { vuexfireMutations, firestoreAction } from "vuexfire";
import { showErrorMessage } from "src/functions/function-show-error-message";
import { slugify } from "src/functions/function-slugify";

const state = {
  teams: {
    // ID1: {
    //   name: "Team 1"
    // },
    // ID2: {
    //   name: "Team 2"
    // },
    // ID3: {
    //   name: "Team 3"
    // }
  },
  teamsDownloaded: false,
  detachUserTeamsListener: null
};

const mutations = {
  //synchronous
  updateTeam(state, payload) {
    Object.assign(state.teams[payload.id], payload.updates);
  },
  deleteTeam(state, id) {
    Vue.delete(state.teams, id);
  },
  addTeam(state, payload) {
    Vue.set(state.teams, payload.id, payload.team);
  },
  clearTeams(state) {
    state.teams = {};
  },
  setSearch(state, value) {
    state.search = value;
  },
  setSort(state, value) {
    state.sort = value;
  },
  setTeamsDownloaded(state, value) {
    state.teamsDownloaded = value;
  }
};
const actions = {
  //may be asynchronous or synchronous

  bindTeams: firestoreAction(({ bindFirestoreRef }) => {
    // return the promise returned by `bindFirestoreRef`
    return bindFirestoreRef(
      "teams",
      firebaseDb.collection("teams").where("users", "array-contains", userId),
      { reset: false }
    );
  }),

  unbindTeams: firestoreAction(({ unbindFirestoreRef }) => {
    unbindFirestoreRef("teams");
  }),

  updateTeam({ dispatch }, payload) {
    dispatch("fbUpdateTeam", payload);
  },
  deleteTeam({ dispatch }, id) {
    dispatch("fbDeleteTeam", id);
  },
  addTeam({ dispatch }, team) {
    team.users = [firebaseAuth.currentUser.uid];
    team.superAdmins = [firebaseAuth.currentUser.uid];
    //let timestampNow = firebase.firestore.FieldValue.serverTimestamp();
    team.createTime = firebase.firestore.FieldValue.serverTimestamp();
    team.createdBy = firebaseAuth.currentUser.uid;
    team.nameSlug = slugify(team.name);
    let payload = {
      team: team
    };
    dispatch("fbAddTeam", payload);
  },
  setSearch({ commit }, value) {
    commit("setSearch", value);
  },
  setSort({ commit }, value) {
    commit("setSort", value);
  },
  detachUserTeamsListenerAction() {
    this.detachUserTeamsListener();
  },
  fbReadData({ commit }) {
    //console.log("start reading data from Firebase");
    //console.log(firebaseAuth.currentUser.uid);
    let userId = firebaseAuth.currentUser.uid;
    let teams = firebaseDb.collection("teams");
    let userTeams = teams.where("users", "array-contains", userId);

    // initial check for data
    userteams
      .get()
      .then(function(docs) {
        commit("setTeamsDownloaded", true);
        //console.log("downloaded userTeams: ", docs);
      })
      .catch(function(error) {
        console.log("Error retrieving userTeams");
        showErrorMessage("Error retrieving teams", error.message);
        this.$router.replace("/auth");
      });

    this.detachUserTeamsListener = userTeams.onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === "added") {
          //console.log("New team: ", change.doc.data());
          let payload = {
            id: change.doc.id,
            team: change.doc.data()
          };
          commit("addTeam", payload);
        }
        if (change.type === "modified") {
          //console.log("Modified team: ", change.doc.data());
          let payload = {
            id: change.doc.id,
            updates: change.doc.data()
          };
          commit("updateTeam", payload);
        }
        if (change.type === "removed") {
          commit("deleteTeam", change.doc.id);
        }
      });
    });
  },
  fbAddTeam({}, payload) {
    //let userId = firebaseAuth.currentUser.uid;
    let teamsRef = firebaseDb.collection("teams");
    teamsRef
      //.doc(payload.id)
      //.set(payload.team)
      .add(payload.team)
      .then(function() {
        Notify.create("Team added!");
      })
      .catch(function(error) {
        showErrorMessage("Error adding team", error.message);
      });
  },
  fbUpdateTeam({}, payload) {
    //let userId = firebaseAuth.currentUser.uid;
    let teamsRef = firebaseDb.collection("teams");
    teamsRef
      .doc(payload.id)
      .set(payload.updates, { merge: true })
      .then(function() {
        let keys = Object.keys(payload.updates);
        //console.log("keys: ", keys);
        Notify.create("Team updated!");
      })
      .catch(function(error) {
        showErrorMessage("Error updating team", error.message);
      });
  },
  fbDeleteTeam({}, teamId) {
    let userId = firebaseAuth.currentUser.uid;
    let teamsRef = firebaseDb.collection("teams");
    teamsRef
      .doc(teamId)
      .delete()
      .then(function() {
        Notify.create("Team deleted!");
      })
      .catch(function(error) {
        showErrorMessage("Error removing team", error.message);
      });
  }
};

export default {
  namespaced: true,
  state,
  mutations,
  actions
};
