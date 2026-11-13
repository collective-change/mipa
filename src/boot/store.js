// Quasar CLI (Vite) only wires up Pinia stores automatically, so the Vuex 4
// store is installed here. Actions can reach the router via `this.$router`.
import createStore from "@/store";

export default ({ app, router }) => {
  const store = createStore();
  store.$router = router;
  app.use(store);
};
