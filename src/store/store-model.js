import { uid, Notify } from "quasar";
import { firebase, firebaseDb, firebaseAuth } from "boot/firebase";
import { firestoreAction } from "vuexfire";
import { showErrorMessage } from "src/utils/util-show-error-message";
import { classifyInfluencers } from "src/utils/util-node-operations";

const state = {
  currentModel: null,
  nodes: []
};

const mutations = {
  deleteLink(state, payload) {
    let influencerId = payload.influencerId;
    let influenceeId = payload.influenceeId;
    let influencer = state.nodes.find(function(node) {
      if (node.id == influencerId) return true;
    });
    let influencee = state.nodes.find(function(node) {
      if (node.id == influenceeId) return true;
    });

    //in influencer node, remove influencee
    influencer.influencees = influencer.influencees.filter(function(id) {
      return id != influenceeId;
    });
    //in influencee node, remove influencer
    influencee.influencers = influencee.influencers.filter(function(id) {
      return id != influencerId;
    });
  }
};

const actions = {
  addOrgMainModel({ dispatch }, payload) {
    console.log("payload: ", payload);
    console.log("id: ", payload.orgId);
    let model = {};
    model.isPublic = false;
    model.owners = { users: [firebaseAuth.currentUser.uid] };
    model.editors = { users: [firebaseAuth.currentUser.uid] };
    model.viewers = { org: [payload.orgId] };
    model.isOrgMainModel = true;
    model.name = "Main";
    model.unwrittenChanges = [];
    firebaseDb
      .collection("models")
      .doc(payload.orgId) //use orgId as the model's id
      .set(model)
      .then(function(docRef) {
        //Notify.create("Node added! ");
      })
      .catch(function(error) {
        showErrorMessage("Error creating model", error.message);
      });
  },

  async updateModel({ dispatch }, payload) {
    let modelId = payload.modelId;

    //let formulaChanged = false;
    payload.updates.updateTime = firebase.firestore.FieldValue.serverTimestamp();
    payload.updates.updatedBy = firebaseAuth.currentUser.uid;

    let modelRef = firebaseDb.collection("models").doc(modelId);
    try {
      await modelRef.set(payload.updates, { merge: true });
      Notify.create("Model updated!");
    } catch (error) {
      console.error("Error updating model", error.message);
      showErrorMessage("Error updating model", error.message);
    }
  },

  deleteModel({}, modelId) {
    //let modelId = payload.modelId;
    //let node = payload.node;
    let modelRef = firebaseDb.collection("models").doc(modelId);
    modelRef
      .delete()
      .then(function() {
        Notify.create("Model deleted!");
      })
      .catch(function(error) {
        showErrorMessage("Error deleting model", error.message);
      });
  },

  bindCurrentModel: firestoreAction(({ bindFirestoreRef }, modelId) => {
    let userId = firebaseAuth.currentUser.uid;
    // return the promise returned by `bindFirestoreRef`
    return bindFirestoreRef(
      "currentModel",
      firebaseDb.collection("models").doc(modelId),
      {
        maxRefDepth: 1,
        wait: false,
        reset: true
      }
    );
  }),

  unbindCurrentModel: firestoreAction(({ unbindFirestoreRef }) => {
    unbindFirestoreRef("currentModel", true);
  }),

  bindNodes: firestoreAction(({ bindFirestoreRef }, modelId) => {
    let userId = firebaseAuth.currentUser.uid;
    // return the promise returned by `bindFirestoreRef`
    return bindFirestoreRef(
      "nodes",
      firebaseDb
        .collection("models")
        .doc(modelId)
        .collection("nodes"),
      {
        maxRefDepth: 1,
        wait: false,
        reset: true
      }
    );
  }),

  unbindNodes: firestoreAction(({ unbindFirestoreRef }) => {
    unbindFirestoreRef("nodes", true);
  }),

  addNode({ dispatch }, payload) {
    //console.log(payload);
    let node = payload.node;
    node.createTime = firebase.firestore.FieldValue.serverTimestamp();
    node.createdBy = firebaseAuth.currentUser.uid;
    firebaseDb
      .collection("models")
      .doc(payload.modelId)
      .collection("nodes")
      .add(node)
      .then(function(docRef) {
        //add in default sysFormula
        //docRef.update({ sysFormula: `delay( ${docRef.id} , dt, 0)` });
        Notify.create("Node added! ");
        if (payload.newNodeRole == "influencer") {
          dispatch("addLink", {
            modelId: payload.modelId,
            link: {
              sourceNodeId: payload.sourceNodeId,
              targetNodeId: docRef.id,
              targetType: "influencer"
            }
          });
        } else if (payload.newNodeRole == "influencee") {
          dispatch("addLink", {
            modelId: payload.modelId,
            link: {
              sourceNodeId: payload.sourceNodeId,
              targetNodeId: docRef.id,
              targetType: "influencee"
            }
          });
        }
      })
      .catch(function(error) {
        showErrorMessage("Error adding node", error.message);
      });
  },

  updateNode({ dispatch }, payload) {
    let modelId = payload.modelId;
    let nodeId = payload.updates.id;

    //let formulaChanged = false;
    payload.updates.updateTime = firebase.firestore.FieldValue.serverTimestamp();
    payload.updates.updatedBy = firebaseAuth.currentUser.uid;

    let nodesRef = firebaseDb
      .collection("models")
      .doc(modelId)
      .collection("nodes");
    nodesRef
      .doc(nodeId)
      .set(payload.updates, { merge: true })
      .then(function() {
        //let keys = Object.keys(payload.updates);
        Notify.create("Node updated!");
        //if existence of currentValue changed, then run
        //updateClassifiedInfluencersOf on the node's influencees
        if (
          ("currentValueExistenceChanged" in payload &&
            payload.currentValueExistenceChanged) ||
          ("symbolChanged" in payload && payload.symbolChanged)
        ) {
          let node = state.nodes.find(node => node.id == nodeId);
          let influenceeIds = node.influencees;
          dispatch("updateClassifiedInfluencersOf", {
            modelId: payload.modelId,
            influenceeIds: influenceeIds
          });
        }
      })
      .catch(function(error) {
        console.error("Error updating node", error.message);
        showErrorMessage("Error updating node", error.message);
      });
  },

  deleteNode({}, payload) {
    let modelId = payload.modelId;
    let node = payload.node;
    let nodeRef = firebaseDb
      .collection("models")
      .doc(modelId)
      .collection("nodes")
      .doc(node.id);
    nodeRef
      .delete()
      .then(function() {
        Notify.create("Node deleted!");
      })
      .catch(function(error) {
        showErrorMessage("Error deleting node", error.message);
      });
  },

  addLink({ dispatch }, payload) {
    let link = payload.link;
    if (link.sourceNodeId == link.targetNodeId) {
      throw new Error("Source node and target node cannot be the same node!");
    }
    switch (link.targetType) {
      case "influencer":
        var influencerNodeId = link.targetNodeId;
        var influenceeNodeId = link.sourceNodeId;
        break;
      case "influencee":
        var influencerNodeId = link.sourceNodeId;
        var influenceeNodeId = link.targetNodeId;
        break;
      default:
        throw new Error("Link target type not recognized.");
    }

    var nodesRef = firebaseDb
      .collection("models")
      .doc(payload.modelId)
      .collection("nodes");
    var batch = firebaseDb.batch();
    if (influencerNodeId)
      batch.update(nodesRef.doc(influencerNodeId), {
        influencees: firebase.firestore.FieldValue.arrayUnion(influenceeNodeId)
      });
    if (influenceeNodeId)
      batch.update(nodesRef.doc(influenceeNodeId), {
        influencers: firebase.firestore.FieldValue.arrayUnion(influencerNodeId)
      });

    batch
      .commit()
      .then(function() {
        Notify.create("Link added!");
        //update class of source and target nodes
        dispatch("reDetermineNodeClass", {
          modelId: payload.modelId,
          nodeId: link.sourceNodeId
        });
        dispatch("reDetermineNodeClass", {
          modelId: payload.modelId,
          nodeId: link.targetNodeId
        });
        //run updateClassifiedInfluencers on influencee
        dispatch("updateClassifiedInfluencersOf", {
          modelId: payload.modelId,
          influenceeIds: [influenceeNodeId]
        });
      })
      .catch(function(error) {
        console.error("Error adding link", error.message);
        showErrorMessage("Error adding link", error.message);
      });
  },

  deleteLink({ commit, dispatch }, payload) {
    let link = payload.link;
    let influencerNodeId = link.influencerNodeId;
    let influenceeNodeId = link.influenceeNodeId;

    commit("deleteLink", {
      influencerId: influencerNodeId,
      influenceeId: influenceeNodeId
    });

    var nodesRef = firebaseDb
      .collection("models")
      .doc(payload.modelId)
      .collection("nodes");
    var batch = firebaseDb.batch();
    batch.update(nodesRef.doc(influencerNodeId), {
      influencees: firebase.firestore.FieldValue.arrayRemove(influenceeNodeId)
    });
    batch.update(nodesRef.doc(influenceeNodeId), {
      influencers: firebase.firestore.FieldValue.arrayRemove(influencerNodeId)
    });
    batch
      .commit()
      .then(function() {
        Notify.create("Link deleted!");
        //update class of influencer and influencee nodes
        dispatch("reDetermineNodeClass", {
          modelId: payload.modelId,
          nodeId: link.influencerNodeId
        });
        dispatch("reDetermineNodeClass", {
          modelId: payload.modelId,
          nodeId: link.influenceeNodeId
        });
      })
      .catch(function(error) {
        showErrorMessage("Error deleting link", error.message);
      });

    dispatch("updateClassifiedInfluencersOf", {
      modelId: payload.modelId,
      influenceeIds: [influenceeNodeId]
    });
  },

  reDetermineNodeClass({}, payload) {
    // Create a reference to the node doc.
    var nodeDocRef = firebaseDb
      .collection("models")
      .doc(payload.modelId)
      .collection("nodes")
      .doc(payload.nodeId);

    firebaseDb
      .runTransaction(function(transaction) {
        // This code may get re-run multiple times and generate POST 400 errors if there are conflicts.
        return transaction.get(nodeDocRef).then(function(nodeDoc) {
          if (!nodeDoc.exists) {
            throw "Node document does not exist!";
          }
          var node = nodeDoc.data();
          var hasInfluencers =
            node.influencers && node.influencers.length ? true : false;
          var hasInfluencees =
            node.influencees && node.influencees.length ? true : false;
          var oldClass = node.class;
          var docToBeUpdated = false; //this is a workround for the firestore limitation "FirebaseError: Every document read in a transaction must also be written."
          if (!hasInfluencers && !hasInfluencees && oldClass != "unlinked") {
            transaction.update(nodeDocRef, { class: "unlinked" });
            docToBeUpdated = true;
          } else if (!hasInfluencers && hasInfluencees && oldClass != "input") {
            transaction.update(nodeDocRef, { class: "input" });
            docToBeUpdated = true;
          } else if (
            hasInfluencers &&
            !hasInfluencees &&
            oldClass != "output"
          ) {
            transaction.update(nodeDocRef, { class: "output" });
            docToBeUpdated = true;
          } else if (hasInfluencers && hasInfluencees && oldClass != "state") {
            transaction.update(nodeDocRef, { class: "state" });
            docToBeUpdated = true;
          }
          if (docToBeUpdated == false) {
            //perform a dummy write as a workaround to the firestore limitation "FirebaseError: Every document read in a transaction must also be written."
            transaction.update(nodeDocRef, {});
          }
        });
      })
      .then(function() {
        //console.log("Transaction successfully committed!");
      })
      .catch(function(error) {
        console.log("reDetermineNodeClass failed: ", error);
      });
  },

  /* Recalculate classifiedInfluencers (unused and blocking influencers)
  of the node in the payload. */
  updateClassifiedInfluencersOf({ dispatch }, payload) {
    //console.log("updateClassifiedInfluencersOf");
    let modelId = payload.modelId;
    let influenceeIds = payload.influenceeIds;
    if (typeof influenceeIds != "undefined")
      influenceeIds.forEach(function(influenceeId) {
        //get influencee node
        let influenceeNode = state.nodes.find(node => node.id == influenceeId);
        //run classifyInfluencers
        let classifiedInfluencers = classifyInfluencers({
          thisNode: influenceeNode,
          nodes: state.nodes
        });

        //save results
        dispatch("updateNode", {
          modelId: modelId,
          updates: {
            id: influenceeId,
            unusedInfluencers: classifiedInfluencers.unused,
            blockingInfluencers: classifiedInfluencers.blocking
          }
        });
      });
    //console.log("end updateClassifiedInfluencersOf");
  },

  createNodeGroup({}, nodeId) {
    let nodeGroupElement = {
      type: "nodeGroup",
      id: uid(),
      label: "untitled node group",
      children: [{ type: "node", nodeId: nodeId }]
    };
    //TODO: create nodeGroupElement under nested node groups
    //use bredcrumb
    console.log(nodeId);
    var modelRef = firebaseDb.collection("models").doc(state.currentModel.id);
    modelRef
      .update({
        nodeGroups: firebase.firestore.FieldValue.arrayUnion(nodeGroupElement)
      })
      .then(function() {
        Notify.create("Node group created!");
      })
      .catch(function(error) {
        showErrorMessage("Error creating node group", error.message);
      });
  }
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
        node.influencers.forEach(function(influencerId) {
          allLinks.push({
            source: influencerId,
            target: node.id,
            hasReciprocal:
              "influencees" in node
                ? node.influencees.includes(influencerId)
                : false,
            isBlocking:
              "blockingInfluencers" in node
                ? node.blockingInfluencers.includes(influencerId)
                : false,
            isUnused:
              "unusedInfluencers" in node
                ? node.unusedInfluencers.includes(influencerId)
                : false
          });
        });
      }
    });
    //console.log("allLinks updated");
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
