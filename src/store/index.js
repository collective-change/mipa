import Vue from "vue";
import Vuex from "vuex";

import auth from "./store-auth";
import settings from "./store-settings";
import tasks from "./store-tasks";
import orgs from "./store-orgs";
import model from "./store-model";

Vue.use(Vuex);

/*
 * If not building with SSR mode, you can
 * directly export the Store instantiation
 */

export default function(/* { ssrContext } */) {
  const Store = new Vuex.Store({
    modules: {
      auth,
      settings,
      tasks,
      orgs,
      model
    },

    // enable strict mode (adds overhead!)
    // for dev mode only
    strict: process.env.DEV
  });

  return Store;
}
