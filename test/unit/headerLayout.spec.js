import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createPinia, setActivePinia } from "pinia";
import { useAuthStore } from "@/store/store-auth";
import { useUsersStore } from "@/store/store-users";
import { useOrgsStore } from "@/store/store-orgs";
import { useModelStore } from "@/store/store-model";
import { useActionsStore } from "@/store/store-actions";
import { useAdHocDocsStore } from "@/store/store-adHocDocs";
import { useChatsStore } from "@/store/store-chats";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import Layout from "@/layouts/Layout.vue";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

function mountHeader(org = { id: "test-org", name: "Riverside Food Bank (sample)", nameSlug: "riverside" }, loggedIn = true) {
  // Only the stores Layout.vue reads are seeded; Firestore bind/unbind actions are
  // stubbed (the old Vuex mock either resolved them or left them undefined = no-op).
  const store = createPinia();
  setActivePinia(store);
  useAuthStore(store).$patch({ loggedIn });
  Object.assign(useUsersStore(store), {
    bindCurrentUser: () => Promise.resolve(),
    unbindCurrentUser: () => {},
    bindCurrentOrgUsers: () => Promise.resolve()
  });
  useOrgsStore(store).$patch({ currentOrg: org, orgs: org ? [org] : [] });
  Object.assign(useOrgsStore(store), {
    bindCurrentOrg: () => Promise.resolve(),
    unbindCurrentOrg: () => {}
  });
  useModelStore(store).$patch({ currentModel: { id: "model-1", name: "Baseline" }, nodes: [] });
  Object.assign(useModelStore(store), {
    unbindCurrentModel: () => {},
    unbindNodes: () => {}
  });
  Object.assign(useActionsStore(store), { unbindMatchingActions: () => {} });
  useAdHocDocsStore(store).$patch({ appSummary: {}, exchangeRates: {} });
  Object.assign(useAdHocDocsStore(store), {
    bindAppSummary: () => Promise.resolve(),
    bindExchangeRates: () => Promise.resolve(),
    unbindAppSummary: () => {},
    unbindExchangeRates: () => {}
  });
  useChatsStore(store).$patch({ unreadChats: [] });
  Object.assign(useChatsStore(store), { bindUnreadChats: () => Promise.resolve() });

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
