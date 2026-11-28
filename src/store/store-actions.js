import { defineStore } from "pinia";
import { Notify } from "quasar";
import { firebaseDb, firebaseAuth } from "@/boot/firebase";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getCountFromServer,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch
} from "firebase/firestore";
import { firestoreAction } from "./firestore-bind";
import { showErrorMessage } from "@/utils/util-show-error-message";
import { i18n } from "@/boot/i18n";
import { measure } from "@/utils/measure";
import { useUiStore } from "./store-ui";
import { useUiActionStore } from "./store-uiAction";

export const DEFAULT_ACTIONS_LIMIT = 50;

export const useActionsStore = defineStore("actions", {
  state: () => ({
    currentAction: null,
    actions: [],
    matchingActions: [],
    actionsTotalCount: null,
    matchingActionsTotalCount: null,
    actionsLimit: DEFAULT_ACTIONS_LIMIT,
    actionsDownloaded: false,
    search: "",
    sort: "name"
  }),

  getters: {
    actionsList: (state) => {
      if (!state.actions) {
        return [];
      }
      return state.actions.map((action) => ({ ...action, id: action.id }));
    },

    actionsSorted: (state) => {
      const actionsSorted = {};
      const keysOrdered = Object.keys(state.actions);

      keysOrdered.sort((a, b) => {
        const actionAProp = state.actions[a][state.sort].toLowerCase();
        const actionBProp = state.actions[b][state.sort].toLowerCase();
        if (actionAProp > actionBProp) return 1;
        if (actionAProp < actionBProp) return -1;
        return 0;
      });

      keysOrdered.forEach((key) => {
        actionsSorted[key] = state.actions[key];
      });

      return actionsSorted;
    },

    actionsFiltered(state) {
      const actionsSorted = this.actionsSorted;
      const actionsFiltered = {};
      if (state.search) {
        Object.keys(actionsSorted).forEach(function (key) {
          const action = actionsSorted[key];
          const actionNameLowerCase = action.name.toLowerCase();
          const searchLowerCase = state.search.toLowerCase();
          if (actionNameLowerCase.includes(searchLowerCase)) {
            actionsFiltered[key] = action;
          }
        });
        return actionsFiltered;
      }
      return actionsSorted;
    },

    actionsTODO() {
      const actionsFiltered = this.actionsFiltered;
      const actions = {};
      Object.keys(actionsFiltered).forEach(function (key) {
        const action = actionsFiltered[key];
        if (!action.completed) {
          actions[key] = action;
        }
      });
      return actions;
    },

    actionsCompleted() {
      const actionsFiltered = this.actionsFiltered;
      const actions = {};
      Object.keys(actionsFiltered).forEach(function (key) {
        const action = actionsFiltered[key];
        if (action.completed) {
          actions[key] = action;
        }
      });
      return actions;
    },

    blockingRelationships: (state) => {
      const relationships = [];
      state.actions.forEach(function (action) {
        if ("blockerActionIds" in action) {
          action.blockerActionIds.forEach(function (blockerId) {
            relationships.push({
              blockerId,
              blockeeId: action.id
            });
          });
        }
      });
      return relationships;
    },

    blockingRelationshipsOfMatchingActions: (state) => {
      let relationships = [];
      state.matchingActions.forEach(function (action) {
        if ("blockerActionIds" in action) {
          action.blockerActionIds.forEach(function (blockerId) {
            relationships.push({
              blockerId,
              blockeeId: action.id
            });
          });
        }
        if ("blockeeActionIds" in action) {
          action.blockeeActionIds.forEach(function (blockeeId) {
            relationships.push({
              blockerId: action.id,
              blockeeId
            });
          });
        }
        relationships = relationships.reduce(
          (acc, r) =>
            acc.concat(
              acc.find(
                (r1) => r1.blockerId == r.blockerId && r1.blockeeId == r.blockeeId
              )
                ? []
                : [r]
            ),
          []
        );
      });
      return relationships;
    }
  },

  actions: {
    clearActions() {
      this.actions = {};
    },

    setSearch(value) {
      this.search = value;
    },

    setSort(value) {
      this.sort = value;
    },

    setActionsDownloaded(value) {
      this.actionsDownloaded = value;
    },

    setActionsTotalCount(count) {
      this.actionsTotalCount = count;
    },

    setMatchingActionsTotalCount(count) {
      this.matchingActionsTotalCount = count;
    },

    setActionsLimit(limitVal) {
      this.actionsLimit = limitVal;
    },

    bindCurrentAction: firestoreAction(({ bindFirestoreRef }, actionId) => {
      return bindFirestoreRef(
        "currentAction",
        doc(firebaseDb, "actions", actionId),
        {
          wait: false,
          reset: true
        }
      );
    }),

    unbindCurrentAction: firestoreAction(({ unbindFirestoreRef }) => {
      unbindFirestoreRef("currentAction", true);
    }),

    updateAction(originalPayload) {
      const payload = JSON.parse(JSON.stringify(originalPayload));
      payload.updates.updateTime = serverTimestamp();
      payload.updates.updatedBy = firebaseAuth.currentUser.uid;
      return setDoc(doc(firebaseDb, "actions", payload.id), payload.updates, {
        merge: true
      })
        .then(function () {
          const keys = Object.keys(payload.updates);
          if (!(keys.includes("completed") && keys.length == 1)) {
            Notify.create(i18n.global.t("toastActionUpdated"));
          }
        })
        .catch(function (error) {
          showErrorMessage("Error updating action", error.message);
        });
    },

    updateActionsResults(data) {
      const actionsResults = data.actionsResults;
      let batch = writeBatch(firebaseDb);
      const actionsRef = collection(firebaseDb, "actions");
      let batchedWrites = 0;
      const storeActions = Array.isArray(this.actions) ? this.actions : [];

      actionsResults.forEach((actionResults, index, fullArray) => {
        const matchedStoreAction = storeActions.find(
          (action) => action.id == actionResults.id
        );
        if (
          matchedStoreAction == undefined ||
          resultsNumbersChangedSignificantly(
            actionResults.effectiveResultsNumbers,
            matchedStoreAction.effectiveResultsNumbers
          )
        ) {
          console.log("action results changed significantly: ", actionResults.id);

          const actionUpdates = {
            ...actionResults.effectiveResultsNumbers,
            effectiveResultsNumbers: actionResults.effectiveResultsNumbers,
            branchAndBlockeesResultsNumbers:
              actionResults.branchAndBlockeesResultsNumbers,
            effectiveChainedCostsAndImpacts:
              actionResults.effectiveChainedCostsAndImpacts,
            effectiveChainedCostsAndImpactsExcludingSelf:
              actionResults.effectiveChainedCostsAndImpactsExcludingSelf
          };
          if (actionResults.inheritedResultsNumbers) {
            actionUpdates.inheritedResultsNumbers =
              actionResults.inheritedResultsNumbers;
          } else {
            actionUpdates.inheritedResultsNumbers = deleteField();
          }

          batch.update(doc(actionsRef, actionResults.id), actionUpdates);
          batchedWrites++;
        }
        if (
          batchedWrites == 500 ||
          (batchedWrites > 0 && index == fullArray.length - 1)
        ) {
          batch
            .commit()
            .then(function () {
              batchedWrites = 0;
              batch = writeBatch(firebaseDb);
              console.log("action results updated");
              Notify.create(i18n.global.t("toastActionResults"));
            })
            .catch(function (error) {
              showErrorMessage("Error updating actions results", error.message);
            });
        }
      });
    },

    deleteAction(actionId) {
      return deleteDoc(doc(firebaseDb, "actions", actionId))
        .then(function () {
          Notify.create(i18n.global.t("toastActionDeleted"));
        })
        .catch(function (error) {
          showErrorMessage("Error removing action", error.message);
        });
    },

    addAction(action) {
      action.initiator = firebaseAuth.currentUser.uid;
      action.responsiblePerson = firebaseAuth.currentUser.uid;
      action.accountablePerson = firebaseAuth.currentUser.uid;
      action.createTime = serverTimestamp();
      action.createdBy = firebaseAuth.currentUser.uid;
      action.updateTime = serverTimestamp();
      action.updatedBy = firebaseAuth.currentUser.uid;

      const pinia = this.$pinia;
      return addDoc(collection(firebaseDb, "actions"), action)
        .then(function (docRef) {
          Notify.create(i18n.global.t("toastActionAdded"));
          useUiStore(pinia).setSelectedActionId(docRef.id);
          measure("goal_created");
        })
        .catch(function (error) {
          showErrorMessage("Error adding action", error.message);
        });
    },

    bindActions: firestoreAction(async function ({ bindFirestoreRef }, payload) {
      const orgId = typeof payload === "string" ? payload : payload?.orgId;
      const actionsLimit =
        typeof payload === "object" && typeof payload?.limit === "number" && payload.limit > 0
          ? payload.limit
          : DEFAULT_ACTIONS_LIMIT;

      const baseQuery = query(collection(firebaseDb, "actions"), where("orgId", "==", orgId));
      const actionsQuery = query(
        collection(firebaseDb, "actions"),
        where("orgId", "==", orgId),
        limit(actionsLimit)
      );

      try {
        const countSnap = await getCountFromServer(baseQuery);
        this.setActionsTotalCount(countSnap.data().count);
      } catch {
        this.setActionsTotalCount(null);
      }

      return bindFirestoreRef("actions", actionsQuery, {
        reset: true, // reset actions so they don't linger when switching orgs
        wait: false
      });
    }),

    unbindActions: firestoreAction(({ unbindFirestoreRef }) => {
      unbindFirestoreRef("actions", true);
    }),

    bindMatchingActions: firestoreAction(async function ({ bindFirestoreRef }, payload) {
      const filters = [where("orgId", "==", payload.orgId)];
      if (
        Array.isArray(payload.actionStatesToSearch) &&
        payload.actionStatesToSearch.length > 0
      ) {
        filters.push(where("actionMchState.value", "in", payload.actionStatesToSearch));
      }
      if (payload.responsiblePersonToSearch) {
        filters.push(
          where("responsiblePerson", "==", payload.responsiblePersonToSearch)
        );
      }
      if (payload.accountablePersonToSearch) {
        filters.push(
          where("accountablePerson", "==", payload.accountablePersonToSearch)
        );
      }

      const actionsLimit =
        typeof payload.limit === "number" && payload.limit > 0
          ? payload.limit
          : DEFAULT_ACTIONS_LIMIT;

      const baseQuery = query(collection(firebaseDb, "actions"), ...filters);
      const actionsQuery = query(
        collection(firebaseDb, "actions"),
        ...filters,
        limit(actionsLimit)
      );

      try {
        const countSnap = await getCountFromServer(baseQuery);
        this.setMatchingActionsTotalCount(countSnap.data().count);
      } catch {
        this.setMatchingActionsTotalCount(null);
      }

      return bindFirestoreRef("matchingActions", actionsQuery, {
        reset: true, // reset actions so they don't linger when switching orgs
        wait: false
      });
    }),

    unbindMatchingActions: firestoreAction(({ unbindFirestoreRef }) => {
      unbindFirestoreRef("matchingActions", true);
    }),

    addParent(parentId) {
      const childId = useUiActionStore(this.$pinia).uiAction.id;
      return addNestingRelationship(parentId, childId);
    },

    addChild(childId) {
      const parentId = useUiActionStore(this.$pinia).uiAction.id;
      return addNestingRelationship(parentId, childId);
    },

    addBlocker(blockerId) {
      const blockeeId = useUiActionStore(this.$pinia).uiAction.id;
      return addBlockingRelationship(blockerId, blockeeId);
    },

    addBlockee(blockeeId) {
      const blockerId = useUiActionStore(this.$pinia).uiAction.id;
      return addBlockingRelationship(blockerId, blockeeId);
    },

    deleteRelationship(payload) {
      switch (payload.type) {
        case "nesting":
          return deleteNestingRelationship(payload.parent, payload.child);
        case "blocking":
          return deleteBlockingRelationship(payload.blocker, payload.blockee);
        default:
          showErrorMessage(
            "Error deleting relationship",
            `"${payload.type}" not recognized`
          );
      }
    }
  }
});

export default useActionsStore;

function changedSignificantly(newObj, oldObj, propertyName) {
  if (isNaN(newObj[propertyName]) && !isNaN(oldObj[propertyName])) return true;
  if (!isNaN(newObj[propertyName]) && isNaN(oldObj[propertyName])) return true;
  if (Math.abs(newObj[propertyName] / oldObj[propertyName]) > 1.001) return true;
  if (Math.abs(oldObj[propertyName] / newObj[propertyName]) > 1.001) return true;
  return false;
}

function resultsNumbersChangedSignificantly(newObj, oldObj) {
  if (!oldObj || typeof oldObj.actionLeverage == "undefined") return true;

  if (changedSignificantly(newObj, oldObj, "actionLeverage")) return true;
  if (changedSignificantly(newObj, oldObj, "marginalNetTotalBenefitNpv")) {
    return true;
  }
  if (changedSignificantly(newObj, oldObj, "marginalTotalCostNpv")) return true;
  return false;
}

function relationshipExists(action, targetActionId) {
  if (action.blockerActionIds && action.blockerActionIds.includes(targetActionId)) {
    return true;
  }
  if (action.blockeeActionIds && action.blockeeActionIds.includes(targetActionId)) {
    return true;
  }
  if (action.childrenActionIds && action.childrenActionIds.includes(targetActionId)) {
    return true;
  }
  if (action.parentActionId && action.parentActionId == targetActionId) {
    return true;
  }
  return false;
}

async function addNestingRelationship(parentId, childId) {
  const parentActionRef = doc(firebaseDb, "actions", parentId);
  const childActionRef = doc(firebaseDb, "actions", childId);
  try {
    await runTransaction(firebaseDb, async (t) => {
      const parentActionDoc = await t.get(parentActionRef);
      const childActionDoc = await t.get(childActionRef);
      const parentAction = parentActionDoc.data();
      const childAction = childActionDoc.data();
      if (
        relationshipExists(parentAction, childId) ||
        relationshipExists(childAction, parentId)
      ) {
        throw new Error("A relationship already exists with the target action.");
      }
      if (childAction.parentActionId) {
        console.log("parent exists");
        throw new Error("Parent action already exists.");
      }
      t.update(parentActionRef, {
        childrenActionIds: arrayUnion(childId)
      });
      t.update(childActionRef, {
        parentActionId: parentId
      });
      Notify.create(i18n.global.t("toastRelationshipAdded"));
    });
  } catch (error) {
    console.log("Transaction failure:", error);
    showErrorMessage("Error adding relationship", error.message);
  }
}

async function addBlockingRelationship(blockerId, blockeeId) {
  const blockerActionRef = doc(firebaseDb, "actions", blockerId);
  const blockeeActionRef = doc(firebaseDb, "actions", blockeeId);
  try {
    await runTransaction(firebaseDb, async (t) => {
      const blockerActionDoc = await t.get(blockerActionRef);
      const blockeeActionDoc = await t.get(blockeeActionRef);
      const blockerAction = blockerActionDoc.data();
      const blockeeAction = blockeeActionDoc.data();
      if (
        relationshipExists(blockerAction, blockeeId) ||
        relationshipExists(blockeeAction, blockerId)
      ) {
        throw "A relationship already exists with the target action.";
      }
      t.update(blockerActionRef, {
        blockeeActionIds: arrayUnion(blockeeId)
      });
      t.update(blockeeActionRef, {
        blockerActionIds: arrayUnion(blockerId)
      });
      Notify.create(i18n.global.t("toastRelationshipAdded"));
    });
  } catch (error) {
    console.log("Transaction failure:", error);
    showErrorMessage("Error adding relationship", error.message);
  }
}

async function deleteNestingRelationship(parentId, childId) {
  const parentActionRef = doc(firebaseDb, "actions", parentId);
  const childActionRef = doc(firebaseDb, "actions", childId);
  try {
    await runTransaction(firebaseDb, async (t) => {
      t.update(parentActionRef, {
        childrenActionIds: arrayRemove(childId)
      });
      t.update(childActionRef, {
        parentActionId: deleteField()
      });
      Notify.create(i18n.global.t("toastRelationshipRemoved"));
    });
  } catch (error) {
    console.log("Transaction failure:", error);
    showErrorMessage("Error removing nesting relationship", error.message);
  }
}

async function deleteBlockingRelationship(blockerId, blockeeId) {
  const blockerActionRef = doc(firebaseDb, "actions", blockerId);
  const blockeeActionRef = doc(firebaseDb, "actions", blockeeId);
  try {
    await runTransaction(firebaseDb, async (t) => {
      t.update(blockerActionRef, {
        blockeeActionIds: arrayRemove(blockeeId)
      });
      t.update(blockeeActionRef, {
        blockerActionIds: arrayRemove(blockerId)
      });
      Notify.create(i18n.global.t("toastRelationshipRemoved"));
    });
  } catch (error) {
    console.log("Transaction failure:", error);
    showErrorMessage("Error removing blocking relationship", error.message);
  }
}
