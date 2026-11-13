import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createStore } from "vuex";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import LoginRegister from "@/components/Auth/LoginRegister.vue";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

function mountLoginRegister(tab = "login") {
  const actions = {
    registerUser: vi.fn(),
    loginUser: vi.fn(),
    sendPasswordResetEmail: vi.fn()
  };
  const store = createStore({
    modules: { auth: { namespaced: true, actions } }
  });
  const wrapper = mount(LoginRegister, {
    props: { tab },
    global: {
      plugins: [
        [Quasar, { components }],
        store,
        createI18n({ legacy: true, locale: "en-us", messages })
      ]
    }
  });
  return { wrapper, actions };
}

describe("LoginRegister.vue", () => {
  it("labels the submit button for the current tab", () => {
    const login = mountLoginRegister("login").wrapper;
    expect(login.find("button[type=submit]").text()).toBe("Sign in");
    const register = mountLoginRegister("register").wrapper;
    expect(register.find("button[type=submit]").text()).toBe("Create account");
  });

  it("offers a password reset only when signing in", () => {
    expect(mountLoginRegister("login").wrapper.text()).toContain("Forgot password?");
    expect(mountLoginRegister("register").wrapper.text()).not.toContain("Forgot password?");
  });

  it("binds email input to formData", async () => {
    const { wrapper } = mountLoginRegister();
    await wrapper.find("input[name=email]").setValue("a1@b2.cd");
    expect(wrapper.vm.formData.email).toBe("a1@b2.cd");
  });

  it("validates email addresses", () => {
    const { wrapper } = mountLoginRegister();
    expect(wrapper.vm.isValidEmailAddress("a1@b2.cd")).toBe(true);
    expect(wrapper.vm.isValidEmailAddress("not-an-email")).toBe(false);
  });
});
