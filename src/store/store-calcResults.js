import { uid, Notify } from "quasar";
import { firebase, firebaseDb, firebaseAuth } from "boot/firebase";
import { firestoreAction } from "vuexfire";
import { showErrorMessage } from "src/utils/util-show-error-message";

const state = {
  baseline: null
};

/*const mutations = {
  setBaseline(state, baseline) {
    state.baseline = baseline;
  }
};*/

const mutations = {
  setShow12HourTimeFormat(state, value) {
    state.settings.show12HourTimeFormat = value;
  },
  setShowTasksInOneList(state, value) {
    state.settings.showTasksInOneList = value;
  },
  setSettings(state, settings) {
    Object.assign(state.settings, settings);
  },
  setBaseline(state, baseline) {
    Object.assign(state.baseline, baseline);
  }
};

const actions = {
  /*setShow12HourTimeFormat({ commit, dispatch }, value) {
    commit("setShow12HourTimeFormat", value);
    dispatch("saveSettings");
  },
  setShowTasksInOneList({ commit, dispatch }, value) {
    commit("setShowTasksInOneList", value);
    dispatch("saveSettings");
  },*/
  setBaseline({ commit, dispatch }, baseline) {
    console.log("setBaseline");
    commit("setBaseline", baseline);
    //dispatch("saveSettings");
  },
  /*saveSettings({ state }) {
    LocalStorage.set("settings", state.settings);
  },
  getSettings({ commit }) {
    let settings = LocalStorage.getItem("settings");
    if (settings) {
      commit("setSettings", settings);
    }
  }*/

  /*setBaseline({ dispatch }, payload) {
    let modelId = payload.modelId;
    //let nodeId = payload.updates.id;

    //let formulaChanged = false;
    payload.data.updateTime = firebase.firestore.FieldValue.serverTimestamp();
    payload.data.updatedBy = firebaseAuth.currentUser.uid;

    firebaseDb
      .collection("models")
      .doc(modelId)
      .collection("calcResults")
      .doc("baseline")
      .set(payload.data)
      .then(function() {
        Notify.create("Baseline updated!");
        //dispatch("calculator/calculateBaseline", orgId, { root: true });
      })
      .catch(function(error) {
        showErrorMessage("Error updating baseline", error.message);
      });
  },*/
  bindBaseline: firestoreAction(({ bindFirestoreRef }, modelId) => {
    let userId = firebaseAuth.currentUser.uid;
    // return the promise returned by `bindFirestoreRef`
    return bindFirestoreRef(
      "baseline",
      firebaseDb
        .collection("models")
        .doc(modelId)
        .collection("calcResults")
        .doc("baseline"),
      {
        maxRefDepth: 1,
        wait: true //this also forces reset: false
      }
    );
  }),

  unbindBaseline: firestoreAction(({ unbindFirestoreRef }) => {
    unbindFirestoreRef("baseline", false);
  })
};

const getters = {};

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters
};
