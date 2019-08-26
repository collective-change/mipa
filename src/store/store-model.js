import Vue from "vue";
import { uid, Notify } from "quasar";
import { firebase, firebaseDb, firebaseAuth } from "boot/firebase";
import { firestoreAction } from "vuexfire";
import { showErrorMessage } from "src/functions/function-show-error-message";

const state = {
  nodes: [],
  testNodes: [
    // { name: "firmware", group: 1, class: "system" },
    // { name: "loader", group: 1, class: "system" },
    // { name: "kernel", group: 1, class: "system" },
    // { name: "systemd", group: 1, class: "mount" },
    // { name: "mount", group: 2, class: "mount" },
    // { name: "init.scope", group: 1, class: "init" },
    // { name: "system.slice", group: 1, class: "init" },
    // { name: "system-getty.slice", group: 1, class: "init" },
    // { name: "systemd-initctl.socker", group: 1, class: "init" },
    // { name: "tmp.mount", group: 1, class: "init" },
    // { name: "sys-devices", group: 2, class: "init" },
    // { name: "boot.mount", group: 2, class: "init" }

    // { id: "0Z", name: "firmware", group: 1, class: "system" },
    // { id: "1A", name: "loader", group: 1, class: "system" },
    // { id: "2B", name: "kernel", group: 1, class: "system" },
    // { id: "3C", name: "systemd", group: 1, class: "mount" },
    // { id: "4D", name: "mount", group: 2, class: "mount" },
    // { id: "5E", name: "init.scope", group: 1, class: "init" },
    // { id: "6F", name: "system.slice", group: 1, class: "init" },
    // { id: "7G", name: "system-getty.slice", group: 1, class: "init" },
    // { id: "8H", name: "systemd-initctl.socker", group: 1, class: "init" },
    // { id: "9I", name: "tmp.mount", group: 1, class: "init" },
    // { id: "10J", name: "sys-devices", group: 2, class: "init" },
    // { id: "11K", name: "boot.mount", group: 2, class: "init" }

    { id: "0Z", name: "firmware", class: "test" },
    { id: "1A", name: "loader", class: "system" },
    { id: "2B", name: "kernel", class: "system" },
    { id: "3C", name: "systemd", class: "mount" },
    { id: "4D", name: "mount", class: "mount" },
    { id: "5E", name: "init.scope", class: "init" },
    { id: "6F", name: "system.slice", class: "init" },
    { id: "7G", name: "system-getty.slice", class: "init" },
    { id: "8H", name: "systemd-initctl.socker", class: "init" },
    { id: "9I", name: "tmp.mount", class: "init" },
    { id: "10J", name: "sys-devices", class: "init" },
    { id: "11K", name: "boot.mount", class: "init" }
  ],
  testLinks: [
    // { source: 1, target: 0, value: 1, type: "depends" },
    // { source: 2, target: 1, value: 8, type: "depends" },
    // { source: 3, target: 2, value: 6, type: "depends" },
    // { source: 4, target: 3, value: 1, type: "needs" },
    // { source: 5, target: 3, value: 1, type: "needs" },
    // { source: 6, target: 3, value: 1, type: "needs" },
    // { source: 7, target: 3, value: 1, type: "needs" },
    // { source: 8, target: 3, value: 2, type: "needs" },
    // { source: 9, target: 3, value: 1, type: "needs" },
    // { source: 11, target: 10, value: 1, type: "depends" },
    // { source: 11, target: 3, value: 3, type: "depends" },
    // { source: 11, target: 2, value: 3, type: "depends" },
    // { source: 11, target: 3, value: 5, type: "needs" }

    // { source: "1A", target: "0Z", value: 1, type: "depends" },
    // { source: "2B", target: "1A", value: 8, type: "depends" },
    // { source: "3C", target: "2B", value: 6, type: "depends" },
    // { source: "4D", target: "3C", value: 1, type: "needs" },
    // { source: "5E", target: "3C", value: 1, type: "needs" },
    // { source: "6F", target: "3C", value: 1, type: "needs" },
    // { source: "7G", target: "3C", value: 1, type: "needs" },
    // { source: "8H", target: "3C", value: 2, type: "needs" },
    // { source: "9I", target: "3C", value: 1, type: "needs" },
    // { source: "11K", target: "10J", value: 1, type: "depends" },
    // { source: "11K", target: "3C", value: 3, type: "depends" },
    // { source: "11K", target: "2B", value: 3, type: "depends" },
    // { source: "11K", target: "3C", value: 5, type: "needs" }

    { source: "1A", target: "0Z" },
    { source: "2B", target: "1A", type: "depends" },
    { source: "3C", target: "2B", type: "depends" },
    { source: "4D", target: "3C", type: "needs" },
    { source: "5E", target: "3C", type: "needs" },
    { source: "6F", target: "3C", type: "needs" },
    { source: "7G", target: "3C", type: "needs" },
    { source: "8H", target: "3C", type: "needs" },
    { source: "9I", target: "3C", type: "needs" },
    { source: "11K", target: "10J", type: "depends" },
    { source: "11K", target: "3C", type: "depends" },
    { source: "11K", target: "2B", type: "depends" },
    { source: "11K", target: "3C", type: "needs" }
  ],
  selectedNodeId: null,
  modelDownloaded: false
};

const mutations = {
  setSelectedNodeId(state, nodeId) {
    state.selectedNodeId = nodeId;
  }
};

const actions = {
  bindNodes: firestoreAction(({ bindFirestoreRef }, teamId) => {
    let userId = firebaseAuth.currentUser.uid;
    // return the promise returned by `bindFirestoreRef`
    return bindFirestoreRef(
      "nodes",
      firebaseDb
        .collection("teams")
        .doc(teamId)
        .collection("nodes"),
      {
        reset: true,
        maxRefDepth: 1
      }
    );
  }),

  unbindNodes: firestoreAction(({ unbindFirestoreRef }) => {
    unbindFirestoreRef("nodes");
  }),

  setSelectedNodeId({ commit }, nodeId) {
    commit("setSelectedNodeId", nodeId);
  },

  setSelectedNode({ commit }, node) {
    commit("setSelectedNode", node);
  },

  // addNode({ }, node) {
  //   node.createTime = firebase.firestore.FieldValue.serverTimestamp();
  //   node.createdBy = firebaseAuth.currentUser.uid;
  //   firebaseDb
  //     .collection("teams")
  //     .add(team)
  //     .then(function () {
  //       Notify.create("Team added!");
  //     })
  //     .catch(function (error) {
  //       showErrorMessage("Error adding team", error.message);
  //     });
  // },

  updateNode({}, payload) {
    //console.log("payload.teamId: ", payload.teamId);
    let teamId = payload.teamId;
    let nodeId = payload.updates.id;
    payload.updates.updateTime = firebase.firestore.FieldValue.serverTimestamp();
    payload.updates.updatedBy = firebaseAuth.currentUser.uid;
    let nodesRef = firebaseDb
      .collection("teams")
      .doc(teamId)
      .collection("nodes");
    nodesRef
      .doc(nodeId)
      .set(payload.updates, { merge: true })
      .then(function() {
        let keys = Object.keys(payload.updates);
        //console.log("keys: ", keys);
        Notify.create("Node updated!");
      })
      .catch(function(error) {
        showErrorMessage("Error updating node", error.message);
      });
  }

  // deleteTeam({ }, id) {
  //   //let userId = firebaseAuth.currentUser.uid;
  //   firebaseDb
  //     .collection("teams")
  //     .doc(id)
  //     .delete()
  //     .then(function () {
  //       Notify.create("Team deleted!");
  //     })
  //     .catch(function (error) {
  //       showErrorMessage("Error delete team", error.message);
  //     });
  // }
};

const getters = {
  nodes: state => {
    if (!state.nodes) {
      return [];
    }
    return state.nodes.map(node => ({ ...node, id: node.id }));
  },
  links: state => {
    let allLinks = [];
    state.nodes.forEach(function(node) {
      //console.log(node.id);
      if ("influencers" in node) {
        node.influencers.forEach(function(influencer) {
          allLinks.push({ source: influencer, target: node.id });
        });
      }
    });
    return allLinks;
  }
};

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters
};
