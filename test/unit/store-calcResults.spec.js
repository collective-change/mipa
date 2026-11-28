import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";

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

const { useCalcResultsStore } = await import("@/store/store-calcResults");

describe("store-calcResults (Pinia)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it("starts with empty baseline and resultsOfAction objects", () => {
    const store = useCalcResultsStore();
    expect(store.baseline).toEqual({});
    expect(store.resultsOfAction).toEqual({});
  });

  it("saveBaseline persists baseline via idb.saveBaseline", async () => {
    const store = useCalcResultsStore();
    mockSaveBaseline.mockResolvedValueOnce(undefined);
    const sampleBaseline = { modelId: "m1", timeSPoints: [0, 1], nodesValues: { n1: [10, 20] } };

    await store.saveBaseline(sampleBaseline);
    expect(mockSaveBaseline).toHaveBeenCalledTimes(1);
    expect(mockSaveBaseline).toHaveBeenCalledWith(sampleBaseline);
  });

  it("loadBaseline loads baseline from idb into state", async () => {
    const store = useCalcResultsStore();
    const storedBaseline = { modelId: "m1", timeSPoints: [0, 1], nodesValues: { n1: [5, 8] } };
    mockGetBaseline.mockResolvedValueOnce(storedBaseline);

    await store.loadBaseline("m1");
    expect(mockGetBaseline).toHaveBeenCalledWith("m1");
    expect(store.baseline).toEqual(storedBaseline);
  });

  it("loadResultsOfAction loads action simulation results and clearResultsOfAction resets them", async () => {
    const store = useCalcResultsStore();
    const storedBaseline = { modelId: "m1", timeSPoints: [0] };
    const storedActionResults = {
      id: "act1",
      timeSPoints: [0, 1],
      ifDoneNodesValues: { n1: [12, 15] }
    };
    mockGetBaseline.mockResolvedValueOnce(storedBaseline);
    mockGetResultsOfAction.mockResolvedValueOnce(storedActionResults);

    await store.loadBaseline("m1");
    await store.loadResultsOfAction("act1");

    expect(mockGetResultsOfAction).toHaveBeenCalledWith("act1");
    expect(store.resultsOfAction).toEqual(storedActionResults);

    store.clearResultsOfAction();
    expect(store.resultsOfAction).toEqual({});
    expect(store.baseline).toEqual(storedBaseline);
  });
});
