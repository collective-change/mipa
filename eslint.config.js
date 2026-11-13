import js from "@eslint/js";
import pluginVue from "eslint-plugin-vue";
import globals from "globals";

export default [
  {
    ignores: ["dist/**", ".quasar/**", "src-pwa/node_modules/**", "functions/**"]
  },
  js.configs.recommended,
  ...pluginVue.configs["flat/essential"],
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        process: "readonly"
      }
    },
    rules: {
      // Legacy code style; keep the signal focused on real problems.
      "no-unused-vars": "off",
      "no-empty-pattern": "off",
      "no-prototype-builtins": "off",
      "no-unreachable": "off",
      "no-case-declarations": "off",
      "no-useless-escape": "off",
      "vue/multi-word-component-names": "off",
      "vue/no-unused-components": "off",
      // Pre-existing patterns, flagged for follow-up rather than failing lint.
      "no-redeclare": "warn",
      "no-fallthrough": "warn",
      "no-constant-condition": "warn",
      "no-constant-binary-expression": "warn",
      "no-useless-assignment": "warn",
      "vue/return-in-computed-property": "warn",
      "vue/no-mutating-props": "warn",
      "vue/no-side-effects-in-computed-properties": "warn",
      "vue/no-computed-properties-in-data": "warn"
    }
  },
  {
    files: ["src/workers/**"],
    languageOptions: { globals: { ...globals.worker } }
  }
];
