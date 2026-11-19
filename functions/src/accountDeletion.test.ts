import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
  handleOrgModelsDeletion,
  deleteCollectionDocs,
  executeOrgDeletion
} from "./accountDeletion";

test("deleteCollectionDocs: batches and deletes all docs in a collection", async () => {
  const deletedRefs: string[] = [];
  const fakeDocs = [
    { ref: { path: "orgs/org-1/members/u1" } },
    { ref: { path: "orgs/org-1/members/u2" } }
  ];

  const fakeDb = {
    collection(path: string) {
      assert.equal(path, "orgs/org-1/members");
      return {
        async get() {
          return {
            empty: false,
            size: fakeDocs.length,
            docs: fakeDocs
          };
        }
      };
    },
    batch() {
      return {
        delete(ref: { path: string }) {
          deletedRefs.push(ref.path);
        },
        async commit() {}
      };
    }
  } as unknown as FirebaseFirestore.Firestore;

  const count = await deleteCollectionDocs(fakeDb, "orgs/org-1/members");
  assert.equal(count, 2);
  assert.deepEqual(deletedRefs, [
    "orgs/org-1/members/u1",
    "orgs/org-1/members/u2"
  ]);
});

test("MIPA-35 & M-6/M-8: handleOrgModelsDeletion preserves public models with tombstone (revocation != erasure)", async () => {
  let publicModelUpdated: Record<string, unknown> | null = null;
  let privateModelDeleted = false;
  const deletedSubcollectionPaths: string[] = [];

  const publicModelRef = {
    async update(data: Record<string, unknown>) {
      publicModelUpdated = data;
    },
    async delete() {
      assert.fail("Public model must NOT be deleted per 'revocation != erasure'!");
    }
  };

  const privateModelRef = {
    async update() {
      assert.fail("Private model should be deleted, not updated");
    },
    async delete() {
      privateModelDeleted = true;
    }
  };

  const mockModelDocs = [
    {
      id: "pub-mod-1",
      ref: publicModelRef,
      data() {
        return { isPublic: true, name: "Published Climate Model" };
      }
    },
    {
      id: "priv-mod-2",
      ref: privateModelRef,
      data() {
        return { isPublic: false, name: "Internal Draft Model" };
      }
    }
  ];

  const fakeDb = {
    collection(name: string) {
      if (name === "models") {
        return {
          where(field: string, op: string, val: string) {
            assert.equal(field, "orgId");
            assert.equal(op, "==");
            assert.equal(val, "org-123");
            return {
              async get() {
                return { docs: mockModelDocs };
              }
            };
          }
        };
      }
      // Subcollections
      deletedSubcollectionPaths.push(name);
      return {
        async get() {
          return { empty: true, size: 0, docs: [] };
        }
      };
    },
    batch() {
      return {
        delete() {},
        async commit() {}
      };
    }
  } as unknown as FirebaseFirestore.Firestore;

  const result = await handleOrgModelsDeletion(fakeDb, "org-123", "admin-uid-1");

  assert.equal(result.retainedPublicCount, 1);
  assert.equal(result.deletedPrivateCount, 1);

  // Assert public model received revocation tombstone and wasn't deleted
  assert.ok(publicModelUpdated);
  const updated = publicModelUpdated as Record<string, unknown>;
  assert.equal(updated.isArchived, true);
  assert.equal(updated.revokedBy, "admin-uid-1");
  assert.equal(updated.archivedReason, "Organization deleted");
  assert.ok(typeof updated.revokedAt === "string");

  // Assert private model was deleted
  assert.equal(privateModelDeleted, true);

  // Assert private subcollections were purged
  assert.ok(deletedSubcollectionPaths.includes("models/pub-mod-1/aiDrafts"));
  assert.ok(deletedSubcollectionPaths.includes("models/priv-mod-2/nodes"));
  assert.ok(deletedSubcollectionPaths.includes("models/priv-mod-2/snapshots"));
  assert.ok(deletedSubcollectionPaths.includes("models/priv-mod-2/aiDrafts"));
});

test("executeOrgDeletion: cleans up org actions, chats, settings, secrets and org document", async () => {
  const deletedDocPaths: string[] = [];
  const batchDeletedDocPaths: string[] = [];

  const fakeDb = {
    collection(name: string) {
      if (name === "models") {
        return {
          where() {
            return {
              async get() {
                return { docs: [] };
              }
            };
          }
        };
      }
      if (name === "actions" || name === "chats") {
        return {
          where(field: string, op: string, val: string) {
            assert.equal(field, "orgId");
            assert.equal(val, "test-org");
            return {
              async get() {
                return {
                  empty: false,
                  size: 1,
                  docs: [{ ref: { path: `${name}/item-1` } }]
                };
              }
            };
          }
        };
      }
      // subcollections (members, invitations)
      return {
        async get() {
          return {
            empty: false,
            size: 1,
            docs: [{ ref: { path: `${name}/doc-1` } }]
          };
        }
      };
    },
    doc(path: string) {
      return {
        path,
        async delete() {
          deletedDocPaths.push(path);
        }
      };
    },
    batch() {
      return {
        delete(ref: { path: string }) {
          batchDeletedDocPaths.push(ref.path);
        },
        async commit() {}
      };
    }
  } as unknown as FirebaseFirestore.Firestore;

  const res = await executeOrgDeletion(fakeDb, "test-org", "super-admin-uid");

  assert.equal(res.orgId, "test-org");
  assert.equal(res.deletedActionsCount, 1);
  assert.equal(res.deletedChatsCount, 1);

  // Check that batch deletions occurred for actions, chats, members, invitations
  assert.ok(batchDeletedDocPaths.includes("actions/item-1"));
  assert.ok(batchDeletedDocPaths.includes("chats/item-1"));
  assert.ok(batchDeletedDocPaths.includes("orgs/test-org/members/doc-1"));
  assert.ok(batchDeletedDocPaths.includes("orgs/test-org/invitations/doc-1"));

  // Check direct document deletions
  assert.ok(deletedDocPaths.includes("orgAiSettings/test-org"));
  assert.ok(deletedDocPaths.includes("orgSecrets/test-org"));
  assert.ok(deletedDocPaths.includes("orgs/test-org"));
});
