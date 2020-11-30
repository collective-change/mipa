import { LocalStorage, Loading, Notify } from "quasar";
import { firebase, firebaseAuth, firebaseDb } from "src/boot/firebase";
import { showErrorMessage } from "src/utils/util-show-error-message";

const state = {
  loggedIn: false,
  userId: null
};

const mutations = {
  setLoggedIn(state, value) {
    state.loggedIn = value;
  },
  setUserId(state, value) {
    state.userId = value;
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
    //dispatch("tasks/detachUserTasksListenerAction", null, { root: true });
    firebaseAuth.signOut();
  },
  sendPasswordResetEmail({}, payload) {
    firebaseAuth
      .sendPasswordResetEmail(payload.email)
      .then(function() {
        Notify.create("Email sent");
      })
      .catch(error => {
        showErrorMessage("Error", error.message);
      });
  },
  handleAuthStateChange({ commit, dispatch }) {
    firebaseAuth.onAuthStateChanged(user => {
      Loading.hide();
      if (user) {
        // User is signed in.
        commit("setLoggedIn", true);
        commit("setUserId", firebaseAuth.currentUser.uid);
        LocalStorage.set("loggedIn", true);
        if (this.$router.currentRoute.path == "/auth") {
          this.$router.push("/");
        }
      } else {
        commit("setLoggedIn", false);
        commit("setUserId", null);
        LocalStorage.set("loggedIn", false);
        this.$router.replace("/auth");
        //commit("tasks/clearTasks", null, { root: true });
        //commit("tasks/setTasksDownloaded", false, { root: true });
        commit("orgs/clearOrgs", null, { root: true });
        //TODO: clear other data from store
        //commit("orgs/setOrgsDownloaded", false, { root: true });
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
