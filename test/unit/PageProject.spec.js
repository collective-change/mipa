import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import PageProject from "@/pages/PageProject.vue";
import routes from "@/router/routes";
import { isPublicPath } from "@/router/public-paths";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

function mountProject(locale) {
  return mount(PageProject, {
    global: {
      plugins: [[Quasar, { components }], createI18n({ legacy: true, locale, messages })],
      stubs: { "q-page": { template: "<div class='q-page'><slot /></div>" } }
    }
  });
}

describe("PageProject.vue (collective-change.org front page)", () => {
  it("renders the approved English copy", () => {
    const text = mountProject("en-us").text();
    expect(text).toContain("Collective Change");
    expect(text).toContain("Decisions are hard enough when you can see what they cost.");
    expect(text).toContain("Collective Change builds tools for that.");
    expect(text).toContain(
      "among the things you could do, see which are the best overall by your own measure"
    );
    expect(text).toContain("See the return before you spend.");
    expect(text).toContain("A convenience, not the point.");
    expect(text).toContain("Built by Ted Hwang");
  });

  it("renders the approved Traditional Chinese copy", () => {
    const text = mountProject("zh-tw").text();
    expect(text).toContain("看得到成本的時候，決策已經夠難了。");
    expect(text).toContain("Collective Change 為此做工具。");
    expect(text).toContain("在你可能做的那些事裡，看見哪些整體上最好——用你自己的尺");
    expect(text).toContain("在花出去之前，先看見回收。");
    expect(text).toContain("由 Ted Hwang 建造。");
  });

  it("links to longecho.app and the contact address", () => {
    const wrapper = mountProject("en-us");
    expect(wrapper.get('[data-testid="project-longecho-link"]').attributes("href")).toBe(
      "https://longecho.app"
    );
    expect(wrapper.html()).toContain("mailto:hello@collective-change.org");
  });

  it("has no missing translation keys in either locale", () => {
    const keysOf = (locale) =>
      Object.keys(messages[locale]).filter((k) => k.startsWith("project")).sort();
    expect(keysOf("en-us").length).toBe(22);
    expect(keysOf("zh-tw")).toEqual(keysOf("en-us"));
  });
});

describe("front-page routing", () => {
  const children = routes[0].children;
  const find = (path) => children.find((r) => r.path === path);

  it("serves the project page at / and /about, and keeps the product landing at /landing", () => {
    expect(String(find("").component)).toContain("PageProject");
    expect(String(find("/about").component)).toContain("PageProject");
    expect(String(find("/landing").component)).toContain("PageLanding");
  });

  it("keeps /, /about, /landing and /coverage public", () => {
    for (const p of ["/", "/about", "/landing", "/coverage"]) expect(isPublicPath(p)).toBe(true);
  });
});
