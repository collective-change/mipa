import Vue from "vue";
import Vuex from "vuex";
import { vuexfireMutations } from "vuexfire";

import auth from "./store-auth";
import settings from "./store-settings";
import tasks from "./store-tasks";
import teams from "./store-teams";
import orgs from "./store-orgs";
import model from "./store-model";
import calculator from "./store-calculator";

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
      auth,
      settings,
      tasks,
      orgs,
      teams,
      model,
      calculator
    },

    // enable strict mode (adds overhead!)
    // for dev mode only
    strict: process.env.DEV
  });

  return Store;
}
