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

function mountLoginRegister(tab = "login", locale = "en-us") {
  const actions = {
    registerUser: vi.fn(),
    loginUser: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
    loginWithGoogle: vi.fn().mockResolvedValue({ uid: "g123", email: "g@example.com" }),
    loginWithMicrosoft: vi.fn().mockResolvedValue({ uid: "m123", email: "m@example.com" }),
    loginWithApple: vi.fn().mockResolvedValue({ uid: "a123", email: "a@example.com" }),
    loginWithCustomToken: vi.fn().mockResolvedValue({ uid: "c123", email: "c@example.com" })
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
        createI18n({ legacy: true, locale, messages })
      ],
      stubs: {
        QDialog: {
          template: "<div class='q-dialog-stub'><slot /></div>"
        }
      }
    }
  });
  return { wrapper, actions };
}

describe("OAuth Sign-In & LoginRegister.vue", () => {
  it("renders all four OAuth provider buttons (Google, Microsoft, Apple, WeChat)", () => {
    const { wrapper } = mountLoginRegister("login");
    expect(wrapper.find("[data-test='oauth-google']").exists()).toBe(true);
    expect(wrapper.find("[data-test='oauth-microsoft']").exists()).toBe(true);
    expect(wrapper.find("[data-test='oauth-apple']").exists()).toBe(true);
    expect(wrapper.find("[data-test='oauth-wechat']").exists()).toBe(true);
  });

  it("renders OAuth provider buttons in register tab as well", () => {
    const { wrapper } = mountLoginRegister("register");
    expect(wrapper.find("[data-test='oauth-google']").exists()).toBe(true);
    expect(wrapper.find("[data-test='oauth-microsoft']").exists()).toBe(true);
    expect(wrapper.find("[data-test='oauth-apple']").exists()).toBe(true);
    expect(wrapper.find("[data-test='oauth-wechat']").exists()).toBe(true);
  });

  it("triggers loginWithGoogle when Google button is clicked", async () => {
    const { wrapper, actions } = mountLoginRegister("login");
    await wrapper.find("[data-test='oauth-google']").trigger("click");
    expect(actions.loginWithGoogle).toHaveBeenCalledTimes(1);
  });

  it("triggers loginWithMicrosoft when Microsoft button is clicked", async () => {
    const { wrapper, actions } = mountLoginRegister("login");
    await wrapper.find("[data-test='oauth-microsoft']").trigger("click");
    expect(actions.loginWithMicrosoft).toHaveBeenCalledTimes(1);
  });

  it("triggers loginWithApple when Apple button is clicked", async () => {
    const { wrapper, actions } = mountLoginRegister("login");
    await wrapper.find("[data-test='oauth-apple']").trigger("click");
    expect(actions.loginWithApple).toHaveBeenCalledTimes(1);
  });

  it("opens WeChat dialog and submits custom token", async () => {
    const { wrapper, actions } = mountLoginRegister("login");
    expect(wrapper.vm.showWeChatDialog).toBe(false);

    await wrapper.find("[data-test='oauth-wechat']").trigger("click");
    expect(wrapper.vm.showWeChatDialog).toBe(true);

    wrapper.vm.customToken = "sample-custom-jwt-token";
    await wrapper.vm.submitCustomToken();

    expect(actions.loginWithCustomToken).toHaveBeenCalledWith(
      expect.anything(),
      "sample-custom-jwt-token"
    );
    expect(wrapper.vm.showWeChatDialog).toBe(false);
  });

  it("renders with zero Chinese characters in English locale", () => {
    const { wrapper } = mountLoginRegister("login", "en-us");
    const text = wrapper.text();
    const chineseRegex = /[\u4e00-\u9fa5]/;
    expect(chineseRegex.test(text)).toBe(false);
  });

  it("renders in Traditional Chinese locale with proper localization", () => {
    const { wrapper } = mountLoginRegister("login", "zh-tw");
    const text = wrapper.text();
    expect(text).toContain("或使用第三方帳號登入");
    expect(text).toContain("微信");
  });
});
