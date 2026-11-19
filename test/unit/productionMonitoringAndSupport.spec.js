import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createStore } from "vuex";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import PageHelp from "@/pages/PageHelp.vue";
import Layout from "@/layouts/Layout.vue";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

function createMockStore(customAuth = {}) {
  return createStore({
    modules: {
      auth: {
        namespaced: true,
        state: {
          loggedIn: true,
          userId: "buyer-user-1",
          user: {
            uid: "buyer-user-1",
            email: "buyer@tzuchi.org.tw",
            displayName: "Tzu Chi Coordinator"
          },
          ...customAuth
        }
      },
      orgs: {
        namespaced: true,
        state: {
          currentOrg: {
            id: "org-tzuchi",
            name: "Tzu Chi Foundation",
            subscriptionTier: "starter"
          },
          orgs: []
        }
      },
      users: {
        namespaced: true,
        state: {
          currentUser: { id: "buyer-user-1" }
        }
      },
      model: {
        namespaced: true,
        state: { currentModel: null }
      },
      chats: {
        namespaced: true,
        state: {
          unreadChats: []
        },
        getters: {
          unreadChats: (state) => state.unreadChats
        },
        actions: {
          bindUnreadChats: () => Promise.resolve()
        }
      },
      adHocDocs: {
        namespaced: true,
        state: { exchangeRates: {}, appSummary: null },
        actions: {
          bindAppSummary: vi.fn().mockResolvedValue(null),
          bindExchangeRates: vi.fn().mockResolvedValue(null)
        }
      }
    }
  });
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
      mocks: {
        $route: { path: "/settings/help", params: {} },
        $q: {
          cookies: { has: () => false, get: () => null },
          lang: { getLocale: () => "en-us" },
          screen: { gt: { xs: true, sm: true, md: true }, lt: { md: false, sm: false }, width: 1440, height: 1000 }
        }
      },
      stubs: {
        "q-page": { template: "<div class='q-page'><slot /></div>" },
        "router-view": { template: "<div class='router-view' />" },
        "router-link": {
          props: ["to"],
          template: "<a :href='to'><slot /></a>"
        }
      }
    }
  });
}

describe("MIPA-36: Production Monitoring, Alerting & Support Intake", () => {
  describe("PageHelp.vue - Support Intake & Response Expectations", () => {
    it("renders Stated Response Expectations table across tiers", () => {
      const wrapper = mountComponent(PageHelp, "en-us");
      const text = wrapper.text();

      expect(text).toContain("Stated Response Expectations");
      expect(text).toContain("Community ($0):");
      expect(text).toContain("Starter ($29/mo):");
      expect(text).toContain("Growth ($79/mo):");
      expect(text).toContain("Pro ($199/mo):");
      expect(text).toContain("Enterprise:");

      // Verify explicit stated hours
      expect(text).toContain("48 business hours");
      expect(text).toContain("24 business hours");
      expect(text).toContain("12 business hours");
      expect(text).toContain("4 business hours");
    });

    it("renders Traditional Chinese support intake headings and SLA notice", () => {
      const wrapper = mountComponent(PageHelp, "zh-tw");
      const text = wrapper.text();

      expect(text).toContain("服務回應時效承諾");
      expect(text).toContain("聯絡我們與優先支援工單");
      expect(text).toContain("付費用戶享有優先排入工程開發管線之權利");
    });

    it("prompts unauthenticated users to sign in or use GitHub issues", () => {
      const storeLoggedOut = createMockStore({ loggedIn: false, user: null, userId: null });
      const wrapper = mountComponent(PageHelp, "en-us", storeLoggedOut);
      const text = wrapper.text();

      expect(text).toContain("Please sign in to file an in-app priority ticket, or use our public GitHub issues.");
    });

    it("renders in-app ticket form for authenticated users with required fields", () => {
      const wrapper = mountComponent(PageHelp, "en-us");

      expect(wrapper.find("form").exists()).toBe(true);
      expect(wrapper.text()).toContain("Subject");
      expect(wrapper.text()).toContain("Category");
      expect(wrapper.text()).toContain("Message");
      expect(wrapper.text()).toContain("Submit Support Ticket");
    });
  });

  describe("Layout.vue - Navigation Links & Contact Us wiring", () => {
    it("wires Contact us into navigation links and Terms into footer buttons", () => {
      const wrapper = mountComponent(Layout, "en-us");
      const vm = wrapper.vm;

      // Assert links2 includes "Contact us" pointing to /settings/help#contact
      const contactLink = vm.links2.find((l) => l.text === "Contact us");
      expect(contactLink).toBeDefined();
      expect(contactLink.to).toBe("/settings/help#contact");
      expect(contactLink.icon).toBe("contact_support");

      // Assert buttons1 includes Terms pointing to /terms
      const termsButton = vm.buttons1.find((b) => b.text === "Terms");
      expect(termsButton).toBeDefined();
      expect(termsButton.to).toBe("/terms");
    });
  });
});
