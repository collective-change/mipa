import { createPinia, setActivePinia } from "pinia";
import { markRaw } from "vue";
import { createStore } from "vuex";
import { firestoreMutations } from "./firestore-bind";

import model from "./store-model";

export function createPiniaInstance(router) {
  const pinia = createPinia();
  const routerPlugin = ({ store }) => {
    if (router && !store.$router) {
      store.$router = markRaw(router);
    }
  };
  pinia.use(routerPlugin);
  if (!pinia._a && Array.isArray(pinia._p) && !pinia._p.includes(routerPlugin)) {
    pinia._p.push(routerPlugin);
  }
  setActivePinia(pinia);
  return pinia;
}

export default function (/* { ssrContext } */) {
  const Store = createStore({
    mutations: {
      ...firestoreMutations
    },
    modules: {
      model
    },
    strict: import.meta.env.DEV === true
  });

  return Store;
}
