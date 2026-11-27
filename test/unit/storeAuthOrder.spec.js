import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPiniaInstance } from "@/store/index";

vi.mock("quasar", () => ({
  LocalStorage: { set: vi.fn(), get: vi.fn() },
  Loading: { show: vi.fn(), hide: vi.fn() },
  Notify: { create: vi.fn() }
}));

const mockDeleteUser = vi.fn().mockResolvedValue(undefined);
const mockUser = {
  uid: "test-user-uid",
  email: "invited@tzuchi.org.tw",
  delete: mockDeleteUser
};

const mockCreateUser = vi.fn();
const mockSignOut = vi.fn();
const mockSendEmailVerification = vi.fn().mockResolvedValue(undefined);
const mockGetAdditionalUserInfo = vi.fn();

vi.mock("firebase/auth", () => ({
  createUserWithEmailAndPassword: (...args) => mockCreateUser(...args),
  signInWithEmailAndPassword: vi.fn(),
  signOut: (...args) => mockSignOut(...args),
  sendPasswordResetEmail: vi.fn(),
  onAuthStateChanged: vi.fn(),
  sendEmailVerification: (...args) => mockSendEmailVerification(...args),
  signInWithPopup: vi.fn(),
  GoogleAuthProvider: vi.fn().mockImplementation(function () {
    this.addScope = vi.fn();
  }),
  OAuthProvider: vi.fn().mockImplementation(function () {
    this.addScope = vi.fn();
    this.setCustomParameters = vi.fn();
  }),
  signInWithCustomToken: vi.fn(),
  getAdditionalUserInfo: (...args) => mockGetAdditionalUserInfo(...args)
}));

const mockSetDoc = vi.fn().mockResolvedValue(undefined);
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
  firebaseAuth: { currentUser: null },
  firebaseDb: {},
  firebaseFunctions: {}
}));

const mockVerifyUserAccess = vi.fn();

vi.mock("@/utils/earlyAccess", () => ({
  verifyUserAccess: (...args) => mockVerifyUserAccess(...args),
  checkEmailHasPendingInvitation: vi.fn()
}));

vi.mock("@/utils/util-show-error-message", () => ({
  showErrorMessage: vi.fn()
}));

vi.mock("@/router/public-paths", () => ({
  isPublicPath: vi.fn()
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
});
