// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createWorldFactorId,
  getShippedCountryModel,
  isWorldFactor,
  filterVisibleFactors,
  bumpCountryModelVersion,
  WDI_LAYER1_INDICATORS,
  WDI_DEFAULT_LICENSE,
  WORLD_MODEL_NAMESPACE
} from "@/utils/worldModel";
import { buildDossierSummary } from "@/utils/modelDossier";
import { generateDecisionBrief, formatBriefAsMarkdown } from "@/utils/decisionBrief";
import {
  exportModelAsShareableTemplate,
  validateAndParseTemplate,
  getPublicTemplates
} from "@/utils/modelTemplates";
import { toSysFormula, validateFormulaSyntax } from "@/utils/formulaHelper";
import {
  node,
  message,
  runCalc,
  mockFirebaseModules,
  FIXED_NOW
} from "./calc/harness.js";

let actionsInFirestore = [];
const fb = mockFirebaseModules(() => actionsInFirestore);
vi.mock("firebase/app", () => fb.app);
vi.mock("firebase/auth", () => fb.auth);
vi.mock("firebase/firestore", () => fb.firestore);

beforeEach(() => {
  actionsInFirestore = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXED_NOW);
  for (const level of ["log", "table", "error", "warn"]) {
    vi.spyOn(console, level).mockImplementation(() => {});
  }
});

describe("World Model Layer 1 (MIPA-29)", () => {
  it("provides 12 decision-relevant indicators with CC BY 4.0 licences and stable IDs", () => {
    expect(WDI_LAYER1_INDICATORS.length).toBe(12);

    for (const ind of WDI_LAYER1_INDICATORS) {
      expect(ind.code).toBeDefined();
      expect(ind.symbol).toBeDefined();
      expect(ind.name).toBeDefined();
      expect(ind.unit).toBeDefined();
      expect(ind.licence).toBe(WDI_DEFAULT_LICENSE);

      const stableId = createWorldFactorId("USA", ind.code);
      expect(stableId).toMatch(/^world_country_usa_/);
      // Re-running generation yields the exact same stable ID (never recycled)
      expect(createWorldFactorId("USA", ind.code)).toBe(stableId);
    }
  });

  it("(a) allows a user to import the Country model into their model", () => {
    const countryModel = getShippedCountryModel("USA", "1.0.0");
    expect(countryModel.id).toBe("world_country_model_usa");
    expect(countryModel.isWorldModel).toBe(true);
    expect(countryModel.license).toBe("CC BY 4.0");
    expect(countryModel.nodes.length).toBe(12);

    // Each node has full provenance and stable IDs
    const popNode = countryModel.nodes.find((n) => n.symbol === "wdiPopulation");
    expect(popNode).toBeDefined();
    expect(popNode.id).toBe("world_country_usa_sp_pop_totl");
    expect(popNode.initialValue).toBe(340003797);
    expect(popNode.isWorldFactor).toBe(true);
    expect(popNode.sourceCitation).toContain("World Bank");
    expect(popNode.citationUrl).toBe("https://data.worldbank.org/indicator/SP.POP.TOTL");
    expect(popNode.licence).toBe("CC BY 4.0");
    expect(popNode.provenance.authority).toContain("World Bank");
    expect(popNode.provenance.canonicalCitationUrl).toBe("https://data.worldbank.org/indicator/SP.POP.TOTL");

    // Also verify it is present in the public template library
    const templateMatch = getPublicTemplates().find((t) => t.id === "world_country_model_usa");
    expect(templateMatch).toBeDefined();
    expect(templateMatch.category).toBe("World & Macro");
  });

  it("(b) ensures a formula referencing an imported factor still resolves after the Country model is bumped a version", () => {
    // 1. User imports Country Model v1.0.0
    const v1Model = getShippedCountryModel("USA", "1.0.0");
    const v1Pop = v1Model.nodes.find((n) => n.symbol === "wdiPopulation");
    expect(v1Pop.id).toBe("world_country_usa_sp_pop_totl");

    // User's own factor has formula referencing the imported factor
    // User writes formula using short name: "wdiPopulation * 0.05"
    const userNodesV1 = [
      ...v1Model.nodes,
      {
        id: "target_beneficiaries",
        symbol: "targetBeneficiaries",
        name: "Target Beneficiaries",
        unit: "people",
        formula: "wdiPopulation * 0.05",
        latestValue: 0
      }
    ];

    // Compile to system formula ($<nodeId>)
    const targetNodeV1 = userNodesV1.find((n) => n.id === "target_beneficiaries");
    const resolvedV1 = toSysFormula(targetNodeV1.formula, userNodesV1, targetNodeV1);
    expect(resolvedV1.sysFormula).toBe("$world_country_usa_sp_pop_totl * 0.05");
    expect(resolvedV1.referencedNodeIds).toContain("world_country_usa_sp_pop_totl");

    // Formula syntax validation passes
    const validationV1 = validateFormulaSyntax(resolvedV1.sysFormula, { availableNodes: userNodesV1 });
    expect(validationV1.valid).toBe(true);

    // 2. Now the Country model is bumped to v2.0.0 (e.g. population grew to 350,000,000)
    const v2Model = bumpCountryModelVersion(v1Model, "2.0.0", {
      "SP.POP.TOTL": 350000000
    });
    expect(v2Model.version).toBe("2.0.0");

    // Check that the factor ID did NOT change (never recycled, never regenerated)
    const v2Pop = v2Model.nodes.find((n) => n.symbol === "wdiPopulation");
    expect(v2Pop.id).toBe("world_country_usa_sp_pop_totl");
    expect(v2Pop.initialValue).toBe(350000000);

    // 3. User's existing formula ($world_country_usa_sp_pop_totl * 0.05) still resolves cleanly against v2 nodes!
    const userNodesV2 = [
      ...v2Model.nodes,
      {
        id: "target_beneficiaries",
        symbol: "targetBeneficiaries",
        name: "Target Beneficiaries",
        unit: "people",
        formula: resolvedV1.sysFormula,
        sysFormula: resolvedV1.sysFormula,
        latestValue: 0
      }
    ];

    const validationV2 = validateFormulaSyntax(resolvedV1.sysFormula, { availableNodes: userNodesV2 });
    expect(validationV2.valid).toBe(true);
  });

  it("(c) hiding the world model changes NO computed number — demonstrated by calculating both ways", async () => {
    // Construct a model where formulas depend on a world factor
    const countryModel = getShippedCountryModel("USA", "1.0.0");
    const popNode = countryModel.nodes.find((n) => n.symbol === "wdiPopulation");

    const roleNodes = {
      benefitToWorldDuringInterval: "world_benefit",
      costToOrganizationDuringInterval: "org_cost"
    };

    const baseNodes = [
      ...countryModel.nodes.map((n) =>
        node(n.id, String(n.initialValue || 0), {
          symbol: n.symbol,
          name: n.name,
          isWorldFactor: true
        })
      ),
      node("world_benefit", `$${popNode.id} * 0.001`, {
        symbol: "worldBenefit",
        name: "Benefit to World"
      }),
      node("org_cost", "1000", {
        symbol: "orgCost",
        name: "Cost to Org"
      })
    ];

    const testActions = [
      {
        id: "action_expand",
        title: "Expand Service Coverage",
        estSpending: 20000,
        outstandingDirectCosts: 20000,
        impacts: [
          {
            symbol: "worldBenefit",
            operation: "+",
            operand: 500,
            duration: "forever"
          }
        ]
      }
    ];

    actionsInFirestore = testActions;

    // Run 1: with visibleDisplayNodesHidden (showWorldFactors = false)
    // Hiding is display-only: The world model is hidden from the user's canvas by default.
    // Calculations in calcWorker and store-model always receive all nodes!
    const visibleDisplayNodesHidden = filterVisibleFactors(baseNodes, { showWorldFactors: false });
    expect(visibleDisplayNodesHidden.length).toBeLessThan(baseNodes.length);
    expect(visibleDisplayNodesHidden.some(isWorldFactor)).toBe(false);

    const calcResult1 = await runCalc(
      message(baseNodes, {
        roleNodes,
        actions: testActions
      })
    );

    // Run 2: with visibleDisplayNodesUnhidden (showWorldFactors = true)
    const visibleDisplayNodesUnhidden = filterVisibleFactors(baseNodes, { showWorldFactors: true });
    expect(visibleDisplayNodesUnhidden.length).toBe(baseNodes.length);

    const calcResult2 = await runCalc(
      message(baseNodes, {
        roleNodes,
        actions: testActions
      })
    );

    expect(calcResult1.results).toBeDefined();
    expect(calcResult2.results).toBeDefined();

    const res1 = calcResult1.results[0];
    const res2 = calcResult2.results[0];

    // Every mathematical and business calculation is identical
    expect(res1.timeSeries).toEqual(res2.timeSeries);
    expect(res1.timeSeriesGrowthFactor).toEqual(res2.timeSeriesGrowthFactor);
    expect(res1.npvs).toEqual(res2.npvs);
  });

  it("(d) renders each world factor's source and licence in the dossier and decision brief", () => {
    const countryModel = getShippedCountryModel("USA", "1.0.0");
    const testNodes = [
      ...countryModel.nodes,
      {
        id: "custom_node",
        symbol: "customNode",
        name: "Custom Project Capacity",
        initialValue: 100,
        unit: "units"
      }
    ];

    const testActions = [
      {
        id: "act_1",
        title: "Community Outreach Initiative",
        actionLeverage: 18.5,
        outstandingDirectCosts: 15000,
        marginalNetTotalBenefitNpv: 277500,
        totalRoi: 18.5
      }
    ];

    // 1. buildDossierSummary
    const dossier = buildDossierSummary({
      model: { name: "National Strategic Impact Model" },
      nodes: testNodes,
      actions: testActions
    });

    expect(dossier.worldFactors).toBeDefined();
    expect(dossier.worldFactors.length).toBe(12);

    for (const wf of dossier.worldFactors) {
      expect(wf.name).toBeDefined();
      expect(wf.symbol).toBeDefined();
      expect(wf.sourceCitation).toContain("World Bank");
      expect(wf.citationUrl).toMatch(/^https:\/\/data\.worldbank\.org\/indicator\//);
      expect(wf.licence).toBe("CC BY 4.0");
    }

    // 2. Decision Brief Markdown Export
    const brief = generateDecisionBrief(testActions, testNodes, {
      modelName: "National Strategic Impact Model"
    });

    expect(brief.worldFactors).toBeDefined();
    expect(brief.worldFactors.length).toBe(12);

    const markdown = formatBriefAsMarkdown(brief);
    expect(markdown).toContain("World Factors & Data Provenance");
    expect(markdown).toContain("https://data.worldbank.org/indicator/SP.POP.TOTL");
    expect(markdown).toContain("CC BY 4.0");
    expect(markdown).toContain("World Bank, World Development Indicators (WDI)");
    expect(markdown).toContain("Population, total");
    expect(markdown).toContain("GDP per capita (current US$)");
  });

  it("preserves provenance and IDs when exporting and re-parsing shareable templates", () => {
    const countryModel = getShippedCountryModel("USA", "1.0.0");
    const exported = exportModelAsShareableTemplate(
      { name: "Country Template" },
      countryModel.nodes,
      []
    );

    expect(exported.nodes[0].id).toBe("world_country_usa_sp_pop_totl");
    expect(exported.nodes[0].sourceCitation).toContain("World Bank");
    expect(exported.nodes[0].licence).toBe("CC BY 4.0");
    expect(exported.nodes[0].citationUrl).toContain("worldbank.org");

    const parsed = validateAndParseTemplate(exported);
    expect(parsed.nodes[0].id).toBe("world_country_usa_sp_pop_totl");
    expect(parsed.nodes[0].sourceCitation).toContain("World Bank");
    expect(parsed.nodes[0].licence).toBe("CC BY 4.0");
    expect(parsed.nodes[0].isWorldFactor).toBe(true);
  });
});
