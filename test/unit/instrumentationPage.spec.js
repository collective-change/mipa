import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import PageInstrumentation from "@/pages/PageInstrumentation.vue";
import PagePrivacy from "@/pages/PagePrivacy.vue";
import { isPublicPath } from "@/router/public-paths";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

function mountComponent(Component, locale = "en-us") {
  return mount(Component, {
    global: {
      plugins: [
        [Quasar, { components }],
        createI18n({ legacy: true, locale, messages })
      ],
      stubs: {
        "q-page": { template: "<div class='q-page'><slot /></div>" },
        "router-link": { template: "<a :href='$attrs.to'><slot /></a>" }
      }
    }
  });
}

describe("todo225: PageInstrumentation.vue & PagePrivacy link", () => {
  it("marks /instrumentation as a public path accessible without authentication", () => {
    expect(isPublicPath("/instrumentation")).toBe(true);
  });

  it("mounts PageInstrumentation.vue and renders core privacy rule and collected items", () => {
    const wrapper = mountComponent(PageInstrumentation);
    const text = wrapper.text();

    expect(text).toContain("Measure the app, never the person");
    expect(text).toContain("Which page was opened");
    expect(text).toContain("The referring hostname");
    expect(text).toContain("viewport width bucket");
    expect(text).toContain("No cookies");
    expect(text).toContain("No IP addresses retained");
    expect(text).toContain("Nothing from a third party");
    expect(text).toContain("Do Not Track (DNT)");
    expect(text).toContain("Global Privacy Control (GPC)");
    expect(text).toContain("signup_started");
    expect(text).toContain("goal_created");
    expect(text).toContain("ranking_viewed");
    expect(text).toContain("ranking_explained");
    expect(text).toContain("record_published");
    expect(text).toContain("first_run_abandon");
  });

  it("PagePrivacy.vue contains a prominent link to the Instrumentation Notice", () => {
    const wrapper = mountComponent(PagePrivacy);
    const text = wrapper.text();

    expect(text).toContain("Product Telemetry & Instrumentation Notice");
    const link = wrapper.findComponent({ name: "router-link" });
    const links = wrapper.findAll("a");
    const hasNoticeLink = links.some((a) => a.attributes("href") === "/instrumentation" || a.text().includes("Instrumentation Notice"));
    expect(hasNoticeLink).toBe(true);
  });
});
