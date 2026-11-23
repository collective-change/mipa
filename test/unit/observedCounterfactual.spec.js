// @vitest-environment node

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { signedSqrt } from "@/utils/leverage";
import {
  COUNTERFACTUAL_METHODS,
  ARM_TYPES,
  VALUE_FLAGS,
  getCounterfactualMethodLabel,
  formatCounterfactualStatement,
  deriveValueFlags,
  determineMeasuredArm,
  buildActionCounterfactualSummary
} from "@/utils/counterfactual";
import { buildDossierSummary } from "@/utils/modelDossier";
import {
  node,
  message,
  runCalc,
  mockFirebaseModules,
  FIXED_NOW,
  YEAR_S
} from "./calc/harness.js";

let actionsInFirestore = [];
const fb = mockFirebaseModules(() => actionsInFirestore);
vi.mock("firebase/app", () => fb.app);
vi.mock("firebase/auth", () => fb.auth);
vi.mock("firebase/firestore", () => fb.firestore);

const MATHJS_YEAR_S = 365.25 * 24 * 3600;

beforeEach(() => {
  actionsInFirestore = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXED_NOW);
  for (const level of ["log", "table", "error", "warn"]) {
    vi.spyOn(console, level).mockImplementation(() => {});
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function actionModel() {
  return {
    nodes: [
      node("avgCost", "50"),
      node("effort", "0"),
      node("spending", "0", { unit: "USD" }),
      node("trees", "100"),
      node("worldBenefit", "$trees * 1 USD", {
        unit: "USD",
        blockingInfluencers: ["trees"]
      }),
      node("orgBenefit", "0", { unit: "USD" }),
      node("orgCost", "$spending + $effort * 50 USD", {
        unit: "USD",
        blockingInfluencers: ["spending", "effort"]
      }),
      node("worldCost", "0", { unit: "USD" })
    ],
    roleNodes: {
      averageEffortCostPerHour: "avgCost",
      effort: "effort",
      spending: "spending",
      orgBenefit: "orgBenefit",
      orgCost: "orgCost",
      worldBenefit: "worldBenefit",
      worldCost: "worldCost"
    }
  };
}

function testAction(id, extra = {}) {
  return {
    id,
    title: id,
    impacts: [
      {
        nodeId: "trees",
        operation: "+",
        operand: 50,
        durationType: "forever",
        impactType: "if_done"
      }
    ],
    estEffortHrs: 10,
    estSpending: 100,
    outstandingSpending: 100,
    effortCostPerHrType: "use_average",
    ...extra
  };
}

async function calcActions(actions) {
  const { nodes, roleNodes } = actionModel();
  const run = await runCalc(
    message(nodes, { calculationType: "actions", roleNodes, actions })
  );
  expect(run.error).toBeUndefined();
  return run.results[1].actionsResults;
}

// NPV of a constant yearly amount across simulation time points, discounted at 5%/year
function npvOfConstant(amount, points = 5) {
  let npv = 0;
  for (let i = 0; i < points; i++) {
    const tYears = (i * MATHJS_YEAR_S) / YEAR_S;
    npv += amount / Math.pow(1.05, tYears);
  }
  return npv;
}

describe("MIPA-40: Accept an OBSERVED counterfactual & Attribution Loop", () => {
  describe("1. Counterfactual metadata & helper utilities", () => {
    it("provides canonical comparison methods with human-readable labels", () => {
      expect(COUNTERFACTUAL_METHODS.length).toBeGreaterThanOrEqual(5);
      const did = COUNTERFACTUAL_METHODS.find(m => m.id === "difference_in_differences");
      expect(did).toBeDefined();
      expect(did.label).toBe("Difference-in-Differences (DiD)");
      expect(getCounterfactualMethodLabel("difference_in_differences")).toBe(
        "Difference-in-Differences (DiD)"
      );
    });

    it("formats the required canonical statement when counterfactual is measured", () => {
      const cf = {
        armType: ARM_TYPES.MEASURED,
        method: "difference_in_differences",
        attributionDate: "2026-11-18",
        assumptions: "Parallel trends held in pre-treatment baseline years 2021-2024",
        limits: "Spillover possible across contiguous district boundaries"
      };

      const statement = formatCounterfactualStatement(cf);
      expect(statement).toBe(
        "The counterfactual is observed, chosen by Difference-in-Differences (DiD), on 2026-11-18."
      );
    });

    it("formats default unobserved message when counterfactual is declared", () => {
      expect(formatCounterfactualStatement(null)).toBe(
        "The counterfactual is declared baseline projection (unobserved)."
      );
      expect(formatCounterfactualStatement({ armType: ARM_TYPES.DECLARED })).toBe(
        "The counterfactual is declared baseline projection (unobserved)."
      );
    });

    it("derives declared / measured / forecast flags for ranking values", () => {
      // Declared action
      const declaredAction = { counterfactual: { armType: ARM_TYPES.DECLARED } };
      const flagsDec = deriveValueFlags(declaredAction);
      expect(flagsDec.counterfactual).toBe(VALUE_FLAGS.DECLARED);
      expect(flagsDec.actionLeverage).toBe(VALUE_FLAGS.DECLARED);
      expect(determineMeasuredArm(declaredAction)).toBe("none (declared)");

      // Measured action with empirical points
      const measuredAction = {
        counterfactual: {
          armType: ARM_TYPES.MEASURED,
          method: "matched_cohort",
          series: [
            { date: "2026-01-01", value: 10, type: "measured" },
            { date: "2027-01-01", value: 12, type: "measured" }
          ]
        }
      };
      const flagsMeas = deriveValueFlags(measuredAction);
      expect(flagsMeas.counterfactual).toBe(VALUE_FLAGS.MEASURED);
      expect(flagsMeas.actionLeverage).toBe(VALUE_FLAGS.MEASURED);
      expect(determineMeasuredArm(measuredAction)).toBe("counterfactual");

      // Measured action containing forecast points
      const forecastAction = {
        counterfactual: {
          armType: ARM_TYPES.MEASURED,
          method: "synthetic_control",
          series: [
            { date: "2026-01-01", value: 10, type: "measured" },
            { date: "2027-01-01", value: 15, type: "forecast" }
          ]
        }
      };
      const flagsFc = deriveValueFlags(forecastAction);
      expect(flagsFc.counterfactual).toBe(VALUE_FLAGS.FORECAST);
      expect(flagsFc.actionLeverage).toBe(VALUE_FLAGS.FORECAST);
    });

    it("stores and presents method assumptions and limits without silent omission", () => {
      const action = {
        counterfactual: {
          armType: ARM_TYPES.MEASURED,
          method: "randomized_control",
          attributionDate: "2026-06-15",
          assumptions: "Cluster randomization at facility level prevents patient spillover",
          limits: "Attrition of 8% in rural clinics during monsoon period",
          series: [{ date: "2026-01-01", value: 5, citation: "Trial Registry NCT-001" }]
        }
      };

      const summary = buildActionCounterfactualSummary(action);
      expect(summary.isMeasured).toBe(true);
      expect(summary.assumptions).toBe(
        "Cluster randomization at facility level prevents patient spillover"
      );
      expect(summary.limits).toBe(
        "Attrition of 8% in rural clinics during monsoon period"
      );
      expect(summary.hasAssumptions).toBe(true);
      expect(summary.hasLimits).toBe(true);
      expect(summary.series[0].citation).toBe("Trial Registry NCT-001");
    });
  });

  describe("2. Simulation with Declared vs Observed Counterfactual (calcWorker)", () => {
    it("preserves exact existing calculation behavior for declared actions (no breaking change)", async () => {
      const [result] = await calcActions([testAction("declaredPlant")]);

      const cost = 10 * 50 + 100; // 600
      const benefit = npvOfConstant(50);
      const net = benefit - cost;
      const roi = net / cost;

      const n = result.effectiveResultsNumbers;
      expect(n.outstandingDirectCosts).toBe(cost);
      expect(n.marginalWorldBenefitNpv).toBeCloseTo(benefit, 9);
      expect(n.totalRoi).toBeCloseTo(roi, 9);
      expect(n.actionLeverage).toBeCloseTo(signedSqrt(((net * roi) / cost) * Math.sign(net)), 9);

      // Verify counterfactual status on declared action
      expect(n.counterfactualStatus).toBe("declared");
      expect(n.valueFlags.actionLeverage).toBe("declared");
      expect(n.counterfactualStatement).toBe(
        "The counterfactual is declared baseline projection (unobserved)."
      );
      expect(n.measuredArm).toBe("none (declared)");
    });

    it("computes marginal benefits and leverage against an OBSERVED counterfactual series", async () => {
      // In the treated arm, trees = 100 + 50 = 150.
      // In this observed counterfactual, control trees are measured at 120 across all time steps.
      // Therefore, marginal benefit is (150 - 120) = 30 per time step instead of 50.
      const observedAction = testAction("observedPlant", {
        counterfactual: {
          armType: "measured",
          method: "difference_in_differences",
          attributionDate: "2026-01-01",
          assumptions: "Contiguous control forest plots showed parallel baseline growth",
          limits: "Edge effect potential at western clearing border",
          series: [
            {
              date: "2026-01-01",
              nodeId: "trees",
              value: 120,
              type: "measured",
              citation: "National Forest Inventory 2026",
              provenance: "Survey plot NFI-42"
            },
            {
              date: "2030-01-01",
              nodeId: "trees",
              value: 120,
              type: "measured",
              citation: "National Forest Inventory 2030",
              provenance: "Survey plot NFI-42"
            }
          ]
        }
      });

      const [result] = await calcActions([observedAction]);
      const n = result.effectiveResultsNumbers;

      const cost = 10 * 50 + 100; // 600
      const expectedMarginalTrees = 30; // 50 (if done) - 20 (observed if not done)
      const expectedBenefit = npvOfConstant(expectedMarginalTrees);
      const expectedNet = expectedBenefit - cost;
      const expectedRoi = expectedNet / cost;
      const expectedLeverage = signedSqrt(((expectedNet * expectedRoi) / cost) * Math.sign(expectedNet));

      expect(n.marginalWorldBenefitNpv).toBeCloseTo(expectedBenefit, 6);
      expect(n.totalRoi).toBeCloseTo(expectedRoi, 6);
      expect(n.actionLeverage).toBeCloseTo(expectedLeverage, 6);

      // Verify counterfactual metadata on result
      expect(n.counterfactualStatus).toBe("measured");
      expect(n.counterfactualMethod).toBe("difference_in_differences");
      expect(n.counterfactualMethodLabel).toBe("Difference-in-Differences (DiD)");
      expect(n.counterfactualDate).toBe("2026-01-01");
      expect(n.counterfactualStatement).toBe(
        "The counterfactual is observed, chosen by Difference-in-Differences (DiD), on 2026-01-01."
      );
      expect(n.counterfactualAssumptions).toBe(
        "Contiguous control forest plots showed parallel baseline growth"
      );
      expect(n.counterfactualLimits).toBe(
        "Edge effect potential at western clearing border"
      );
      expect(n.measuredArm).toBe("counterfactual");
      expect(n.valueFlags.actionLeverage).toBe("measured");
      expect(n.valueFlags.totalRoi).toBe("measured");
    });

    it("tags ranking value flag as 'forecast' when counterfactual series contains predicted values", async () => {
      const forecastAction = testAction("forecastPlant", {
        counterfactual: {
          armType: "measured",
          method: "synthetic_control",
          attributionDate: "2026-01-01",
          assumptions: "Synthetic weights fit pre-treatment trends",
          limits: "Future macro shifts may diverge weights",
          series: [
            { date: "2026-01-01", nodeId: "trees", value: 110, type: "measured" },
            { date: "2030-01-01", nodeId: "trees", value: 125, type: "forecast" }
          ]
        }
      });

      const [result] = await calcActions([forecastAction]);
      const n = result.effectiveResultsNumbers;

      expect(n.counterfactualStatus).toBe("forecast");
      expect(n.valueFlags.actionLeverage).toBe("forecast");
      expect(n.valueFlags.totalRoi).toBe("forecast");
    });
  });

  describe("3. Dossier Integration (modelDossier)", () => {
    it("embeds counterfactual arm provenance and value flags into rankedActions in buildDossierSummary", () => {
      const actions = [
        testAction("act1", {
          actionLeverage: 12.5,
          counterfactual: {
            armType: "measured",
            method: "matched_cohort",
            attributionDate: "2026-05-01",
            assumptions: "Propensity score matching on 8 covariates",
            limits: "Unmeasured clinic leadership quality",
            series: [
              { date: "2026-01-01", value: 15, type: "measured", citation: "Study A" }
            ]
          }
        }),
        testAction("act2", {
          actionLeverage: 4.2
        })
      ];

      const dossier = buildDossierSummary({
        model: { name: "Health Resilience" },
        actions
      });

      expect(dossier.rankedActions).toHaveLength(2);

      const top = dossier.rankedActions[0];
      expect(top.id).toBe("act1");
      expect(top.counterfactualArm.isMeasured).toBe(true);
      expect(top.counterfactualArm.method).toBe("matched_cohort");
      expect(top.counterfactualArm.methodLabel).toBe("Matched Cohort Comparison");
      expect(top.counterfactualArm.statement).toBe(
        "The counterfactual is observed, chosen by Matched Cohort Comparison, on 2026-05-01."
      );
      expect(top.counterfactualArm.assumptions).toBe(
        "Propensity score matching on 8 covariates"
      );
      expect(top.counterfactualArm.limits).toBe("Unmeasured clinic leadership quality");
      expect(top.valueFlags.actionLeverage).toBe("measured");
      expect(top.measuredArm).toBe("counterfactual");

      const second = dossier.rankedActions[1];
      expect(second.id).toBe("act2");
      expect(second.counterfactualArm.isMeasured).toBe(false);
      expect(second.valueFlags.actionLeverage).toBe("declared");
      expect(second.measuredArm).toBe("none (declared)");
    });
  });
});
