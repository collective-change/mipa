import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import OnboardingTourModal from "../../src/components/Model/Modals/OnboardingTourModal.vue";
import { createI18n } from "vue-i18n";
import enUs from "../../src/i18n/en-us";

describe("OnboardingTourModal.vue", () => {
  let i18n;

  beforeEach(() => {
    i18n = createI18n({
      legacy: true,
      locale: "en-us",
      messages: {
        "en-us": enUs
      }
    });
  });

  const stubComponents = {
    "q-dialog": { template: "<div><slot /></div>" },
    "q-card": { template: "<div><slot /></div>" },
    "q-card-section": { template: "<div><slot /></div>" },
    "q-card-actions": { template: "<div><slot /></div>" },
    "q-btn": { props: ["label"], template: "<button>{{ label }}<slot /></button>" },
    "q-icon": { template: "<i></i>" }
  };

  it("renders step 1 and advances through all 4 steps", async () => {
    const wrapper = mount(OnboardingTourModal, {
      props: {
        modelValue: true
      },
      global: {
        plugins: [i18n],
        stubs: stubComponents
      }
    });

    expect(wrapper.vm.currentStep).toBe(0);
    expect(wrapper.text()).toContain(enUs.tourStep1Title);
    expect(wrapper.text()).toContain(enUs.tourStep1Takeaway);

    // Advance to step 2
    await wrapper.setData({ currentStep: 1 });
    expect(wrapper.text()).toContain(enUs.tourStep2Title);

    // Advance to step 3
    await wrapper.setData({ currentStep: 2 });
    expect(wrapper.text()).toContain(enUs.tourStep3Title);

    // Advance to step 4
    await wrapper.setData({ currentStep: 3 });
    expect(wrapper.text()).toContain(enUs.tourStep4Title);
    expect(wrapper.text()).toContain(enUs.openTemplateLibraryBtn);
  });

  it("emits open-templates event when template library button is clicked", async () => {
    const wrapper = mount(OnboardingTourModal, {
      props: {
        modelValue: true
      },
      global: {
        plugins: [i18n],
        stubs: stubComponents
      }
    });

    wrapper.vm.onOpenTemplates();
    expect(wrapper.emitted("open-templates")).toBeTruthy();
    expect(wrapper.emitted("update:modelValue")[0]).toEqual([false]);
  });
});
