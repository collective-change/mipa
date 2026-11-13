import { createI18n } from "vue-i18n";
import messages from "@/i18n";

const i18n = createI18n({
  legacy: true,
  locale: "en-us",
  fallbackLocale: "en-us",
  messages
});

export default ({ app }) => {
  app.use(i18n);
};

export { i18n };
