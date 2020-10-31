import { mount, createLocalVue, shallowMount } from "@vue/test-utils";
import LoginRegister from "../../../src/components/Auth/LoginRegister.vue";
import * as All from "quasar";
// import langEn from 'quasar/lang/en-us' // change to any language you wish! => this breaks wallaby :(
const { Quasar } = All;

const components = Object.keys(All).reduce((object, key) => {
  const val = All[key];
  if (val && val.component && val.component.name != null) {
    object[key] = val;
  }
  return object;
}, {});

describe("LoginRegister.vue", () => {
  const localVue = createLocalVue();
  localVue.use(Quasar, { components }); // , lang: langEn

  const wrapper = mount(LoginRegister, {
    localVue,
    propsData: { tab: "test" }
  });
  const vm = wrapper.vm;

  it("has a submitForm method", () => {
    expect(typeof vm.submitForm).toBe("function");
  });

  it("uses title case on tab name", () => {
    const tabName = wrapper.find(".tabName").text();
    expect(tabName).toBe("Test");
  });

  it("accepts email input", async () => {
    const email = "a1@b2.cd";
    await wrapper.find("input[name=email]").setValue(email);
    expect(wrapper.vm.formData.email).toBe(email);
  });
});
