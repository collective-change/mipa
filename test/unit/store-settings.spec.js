import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStore } from "vuex";

const mockSet = vi.fn();
const mockGetItem = vi.fn();

vi.mock("quasar", () => ({
  LocalStorage: {
    set: (...args) => mockSet(...args),
    getItem: (...args) => mockGetItem(...args)
  }
}));

const settingsModule = (await import("@/store/store-settings")).default;

function makeTestStore() {
  return createStore({
    modules: {
      settings: {
        ...settingsModule,
        state: () => ({
          settings: {
            show12HourTimeFormat: false,
            showTasksInOneList: false
          }
        })
      }
    }
  });
}

describe("store-settings characterization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes default settings in state and settings getter", () => {
    const store = makeTestStore();
    expect(store.state.settings.settings).toEqual({
      show12HourTimeFormat: false,
      showTasksInOneList: false
    });
    expect(store.getters["settings/settings"]).toEqual({
      show12HourTimeFormat: false,
      showTasksInOneList: false
    });
  });

  it("setShow12HourTimeFormat updates state and persists to LocalStorage", async () => {
    const store = makeTestStore();
    await store.dispatch("settings/setShow12HourTimeFormat", true);

    expect(store.state.settings.settings.show12HourTimeFormat).toBe(true);
    expect(mockSet).toHaveBeenCalledWith("settings", {
      show12HourTimeFormat: true,
      showTasksInOneList: false
    });
  });

  it("setShowTasksInOneList updates state and persists to LocalStorage", async () => {
    const store = makeTestStore();
    await store.dispatch("settings/setShowTasksInOneList", true);

    expect(store.state.settings.settings.showTasksInOneList).toBe(true);
    expect(mockSet).toHaveBeenCalledWith("settings", {
      show12HourTimeFormat: false,
      showTasksInOneList: true
    });
  });

  it("getSettings merges saved settings from LocalStorage when present and ignores null", async () => {
    const store = makeTestStore();
    mockGetItem.mockReturnValueOnce(null);
    await store.dispatch("settings/getSettings");
    expect(store.state.settings.settings).toEqual({
      show12HourTimeFormat: false,
      showTasksInOneList: false
    });

    mockGetItem.mockReturnValueOnce({
      show12HourTimeFormat: true,
      showTasksInOneList: true
    });
    await store.dispatch("settings/getSettings");
    expect(store.state.settings.settings).toEqual({
      show12HourTimeFormat: true,
      showTasksInOneList: true
    });
  });
});
