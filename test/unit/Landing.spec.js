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

  it("MIPA-61: landing copy names supported sectors and states the single-seat free-tier boundary", () => {
    const enWrapper = mountLanding("en-us");
    const enText = enWrapper.text();
    for (const sector of ["business", "non-profit", "government", "community", "mission-driven"]) {
      expect(enText.toLowerCase()).toContain(sector);
    }
    expect(enText).toContain("1 active model builder");
    expect(enText).not.toContain("Free for NGOs, researchers, and mission-driven teams");

    const zhWrapper = mountLanding("zh-tw");
    const zhText = zhWrapper.text();
    for (const term of ["企業", "非營利組織", "政府機關", "社區", "使命導向"]) {
      expect(zhText).toContain(term);
    }
    expect(zhText).toContain("1 個建模席位");
  });

  it("MIPA-61: updates all five locales cleanly with no English leaks or simplified characters in zh-tw", () => {
    const keys = ["landingWhyP2", "landingTrustP3Desc", "landingCtaSubtitle"];
    const simplifiedRegex = /[将动态拟带业营组织机关区团体专计复杂运转据应决协适亲个负领队单费读检视连结则]/;

    for (const locale of ["en-us", "zh-tw", "zh-cn", "es", "ja"]) {
      for (const key of keys) {
        const val = messages[locale][key];
        expect(typeof val).toBe("string");
        expect(val.trim().length).toBeGreaterThan(20);
        if (locale === "zh-tw" || locale === "zh-cn" || locale === "ja") {
          expect(val).not.toMatch(/[A-Za-z]{2,}/);
        }
        if (locale === "zh-tw") {
          expect(val).not.toMatch(simplifiedRegex);
        }
        if (locale === "es") {
          expect(val).toMatch(/empresas|organizaciones sin fines de lucro/i);
          expect(val).not.toContain("Free for NGOs");
          expect(val).not.toContain("social change");
        }
      }
    }
  });
});
