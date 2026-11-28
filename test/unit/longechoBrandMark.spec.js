import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createStore } from "vuex";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import Layout from "@/layouts/Layout.vue";
import PageLanding from "@/pages/PageLanding.vue";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

describe("todo253: Longecho Mark & Brand Asset Adoption", () => {
  const publicDir = path.resolve(__dirname, "../../public");
  const longechoDir = path.join(publicDir, "longecho");

  it("commits the four Longecho SVGs and their matching 1024px PNGs under public/longecho/", () => {
    const requiredFiles = [
      "longecho-wordmark.svg",
      "longecho-wordmark-1024.png",
      "longecho-wordmark-dark.svg",
      "longecho-wordmark-dark-1024.png",
      "longecho-lockup-horizontal.svg",
      "longecho-lockup-horizontal-1024.png",
      "longecho-lockup-stacked.svg",
      "longecho-lockup-stacked-1024.png",
      "mipa-mark-icon.svg",
      "mipa-mark-icon-1024.png"
    ];

    expect(fs.existsSync(longechoDir)).toBe(true);

    for (const file of requiredFiles) {
      const filePath = path.join(longechoDir, file);
      expect(fs.existsSync(filePath), `Expected ${file} to exist in public/longecho/`).toBe(true);
      const stat = fs.statSync(filePath);
      expect(stat.size).toBeGreaterThan(100);
    }
  });

  it("ensures no committed SVG contains a live <text> element (all lettering outlined to <path>)", () => {
    const svgFiles = fs.readdirSync(longechoDir).filter(f => f.endsWith(".svg"));
    expect(svgFiles.length).toBeGreaterThanOrEqual(5);

    for (const svgFile of svgFiles) {
      const content = fs.readFileSync(path.join(longechoDir, svgFile), "utf8");
      expect(content).not.toMatch(/<text[\s>]/i);
    }
  });

  it("points the favicon and social card in index.html to the symbol without breaking PWA icons", () => {
    const indexHtmlPath = path.resolve(__dirname, "../../index.html");
    const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");

    // Favicon resolves to the symbol (SVG & PNG)
    expect(indexHtml).toContain('<link rel="icon" type="image/svg+xml" href="/longecho/mipa-mark-icon.svg"');
    expect(indexHtml).toContain('<link rel="icon" type="image/png" sizes="1024x1024" href="/longecho/mipa-mark-icon-1024.png"');

    // Social card (Open Graph & Twitter) resolves to the symbol
    expect(indexHtml).toContain('<meta property="og:image" content="/longecho/mipa-mark-icon-1024.png"');
    expect(indexHtml).toContain('<meta name="twitter:image" content="/longecho/mipa-mark-icon-1024.png"');

    // Existing PWA icon set is preserved
    expect(indexHtml).toContain('href="/icons/icon-128x128.png"');
    expect(indexHtml).toContain('href="/icons/favicon-16x16.png"');
    expect(indexHtml).toContain('href="/icons/favicon-32x32.png"');
    expect(indexHtml).toContain('href="/icons/favicon-96x96.png"');
    expect(indexHtml).toContain('href="/icons/favicon-192x192.png"');
    expect(indexHtml).toContain('href="/icons/favicon-256x256.png"');
    expect(indexHtml).toContain('href="/icons/favicon-384x384.png"');
    expect(indexHtml).toContain('href="/icons/favicon-512x512.png"');
    expect(indexHtml).toContain('href="/icons/apple-icon-152x152.png"');
  });

  it("renders the wordmark in Layout.vue (header)", () => {
    const store = createStore({
      modules: {
        auth: { namespaced: true, state: { loggedIn: false } },
        org: { namespaced: true, state: { currentOrg: null } },
        orgs: { namespaced: true, state: { orgs: [] } },
        model: { namespaced: true, state: { currentModel: null, nodes: [], links: [] } },
        ui: { namespaced: true, state: { leftDrawerOpen: false, currentLinkGroup: "model" } },
        adHocDocs: { namespaced: true, state: { appSummary: {}, exchangeRates: {} } },
        chats: { namespaced: true, state: { unreadChats: [] } }
      }
    });

    const wrapper = mount(Layout, {
      global: {
        plugins: [
          [Quasar, { components }],
          store,
          createI18n({ legacy: true, locale: "en-us", messages })
        ],
        mocks: {
          $q: {
            screen: { gt: { xs: true, sm: true, md: true }, lt: { md: false, sm: false } },
            dark: { isActive: false },
            cookies: { has: () => false, get: () => null, set: () => {} },
            lang: { getLocale: () => "en-US", set: () => {} }
          },
          $route: { path: "/", params: {} }
        },
        stubs: {
          "router-link": { template: "<a><slot /></a>" },
          "router-view": { template: "<div><slot /></div>" }
        }
      }
    });

    const wordmarkImg = wrapper.find('img[src="/longecho/longecho-wordmark.svg"]');
    expect(wordmarkImg.exists()).toBe(true);
    expect(wordmarkImg.attributes("alt")).toBe("Longecho");
  });

  it("renders the wordmark on PageLanding.vue", () => {
    const store = createStore({
      modules: { auth: { namespaced: true, state: { loggedIn: false } } }
    });

    const wrapper = mount(PageLanding, {
      global: {
        plugins: [
          [Quasar, { components }],
          store,
          createI18n({ legacy: true, locale: "en-us", messages })
        ],
        stubs: {
          "q-page": { template: "<div><slot /></div>" },
          "router-link": { template: "<a><slot /></a>" }
        }
      }
    });

    const wordmarkImg = wrapper.find('.landing-wordmark');
    expect(wordmarkImg.exists()).toBe(true);
    expect(wordmarkImg.attributes("src")).toBe("/longecho/longecho-wordmark.svg");
    expect(wordmarkImg.attributes("alt")).toBe("Longecho");
  });
});
