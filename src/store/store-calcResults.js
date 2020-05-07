import Vue from "vue";
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

const mutations = {};

const actions = {
  /*setBaseline({ commit }, baseline) {
    commit("setBaseline", baseline);
  },*/
  setBaseline({ dispatch }, payload) {
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
  },
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
        reset: true,
        maxRefDepth: 1
      }
    );
  }),

  unbindBaseline: firestoreAction(({ unbindFirestoreRef }) => {
    unbindFirestoreRef("baseline");
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
