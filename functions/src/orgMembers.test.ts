import { test } from "node:test";
import * as assert from "node:assert/strict";
import { checkSeatCapacity, evaluateUserAccess } from "./orgMembers";

test("checkSeatCapacity enforces seat limits correctly", () => {
  // Free / Community tier default (1 seat limit)
  assert.deepEqual(checkSeatCapacity(1, 0, 1), { allowed: false, remaining: 0 });
  assert.deepEqual(checkSeatCapacity(0, 0, 1), { allowed: true, remaining: 1 });
  assert.deepEqual(checkSeatCapacity(0, 1, 1), { allowed: false, remaining: 0 });

  // Starter tier (5 seat limit)
  assert.deepEqual(checkSeatCapacity(3, 1, 5), { allowed: true, remaining: 1 });
  assert.deepEqual(checkSeatCapacity(4, 1, 5), { allowed: false, remaining: 0 });
  assert.deepEqual(checkSeatCapacity(5, 0, 5), { allowed: false, remaining: 0 });

  // Growth tier (20 seat limit)
  assert.deepEqual(checkSeatCapacity(15, 4, 20), { allowed: true, remaining: 1 });
  assert.deepEqual(checkSeatCapacity(18, 2, 20), { allowed: false, remaining: 0 });

  // Pro tier (50 seat limit)
  assert.deepEqual(checkSeatCapacity(45, 3, 50), { allowed: true, remaining: 2 });

  // Fallback when seatLimit <= 0 defaults to 1
  assert.deepEqual(checkSeatCapacity(1, 0, 0), { allowed: false, remaining: 0 });
});

test("evaluateUserAccess allows active members without requiring invite", async () => {
  const fakeDb = {
    collection(name: string) {
      assert.equal(name, "orgs");
      return {
        where(field: string, op: string, val: string) {
          assert.equal(field, "users");
          assert.equal(op, "array-contains");
          assert.equal(val, "member-uid-1");
          return {
            limit() {
              return {
                async get() {
                  return { empty: false, docs: [{ id: "org-1" }] };
                }
              };
            }
          };
        }
      };
    }
  } as unknown as FirebaseFirestore.Firestore;

  const res = await evaluateUserAccess(fakeDb, "member-uid-1", "user@tzuchi.org.tw");
  assert.deepEqual(res, { allowed: true, isMember: true, hasInvite: false });
});

test("evaluateUserAccess allows invited emails even for new unverified UIDs", async () => {
  const fakeDb = {
    collection(name: string) {
      assert.equal(name, "orgs");
      return {
        where() {
          return {
            limit() {
              return {
                async get() {
                  return { empty: true, docs: [] };
                }
              };
            }
          };
        }
      };
    },
    collectionGroup(name: string) {
      assert.equal(name, "invitations");
      return {
        where(field: string, op: string, val: string) {
          assert.equal(field, "email");
          assert.equal(op, "==");
          assert.equal(val, "invited-person@tzuchi.org.tw");
          return {
            limit() {
              return {
                async get() {
                  return { empty: false, docs: [{ id: "inv-1" }] };
                }
              };
            }
          };
        }
      };
    }
  } as unknown as FirebaseFirestore.Firestore;

  // Case insensitive check
  const res = await evaluateUserAccess(fakeDb, "new-uid", "  Invited-Person@TzuChi.Org.TW  ");
  assert.deepEqual(res, { allowed: true, isMember: false, hasInvite: true });
});

test("evaluateUserAccess rejects uninvited strangers with no org membership", async () => {
  const fakeDb = {
    collection() {
      return {
        where() {
          return {
            limit() {
              return {
                async get() {
                  return { empty: true, docs: [] };
                }
              };
            }
          };
        }
      };
    },
    collectionGroup() {
      return {
        where() {
          return {
            limit() {
              return {
                async get() {
                  return { empty: true, docs: [] };
                }
              };
            }
          };
        }
      };
    }
  } as unknown as FirebaseFirestore.Firestore;

  const res = await evaluateUserAccess(fakeDb, "stranger-uid", "stranger@unknown.com");
  assert.deepEqual(res, { allowed: false, isMember: false, hasInvite: false });
});
