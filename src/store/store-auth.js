import { LocalStorage, Loading } from "quasar";
import { firebase, firebaseAuth, firebaseDb } from "boot/firebase";
import { showErrorMessage } from "src/utils/function-show-error-message";

const state = {
  loggedIn: false
};

const mutations = {
  setLoggedIn(state, value) {
    state.loggedIn = value;
  }
};

const actions = {
  registerUser({}, payload) {
    Loading.show();
    firebaseAuth
      .createUserWithEmailAndPassword(payload.email, payload.password)
      .then(cred => {
        return firebaseDb
          .collection("users")
          .doc(cred.user.uid)
          .set({
            registrationTime: firebase.firestore.FieldValue.serverTimestamp()
          });
      })
      .catch(error => {
        showErrorMessage("Error", error.message);
      });
  },
  loginUser({}, payload) {
    Loading.show();
    firebaseAuth
      .signInWithEmailAndPassword(payload.email, payload.password)
      .then(response => {
        //console.log("response: ", response);
        this.$router.push("/");
        Loading.hide();
      })
      .catch(error => {
        showErrorMessage("Error", error.message);
      });
  },
  logoutUser({ dispatch }) {
    //this.detachUserTasksListener();
    dispatch("tasks/detachUserTasksListenerAction", null, { root: true });
    firebaseAuth.signOut();
  },
  handleAuthStateChange({ commit, dispatch }) {
    firebaseAuth.onAuthStateChanged(user => {
      //Loading.hide();
      if (user) {
        // User is signed in.
        commit("setLoggedIn", true);
        LocalStorage.set("loggedIn", true);
        if (this.$router.currentRoute.path == "/auth") {
          this.$router.push("/");
        }
        dispatch("tasks/fbReadData", null, { root: true });
      } else {
        commit("setLoggedIn", false);
        LocalStorage.set("loggedIn", false);
        this.$router.replace("/auth");
        commit("tasks/clearTasks", null, { root: true });
        commit("tasks/setTasksDownloaded", false, { root: true });
        commit("orgs/clearOrgs", null, { root: true });
        commit("orgs/setOrgsDownloaded", false, { root: true });
      }
    });
  }
};

const getters = {};

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters
};
