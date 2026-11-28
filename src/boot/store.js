// Installs the app's Pinia instance. Stores reach the router via `this.$router`.
import { createPiniaInstance } from "@/store";

export default ({ app, router }) => {
  const pinia = createPiniaInstance(router);
  app.use(pinia);
};
