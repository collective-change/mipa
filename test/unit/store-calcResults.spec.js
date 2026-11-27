import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStore } from "vuex";

const mockSaveBaseline = vi.fn();
const mockGetBaseline = vi.fn();
const mockGetResultsOfAction = vi.fn();

vi.mock("@/api/idb", () => ({
  default: {
    saveBaseline: (...args) => mockSaveBaseline(...args),
    getBaseline: (...args) => mockGetBaseline(...args),
    getResultsOfAction: (...args) => mockGetResultsOfAction(...args)
  }
}));

const calcResultsModule = (await import("@/store/store-calcResults")).default;

function makeTestStore() {
  return createStore({
    modules: {
      calcResults: {
        ...calcResultsModule,
        state: () => ({
          baseline: {},
          resultsOfAction: {}
        })
      }
    }
  });
}

describe("store-calcResults characterization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with empty baseline and resultsOfAction objects", () => {
    const store = makeTestStore();
    expect(store.state.calcResults.baseline).toEqual({});
    expect(store.state.calcResults.resultsOfAction).toEqual({});
  });

  it("saveBaseline persists baseline via idb.saveBaseline", async () => {
    const store = makeTestStore();
    mockSaveBaseline.mockResolvedValueOnce(undefined);
    const sampleBaseline = { modelId: "m1", timeSPoints: [0, 1], nodesValues: { n1: [10, 20] } };

    await store.dispatch("calcResults/saveBaseline", sampleBaseline);
    expect(mockSaveBaseline).toHaveBeenCalledTimes(1);
    expect(mockSaveBaseline).toHaveBeenCalledWith(sampleBaseline);
  });

  it("loadBaseline loads baseline from idb into state", async () => {
    const store = makeTestStore();
    const storedBaseline = { modelId: "m1", timeSPoints: [0, 1], nodesValues: { n1: [5, 8] } };
    mockGetBaseline.mockResolvedValueOnce(storedBaseline);

    await store.dispatch("calcResults/loadBaseline", "m1");
    expect(mockGetBaseline).toHaveBeenCalledWith("m1");
    expect(store.state.calcResults.baseline).toEqual(storedBaseline);
  });

  it("loadResultsOfAction loads action simulation results and clearResultsOfAction resets them", async () => {
    const store = makeTestStore();
    const storedBaseline = { modelId: "m1", timeSPoints: [0] };
    const storedActionResults = {
      id: "act1",
      timeSPoints: [0, 1],
      ifDoneNodesValues: { n1: [12, 15] }
    };
    mockGetBaseline.mockResolvedValueOnce(storedBaseline);
    mockGetResultsOfAction.mockResolvedValueOnce(storedActionResults);

    await store.dispatch("calcResults/loadBaseline", "m1");
    await store.dispatch("calcResults/loadResultsOfAction", "act1");

    expect(mockGetResultsOfAction).toHaveBeenCalledWith("act1");
    expect(store.state.calcResults.resultsOfAction).toEqual(storedActionResults);

    await store.dispatch("calcResults/clearResultsOfAction", "act1");
    expect(store.state.calcResults.resultsOfAction).toEqual({});
    expect(store.state.calcResults.baseline).toEqual(storedBaseline);
  });
});
