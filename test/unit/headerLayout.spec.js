import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createStore } from "vuex";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import Layout from "@/layouts/Layout.vue";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

function mountHeader(org = { id: "test-org", name: "Riverside Food Bank (sample)", nameSlug: "riverside" }, loggedIn = true) {
  const store = createStore({
    modules: {
      auth: {
        namespaced: true,
        state: {
          loggedIn,
          currentUser: { uid: "user-1", email: "user@example.com" },
          userDetails: { role: "admin" }
        },
        getters: {
          loggedIn: (state) => state.loggedIn,
          currentUser: (state) => state.currentUser,
          userDetails: (state) => state.userDetails
        }
      },
      org: {
        namespaced: true,
        state: {
          currentOrg: org,
          currentOrgRole: "admin",
          currentOrgMembers: []
        },
        getters: {
          currentOrg: (state) => state.currentOrg,
          currentOrgRole: (state) => state.currentOrgRole,
          currentOrgMembers: (state) => state.currentOrgMembers
        }
      },
      orgs: {
        namespaced: true,
        state: {
          currentOrg: org,
          orgs: org ? [org] : []
        },
        actions: {
          bindCurrentOrg: () => Promise.resolve(),
          bindUserOrgs: () => Promise.resolve()
        }
      },
      model: {
        namespaced: true,
        state: {
          currentModel: { id: "model-1", name: "Baseline" },
          nodes: [],
          links: [],
          selectedNodeId: null
        },
        getters: {
          currentModel: (state) => state.currentModel,
          nodes: (state) => state.nodes,
          links: (state) => state.links,
          selectedNodeId: (state) => state.selectedNodeId
        }
      },
      ui: {
        namespaced: true,
        state: {
          leftDrawerOpen: false,
          currentLinkGroup: "model"
        },
        getters: {
          leftDrawerOpen: (state) => state.leftDrawerOpen,
          currentLinkGroup: (state) => state.currentLinkGroup
        },
        mutations: {
          setLeftDrawerOpen(state, val) {
            state.leftDrawerOpen = val;
          }
        }
      },
      adHocDocs: {
        namespaced: true,
        state: {
          appSummary: {},
          exchangeRates: {}
        },
        actions: {
          bindAppSummary: () => Promise.resolve(),
          bindExchangeRates: () => Promise.resolve()
        }
      },
      chats: {
        namespaced: true,
        state: {
          unreadChats: []
        },
        actions: {
          bindUnreadChats: () => Promise.resolve()
        }
      }
    }
  });

  return mount(Layout, {
    global: {
      plugins: [
        [Quasar, { components }],
        store,
        createI18n({ legacy: true, locale: "en-us", messages })
      ],
      mocks: {
        $q: {
          screen: {
            gt: {
              xs: true,
              sm: true,
              md: true
            },
            lt: {
              md: false,
              sm: false
            },
            width: 1440,
            height: 1000
          },
          dark: {
            isActive: false
          },
          cookies: {
            has: () => false,
            get: () => null,
            set: () => {}
          },
          lang: {
            getLocale: () => "en-US",
            set: () => {}
          }
        },
        $route: {
          path: "/org/riverside/model/test-org/model-1",
          params: { orgNameSlug: "riverside", orgId: "test-org", modelId: "model-1" }
        }
      },
      stubs: {
        "router-link": {
          template: "<a><slot /></a>"
        },
        "router-view": {
          template: "<div class='router-view'><slot /></div>"
        },
        "unread-messages": true,
        "unread-notifications": true
      }
    }
  });
}

describe("Layout Header (MIPA-7)", () => {
  it("renders sample organization name and mipa logo with distinct spacing", () => {
    const wrapper = mountHeader({
      id: "org-sample",
      name: "Riverside Food Bank (sample)",
      nameSlug: "riverside"
    });

    const orgNameEl = wrapper.find(".org-name");
    expect(orgNameEl.exists()).toBe(true);
    expect(orgNameEl.text()).toContain("Riverside Food Bank (sample)");
    expect(orgNameEl.classes()).toContain("ellipsis");
    expect(orgNameEl.attributes("title")).toBe("Riverside Food Bank (sample)");

    // Logo button is present with spacing class
    const logoBtn = wrapper.find(".text-primary.q-toolbar__title");
    expect(logoBtn.exists()).toBe(true);
    expect(logoBtn.text()).toBe("Longecho");
  });

  it("handles long organization names >= 40 characters without dropping title or tooltip", () => {
    const longName = "Tzu Chi Foundation Disaster Relief Mission Headquarters";
    expect(longName.length).toBeGreaterThanOrEqual(40);

    const wrapper = mountHeader({
      id: "org-long",
      name: longName,
      nameSlug: "tzu-chi-relief"
    });

    const orgNameEl = wrapper.find(".org-name");
    expect(orgNameEl.exists()).toBe(true);
    expect(orgNameEl.text()).toContain(longName);
    expect(orgNameEl.attributes("title")).toBe(longName);

    // Tooltip should be present and contain full name
    const tooltip = orgNameEl.findComponent({ name: "QTooltip" });
    expect(tooltip.exists()).toBe(true);
    const slotContent = tooltip.vm.$slots.default ? tooltip.vm.$slots.default()[0].children : "";
    expect(slotContent).toBe(longName);
  });

  it("does not render empty org-name container when org has no name or user has no org", () => {
    const wrapper = mountHeader(null, false);
    const orgNameEl = wrapper.find(".org-name");
    expect(orgNameEl.exists()).toBe(false);
  });
});
