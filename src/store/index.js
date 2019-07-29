import Vue from "vue";
import Vuex from "vuex";

import tasks from "./store-tasks";
import settings from "./store-settings";
import auth from "./store-auth";

Vue.use(Vuex);

/*
 * If not building with SSR mode, you can
 * directly export the Store instantiation
 */

export default function(/* { ssrContext } */) {
  const Store = new Vuex.Store({
    modules: {
      tasks,
      settings,
      auth
    },

    // enable strict mode (adds overhead!)
    // for dev mode only
    strict: process.env.DEV
  });

  return Store;
}
