import { uid, Notify } from "quasar";
import { firebaseDb, firebaseAuth } from "@/boot/firebase";
import {
  collection,
  doc,
  setDoc,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch
} from "firebase/firestore";
import { firestoreAction } from "./firestore-bind";
import { showErrorMessage } from "@/utils/util-show-error-message";
import { slugify } from "@/utils/util-slugify";
import { i18n } from "@/boot/i18n";
import { buildSampleOrg, sampleCurrencyFor } from "@/utils/sample-org";
import { compileDraftNodes, roleNodesOf } from "@/utils/util-model-draft";

const state = {
  currentOrg: null,
  orgs: null
};

const mutations = {
  clearOrgs(state) {
    state.orgs = null;
  }
};
const actions = {
  updateOrg({ dispatch }, payload) {
    console.log(payload);
    if (payload.updates.name) {
      payload.updates.nameSlug = slugify(payload.updates.name);
    }
    setDoc(doc(firebaseDb, "orgs", payload.id), payload.updates, {
      merge: true
    })
      .then(function() {
        let keys = Object.keys(payload.updates);
        //console.log("keys: ", keys);
        Notify.create(i18n.global.t("toastOrgUpdated"));
      })
      .catch(function(error) {
        showErrorMessage("Error updating organization", error.message);
      });
  },
  async deleteOrg({ dispatch }, orgId) {
    //let userId = firebaseAuth.currentUser.uid;
    await deleteDoc(doc(firebaseDb, "orgs", orgId))
      .then(function() {
        Notify.create(i18n.global.t("toastOrgDeleted"));
      })
      .catch(function(error) {
        showErrorMessage("Error deleting organization", error.message);
      });

    dispatch("model/deleteModel", orgId, { root: true });
    //TODO: delete all non-public models solely owned by org
  },
  addOrg({ dispatch }, org) {
    //add organization and its main model
    org.users = [firebaseAuth.currentUser.uid];
    org.superAdmins = [firebaseAuth.currentUser.uid];
    //let timestampNow = firebase.firestore.FieldValue.serverTimestamp();
    org.createTime = serverTimestamp();
    org.createdBy = firebaseAuth.currentUser.uid;
    org.nameSlug = slugify(org.name);
    addDoc(collection(firebaseDb, "orgs"), org)
      .then(function(docRef) {
        const user = firebaseAuth.currentUser;
        setDoc(doc(firebaseDb, "orgs", docRef.id, "members", user.uid), {
          email: user.email,
          displayName: user.displayName || user.email.split("@")[0]
        });
        dispatch(
          "model/addOrgMainModel",
          { orgId: docRef.id, modelId: docRef.id, currency: org.currency },
          { root: true }
        );
        Notify.create(i18n.global.t("toastOrgAdded"));
      })
      .catch(function(error) {
        showErrorMessage("Error adding organization", error.message);
      });
  },
  // Creates the person's own copy of the sample organization, with its model
  // and actions. Returns the new org's id and name slug.
  async createSampleOrg({ dispatch }) {
    const user = firebaseAuth.currentUser;
    const t = key => i18n.global.t(key);
    const sample = buildSampleOrg(t, sampleCurrencyFor(i18n.global.locale));
    const nodesRef = modelId => collection(firebaseDb, "models", modelId, "nodes");

    const org = {
      ...sample.org,
      users: [user.uid],
      superAdmins: [user.uid],
      createTime: serverTimestamp(),
      createdBy: user.uid,
      nameSlug: slugify(sample.org.name)
    };
    const orgRef = await addDoc(collection(firebaseDb, "orgs"), org);
    const orgId = orgRef.id;
    await setDoc(doc(firebaseDb, "orgs", orgId, "members", user.uid), {
      email: user.email,
      displayName: user.displayName || user.email.split("@")[0]
    });
    await dispatch(
      "model/addOrgMainModel",
      { orgId, modelId: orgId, currency: sample.org.currency, withoutStarterNodes: true },
      { root: true }
    );

    const nodes = compileDraftNodes(sample, () => doc(nodesRef(orgId)).id);
    const idOf = Object.fromEntries(nodes.map(n => [n.symbol, n.id]));
    const batch = writeBatch(firebaseDb);
    nodes.forEach(({ id, ...node }) =>
      batch.set(doc(nodesRef(orgId), id), {
        ...node,
        createTime: serverTimestamp(),
        createdBy: user.uid
      })
    );
    batch.set(
      doc(firebaseDb, "models", orgId),
      { roleNodes: roleNodesOf(nodes), updateTime: serverTimestamp(), updatedBy: user.uid },
      { merge: true }
    );
    sample.actions.forEach(action => {
      batch.set(doc(collection(firebaseDb, "actions")), {
        orgId,
        title: action.title,
        notes: action.notes,
        isProject: false,
        actionMchState: { value: "initiating" },
        useSimpleEstimateMethod: false,
        impacts: action.impacts.map(({ symbol, ...impact }) => ({
          ...impact,
          id: uid(),
          nodeId: idOf[symbol]
        })),
        estEffortHrs: action.estEffortHrs,
        effortCompletionPercentage: 0,
        effortCostPerHrType: "use_average",
        customEffortCostPerHr: null,
        estSpending: action.estSpending,
        spentAmount: 0,
        outstandingSpending: action.estSpending,
        totalDirectCost: 0,
        marginalTotalBenefitNpv: 0,
        marginalNetTotalBenefitNpv: 0,
        marginalTotalCostNpv: 0,
        actionLeverage: null,
        initiator: user.uid,
        responsiblePerson: user.uid,
        accountablePerson: user.uid,
        createTime: serverTimestamp(),
        createdBy: user.uid,
        updateTime: serverTimestamp(),
        updatedBy: user.uid
      });
    });
    await batch.commit();
    Notify.create(t("toastSampleCreated"));
    return { orgId, nameSlug: org.nameSlug };
  },

  bindOrgs: firestoreAction(({ bindFirestoreRef }) => {
    let userId = firebaseAuth.currentUser.uid;
    // return the promise returned by `bindFirestoreRef`
    return bindFirestoreRef(
      "orgs",
      query(
        collection(firebaseDb, "orgs"),
        where("users", "array-contains", userId),
        orderBy("name", "asc"),
        orderBy("goal", "asc")
      ),
      {
        maxRefDepth: 1,
        wait: true //this also forces reset: false
      }
    );
  }),
  unbindOrgs: firestoreAction(({ unbindFirestoreRef }) => {
    unbindFirestoreRef("orgs", false); //don't reset data when unbinding
  }),

  bindCurrentOrg: firestoreAction(({ bindFirestoreRef }, orgId) => {
    // return the promise returned by `bindFirestoreRef`
    return bindFirestoreRef(
      "currentOrg",
      doc(firebaseDb, "orgs", orgId),
      {
        maxRefDepth: 1,
        wait: true //this also forces reset: false
      }
    );
  }),

  unbindCurrentOrg: firestoreAction(({ unbindFirestoreRef }) => {
    unbindFirestoreRef("currentOrg", true);
  })
};

export default {
  namespaced: true,
  state,
  mutations,
  actions
};
