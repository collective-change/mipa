import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
      // use Quasar's browser build in the DOM test environment
      { find: /^quasar$/, replacement: "quasar/dist/quasar.client.js" }
    ]
  },
  test: {
    environment: "happy-dom",
    testTimeout: 20000,
    include: ["test/unit/**/*.spec.js"],
    server: { deps: { inline: ["quasar"] } }
  }
});
