import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createPinia, setActivePinia } from "pinia";
import { useOrgsStore } from "@/store/store-orgs";
import { useModelStore } from "@/store/store-model";
import { useActionsStore } from "@/store/store-actions";
import { useUiStore } from "@/store/store-ui";
import { useAdHocDocsStore } from "@/store/store-adHocDocs";
import { useCalcResultsStore } from "@/store/store-calcResults";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import PageModel from "@/pages/PageModel.vue";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

// Mock Firebase auth
let mockCurrentUser = { uid: "user-member-1", email: "member@mipa-ops.org" };
vi.mock("@/boot/firebase", () => ({
  firebaseAuth: {
    get currentUser() {
      return mockCurrentUser;
    }
  },
  firebaseDb: {},
  firebaseApp: {}
}));

vi.mock("@/api/idb", () => ({
  default: {
    getDependencyGraphDisplay: vi.fn().mockResolvedValue(null)
  }
}));

function createTestI18n(locale = "en-us") {
  return createI18n({
    legacy: false,
    locale,
    fallbackLocale: "en-us",
    messages
  });
}

function createTestStore({ currentModel = null, currentOrg = null, userOrgs = [], nodes = [] } = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);

  const orgs = useOrgsStore(pinia);
  orgs.$patch({ currentOrg, orgs: userOrgs });
  orgs.bindCurrentOrg = vi.fn().mockResolvedValue(currentOrg);

  const model = useModelStore(pinia);
  model.$patch({
    currentModel,
    nodes,
    nodesTotalCount: nodes.length,
    nodesLimit: 50
  });
  model.bindCurrentModel = vi.fn().mockResolvedValue(currentModel);
  model.bindNodes = vi.fn().mockResolvedValue(nodes);

  useActionsStore(pinia).$patch({ actions: [] });

  const ui = useUiStore(pinia);
  ui.$patch({
    uiNodeChanged: false,
    uiNodeChangedFields: [],
    selectedNodeId: null,
    selectedNodeGroupId: null,
    expandedNodeGroups: []
  });
  ui.setExpandedNodeGroups = vi.fn();
  ui.setSelectedNodeGroupId = vi.fn();

  useAdHocDocsStore(pinia).bindExchangeRates = vi.fn();
  useCalcResultsStore(pinia).loadBaseline = vi.fn();

  return pinia;
}

describe("MIPA-51: PageModel org-level viewer and access guardrails", () => {
  beforeEach(() => {
    mockCurrentUser = { uid: "user-member-1", email: "member@mipa-ops.org" };
  });

  it("correctly identifies org-level viewer via viewers.org array", async () => {
    const store = createTestStore({
      currentOrg: {
        id: "org-mipa-ops",
        name: "Mipa Ops",
        users: ["user-admin-1", "user-member-1"]
      },
      currentModel: {
        id: "model-main",
        name: "Main",
        isPublic: false,
        owners: { users: ["user-admin-1"] },
        editors: { users: ["user-admin-1"] },
        viewers: {
          org: ["org-mipa-ops"]
        }
      }
    });

    const wrapper = mount(PageModel, {
      global: {
        plugins: [[Quasar, { components }], store, createTestI18n()],
        directives: { ClosePopup: {} },
        mocks: {
          $route: { params: { orgId: "org-mipa-ops", modelId: "model-main" } }
        },
        stubs: {
          "q-page": { template: "<div class='q-page'><slot /></div>" },
          "calculator-ui": { template: "<div class='calc-ui'></div>" },
          "export-calc-results": { template: "<div class='export-ui'></div>" },
          "dependency-graph": { template: "<div class='dependency-graph'></div>" },
          "node-summary": { template: "<div class='node-summary'></div>" },
          "getting-started": { template: "<div class='getting-started'></div>" },
          "config-org-model": true,
          "add-node": true,
          "draft-model-dialog": true,
          "ingest-data-dialog": true,
          "model-snapshots-modal": true,
          "system-dynamics-modal": true,
          "model-template-library-modal": true,
          "onboarding-tour-modal": true,
          "custom-variables-modal": true
        }
      }
    });

    wrapper.setData({ modelLoading: false });
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.isEditor).toBe(false);
    expect(wrapper.vm.isViewer).toBe(true);
    expect(wrapper.vm.hasAccess).toBe(true);
    expect(wrapper.vm.isReadOnly).toBe(true);
    expect(wrapper.find("[data-testid='no-model-access']").exists()).toBe(false);
    expect(wrapper.find(".q-banner").text()).toContain("read-only stakeholder viewer");
  });

  it("identifies org-level viewer via viewers.org string format", async () => {
    const store = createTestStore({
      currentOrg: {
        id: "org-mipa-ops",
        name: "Mipa Ops",
        users: ["user-admin-1", "user-member-1"]
      },
      currentModel: {
        id: "model-main",
        name: "Main",
        isPublic: false,
        owners: { users: ["user-admin-1"] },
        editors: { users: ["user-admin-1"] },
        viewers: {
          org: "org-mipa-ops"
        }
      }
    });

    const wrapper = mount(PageModel, {
      global: {
        plugins: [[Quasar, { components }], store, createTestI18n()],
        directives: { ClosePopup: {} },
        mocks: {
          $route: { params: { orgId: "org-mipa-ops", modelId: "model-main" } }
        },
        stubs: {
          "q-page": { template: "<div class='q-page'><slot /></div>" },
          "calculator-ui": true,
          "export-calc-results": true,
          "dependency-graph": true,
          "node-summary": true,
          "getting-started": true
        }
      }
    });

    wrapper.setData({ modelLoading: false });
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.isViewer).toBe(true);
    expect(wrapper.vm.hasAccess).toBe(true);
    expect(wrapper.vm.isReadOnly).toBe(true);
  });

  it("identifies org-level viewer via store.state.orgs.orgs list", async () => {
    const store = createTestStore({
      currentOrg: null,
      userOrgs: [{ id: "org-mipa-ops", name: "Mipa Ops" }],
      currentModel: {
        id: "model-main",
        name: "Main",
        isPublic: false,
        owners: { users: ["user-admin-1"] },
        editors: { users: ["user-admin-1"] },
        viewers: {
          org: ["org-mipa-ops"]
        }
      }
    });

    const wrapper = mount(PageModel, {
      global: {
        plugins: [[Quasar, { components }], store, createTestI18n()],
        directives: { ClosePopup: {} },
        mocks: {
          $route: { params: { orgId: "org-mipa-ops", modelId: "model-main" } }
        },
        stubs: {
          "q-page": { template: "<div class='q-page'><slot /></div>" },
          "calculator-ui": true,
          "export-calc-results": true,
          "dependency-graph": true,
          "node-summary": true,
          "getting-started": true
        }
      }
    });

    wrapper.setData({ modelLoading: false });
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.isViewer).toBe(true);
    expect(wrapper.vm.hasAccess).toBe(true);
    expect(wrapper.vm.isReadOnly).toBe(true);
  });

  it("renders explicit 'no access' state for user with no access, without read-only banner or graph", async () => {
    mockCurrentUser = { uid: "stranger-uid", email: "stranger@unknown.com" };

    const store = createTestStore({
      currentOrg: {
        id: "org-other",
        name: "Other Org",
        users: ["stranger-uid"]
      },
      currentModel: {
        id: "model-private",
        name: "Secret Model",
        isPublic: false,
        owners: { users: ["user-admin-1"] },
        editors: { users: ["user-admin-1"] },
        viewers: {
          org: ["org-mipa-ops"]
        }
      }
    });

    const wrapper = mount(PageModel, {
      global: {
        plugins: [[Quasar, { components }], store, createTestI18n()],
        mocks: {
          $route: { params: { orgId: "org-other", modelId: "model-private" } }
        },
        stubs: {
          "q-page": { template: "<div class='q-page'><slot /></div>" },
          "calculator-ui": { template: "<div class='calc-ui'></div>" },
          "export-calc-results": { template: "<div class='export-ui'></div>" },
          "dependency-graph": { template: "<div class='dependency-graph'></div>" },
          "node-summary": { template: "<div class='node-summary'></div>" },
          "getting-started": { template: "<div class='getting-started'></div>" }
        }
      }
    });

    wrapper.setData({ modelLoading: false });
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.isEditor).toBe(false);
    expect(wrapper.vm.isViewer).toBe(false);
    expect(wrapper.vm.hasAccess).toBe(false);
    expect(wrapper.vm.isReadOnly).toBe(false);

    // Assert that the explicit No Access card is rendered
    const noAccessBox = wrapper.find("[data-testid='no-model-access']");
    expect(noAccessBox.exists()).toBe(true);
    expect(noAccessBox.text()).toContain("No Access to This Model");
    expect(noAccessBox.text()).toContain("Back to Organizations");

    // Assert that stakeholderViewerNotice banner and dependency-graph are NOT rendered
    expect(wrapper.find(".q-banner").exists()).toBe(false);
    expect(wrapper.find(".dependency-graph").exists()).toBe(false);
    expect(wrapper.find(".calc-ui").exists()).toBe(false);
  });
});
