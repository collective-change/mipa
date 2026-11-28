import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createPinia, setActivePinia } from "pinia";
import { useAdHocDocsStore } from "@/store/store-adHocDocs";
import { useOrgsStore } from "@/store/store-orgs";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import ModalOrgCurrency, {
  PRIORITY_CURRENCIES,
  FALLBACK_CURRENCIES,
  getOrderedCurrencies,
  filterCurrencyOptions
} from "@/components/Orgs/Modals/Shared/ModalOrgCurrency.vue";
import AddOrg from "@/components/Orgs/Modals/AddOrg.vue";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

function createTestI18n(locale = "en-us") {
  return createI18n({
    legacy: false,
    locale,
    fallbackLocale: "en-us",
    messages
  });
}

function createTestStore(exchangeRates = null) {
  const store = createPinia();
  setActivePinia(store);
  useAdHocDocsStore(store).$patch({
    exchangeRates: exchangeRates || {
      rates: {
        USD: 1,
        TWD: 32,
        EUR: 0.85,
        GBP: 0.75,
        JPY: 150,
        CNY: 7.2,
        CAD: 1.35,
        AUD: 1.5,
        CHF: 0.9,
        HKD: 7.8,
        SGD: 1.3,
        AED: 3.67,
        AFN: 70,
        ALL: 95,
        ZWL: 300
      }
    }
  });
  useOrgsStore(store).addOrg = () => Promise.resolve();
  return store;
}

describe("MIPA-17: ModalOrgCurrency & Filterable Currency Selection", () => {
  describe("getOrderedCurrencies helper", () => {
    it("orders priority currencies first (USD, TWD, EUR...), then remaining alphabetically", () => {
      const mockRates = {
        ZWL: 1,
        ALL: 1,
        EUR: 1,
        USD: 1,
        AED: 1,
        TWD: 1,
        AFN: 1
      };
      const ordered = getOrderedCurrencies(mockRates);
      // Priority currencies first
      expect(ordered.slice(0, 3)).toEqual(["USD", "TWD", "EUR"]);
      // Then other currencies in alphabetical order
      expect(ordered.slice(3)).toEqual(["AED", "AFN", "ALL", "ZWL"]);
    });

    it("falls back to FALLBACK_CURRENCIES when exchangeRates.rates is missing or empty", () => {
      const orderedNull = getOrderedCurrencies(null);
      expect(orderedNull.length).toBeGreaterThan(15);
      expect(orderedNull[0]).toBe("USD");
      expect(orderedNull[1]).toBe("TWD");

      const orderedUndefined = getOrderedCurrencies(undefined);
      expect(orderedUndefined[0]).toBe("USD");
    });
  });

  describe("filterCurrencyOptions helper", () => {
    const list = ["USD", "TWD", "EUR", "GBP", "JPY", "CAD", "AUD", "AED", "AFN", "UAH", "UGX", "UYU", "UZS", "ZWL"];

    it("returns full list when query is empty", () => {
      expect(filterCurrencyOptions(list, "")).toEqual(list);
      expect(filterCurrencyOptions(list, "   ")).toEqual(list);
    });

    it("filters with USD reachable in 1 keystroke ('u') as top match", () => {
      const filtered = filterCurrencyOptions(list, "u");
      // StartsWith 'u' comes first: USD, UAH, UGX, UYU, UZS
      // Because USD is highest priority among startsWith, USD is index 0!
      expect(filtered[0]).toBe("USD");
    });

    it("filters with USD reachable in 2 keystrokes ('us')", () => {
      const filtered = filterCurrencyOptions(list, "us");
      expect(filtered[0]).toBe("USD");
      expect(filtered.length).toBe(1);
    });

    it("filters with TWD reachable in 1 or 2 keystrokes ('t' or 'tw')", () => {
      const filteredT = filterCurrencyOptions(list, "t");
      expect(filteredT[0]).toBe("TWD");

      const filteredTW = filterCurrencyOptions(list, "tw");
      expect(filteredTW).toEqual(["TWD"]);
    });

    it("filters case-insensitively and handles whitespace", () => {
      expect(filterCurrencyOptions(list, "  jpy  ")[0]).toBe("JPY");
      expect(filterCurrencyOptions(list, "eur")[0]).toBe("EUR");
    });
  });

  describe("Keystroke count measurement (MIPA-17 acceptance criteria)", () => {
    it("measures keystrokes to reach USD: 0 keystrokes when pre-selected, 1 keystroke ('u'), 2 keystrokes ('us')", () => {
      const all = getOrderedCurrencies({
        USD: 1, TWD: 32, EUR: 0.85, GBP: 0.75, JPY: 150, CNY: 7.2, CAD: 1.35, AUD: 1.5,
        AED: 3.67, AFN: 70, ALL: 95, AMD: 400, ANG: 1.8, AOA: 800, ARS: 350, ZWL: 300
      });

      // Baseline without typing: USD is index 0 (0 typing keystrokes needed to find it)
      expect(all[0]).toBe("USD");

      // 1 keystroke: 'u' -> USD is the top option
      const after1Keystroke = filterCurrencyOptions(all, "u");
      expect(after1Keystroke[0]).toBe("USD");

      // 2 keystrokes: 'us' -> USD is the single/top match
      const after2Keystrokes = filterCurrencyOptions(all, "us");
      expect(after2Keystrokes[0]).toBe("USD");
      expect(after2Keystrokes).toEqual(["USD"]);

      // 1 keystroke for TWD: 't' -> TWD is the top option
      const twdAfter1Keystroke = filterCurrencyOptions(all, "t");
      expect(twdAfter1Keystroke[0]).toBe("TWD");
    });
  });

  describe("ModalOrgCurrency component rendering & integration", () => {
    it("renders with use-input enabled and input-debounce set to 0", () => {
      const wrapper = mount(ModalOrgCurrency, {
        props: { currency: "USD" },
        global: {
          plugins: [[Quasar, { components }], createTestStore(), createTestI18n("en-us")]
        }
      });

      const qSelect = wrapper.findComponent({ ref: "currency" });
      expect(qSelect.exists()).toBe(true);
      expect(qSelect.props("useInput")).toBe(true);
      expect(Number(qSelect.props("inputDebounce"))).toBe(0);
    });

    it("pre-selects USD on English locale when currency is not passed", async () => {
      const wrapper = mount(ModalOrgCurrency, {
        props: {},
        global: {
          plugins: [[Quasar, { components }], createTestStore(), createTestI18n("en-us")]
        }
      });

      // Emits update:currency with default USD on mount
      expect(wrapper.emitted("update:currency")).toBeTruthy();
      expect(wrapper.emitted("update:currency")[0]).toEqual(["USD"]);
    });

    it("pre-selects TWD on Traditional Chinese locale when currency is not passed", async () => {
      const wrapper = mount(ModalOrgCurrency, {
        props: {},
        global: {
          plugins: [[Quasar, { components }], createTestStore(), createTestI18n("zh-tw")]
        }
      });

      expect(wrapper.emitted("update:currency")).toBeTruthy();
      expect(wrapper.emitted("update:currency")[0]).toEqual(["TWD"]);
    });

    it("filters options via filterFn", async () => {
      const wrapper = mount(ModalOrgCurrency, {
        props: { currency: "USD" },
        global: {
          plugins: [[Quasar, { components }], createTestStore(), createTestI18n("en-us")]
        }
      });

      let updated = false;
      wrapper.vm.filterFn("eur", (cb) => {
        cb();
        updated = true;
      });

      expect(updated).toBe(true);
      expect(wrapper.vm.filteredCurrencies[0]).toBe("EUR");
    });

    it("auto-commits typed exact currency on blur", async () => {
      const wrapper = mount(ModalOrgCurrency, {
        props: { currency: "USD" },
        global: {
          plugins: [[Quasar, { components }], createTestStore(), createTestI18n("en-us")]
        }
      });

      wrapper.vm.onBlur({ target: { value: "twd" } });
      expect(wrapper.emitted("update:currency")).toBeTruthy();
      const emitted = wrapper.emitted("update:currency");
      expect(emitted[emitted.length - 1]).toEqual(["TWD"]);
    });
  });

  describe("AddOrg modal with pre-selected currency", () => {
    it("initializes orgToSubmit with default currency for English locale", () => {
      const wrapper = mount(AddOrg, {
        global: {
          plugins: [[Quasar, { components }], createTestStore(), createTestI18n("en-us")]
        }
      });

      expect(wrapper.vm.orgToSubmit.currency).toBe("USD");
    });

    it("initializes orgToSubmit with TWD for Traditional Chinese locale", () => {
      const wrapper = mount(AddOrg, {
        global: {
          plugins: [[Quasar, { components }], createTestStore(), createTestI18n("zh-tw")]
        }
      });

      expect(wrapper.vm.orgToSubmit.currency).toBe("TWD");
    });
  });
});
