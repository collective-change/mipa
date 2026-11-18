/**
 * Canonical Sourced Conversion Factors Library (Climate / Planetary Boundary Pressure)
 * MIPA-30 / Layer 3 World Model
 *
 * Sourced from GHG Protocol & IPCC AR6 GWP-100.
 * Geography-specific, version-explicit, fully cited with licences.
 */

export const CANONICAL_PRESSURE_UNIT = "tCO2e";

export const CLIMATE_CONVERSION_FACTORS = [
  // --- Scope 2: Grid Electricity ---
  {
    id: "elec-grid-tw-2023",
    name: "Electricity Grid Mix (Taiwan)",
    category: "electricity",
    activityUnit: "kWh",
    pressureUnit: CANONICAL_PRESSURE_UNIT,
    factorValue: 0.000495, // 0.495 kgCO2e/kWh = 0.000495 tCO2e/kWh
    substance: "CO2e",
    scope: 2,
    geography: "TW",
    authority: "Bureau of Energy, MOEA & IPCC AR6",
    citationUrl: "https://www.moeaea.gov.tw",
    licence: "Open Government Data Licence v1.0",
    version: "AR6-2023v1",
    asOf: "2023-12-31"
  },
  {
    id: "elec-grid-us-2022",
    name: "Electricity Grid Mix (US eGRID Average)",
    category: "electricity",
    activityUnit: "kWh",
    pressureUnit: CANONICAL_PRESSURE_UNIT,
    factorValue: 0.000371, // 0.371 kgCO2e/kWh
    substance: "CO2e",
    scope: 2,
    geography: "US",
    authority: "US EPA eGRID2022 & IPCC AR6",
    citationUrl: "https://www.epa.gov/egrid",
    licence: "Public Domain",
    version: "AR6-2022v1",
    asOf: "2022-12-31"
  },
  {
    id: "elec-grid-gb-2023",
    name: "Electricity Grid Mix (United Kingdom)",
    category: "electricity",
    activityUnit: "kWh",
    pressureUnit: CANONICAL_PRESSURE_UNIT,
    factorValue: 0.000207, // 0.207 kgCO2e/kWh
    substance: "CO2e",
    scope: 2,
    geography: "GB",
    authority: "UK DESNZ / DEFRA 2023",
    citationUrl: "https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2023",
    licence: "Open Government Licence v3.0",
    version: "AR6-2023v1",
    asOf: "2023-06-01"
  },
  {
    id: "elec-grid-global-2023",
    name: "Electricity Grid Mix (World Average)",
    category: "electricity",
    activityUnit: "kWh",
    pressureUnit: CANONICAL_PRESSURE_UNIT,
    factorValue: 0.000436,
    substance: "CO2e",
    scope: 2,
    geography: "GLOBAL",
    authority: "IEA World Energy Outlook 2023 & IPCC AR6",
    citationUrl: "https://www.iea.org/reports/world-energy-outlook-2023",
    licence: "CC BY 4.0",
    version: "AR6-2023v1",
    asOf: "2023-10-01"
  },

  // --- Scope 1: Direct Combustion ---
  {
    id: "fuel-diesel-stationary-ar6",
    name: "Diesel Fuel Combustion",
    category: "fuel",
    activityUnit: "litres",
    pressureUnit: CANONICAL_PRESSURE_UNIT,
    factorValue: 0.00268, // 2.68 kgCO2e/L
    substance: "CO2e",
    scope: 1,
    geography: "GLOBAL",
    authority: "GHG Protocol & IPCC AR6 Vol 2 Energy",
    citationUrl: "https://ghgprotocol.org/calculation-tools-and-guidance",
    licence: "CC BY 4.0",
    version: "AR6-2021v1",
    asOf: "2021-08-01"
  },
  {
    id: "fuel-gasoline-mobile-ar6",
    name: "Motor Gasoline (Petrol) Combustion",
    category: "fuel",
    activityUnit: "litres",
    pressureUnit: CANONICAL_PRESSURE_UNIT,
    factorValue: 0.00231, // 2.31 kgCO2e/L
    substance: "CO2e",
    scope: 1,
    geography: "GLOBAL",
    authority: "GHG Protocol & IPCC AR6 Vol 2 Energy",
    citationUrl: "https://ghgprotocol.org/calculation-tools-and-guidance",
    licence: "CC BY 4.0",
    version: "AR6-2021v1",
    asOf: "2021-08-01"
  },
  {
    id: "fuel-natural-gas-ar6",
    name: "Natural Gas Combustion",
    category: "fuel",
    activityUnit: "m3",
    pressureUnit: CANONICAL_PRESSURE_UNIT,
    factorValue: 0.00202, // 2.02 kgCO2e/m3
    substance: "CO2e",
    scope: 1,
    geography: "GLOBAL",
    authority: "GHG Protocol & IPCC AR6",
    citationUrl: "https://ghgprotocol.org/calculation-tools-and-guidance",
    licence: "CC BY 4.0",
    version: "AR6-2021v1",
    asOf: "2021-08-01"
  },
  {
    id: "fuel-coal-bituminous-ar6",
    name: "Bituminous Coal Combustion",
    category: "fuel",
    activityUnit: "kg",
    pressureUnit: CANONICAL_PRESSURE_UNIT,
    factorValue: 0.00242, // 2.42 kgCO2e/kg
    substance: "CO2e",
    scope: 1,
    geography: "GLOBAL",
    authority: "IPCC AR6 Vol 2 Chapter 2",
    citationUrl: "https://www.ipcc.ch/report/ar6/wg3/",
    licence: "CC BY 4.0",
    version: "AR6-2021v1",
    asOf: "2021-08-01"
  },

  // --- Scope 3: Value Chain & Transport ---
  {
    id: "transport-air-shorthaul-ar6",
    name: "Passenger Air Travel (Short-haul / Domestic)",
    category: "transport",
    activityUnit: "pkm",
    pressureUnit: CANONICAL_PRESSURE_UNIT,
    factorValue: 0.000154, // 154 gCO2e / passenger-km
    substance: "CO2e",
    scope: 3,
    geography: "GLOBAL",
    authority: "UK DESNZ / ICAO & IPCC AR6",
    citationUrl: "https://www.icao.int/environmental-protection/CarbonOffset",
    licence: "Open Government Licence v3.0",
    version: "AR6-2023v1",
    asOf: "2023-06-01"
  },
  {
    id: "transport-air-longhaul-ar6",
    name: "Passenger Air Travel (Long-haul, Economy)",
    category: "transport",
    activityUnit: "pkm",
    pressureUnit: CANONICAL_PRESSURE_UNIT,
    factorValue: 0.000102, // 102 gCO2e / passenger-km
    substance: "CO2e",
    scope: 3,
    geography: "GLOBAL",
    authority: "UK DESNZ / ICAO & IPCC AR6",
    citationUrl: "https://www.icao.int/environmental-protection/CarbonOffset",
    licence: "Open Government Licence v3.0",
    version: "AR6-2023v1",
    asOf: "2023-06-01"
  },
  {
    id: "freight-road-hgv-ar6",
    name: "Road Freight Transport (Heavy Goods Vehicle)",
    category: "transport",
    activityUnit: "tonne_km",
    pressureUnit: CANONICAL_PRESSURE_UNIT,
    factorValue: 0.000107, // 107 gCO2e / tonne-km
    substance: "CO2e",
    scope: 3,
    geography: "GLOBAL",
    authority: "GHG Protocol & GLEC Framework v3.0 / IPCC AR6",
    citationUrl: "https://www.smartfreightcentre.org/en/glec-framework/",
    licence: "CC BY 4.0",
    version: "AR6-2023v1",
    asOf: "2023-09-01"
  },
  {
    id: "freight-rail-ar6",
    name: "Rail Freight Transport",
    category: "transport",
    activityUnit: "tonne_km",
    pressureUnit: CANONICAL_PRESSURE_UNIT,
    factorValue: 0.000028, // 28 gCO2e / tonne-km
    substance: "CO2e",
    scope: 3,
    geography: "GLOBAL",
    authority: "GHG Protocol & GLEC Framework / IPCC AR6",
    citationUrl: "https://www.smartfreightcentre.org/en/glec-framework/",
    licence: "CC BY 4.0",
    version: "AR6-2023v1",
    asOf: "2023-09-01"
  }
];

/**
 * Look up a conversion factor by ID.
 *
 * @param {string} factorId
 * @returns {Object|null}
 */
export function getConversionFactor(factorId) {
  if (!factorId || typeof factorId !== "string") return null;
  return CLIMATE_CONVERSION_FACTORS.find(f => f.id === factorId) || null;
}

/**
 * Calculates pressure for a given activity quantity and factor.
 *
 * Strict Unit Guard (Acceptance criterion d):
 * An activity unit that does not match the factor's expected unit is REFUSED, NEVER SILENTLY COERCED.
 *
 * @param {number} quantity
 * @param {string} activityUnit
 * @param {Object|string} factorOrId
 * @returns {{ pressureValue: number, pressureUnit: string, scope: number, factor: Object }}
 */
export function calculatePressure(quantity, activityUnit, factorOrId) {
  const factor = typeof factorOrId === "string" ? getConversionFactor(factorOrId) : factorOrId;
  if (!factor || typeof factor !== "object") {
    throw new Error(`UNKNOWN_FACTOR: Factor '${factorOrId}' was not found in the conversion-factor library.`);
  }

  const num = Number(quantity);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`INVALID_QUANTITY: Activity quantity must be a non-negative finite number, received: ${quantity}`);
  }

  const cleanUnit = (activityUnit || "").trim();
  if (!cleanUnit) {
    throw new Error("MISSING_UNIT: Activity unit is required.");
  }

  // STRICT REFUSAL: Do not silently coerce "litres" to "m3" or "kWh" to "MWh".
  if (cleanUnit !== factor.activityUnit) {
    throw new Error(
      `UNIT_MISMATCH: Activity unit '${cleanUnit}' does not match factor expected unit '${factor.activityUnit}'. Silently coercing units is strictly prohibited (MIPA-30).`
    );
  }

  const pressureValue = Number((num * factor.factorValue).toPrecision(8));

  return {
    activityQuantity: num,
    activityUnit: factor.activityUnit,
    pressureValue,
    pressureUnit: factor.pressureUnit,
    scope: factor.scope,
    factorId: factor.id,
    factorName: factor.name,
    authority: factor.authority,
    citationUrl: factor.citationUrl,
    licence: factor.licence,
    version: factor.version,
    geography: factor.geography,
    asOf: factor.asOf
  };
}

/**
 * Sums action climate pressures across a portfolio in canonical units (tCO2e).
 * Acceptance criterion (c): pressures sum across a portfolio in the one canonical unit.
 *
 * @param {Array<Object>} actions
 * @returns {{ totalTCO2e: number, unit: string, byScope: { scope1: number, scope2: number, scope3: number }, actionsWithPressureCount: number }}
 */
export function sumPortfolioPressures(actions = []) {
  let total = 0;
  let s1 = 0;
  let s2 = 0;
  let s3 = 0;
  let count = 0;

  for (const action of actions || []) {
    const cp = action && action.climatePressure;
    if (cp && typeof cp.pressureValue === "number" && Number.isFinite(cp.pressureValue)) {
      if (cp.pressureUnit && cp.pressureUnit !== CANONICAL_PRESSURE_UNIT) {
        throw new Error(
          `INCOMPATIBLE_UNIT: Cannot sum non-canonical unit '${cp.pressureUnit}' into ${CANONICAL_PRESSURE_UNIT} portfolio total.`
        );
      }
      total += cp.pressureValue;
      count++;
      if (cp.scope === 1) s1 += cp.pressureValue;
      else if (cp.scope === 2) s2 += cp.pressureValue;
      else if (cp.scope === 3) s3 += cp.pressureValue;
    }
  }

  return {
    totalTCO2e: Number(total.toFixed(6)),
    unit: CANONICAL_PRESSURE_UNIT,
    byScope: {
      scope1: Number(s1.toFixed(6)),
      scope2: Number(s2.toFixed(6)),
      scope3: Number(s3.toFixed(6))
    },
    actionsWithPressureCount: count
  };
}

/**
 * Political / Allocation Guard (Acceptance criterion e & Decision M-5):
 *
 * NO code path produces a share, a normalised index, or a "percentage of the safe operating space"
 * without a named, dated allocation rule.
 *
 * @param {Object} pressure
 * @param {Object} boundary
 * @param {Object} [allocationRule]
 */
export function calculateSafeOperatingSpaceShare(pressure, boundary, allocationRule) {
  if (
    !allocationRule ||
    typeof allocationRule !== "object" ||
    typeof allocationRule.name !== "string" ||
    !allocationRule.name.trim() ||
    typeof allocationRule.date !== "string" ||
    !allocationRule.date.trim()
  ) {
    throw new Error(
      "ALLOCATION_RULE_REQUIRED: Producing a share, normalised index, or percentage of the safe operating space without a named, dated allocation rule is strictly prohibited (MIPA-30 / Decision M-5). A contribution to global stock is physics, but a share of a budget requires a political allocation rule."
    );
  }

  if (typeof allocationRule.allocatedBudget !== "number" || allocationRule.allocatedBudget <= 0) {
    throw new Error("ALLOCATION_BUDGET_INVALID: The named allocation rule must provide a positive allocatedBudget.");
  }

  const pVal = Number(pressure.pressureValue || pressure.value || pressure);
  return {
    shareOfAllocatedBudget: pVal / allocationRule.allocatedBudget,
    allocationRuleName: allocationRule.name,
    allocationRuleDate: allocationRule.date
  };
}
