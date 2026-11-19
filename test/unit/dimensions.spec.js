// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  DIMENSION_KINDS,
  WEIGHT_SOURCE_TYPES,
  DIMENSION_STATES,
  ANIMAL_WELFARE_DIMENSION,
  SDG_LABEL_DIMENSION,
  BOUNDARY_LIMIT_DIMENSION,
  SDG_INDICATOR_CROSSWALK,
  declareDimension,
  getDimensionState,
  formatDimensionWeightSource,
  generateCoverageStatement,
  addAnimalWelfareDimensionToModel,
  assertNoMonetizedLimitsOrLabels
} from "@/utils/dimensions";
import { generateDecisionBrief, formatBriefAsMarkdown } from "@/utils/decisionBrief";
import { buildDossierSummary } from "@/utils/modelDossier";
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

describe("World Dimensions & Governance Architecture (MIPA-33)", () => {
  describe("Criterion 1: Declaring dimension kinds (value, limit, label)", () => {
    it("successfully declares dimensions with kinds value, limit, and label", () => {
      const valDim = declareDimension({
        id: "dim_val",
        name: "Community Health Value",
        kind: "value",
        physicalUnit: "DALYs averted"
      });
      expect(valDim.kind).toBe("value");
      expect(valDim.physicalUnit).toBe("DALYs averted");
      expect(valDim.weight.enabled).toBe(false);

      const limitDim = declareDimension({
        id: "dim_lim",
        name: "Freshwater Consumption Cap",
        kind: "limit",
        physicalUnit: "m³"
      });
      expect(limitDim.kind).toBe("limit");

      const labelDim = declareDimension({
        id: "dim_lbl",
        name: "SDG 12 Navigation",
        kind: "label"
      });
      expect(labelDim.kind).toBe("label");
    });

    it("rejects unknown dimension kinds", () => {
      expect(() => {
        declareDimension({
          id: "dim_invalid",
          name: "Invalid Kind",
          kind: "custom_scalar"
        });
      }).toThrow(/Dimension kind must be one of/);
    });

    it("identifies dimension state: weighted, shown_unweighted, or not_modelled", () => {
      // 1. Unweighted value dimension -> shown_unweighted
      expect(getDimensionState(ANIMAL_WELFARE_DIMENSION)).toBe(DIMENSION_STATES.SHOWN_UNWEIGHTED);

      // 2. Weighted value dimension -> weighted
      const weightedAnimal = {
        ...ANIMAL_WELFARE_DIMENSION,
        weight: { enabled: true, value: 0.25 }
      };
      expect(getDimensionState(weightedAnimal)).toBe(DIMENSION_STATES.WEIGHTED);

      // 3. Limit dimension -> shown_unweighted (non-tradeable)
      expect(getDimensionState(BOUNDARY_LIMIT_DIMENSION)).toBe(DIMENSION_STATES.SHOWN_UNWEIGHTED);

      // 4. Label dimension -> shown_unweighted (navigates, never scores)
      expect(getDimensionState(SDG_LABEL_DIMENSION)).toBe(DIMENSION_STATES.SHOWN_UNWEIGHTED);

      // 5. Null or undefined -> not_modelled
      expect(getDimensionState(null)).toBe(DIMENSION_STATES.NOT_MODELLED);
    });
  });

  describe("Criterion 2: Unweighted value dimension changes NO ranking, labelled in decision document", () => {
    it("proves that an unweighted dimension changes NO ranking, and renders as a labelled fact with 'not included in the score'", async () => {
      // Setup a baseline operational model with 2 competing actions
      const roleNodes = {
        averageEffortCostPerHour: "avgCost",
        effort: "effort",
        spending: "spending",
        orgBenefit: "orgBenefit",
        orgCost: "orgCost",
        worldBenefit: "worldBenefit",
        worldCost: "worldCost"
      };

      const baseNodes = [
        node("avgCost", "50"),
        node("effort", "0"),
        node("spending", "0", { unit: "USD" }),
        node("trees", "100"),
        node("worldBenefit", "$trees * 1 USD", {
          unit: "USD",
          blockingInfluencers: ["trees"]
        }),
        node("orgBenefit", "0", { unit: "USD" }),
        node("orgCost", "$spending + $effort * 50 USD + 100 USD", {
          unit: "USD",
          blockingInfluencers: ["spending", "effort"]
        }),
        node("worldCost", "0", { unit: "USD" })
      ];

      function makeAction(id, title, outstandingDirectCosts, impacts, extra = {}) {
        return {
          id,
          title,
          impacts: impacts.map(imp => ({
            nodeId: imp.nodeId || imp.node,
            operation: imp.operation || "+",
            operand: imp.operand,
            durationType: "forever",
            impactType: "if_done"
          })),
          estEffortHrs: 0,
          effortCompletionPercentage: 0,
          estSpending: 0,
          outstandingSpending: 0,
          spentAmount: 0,
          effortCostPerHrType: "use_average",
          outstandingDirectCosts,
          ...extra
        };
      }

      const testActions = [
        makeAction("act_plant_more", "Reforestation Phase 2", 50, [
          { nodeId: "trees", operation: "+", operand: 50 }
        ]),
        makeAction("act_irrigate", "Irrigation Upgrade", 40, [
          { nodeId: "trees", operation: "+", operand: 30 }
        ])
      ];

      // Run 1: Baseline without animal welfare dimension
      actionsInFirestore = testActions;
      const simWithoutDimension = await runCalc(
        message(baseNodes, {
          calculationType: "actions",
          roleNodes,
          actions: testActions
        })
      );
      expect(simWithoutDimension.results.map(r => r.resultsType)).toEqual(["baseline", "actions"]);
      const actionsResultsWithout = simWithoutDimension.results[1].actionsResults;

      // Run 2: Model WITH unweighted animal welfare dimension added
      const modelWithAnimalDim = addAnimalWelfareDimensionToModel({
        id: "core_model",
        name: "Reforestation & Conservation"
      });
      expect(modelWithAnimalDim.dimensions).toHaveLength(1);
      expect(modelWithAnimalDim.dimensions[0].weight.enabled).toBe(false); // Off by default

      const nodesWithAnimalDim = [
        ...baseNodes,
        node("animal_years", "0", {
          name: "Animal-Years of Suffering",
          dimensionKind: "value",
          isWorldFactor: true
        })
      ];

      // Action 1 also affects animal years physically
      const actionsWithPhysicalImpact = [
        makeAction(
          "act_plant_more",
          "Reforestation Phase 2",
          50,
          [
            { nodeId: "trees", operation: "+", operand: 50 },
            { nodeId: "animal_years", operation: "+", operand: 120 }
          ],
          { animalYears: 120 }
        ),
        makeAction(
          "act_irrigate",
          "Irrigation Upgrade",
          40,
          [{ nodeId: "trees", operation: "+", operand: 30 }],
          { animalYears: 0 }
        )
      ];

      actionsInFirestore = actionsWithPhysicalImpact;
      const simWithDimension = await runCalc(
        message(nodesWithAnimalDim, {
          calculationType: "actions",
          roleNodes,
          actions: actionsWithPhysicalImpact
        })
      );
      expect(simWithDimension.results.map(r => r.resultsType)).toEqual(["baseline", "actions"]);
      const actionsResultsWith = simWithDimension.results[1].actionsResults;

      // ASSERTION 1: Ranking, leverage, and NPVs are 100% UNCHANGED by the unweighted dimension
      expect(actionsResultsWith.map(a => a.id)).toEqual(actionsResultsWithout.map(a => a.id));
      for (let i = 0; i < actionsResultsWith.length; i++) {
        const nWith = actionsResultsWith[i].effectiveResultsNumbers;
        const nWithout = actionsResultsWithout[i].effectiveResultsNumbers;
        expect(nWith.actionLeverage).toBeCloseTo(nWithout.actionLeverage, 5);
        expect(nWith.marginalNetTotalBenefitNpv).toBeCloseTo(nWithout.marginalNetTotalBenefitNpv, 5);
        expect(nWith.totalRoi).toBeCloseTo(nWithout.totalRoi, 5);
      }

      // ASSERTION 2: Renders as a labelled fact in the decision document: physical units,
      // the exact words "not included in the score", and names the dimension in the coverage statement
      const brief = generateDecisionBrief(
        actionsWithPhysicalImpact.map(a => {
          const calculated = actionsResultsWith.find(r => r.id === a.id);
          return {
            ...a,
            actionLeverage: calculated.effectiveResultsNumbers.actionLeverage,
            marginalNetTotalBenefitNpv: calculated.effectiveResultsNumbers.marginalNetTotalBenefitNpv,
            totalRoi: calculated.effectiveResultsNumbers.totalRoi
          };
        }),
        nodesWithAnimalDim,
        {
          model: modelWithAnimalDim,
          dimensions: modelWithAnimalDim.dimensions,
          locale: "en-us"
        }
      );

      // Verify unweighted dimensions captured in brief
      expect(brief.unweightedDimensions).toHaveLength(1);
      expect(brief.unweightedDimensions[0].name).toBe("Animal Welfare");
      expect(brief.unweightedDimensions[0].physicalUnit).toBe("animal-years");
      expect(brief.unweightedDimensions[0].label).toBe("not included in the score");

      // Verify Section 5 Coverage Statement
      expect(brief.section5.narrative).toContain("Dimension Coverage Statement");
      expect(brief.section5.narrative).toContain("Animal Welfare");
      expect(brief.section5.narrative).toContain("animal-years");
      expect(brief.section5.narrative).toContain("not included in the score");

      // Verify Markdown rendering contains physical units and "not included in the score"
      const markdown = formatBriefAsMarkdown(brief);
      expect(markdown).toContain("Physical Dimension Indicators (Not Included in the Score)");
      expect(markdown).toContain("Animal Welfare");
      expect(markdown).toContain("animal-years");
      expect(markdown).toContain("not included in the score");
      expect(markdown).toContain("Dimension Coverage Statement");
    });
  });

  describe("Criterion 3: Animal dimension in model, physical units column, moral weight off by default", () => {
    it("adds animal dimension with physical units, moral weight off by default, and names author and date when set", () => {
      const model = addAnimalWelfareDimensionToModel({ id: "model_1", name: "Community Kitchen" });
      const animalDim = model.dimensions[0];

      expect(animalDim.name).toBe("Animal Welfare");
      expect(animalDim.kind).toBe("value");
      expect(animalDim.physicalUnit).toBe("animal-years");
      expect(animalDim.weight.enabled).toBe(false); // Off by default

      // When weight is set, author and date are required and rendered
      const modelWithWeight = addAnimalWelfareDimensionToModel(
        { id: "model_1", name: "Community Kitchen" },
        {
          weight: {
            enabled: true,
            value: 0.35,
            source: WEIGHT_SOURCE_TYPES.PUBLISHED_STANDARD,
            sourceName: "Five Domains Framework",
            author: "Dr. David Mellor",
            sourceDate: "2026-11-18",
            uncertaintyBand: { min: 0.15, max: 0.6 }
          }
        }
      );

      const weightedDim = modelWithWeight.dimensions[0];
      expect(weightedDim.weight.enabled).toBe(true);
      expect(weightedDim.weight.author).toBe("Dr. David Mellor");
      expect(weightedDim.weight.sourceDate).toBe("2026-11-18");

      const renderedSource = formatDimensionWeightSource(weightedDim.weight, { isZh: false });
      expect(renderedSource).toContain("Published standard");
      expect(renderedSource).toContain("Five Domains Framework");
      expect(renderedSource).toContain("Author: Dr. David Mellor");
      expect(renderedSource).toContain("Date: 2026-11-18");
    });
  });

  describe("Criterion 4: Weight source is a first-class rendered field (org / counterparty / published standard)", () => {
    it("renders weight source with name and date for all three attribution types (Decision M-8)", () => {
      // 1. Organization weight
      const orgSource = formatDimensionWeightSource({
        enabled: true,
        value: 1.0,
        source: WEIGHT_SOURCE_TYPES.ORG,
        sourceName: "Tzu Chi Evaluation Board",
        author: "Chief Evaluation Officer",
        sourceDate: "2026-11-18"
      });
      expect(orgSource).toContain("Organization weight: \"Tzu Chi Evaluation Board\"");
      expect(orgSource).toContain("Author: Chief Evaluation Officer");
      expect(orgSource).toContain("Date: 2026-11-18");

      // 2. Counterparty requirement
      const counterpartySource = formatDimensionWeightSource({
        enabled: true,
        value: 0.5,
        source: WEIGHT_SOURCE_TYPES.COUNTERPARTY,
        sourceName: "Rockefeller Foundation RFP Spec",
        author: "Grant Review Committee",
        sourceDate: "2026-11-15"
      });
      expect(counterpartySource).toContain("Counterparty requirement: \"Rockefeller Foundation RFP Spec\"");
      expect(counterpartySource).toContain("Author: Grant Review Committee");
      expect(counterpartySource).toContain("Date: 2026-11-15");

      // 3. Published standard
      const standardSource = formatDimensionWeightSource({
        enabled: true,
        value: 0.25,
        source: WEIGHT_SOURCE_TYPES.PUBLISHED_STANDARD,
        sourceName: "Welfare Footprint Standard",
        author: "Welfare Footprint Project",
        sourceDate: "2026-10-01"
      });
      expect(standardSource).toContain("Published standard: \"Welfare Footprint Standard\"");
      expect(standardSource).toContain("Author: Welfare Footprint Project");
      expect(standardSource).toContain("Date: 2026-10-01");

      // Traditional Chinese rendering
      const zhStandardSource = formatDimensionWeightSource(
        {
          enabled: true,
          value: 0.25,
          source: WEIGHT_SOURCE_TYPES.PUBLISHED_STANDARD,
          sourceName: "動物福利五大領域模型",
          author: "梅勒教授研究團隊",
          sourceDate: "2026-11-18"
        },
        { isZh: true }
      );
      expect(zhStandardSource).toContain("公開標準");
      expect(zhStandardSource).toContain("動物福利五大領域模型");
      expect(zhStandardSource).toContain("制定者：梅勒教授研究團隊");
      expect(zhStandardSource).toContain("日期：2026-11-18");
    });
  });

  describe("Criterion 5: Action SDG target tags rendered in dossier, ZERO numeric figure produced", () => {
    it("renders SDG tags in the dossier and asserts zero numeric impact on scores", () => {
      const actions = [
        {
          id: "act_sdg",
          title: "Sustainable Food Recovery",
          actionLeverage: 12.4,
          netBenefitNpv: 50000,
          totalRoi: 2.5,
          sdgTargets: ["SDG 2.1", "SDG 12.3"]
        }
      ];

      const dossier = buildDossierSummary({
        model: {
          name: "Regional Food Logistics",
          dimensions: [ANIMAL_WELFARE_DIMENSION, SDG_LABEL_DIMENSION]
        },
        nodes: [],
        actions
      });

      expect(dossier.sdgCrosswalk).toBeDefined();
      expect(dossier.sdgCrosswalk.length).toBeGreaterThan(0);
      expect(dossier.rankedActions[0].sdgTargets).toEqual(["SDG 2.1", "SDG 12.3"]);

      // Verify crosswalk maps indicators to SDGs
      const co2Mapping = dossier.sdgCrosswalk.find(m => m.indicatorCode === "EN.ATM.CO2E.PC");
      expect(co2Mapping.sdgTarget).toBe("SDG 13.2");

      // Assert that SDG tags carry NO numeric multiplier or formula value
      for (const mapping of dossier.sdgCrosswalk) {
        expect(mapping.dimensionKind).toBe("label");
        expect(mapping.multiplier).toBeUndefined();
        expect(mapping.score).toBeUndefined();
        expect(mapping.dollarValue).toBeUndefined();
      }
    });
  });

  describe("Criterion 6: Architectural Invariant — NO code path converts label or limit into scalar (M-5 & M-6)", () => {
    it("asserts that limits and labels can NEVER enter netBenefit role nodes or carry currency units", () => {
      // 1. Normal model: valid
      const validNodes = [
        { id: "node_sales", name: "Sales", dimensionKind: "value", unit: "USD" },
        { id: "node_limit", name: "CO2 Ceiling", dimensionKind: "limit", isGuardrail: true, unit: "tCO2e" },
        { id: "node_label", name: "SDG Tag", dimensionKind: "label", unit: "" }
      ];
      expect(assertNoMonetizedLimitsOrLabels(validNodes, { orgBenefit: "node_sales" })).toBe(true);

      // 2. Reject limit assigned as orgBenefit or worldBenefit
      expect(() => {
        assertNoMonetizedLimitsOrLabels(validNodes, {
          orgBenefit: "node_limit"
        });
      }).toThrow(/cannot be assigned as a monetary net benefit\/cost role node/);

      // 3. Reject label assigned as worldBenefit
      expect(() => {
        assertNoMonetizedLimitsOrLabels(validNodes, {
          worldBenefit: "node_label"
        });
      }).toThrow(/cannot be assigned as a monetary net benefit\/cost role node/);

      // 4. Reject limit defined with a currency unit
      const monetizedLimit = [
        { id: "node_bad_limit", name: "Monetized Boundary", dimensionKind: "limit", unit: "USD" }
      ];
      expect(() => {
        assertNoMonetizedLimitsOrLabels(monetizedLimit, {});
      }).toThrow(/Limit guardrail "Monetized Boundary" cannot be defined in a currency unit/);
    });

    it("verifies calculation engine rejects calculation if a limit is assigned as a net benefit role node", async () => {
      const roleNodes = {
        averageEffortCostPerHour: "avgCost",
        effort: "effort",
        spending: "spending",
        orgBenefit: "limit_node", // VIOLATION of M-5: trying to monetize a boundary
        orgCost: "budget",
        worldBenefit: "limit_node",
        worldCost: "budget"
      };

      const nodes = [
        node("avgCost", "50"),
        node("effort", "0"),
        node("spending", "0", { unit: "USD" }),
        node("budget", "1000", { unit: "USD" }),
        node("limit_node", "50", {
          name: "Planetary Boundary Cap",
          dimensionKind: "limit",
          isGuardrail: true,
          unit: "threshold"
        })
      ];

      const testActions = [
        {
          id: "act_test",
          title: "Test Action",
          outstandingDirectCosts: 100,
          estEffortHrs: 0,
          effortCompletionPercentage: 0,
          estSpending: 0,
          outstandingSpending: 0,
          spentAmount: 0,
          effortCostPerHrType: "use_average",
          impacts: [
            {
              nodeId: "limit_node",
              operation: "+",
              operand: 10,
              durationType: "forever",
              impactType: "if_done"
            }
          ]
        }
      ];

      actionsInFirestore = testActions;
      const calcResult = await runCalc(
        message(nodes, {
          calculationType: "actions",
          roleNodes,
          actions: testActions
        })
      );

      // Must fail calculation rather than quietly converting the boundary to money
      expect(calcResult.error).toBeDefined();
      expect(calcResult.error.errorMessage).toContain("Architectural violation (M-5 / M-6)");
    });
  });
});
