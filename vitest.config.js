import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // use Quasar's browser build in the DOM test environment
      quasar: "quasar/dist/quasar.client.js"
    }
  },
  test: {
    environment: "happy-dom",
    include: ["test/unit/**/*.spec.js"],
    server: { deps: { inline: ["quasar"] } }
  }
});
