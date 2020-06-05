//import Vue from "vue";
import { Notify } from "quasar";
import { firebase, firebaseDb, firebaseAuth } from "boot/firebase";
import { firestoreAction } from "vuexfire";
import { showErrorMessage } from "src/utils/util-show-error-message";
import { slugify } from "src/utils/util-slugify";

const state = {
  teams: null,
  currentTeam: null,
  teamsDownloaded: false
};

const actions = {
  //may be asynchronous or synchronous
  bindTeams: firestoreAction(({ bindFirestoreRef }) => {
    let userId = firebaseAuth.currentUser.uid;
    // return the promise returned by `bindFirestoreRef`
    return bindFirestoreRef(
      "teams",
      firebaseDb
        .collection("teams")
        .where("users", "array-contains", userId)
        .orderBy("name", "asc")
        .orderBy("goal", "asc"),
      {
        reset: false,
        maxRefDepth: 1,
        wait: true
      }
    );
  }),

  unbindTeams: firestoreAction(({ unbindFirestoreRef }) => {
    unbindFirestoreRef("teams", false);
  }),

  bindCurrentTeam: firestoreAction(({ bindFirestoreRef }, teamId) => {
    return bindFirestoreRef(
      "currentTeam",
      firebaseDb.collection("teams").doc(teamId),
      {
        maxRefDepth: 1,
        reset: true,
        wait: true
      }
    );
  }),

  unbindCurrentTeam: firestoreAction(({ unbindFirestoreRef }) => {
    unbindFirestoreRef("currentTeam", true);
  }),

  addTeam({}, team) {
    team.users = [firebaseAuth.currentUser.uid];
    team.superAdmins = [firebaseAuth.currentUser.uid];
    team.nameSlug = slugify(team.name);
    team.createTime = firebase.firestore.FieldValue.serverTimestamp();
    team.createdBy = firebaseAuth.currentUser.uid;
    firebaseDb
      .collection("teams")
      .add(team)
      .then(function() {
        Notify.create("Team added!");
      })
      .catch(function(error) {
        showErrorMessage("Error adding team", error.message);
      });
  },

  updateTeam({}, payload) {
    payload.updates.updateTime = firebase.firestore.FieldValue.serverTimestamp();
    payload.updates.updatedBy = firebaseAuth.currentUser.uid;
    payload.updates.nameSlug = slugify(payload.updates.name);
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

  deleteTeam({}, id) {
    //let userId = firebaseAuth.currentUser.uid;
    firebaseDb
      .collection("teams")
      .doc(id)
      .delete()
      .then(function() {
        Notify.create("Team deleted!");
      })
      .catch(function(error) {
        showErrorMessage("Error delete team", error.message);
      });
  }
};

export default {
  namespaced: true,
  state,
  actions
};
