import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createStore } from "vuex";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import AddNode from "@/components/Model/Modals/AddNode.vue";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

function mountAddNode(existingNodes = []) {
  const actions = {
    addNode: vi.fn(),
  };
  const store = createStore({
    modules: {
      model: {
        namespaced: true,
        state: { nodes: existingNodes },
        actions,
      },
    },
  });
  const wrapper = mount(AddNode, {
    props: { sourceNodeId: "", newNodeRole: "" },
    global: {
      plugins: [
        [Quasar, { components, directives: { ClosePopup: All.ClosePopup } }],
        store,
        createI18n({ legacy: true, locale: "en-us", messages }),
      ],
      mocks: {
        $route: { params: { modelId: "test-model-1" } },
      },
    },
  });
  return { wrapper, actions };
}

describe("AddNode.vue", () => {
  it("auto-populates ASCII symbol from English factor name", async () => {
    const { wrapper } = mountAddNode();
    wrapper.vm.onNameUpdated("Volunteer Hours");
    expect(wrapper.vm.nodeToSubmit.name).toBe("Volunteer Hours");
    expect(wrapper.vm.nodeToSubmit.symbol).toBe("volunteerHours");
  });

  it("does not auto-populate Chinese characters into symbol", async () => {
    const { wrapper } = mountAddNode();
    wrapper.vm.onNameUpdated("志工招募人數");
    expect(wrapper.vm.nodeToSubmit.name).toBe("志工招募人數");
    expect(wrapper.vm.nodeToSubmit.symbol).toBe("");
  });

  it("preserves manual user edits to symbol", async () => {
    const { wrapper } = mountAddNode();
    wrapper.vm.symbolTouched = true;
    wrapper.vm.nodeToSubmit.symbol = "volunteerCount";
    wrapper.vm.onNameUpdated("志工招募人數");
    expect(wrapper.vm.nodeToSubmit.name).toBe("志工招募人數");
    expect(wrapper.vm.nodeToSubmit.symbol).toBe("volunteerCount");
  });

  it("validates symbol uniqueness against existing factors in model", () => {
    const { wrapper } = mountAddNode([{ id: "node1", symbol: "loavesSold" }]);
    expect(wrapper.vm.isSymbolUnique("loavesSold")).toBe(false);
    expect(wrapper.vm.isSymbolUnique("volunteerHours")).toBe(true);
  });

  it("validates alphanumeric ASCII symbols", () => {
    const { wrapper } = mountAddNode();
    expect(wrapper.vm.isAlphanumeric("validSymbol123")).toBe(true);
    expect(wrapper.vm.isAlphanumeric("valid_symbol")).toBe(true);
    expect(wrapper.vm.isAlphanumeric("志工招募")).toBe(false);
    expect(wrapper.vm.isAlphanumeric("has space")).toBe(false);
    expect(wrapper.vm.isAlphanumeric("has-dash")).toBe(false);
  });
});
