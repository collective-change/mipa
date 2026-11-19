import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import * as All from "quasar";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import PageModelDossier from "@/pages/PageModelDossier.vue";
import { DEFAULT_NODES_LIMIT } from "@/store/store-model";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

let countQueries = [];
let getDocsQueries = [];

vi.mock("@/boot/firebase", () => ({
  firebaseDb: {},
  firebaseFunctions: {}
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({ data: { actions: [] } }))
}));

const mockGetCountFromServer = vi.fn(async (q) => {
  countQueries.push(q);
  return {
    data: () => ({ count: 120 })
  };
});

const mockGetDocs = vi.fn(async (q) => {
  getDocsQueries.push(q);
  const isLimited = q?.type === "query" && q?.constraints?.some((c) => c.type === "limit");
  const count = isLimited ? 50 : 120;
  const docs = Array.from({ length: count }, (_, i) => ({
    id: `node-${i + 1}`,
    data: () => ({
      symbol: `F${i + 1}`,
      name: `Factor ${i + 1}`,
      initialValue: (i + 1) * 10,
      units: "units"
    })
  }));
  return { docs };
});

vi.mock("firebase/firestore", () => {
  return {
    doc: vi.fn((_db, ...parts) => ({ type: "doc", path: parts.join("/") })),
    getDoc: vi.fn(async () => ({
      exists: () => true,
      id: "model-dossier-test",
      data: () => ({
        name: "Community Health Surge Model",
        description: "Public health resource allocation simulation."
      })
    })),
    collection: vi.fn((_db, ...parts) => ({ type: "collection", path: parts.join("/") })),
    limit: vi.fn((n) => ({ type: "limit", limit: n })),
    query: vi.fn((col, ...constraints) => ({
      type: "query",
      col,
      constraints
    })),
    getCountFromServer: (...args) => mockGetCountFromServer(...args),
    getDocs: (...args) => mockGetDocs(...args)
  };
});

function mountDossier(locale = "en-us") {
  return mount(PageModelDossier, {
    global: {
      plugins: [
        [Quasar, { components }],
        createI18n({ legacy: true, locale, messages })
      ],
      mocks: {
        $route: { params: { modelId: "model-dossier-test" } }
      },
      stubs: {
        "q-page": { template: "<div class='q-page'><slot /></div>" },
        "q-slider": { props: ["modelValue"], template: "<input type='range' class='q-slider' />" },
        "q-table": { props: ["rows", "columns"], template: "<div class='q-table' />" }
      }
    }
  });
}

describe("MIPA-38: Bounded Public Model Dossier Nodes Query", () => {
  beforeEach(() => {
    countQueries = [];
    getDocsQueries = [];
    vi.clearAllMocks();
    mockGetCountFromServer.mockImplementation(async (q) => {
      countQueries.push(q);
      return {
        data: () => ({ count: 120 })
      };
    });
    mockGetDocs.mockImplementation(async (q) => {
      getDocsQueries.push(q);
      const isLimited = q?.type === "query" && q?.constraints?.some((c) => c.type === "limit");
      const count = isLimited ? 50 : 120;
      const docs = Array.from({ length: count }, (_, i) => ({
        id: `node-${i + 1}`,
        data: () => ({
          symbol: `F${i + 1}`,
          name: `Factor ${i + 1}`,
          initialValue: (i + 1) * 10,
          units: "units"
        })
      }));
      return { docs };
    });
  });

  it("exports and uses DEFAULT_NODES_LIMIT as 50", () => {
    expect(DEFAULT_NODES_LIMIT).toBe(50);
  });

  it("fetchNodes(false) bounds query to DEFAULT_NODES_LIMIT and calls getCountFromServer", async () => {
    const wrapper = mountDossier("en-us");
    await flushPromises();

    // Verify count query was issued to retrieve total node count
    expect(countQueries).toHaveLength(1);
    expect(wrapper.vm.nodesTotalCount).toBe(120);

    // Verify initial getDocs was bounded with limit(50)
    expect(getDocsQueries).toHaveLength(1);
    const initialQuery = getDocsQueries[0];
    expect(initialQuery.type).toBe("query");
    const limitConstraint = initialQuery.constraints.find((c) => c.type === "limit");
    expect(limitConstraint).toBeDefined();
    expect(limitConstraint.limit).toBe(50);

    // Verify rawNodes is bounded to 50
    expect(wrapper.vm.rawNodes).toHaveLength(50);
    expect(wrapper.vm.isPartialView).toBe(true);
    expect(wrapper.vm.showingAllNodes).toBe(false);

    // Verify partial view banner and metric counter reflect 50 / 120
    const text = wrapper.text();
    expect(text).toContain("50 / 120");
    expect(text).toContain("partial");
    expect(text).toContain("Showing 50 of 120 factors");
    expect(text).toContain("Large models are bounded to protect browser performance and network usage.");
    expect(text).toContain("Load all 120 factors");
  });

  it("loadAllNodes() removes the limit bound and fetches all factors", async () => {
    const wrapper = mountDossier("en-us");
    await flushPromises();

    expect(wrapper.vm.isPartialView).toBe(true);
    expect(wrapper.vm.rawNodes).toHaveLength(50);

    // User triggers "Load all 120 factors"
    await wrapper.vm.loadAllNodes();
    await flushPromises();

    // Verify second getDocs was issued without limit
    expect(getDocsQueries).toHaveLength(2);
    const secondQuery = getDocsQueries[1];
    expect(secondQuery.type).toBe("collection");

    // All nodes loaded
    expect(wrapper.vm.rawNodes).toHaveLength(120);
    expect(wrapper.vm.showingAllNodes).toBe(true);
    expect(wrapper.vm.isPartialView).toBe(false);

    // Partial view banner disappears and metrics show total
    const text = wrapper.text();
    expect(text).not.toContain("Showing 50 of 120 factors");
    expect(wrapper.vm.dossier.factorsCount).toBe(120);
  });

  it("handles models with fewer than 50 factors without partial view banner", async () => {
    mockGetCountFromServer.mockImplementationOnce(async (q) => {
      countQueries.push(q);
      return { data: () => ({ count: 15 }) };
    });
    mockGetDocs.mockImplementationOnce(async (q) => {
      getDocsQueries.push(q);
      return {
        docs: Array.from({ length: 15 }, (_, i) => ({
          id: `node-${i + 1}`,
          data: () => ({
            symbol: `F${i + 1}`,
            name: `Factor ${i + 1}`,
            initialValue: 10,
            units: "units"
          })
        }))
      };
    });

    const wrapper = mountDossier("en-us");
    await flushPromises();

    expect(wrapper.vm.nodesTotalCount).toBe(15);
    expect(wrapper.vm.rawNodes).toHaveLength(15);
    expect(wrapper.vm.isPartialView).toBe(false);

    const text = wrapper.text();
    expect(text).not.toContain("partial");
    expect(text).not.toContain("Showing 15 of 15 factors");
  });

  it("gracefully tolerates count query failure without breaking the dossier view", async () => {
    mockGetCountFromServer.mockImplementationOnce(async () => {
      throw new Error("permission-denied");
    });
    mockGetDocs.mockImplementationOnce(async (q) => {
      getDocsQueries.push(q);
      return {
        docs: [
          {
            id: "node-1",
            data: () => ({ symbol: "F1", name: "Factor 1", initialValue: 10, units: "units" })
          }
        ]
      };
    });

    const wrapper = mountDossier("en-us");
    await flushPromises();

    expect(wrapper.vm.nodesTotalCount).toBeNull();
    expect(wrapper.vm.rawNodes).toHaveLength(1);
    expect(wrapper.vm.isPartialView).toBe(false);
    expect(wrapper.vm.dossier.factorsCount).toBe(1);
  });
});
