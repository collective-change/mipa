import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  checkEmailHasPendingInvitation,
  verifyUserAccess
} from "@/utils/earlyAccess";

// Mock firebase
vi.mock("@/boot/firebase", () => ({
  firebaseDb: {},
  firebaseFunctions: {},
  firebaseAuth: { currentUser: null }
}));

const mockCallable = vi.fn();
vi.mock("firebase/functions", () => ({
  httpsCallable: vi.fn(() => mockCallable)
}));

vi.mock("firebase/firestore", () => {
  return {
    collection: vi.fn((_db, name) => ({ path: name })),
    collectionGroup: vi.fn((_db, name) => ({ path: `group_${name}` })),
    addDoc: vi.fn(async (_ref, data) => ({ id: "mock-doc-123", data })),
    serverTimestamp: vi.fn(() => "MOCK_SERVER_TIMESTAMP"),
    getDocs: vi.fn(async (q) => {
      if (q && q._mockEmpty) {
        return { empty: true, docs: [] };
      }
      return { empty: false, docs: [{ id: "inv-1" }] };
    }),
    query: vi.fn((colRef, whereClause) => ({ ...colRef, whereClause, _mockEmpty: whereClause && whereClause._mockEmpty })),
    where: vi.fn((field, op, val) => ({
      field,
      op,
      val,
      _mockEmpty: val === "notinvited@example.com"
    }))
  };
});

describe("earlyAccess.js utility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkEmailHasPendingInvitation", () => {
    it("returns false for invalid email input", async () => {
      expect(await checkEmailHasPendingInvitation(null)).toBe(false);
      expect(await checkEmailHasPendingInvitation("")).toBe(false);
      expect(await checkEmailHasPendingInvitation("bad-email")).toBe(false);
    });

    it("returns true when email has pending invitation in query", async () => {
      const hasInvite = await checkEmailHasPendingInvitation("invited@tzuchi.org");
      expect(hasInvite).toBe(true);
    });

    it("returns false when query returns empty", async () => {
      const hasInvite = await checkEmailHasPendingInvitation("notinvited@example.com");
      expect(hasInvite).toBe(false);
    });
  });

  describe("verifyUserAccess", () => {
    it("returns allowed: false when user is null", async () => {
      const res = await verifyUserAccess(null);
      expect(res.allowed).toBe(false);
    });

    it("uses Cloud Function checkUserAccess when available", async () => {
      mockCallable.mockResolvedValueOnce({
        data: { allowed: true, hasInvite: true, isMember: false }
      });
      const res = await verifyUserAccess({ uid: "user-1", email: "invited@tzuchi.org" });
      expect(res.allowed).toBe(true);
      expect(res.hasInvite).toBe(true);
    });

    it("falls back to authenticated query when Cloud Function fails", async () => {
      mockCallable.mockRejectedValueOnce(new Error("Functions emulator not running"));
      const res = await verifyUserAccess({ uid: "user-2", email: "invited@tzuchi.org" });
      expect(res.allowed).toBe(true);
      expect(res.hasInvite).toBe(true);
    });

    it("denies access when user has no invite and Cloud Function fails", async () => {
      mockCallable.mockRejectedValueOnce(new Error("Network error"));
      const res = await verifyUserAccess({ uid: "user-3", email: "notinvited@example.com" });
      expect(res.allowed).toBe(false);
      expect(res.hasInvite).toBe(false);
    });
  });
});
