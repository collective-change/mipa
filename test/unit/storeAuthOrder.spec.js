import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPiniaInstance } from "@/store/index";

const {
  mockLocalStorageSet,
  mockDeleteUser,
  mockUser,
  mockCreateUser,
  mockSignOut,
  mockSendEmailVerification,
  mockGetAdditionalUserInfo,
  mockSignInWithEmailAndPassword,
  mockSignInWithCustomToken,
  mockOnAuthStateChanged,
  mockSetDoc,
  mockFirebaseAuth,
  mockVerifyUserAccess,
  mockShowErrorMessage,
  mockIsPublicPath
} = vi.hoisted(() => {
  const deleteUser = vi.fn().mockResolvedValue(undefined);
  return {
    mockLocalStorageSet: vi.fn(),
    mockDeleteUser: deleteUser,
    mockUser: {
      uid: "test-user-uid",
      email: "invited@tzuchi.org.tw",
      delete: deleteUser
    },
    mockCreateUser: vi.fn(),
    mockSignOut: vi.fn(),
    mockSendEmailVerification: vi.fn().mockResolvedValue(undefined),
    mockGetAdditionalUserInfo: vi.fn(),
    mockSignInWithEmailAndPassword: vi.fn(),
    mockSignInWithCustomToken: vi.fn(),
    mockOnAuthStateChanged: vi.fn(),
    mockSetDoc: vi.fn().mockResolvedValue(undefined),
    mockFirebaseAuth: { currentUser: null },
    mockVerifyUserAccess: vi.fn(),
    mockShowErrorMessage: vi.fn(),
    mockIsPublicPath: vi.fn()
  };
});

vi.mock("quasar", () => ({
  LocalStorage: { set: (...args) => mockLocalStorageSet(...args), get: vi.fn() },
  Loading: { show: vi.fn(), hide: vi.fn() },
  Notify: { create: vi.fn() }
}));

vi.mock("firebase/auth", () => ({
  createUserWithEmailAndPassword: (...args) => mockCreateUser(...args),
  signInWithEmailAndPassword: (...args) => mockSignInWithEmailAndPassword(...args),
  signOut: (...args) => mockSignOut(...args),
  sendPasswordResetEmail: vi.fn(),
  onAuthStateChanged: (...args) => mockOnAuthStateChanged(...args),
  sendEmailVerification: (...args) => mockSendEmailVerification(...args),
  signInWithPopup: vi.fn(),
  GoogleAuthProvider: vi.fn().mockImplementation(function () {
    this.addScope = vi.fn();
  }),
  OAuthProvider: vi.fn().mockImplementation(function () {
    this.addScope = vi.fn();
    this.setCustomParameters = vi.fn();
  }),
  signInWithCustomToken: (...args) => mockSignInWithCustomToken(...args),
  getAdditionalUserInfo: (...args) => mockGetAdditionalUserInfo(...args)
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn((_db, col, id) => ({ path: `${col}/${id}` })),
  setDoc: (...args) => mockSetDoc(...args),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  writeBatch: vi.fn(),
  onSnapshot: vi.fn(),
  DocumentReference: class {},
  serverTimestamp: vi.fn(() => "MOCK_TIMESTAMP")
}));

vi.mock("@/boot/firebase", () => ({
  firebaseAuth: mockFirebaseAuth,
  firebaseDb: {},
  firebaseFunctions: {}
}));

vi.mock("@/utils/earlyAccess", () => ({
  verifyUserAccess: (...args) => mockVerifyUserAccess(...args),
  checkEmailHasPendingInvitation: vi.fn()
}));

vi.mock("@/utils/util-show-error-message", () => ({
  showErrorMessage: (...args) => mockShowErrorMessage(...args)
}));

vi.mock("@/router/public-paths", () => ({
  isPublicPath: (...args) => mockIsPublicPath(...args)
}));

vi.mock("@/boot/i18n", () => ({
  i18n: {
    global: {
      t: vi.fn((k) => k)
    }
  }
}));

import { useAuthStore } from "@/store/store-auth";

describe("MIPA-18: store-auth registration & OAuth auth order", () => {
  let mockRouter;
  let authStore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRouter = {
      push: vi.fn(),
      replace: vi.fn(),
      currentRoute: { value: { path: "/auth" } }
    };
    const pinia = createPiniaInstance(mockRouter);
    authStore = useAuthStore(pinia);
  });

  describe("registerUser action", () => {
    it("creates user in Firebase Auth FIRST, then verifies access for invited user", async () => {
      mockCreateUser.mockResolvedValueOnce({ user: mockUser });
      mockVerifyUserAccess.mockResolvedValueOnce({ allowed: true, hasInvite: true, isMember: false });

      await authStore.registerUser({
        email: "invited@tzuchi.org.tw",
        password: "securePassword123!"
      });

      expect(mockCreateUser).toHaveBeenCalledTimes(1);
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.anything(),
        "invited@tzuchi.org.tw",
        "securePassword123!"
      );

      expect(mockVerifyUserAccess).toHaveBeenCalledTimes(1);
      expect(mockVerifyUserAccess).toHaveBeenCalledWith(mockUser);

      expect(mockSendEmailVerification).toHaveBeenCalledWith(mockUser);
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: "users/test-user-uid" }),
        expect.objectContaining({
          email: "invited@tzuchi.org.tw",
          displayName: "invited"
        })
      );
      expect(mockRouter.push).toHaveBeenCalledWith("/orgs");
      expect(mockDeleteUser).not.toHaveBeenCalled();
    });

    it("blocks uninvited stranger and cleans up auth user, redirecting to register", async () => {
      const strangerUser = {
        uid: "stranger-uid",
        email: "stranger@unknown.com",
        delete: vi.fn().mockResolvedValue(undefined)
      };
      mockCreateUser.mockResolvedValueOnce({ user: strangerUser });
      mockVerifyUserAccess.mockResolvedValueOnce({ allowed: false, hasInvite: false, isMember: false });

      await authStore.registerUser({
        email: "stranger@unknown.com",
        password: "strangerPassword123!"
      });

      expect(mockCreateUser).toHaveBeenCalledTimes(1);
      expect(mockVerifyUserAccess).toHaveBeenCalledWith(strangerUser);
      expect(strangerUser.delete).toHaveBeenCalledTimes(1);
      expect(mockRouter.push).toHaveBeenCalledWith({
        path: "/auth",
        query: { tab: "register", email: "stranger@unknown.com" }
      });
      expect(mockSetDoc).not.toHaveBeenCalled();
    });
  });

  describe("OAuth verifyAccessOrGate logic via loginWithGoogle", () => {
    it("allows invited new OAuth user and creates user profile", async () => {
      mockGetAdditionalUserInfo.mockReturnValueOnce({ isNewUser: true });
      mockVerifyUserAccess.mockResolvedValueOnce({ allowed: true, hasInvite: true, isMember: false });

      const oauthUser = {
        uid: "google-uid-1",
        email: "invited.oauth@tzuchi.org.tw",
        displayName: "Invited OAuth"
      };

      const { signInWithPopup } = await import("firebase/auth");
      vi.mocked(signInWithPopup).mockResolvedValueOnce({ user: oauthUser });

      const user = await authStore.loginWithGoogle();

      expect(user).toBe(oauthUser);
      expect(mockVerifyUserAccess).toHaveBeenCalledWith(oauthUser);
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: "users/google-uid-1" }),
        expect.objectContaining({
          email: "invited.oauth@tzuchi.org.tw",
          displayName: "Invited OAuth"
        }),
        { merge: true }
      );
    });

    it("blocks uninvited new OAuth user and cleans up credential, redirecting to register", async () => {
      const deleteFn = vi.fn().mockResolvedValue(undefined);
      const strangerOauthUser = {
        uid: "stranger-google-uid",
        email: "stranger.oauth@example.com",
        displayName: "Stranger OAuth",
        delete: deleteFn
      };

      mockGetAdditionalUserInfo.mockReturnValueOnce({ isNewUser: true });
      mockVerifyUserAccess.mockResolvedValueOnce({ allowed: false, hasInvite: false, isMember: false });

      const { signInWithPopup } = await import("firebase/auth");
      vi.mocked(signInWithPopup).mockResolvedValueOnce({ user: strangerOauthUser });

      const user = await authStore.loginWithGoogle();

      expect(user).toBeNull();
      expect(deleteFn).toHaveBeenCalledTimes(1);
      expect(mockRouter.push).toHaveBeenCalledWith({
        path: "/auth",
        query: { tab: "register", email: "stranger.oauth@example.com" }
      });
    });

    it("bypasses gate for existing OAuth users", async () => {
      mockGetAdditionalUserInfo.mockReturnValueOnce({ isNewUser: false });

      const existingUser = {
        uid: "existing-uid",
        email: "existing@tzuchi.org.tw"
      };

      const { signInWithPopup } = await import("firebase/auth");
      vi.mocked(signInWithPopup).mockResolvedValueOnce({ user: existingUser });

      const user = await authStore.loginWithGoogle();

      expect(user).toBe(existingUser);
      expect(mockVerifyUserAccess).not.toHaveBeenCalled();
    });
  });

  describe("state setters & session actions", () => {
    it("updates loggedIn, userId, and user state directly", () => {
      authStore.setLoggedIn(true);
      expect(authStore.loggedIn).toBe(true);

      authStore.setUserId("user-123");
      expect(authStore.userId).toBe("user-123");

      authStore.setUser({ displayName: "Tester", email: "test@example.com" });
      expect(authStore.user).toEqual({ displayName: "Tester", email: "test@example.com" });
    });

    it("logs in with email/password and redirects to root, or surfaces error on failure", async () => {
      mockSignInWithEmailAndPassword.mockResolvedValueOnce({ user: mockUser });
      await authStore.loginUser({ email: "user@example.com", password: "password" });
      expect(mockRouter.push).toHaveBeenCalledWith("/");

      mockSignInWithEmailAndPassword.mockRejectedValueOnce(new Error("auth/wrong-password"));
      await authStore.loginUser({ email: "user@example.com", password: "wrong" });
      expect(mockShowErrorMessage).toHaveBeenCalledWith("Error", "auth/wrong-password");
    });

    it("supports loginWithMicrosoft and loginWithApple", async () => {
      mockGetAdditionalUserInfo.mockReturnValue({ isNewUser: false });
      const { signInWithPopup } = await import("firebase/auth");

      vi.mocked(signInWithPopup).mockResolvedValueOnce({
        user: { uid: "ms-user", email: "ms@example.com" }
      });
      const msUser = await authStore.loginWithMicrosoft();
      expect(msUser).toEqual({ uid: "ms-user", email: "ms@example.com" });

      vi.mocked(signInWithPopup).mockResolvedValueOnce({
        user: { uid: "apple-user", email: "apple@example.com" }
      });
      const appleUser = await authStore.loginWithApple();
      expect(appleUser).toEqual({ uid: "apple-user", email: "apple@example.com" });
    });

    it("handles loginWithCustomToken success and error", async () => {
      mockSignInWithCustomToken.mockResolvedValueOnce({ user: { uid: "token-user" } });
      const customUser = await authStore.loginWithCustomToken("valid-token");
      expect(customUser).toEqual({ uid: "token-user" });

      mockSignInWithCustomToken.mockRejectedValueOnce(new Error("auth/invalid-custom-token"));
      await expect(authStore.loginWithCustomToken("bad-token")).rejects.toThrow(
        "auth/invalid-custom-token"
      );
      expect(mockShowErrorMessage).toHaveBeenCalledWith("Error", "auth/invalid-custom-token");
    });

    it("calls signOut on logoutUser", () => {
      authStore.logoutUser();
      expect(mockSignOut).toHaveBeenCalled();
    });

    it("handles auth state changes for logged in and logged out users", () => {
      let authCallback;
      mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
        authCallback = cb;
      });

      authStore.handleAuthStateChange();
      expect(authCallback).toBeDefined();

      // Logged in branch
      mockFirebaseAuth.currentUser = { uid: "user-session-1" };
      mockRouter.currentRoute.value = { path: "/auth" };
      authCallback({
        uid: "user-session-1",
        displayName: "Session User",
        email: "session@example.com",
        emailVerified: true,
        photoURL: null,
        phoneNumber: null,
        providerData: []
      });

      expect(authStore.loggedIn).toBe(true);
      expect(authStore.userId).toBe("user-session-1");
      expect(authStore.user.displayName).toBe("Session User");
      expect(mockLocalStorageSet).toHaveBeenCalledWith("loggedIn", true);
      expect(mockRouter.push).toHaveBeenCalledWith("/orgs");

      // Logged out branch
      mockIsPublicPath.mockReturnValue(false);
      authCallback(null);

      expect(authStore.loggedIn).toBe(false);
      expect(authStore.userId).toBeNull();
      expect(authStore.user).toBeNull();
      expect(mockLocalStorageSet).toHaveBeenCalledWith("loggedIn", false);
      expect(mockRouter.replace).toHaveBeenCalledWith("/auth");
    });
  });
});
