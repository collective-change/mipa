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
        console.log("roi changed significantly");
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
  if (typeof matchedStoreAction.roi == "undefined") return true;
  if (newRoiResults.roi / matchedStoreAction.roi > 1.05) return true;
  if (matchedStoreAction.roi / newRoiResults.roi > 1.05) return true;
  if (
    newRoiResults.marginalValueNpv / matchedStoreAction.marginalValueNpv >
    1.05
  )
    return true;
  if (
    matchedStoreAction.marginalValueNpv / newRoiResults.marginalValueNpv >
    1.05
  )
    return true;
  if (newRoiResults.marginalCostNpv / matchedStoreAction.marginalCostNpv > 1.05)
    return true;
  if (matchedStoreAction.marginalCostNpv / newRoiResults.marginalCostNpv > 1.05)
    return true;
  return false;
}
