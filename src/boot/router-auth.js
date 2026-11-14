import { LocalStorage } from "quasar";
import { isPublicPath } from "@/router/public-paths";

export default ({ router }) => {
  router.beforeEach(to => {
    const loggedIn = LocalStorage.getItem("loggedIn");
    if (!loggedIn && !isPublicPath(to.path)) {
      return "/auth";
    }
    if (loggedIn && (to.path === "/" || to.path === "/auth")) {
      return "/orgs";
    }
  });
};
