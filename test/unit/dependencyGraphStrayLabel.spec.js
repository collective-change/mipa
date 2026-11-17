import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createStore } from "vuex";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import DependencyGraph from "@/components/Model/DependencyGraph.vue";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

function mountDependencyGraph(nodes = [], initialPositions = []) {
  const store = createStore({
    modules: {
      auth: {
        namespaced: true,
        state: { loggedIn: true }
      },
      model: {
        namespaced: true,
        state: {
          currentModel: { id: "m1", name: "Model 1", nodeGroups: [] },
          nodes,
          links: [],
          selectedNodeId: null
        },
        getters: {
          currentModel: (state) => state.currentModel,
          nodes: (state) => state.nodes,
          links: (state) => state.links,
          selectedNodeId: (state) => state.selectedNodeId
        },
        actions: {
          addLink: () => {},
          deleteLink: () => {},
          relaxLink: () => {},
          relaxLinkMore: () => {},
          restoreLinkForce: () => {},
          createNodeGroup: () => {},
          addToNodeGroup: () => {},
          removeNodeFromGroup: () => {},
          disbandNodeGroup: () => {}
        }
      },
      ui: {
        namespaced: true,
        state: {
          selectedNodeGroupId: null
        },
        getters: {
          selectedNodeGroupId: (state) => state.selectedNodeGroupId
        },
        mutations: {
          setSelectedNodeGroupId: () => {}
        }
      }
    }
  });

  return mount(DependencyGraph, {
    props: {
      initialCirclePositions: initialPositions
    },
    global: {
      plugins: [
        [Quasar, { components }],
        store,
        createI18n({ legacy: true, locale: "en-us", messages })
      ],
      stubs: {
        "add-node": true,
        "delete-node": true,
        "add-link": true
      }
    }
  });
}

describe("DependencyGraph Stray Node Label & Clipping (MIPA-7)", () => {
  it("ensures SVG has overflow: hidden so content cannot bleed outside graph bounds", () => {
    const wrapper = mountDependencyGraph();
    const svg = wrapper.find("svg#dependencyGraph");
    expect(svg.exists()).toBe(true);
    expect(svg.attributes("style")).toContain("overflow: hidden");
  });

  it("applies offscreen transform and zero opacity to unpositioned nodes in updateNodeClassAndText", () => {
    const wrapper = mountDependencyGraph();
    const vm = wrapper.vm;

    // Simulate nodes without x, y (e.g. before simulation or calculation runs)
    vm.d3Data = {
      nodes: [
        { id: "n1", name: "Meals served per month", class: "unlinked", symbolFormula: "100" },
        { id: "n2", name: "Volunteers", class: "unlinked", symbolFormula: "40", x: 120, y: 150 }
      ],
      links: []
    };

    vm.updateNodeClassAndText(false);

    const texts = vm.selections.graph.selectAll("text").nodes();
    expect(texts.length).toBe(2);

    // Unpositioned node n1 must not be drawn at (0, 0)
    const n1Text = texts[0];
    expect(n1Text.getAttribute("transform")).toBe("translate(-9999,-9999)");
    expect(n1Text.style.opacity).toBe("0");

    // Positioned node n2 must be drawn at its defined coordinates
    const n2Text = texts[1];
    expect(n2Text.getAttribute("transform")).toBe("translate(120,150)");
    expect(n2Text.style.opacity).toBe("1");
  });
});
