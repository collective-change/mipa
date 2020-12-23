import { register } from "register-service-worker";

// The ready(), registered(), cached(), updatefound() and updated()
// events passes a ServiceWorkerRegistration instance in their arguments.
// ServiceWorkerRegistration: https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration

register(process.env.SERVICE_WORKER_FILE, {
  // The registrationOptions object will be passed as the second argument
  // to ServiceWorkerContainer.register()
  // https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register#Parameter

  // registrationOptions: { scope: './' },

  ready() {
    if (process.env.DEV || true) {
      console.log("App is being served from cache by a service worker.");
    }
  },

  registered(/* registration */) {
    if (process.env.DEV || true) {
      console.log("Service worker has been registered.");
    }
  },

  cached(/* registration */) {
    if (process.env.DEV || true) {
      console.log("Content has been cached for offline use.");
    }
  },

  updatefound(/* registration */) {
    if (process.env.DEV || true) {
      console.log("New content is downloading.");
    }
    /*if (!!window.chrome) {
      // for chromium based browsers
      const r = confirm("A new version of mipa is available. Reload now?");
      if (r === true) {
        //location.reload(true);
        window.location = window.location.href;
      } else {
        console.log("You pressed Cancel!");
      }
    }*/
  },

  updated(/* registration */) {
    if (process.env.DEV || true) {
      console.log("New content is available; please refresh.");
    }
    /*if (!window.chrome) {
      // for non chromium browsers
      const r = confirm("A new version of mipa is available. Reload now?");
      if (r === true) {
        location.reload(true);
      } else {
        console.log("You pressed Cancel!");
      }
    }*/
  },

  offline() {
    if (process.env.DEV || true) {
      console.log(
        "No internet connection found. App is running in offline mode."
      );
    }
  },

  error(err) {
    if (process.env.DEV || true) {
      console.error("Error during service worker registration:", err);
    }
  }
});
