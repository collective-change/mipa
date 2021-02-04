import Vue from "vue";
import Vuex from "vuex";
import { vuexfireMutations } from "vuexfire";

import actions from "./store-actions";
import adHocDocs from "./store-adHocDocs";
import auth from "./store-auth";
import calculator from "./store-calculator";
import calcResults from "./store-calcResults";
import chats from "./store-chats";
import model from "./store-model";
import orgs from "./store-orgs";
import settings from "./store-settings";
import ui from "./store-ui";
import uiAction from "./store-uiAction";
import users from "./store-users";

Vue.use(Vuex);

/*
 * If not building with SSR mode, you can
 * directly export the Store instantiation
 */

export default function(/* { ssrContext } */) {
  const Store = new Vuex.Store({
    mutations: {
      // other mutations
      ...vuexfireMutations
    },
    modules: {
      actions,
      adHocDocs,
      auth,
      calculator,
      calcResults,
      chats,
      model,
      orgs,
      settings,
      ui,
      uiAction,
      users
    },

    // enable strict mode (adds overhead!)
    // for dev mode only
    strict: process.env.DEV
  });

  return Store;
}
