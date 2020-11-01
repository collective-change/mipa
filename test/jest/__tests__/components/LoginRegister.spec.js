import { mount, createLocalVue, shallowMount } from "@vue/test-utils";
import Vuex from "vuex";
import LoginRegister from "src/components/Auth/LoginRegister.vue";
import authStore from "src/store/store-auth";
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
  localVue.use(Vuex);
  const store = new Vuex.Store();

  const wrapper = mount(LoginRegister, {
    localVue,
    authStore,
    propsData: { tab: "login" }
  });
  const vm = wrapper.vm;

  it("has a submitForm method", () => {
    expect(typeof vm.submitForm).toBe("function");
  });

  it("uses title case on tab name", () => {
    const tabName = wrapper.find(".tabName").text();
    expect(tabName).toBe("Login");
  });

  it("accepts email input", async () => {
    const email = "a1@b2.cd";
    await wrapper.find("input[name=email]").setValue(email);
    expect(wrapper.vm.formData.email).toBe(email);
  });

  it("can submit the form", async () => {
    const email = "a1@b2.cd";
    const password = "TestPassword#1";
    const loginUserSpy = jest.spyOn(LoginRegister.methods, "loginUser");
    const wrapper = mount(LoginRegister, {
      localVue,
      propsData: { tab: "login" }
    });
    await wrapper.find("input[name=email]").setValue(email);
    await wrapper.find("input[name=password]").setValue(password);
    await wrapper.find("form").trigger("submit.prevent");
    expect(loginUserSpy).toHaveBeenCalled();
  });
});
