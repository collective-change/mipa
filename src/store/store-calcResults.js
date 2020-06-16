import { uid, Notify } from "quasar";
import { firebase, firebaseDb, firebaseAuth } from "boot/firebase";
import { firestoreAction } from "vuexfire";
import { showErrorMessage } from "src/utils/util-show-error-message";
import idb from "src/api/idb";

const state = {
  baseline: {}
};

/*const mutations = {
  setBaseline(state, baseline) {
    state.baseline = baseline;
  }
};*/

const mutations = {
  setBaseline(state, baseline) {
    state.baseline = baseline;
  }
};

const actions = {
  async saveBaseline({ dispatch }, baseline) {
    await idb.saveBaseline(baseline);
  },

  async loadBaseline({ commit }, id) {
    commit("setBaseline", await idb.getBaseline(id));
    /*let cats = await idb.getCats();
    cats.forEach(c => {
      context.state.cats.push(c);
    });I/*/
  }

  /*
  setBaseline({ commit, dispatch }, baseline) {
    //console.log(baseline);
    commit("setBaseline", baseline);
  }*/

  /*getBaseline({ commit }) {
    let settings = LocalStorage.getItem("settings");
    if (settings) {
      commit("setBaseline", baseline);
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
  /*bindBaseline: firestoreAction(({ bindFirestoreRef }, modelId) => {
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
  })*/
};

const getters = {};

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters
};
