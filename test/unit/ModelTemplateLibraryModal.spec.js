import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import ModelTemplateLibraryModal from "../../src/components/Model/Modals/ModelTemplateLibraryModal.vue";
import { createI18n } from "vue-i18n";
import enUs from "../../src/i18n/en-us";

describe("ModelTemplateLibraryModal.vue", () => {
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
    "q-icon": { template: "<i></i>" },
    "q-badge": { template: "<span><slot /></span>" },
    "q-chip": { template: "<span><slot /></span>" },
    "q-input": { template: "<input />" },
    "q-table": { template: "<div><slot /></div>" },
    "q-td": { template: "<div><slot /></div>" },
    "q-list": { template: "<div><slot /></div>" },
    "q-item": { template: "<div><slot /></div>" },
    "q-item-section": { template: "<div><slot /></div>" },
    "q-item-label": { template: "<div><slot /></div>" }
  };

  it("renders modal title, category filters, and template cards", () => {
    const wrapper = mount(ModelTemplateLibraryModal, {
      props: {
        modelValue: true,
        model: { id: "test_m1", name: "Operations Model" },
        nodes: []
      },
      global: {
        plugins: [i18n],
        stubs: stubComponents
      }
    });

    expect(wrapper.text()).toContain(enUs.templateLibraryModalTitle);
    expect(wrapper.text()).toContain("Emergency Disaster Relief & Surge Logistics");
    expect(wrapper.text()).toContain("Community Preventative Care & Mobile Health");
  });

  it("filters templates by category", async () => {
    const wrapper = mount(ModelTemplateLibraryModal, {
      props: {
        modelValue: true,
        model: { id: "test_m1" },
        nodes: []
      },
      global: {
        plugins: [i18n],
        stubs: stubComponents
      }
    });

    await wrapper.setData({ selectedCategory: "Education" });
    expect(wrapper.vm.filteredTemplates).toHaveLength(1);
    expect(wrapper.vm.filteredTemplates[0].id).toBe("education_digital_literacy");
  });

  it("switches to template preview mode", async () => {
    const wrapper = mount(ModelTemplateLibraryModal, {
      props: {
        modelValue: true,
        model: { id: "test_m1" },
        nodes: []
      },
      global: {
        plugins: [i18n],
        stubs: stubComponents
      }
    });

    const disasterTpl = wrapper.vm.templates[0];
    await wrapper.setData({ previewTemplate: disasterTpl });

    expect(wrapper.text()).toContain(enUs.backToTemplatesList);
    expect(wrapper.text()).toContain(enUs.cloneTemplateBtn);
    expect(wrapper.text()).toContain(enUs.templateFactorsTitle);
  });
});
