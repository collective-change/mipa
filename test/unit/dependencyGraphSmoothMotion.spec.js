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

function mountDependencyGraphWithGroups({ nodes = [], links = [], nodeGroups = [], expandedNodeGroups = [] } = {}) {
  let expandedState = [...expandedNodeGroups];

  const store = createStore({
    modules: {
      auth: {
        namespaced: true,
        state: { loggedIn: true, user: { email: "tester@example.com" } }
      },
      model: {
        namespaced: true,
        state: {
          currentModel: {
            id: "m_test",
            name: "Test System Dynamics Model",
            nodeGroups
          },
          nodes,
          links,
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
          selectedNodeId: null,
          selectedNodeGroupId: null,
          expandedNodeGroups: expandedState,
          uiNodeChanged: false,
          uiNodeChangedFields: []
        },
        getters: {
          selectedNodeId: (state) => state.selectedNodeId,
          selectedNodeGroupId: (state) => state.selectedNodeGroupId,
          expandedNodeGroups: (state) => state.expandedNodeGroups
        },
        mutations: {
          setSelectedNodeId: (state, val) => {
            state.selectedNodeId = val;
          },
          setSelectedNodeGroupId: (state, val) => {
            state.selectedNodeGroupId = val;
          },
          setExpandedNodeGroups: (state, val) => {
            state.expandedNodeGroups = val;
          }
        }
      }
    }
  });

  return mount(DependencyGraph, {
    props: {
      initialCirclePositions: [],
      readOnly: false
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

describe("MIPA-21: Smoother Node-Group Collapse & Expand Motion (Issue #53)", () => {
  it("preserves untouched graph layout and steady-state force parameters", () => {
    const nodes = [
      { id: "n1", name: "Factor 1", class: "normal", symbolFormula: "10" },
      { id: "n2", name: "Factor 2", class: "normal", symbolFormula: "n1 * 2" },
      { id: "n3", name: "Factor 3", class: "normal", symbolFormula: "n2 + 5" }
    ];
    const links = [
      { source: "n1", target: "n2", isBlocking: false, isUnused: false, strengthFactor: 1 },
      { source: "n2", target: "n3", isBlocking: false, isUnused: false, strengthFactor: 1 }
    ];

    const wrapper = mountDependencyGraphWithGroups({ nodes, links });
    const vm = wrapper.vm;

    // Verify steady-state force defaults match expectations
    expect(vm.forceProperties.charge.strength).toBe(-200);
    expect(vm.forceProperties.gravity.strength).toBe(80);
    expect(vm.forceProperties.collide.strength).toBe(0.7);
    expect(vm.forceProperties.link.distance).toBe(90);

    // Initial simulation runs without progressive ramping interfering with untouched steady-state
    expect(vm.isRampingForces).toBe(false);
  });

  it("starts D3 forces very small and raises them gradually when collapsing a node group", async () => {
    const nodes = [
      { id: "g_child_1", name: "Direct Cost A", class: "normal", symbolFormula: "100" },
      { id: "g_child_2", name: "Direct Cost B", class: "normal", symbolFormula: "200" },
      { id: "outside_1", name: "Community Benefit", class: "normal", symbolFormula: "500" },
      { id: "outside_2", name: "Public Awareness", class: "normal", symbolFormula: "80" }
    ];
    const links = [
      { source: "g_child_1", target: "g_child_2", strengthFactor: 1 },
      { source: "g_child_2", target: "outside_1", strengthFactor: 1 },
      { source: "outside_2", target: "outside_1", strengthFactor: 1 }
    ];
    const nodeGroups = [
      { id: "group_costs", name: "Direct Costs Group", nodeIds: ["g_child_1", "g_child_2"] }
    ];

    // Start with group expanded centered on canvas (400, 300)
    const wrapper = mountDependencyGraphWithGroups({
      nodes,
      links,
      nodeGroups,
      expandedNodeGroups: ["group_costs"]
    });
    const vm = wrapper.vm;

    // Manually position nodes initially to simulate a settled state centered on canvas
    const d3Nodes = vm.d3Data.nodes;
    const nChild1 = d3Nodes.find((n) => n.id === "g_child_1");
    const nChild2 = d3Nodes.find((n) => n.id === "g_child_2");
    const nOutside1 = d3Nodes.find((n) => n.id === "outside_1");
    const nOutside2 = d3Nodes.find((n) => n.id === "outside_2");

    if (nChild1) { nChild1.x = 320; nChild1.y = 300; }
    if (nChild2) { nChild2.x = 380; nChild2.y = 300; }
    if (nOutside1) { nOutside1.x = 480; nOutside1.y = 300; }
    if (nOutside2) { nOutside2.x = 420; nOutside2.y = 420; }

    const outside1PosBefore = { x: nOutside1.x, y: nOutside1.y };
    const outside2PosBefore = { x: nOutside2.x, y: nOutside2.y };

    // Trigger collapse: update expandedNodeGroups to []
    vm.$store.commit("ui/setExpandedNodeGroups", []);
    await vm.$nextTick();

    // Verify group toggle activated smooth force ramping
    expect(vm.isRampingForces).toBe(true);
    expect(vm.iterationCount).toBe(0);

    // Stop autonomous timer so we can step tick-by-tick deterministically
    vm.simulation.stop();

    // Step 1: initial tick should have small forces
    vm.tick();
    vm.simulation.tick();
    expect(vm.iterationCount).toBe(1);

    // Initial velocityDecay should be elevated (damping = 0.35, preventing high velocities)
    expect(vm.simulation.velocityDecay()).toBeGreaterThan(0.3);

    // Step through the 50-tick smooth ramp
    for (let i = vm.iterationCount; i <= 55; i++) {
      vm.tick();
      vm.simulation.tick();
    }

    // After 50 ticks, forces have smoothly ramped to full strength
    expect(vm.isRampingForces).toBe(false);
    expect(vm.simulation.velocityDecay()).toBeCloseTo(0.1, 1);

    // Let the simulation settle to rest
    for (let i = 0; i < 40; i++) {
      vm.tick();
      vm.simulation.tick();
    }

    const nOutside1After = vm.d3Data.nodes.find((n) => n.id === "outside_1");
    const nOutside2After = vm.d3Data.nodes.find((n) => n.id === "outside_2");

    const displacementOutside1 = Math.hypot(nOutside1After.x - outside1PosBefore.x, nOutside1After.y - outside1PosBefore.y);
    const displacementOutside2 = Math.hypot(nOutside2After.x - outside2PosBefore.x, nOutside2After.y - outside2PosBefore.y);

    // Evidence coordinates recorded
    console.log(`[Evidence Collapse] outside_1 before: (${outside1PosBefore.x}, ${outside1PosBefore.y}), after: (${nOutside1After.x.toFixed(1)}, ${nOutside1After.y.toFixed(1)}), displacement: ${displacementOutside1.toFixed(2)}px`);
    console.log(`[Evidence Collapse] outside_2 before: (${outside2PosBefore.x}, ${outside2PosBefore.y}), after: (${nOutside2After.x.toFixed(1)}, ${nOutside2After.y.toFixed(1)}), displacement: ${displacementOutside2.toFixed(2)}px`);

    // Verify nodes remained close to initial positions and did not fly across the canvas
    expect(displacementOutside1).toBeLessThan(50);
    expect(displacementOutside2).toBeLessThan(70);

    // Collapsed group node should settle near the centroid of children (350, 300)
    const groupNode = vm.d3Data.nodes.find((n) => n.id === "group_costs");
    expect(groupNode).toBeDefined();
    expect(Math.abs(groupNode.x - 350)).toBeLessThan(35);
    expect(Math.abs(groupNode.y - 300)).toBeLessThan(60);
  });

  it("smoothly expands a node group without nodes flying across canvas", async () => {
    const nodes = [
      { id: "g_child_1", name: "Direct Cost A", class: "normal", symbolFormula: "100" },
      { id: "g_child_2", name: "Direct Cost B", class: "normal", symbolFormula: "200" },
      { id: "outside_1", name: "Community Benefit", class: "normal", symbolFormula: "500" }
    ];
    const links = [
      { source: "g_child_1", target: "g_child_2", strengthFactor: 1 },
      { source: "g_child_2", target: "outside_1", strengthFactor: 1 }
    ];
    const nodeGroups = [
      { id: "group_costs", name: "Direct Costs Group", nodeIds: ["g_child_1", "g_child_2"] }
    ];

    // Start with group collapsed
    const wrapper = mountDependencyGraphWithGroups({
      nodes,
      links,
      nodeGroups,
      expandedNodeGroups: []
    });
    const vm = wrapper.vm;

    // Find group node and place centered on canvas (350, 300), outside node at (450, 300)
    const groupNode = vm.d3Data.nodes.find((n) => n.id === "group_costs");
    const outsideNode = vm.d3Data.nodes.find((n) => n.id === "outside_1");
    if (groupNode) { groupNode.x = 350; groupNode.y = 300; }
    if (outsideNode) { outsideNode.x = 450; outsideNode.y = 300; }

    const outsidePosBefore = { x: outsideNode.x, y: outsideNode.y };

    // Trigger expand
    vm.$store.commit("ui/setExpandedNodeGroups", ["group_costs"]);
    await vm.$nextTick();

    expect(vm.isRampingForces).toBe(true);
    vm.simulation.stop();

    // Check newly entered constituent nodes are placed near group position with 0 initial velocity
    const nChild1 = vm.d3Data.nodes.find((n) => n.id === "g_child_1");
    const nChild2 = vm.d3Data.nodes.find((n) => n.id === "g_child_2");
    expect(nChild1).toBeDefined();
    expect(nChild2).toBeDefined();
    expect(nChild1.vx).toBe(0);
    expect(nChild1.vy).toBe(0);
    expect(nChild2.vx).toBe(0);
    expect(nChild2.vy).toBe(0);

    // Initial positions must be in a gentle symmetrical radius around group centroid (350, 300)
    expect(Math.hypot(nChild1.x - 350, nChild1.y - 300)).toBeLessThan(25);
    expect(Math.hypot(nChild2.x - 350, nChild2.y - 300)).toBeLessThan(25);

    // Step through simulation
    for (let i = 0; i < 90; i++) {
      vm.tick();
      vm.simulation.tick();
    }

    const outsideNodeAfter = vm.d3Data.nodes.find((n) => n.id === "outside_1");
    const displacement = Math.hypot(outsideNodeAfter.x - outsidePosBefore.x, outsideNodeAfter.y - outsidePosBefore.y);

    console.log(`[Evidence Expand] outside_1 before: (${outsidePosBefore.x}, ${outsidePosBefore.y}), after: (${outsideNodeAfter.x.toFixed(1)}, ${outsideNodeAfter.y.toFixed(1)}), displacement: ${displacement.toFixed(2)}px`);
    console.log(`[Evidence Expand] g_child_1 settled: (${nChild1.x.toFixed(1)}, ${nChild1.y.toFixed(1)}), g_child_2 settled: (${nChild2.x.toFixed(1)}, ${nChild2.y.toFixed(1)})`);

    // Verify outside node stayed close to its position (< 30px) and didn't fly across canvas
    expect(displacement).toBeLessThan(30);

    // Constituent nodes settled with healthy separation
    const childDistance = Math.hypot(nChild1.x - nChild2.x, nChild1.y - nChild2.y);
    expect(childDistance).toBeGreaterThan(40);
  });
});
