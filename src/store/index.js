import { createPinia, setActivePinia } from "pinia";
import { markRaw } from "vue";

// Creates the app's Pinia instance. Every store can reach the router via
// `this.$router`.
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

export default createPiniaInstance;
