import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createStore } from "vuex";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import PageLanding from "@/pages/PageLanding.vue";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

function mountLanding(locale = "en-us") {
  const store = createStore({
    modules: { auth: { namespaced: true, state: { loggedIn: false } } }
  });
  return mount(PageLanding, {
    global: {
      plugins: [
        [Quasar, { components }],
        store,
        createI18n({ legacy: true, locale, messages })
      ],
      stubs: {
        "q-page": {
          template: "<div class='q-page'><slot /></div>"
        },
        "router-link": {
          props: ["to"],
          template: "<a :href='to'><slot /></a>"
        }
      }
    }
  });
}

describe("PageLanding.vue", () => {
  it("renders the English hero headline and CTAs", () => {
    const wrapper = mountLanding("en-us");
    expect(wrapper.text()).toContain("Find the highest-leverage actions for your organization");
    expect(wrapper.text()).toContain("Request Early Access");
    expect(wrapper.text()).toContain("Map your system");
    expect(wrapper.text()).toContain("Simulate interventions");
    expect(wrapper.text()).toContain("Rank by leverage");
  });

  it("renders the Traditional Chinese hero headline and Chinese leverage term", () => {
    const wrapper = mountLanding("zh-tw");
    expect(wrapper.text()).toContain("為您的組織找出最高效應比的關鍵行動");
    expect(wrapper.text()).toContain("申請先導體驗");
    expect(wrapper.text()).toContain("建立系統模型");
    expect(wrapper.text()).toContain("模擬行動方案");
    expect(wrapper.text()).toContain("依效應比排序");
  });

  it("MIPA-60: links visitors directly to the public /m/sample dossier in both languages", () => {
    const enWrapper = mountLanding("en-us");
    const enLink = enWrapper.find('[data-testid="landing-demo-link"]');
    expect(enLink.exists()).toBe(true);
    expect(enLink.attributes("href")).toBe("/m/sample");
    expect(enLink.text()).toContain("Explore live sample dossier");

    const zhWrapper = mountLanding("zh-tw");
    const zhLink = zhWrapper.find('[data-testid="landing-demo-link"]');
    expect(zhLink.exists()).toBe(true);
    expect(zhLink.attributes("href")).toBe("/m/sample");
    expect(zhLink.text()).toContain("瀏覽互動範例決策檔案");
  });
});
