// Quasar App (Vite) configuration
// https://quasar.dev/quasar-cli-vite/quasar-config-file
import { defineConfig } from "@quasar/app-vite";
import { loadEnv } from "vite";

// Firebase credentials and app settings live in .env (see .env_sample).
// They are exposed to the app as import.meta.env.<name>.
const ENV_KEYS = [
  "apiKey",
  "authDomain",
  "databaseURL",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
  "promptToReloadNumber",
  "useEmulators"
];

export default defineConfig(ctx => {
  const fileEnv = loadEnv(ctx.dev ? "development" : "production", process.cwd(), "");
  const env = Object.fromEntries(ENV_KEYS.map(k => [k, fileEnv[k] ?? ""]));

  return {
    boot: ["firebase", "store", "router-auth", "i18n"],

    css: ["app.scss"],

    extras: ["roboto-font", "material-icons"],

    build: {
      target: {
        browser: ["es2022", "firefox115", "chrome115", "safari14"],
        node: "node22"
      },
      vueRouterMode: "history",
      // The app is written with the Options API (Quasar CLI now disables it by default).
      vueOptionsAPI: true,
      defineEnv: env
    },

    devServer: {
      open: false
    },

    framework: {
      config: {},
      directives: ["Ripple", "ClosePopup", "TouchHold"],
      plugins: [
        "Notify",
        "Dialog",
        "Loading",
        "LocalStorage",
        "SessionStorage",
        "Cookies",
        "AppVisibility"
      ]
    },

    animations: ["zoomIn", "zoomOut"],

    pwa: {
      workboxMode: "GenerateSW",
      extendGenerateSWOptions(cfg) {
        cfg.skipWaiting = true;
        cfg.clientsClaim = true;
        cfg.maximumFileSizeToCacheInBytes = 8 * 1024 * 1024;
      }
    }
  };
});
