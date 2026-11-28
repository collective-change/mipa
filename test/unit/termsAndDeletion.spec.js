import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createPinia, setActivePinia } from "pinia";
import { useAuthStore } from "@/store/store-auth";
import { useOrgsStore } from "@/store/store-orgs";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import PageTerms from "@/pages/PageTerms.vue";
import PagePrivacy from "@/pages/PagePrivacy.vue";
import PageSettings from "@/pages/PageSettings.vue";
import PageLanding from "@/pages/PageLanding.vue";
import { PUBLIC_PATHS, isPublicPath } from "@/router/public-paths";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

function createMockStore(customAuth = {}) {
  const store = createPinia();
  setActivePinia(store);
  const auth = useAuthStore(store);
  auth.$patch({
    loggedIn: true,
    userId: "test-user-123",
    user: {
      uid: "test-user-123",
      email: "founder@collective-change.org",
      displayName: "Test Founder",
      emailVerified: true
    },
    ...customAuth
  });
  auth.deleteAccount = vi.fn();
  useOrgsStore(store).$patch({
    orgs: [
      {
        id: "org-1",
        name: "Climate Action Initiative",
        currency: "USD",
        superAdmins: ["test-user-123"]
      }
    ]
  });
  return store;
}

function mountComponent(Component, locale = "en-us", store = createMockStore()) {
  return mount(Component, {
    global: {
      plugins: [
        [Quasar, { components }],
        store,
        createI18n({ legacy: true, locale, messages })
      ],
      directives: {
        ripple: () => {},
        closePopup: () => {}
      },
      stubs: {
        "q-page": { template: "<div class='q-page'><slot /></div>" },
        "router-link": {
          props: ["to"],
          template: "<a :href='to'><slot /></a>"
        }
      }
    }
  });
}

describe("MIPA-35: Terms of Service, Audited Privacy & Deletion Paths", () => {
  describe("Public Routes & Navigation", () => {
    it("declares /terms in PUBLIC_PATHS and recognizes it via isPublicPath", () => {
      expect(PUBLIC_PATHS).toContain("/terms");
      expect(isPublicPath("/terms")).toBe(true);
      expect(PUBLIC_PATHS).toContain("/privacy");
      expect(isPublicPath("/privacy")).toBe(true);
    });

    it("renders Terms and Privacy links in PageLanding footer", () => {
      const wrapper = mountComponent(PageLanding, "en-us");
      const links = wrapper.findAll("a");
      const hrefs = links.map((l) => l.attributes("href"));
      expect(hrefs).toContain("/terms");
      expect(hrefs).toContain("/privacy");
    });
  });

  describe("PageTerms.vue", () => {
    it("renders §2 subscription tiers consistent with the business plan", () => {
      const wrapper = mountComponent(PageTerms, "en-us");
      const text = wrapper.text();

      // Tier names & pricing
      expect(text).toContain("Community Tier ($0)");
      expect(text).toContain("Starter Tier ($29/month)");
      expect(text).toContain("Growth Tier ($79/month)");
      expect(text).toContain("Pro Tier ($199/month)");
      expect(text).toContain("Enterprise Tier");

      // Seats as alignment units
      expect(text).toContain("seats represent alignment units");

      // Free tier as mission delivery mechanism
      expect(text).toContain("primary mission delivery mechanism");
    });

    it("renders client-side calculation disclosure and decision support disclaimer", () => {
      const wrapper = mountComponent(PageTerms, "en-us");
      const text = wrapper.text();

      expect(text).toContain("Web Worker with Math.js");
      expect(text).toContain("Calculations never run on our servers");
      expect(text).toContain("decision-support instruments");
    });

    it("renders Lemon Squeezy Merchant of Record terms", () => {
      const wrapper = mountComponent(PageTerms, "en-us");
      const text = wrapper.text();

      expect(text).toContain("Lemon Squeezy, acting as our Merchant of Record");
      expect(text).toContain("Customer Portal");
    });

    it("renders 'Revocation ≠ erasure' permanence principle for published dossiers", () => {
      const wrapper = mountComponent(PageTerms, "en-us");
      const text = wrapper.text();

      expect(text).toContain("Revocation ≠ erasure");
      expect(text).toContain("tombstone");
      expect(text).toContain("guaranteed provenance and auditability");
    });

    it("renders Traditional Chinese translations for headings and notices", () => {
      const wrapper = mountComponent(PageTerms, "zh-tw");
      expect(wrapper.text()).toContain("服務條款");
      expect(wrapper.text()).toContain("本服務條款目前僅提供英文版本。");
    });
  });

  describe("PagePrivacy.vue (Audited against actual product architecture)", () => {
    it("discloses ingestion of organization financial and operational data", () => {
      const wrapper = mountComponent(PagePrivacy, "en-us");
      const text = wrapper.text();

      expect(text).toContain("operating currencies");
      expect(text).toContain("discount rates");
      expect(text).toContain("budget ceilings");
      expect(text).toContain("net present value calculations");
    });

    it("discloses AI drafting architecture (A-4 decision, AES-256-GCM, TLS transit)", () => {
      const wrapper = mountComponent(PagePrivacy, "en-us");
      const text = wrapper.text();

      expect(text).toContain("A-4 decision");
      expect(text).toContain("AES-256-GCM");
      expect(text).toContain("Anthropic or OpenAI");
      expect(text).toContain("TLS transit encryption rather than client-side zero-knowledge encryption");
    });

    it("discloses public register dossiers and 'Revocation ≠ Erasure'", () => {
      const wrapper = mountComponent(PagePrivacy, "en-us");
      const text = wrapper.text();

      expect(text).toContain("Revocation ≠ Erasure");
      expect(text).toContain("/m/:modelId");
      expect(text).toContain("tombstone");
    });

    it("discloses client-side local calculations and disaster recovery backups", () => {
      const wrapper = mountComponent(PagePrivacy, "en-us");
      const text = wrapper.text();

      expect(text).toContain("browser Web Worker (Math.js)");
      expect(text).toContain("restore drills with 100% data fidelity");
    });
  });

  describe("PageSettings.vue (Account & Data Management)", () => {
    it("renders documentation links including Terms and Privacy", () => {
      const wrapper = mountComponent(PageSettings, "en-us");
      const qItems = wrapper.findAllComponents(All.QItem);
      const toProps = qItems.map((item) => item.props("to")).filter(Boolean);

      expect(toProps).toContain("/terms");
      expect(toProps).toContain("/privacy");
      expect(toProps).toContain("/settings/help");
    });

    it("renders user email and Export My Data button", () => {
      const wrapper = mountComponent(PageSettings, "en-us");
      const text = wrapper.text();

      expect(text).toContain("founder@collective-change.org");
      expect(text).toContain("Export my data");
      expect(text).toContain("Delete my account");
    });

    it("executes data export file generation on exportUserData click", () => {
      const wrapper = mountComponent(PageSettings, "en-us");

      // Mock URL.createObjectURL and URL.revokeObjectURL
      const origCreate = global.URL.createObjectURL;
      const origRevoke = global.URL.revokeObjectURL;
      global.URL.createObjectURL = vi.fn(() => "blob:mock-url");
      global.URL.revokeObjectURL = vi.fn();

      const notifySpy = vi.fn();
      wrapper.vm.$q.notify = notifySpy;

      wrapper.vm.exportUserData();

      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "positive"
        })
      );

      global.URL.createObjectURL = origCreate;
      global.URL.revokeObjectURL = origRevoke;
    });

    it("shows confirmation dialog with 'Revocation ≠ Erasure' notice on delete account", () => {
      const wrapper = mountComponent(PageSettings, "en-us");
      const dialogSpy = vi.fn().mockReturnValue({ onOk: vi.fn() });
      wrapper.vm.$q.dialog = dialogSpy;

      wrapper.vm.confirmDeleteAccount();

      expect(dialogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Delete Account",
          message: expect.stringContaining("revocation ≠ erasure")
        })
      );
    });
  });
});
