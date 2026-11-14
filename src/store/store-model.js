import { uid, Notify } from "quasar";
import { firebaseDb, firebaseAuth } from "@/boot/firebase";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from "firebase/firestore";
import { firestoreAction } from "./firestore-bind";
import { showErrorMessage } from "@/utils/util-show-error-message";
import { classifyInfluencers } from "@/utils/util-node-operations";
import { i18n } from "@/boot/i18n";
import { camelize } from "@/utils/util-camelize";

// Starter factors are named in the user's current language.
const t = key => i18n.global.t(key);

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
    try {
      await setDoc(doc(firebaseDb, "models", payload.modelId), model);
    } catch (error) {
      showErrorMessage("Error creating model", error.message);
      return;
    }
    // A sample organization brings its own factors.
    if (payload.withoutStarterNodes) return;
    dispatch("createInitialNodes", {
      modelId: payload.modelId,
      currency: payload.currency
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
        name: t("starterHourlyCost"),
        symbol: "averageEffortCostPerHour",
        symbolFormula: "10",
        sysFormula: "10",
        isNew: true
      },
      {
        name: t("starterEffort"),
        symbol: "oneTimeEffort",
        unit: "workhours"
      },
      {
        name: t("starterSpending"),
        symbol: "oneTimeSpending"
      },
      {
        name: t("starterOrgCost"),
        symbol: "costToOrganizationDuringInterval"
      },
      {
        name: t("starterWorldCost"),
        symbol: "costToWorldDuringInterval"
      },
      {
        name: t("starterOrgBenefit"),
        symbol: "benefitToOrganizationDuringInterval"
      },
      {
        name: t("starterWorldBenefit"),
        symbol: "benefitToWorldDuringInterval"
      }
    ];

    let batch = writeBatch(firebaseDb);
    nodes.forEach(node => {
      let nodeRef = doc(collection(firebaseDb, "models", payload.modelId, "nodes"));
      batch.set(nodeRef, Object.assign(Object.assign({}, basicNode), node));
    });
    await batch.commit();

    const snapshot = await getDocs(collection(firebaseDb, "models", payload.modelId, "nodes"));

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
      updates: { roleNodes },
      silent: true // part of creating the organization; not a user edit
    });
  },

  async updateModel({ dispatch }, payload) {
    let modelId = payload.modelId;

    //let formulaChanged = false;
    payload.updates.updateTime = serverTimestamp();
    payload.updates.updatedBy = firebaseAuth.currentUser.uid;

    let modelRef = doc(firebaseDb, "models", modelId);
    try {
      await setDoc(modelRef, payload.updates, { merge: true });
      if (!payload.silent) Notify.create(i18n.global.t("toastModelUpdated"));
    } catch (error) {
      console.error("Error updating model", error.message);
      showErrorMessage("Error updating model", error.message);
    }
  },

  deleteModel({}, modelId) {
    //let modelId = payload.modelId;
    //let node = payload.node;
    let modelRef = doc(firebaseDb, "models", modelId);
    deleteDoc(modelRef)
      .then(function() {
        Notify.create(i18n.global.t("toastModelDeleted"));
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
      doc(firebaseDb, "models", modelId),
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
      collection(firebaseDb, "models", modelId, "nodes"),
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

  // Adds a factor holding the hourly cost of a role or person, which actions
  // can then use instead of the organization's average. Returns its id.
  async addHourlyCostFactor({ state }, payload) {
    const taken = new Set(state.nodes.map(n => n.symbol));
    let base = camelize(payload.name || "");
    base = /^[A-Za-z_][A-Za-z0-9_]*$/.test(base) ? base + "PerHour" : "hourlyCost";
    let symbol = base;
    for (let i = 2; taken.has(symbol); i++) symbol = base + i;
    const cost = String(Number(payload.cost) || 0);
    const docRef = await addDoc(collection(firebaseDb, "models", payload.modelId, "nodes"), {
      class: "unlinked",
      isNew: false,
      isSelfBlocking: false,
      isHourlyCost: true,
      name: payload.name,
      symbol,
      symbolFormula: cost,
      sysFormula: cost,
      unit: payload.unit || "",
      influencers: [],
      influencees: [],
      blockingInfluencers: [],
      unusedInfluencers: [],
      notes: "",
      createTime: serverTimestamp(),
      createdBy: firebaseAuth.currentUser.uid
    });
    Notify.create(i18n.global.t("toastFactorAdded"));
    return docRef.id;
  },

  addNode({ dispatch }, payload) {
    //console.log(payload);
    let node = payload.node;
    node.createTime = serverTimestamp();
    node.createdBy = firebaseAuth.currentUser.uid;
    addDoc(collection(firebaseDb, "models", payload.modelId, "nodes"), node)
      .then(function(docRef) {
        //add in default sysFormula
        //docRef.update({ sysFormula: `delay( ${docRef.id} , dt, 0)` });
        Notify.create(i18n.global.t("toastFactorAdded"));
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
    payload.updates.updateTime = serverTimestamp();
    payload.updates.updatedBy = firebaseAuth.currentUser.uid;

    let nodesRef = collection(firebaseDb, "models", modelId, "nodes");
    setDoc(doc(nodesRef, nodeId), payload.updates, { merge: true })
      .then(function() {
        //let keys = Object.keys(payload.updates);
        Notify.create(
          payload.successNotice ? payload.successNotice : t("toastFactorSaved")
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
    let nodeRef = doc(firebaseDb, "models", modelId, "nodes", node.id);
    deleteDoc(nodeRef)
      .then(function() {
        Notify.create(i18n.global.t("toastFactorDeleted"));
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
    let influencerNodeId, influenceeNodeId;
    switch (link.targetType) {
      case "influencer":
        influencerNodeId = link.targetNodeId;
        influenceeNodeId = link.sourceNodeId;
        break;
      case "influencee":
        influencerNodeId = link.sourceNodeId;
        influenceeNodeId = link.targetNodeId;
        break;
      default:
        throw new Error("Link target type not recognized.");
    }

    var nodesRef = collection(firebaseDb, "models", payload.modelId, "nodes");
    var batch = writeBatch(firebaseDb);
    if (influencerNodeId)
      batch.update(doc(nodesRef, influencerNodeId), {
        influencees: arrayUnion(influenceeNodeId)
      });
    if (influenceeNodeId)
      batch.update(doc(nodesRef, influenceeNodeId), {
        influencers: arrayUnion(influencerNodeId)
      });

    batch
      .commit()
      .then(function() {
        Notify.create(i18n.global.t("toastLinkAdded"));
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
    var modelRef = doc(firebaseDb, "models", state.currentModel.id);
    try {
      const res = await updateDoc(modelRef, {
        relaxedLinks: arrayUnion(relaxedLink)
      });
      success = true;
      Notify.create(i18n.global.t("toastLinkLoosened"));
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
    var modelRef = doc(firebaseDb, "models", state.currentModel.id);
    try {
      const res = await updateDoc(modelRef, {
        relaxedLinks: tempRelaxedLinks
      });
      Notify.create(i18n.global.t("toastLinkLoosenedMore"));
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
    var modelRef = doc(firebaseDb, "models", state.currentModel.id);
    try {
      const res = await updateDoc(modelRef, {
        relaxedLinks: tempRelaxedLinks
      });
      Notify.create(i18n.global.t("toastLinkTightened"));
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

    var nodesRef = collection(firebaseDb, "models", payload.modelId, "nodes");
    var batch = writeBatch(firebaseDb);
    batch.update(doc(nodesRef, influencerNodeId), {
      influencees: arrayRemove(influenceeNodeId)
    });
    batch.update(doc(nodesRef, influenceeNodeId), {
      influencers: arrayRemove(influencerNodeId)
    });
    batch
      .commit()
      .then(function() {
        Notify.create(i18n.global.t("toastLinkDeleted"));
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
    var nodeDocRef = doc(firebaseDb, "models", payload.modelId, "nodes", payload.nodeId);

    runTransaction(firebaseDb, function(transaction) {
        // This code may get re-run multiple times and generate POST 400 errors if there are conflicts.
        return transaction.get(nodeDocRef).then(function(nodeDoc) {
          if (!nodeDoc.exists()) {
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
      successNotice: t("toastFactorSaved"),
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
    var modelRef = doc(firebaseDb, "models", state.currentModel.id);
    try {
      const res = await updateDoc(modelRef, {
        nodeGroups: arrayUnion(nodeGroup)
      });
      success = true;
      Notify.create(i18n.global.t("toastGroupCreated"));
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
      var modelRef = doc(firebaseDb, "models", state.currentModel.id);
      await runTransaction(firebaseDb, async t => {
        const modelDoc = await t.get(modelRef);
        let nodeGroups = modelDoc.data().nodeGroups;
        let nodeGroup = nodeGroups.find(ng => ng.id == nodeGroupId);
        nodeGroup.nodeIds.push(nodeId);
        if (nodeIsGroupNode) {
          let childNodeGroup = nodeGroups.find(ng => ng.id == nodeId);
          childNodeGroup.parentId = nodeGroupId;
        }
        t.update(modelRef, { nodeGroups: nodeGroups });
      });
      Notify.create(i18n.global.t("toastAddedToGroup"));
    } catch (e) {
      Notify.create(i18n.global.t("toastAddToGroupFailed"));
      console.log("Add node to group transaction failure:", e);
    }
  },

  async removeNodeFromGroup({}, payload) {
    let nodeId = payload.nodeId;
    let nodeIsGroupNode = payload.nodeIsGroupNode;
    let nodeGroupId = payload.nodeGroupId;
    try {
      var modelRef = doc(firebaseDb, "models", state.currentModel.id);
      await runTransaction(firebaseDb, async t => {
        const modelDoc = await t.get(modelRef);
        let nodeGroups = modelDoc.data().nodeGroups;
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
      Notify.create(i18n.global.t("toastRemovedFromGroup"));
    } catch (e) {
      Notify.create(i18n.global.t("toastRemoveFromGroupFailed"));
      console.log("removeNodeFromGroup transaction failure:", e);
    }
  },

  async disbandNodeGroup({}, nodeGroupId) {
    try {
      var modelRef = doc(firebaseDb, "models", state.currentModel.id);
      await runTransaction(firebaseDb, async t => {
        const modelDoc = await t.get(modelRef);
        let nodeGroups = modelDoc.data().nodeGroups;
        // Child groups stay in the model. Re-attach them to the disbanded group's
        // own parent (or the top level if it has none) so they keep their place
        // in the hierarchy.
        const disbanded = nodeGroups.find(group => group.id == nodeGroupId);
        const grandparentId = disbanded?.parentId ?? null;
        nodeGroups = nodeGroups
          .filter(group => group.id != nodeGroupId)
          .map(group => {
            if (group.parentId == nodeGroupId) {
              if (grandparentId) group.parentId = grandparentId;
              else delete group.parentId;
            }
            return group;
          });
        t.update(modelRef, { nodeGroups: nodeGroups });
      });
      Notify.create(i18n.global.t("toastUngrouped"));
    } catch (e) {
      Notify.create(i18n.global.t("toastUngroupFailed"));
      console.log("disbandNodeGroup transaction failure:", e);
    }
  },

  async updateNodes({ dispatch }, payload) {
    var nodesRef = collection(firebaseDb, "models", payload.modelId, "nodes");

    const batchArray = [];
    batchArray.push(writeBatch(firebaseDb));
    let operationCounter = 0;
    let batchIndex = 0;

    payload.changedNodes.forEach(changedNode => {
      batchArray[batchIndex].update(doc(nodesRef, changedNode.id), {
        ...changedNode.changes,
        updateTime: serverTimestamp(),
        updatedBy: firebaseAuth.currentUser.uid
      });
      operationCounter++;

      if (operationCounter === 499) {
        batchArray.push(writeBatch(firebaseDb));
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
        Notify.create(i18n.global.t("toastFactorsUpdated"));
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
