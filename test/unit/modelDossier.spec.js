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
});
