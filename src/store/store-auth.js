import { LocalStorage, Loading, Notify } from "quasar";
import { firebaseAuth, firebaseDb, firebaseFunctions } from "@/boot/firebase";
import { httpsCallable } from "firebase/functions";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCustomToken,
  getAdditionalUserInfo
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { showErrorMessage } from "@/utils/util-show-error-message";
import { isPublicPath } from "@/router/public-paths";
import { i18n } from "@/boot/i18n";
import { verifyUserAccess, submitEarlyAccessRequest } from "@/utils/earlyAccess";

async function verifyAccessOrGate(result, router) {
  const additional = getAdditionalUserInfo(result);
  if (additional && additional.isNewUser) {
    const user = result.user;
    const email = (user && user.email) || "";
    const access = await verifyUserAccess(user);
    if (!access.allowed) {
      try {
        await submitEarlyAccessRequest({
          email,
          name: user.displayName || email.split("@")[0],
          orgName: "",
          sector: "other",
          note: "Automatic waitlist routing from gated OAuth signup"
        });
      } catch (reqErr) {
        console.warn("Could not record early access request for gated OAuth user:", reqErr);
      }

      try {
        await user.delete();
      } catch (delErr) {
        await signOut(firebaseAuth);
      }

      Notify.create({
        message: i18n.global.t("authPrivatePreviewNotice"),
        type: "info",
        timeout: 7000
      });
      if (router) {
        router.push({
          path: "/auth",
          query: { tab: "waitlist", email: email || "" }
        });
      }
      return false;
    }

    await setDoc(
      doc(firebaseDb, "users", user.uid),
      {
        email,
        displayName: user.displayName || email.split("@")[0],
        registrationTime: serverTimestamp()
      },
      { merge: true }
    );
  }
  return true;
}

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
  async registerUser({}, payload) {
    Loading.show();
    try {
      // 1. Authenticate FIRST: createUserWithEmailAndPassword
      const cred = await createUserWithEmailAndPassword(firebaseAuth, payload.email, payload.password);

      // 2. Verify access server-side (or via authenticated query)
      const access = await verifyUserAccess(cred.user);
      if (!access.allowed) {
        try {
          await submitEarlyAccessRequest({
            email: payload.email,
            name: payload.email.split("@")[0],
            orgName: "",
            sector: "other",
            note: "Automatic waitlist routing from gated registration"
          });
        } catch (reqErr) {
          console.warn("Could not record early access request for gated registration:", reqErr);
        }

        try {
          await cred.user.delete();
        } catch (delErr) {
          await signOut(firebaseAuth);
        }

        Loading.hide();
        Notify.create({
          message: i18n.global.t("authPrivatePreviewNotice"),
          type: "info",
          timeout: 7000
        });
        if (this.$router) {
          this.$router.push({
            path: "/auth",
            query: { tab: "waitlist", email: payload.email || "" }
          });
        }
        return;
      }

      // 3. User is invited: send verification email and create profile
      sendEmailVerification(cred.user).catch(error =>
        console.warn("Could not send verification email:", error.message)
      );

      await setDoc(doc(firebaseDb, "users", cred.user.uid), {
        email: payload.email,
        displayName: payload.email.split("@")[0],
        registrationTime: serverTimestamp()
      });

      Loading.hide();
      if (this.$router) {
        this.$router.push("/orgs");
      }
    } catch (error) {
      Loading.hide();
      showErrorMessage("Error", error.message);
    }
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
  async loginWithGoogle() {
    Loading.show();
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope("profile");
      provider.addScope("email");
      const result = await signInWithPopup(firebaseAuth, provider);
      const allowed = await verifyAccessOrGate(result, this.$router);
      Loading.hide();
      if (!allowed) return null;
      return result.user;
    } catch (error) {
      Loading.hide();
      if (error && error.code === "auth/popup-closed-by-user") {
        return null;
      }
      if (error && error.code === "auth/account-exists-with-different-credential") {
        showErrorMessage("Account Exists", i18n.global.t("authAccountCollisionMsg"));
        return null;
      }
      showErrorMessage("Error", error.message);
      throw error;
    }
  },
  async loginWithMicrosoft() {
    Loading.show();
    try {
      const provider = new OAuthProvider("microsoft.com");
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(firebaseAuth, provider);
      const allowed = await verifyAccessOrGate(result, this.$router);
      Loading.hide();
      if (!allowed) return null;
      return result.user;
    } catch (error) {
      Loading.hide();
      if (error && error.code === "auth/popup-closed-by-user") {
        return null;
      }
      if (error && error.code === "auth/account-exists-with-different-credential") {
        showErrorMessage("Account Exists", i18n.global.t("authAccountCollisionMsg"));
        return null;
      }
      showErrorMessage("Error", error.message);
      throw error;
    }
  },
  async loginWithApple() {
    Loading.show();
    try {
      const provider = new OAuthProvider("apple.com");
      provider.addScope("email");
      provider.addScope("name");
      const result = await signInWithPopup(firebaseAuth, provider);
      const allowed = await verifyAccessOrGate(result, this.$router);
      Loading.hide();
      if (!allowed) return null;
      return result.user;
    } catch (error) {
      Loading.hide();
      if (error && error.code === "auth/popup-closed-by-user") {
        return null;
      }
      if (error && error.code === "auth/account-exists-with-different-credential") {
        showErrorMessage("Account Exists", i18n.global.t("authAccountCollisionMsg"));
        return null;
      }
      showErrorMessage("Error", error.message);
      throw error;
    }
  },
  async loginWithCustomToken({}, token) {
    Loading.show();
    try {
      const result = await signInWithCustomToken(firebaseAuth, token);
      Loading.hide();
      return result.user;
    } catch (error) {
      Loading.hide();
      showErrorMessage("Error", error.message);
      throw error;
    }
  },
  logoutUser({ dispatch }) {
    //this.detachUserTasksListener();
    //dispatch("tasks/detachUserTasksListenerAction", null, { root: true });
    signOut(firebaseAuth);
  },
  async deleteAccount({ dispatch }) {
    Loading.show();
    try {
      const deleteUserAccountFn = httpsCallable(firebaseFunctions, "deleteUserAccount");
      await deleteUserAccountFn();
      Notify.create(i18n.global.t("toastAccountDeleted"));
      await signOut(firebaseAuth);
    } catch (error) {
      console.warn("deleteUserAccount callable failed, falling back to direct delete:", error);
      try {
        if (firebaseAuth.currentUser) {
          await firebaseAuth.currentUser.delete();
        }
        Notify.create(i18n.global.t("toastAccountDeleted"));
      } catch (authError) {
        showErrorMessage("Error deleting account", authError.message || error.message);
        throw authError;
      }
    } finally {
      Loading.hide();
    }
  },
  async sendPasswordResetEmail({}, payload) {
    try {
      let sentViaFunction = false;
      if (firebaseFunctions && typeof httpsCallable === "function") {
        try {
          const loc = i18n?.global?.locale;
          const locale = typeof loc === "string" ? loc : (loc && typeof loc.value === "string" ? loc.value : "en-us");
          const fn = httpsCallable(firebaseFunctions, "requestPasswordReset");
          await fn({ email: payload.email, locale });
          sentViaFunction = true;
        } catch (fnError) {
          const code = fnError && fnError.code;
          if (
            code === "functions/resource-exhausted" ||
            code === "resource-exhausted" ||
            code === "functions/invalid-argument" ||
            code === "invalid-argument"
          ) {
            throw fnError;
          }
          // Fall back to Firebase Auth native email in offline or client-only emulator setups
        }
      }
      if (!sentViaFunction) {
        await sendPasswordResetEmail(firebaseAuth, payload.email);
      }
      Notify.create(i18n.global.t("toastEmailSent"));
    } catch (error) {
      showErrorMessage("Error", error.message);
    }
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
          this.$router.push("/orgs");
        }
      } else {
        commit("setLoggedIn", false);
        commit("setUserId", null);
        commit("setUser", null);
        LocalStorage.set("loggedIn", false);
        // window.location: at startup the router hasn't resolved the first
        // route yet, so currentRoute would still be "/"
        if (!isPublicPath(window.location.pathname)) {
          this.$router.replace("/auth");
        }
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
