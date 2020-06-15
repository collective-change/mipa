import Vue from "vue";
import Vuex from "vuex";
import { vuexfireMutations } from "vuexfire";
import VuexPersistence from "vuex-persist";
import localForage from "localforage";

import auth from "./store-auth";
import settings from "./store-settings";
import tasks from "./store-tasks";
import teams from "./store-teams";
import orgs from "./store-orgs";
import model from "./store-model";
import issues from "./store-issues";
import actions from "./store-actions";
import adHocDocs from "./store-adHocDocs";
import calculator from "./store-calculator";
import calcResults from "./store-calcResults";
import ui from "./store-ui";
import uiIssue from "./store-uiIssue";
import uiAction from "./store-uiAction";

Vue.use(Vuex);

const vuexIndexedDb = new VuexPersistence({
  storage: localForage,
  asyncStorage: true,
  modules: ["calcResults"],
  strictMode: true
});

/*
 * If not building with SSR mode, you can
 * directly export the Store instantiation
 */

export default function(/* { ssrContext } */) {
  const Store = new Vuex.Store({
    mutations: {
      // other mutations
      ...vuexfireMutations,
      RESTORE_MUTATION: vuexIndexedDb.RESTORE_MUTATION
    },
    modules: {
      auth,
      settings,
      tasks,
      orgs,
      teams,
      model,
      issues,
      actions,
      adHocDocs,
      calculator,
      calcResults,
      ui,
      uiIssue,
      uiAction
    },

    plugins: [vuexIndexedDb.plugin],

    // enable strict mode (adds overhead!)
    // for dev mode only
    strict: process.env.DEV
  });

  return Store;
}
