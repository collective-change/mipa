import { describe, it, expect } from "vitest";
import {
  CANONICAL_PRESSURE_UNIT,
  CLIMATE_CONVERSION_FACTORS,
  getConversionFactor,
  calculatePressure,
  sumPortfolioPressures,
  calculateSafeOperatingSpaceShare
} from "@/utils/conversionFactors";

describe("conversionFactors.js (MIPA-30 / Layer 3 World Model)", () => {
  describe("CLIMATE_CONVERSION_FACTORS library", () => {
    it("canonical pressure unit is strictly tCO2e", () => {
      expect(CANONICAL_PRESSURE_UNIT).toBe("tCO2e");
    });

    it("every library factor has required sourced provenance and metadata", () => {
      expect(CLIMATE_CONVERSION_FACTORS.length).toBeGreaterThanOrEqual(10);

      for (const factor of CLIMATE_CONVERSION_FACTORS) {
        expect(factor.id).toBeDefined();
        expect(typeof factor.id).toBe("string");
        expect(factor.name).toBeDefined();
        expect(factor.activityUnit).toBeDefined();
        expect(factor.pressureUnit).toBe(CANONICAL_PRESSURE_UNIT);
        expect(typeof factor.factorValue).toBe("number");
        expect(factor.factorValue).toBeGreaterThan(0);
        expect(factor.substance).toBe("CO2e");
        expect([1, 2, 3]).toContain(factor.scope);
        expect(factor.geography).toBeDefined();
        expect(typeof factor.geography).toBe("string");
        expect(factor.authority).toBeDefined();
        expect(typeof factor.authority).toBe("string");
        expect(factor.citationUrl).toMatch(/^https?:\/\//);
        expect(factor.licence).toBeDefined();
        expect(factor.version).toMatch(/AR6/);
        expect(factor.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });

    it("geography is explicit on country-specific grid factors", () => {
      const tw = getConversionFactor("elec-grid-tw-2023");
      expect(tw).not.toBeNull();
      expect(tw.geography).toBe("TW");
      expect(tw.scope).toBe(2);
      expect(tw.factorValue).toBe(0.000495); // 0.495 kgCO2e/kWh
      expect(tw.authority).toContain("MOEA");

      const us = getConversionFactor("elec-grid-us-2022");
      expect(us).not.toBeNull();
      expect(us.geography).toBe("US");
      expect(us.scope).toBe(2);

      const gb = getConversionFactor("elec-grid-gb-2023");
      expect(gb).not.toBeNull();
      expect(gb.geography).toBe("GB");
      expect(gb.scope).toBe(2);

      const globalGrid = getConversionFactor("elec-grid-global-2023");
      expect(globalGrid).not.toBeNull();
      expect(globalGrid.geography).toBe("GLOBAL");
      expect(globalGrid.scope).toBe(2);
    });

    it("scope 1 direct fuel factors are available", () => {
      const diesel = getConversionFactor("fuel-diesel-stationary-ar6");
      expect(diesel).not.toBeNull();
      expect(diesel.scope).toBe(1);
      expect(diesel.activityUnit).toBe("litres");
      expect(diesel.factorValue).toBe(0.00268);

      const gas = getConversionFactor("fuel-natural-gas-ar6");
      expect(gas).not.toBeNull();
      expect(gas.scope).toBe(1);
      expect(gas.activityUnit).toBe("m3");
    });

    it("scope 3 freight and transport factors are available", () => {
      const air = getConversionFactor("transport-air-shorthaul-ar6");
      expect(air).not.toBeNull();
      expect(air.scope).toBe(3);
      expect(air.activityUnit).toBe("pkm");

      const roadFreight = getConversionFactor("freight-road-hgv-ar6");
      expect(roadFreight).not.toBeNull();
      expect(roadFreight.scope).toBe(3);
      expect(roadFreight.activityUnit).toBe("tonne_km");
    });
  });

  describe("getConversionFactor", () => {
    it("returns null for non-existent or invalid id", () => {
      expect(getConversionFactor("non-existent-factor")).toBeNull();
      expect(getConversionFactor("")).toBeNull();
      expect(getConversionFactor(null)).toBeNull();
      expect(getConversionFactor(123)).toBeNull();
    });
  });

  describe("calculatePressure (Acceptance criterion a, d)", () => {
    it("(a) calculates accurate tCO2e pressure and attaches factor provenance", () => {
      const result = calculatePressure(100000, "kWh", "elec-grid-tw-2023");
      expect(result.activityQuantity).toBe(100000);
      expect(result.activityUnit).toBe("kWh");
      expect(result.pressureValue).toBe(49.5); // 100,000 * 0.000495
      expect(result.pressureUnit).toBe("tCO2e");
      expect(result.scope).toBe(2);
      expect(result.authority).toBe("Bureau of Energy, MOEA & IPCC AR6");
      expect(result.citationUrl).toBe("https://www.moeaea.gov.tw");
      expect(result.licence).toBe("Open Government Data Licence v1.0");
      expect(result.version).toBe("AR6-2023v1");
      expect(result.geography).toBe("TW");
    });

    it("accepts factor object directly", () => {
      const factor = getConversionFactor("fuel-diesel-stationary-ar6");
      const result = calculatePressure(5000, "litres", factor);
      expect(result.pressureValue).toBe(13.4); // 5000 * 0.00268
      expect(result.scope).toBe(1);
    });

    it("(d) REFUSES unit mismatch and NEVER silently coerces", () => {
      // User entered litres for electricity grid factor
      expect(() => {
        calculatePressure(100, "litres", "elec-grid-tw-2023");
      }).toThrow(/UNIT_MISMATCH/);

      // User entered MWh instead of expected kWh
      expect(() => {
        calculatePressure(10, "MWh", "elec-grid-tw-2023");
      }).toThrow(/UNIT_MISMATCH/);

      // User entered gallons instead of litres for diesel
      expect(() => {
        calculatePressure(50, "gallons", "fuel-diesel-stationary-ar6");
      }).toThrow(/UNIT_MISMATCH/);
    });

    it("rejects invalid activity quantities", () => {
      expect(() => {
        calculatePressure(-5, "kWh", "elec-grid-tw-2023");
      }).toThrow(/INVALID_QUANTITY/);

      expect(() => {
        calculatePressure(NaN, "kWh", "elec-grid-tw-2023");
      }).toThrow(/INVALID_QUANTITY/);

      expect(() => {
        calculatePressure("not-a-number", "kWh", "elec-grid-tw-2023");
      }).toThrow(/INVALID_QUANTITY/);
    });

    it("rejects unknown factors", () => {
      expect(() => {
        calculatePressure(100, "kWh", "unknown-factor-id");
      }).toThrow(/UNKNOWN_FACTOR/);
    });
  });

  describe("sumPortfolioPressures (Acceptance criterion c)", () => {
    it("(c) sums pressures across an actions portfolio in canonical tCO2e unit with scope breakdown", () => {
      const actions = [
        {
          id: "act-1",
          title: "Solar Rooftop Deployment",
          climatePressure: {
            pressureValue: 49.5,
            pressureUnit: "tCO2e",
            scope: 2
          }
        },
        {
          id: "act-2",
          title: "Fleet Route Optimization",
          climatePressure: {
            pressureValue: 13.4,
            pressureUnit: "tCO2e",
            scope: 1
          }
        },
        {
          id: "act-3",
          title: "Supply Chain Rail Shift",
          climatePressure: {
            pressureValue: 8.2,
            pressureUnit: "tCO2e",
            scope: 3
          }
        },
        {
          id: "act-4",
          title: "Administrative Meeting",
          climatePressure: null // No climate pressure
        }
      ];

      const summary = sumPortfolioPressures(actions);
      expect(summary.totalTCO2e).toBe(71.1); // 49.5 + 13.4 + 8.2
      expect(summary.unit).toBe("tCO2e");
      expect(summary.byScope.scope1).toBe(13.4);
      expect(summary.byScope.scope2).toBe(49.5);
      expect(summary.byScope.scope3).toBe(8.2);
      expect(summary.actionsWithPressureCount).toBe(3);
    });

    it("throws INCOMPATIBLE_UNIT if any action carries non-canonical pressure units", () => {
      const actions = [
        {
          id: "act-err",
          climatePressure: {
            pressureValue: 50,
            pressureUnit: "kgCO2e", // Non-canonical unit
            scope: 1
          }
        }
      ];

      expect(() => {
        sumPortfolioPressures(actions);
      }).toThrow(/INCOMPATIBLE_UNIT/);
    });

    it("handles empty or unpressured portfolio gracefully", () => {
      const empty = sumPortfolioPressures([]);
      expect(empty.totalTCO2e).toBe(0);
      expect(empty.actionsWithPressureCount).toBe(0);

      const unpressured = sumPortfolioPressures([{ id: "a1" }, { id: "a2", climatePressure: null }]);
      expect(unpressured.totalTCO2e).toBe(0);
      expect(unpressured.actionsWithPressureCount).toBe(0);
    });
  });

  describe("Allocation Guard & Decision M-5 (Acceptance criterion e)", () => {
    it("(e) REFUSES to produce a share or percentage of safe operating space without a named, dated allocation rule", () => {
      const pressure = { pressureValue: 50, pressureUnit: "tCO2e" };
      const boundary = { name: "Climate Change", boundaryValue: 350 };

      // Calling with no allocation rule must throw ALLOCATION_RULE_REQUIRED
      expect(() => {
        calculateSafeOperatingSpaceShare(pressure, boundary);
      }).toThrow(/ALLOCATION_RULE_REQUIRED/);

      // Calling with undefined rule must throw
      expect(() => {
        calculateSafeOperatingSpaceShare(pressure, boundary, undefined);
      }).toThrow(/ALLOCATION_RULE_REQUIRED/);

      // Calling with empty object must throw
      expect(() => {
        calculateSafeOperatingSpaceShare(pressure, boundary, {});
      }).toThrow(/ALLOCATION_RULE_REQUIRED/);

      // Calling without date must throw
      expect(() => {
        calculateSafeOperatingSpaceShare(pressure, boundary, { name: "Equal Per Capita" });
      }).toThrow(/ALLOCATION_RULE_REQUIRED/);

      // Calling without name must throw
      expect(() => {
        calculateSafeOperatingSpaceShare(pressure, boundary, { date: "2026-01-01" });
      }).toThrow(/ALLOCATION_RULE_REQUIRED/);
    });

    it("(e) succeeds only when an explicit named, dated allocation rule with allocated budget is provided", () => {
      const pressure = { pressureValue: 50, pressureUnit: "tCO2e" };
      const boundary = { name: "Climate Change", boundaryValue: 350 };
      const allocationRule = {
        name: "SBTi Corporate 1.5C Sectoral Decarbonization",
        date: "2026-01-15",
        allocatedBudget: 1000 // tCO2e
      };

      const result = calculateSafeOperatingSpaceShare(pressure, boundary, allocationRule);
      expect(result.shareOfAllocatedBudget).toBe(0.05); // 50 / 1000
      expect(result.allocationRuleName).toBe("SBTi Corporate 1.5C Sectoral Decarbonization");
      expect(result.allocationRuleDate).toBe("2026-01-15");
    });

    it("Decision M-5: boundaries and physical pressures are NEVER converted to money or added to netBenefit", () => {
      const action = {
        id: "act-clean",
        actionLeverage: 3.5,
        marginalNetTotalBenefitNpv: 100000,
        marginalOrgBenefitNpv: 80000,
        marginalWorldBenefitNpv: 20000,
        climatePressure: calculatePressure(10000, "kWh", "elec-grid-tw-2023")
      };

      // Ensure climate pressure remains in pressure units only (tCO2e)
      expect(action.climatePressure.pressureUnit).toBe("tCO2e");
      expect(action.climatePressure.pressureValue).toBe(4.95);

      // Net benefit and leverage are unchanged by attaching a climate pressure
      expect(action.marginalNetTotalBenefitNpv).toBe(100000);
      expect(action.actionLeverage).toBe(3.5);
      expect(action.climatePressure).not.toHaveProperty("monetizedValue");
      expect(action.climatePressure).not.toHaveProperty("socialCostOfCarbon");
    });
  });
});
