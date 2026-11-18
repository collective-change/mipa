import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createStore } from "vuex";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import PageAuth from "@/pages/PageAuth.vue";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

function mountPageAuth(query = {}) {
  const store = createStore({
    modules: {
      auth: {
        namespaced: true,
        actions: {
          registerUser: vi.fn(),
          loginUser: vi.fn()
        }
      }
    }
  });

  const wrapper = mount(PageAuth, {
    global: {
      plugins: [
        [Quasar, { components }],
        store,
        createI18n({ legacy: true, locale: "en-us", messages })
      ],
      mocks: {
        $route: { query }
      },
      stubs: {
        "q-page": { template: "<div class='q-page'><slot /></div>" },
        "login-register": { template: "<div class='stub-login-register'></div>", props: ["tab"] },
        "early-access-form": { template: "<div class='stub-early-access'></div>" },
        "router-link": { template: "<a><slot /></a>" }
      }
    }
  });

  return wrapper;
}

describe("PageAuth.vue (MIPA-18 tab routing)", () => {
  it("defaults to login tab when no query parameter is provided", () => {
    const wrapper = mountPageAuth();
    expect(wrapper.vm.tab).toBe("login");
  });

  it("selects register tab when ?tab=register is passed (does not remap to waitlist)", () => {
    const wrapper = mountPageAuth({ tab: "register" });
    expect(wrapper.vm.tab).toBe("register");
  });

  it("selects waitlist tab when ?tab=waitlist is passed", () => {
    const wrapper = mountPageAuth({ tab: "waitlist" });
    expect(wrapper.vm.tab).toBe("waitlist");
  });

  it("renders all three tabs: Sign in, Create account, and Request Early Access", () => {
    const wrapper = mountPageAuth();
    expect(wrapper.text()).toContain("Sign in");
    expect(wrapper.text()).toContain("Create account");
    expect(wrapper.text()).toContain("Request Early Access");
  });
});
