import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateWaitlistPayload,
  submitEarlyAccessRequest,
  checkEmailHasPendingInvitation,
  ALLOWED_SECTORS
} from "@/utils/earlyAccess";

// Mock firebase
vi.mock("@/boot/firebase", () => ({
  firebaseDb: {}
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

  describe("validateWaitlistPayload", () => {
    it("accepts valid payloads", () => {
      const valid = validateWaitlistPayload({
        email: "leader@foundation.org",
        name: "Jane Doe",
        orgName: "Global Relief Initiative",
        sector: "foundation",
        note: "Simulating rapid surge logistics"
      });
      expect(valid.valid).toBe(true);
    });

    it("rejects non-object or empty payload", () => {
      expect(validateWaitlistPayload(null).valid).toBe(false);
      expect(validateWaitlistPayload("string").valid).toBe(false);
      expect(validateWaitlistPayload({}).valid).toBe(false);
    });

    it("rejects malformed email addresses", () => {
      expect(validateWaitlistPayload({ email: "invalid-email" }).valid).toBe(false);
      expect(validateWaitlistPayload({ email: "@domain.com" }).valid).toBe(false);
      expect(validateWaitlistPayload({ email: "user@" }).valid).toBe(false);
    });

    it("rejects name exceeding 100 characters", () => {
      const longName = "A".repeat(101);
      const res = validateWaitlistPayload({ email: "test@example.com", name: longName });
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Name too long");
    });

    it("rejects organization name exceeding 150 characters", () => {
      const longOrg = "B".repeat(151);
      const res = validateWaitlistPayload({ email: "test@example.com", orgName: longOrg });
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Organization name too long");
    });

    it("rejects note exceeding 1000 characters", () => {
      const longNote = "C".repeat(1001);
      const res = validateWaitlistPayload({ email: "test@example.com", note: longNote });
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Note too long");
    });
  });

  describe("ALLOWED_SECTORS", () => {
    it("contains expected social impact sectors", () => {
      expect(ALLOWED_SECTORS).toContain("foundation");
      expect(ALLOWED_SECTORS).toContain("ngo");
      expect(ALLOWED_SECTORS).toContain("academic");
      expect(ALLOWED_SECTORS).toContain("government");
      expect(ALLOWED_SECTORS).toContain("social_enterprise");
      expect(ALLOWED_SECTORS).toContain("consulting");
      expect(ALLOWED_SECTORS).toContain("other");
    });
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

  describe("submitEarlyAccessRequest", () => {
    it("throws an error when payload fails validation", async () => {
      await expect(submitEarlyAccessRequest({ email: "bad" })).rejects.toThrow();
    });

    it("successfully creates document in earlyAccessRequests collection", async () => {
      const result = await submitEarlyAccessRequest({
        email: "director@ngo.org",
        name: "Director Lee",
        orgName: "Community Hope",
        sector: "ngo",
        note: "Looking to prioritize maternal health projects.",
        locale: "zh-tw"
      });
      expect(result.success).toBe(true);
      expect(result.id).toBe("mock-doc-123");
    });
  });
});
