import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createStore } from "vuex";
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
    global: { plugins: [[Quasar, { components }], store] }
  });
  return { wrapper, actions };
}

describe("LoginRegister.vue", () => {
  it("title-cases the tab name", () => {
    const { wrapper } = mountLoginRegister("login");
    expect(wrapper.find(".tabName").text()).toBe("Login");
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
