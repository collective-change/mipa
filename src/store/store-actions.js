import { uid, Notify } from "quasar";
import { firebase, firebaseDb, firebaseAuth } from "boot/firebase";
import { firestoreAction } from "vuexfire";
import { showErrorMessage } from "src/utils/util-show-error-message";

const state = {
  actions: [],
  search: "",
  sort: "name"
};

const mutations = {
  //synchronous
  clearActions(state) {
    state.actions = {};
  },
  setSearch(state, value) {
    state.search = value;
  },
  setSort(state, value) {
    state.sort = value;
  },
  setActionsDownloaded(state, value) {
    state.actionsDownloaded = value;
  }
};

const actions = {
  //may be asynchronous or synchronous
  updateAction({ dispatch }, originalPayload) {
    //Clone the original payload so we don't modify it (it's
    //passed by reference) when setting the serverTimestamp.
    let payload = JSON.parse(JSON.stringify(originalPayload));
    payload.updates.updateTime = firebase.firestore.FieldValue.serverTimestamp();
    payload.updates.updatedBy = firebaseAuth.currentUser.uid;

    firebaseDb
      .collection("actions")
      .doc(payload.id)
      .set(payload.updates, { merge: true })
      .then(function() {
        let keys = Object.keys(payload.updates);
        //console.log("keys: ", keys);
        if (!(keys.includes("completed") && keys.length == 1))
          Notify.create("Action updated!");
      })
      .catch(function(error) {
        showErrorMessage("Error updating action", error.message);
      });
  },

  updateActionsRoiResults({ dispatch }, data) {
    //get actions from store
    //for each action in actionsRoiResults, compare with action in store
    let actionsRoiResults = data.actionsRoiResults;
    let newRoiResults, matchedStoreAction;
    //console.log(state.actions);
    let batch = firebaseDb.batch();
    let actionsRef = firebaseDb.collection("actions");
    let batchedWrites = 0;
    actionsRoiResults.forEach(function(actionRoiResults, index, fullArray) {
      newRoiResults = Object.assign({}, actionRoiResults);
      matchedStoreAction = state.actions.find(
        action => action.id == actionRoiResults.actionId
      );
      if (roiResultsChangedSignificantly(newRoiResults, matchedStoreAction)) {
        //add action to update list
        console.log("actionLeverage changed significantly");
        delete newRoiResults.actionId;
        batch.update(actionsRef.doc(actionRoiResults.actionId), newRoiResults);
        batchedWrites++;
      }
      if (
        batchedWrites == 500 ||
        (batchedWrites > 0 && index == fullArray.length - 1)
      ) {
        batch
          .commit()
          .then(function() {
            batchedWrites = 0;
            batch = firebaseDb.batch();
            console.log("action results updated");
            Notify.create("Action results updated!");
          })
          .catch(function(error) {
            showErrorMessage("Error updating actions results", error.message);
          });
      }
    });
  },

  deleteAction({ dispatch }, actionId) {
    let userId = firebaseAuth.currentUser.uid;
    firebaseDb
      .collection("actions")
      .doc(actionId)
      .delete()
      .then(function() {
        Notify.create("Action deleted!");
      })
      .catch(function(error) {
        showErrorMessage("Error removing action", error.message);
      });
  },
  addAction({ dispatch }, action) {
    //let userId = firebaseAuth.currentUser.uid;

    action.initiator = firebaseAuth.currentUser.uid;
    action.createTime = firebase.firestore.FieldValue.serverTimestamp();
    action.createdBy = firebaseAuth.currentUser.uid;
    action.updateTime = firebase.firestore.FieldValue.serverTimestamp();
    action.updatedBy = firebaseAuth.currentUser.uid;

    firebaseDb
      .collection("actions")
      .add(action)
      .then(function() {
        Notify.create("Action added!");
      })
      .catch(function(error) {
        showErrorMessage("Error adding action", error.message);
      });
  },
  bindActions: firestoreAction(({ bindFirestoreRef }, orgId) => {
    let userId = firebaseAuth.currentUser.uid;
    // return the promise returned by `bindFirestoreRef`
    return bindFirestoreRef(
      "actions",
      firebaseDb.collection("actions").where("orgId", "==", orgId),
      //.where("users", "array-contains", userId)
      //.orderBy("updateTime", "desc"),
      //.orderBy("goal", "asc"),
      {
        maxRefDepth: 1,
        reset: true, //reset actions so they don't linger when switching orgs
        wait: false
      }
    );
  }),
  unbindActions: firestoreAction(({ unbindFirestoreRef }) => {
    unbindFirestoreRef("actions", true); //reset data when unbinding
  }),
  setSearch({ commit }, value) {
    commit("setSearch", value);
  },
  setSort({ commit }, value) {
    commit("setSort", value);
  },
  addParent({ rootState }, parentId) {
    let childId = rootState.uiAction.uiAction.id;
    addNestingRelationship(parentId, childId);
  },
  addChild({ rootState }, childId) {
    let parentId = rootState.uiAction.uiAction.id;
    addNestingRelationship(parentId, childId);
  },
  addBlocker({ rootState }, blockerId) {
    let blockeeId = rootState.uiAction.uiAction.id;
    addBlockingRelationship(blockerId, blockeeId);
  },
  addBlockee({ rootState }, blockeeId) {
    let blockerId = rootState.uiAction.uiAction.id;
    addBlockingRelationship(blockerId, blockeeId);
  },
  deleteRelationship({}, payload) {
    switch (payload.type) {
      case "nesting":
        deleteNestingRelationship(payload.parent, payload.child);
        break;
      case "blocking":
        deleteBlockingRelationship(payload.blocker, payload.blockee);
        break;
      default:
        showErrorMessage(
          "Error deleting relationship",
          `"${payload.type}" not recognized`
        );
    }
  }
};

const getters = {
  actions: state => {
    if (!state.actions) {
      return [];
    }
    return state.actions.map(action => ({ ...action, id: action.id }));
  },
  actionsSorted: state => {
    let actionsSorted = {},
      keysOrdered = Object.keys(state.actions);

    keysOrdered.sort((a, b) => {
      let actionAProp = state.actions[a][state.sort].toLowerCase(),
        actionBProp = state.actions[b][state.sort].toLowerCase();
      if (actionAProp > actionBProp) return 1;
      else if (actionAProp < actionBProp) return -1;
      else return 0;
    });

    keysOrdered.forEach(key => {
      actionsSorted[key] = state.actions[key];
    });

    return actionsSorted;
  },
  actionsFiltered: (state, getters) => {
    let actionsSorted = getters.actionsSorted,
      actionsFiltered = {};
    if (state.search) {
      //populate empty object
      Object.keys(actionsSorted).forEach(function(key) {
        let action = actionsSorted[key],
          actionNameLowerCase = action.name.toLowerCase(),
          searchLowerCase = state.search.toLowerCase();
        if (actionNameLowerCase.includes(searchLowerCase)) {
          actionsFiltered[key] = action;
        }
      });
      return actionsFiltered;
    }
    return actionsSorted;
  },
  actionsTODO: (state, getters) => {
    let actionsFiltered = getters.actionsFiltered;
    let actions = {};
    Object.keys(actionsFiltered).forEach(function(key) {
      let action = actionsFiltered[key];
      if (!action.completed) {
        actions[key] = action;
      }
    });
    return actions;
  },
  actionsCompleted: (state, getters) => {
    let actionsFiltered = getters.actionsFiltered;
    let actions = {};
    Object.keys(actionsFiltered).forEach(function(key) {
      let action = actionsFiltered[key];
      if (action.completed) {
        actions[key] = action;
      }
    });
    return actions;
  },
  blockingRelationships: state => {
    let relationships = [];
    state.actions.forEach(function(action) {
      //console.log(node.id);
      if ("blockerActionIds" in action) {
        action.blockerActionIds.forEach(function(blockerId) {
          relationships.push({
            blockerId: blockerId,
            blockeeId: action.id
            /*isBlocking:
              "blockingInfluencers" in node
                ? node.blockingInfluencers.includes(influencerId)
                : false,*/
          });
        });
      }
    });
    //console.log("relationshipLinks updated");
    return relationships;
  }
};

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters
};

function roiResultsChangedSignificantly(newRoiResults, matchedStoreAction) {
  //console.log(newRoiResults);
  //console.log(matchedStoreAction);
  if (typeof matchedStoreAction.actionLeverage == "undefined") return true;

  if (
    isNaN(matchedStoreAction.actionLeverage) &&
    !isNaN(newRoiResults.actionLeverage)
  )
    return true;
  if (
    !isNaN(matchedStoreAction.actionLeverage) &&
    isNaN(newRoiResults.actionLeverage)
  )
    return true;

  if (
    isNaN(matchedStoreAction.marginalTotalBenefitNpv) &&
    !isNaN(newRoiResults.marginalTotalBenefitNpv)
  )
    return true;
  if (
    !isNaN(matchedStoreAction.marginalTotalBenefitNpv) &&
    isNaN(newRoiResults.marginalTotalBenefitNpv)
  )
    return true;

  if (
    isNaN(matchedStoreAction.marginalTotalCostNpv) &&
    !isNaN(newRoiResults.marginalTotalCostNpv)
  )
    return true;
  if (
    !isNaN(matchedStoreAction.marginalTotalCostNpv) &&
    isNaN(newRoiResults.marginalTotalCostNpv)
  )
    return true;

  if (
    Math.abs(newRoiResults.actionLeverage / matchedStoreAction.actionLeverage) >
    1.001
  )
    return true;
  if (
    Math.abs(matchedStoreAction.actionLeverage / newRoiResults.actionLeverage) >
    1.001
  )
    return true;

  if (
    Math.abs(
      newRoiResults.marginalTotalBenefitNpv /
        matchedStoreAction.marginalTotalBenefitNpv
    ) > 1.001
  )
    return true;
  if (
    Math.abs(
      matchedStoreAction.marginalTotalBenefitNpv /
        newRoiResults.marginalTotalBenefitNpv
    ) > 1.001
  )
    return true;

  if (
    Math.abs(
      newRoiResults.marginalTotalCostNpv /
        matchedStoreAction.marginalTotalCostNpv
    ) > 1.001
  )
    return true;
  if (
    Math.abs(
      matchedStoreAction.marginalTotalCostNpv /
        newRoiResults.marginalTotalCostNpv
    ) > 1.001
  )
    return true;

  return false;
}

function relationshipExists(action, targetActionId) {
  if (
    action.blockerActionIds &&
    action.blockerActionIds.includes(targetActionId)
  )
    return true;
  if (
    action.blockeeActionIds &&
    action.blockeeActionIds.includes(targetActionId)
  )
    return true;
  if (
    action.childrenActionIds &&
    action.childrenActionIds.includes(targetActionId)
  )
    return true;
  if (action.parentActionId && action.parentActionId == targetActionId)
    return true;
  return false;
}

async function addNestingRelationship(parentId, childId) {
  const parentActionRef = firebaseDb.collection("actions").doc(parentId);
  const childActionRef = firebaseDb.collection("actions").doc(childId);
  try {
    await firebaseDb.runTransaction(async t => {
      const parentActionDoc = await t.get(parentActionRef);
      const childActionDoc = await t.get(childActionRef);
      const parentAction = parentActionDoc.data();
      const childAction = childActionDoc.data();
      //check if the current action already has a relationship with the target
      if (
        relationshipExists(parentAction, childId) ||
        relationshipExists(childAction, parentId)
      )
        throw new Error(
          "A relationship already exists with the target action."
        );
      if (childAction.parentActionId) {
        console.log("parent exists");
        throw new Error("Parent action already exists.");
      }
      t.update(parentActionRef, {
        childrenActionIds: firebase.firestore.FieldValue.arrayUnion(childId)
      });
      t.update(childActionRef, {
        parentActionId: parentId
      });
      Notify.create("Relationship added!");
    });
  } catch (error) {
    console.log("Transaction failure:", error);
    showErrorMessage("Error adding relationship", error.message);
  }
}

async function addBlockingRelationship(blockerId, blockeeId) {
  const blockerActionRef = firebaseDb.collection("actions").doc(blockerId);
  const blockeeActionRef = firebaseDb.collection("actions").doc(blockeeId);
  try {
    await firebaseDb.runTransaction(async t => {
      const blockerActionDoc = await t.get(blockerActionRef);
      const blockeeActionDoc = await t.get(blockeeActionRef);
      const blockerAction = blockerActionDoc.data();
      const blockeeAction = blockeeActionDoc.data();
      //check if the current action already has a relationship with the target
      if (
        relationshipExists(blockerAction, blockeeId) ||
        relationshipExists(blockeeAction, blockerId)
      )
        throw "A relationship already exists with the target action.";
      t.update(blockerActionRef, {
        blockeeActionIds: firebase.firestore.FieldValue.arrayUnion(blockeeId)
      });
      t.update(blockeeActionRef, {
        blockerActionIds: firebase.firestore.FieldValue.arrayUnion(blockerId)
      });
      Notify.create("Relationship added!");
    });
  } catch (error) {
    console.log("Transaction failure:", error);
    showErrorMessage("Error adding relationship", error.message);
  }
}

async function deleteNestingRelationship(parentId, childId) {
  const parentActionRef = firebaseDb.collection("actions").doc(parentId);
  const childActionRef = firebaseDb.collection("actions").doc(childId);
  try {
    await firebaseDb.runTransaction(async t => {
      t.update(parentActionRef, {
        childrenActionIds: firebase.firestore.FieldValue.arrayRemove(childId)
      });
      t.update(childActionRef, {
        parentActionId: firebase.firestore.FieldValue.delete()
      });
      Notify.create("Relationship removed!");
    });
  } catch (error) {
    console.log("Transaction failure:", error);
    showErrorMessage("Error removing nesting relationship", error.message);
  }
}

async function deleteBlockingRelationship(blockerId, blockeeId) {
  const blockerActionRef = firebaseDb.collection("actions").doc(blockerId);
  const blockeeActionRef = firebaseDb.collection("actions").doc(blockeeId);
  try {
    await firebaseDb.runTransaction(async t => {
      t.update(blockerActionRef, {
        blockeeActionIds: firebase.firestore.FieldValue.arrayRemove(blockeeId)
      });
      t.update(blockeeActionRef, {
        blockerActionIds: firebase.firestore.FieldValue.arrayRemove(blockerId)
      });
      Notify.create("Relationship removed!");
    });
  } catch (error) {
    console.log("Transaction failure:", error);
    showErrorMessage("Error removing blocking relationship", error.message);
  }
}
