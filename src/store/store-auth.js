import { defineStore } from "pinia";
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
import { verifyUserAccess } from "@/utils/earlyAccess";
import { measure } from "@/utils/measure";
import { useUsersStore } from "./store-users";
import { useOrgsStore } from "./store-orgs";

async function verifyAccessOrGate(result, router) {
  const additional = getAdditionalUserInfo(result);
  if (additional && additional.isNewUser) {
    const user = result.user;
    const email = (user && user.email) || "";
    const access = await verifyUserAccess(user);
    if (!access.allowed) {
      try {
        await user.delete();
      } catch {
        await signOut(firebaseAuth);
      }

      Notify.create({
        message: i18n.global.t("authAccessNotice"),
        type: "info",
        timeout: 7000
      });
      if (router) {
        router.push({
          path: "/auth",
          query: { tab: "register", email: email || "" }
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
    measure("signup_completed", { method: "oauth" });
  }
  return true;
}

export const useAuthStore = defineStore("auth", {
  state: () => ({
    loggedIn: false,
    userId: null,
    user: null
  }),

  actions: {
    setLoggedIn(value) {
      this.loggedIn = value;
    },

    setUserId(value) {
      this.userId = value;
    },

    setUser(value) {
      this.user = value;
    },

    async registerUser(payload) {
      Loading.show();
      try {
        // 1. Authenticate FIRST: createUserWithEmailAndPassword
        const cred = await createUserWithEmailAndPassword(
          firebaseAuth,
          payload.email,
          payload.password
        );

        // 2. Verify access server-side (or via authenticated query)
        const access = await verifyUserAccess(cred.user);
        if (!access.allowed) {
          try {
            await cred.user.delete();
          } catch {
            await signOut(firebaseAuth);
          }

          Loading.hide();
          Notify.create({
            message: i18n.global.t("authAccessNotice"),
            type: "info",
            timeout: 7000
          });
          if (this.$router) {
            this.$router.push({
              path: "/auth",
              query: { tab: "register", email: payload.email || "" }
            });
          }
          return;
        }

        // 3. User is invited: send verification email and create profile
        sendEmailVerification(cred.user).catch((error) =>
          console.warn("Could not send verification email:", error.message)
        );

        await setDoc(doc(firebaseDb, "users", cred.user.uid), {
          email: payload.email,
          displayName: payload.email.split("@")[0],
          registrationTime: serverTimestamp()
        });
        measure("signup_completed", { method: "email" });

        Loading.hide();
        if (this.$router) {
          this.$router.push("/orgs");
        }
      } catch (error) {
        Loading.hide();
        showErrorMessage("Error", error.message);
      }
    },

    loginUser(payload) {
      Loading.show();
      return signInWithEmailAndPassword(
        firebaseAuth,
        payload.email,
        payload.password
      )
        .then(() => {
          if (this.$router) {
            this.$router.push("/");
          }
          Loading.hide();
        })
        .catch((error) => {
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

    async loginWithCustomToken(token) {
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

    logoutUser() {
      signOut(firebaseAuth);
    },

    async deleteAccount() {
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

    async sendPasswordResetEmail(payload) {
      try {
        let sentViaFunction = false;
        if (firebaseFunctions && typeof httpsCallable === "function") {
          try {
            const loc = i18n?.global?.locale;
            const locale =
              typeof loc === "string"
                ? loc
                : loc && typeof loc.value === "string"
                  ? loc.value
                  : "en-us";
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

    handleAuthStateChange() {
      onAuthStateChanged(firebaseAuth, (user) => {
        Loading.hide();
        if (user) {
          this.setLoggedIn(true);
          this.setUserId(firebaseAuth.currentUser.uid);
          const authUserInfo = {
            displayName: user.displayName,
            email: user.email,
            emailVerified: user.emailVerified,
            photoURL: user.photoURL,
            uid: user.uid,
            phoneNumber: user.phoneNumber,
            providerData: user.providerData
          };
          this.setUser({ ...authUserInfo });
          const profileUpdates = { ...authUserInfo };
          delete profileUpdates.phoneNumber;
          delete profileUpdates.providerData;
          useUsersStore(this.$pinia).updateUser({
            id: user.uid,
            updates: profileUpdates
          });
          LocalStorage.set("loggedIn", true);
          if (this.$router?.currentRoute?.value?.path == "/auth") {
            this.$router.push("/orgs");
          }
        } else {
          this.setLoggedIn(false);
          this.setUserId(null);
          this.setUser(null);
          LocalStorage.set("loggedIn", false);
          if (!isPublicPath(window.location.pathname) && this.$router) {
            this.$router.replace("/auth");
          }
          useOrgsStore(this.$pinia).clearOrgs();
        }
      });
    }
  }
});

export default useAuthStore;
