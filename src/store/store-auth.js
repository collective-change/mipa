import { LocalStorage, Loading, Notify } from "quasar";
import { firebaseAuth, firebaseDb } from "@/boot/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { showErrorMessage } from "@/utils/util-show-error-message";

const state = {
  loggedIn: false,
  userId: null,
  user: null
};

const mutations = {
  setLoggedIn(state, value) {
    state.loggedIn = value;
  },
  setUserId(state, value) {
    state.userId = value;
  },
  setUser(state, value) {
    state.user = value;
  }
};

const actions = {
  registerUser({}, payload) {
    Loading.show();
    createUserWithEmailAndPassword(firebaseAuth, payload.email, payload.password)
      .then(cred => {
        return setDoc(doc(firebaseDb, "users", cred.user.uid), {
          email: payload.email,
          displayName: payload.email.split("@")[0],
          registrationTime: serverTimestamp()
        });
      })
      .catch(error => {
        showErrorMessage("Error", error.message);
      });
  },
  loginUser({}, payload) {
    Loading.show();
    signInWithEmailAndPassword(firebaseAuth, payload.email, payload.password)
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
    signOut(firebaseAuth);
  },
  sendPasswordResetEmail({}, payload) {
    sendPasswordResetEmail(firebaseAuth, payload.email)
      .then(function() {
        Notify.create("Email sent");
      })
      .catch(error => {
        showErrorMessage("Error", error.message);
      });
  },
  handleAuthStateChange({ commit, dispatch }) {
    onAuthStateChanged(firebaseAuth, user => {
      Loading.hide();
      if (user) {
        // User is signed in.
        commit("setLoggedIn", true);
        commit("setUserId", firebaseAuth.currentUser.uid);
        let authUserInfo = {
          displayName: user.displayName,
          email: user.email,
          emailVerified: user.emailVerified,
          photoURL: user.photoURL,
          uid: user.uid,
          phoneNumber: user.phoneNumber,
          providerData: user.providerData
        };
        commit("setUser", authUserInfo);
        delete authUserInfo.phoneNumber;
        delete authUserInfo.providerData;
        dispatch(
          "users/updateUser",
          { id: user.uid, updates: authUserInfo },
          { root: true }
        );
        LocalStorage.set("loggedIn", true);
        if (this.$router.currentRoute.value.path == "/auth") {
          this.$router.push("/");
        }
      } else {
        commit("setLoggedIn", false);
        commit("setUserId", null);
        commit("setUser", null);
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
