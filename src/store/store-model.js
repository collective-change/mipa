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
  async addOrgMainModel({ dispatch }, payload) {
    let model = {};
    model.isPublic = false;
    model.owners = { users: [firebaseAuth.currentUser.uid] };
    model.editors = { users: [firebaseAuth.currentUser.uid] };
    model.viewers = { org: [payload.orgId] };
    model.isOrgMainModel = true;
    model.name = "Main";
    model.unwrittenChanges = [];
    model.simulationParams = {
      finalTimeNumber: 120,
      finalTimeUnit: "months",
      numTimeSteps: 120,
      orgWeightingFactor: 1,
      timeStepGrowthRate: 0,
      timeStepNumber: 1,
      timeStepUnit: "months",
      worldToOrgWeightingRatio: 0.5,
      worldWeightingFactor: 1
    };
    firebaseDb
      .collection("models")
      .doc(payload.modelId) //use orgId as the model's id
      .set(model)
      .then(function(docRef) {
        //Notify.create("Model added! ");
        dispatch("createInitialNodes", {
          modelId: payload.modelId,
          currency: payload.currency
        });
      })
      .catch(function(error) {
        showErrorMessage("Error creating model", error.message);
      });
  },

  async createInitialNodes({ dispatch }, payload) {
    const basicNode = {
      class: "unlinked",
      isNew: false,
      isSelfBlocking: false,
      name: "unnamed",
      symbol: "unnamed",
      symbolFormula: "0",
      sysFormula: "0",
      unit: payload.currency,
      unusedInfluencers: []
    };
    const nodes = [
      {
        name: "average effort cost per hour (TODO: change value in formula)",
        symbol: "averageEffortCostPerHour",
        symbolFormula: "10",
        sysFormula: "10",
        isNew: true
      },
      {
        name: "one-time effort",
        symbol: "oneTimeEffort",
        unit: "workhours"
      },
      {
        name: "one-time spending",
        symbol: "oneTimeSpending"
      },
      {
        name: "cost to organization during interval",
        symbol: "costToOrganizationDuringInterval"
      },
      {
        name: "cost to world during interval",
        symbol: "costToWorldDuringInterval"
      },
      {
        name: "benefit to organization during interval",
        symbol: "benefitToOrganizationDuringInterval"
      },
      {
        name: "benefit to world during interval",
        symbol: "benefitToWorldDuringInterval"
      }
    ];

    let batch = firebaseDb.batch();
    nodes.forEach(node => {
      let nodeRef = firebaseDb
        .collection("models")
        .doc(payload.modelId)
        .collection("nodes")
        .doc();
      batch.set(nodeRef, Object.assign(Object.assign({}, basicNode), node));
    });
    await batch.commit();

    const snapshot = await firebaseDb
      .collection("models")
      .doc(payload.modelId)
      .collection("nodes")
      .get();

    const roleNodesProperties = [
      {
        name: "averageEffortCostPerHour",
        symbol: "averageEffortCostPerHour"
      },
      {
        name: "effort",
        symbol: "oneTimeEffort"
      },
      {
        name: "orgBenefit",
        symbol: "benefitToOrganizationDuringInterval"
      },
      {
        name: "orgCost",
        symbol: "costToOrganizationDuringInterval"
      },
      {
        name: "spending",
        symbol: "oneTimeSpending"
      },
      {
        name: "worldBenefit",
        symbol: "benefitToWorldDuringInterval"
      },
      {
        name: "worldCost",
        symbol: "costToWorldDuringInterval"
      }
    ];

    let roleNodes = {};
    snapshot.forEach(doc => {
      const node = doc.data();

      const foundProperty = roleNodesProperties.find(
        element => element.symbol == node.symbol
      );
      if (foundProperty) roleNodes[foundProperty.name] = doc.id;
    });

    dispatch("updateModel", {
      modelId: payload.modelId,
      updates: { roleNodes }
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
        Notify.create(
          payload.successNotice ? payload.successNotice : "Node updated!"
        );
        //if existence of latestValue changed, then update this nodes'
        //classification in its influencees
        if (
          ("latestValueExistenceChanged" in payload &&
            payload.latestValueExistenceChanged) ||
          ("symbolChanged" in payload && payload.symbolChanged)
        ) {
          dispatch("updateNodeClassificationInInfluenceees", {
            modelId: payload.modelId,
            nodeId: nodeId
          });
        }
      })
      .catch(function(error) {
        console.error(
          payload.errorTitle ? payload.errorTitle : "Error updating node",
          error.message
        );
        showErrorMessage(
          payload.errorTitle ? payload.errorTitle : "Error updating node",
          error.message
        );
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

  async relaxLink({}, payload) {
    let success = false;
    let relaxedLink = {
      influenceeNodeId: payload.link.influenceeNodeId,
      influencerNodeId: payload.link.influencerNodeId,
      strengthFactor: 0.1
    };
    var modelRef = firebaseDb.collection("models").doc(state.currentModel.id);
    try {
      const res = await modelRef.update({
        relaxedLinks: firebase.firestore.FieldValue.arrayUnion(relaxedLink)
      });
      success = true;
      Notify.create("Link relaxed!");
    } catch (error) {
      showErrorMessage("Error relaxing link", error.message);
    }
    if (success) return relaxedLink;
  },

  async relaxLinkMore({}, payload) {
    //find existing relaxedLink from array then update its strengthFactor
    let tempRelaxedLinks = JSON.parse(
      JSON.stringify(state.currentModel.relaxedLinks)
    );
    let matchingRelaxedLink = tempRelaxedLinks.find(
      link =>
        link.influenceeNodeId == payload.link.influenceeNodeId &&
        link.influencerNodeId == payload.link.influencerNodeId
    );
    matchingRelaxedLink.strengthFactor *= 0.1;
    var modelRef = firebaseDb.collection("models").doc(state.currentModel.id);
    try {
      const res = await modelRef.update({
        relaxedLinks: tempRelaxedLinks
      });
      Notify.create("Link relaxed more!");
    } catch (error) {
      showErrorMessage("Error relaxing link", error.message);
    }
  },

  async restoreLinkForce({}, payload) {
    let tempRelaxedLinks = JSON.parse(
      JSON.stringify(state.currentModel.relaxedLinks)
    );
    tempRelaxedLinks = tempRelaxedLinks.filter(
      link =>
        !(
          link.influenceeNodeId == payload.link.influenceeNodeId &&
          link.influencerNodeId == payload.link.influencerNodeId
        )
    );
    var modelRef = firebaseDb.collection("models").doc(state.currentModel.id);
    try {
      const res = await modelRef.update({
        relaxedLinks: tempRelaxedLinks
      });
      Notify.create("Link force restored!");
    } catch (error) {
      showErrorMessage("Error restoring link force", error.message);
    }
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

  updateNodeClassificationInInfluenceees({ dispatch }, payload) {
    let node = state.nodes.find(node => node.id == payload.nodeId);
    let influenceeIds = node.influencees;
    dispatch("updateClassifiedInfluencersOf", {
      modelId: payload.modelId,
      influenceeIds: influenceeIds,
      successNotice: `Reclassified "${node.name}" in its influencees.`,
      errorTitle: `Error reclassifying "${node.name}" in its influencees.`
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
          thisNode: influenceeNode
        });

        //save results
        dispatch("updateNode", {
          modelId: modelId,
          updates: {
            id: influenceeId,
            unusedInfluencers: classifiedInfluencers.unused,
            blockingInfluencers: classifiedInfluencers.blocking
          },
          successNotice: payload.successNotice
            ? payload.successNotice
            : `Reclassified influencers of ${influenceeNode.name}`,
          errorTitle: payload.errorTitle
            ? payload.errorTitle
            : `Error updating reclassified influencers of ${influenceeNode.name}`
        });
      });
    //console.log("end updateClassifiedInfluencersOf");
  },

  async createNodeGroup({}, payload) {
    let success = false;
    let nodeGroup = {
      id: uid(),
      name: payload.groupName,
      nodeIds: [payload.nodeId]
    };
    var modelRef = firebaseDb.collection("models").doc(state.currentModel.id);
    try {
      const res = await modelRef.update({
        nodeGroups: firebase.firestore.FieldValue.arrayUnion(nodeGroup)
      });
      success = true;
      Notify.create("Node group created!");
    } catch (error) {
      showErrorMessage("Error creating node group", error.message);
    }
    if (success) return nodeGroup;
  },

  async addToNodeGroup({}, payload) {
    let nodeId = payload.nodeId;
    let nodeIsGroupNode = payload.nodeIsGroupNode;
    let nodeGroupId = payload.nodeGroupId;

    try {
      var modelRef = firebaseDb.collection("models").doc(state.currentModel.id);
      await firebaseDb.runTransaction(async t => {
        const doc = await t.get(modelRef);
        let nodeGroups = doc.data().nodeGroups;
        let nodeGroup = nodeGroups.find(ng => ng.id == nodeGroupId);
        nodeGroup.nodeIds.push(nodeId);
        if (nodeIsGroupNode) {
          let childNodeGroup = nodeGroups.find(ng => ng.id == nodeId);
          childNodeGroup.parentId = nodeGroupId;
        }
        t.update(modelRef, { nodeGroups: nodeGroups });
      });
      Notify.create("Node added to group");
    } catch (e) {
      Notify.create("Failed to add node to group");
      console.log("Add node to group transaction failure:", e);
    }
  },

  async removeNodeFromGroup({}, payload) {
    let nodeId = payload.nodeId;
    let nodeIsGroupNode = payload.nodeIsGroupNode;
    let nodeGroupId = payload.nodeGroupId;
    try {
      var modelRef = firebaseDb.collection("models").doc(state.currentModel.id);
      await firebaseDb.runTransaction(async t => {
        const doc = await t.get(modelRef);
        let nodeGroups = doc.data().nodeGroups;
        let nodeGroup = nodeGroups.find(ng => ng.id == nodeGroupId);
        let index = nodeGroup.nodeIds.indexOf(nodeId);
        if (index !== -1) nodeGroup.nodeIds.splice(index, 1);
        if (nodeIsGroupNode) {
          let childNodeGroup = nodeGroups.find(ng => ng.id == nodeId);
          if (childNodeGroup.parentId && childNodeGroup.parentId == nodeGroupId)
            delete childNodeGroup.parentId;
        }
        t.update(modelRef, { nodeGroups: nodeGroups });
      });
      Notify.create("Node removed from group");
    } catch (e) {
      Notify.create("Failed to frmove node from group");
      console.log("removeNodeFromGroup transaction failure:", e);
    }
  },

  async disbandNodeGroup({}, nodeGroupId) {
    try {
      var modelRef = firebaseDb.collection("models").doc(state.currentModel.id);
      await firebaseDb.runTransaction(async t => {
        const doc = await t.get(modelRef);
        let nodeGroups = doc.data().nodeGroups;
        nodeGroups = nodeGroups.filter(group => group.id != nodeGroupId);
        t.update(modelRef, { nodeGroups: nodeGroups });
      });
      Notify.create("Group disbanded");
    } catch (e) {
      Notify.create("Failed disband group");
      console.log("disbandNodeGroup transaction failure:", e);
    }
  },

  async updateNodes({ dispatch }, payload) {
    var nodesRef = firebaseDb
      .collection("models")
      .doc(payload.modelId)
      .collection("nodes");

    const batchArray = [];
    batchArray.push(firebaseDb.batch());
    let operationCounter = 0;
    let batchIndex = 0;

    payload.changedNodes.forEach(changedNode => {
      batchArray[batchIndex].update(nodesRef.doc(changedNode.id), {
        ...changedNode.changes,
        updateTime: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: firebaseAuth.currentUser.uid
      });
      operationCounter++;

      if (operationCounter === 499) {
        batchArray.push(firestore.batch());
        batchIndex++;
        operationCounter = 0;
      }
    });

    await Promise.all(
      batchArray.map(async batch => {
        await batch.commit();
      })
    )
      .then(function() {
        Notify.create("Nodes updated!");
      })
      .catch(function(error) {
        console.error("Error updating nodes", error.message);
        showErrorMessage("Error updating nodes", error.message);
      });

    // run updateNodeClassificationInInfluenceees on nodes that
    // have latestValueExistenceChanged or symbolChanged
    payload.changedNodes.forEach(changedNode => {
      if (
        ("latestValueExistenceChanged" in changedNode &&
          changedNode.latestValueExistenceChanged) ||
        ("symbolChanged" in changedNode && changedNode.symbolChanged)
      ) {
        dispatch("updateNodeClassificationInInfluenceees", {
          modelId: payload.modelId,
          nodeId: changedNode.id
        });
      }
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
          let matchingRelaxedLink = null;
          if (state.currentModel.relaxedLinks)
            matchingRelaxedLink = state.currentModel.relaxedLinks.find(
              link =>
                link.influenceeNodeId == node.id &&
                link.influencerNodeId == influencerId
            );

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
                : false,
            strengthFactor: matchingRelaxedLink
              ? matchingRelaxedLink.strengthFactor
              : 1
          });
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
