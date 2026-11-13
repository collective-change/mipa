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
  serverTimestamp
} from "firebase/firestore";
import { firestoreAction } from "./firestore-bind";
import { showErrorMessage } from "@/utils/util-show-error-message";
import { slugify } from "@/utils/util-slugify";

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
        Notify.create("Organization updated!");
      })
      .catch(function(error) {
        showErrorMessage("Error updating organization", error.message);
      });
  },
  async deleteOrg({ dispatch }, orgId) {
    //let userId = firebaseAuth.currentUser.uid;
    await deleteDoc(doc(firebaseDb, "orgs", orgId))
      .then(function() {
        Notify.create("Org deleted!");
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
        Notify.create("Organization added!");
      })
      .catch(function(error) {
        showErrorMessage("Error adding organization", error.message);
      });
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
