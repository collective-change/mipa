import Vue from "vue";
import { uid, Notify } from "quasar";
import { firebase, firebaseDb, firebaseAuth } from "boot/firebase";
import { firestoreAction } from "vuexfire";
import { showErrorMessage } from "src/functions/function-show-error-message";
import { mergeShards } from "src/functions/function-shards";

const state = {
  nodes: [],
  testNodes: [
    {
      id: "a",
      name: "A"
      // name: { en: "A", zh_tw: "甲" },
      // formula: {}, //a formula object
      // unit: { id: 287, unitObject: {} },
      // hasDetails: ["notes", "refUrls"],
      // chatId: "achat"
    },
    { id: "b", name: "B" },
    { id: "c", name: "C" },
    { id: "d", name: "D" },
    { id: "e", name: "E" },
    { id: "f", name: "F" },
    { id: "g", name: "G" }
  ],
  testLinks: [
    //in the objects below, so=source, ta=target, pd=partial derivative, cm=current multiplier
    // l1: { so: "a", ta: "b", pd: {}, cm: 2 },
    // l2: { so: "a", ta: "c", pd: {}, cm: 20 },
    // l3: { so: "a", ta: "f", pd: {}, cm: 10 },
    // l4: { so: "b", ta: "d", pd: {}, cm: 50 },
    // l5: { so: "c", ta: "f", pd: {}, cm: 1 },
    // l6: { so: "d", ta: "g", pd: {}, cm: 0.1 },
    // l7: { so: "e", ta: "f", pd: {}, cm: 5 }
    { source: "a", target: "b", pd: {}, cm: 2 },
    { source: "a", target: "c", pd: {}, cm: 20 },
    { source: "a", target: "f", pd: {}, cm: 10 },
    { source: "b", target: "d", pd: {}, cm: 50 },
    { source: "c", target: "f", pd: {}, cm: 1 },
    { source: "d", target: "f", pd: {}, cm: 1 },
    { source: "d", target: "g", pd: {}, cm: 0.1 },
    { source: "e", target: "f", pd: {}, cm: 5 }
  ],
  modelDownloaded: false
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
  })
};

const getters = {
  links: state => {
    //return state.nodes;
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
  actions,
  getters
};
