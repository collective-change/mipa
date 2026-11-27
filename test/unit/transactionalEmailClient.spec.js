import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const mockNotifyCreate = vi.fn();
const mockShowErrorMessage = vi.fn();
const mockHttpsCallable = vi.fn();
const mockAddDoc = vi.fn();
const mockUpdateDoc = vi.fn();
const mockSendPasswordResetEmail = vi.fn();

vi.mock("quasar", () => ({
  LocalStorage: { set: vi.fn(), get: vi.fn() },
  Loading: { show: vi.fn(), hide: vi.fn() },
  Notify: { create: (...args) => mockNotifyCreate(...args) }
}));

vi.mock("@/boot/firebase", () => ({
  firebaseAuth: { currentUser: { uid: "admin-1", email: "admin@tzuchi.org.tw" } },
  firebaseDb: {},
  firebaseFunctions: { app: "mock-functions" }
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: (...args) => mockHttpsCallable(...args)
}));

vi.mock("firebase/firestore", () => ({
  addDoc: (...args) => mockAddDoc(...args),
  collection: vi.fn((_db, ...segs) => ({ path: segs.join("/") })),
  collectionGroup: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn((_db, ...segs) => ({ path: segs.join("/") })),
  query: vi.fn(),
  serverTimestamp: vi.fn(() => "MOCK_TS"),
  setDoc: vi.fn(),
  updateDoc: (...args) => mockUpdateDoc(...args),
  where: vi.fn()
}));

vi.mock("firebase/auth", () => ({
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  sendPasswordResetEmail: (...args) => mockSendPasswordResetEmail(...args),
  onAuthStateChanged: vi.fn(),
  sendEmailVerification: vi.fn(),
  signInWithPopup: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  OAuthProvider: vi.fn(),
  signInWithCustomToken: vi.fn(),
  getAdditionalUserInfo: vi.fn()
}));

vi.mock("@/store/firestore-bind", () => ({
  firestoreAction: (fn) => fn
}));

vi.mock("@/utils/util-show-error-message", () => ({
  showErrorMessage: (...args) => mockShowErrorMessage(...args)
}));

vi.mock("@/router/public-paths", () => ({
  isPublicPath: vi.fn(() => false)
}));

vi.mock("@/utils/earlyAccess", () => ({
  verifyUserAccess: vi.fn()
}));

vi.mock("@/boot/i18n", () => ({
  i18n: {
    global: {
      locale: { value: "en-us" },
      t: vi.fn((key, params) => (params ? `${key}:${JSON.stringify(params)}` : key))
    }
  }
}));

import { useMembersStore } from "@/store/store-members";
import storeAuth from "@/store/store-auth";

describe("MIPA-44: Client store transactional email wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  describe("store-members.js", () => {
    it("inviteMember invokes createInvitation callable with locale and notifies success", async () => {
      const callableFn = vi.fn().mockResolvedValueOnce({ data: { success: true, invitationId: "inv-1" } });
      mockHttpsCallable.mockReturnValueOnce(callableFn);
      const membersStore = useMembersStore();

      const ok = await membersStore.inviteMember({
        org: { id: "org-1", name: "Tzu Chi" },
        email: "teammate@tzuchi.org.tw",
        role: "member"
      });

      expect(ok).toBe(true);
      expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), "createInvitation");
      expect(callableFn).toHaveBeenCalledWith({
        orgId: "org-1",
        email: "teammate@tzuchi.org.tw",
        role: "member",
        locale: "en-us"
      });
      expect(mockNotifyCreate).toHaveBeenCalledWith({ type: "positive", message: "Invitation created" });
      expect(mockAddDoc).not.toHaveBeenCalled();
    });

    it("inviteMember surfaces server rate-limit error without bypassing via client addDoc", async () => {
      const err = new Error("Rate limit exceeded");
      err.code = "functions/resource-exhausted";
      mockHttpsCallable.mockReturnValueOnce(vi.fn().mockRejectedValueOnce(err));
      const membersStore = useMembersStore();

      const ok = await membersStore.inviteMember({
        org: { id: "org-1", name: "Tzu Chi" },
        email: "teammate@tzuchi.org.tw",
        role: "member"
      });

      expect(ok).toBe(false);
      expect(mockShowErrorMessage).toHaveBeenCalledWith("Something went wrong", "Rate limit exceeded");
      expect(mockAddDoc).not.toHaveBeenCalled();
    });

    it("resendInvitation invokes resendInvitation Cloud Function and notifies on success", async () => {
      const callableFn = vi.fn().mockResolvedValueOnce({ data: { success: true, emailSent: true } });
      mockHttpsCallable.mockReturnValueOnce(callableFn);
      const membersStore = useMembersStore();

      const ok = await membersStore.resendInvitation({
        orgId: "org-1",
        invitationId: "inv-9",
        email: "teammate@tzuchi.org.tw"
      });

      expect(ok).toBe(true);
      expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), "resendInvitation");
      expect(callableFn).toHaveBeenCalledWith({
        orgId: "org-1",
        invitationId: "inv-9",
        email: "teammate@tzuchi.org.tw",
        locale: "en-us"
      });
      expect(mockNotifyCreate).toHaveBeenCalledWith(
        expect.objectContaining({ type: "positive" })
      );
      expect(mockUpdateDoc).not.toHaveBeenCalled();
    });

    it("resendInvitation surfaces resource-exhausted error and returns false", async () => {
      const err = new Error("Too many invitations sent");
      err.code = "functions/resource-exhausted";
      mockHttpsCallable.mockReturnValueOnce(vi.fn().mockRejectedValueOnce(err));
      const membersStore = useMembersStore();

      const ok = await membersStore.resendInvitation({
        orgId: "org-1",
        invitationId: "inv-9",
        email: "teammate@tzuchi.org.tw"
      });

      expect(ok).toBe(false);
      expect(mockShowErrorMessage).toHaveBeenCalledWith("Something went wrong", "Too many invitations sent");
      expect(mockUpdateDoc).not.toHaveBeenCalled();
    });
  });

  describe("store-auth.js", () => {
    it("sendPasswordResetEmail invokes requestPasswordReset callable and shows toast", async () => {
      const callableFn = vi.fn().mockResolvedValueOnce({ data: { success: true, sent: true } });
      mockHttpsCallable.mockReturnValueOnce(callableFn);

      await storeAuth.actions.sendPasswordResetEmail({}, { email: "member@tzuchi.org.tw" });

      expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), "requestPasswordReset");
      expect(callableFn).toHaveBeenCalledWith({
        email: "member@tzuchi.org.tw",
        locale: "en-us"
      });
      expect(mockNotifyCreate).toHaveBeenCalledWith("toastEmailSent");
      expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it("sendPasswordResetEmail stops and displays error on rate limit", async () => {
      const err = new Error("Too many password reset requests");
      err.code = "functions/resource-exhausted";
      mockHttpsCallable.mockReturnValueOnce(vi.fn().mockRejectedValueOnce(err));

      await storeAuth.actions.sendPasswordResetEmail({}, { email: "member@tzuchi.org.tw" });

      expect(mockShowErrorMessage).toHaveBeenCalledWith("Error", "Too many password reset requests");
      expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it("sendPasswordResetEmail falls back to Firebase Auth SDK when callable is unavailable", async () => {
      const unavailable = new Error("Functions unavailable");
      unavailable.code = "functions/unavailable";
      mockHttpsCallable.mockReturnValueOnce(vi.fn().mockRejectedValueOnce(unavailable));
      mockSendPasswordResetEmail.mockResolvedValueOnce(undefined);

      await storeAuth.actions.sendPasswordResetEmail({}, { email: "member@tzuchi.org.tw" });

      expect(mockSendPasswordResetEmail).toHaveBeenCalledWith(expect.anything(), "member@tzuchi.org.tw");
      expect(mockNotifyCreate).toHaveBeenCalledWith("toastEmailSent");
    });
  });
});
