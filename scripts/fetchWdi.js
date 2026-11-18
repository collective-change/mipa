// scripts/fetchWdi.js
// Fetches standard World Bank WDI indicators for a country and outputs versioned standard factors.

export const WDI_INDICATORS = [
  {
    code: "SP.POP.TOTL",
    symbol: "wdiPopulation",
    name: "Population, total",
    unit: "people",
    category: "Demographics"
  },
  {
    code: "NY.GDP.PCAP.CD",
    symbol: "wdiGdpPerCapita",
    name: "GDP per capita (current US$)",
    unit: "USD",
    category: "Economy"
  },
  {
    code: "SL.UEM.TOTL.ZS",
    symbol: "wdiUnemploymentRate",
    name: "Unemployment rate (% of total labor force)",
    unit: "%",
    category: "Labor"
  },
  {
    code: "SE.SEC.ENRR",
    symbol: "wdiSchoolEnrollment",
    name: "School enrollment, secondary (% gross)",
    unit: "%",
    category: "Education"
  },
  {
    code: "SP.DYN.LE00.IN",
    symbol: "wdiLifeExpectancy",
    name: "Life expectancy at birth (years)",
    unit: "years",
    category: "Health"
  },
  {
    code: "EN.ATM.CO2E.PC",
    symbol: "wdiCo2PerCapita",
    name: "CO2 emissions per capita (metric tons)",
    unit: "metric tons",
    category: "Environment"
  },
  {
    code: "AG.LND.FRST.ZS",
    symbol: "wdiForestArea",
    name: "Forest area (% of land area)",
    unit: "%",
    category: "Environment"
  },
  {
    code: "EG.ELC.ACCS.ZS",
    symbol: "wdiAccessElectricity",
    name: "Access to electricity (% of population)",
    unit: "%",
    category: "Infrastructure"
  },
  {
    code: "SI.POV.DDAY",
    symbol: "wdiPovertyRatio",
    name: "Poverty headcount ratio at $2.15 a day (% of population)",
    unit: "%",
    category: "Social"
  },
  {
    code: "EG.FEC.RNEW.ZS",
    symbol: "wdiRenewableEnergy",
    name: "Renewable energy consumption (% of total)",
    unit: "%",
    category: "Energy"
  },
  {
    code: "FP.CPI.TOTL.ZG",
    symbol: "wdiInflation",
    name: "Inflation, consumer prices (annual %)",
    unit: "%",
    category: "Economy"
  },
  {
    code: "SH.XPD.CHEX.PC.CD",
    symbol: "wdiHealthExpPerCapita",
    name: "Current health expenditure per capita (current US$)",
    unit: "USD",
    category: "Health"
  }
];

export async function fetchIndicatorData(countryCode, ind) {
  const url = `https://api.worldbank.org/v2/country/${countryCode}/indicator/${ind.code}?format=json&date=2015:2024`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mipa-WorldModel/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const records = data[1] || [];
    const valid = records.find(r => r.value !== null);
    return {
      ...ind,
      value: valid ? valid.value : null,
      year: valid ? valid.date : null,
      country: valid?.country?.value || countryCode,
      countryIso3: countryCode
    };
  } catch (err) {
    return {
      ...ind,
      value: null,
      year: null,
      countryIso3: countryCode,
      error: err.message
    };
  }
}

export async function fetchAll(countryCode = "USA") {
  const promises = WDI_INDICATORS.map(ind => fetchIndicatorData(countryCode, ind));
  const results = await Promise.all(promises);
  console.log(JSON.stringify(results, null, 2));
  return results;
}

if (process.argv[1] && process.argv[1].endsWith("fetchWdi.js")) {
  const country = process.argv[2] || "USA";
  fetchAll(country);
}
