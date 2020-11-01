module.exports = {
  plugins: ["quasar"],
  extends: ["plugin:quasar/standard"],
  rules: {
    "quasar/no-invalid-props": "error",
    "quasar/no-invalid-qfield-usage": "error"
  }
};
