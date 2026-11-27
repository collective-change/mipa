import createStore, { createPiniaInstance } from "@/store";

export default ({ app, router }) => {
  const pinia = createPiniaInstance(router);
  app.use(pinia);

  const store = createStore();
  store.$router = router;
  app.use(store);
};
