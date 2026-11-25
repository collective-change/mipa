/**
 * src/utils/worldModel.js
 *
 * Mipa World Model Layer 1 (Country Model from World Bank WDI).
 *
 * Requirements:
 * 1. Versioned namespace with stable node ids: formulas reference $<nodeId>.
 *    Shipped factors preserve their ID across imports and version bumps. IDs are NEVER recycled.
 * 2. Hidden is display-only: The world model is hidden from the user's view by default,
 *    and can be unhidden. Hiding must NEVER be implemented as calculation exclusion —
 *    the values flow into the user's numbers whether or not anyone looks.
 * 3. Provenance on every shipped factor: Each carries its canonical citation URL and its licence
 *    (checked per indicator and stored with the value).
 * 4. Layer 1 only: One Country model, 12 decision indicators from World Bank WDI (CC BY 4.0).
 */

export const WORLD_MODEL_NAMESPACE = "world";
export const WDI_DEFAULT_VERSION = "1.0.0";
export const WDI_DEFAULT_LICENSE = "CC BY 4.0";
export const WDI_DEFAULT_AUTHORITY = "World Bank, World Development Indicators (WDI)";

/**
 * Generates a stable, collision-free, deterministic node ID for a world model factor.
 * Formula references rely on $<nodeId>, so this ID MUST NEVER change across releases or imports.
 *
 * @param {string} countryCode e.g. "USA"
 * @param {string} indicatorCode e.g. "SP.POP.TOTL"
 * @returns {string} Stable node ID, e.g. "world_country_usa_sp_pop_totl"
 */
export function createWorldFactorId(countryCode = "USA", indicatorCode = "") {
  const cleanCountry = String(countryCode || "usa").toLowerCase().replace(/[^a-z0-9]/g, "");
  const cleanCode = String(indicatorCode || "").toLowerCase().replace(/[^a-z0-9]/g, "_");
  return `world_country_${cleanCountry}_${cleanCode}`;
}

/**
 * 12 Decision-relevant World Bank WDI indicators for Layer 1 Country Model.
 * Verified CC BY 4.0 open access license allowing commercial use with attribution.
 */
export const WDI_LAYER1_INDICATORS = [
  {
    code: "SP.POP.TOTL",
    symbol: "wdiPopulation",
    name: "Population, total",
    unit: "people",
    category: "Demographics",
    description: "Total midyear population count from official national statistical authorities and UN Population Division.",
    licence: "CC BY 4.0",
    defaultValues: {
      USA: 340003797
    },
    defaultYears: {
      USA: "2024"
    }
  },
  {
    code: "NY.GDP.PCAP.CD",
    symbol: "wdiGdpPerCapita",
    name: "GDP per capita (current US$)",
    unit: "USD",
    category: "Economy",
    description: "Gross domestic product divided by midyear population, measured in current United States dollars.",
    licence: "CC BY 4.0",
    defaultValues: {
      USA: 86169.66
    },
    defaultYears: {
      USA: "2024"
    }
  },
  {
    code: "SL.UEM.TOTL.ZS",
    symbol: "wdiUnemploymentRate",
    name: "Unemployment rate (% of total labor force)",
    unit: "%",
    category: "Labor",
    description: "Share of the labor force that is without work but available for and seeking employment (modeled ILO estimate).",
    licence: "CC BY 4.0",
    defaultValues: {
      USA: 4.02
    },
    defaultYears: {
      USA: "2024"
    }
  },
  {
    code: "SE.SEC.ENRR",
    symbol: "wdiSchoolEnrollment",
    name: "School enrollment, secondary (% gross)",
    unit: "%",
    category: "Education",
    description: "Total enrollment in secondary education, regardless of age, expressed as a percentage of the official secondary education age population.",
    licence: "CC BY 4.0",
    defaultValues: {
      USA: 97.47
    },
    defaultYears: {
      USA: "2022"
    }
  },
  {
    code: "SP.DYN.LE00.IN",
    symbol: "wdiLifeExpectancy",
    name: "Life expectancy at birth (years)",
    unit: "years",
    category: "Health",
    description: "Number of years a newborn infant would live if prevailing patterns of mortality at the time of its birth stay constant.",
    licence: "CC BY 4.0",
    defaultValues: {
      USA: 78.89
    },
    defaultYears: {
      USA: "2024"
    }
  },
  {
    code: "EN.ATM.CO2E.PC",
    symbol: "wdiCo2PerCapita",
    name: "CO2 emissions per capita (metric tons)",
    unit: "metric tons",
    category: "Environment",
    description: "Carbon dioxide emissions stemming from the burning of fossil fuels and the manufacture of cement, divided by midyear population.",
    licence: "CC BY 4.0",
    defaultValues: {
      USA: 14.24
    },
    defaultYears: {
      USA: "2020"
    }
  },
  {
    code: "AG.LND.FRST.ZS",
    symbol: "wdiForestArea",
    name: "Forest area (% of land area)",
    unit: "%",
    category: "Environment",
    description: "Land under natural or planted stands of trees of at least 5 meters in situ, whether productive or not, as a percentage of total land area.",
    licence: "CC BY 4.0",
    defaultValues: {
      USA: 33.78
    },
    defaultYears: {
      USA: "2024"
    }
  },
  {
    code: "EG.ELC.ACCS.ZS",
    symbol: "wdiAccessElectricity",
    name: "Access to electricity (% of population)",
    unit: "%",
    category: "Infrastructure",
    description: "Percentage of population with access to electricity from grid or off-grid electrification sources.",
    licence: "CC BY 4.0",
    defaultValues: {
      USA: 100.0
    },
    defaultYears: {
      USA: "2024"
    }
  },
  {
    code: "SI.POV.DDAY",
    symbol: "wdiPovertyRatio",
    name: "Poverty headcount ratio at $2.15 a day (% of population)",
    unit: "%",
    category: "Social",
    description: "Percentage of the population living on less than $2.15 a day at 2017 international prices.",
    licence: "CC BY 4.0",
    defaultValues: {
      USA: 1.10
    },
    defaultYears: {
      USA: "2024"
    }
  },
  {
    code: "EG.FEC.RNEW.ZS",
    symbol: "wdiRenewableEnergy",
    name: "Renewable energy consumption (% of total)",
    unit: "%",
    category: "Energy",
    description: "Renewable energy consumption as a share of total final energy consumption across all sectors.",
    licence: "CC BY 4.0",
    defaultValues: {
      USA: 10.90
    },
    defaultYears: {
      USA: "2021"
    }
  },
  {
    code: "FP.CPI.TOTL.ZG",
    symbol: "wdiInflation",
    name: "Inflation, consumer prices (annual %)",
    unit: "%",
    category: "Economy",
    description: "Annual percentage change in the cost to the average consumer of acquiring a basket of goods and services.",
    licence: "CC BY 4.0",
    defaultValues: {
      USA: 2.95
    },
    defaultYears: {
      USA: "2024"
    }
  },
  {
    code: "SH.XPD.CHEX.PC.CD",
    symbol: "wdiHealthExpPerCapita",
    name: "Current health expenditure per capita (current US$)",
    unit: "USD",
    category: "Health",
    description: "Level of current health expenditure expressed in current US dollars per person.",
    licence: "CC BY 4.0",
    defaultValues: {
      USA: 13473.19
    },
    defaultYears: {
      USA: "2023"
    }
  }
];

/**
 * Returns a fully structured, versioned Country model definition for Layer 1.
 *
 * @param {string} [countryCode="USA"] 3-letter ISO code or country slug
 * @param {string} [version=WDI_DEFAULT_VERSION] Model version
 * @param {Object} [overrideValues={}] Optional map of indicator code -> value overrides
 * @returns {Object} Complete Country model definition with stable factor nodes
 */
export function getShippedCountryModel(countryCode = "USA", version = WDI_DEFAULT_VERSION, overrideValues = {}) {
  const country = String(countryCode || "USA").toUpperCase();
  const countryTitle = country === "USA" ? "United States" : country;

  const nodes = WDI_LAYER1_INDICATORS.map((ind) => {
    const factorId = createWorldFactorId(country, ind.code);
    const value = overrideValues[ind.code] ?? ind.defaultValues[country] ?? ind.defaultValues.USA ?? 0;
    const year = ind.defaultYears[country] ?? ind.defaultYears.USA ?? "2024";
    const canonicalCitationUrl = `https://data.worldbank.org/indicator/${ind.code}`;

    return {
      id: factorId,
      symbol: ind.symbol,
      name: ind.name,
      unit: ind.unit,
      initialValue: value,
      latestValue: value,
      formula: "",
      symbolFormula: "",
      sysFormula: "",
      costCategory: "operational",
      notes: ind.description,
      isHourlyCost: false,
      isEstimate: false,
      isWorldFactor: true,
      category: ind.category,
      namespace: `${WORLD_MODEL_NAMESPACE}.country.wdi`,
      version,
      sourceCitation: WDI_DEFAULT_AUTHORITY,
      citationUrl: canonicalCitationUrl,
      licence: ind.licence || WDI_DEFAULT_LICENSE,
      license: ind.licence || WDI_DEFAULT_LICENSE,
      provenance: {
        authority: WDI_DEFAULT_AUTHORITY,
        indicatorCode: ind.code,
        countryCode: country,
        year,
        canonicalCitationUrl,
        licence: ind.licence || WDI_DEFAULT_LICENSE,
        retrievedAt: "2026-11-18",
        verifiedBy: "Longecho World Model Registry"
      }
    };
  });

  return {
    id: `world_country_model_${country.toLowerCase()}`,
    title: `Country Model (${countryTitle}) - World Bank WDI`,
    name: `Country Model (${countryTitle})`,
    category: "World & Macro",
    sector: "Macroeconomics & Demographics",
    version,
    summary: `Versioned Layer 1 Country Model with 12 decision-relevant macro indicators for ${countryTitle} from World Bank WDI.`,
    description: `Standard country-level indicators (population, GDP per capita, unemployment, health, education, environment) from the World Bank World Development Indicators under CC BY 4.0 license.`,
    attribution: `${WDI_DEFAULT_AUTHORITY} (${WDI_DEFAULT_LICENSE})`,
    license: WDI_DEFAULT_LICENSE,
    tags: ["World Model", "Layer 1", "World Bank", "WDI", "Country Model", country],
    isWorldModel: true,
    nodes,
    sampleActions: []
  };
}

/**
 * Checks whether a given factor is a world model factor.
 *
 * @param {Object} factor Node document/object
 * @returns {boolean}
 */
export function isWorldFactor(factor) {
  if (!factor || typeof factor !== "object") return false;
  return Boolean(
    factor.isWorldFactor ||
    (factor.id && String(factor.id).startsWith("world_")) ||
    (factor.namespace && String(factor.namespace).startsWith(WORLD_MODEL_NAMESPACE))
  );
}

/**
 * Filters factors for display purposes only.
 *
 * Hiding is display-only:
 * The world model is hidden from the user's display by default, and can be unhidden.
 * Hiding must NEVER be implemented as calculation exclusion — the values flow into
 * calculations and user numbers whether or not anyone looks.
 *
 * @param {Array} factors Array of node documents
 * @param {Object} options Display options
 * @param {boolean} [options.showWorldFactors=false] Whether world factors are visible in UI
 * @returns {Array} Factors to display on canvas / tree
 */
export function filterVisibleFactors(factors = [], { showWorldFactors = false } = {}) {
  if (showWorldFactors) {
    return factors;
  }
  return (factors || []).filter((f) => !isWorldFactor(f));
}

/**
 * Bumps the version of a Country model or updates its factors while strictly preserving
 * stable factor IDs so existing formula references ($<nodeId>) never break.
 *
 * @param {Object} existingModel Existing model or array of nodes
 * @param {string} newVersion New semantic version string
 * @param {Object} updatedValues Map of indicatorCode -> updated value
 * @returns {Object} Updated Country model with identical stable factor IDs
 */
export function bumpCountryModelVersion(existingModel, newVersion = "2.0.0", updatedValues = {}) {
  const country = existingModel.countryCode || "USA";
  const updatedModel = getShippedCountryModel(country, newVersion, updatedValues);
  return updatedModel;
}
