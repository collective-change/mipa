import Vue from "vue";
import { uid, Notify } from "quasar";
import { firebaseDb, firebaseAuth } from "boot/firebase";
import { firestoreAction } from "vuexfire";
import { showErrorMessage } from "src/utils/util-show-error-message";

const state = {
  issues: [],
  search: "",
  sort: "name"
};

const mutations = {
  //synchronous
  clearIssues(state) {
    state.issues = {};
  },
  setSearch(state, value) {
    state.search = value;
  },
  setSort(state, value) {
    state.sort = value;
  },
  setIssuesDownloaded(state, value) {
    state.issuesDownloaded = value;
  }
};

const actions = {
  //may be asynchronous or synchronous
  updateIssue({ dispatch }, payload) {
    //let userId = firebaseAuth.currentUser.uid;
    firebaseDb
      .collection("issues")
      .doc(payload.id)
      .set(payload.updates, { merge: true })
      .then(function() {
        let keys = Object.keys(payload.updates);
        //console.log("keys: ", keys);
        if (!(keys.includes("completed") && keys.length == 1))
          Notify.create("Issue updated!");
      })
      .catch(function(error) {
        showErrorMessage("Error updating issue", error.message);
      });
  },
  deleteIssue({ dispatch }, issueId) {
    let userId = firebaseAuth.currentUser.uid;
    firebaseDb
      .collection("issues")
      .doc(issueId)
      .delete()
      .then(function() {
        Notify.create("Issue deleted!");
      })
      .catch(function(error) {
        showErrorMessage("Error removing issue", error.message);
      });
  },
  addIssue({ dispatch }, issue) {
    //let userId = firebaseAuth.currentUser.uid;

    issue.initiator = firebaseAuth.currentUser.uid;
    firebaseDb
      .collection("issues")
      .add(issue)
      .then(function() {
        Notify.create("Issue added!");
      })
      .catch(function(error) {
        showErrorMessage("Error adding issue", error.message);
      });
  },
  bindIssues: firestoreAction(({ bindFirestoreRef }, orgId) => {
    let userId = firebaseAuth.currentUser.uid;
    // return the promise returned by `bindFirestoreRef`
    return bindFirestoreRef(
      "issues",
      firebaseDb.collection("issues").where("orgId", "==", orgId),
      //.where("users", "array-contains", userId)
      //.orderBy("name", "asc"),
      //.orderBy("goal", "asc"),
      {
        maxRefDepth: 1,
        reset: false
      }
    );
  }),
  unbindIssues: firestoreAction(({ unbindFirestoreRef }) => {
    unbindFirestoreRef("issues", false); //don't reset data when unbinding
  }),
  setSearch({ commit }, value) {
    commit("setSearch", value);
  },
  setSort({ commit }, value) {
    commit("setSort", value);
  }
};

const getters = {
  issues: state => {
    return state.issues;
  },
  issuesSorted: state => {
    let issuesSorted = {},
      keysOrdered = Object.keys(state.issues);

    keysOrdered.sort((a, b) => {
      let issueAProp = state.issues[a][state.sort].toLowerCase(),
        issueBProp = state.issues[b][state.sort].toLowerCase();
      if (issueAProp > issueBProp) return 1;
      else if (issueAProp < issueBProp) return -1;
      else return 0;
    });

    keysOrdered.forEach(key => {
      issuesSorted[key] = state.issues[key];
    });

    return issuesSorted;
  },
  issuesFiltered: (state, getters) => {
    let issuesSorted = getters.issuesSorted,
      issuesFiltered = {};
    if (state.search) {
      //populate empty object
      Object.keys(issuesSorted).forEach(function(key) {
        let issue = issuesSorted[key],
          issueNameLowerCase = issue.name.toLowerCase(),
          searchLowerCase = state.search.toLowerCase();
        if (issueNameLowerCase.includes(searchLowerCase)) {
          issuesFiltered[key] = issue;
        }
      });
      return issuesFiltered;
    }
    return issuesSorted;
  },
  issuesTodo: (state, getters) => {
    let issuesFiltered = getters.issuesFiltered;
    let issues = {};
    Object.keys(issuesFiltered).forEach(function(key) {
      let issue = issuesFiltered[key];
      if (!issue.completed) {
        issues[key] = issue;
      }
    });
    return issues;
  },
  issuesCompleted: (state, getters) => {
    let issuesFiltered = getters.issuesFiltered;
    let issues = {};
    Object.keys(issuesFiltered).forEach(function(key) {
      let issue = issuesFiltered[key];
      if (issue.completed) {
        issues[key] = issue;
      }
    });
    return issues;
  }
};

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters
};
