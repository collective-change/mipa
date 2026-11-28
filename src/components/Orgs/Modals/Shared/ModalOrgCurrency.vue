<template>
  <div class="row q-mb-sm">
    <q-select
      :options="filteredCurrencies"
      :model-value="currency"
      @update:model-value="onSelectCurrency"
      :rules="[val => !!val || ($t ? $t('Required') : 'Required')]"
      ref="currency"
      :label="$t ? $t('currency') : 'Currency'"
      class="col"
      use-input
      :input-debounce="0"
      @filter="filterFn"
      @filter-abort="abortFilterFn"
      @blur="onBlur"
    >
      <template v-slot:no-option>
        <q-item>
          <q-item-section class="text-grey">
            {{ $t ? $t("noMatchingCurrencies") : "No matching currencies" }}
          </q-item-section>
        </q-item>
      </template>
    </q-select>
  </div>
</template>

<script>
import { pickState } from "@/store/pinia-helpers";
import { useAdHocDocsStore } from "@/store/store-adHocDocs";
import { sampleCurrencyFor } from "@/utils/sample-org";

export const PRIORITY_CURRENCIES = [
  "USD",
  "TWD",
  "EUR",
  "GBP",
  "JPY",
  "CNY",
  "CAD",
  "AUD",
  "CHF",
  "HKD",
  "SGD"
];

export const FALLBACK_CURRENCIES = [
  ...PRIORITY_CURRENCIES,
  "NZD",
  "KRW",
  "INR",
  "BRL",
  "MXN",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "THB",
  "IDR",
  "MYR",
  "PHP",
  "VND",
  "ZAR",
  "AED",
  "SAR",
  "ILS",
  "TRY"
];

export function getOrderedCurrencies(ratesObj) {
  const availableSet = new Set(
    ratesObj && typeof ratesObj === "object"
      ? Object.keys(ratesObj)
      : FALLBACK_CURRENCIES
  );

  const priorityPart = PRIORITY_CURRENCIES.filter(c => availableSet.has(c));
  const otherPart = Array.from(availableSet)
    .filter(c => !PRIORITY_CURRENCIES.includes(c))
    .sort();

  return [...priorityPart, ...otherPart];
}

export function filterCurrencyOptions(allCurrencies, inputVal) {
  if (!inputVal || !inputVal.trim()) {
    return allCurrencies;
  }
  const needle = inputVal.trim().toLowerCase();

  const exact = [];
  const startsWith = [];
  const contains = [];

  for (const cur of allCurrencies) {
    const lower = cur.toLowerCase();
    if (lower === needle) {
      exact.push(cur);
    } else if (lower.startsWith(needle)) {
      startsWith.push(cur);
    } else if (lower.includes(needle)) {
      contains.push(cur);
    }
  }

  return [...exact, ...startsWith, ...contains];
}

export default {
  props: ["currency"],
  emits: ["update:currency"],
  data() {
    return {
      filteredCurrencies: []
    };
  },
  computed: {
    ...pickState(useAdHocDocsStore, ["exchangeRates"]),
    currencies() {
      return getOrderedCurrencies(this.exchangeRates?.rates);
    }
  },
  watch: {
    currencies: {
      immediate: true,
      handler(newVal) {
        this.filteredCurrencies = newVal;
      }
    }
  },
  mounted() {
    if (!this.currency) {
      const defaultCurrency = sampleCurrencyFor(this.$i18n?.locale) || "USD";
      this.$emit("update:currency", defaultCurrency);
    }
  },
  methods: {
    onSelectCurrency(val) {
      this.$emit("update:currency", val);
    },
    filterFn(val, update) {
      update(() => {
        this.filteredCurrencies = filterCurrencyOptions(this.currencies, val);
      });
    },
    abortFilterFn() {},
    onBlur(e) {
      const text = (e?.target?.value || "").trim().toUpperCase();
      if (text && this.currencies.includes(text)) {
        if (this.currency !== text) {
          this.$emit("update:currency", text);
        }
      }
    }
  }
};
</script>
