import { createStore } from "vuex";
import { firestoreMutations } from "./firestore-bind";

import actions from "./store-actions";
import adHocDocs from "./store-adHocDocs";
import auth from "./store-auth";
import calculator from "./store-calculator";
import calcResults from "./store-calcResults";
import chats from "./store-chats";
import members from "./store-members";
import model from "./store-model";
import orgs from "./store-orgs";
import settings from "./store-settings";
import ui from "./store-ui";
import uiAction from "./store-uiAction";
import users from "./store-users";


/*
 * If not building with SSR mode, you can
 * directly export the Store instantiation
 */

export default function(/* { ssrContext } */) {
  const Store = createStore({
    mutations: {
      // other mutations
      ...firestoreMutations
    },
    modules: {
      actions,
      adHocDocs,
      auth,
      calculator,
      calcResults,
      chats,
      members,
      model,
      orgs,
      settings,
      ui,
      uiAction,
      users
    },

    // enable strict mode (adds overhead!)
    // for dev mode only
    strict: import.meta.env.DEV === true
  });

  return Store;
}
