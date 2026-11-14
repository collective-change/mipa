import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import EarlyAccessForm from "@/components/Auth/EarlyAccessForm.vue";
import * as earlyAccessUtil from "@/utils/earlyAccess";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

function mountForm(locale = "en-us") {
  return mount(EarlyAccessForm, {
    global: {
      plugins: [
        [Quasar, { components }],
        createI18n({ legacy: true, locale, messages })
      ],
      stubs: {
        "q-avatar": {
          template: "<div class='q-avatar'><slot /></div>"
        },
        "q-btn": {
          props: ["label"],
          template: "<button type='button'>{{ label }}<slot /></button>"
        },
        "q-select": {
          props: ["modelValue", "options"],
          template: "<select class='q-select'><slot /></select>"
        }
      }
    }
  });
}

describe("EarlyAccessForm.vue", () => {
  it("renders form fields and submit button in English with zero Chinese characters", () => {
    const wrapper = mountForm("en-us");
    const text = wrapper.text();
    expect(text).toContain("Work or Institutional Email");
    expect(text).toContain("Submit Request");
    expect(text).toContain("Join our priority onboarding waitlist");

    const chineseMatches = text.match(/[\u4e00-\u9fff]/g);
    expect(chineseMatches).toBeNull();
  });

  it("renders form in Traditional Chinese with elegant phrasing", () => {
    const wrapper = mountForm("zh-tw");
    const text = wrapper.text();
    expect(text).toContain("公務或機構電子郵件");
    expect(text).toContain("送出先導體驗申請");
    expect(text).toContain("已有邀請信函？");
  });

  it("emits switch-to-login when sign-in button is clicked", async () => {
    const wrapper = mountForm("en-us");
    const buttons = wrapper.findAll("button");
    const signInBtn = buttons.find(b => b.text().includes("Sign in"));
    expect(signInBtn).toBeDefined();
    await signInBtn.trigger("click");
    expect(wrapper.emitted("switch-to-login")).toBeTruthy();
  });

  it("transitions to success view upon submission", async () => {
    vi.spyOn(earlyAccessUtil, "submitEarlyAccessRequest").mockResolvedValueOnce({
      success: true,
      id: "doc-999"
    });

    const wrapper = mountForm("en-us");
    const emailInput = wrapper.find("input[name='email']");
    if (emailInput.exists()) {
      await emailInput.setValue("applicant@foundation.org");
    } else {
      wrapper.vm.form.email = "applicant@foundation.org";
    }
    await wrapper.vm.submit();

    expect(wrapper.vm.submitted).toBe(true);
    expect(wrapper.text()).toContain("Early Access Request Received");
  });
});
