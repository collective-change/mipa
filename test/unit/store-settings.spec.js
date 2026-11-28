import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const mockSet = vi.fn();
const mockGetItem = vi.fn();

vi.mock("quasar", () => ({
  LocalStorage: {
    set: (...args) => mockSet(...args),
    getItem: (...args) => mockGetItem(...args)
  }
}));

const { useSettingsStore } = await import("@/store/store-settings");

describe("store-settings (Pinia)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it("exposes default settings in state", () => {
    const store = useSettingsStore();
    expect(store.settings).toEqual({
      show12HourTimeFormat: false,
      showTasksInOneList: false
    });
  });

  it("setShow12HourTimeFormat updates state and persists to LocalStorage", () => {
    const store = useSettingsStore();
    store.setShow12HourTimeFormat(true);

    expect(store.settings.show12HourTimeFormat).toBe(true);
    expect(mockSet).toHaveBeenCalledWith("settings", {
      show12HourTimeFormat: true,
      showTasksInOneList: false
    });
  });

  it("setShowTasksInOneList updates state and persists to LocalStorage", () => {
    const store = useSettingsStore();
    store.setShowTasksInOneList(true);

    expect(store.settings.showTasksInOneList).toBe(true);
    expect(mockSet).toHaveBeenCalledWith("settings", {
      show12HourTimeFormat: false,
      showTasksInOneList: true
    });
  });

  it("getSettings merges saved settings from LocalStorage when present and ignores null", () => {
    const store = useSettingsStore();
    mockGetItem.mockReturnValueOnce(null);
    store.getSettings();
    expect(store.settings).toEqual({
      show12HourTimeFormat: false,
      showTasksInOneList: false
    });

    mockGetItem.mockReturnValueOnce({
      show12HourTimeFormat: true,
      showTasksInOneList: true
    });
    store.getSettings();
    expect(store.settings).toEqual({
      show12HourTimeFormat: true,
      showTasksInOneList: true
    });
  });
});
