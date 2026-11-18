import { describe, it, expect, vi } from "vitest";
import { buildDossierSummary, printDossierBrief } from "@/utils/modelDossier";

describe("modelDossier.js utility", () => {
  const mockModel = {
    id: "mod-1",
    name: "Surge Logistics Model",
    description: "Disaster surge volunteer and inventory model"
  };

  const mockNodes = [
    { id: "n1", symbol: "VC", name: "Volunteer Capacity", initialValue: 100, units: "volunteers", formula: "100" },
    { id: "n2", symbol: "RS", name: "Relief Supplies", initialValue: 50, units: "tons", formula: "VC * 0.5", influencers: ["n1"] }
  ];

  const mockActions = [
    { id: "a1", title: "Standard Dispatch", actionLeverage: 1.45, netBenefitNpv: 50000, totalRoi: 1.8 },
    { id: "a2", title: "Regional Pre-positioning Hub", actionLeverage: 4.85, netBenefitNpv: 240000, totalRoi: 3.2 }
  ];

  it("builds dossier summary with accurate factor counts and ranked actions", () => {
    const dossier = buildDossierSummary({
      model: mockModel,
      nodes: mockNodes,
      actions: mockActions,
      org: { name: "Humanitarian Alliance", subscriptionTier: "community" }
    });

    expect(dossier.modelTitle).toBe("Surge Logistics Model");
    expect(dossier.orgName).toBe("Humanitarian Alliance");
    expect(dossier.factorsCount).toBe(2);
    expect(dossier.actionsCount).toBe(2);

    // Actions should be ranked by leverage descending
    expect(dossier.rankedActions[0].id).toBe("a2");
    expect(dossier.rankedActions[0].actionLeverage).toBe(4.85);

    // Community tier should contain collective-change.org attribution
    expect(dossier.attributionFooter).toContain("collective-change.org");
    expect(dossier.isUnbranded).toBe(false);
  });

  it("applies in-memory factor perturbation without mutating baseline values", () => {
    const perturbations = { n1: 25 }; // +25% on Volunteer Capacity
    const dossier = buildDossierSummary({
      model: mockModel,
      nodes: mockNodes,
      actions: mockActions,
      perturbations
    });

    const factor = dossier.factors.find(f => f.id === "n1");
    expect(factor.baseValue).toBe(100);
    expect(factor.perturbedValue).toBe(125);
    expect(factor.shiftPercent).toBe(25);
  });

  it("generates unbranded dossier for pro and enterprise subscription tiers", () => {
    const dossierPro = buildDossierSummary({
      model: mockModel,
      nodes: mockNodes,
      actions: mockActions,
      org: { subscriptionTier: "pro" }
    });
    expect(dossierPro.isUnbranded).toBe(true);
    expect(dossierPro.attributionFooter).toBeNull();

    const dossierEnterprise = buildDossierSummary({
      model: mockModel,
      nodes: mockNodes,
      actions: mockActions,
      org: { subscriptionTier: "enterprise" }
    });
    expect(dossierEnterprise.isUnbranded).toBe(true);
    expect(dossierEnterprise.attributionFooter).toBeNull();
  });

  it("printDossierBrief invokes window.print and restores title", () => {
    const printSpy = vi.fn();
    window.print = printSpy;

    printDossierBrief("Test Brief");
    expect(printSpy).toHaveBeenCalled();
  });

  it("calculates portfolio climate pressures and preserves action pressure provenance in the dossier (MIPA-30)", () => {
    const actionsWithPressures = [
      {
        id: "a1",
        title: "Solar Transition",
        actionLeverage: 3.5,
        climatePressure: {
          activityQuantity: 50000,
          activityUnit: "kWh",
          pressureValue: 24.75,
          pressureUnit: "tCO2e",
          scope: 2,
          factorId: "elec-grid-tw-2023",
          factorName: "Electricity Grid Mix (Taiwan)",
          authority: "Bureau of Energy, MOEA & IPCC AR6",
          citationUrl: "https://www.moeaea.gov.tw",
          licence: "Open Government Data Licence v1.0",
          version: "AR6-2023v1",
          geography: "TW"
        }
      },
      {
        id: "a2",
        title: "Fleet Route Redesign",
        actionLeverage: 4.2,
        climatePressure: {
          activityQuantity: 2000,
          activityUnit: "litres",
          pressureValue: 5.36,
          pressureUnit: "tCO2e",
          scope: 1,
          factorId: "fuel-diesel-stationary-ar6",
          factorName: "Diesel Fuel Combustion",
          authority: "GHG Protocol & IPCC AR6 Vol 2 Energy",
          citationUrl: "https://ghgprotocol.org/calculation-tools-and-guidance",
          licence: "CC BY 4.0",
          version: "AR6-2021v1",
          geography: "GLOBAL"
        }
      },
      {
        id: "a3",
        title: "Staff Volunteer Training",
        actionLeverage: 1.2,
        climatePressure: null
      }
    ];

    const dossier = buildDossierSummary({
      model: mockModel,
      nodes: mockNodes,
      actions: actionsWithPressures
    });

    expect(dossier.portfolioPressures).toBeDefined();
    expect(dossier.portfolioPressures.totalTCO2e).toBe(30.11); // 24.75 + 5.36
    expect(dossier.portfolioPressures.unit).toBe("tCO2e");
    expect(dossier.portfolioPressures.byScope.scope1).toBe(5.36);
    expect(dossier.portfolioPressures.byScope.scope2).toBe(24.75);
    expect(dossier.portfolioPressures.actionsWithPressureCount).toBe(2);

    expect(dossier.actionPressures).toBeDefined();
    expect(dossier.actionPressures.length).toBe(2);

    const solarPressure = dossier.actionPressures.find(p => p.actionId === "a1");
    expect(solarPressure.actionTitle).toBe("Solar Transition");
    expect(solarPressure.authority).toBe("Bureau of Energy, MOEA & IPCC AR6");
    expect(solarPressure.citationUrl).toBe("https://www.moeaea.gov.tw");
    expect(solarPressure.licence).toBe("Open Government Data Licence v1.0");
    expect(solarPressure.version).toBe("AR6-2023v1");
    expect(solarPressure.geography).toBe("TW");
  });
});
