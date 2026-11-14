import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createStore } from "vuex";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import PageOrgAi from "@/pages/PageOrgAi.vue";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

function mountPageOrgAi(options = {}) {
  const store = createStore({
    modules: {
      auth: {
        namespaced: true,
        state: { userId: "user-admin-1" }
      },
      orgs: {
        namespaced: true,
        state: {
          currentOrg: {
            id: "org-1",
            name: "Eco Foundation",
            superAdmins: ["user-admin-1"]
          }
        }
      },
      users: {
        namespaced: true,
        getters: {
          currentOrgUsers: () => [
            { id: "user-admin-1", displayName: "Admin User", email: "admin@eco.org" },
            { id: "user-2", displayName: "Staff Member", email: "staff@eco.org" }
          ]
        }
      }
    }
  });

  const wrapper = mount(PageOrgAi, {
    global: {
      plugins: [
        [Quasar, { components, directives: { ClosePopup: All.ClosePopup } }],
        store,
        createI18n({ legacy: true, locale: options.locale || "en-us", messages })
      ],
      mocks: {
        $route: { params: { orgId: "org-1" } },
        $q: {
          notify: vi.fn(),
          dialog: vi.fn(() => ({ onOk: (fn) => fn() }))
        }
      },
      stubs: {
        "router-link": { template: "<a><slot /></a>" }
      }
    }
  });

  return { wrapper };
}

describe("PageOrgAi.vue", () => {
  it("renders with Anthropic selected by default and displays recommended presets", () => {
    const { wrapper } = mountPageOrgAi();
    expect(wrapper.vm.selectedPresetId).toBe("anthropic");
    expect(wrapper.vm.form.provider).toBe("anthropic");
    expect(wrapper.vm.form.model).toBe("claude-opus-5-5");
    expect(wrapper.vm.presets.length).toBeGreaterThanOrEqual(4);
  });

  it("updates provider, baseUrl, and model when choosing OpenAI preset", async () => {
    const { wrapper } = mountPageOrgAi();
    const openaiPreset = wrapper.vm.presets.find((p) => p.id === "openai");
    wrapper.vm.choosePreset(openaiPreset);

    expect(wrapper.vm.selectedPresetId).toBe("openai");
    expect(wrapper.vm.form.provider).toBe("openai-compatible");
    expect(wrapper.vm.form.baseUrl).toBe("https://api.openai.com/v1");
    expect(wrapper.vm.form.model).toBe("gpt-4o");
    expect(wrapper.vm.activePreset.providerDisplayName).toBe("OpenAI Platform");
  });

  it("updates provider and baseUrl when choosing Google Gemini preset", async () => {
    const { wrapper } = mountPageOrgAi();
    const geminiPreset = wrapper.vm.presets.find((p) => p.id === "gemini");
    wrapper.vm.choosePreset(geminiPreset);

    expect(wrapper.vm.selectedPresetId).toBe("gemini");
    expect(wrapper.vm.form.provider).toBe("openai-compatible");
    expect(wrapper.vm.form.baseUrl).toContain("generativelanguage.googleapis.com");
    expect(wrapper.vm.form.model).toBe("gemini-2.5-flash");
  });

  it("updates model when clicking recommended model chip", () => {
    const { wrapper } = mountPageOrgAi();
    expect(wrapper.vm.form.model).toBe("claude-opus-5-5");

    wrapper.vm.form.model = "claude-haiku-5-5";
    expect(wrapper.vm.form.model).toBe("claude-haiku-5-5");
  });

  it("toggles API key visibility", () => {
    const { wrapper } = mountPageOrgAi();
    expect(wrapper.vm.isKeyVisible).toBe(false);
    wrapper.vm.isKeyVisible = true;
    expect(wrapper.vm.isKeyVisible).toBe(true);
  });

  it("diagnoses authentication errors with clear advice", () => {
    const { wrapper } = mountPageOrgAi();
    const error = new Error("Invalid API key provided (401)");
    const advice = wrapper.vm.getAdviceFromError(error);
    expect(advice).toContain("API key");
  });

  it("diagnoses quota / rate limit errors with billing advice", () => {
    const { wrapper } = mountPageOrgAi();
    const error = new Error("Quota exceeded or rate limit (429)");
    const advice = wrapper.vm.getAdviceFromError(error);
    expect(advice).toContain("billing");
  });

  it("calls setAiSettings when saving valid credentials", async () => {
    const { wrapper } = mountPageOrgAi();
    const mockCall = vi.fn().mockResolvedValue({ data: { ok: true } });
    wrapper.vm.call = mockCall;

    wrapper.vm.form.apiKey = "sk-test-123456789";
    await wrapper.vm.save();

    expect(mockCall).toHaveBeenCalledWith("setAiSettings", {
      orgId: "org-1",
      provider: "anthropic",
      model: "claude-opus-5-5",
      baseUrl: "",
      apiKey: "sk-test-123456789"
    });
    expect(wrapper.vm.testResult.status).toBe("success");
  });
});
