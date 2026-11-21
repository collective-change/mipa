import { detectFeedbackLoops, detectSystemArchetypes } from "@/utils/systemDynamics";
import { runMonteCarloSimulation } from "@/utils/monteCarlo";
import { isWorldFactor } from "@/utils/worldModel";
import { sumPortfolioPressures } from "@/utils/conversionFactors";
import { buildActionCounterfactualSummary } from "@/utils/counterfactual";
import {
  generateCoverageStatement,
  formatDimensionWeightSource,
  SDG_INDICATOR_CROSSWALK,
  DIMENSION_KINDS,
  DIMENSION_STATES
} from "@/utils/dimensions";
import { buildSampleOrg, sampleCurrencyFor } from "@/utils/sample-org";
import { compileDraftNodes, ROLE_SYMBOLS } from "@/utils/util-model-draft";

const SAMPLE_STEPS = 120;
const MONTH_SECONDS = 2629800;
const SECONDS_PER_YEAR = 31556952;
const YEARLY_DISCOUNT_RATE = 0.05;
const SAMPLE_MONEY_SCALE = { USD: 1, TWD: 30 };

function simulateSampleTrajectory(scale, overrides = {}) {
  const recruitDelta = overrides.recruitDelta || 0;
  const foodDonatedDeltaKg = overrides.foodDonatedDeltaKg || 0;
  const oneTimeEffortHrs = overrides.oneTimeEffortHrs || 0;
  const oneTimeSpendingInit = overrides.oneTimeSpending || 0;

  const avgHourlyCost = 15 * scale;
  const coordinatorHourlyCost = 25 * scale;
  const newVolunteers = 4 + recruitDelta;
  const leavingRate = 0.08;
  const hoursPerVolunteer = 6;
  const mealsPackedPerHour = 10;
  const foodDonatedKg = 2000 + foodDonatedDeltaKg;
  const mealsPerKg = 2;
  const foodAvailableInMeals = foodDonatedKg * mealsPerKg;
  const valueOfAMeal = 3 * scale;
  const monthlyRunningCosts = 1200 * scale;

  const seriesBySymbol = {
    [ROLE_SYMBOLS.averageEffortCostPerHour]: [],
    [ROLE_SYMBOLS.effort]: [],
    [ROLE_SYMBOLS.spending]: [],
    [ROLE_SYMBOLS.orgCost]: [],
    [ROLE_SYMBOLS.worldCost]: [],
    [ROLE_SYMBOLS.orgBenefit]: [],
    [ROLE_SYMBOLS.worldBenefit]: [],
    volunteers: [],
    newVolunteersPerMonth: [],
    volunteersLeavingPerMonth: [],
    hoursPerVolunteer: [],
    mealsPackedPerHour: [],
    packingCapacity: [],
    foodDonatedKg: [],
    mealsPerKg: [],
    foodAvailableInMeals: [],
    mealsServed: [],
    valueOfAMeal: [],
    monthlyRunningCosts: [],
    coordinatorPerHour: []
  };

  for (let step = 0; step <= SAMPLE_STEPS; step++) {
    const oneTimeEffort = step === 0 ? oneTimeEffortHrs : 0;
    const oneTimeSpending = step === 0 ? oneTimeSpendingInit : 0;
    const prevVolunteers = step === 0 ? 40 : seriesBySymbol.volunteers[step - 1];
    const volunteers = prevVolunteers + newVolunteers - prevVolunteers * leavingRate;
    const packingCapacity = volunteers * hoursPerVolunteer * mealsPackedPerHour;
    const mealsServed = Math.min(packingCapacity, foodAvailableInMeals);

    seriesBySymbol[ROLE_SYMBOLS.averageEffortCostPerHour].push(avgHourlyCost);
    seriesBySymbol[ROLE_SYMBOLS.effort].push(oneTimeEffort);
    seriesBySymbol[ROLE_SYMBOLS.spending].push(oneTimeSpending);
    seriesBySymbol[ROLE_SYMBOLS.orgCost].push(
      monthlyRunningCosts + oneTimeSpending + oneTimeEffort * avgHourlyCost
    );
    seriesBySymbol[ROLE_SYMBOLS.worldCost].push(0);
    seriesBySymbol[ROLE_SYMBOLS.orgBenefit].push(0);
    seriesBySymbol[ROLE_SYMBOLS.worldBenefit].push(mealsServed * valueOfAMeal);
    seriesBySymbol.volunteers.push(volunteers);
    seriesBySymbol.newVolunteersPerMonth.push(newVolunteers);
    seriesBySymbol.volunteersLeavingPerMonth.push(leavingRate);
    seriesBySymbol.hoursPerVolunteer.push(hoursPerVolunteer);
    seriesBySymbol.mealsPackedPerHour.push(mealsPackedPerHour);
    seriesBySymbol.packingCapacity.push(packingCapacity);
    seriesBySymbol.foodDonatedKg.push(foodDonatedKg);
    seriesBySymbol.mealsPerKg.push(mealsPerKg);
    seriesBySymbol.foodAvailableInMeals.push(foodAvailableInMeals);
    seriesBySymbol.mealsServed.push(mealsServed);
    seriesBySymbol.valueOfAMeal.push(valueOfAMeal);
    seriesBySymbol.monthlyRunningCosts.push(monthlyRunningCosts);
    seriesBySymbol.coordinatorPerHour.push(coordinatorHourlyCost);
  }

  return seriesBySymbol;
}

function getSampleMarginalNpv(ifDoneSeries, baselineSeries) {
  let npv = 0;
  for (let step = 0; step <= SAMPLE_STEPS; step++) {
    const tYears = (step * MONTH_SECONDS) / SECONDS_PER_YEAR;
    npv += (ifDoneSeries[step] - baselineSeries[step]) / Math.pow(1 + YEARLY_DISCOUNT_RATE, tYears);
  }
  return npv;
}

function simulateSampleAction(action, baselineSeries, scale) {
  let recruitDelta = 0;
  let foodDonatedDeltaKg = 0;
  for (const imp of action.impacts || []) {
    if (imp.symbol === "newVolunteersPerMonth" && imp.operation === "+") {
      recruitDelta += Number(imp.operand) || 0;
    } else if (imp.symbol === "foodDonatedKg" && imp.operation === "+") {
      foodDonatedDeltaKg += Number(imp.operand) || 0;
    }
  }

  const estEffortHrs = Number(action.estEffortHrs) || 0;
  const estSpending = Math.max(0, Number(action.estSpending) || 0);
  const hourlyCost = (action.effortCostSymbol === "coordinatorPerHour" ? 25 : 15) * scale;
  const outstandingDirectCosts = estEffortHrs * hourlyCost + estSpending;

  const ifDone = simulateSampleTrajectory(scale, {
    recruitDelta,
    foodDonatedDeltaKg,
    oneTimeEffortHrs: estEffortHrs,
    oneTimeSpending: estSpending
  });

  const rawOrgBenefit = getSampleMarginalNpv(ifDone[ROLE_SYMBOLS.orgBenefit], baselineSeries[ROLE_SYMBOLS.orgBenefit]);
  const rawOrgCost = getSampleMarginalNpv(ifDone[ROLE_SYMBOLS.orgCost], baselineSeries[ROLE_SYMBOLS.orgCost]);
  const rawWorldBenefit = getSampleMarginalNpv(ifDone[ROLE_SYMBOLS.worldBenefit], baselineSeries[ROLE_SYMBOLS.worldBenefit]);
  const rawWorldCost = getSampleMarginalNpv(ifDone[ROLE_SYMBOLS.worldCost], baselineSeries[ROLE_SYMBOLS.worldCost]);

  const marginalOrgBenefitNpv = (rawOrgBenefit > 0 ? rawOrgBenefit : 0) + (rawOrgCost < 0 ? -rawOrgCost : 0);
  const marginalOrgCostNpv = (rawOrgCost > 0 ? rawOrgCost : 0) + (rawOrgBenefit < 0 ? -rawOrgBenefit : 0);
  const marginalWorldBenefitNpv = (rawWorldBenefit > 0 ? rawWorldBenefit : 0) + (rawWorldCost < 0 ? -rawWorldCost : 0);
  const marginalWorldCostNpv = (rawWorldCost > 0 ? rawWorldCost : 0) + (rawWorldBenefit < 0 ? -rawWorldBenefit : 0);

  const marginalTotalBenefitNpv = marginalOrgBenefitNpv + marginalWorldBenefitNpv;
  const marginalTotalCostNpv = marginalOrgCostNpv + marginalWorldCostNpv;
  const marginalNetTotalBenefitNpv = marginalTotalBenefitNpv - marginalTotalCostNpv;
  const totalCostDenominator = outstandingDirectCosts + Math.max(0, marginalTotalCostNpv - outstandingDirectCosts);

  const totalRoi = totalCostDenominator > 0 ? marginalNetTotalBenefitNpv / totalCostDenominator : null;
  const actionLeverage =
    outstandingDirectCosts > 0 && totalRoi !== null
      ? ((marginalNetTotalBenefitNpv * totalRoi) / outstandingDirectCosts) * Math.sign(marginalNetTotalBenefitNpv)
      : null;

  return {
    id: `sample_${action.key}`,
    key: action.key,
    title: action.title,
    description: action.notes || "",
    notes: action.notes || "",
    estEffortHrs,
    estSpending,
    outstandingDirectCosts,
    marginalOrgBenefitNpv,
    marginalOrgCostNpv,
    marginalWorldBenefitNpv,
    marginalWorldCostNpv,
    marginalTotalBenefitNpv,
    marginalTotalCostNpv,
    marginalNetTotalBenefitNpv,
    totalRoi,
    actionLeverage,
    effectiveResultsNumbers: {
      outstandingDirectCosts,
      marginalTotalBenefitNpv,
      marginalTotalCostNpv,
      marginalNetTotalBenefitNpv,
      totalRoi,
      actionLeverage
    }
  };
}

/**
 * Builds a structured, self-contained executive model dossier.
 *
 * @param {Object} params
 * @param {Object} params.model
 * @param {Array} params.nodes
 * @param {Array} params.actions
 * @param {Object} [params.org]
 * @param {Object} [params.perturbations] Map of nodeId -> percentage shift (e.g. +20, -15)
 * @returns {Object} Structured dossier summary
 */
export function buildDossierSummary({
  model = {},
  nodes = [],
  actions = [],
  org = null,
  perturbations = {}
}) {
  const modelTitle = model.name || "Strategic Coordination Model";
  const modelDescription = model.description || "";
  const orgName = (org && org.name) || model.orgName || "Strategic Leadership Council";
  const tier = (org && org.subscriptionTier) || "community";
  const isUnbranded = tier === "pro" || tier === "enterprise";

  // Build factor list with in-memory sandbox perturbation values
  const factorSummaries = (nodes || []).map(node => {
    const shiftPercent = Number(perturbations[node.id]) || 0;
    const baseVal = Number(node.initialValue) || 0;
    const perturbedVal = shiftPercent !== 0 ? baseVal * (1 + shiftPercent / 100) : baseVal;

    const sourceCitation =
      node.sourceCitation ||
      (node.provenance && (node.provenance.citation || node.provenance.authority)) ||
      "";
    const citationUrl =
      node.citationUrl ||
      (node.provenance && node.provenance.canonicalCitationUrl) ||
      "";
    const licence =
      node.licence ||
      node.license ||
      (node.provenance && (node.provenance.licence || node.provenance.license)) ||
      "";
    const isWorld = Boolean(node.isWorldFactor || isWorldFactor(node));

    return {
      id: node.id,
      symbol: node.symbol || node.name || "F",
      name: node.name || node.symbol || "Factor",
      baseValue: baseVal,
      perturbedValue: Number(perturbedVal.toFixed(2)),
      shiftPercent,
      formula: node.formula || "",
      units: node.units || node.unit || "",
      description: node.description || node.notes || "",
      sourceCitation,
      citationUrl,
      licence,
      license: licence,
      isWorldFactor: isWorld,
      confidence: node.confidence || (node.isEstimate ? "low" : null),
      isEstimate: Boolean(node.isEstimate),
      isOutcome: node.isOutcome,
      omissionRecord: node.omissionRecord || null,
      version: node.version || "",
      provenance: node.provenance || null
    };
  });

  // Collect shipped world factors and sourced factors for provenance audit
  const worldFactors = factorSummaries.filter(
    (f) => f.isWorldFactor || f.licence || f.citationUrl
  );

  // Sort candidate actions by simulated leverage descending and attach counterfactual provenance
  const rankedActions = [...(actions || [])]
    .map(action => {
      const cfSummary = buildActionCounterfactualSummary(action);
      return {
        ...action,
        counterfactualArm: cfSummary,
        valueFlags: action.valueFlags || cfSummary.valueFlags,
        measuredArm: action.measuredArm || cfSummary.measuredArm
      };
    })
    .sort((a, b) => {
      const levA = Number(a.actionLeverage) || 0;
      const levB = Number(b.actionLeverage) || 0;
      return levB - levA;
    });

  // System dynamics structural analysis
  const loops = detectFeedbackLoops(nodes || []);
  const archetypes = detectSystemArchetypes(nodes || [], loops);

  // Sum climate pressures across the ranked actions portfolio (MIPA-30 / Layer 3)
  const portfolioPressures = sumPortfolioPressures(rankedActions);
  const actionPressures = rankedActions
    .filter(a => a.climatePressure && typeof a.climatePressure.pressureValue === "number")
    .map(a => ({
      actionId: a.id,
      actionTitle: a.title,
      ...a.climatePressure
    }));

  // Monte Carlo distribution across top actions
  let monteCarloSummary = null;
  if (rankedActions.length > 0) {
    const topAction = rankedActions[0];
    monteCarloSummary = runMonteCarloSimulation(topAction, {
      iterations: 300
    });
  }

  // Governance dimensions and coverage statement (MIPA-33)
  const dimensions = Array.isArray(model.dimensions) ? model.dimensions : [];
  const coverageStatement = generateCoverageStatement(dimensions);
  const animalWelfareDimension = dimensions.find(
    d => d.id === "dim_animal_welfare" || (d.name && d.name.toLowerCase().includes("animal"))
  );

  const attributionFooter = isUnbranded
    ? null
    : "Simulated on collective-change.org · An Open Platform for Strategic Coordination";

  return {
    modelTitle,
    modelDescription,
    orgName,
    tier,
    isUnbranded,
    factorsCount: factorSummaries.length,
    actionsCount: rankedActions.length,
    factors: factorSummaries,
    worldFactors,
    dimensions,
    coverageStatement,
    sdgCrosswalk: SDG_INDICATOR_CROSSWALK,
    animalWelfare: animalWelfareDimension
      ? {
          ...animalWelfareDimension,
          weightSourceFormatted: formatDimensionWeightSource(animalWelfareDimension.weight)
        }
      : null,
    rankedActions,
    portfolioPressures,
    actionPressures,
    loopsCount: loops.length,
    reinforcingLoopsCount: loops.filter(l => l.polarity === "reinforcing").length,
    balancingLoopsCount: loops.filter(l => l.polarity === "balancing").length,
    archetypes,
    topAction: rankedActions[0] || null,
    monteCarloSummary,
    attributionFooter,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Builds the localized sample food-bank model, factors, and pre-simulated
 * actions for public `/m/:modelId` visitors when no public Firestore model is loaded.
 *
 * @param {Object} [params]
 * @param {string} [params.modelId="sample"]
 * @param {Function} [params.t] i18n translator function
 * @param {string} [params.locale="en-us"]
 * @returns {{ org: Object, model: Object, nodes: Array, actions: Array }}
 */
export function buildSampleDossierData({ modelId = "sample", t, locale = "en-us" } = {}) {
  const translate = typeof t === "function" ? t : key => key;
  const currency = sampleCurrencyFor(locale);
  const scale = SAMPLE_MONEY_SCALE[currency] || 1;
  const sample = buildSampleOrg(translate, currency);
  const compiled = compileDraftNodes(sample, symbol => `sample_${symbol}`);
  const baselineSeries = simulateSampleTrajectory(scale);

  const nodes = compiled.map(node => ({
    ...node,
    initialValue: Number((baselineSeries[node.symbol]?.[0] ?? 0).toFixed(2)),
    formula: node.symbolFormula,
    units: node.unit || "",
    description: node.notes || ""
  }));

  const actions = sample.actions.map(action =>
    simulateSampleAction(action, baselineSeries, scale)
  );

  return {
    org: sample.org,
    model: {
      id: modelId || "sample",
      name: sample.org.name,
      description: sample.org.goal,
      orgName: sample.org.name,
      currency,
      isSample: true
    },
    nodes,
    actions
  };
}

/**
 * Triggers the browser print dialog optimized for saving as an Executive PDF Brief.
 *
 * @param {string} [title] Document title for PDF filename
 */
export function printDossierBrief(title = "Mipa Strategic Dossier") {
  const originalTitle = document.title;
  document.title = `${title} - Executive Decision Brief`;
  if (typeof window !== "undefined" && typeof window.print === "function") {
    window.print();
  }
  document.title = originalTitle;
}
