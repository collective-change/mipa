import { LocalStorage } from "quasar";

export default ({ router }) => {
  router.beforeEach(to => {
    const loggedIn = LocalStorage.getItem("loggedIn");
    if (!loggedIn && to.path !== "/auth") {
      return "/auth";
    }
  });
};
