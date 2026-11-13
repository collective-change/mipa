import { LocalStorage } from "quasar";
import { PUBLIC_PATHS } from "@/router/public-paths";

export default ({ router }) => {
  router.beforeEach(to => {
    const loggedIn = LocalStorage.getItem("loggedIn");
    if (!loggedIn && !PUBLIC_PATHS.includes(to.path)) {
      return "/auth";
    }
  });
};
