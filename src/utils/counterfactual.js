/**
 * Counterfactual and Attribution Design utilities (MIPA-40).
 *
 * Implements the observation loop that turns declared counterfactuals into measured ones:
 * 1. An action can carry an observed no-action series alongside declared baseline.
 * 2. Every value used in a ranking carries a declared / measured / forecast flag.
 * 3. Records state which arm is measured ("the counterfactual is observed, chosen by <method>, on <date>").
 * 4. Comparison method assumptions and limitations are explicitly stored and displayed.
 */

export const VALUE_FLAGS = Object.freeze({
  DECLARED: "declared",
  MEASURED: "measured",
  FORECAST: "forecast"
});

export const ARM_TYPES = Object.freeze({
  DECLARED: "declared",
  MEASURED: "measured"
});

export const COUNTERFACTUAL_METHODS = Object.freeze([
  {
    id: "randomized_control",
    label: "Randomized Controlled Trial (RCT)",
    description: "Random allocation between treated and control units."
  },
  {
    id: "matched_cohort",
    label: "Matched Cohort Comparison",
    description: "Units matched on observable pre-treatment characteristics."
  },
  {
    id: "difference_in_differences",
    label: "Difference-in-Differences (DiD)",
    description: "Compares pre-post changes between treated and comparison groups under parallel trends."
  },
  {
    id: "synthetic_control",
    label: "Synthetic Control",
    description: "Weighted combination of comparison units reproducing pre-intervention trajectory."
  },
  {
    id: "natural_experiment",
    label: "Natural Experiment",
    description: "Exogenous policy variation or geographic boundary threshold."
  },
  {
    id: "interrupted_time_series",
    label: "Interrupted Time Series",
    description: "Continuous pre- and post-intervention trajectory in the absence of concurrent shocks."
  },
  {
    id: "other",
    label: "Other Empirical Comparison",
    description: "Custom empirical comparison design."
  }
]);

/**
 * Returns the human-readable label for a comparison method.
 *
 * @param {string} methodId
 * @returns {string}
 */
export function getCounterfactualMethodLabel(methodId) {
  if (!methodId) return "Unspecified Comparison Method";
  const found = COUNTERFACTUAL_METHODS.find(m => m.id === methodId);
  return found ? found.label : String(methodId);
}

/**
 * Formats the canonical statement describing the counterfactual arm.
 *
 * Acceptance Criterion 3:
 * "The counterfactual is observed, chosen by <method>, on <date>" instead of assuming it.
 *
 * @param {Object} counterfactual
 * @returns {string}
 */
export function formatCounterfactualStatement(counterfactual) {
  if (!counterfactual || counterfactual.armType !== ARM_TYPES.MEASURED) {
    return "The counterfactual is declared baseline projection (unobserved).";
  }

  const methodLabel = getCounterfactualMethodLabel(counterfactual.method);
  const dateStr = counterfactual.attributionDate || "unspecified date";
  return `The counterfactual is observed, chosen by ${methodLabel}, on ${dateStr}.`;
}

/**
 * Derives the provenance status flag (declared / measured / forecast) for values used in a ranking.
 *
 * Acceptance Criterion 2:
 * Every value used in a ranking carries a declared / measured / forecast flag.
 *
 * @param {Object} action
 * @param {Object} [results]
 * @returns {Object}
 */
export function deriveValueFlags(action = {}, results = {}) {
  const cf = action.counterfactual || results.counterfactualArm || null;
  const isCfMeasured = cf && cf.armType === ARM_TYPES.MEASURED && Array.isArray(cf.series) && cf.series.length > 0;

  let cfStatus = VALUE_FLAGS.DECLARED;
  if (isCfMeasured) {
    const hasForecast = cf.series.some(pt => pt && (pt.type === VALUE_FLAGS.FORECAST || pt.isPredicted));
    cfStatus = hasForecast ? VALUE_FLAGS.FORECAST : VALUE_FLAGS.MEASURED;
  }

  // Treatment arm status
  let treatmentStatus = VALUE_FLAGS.DECLARED;
  if (action.treatmentStatus) {
    treatmentStatus = action.treatmentStatus;
  }

  // Overall ranking value flag (actionLeverage, netBenefit, ROI)
  let rankingFlag = VALUE_FLAGS.DECLARED;
  if (cfStatus === VALUE_FLAGS.FORECAST || treatmentStatus === VALUE_FLAGS.FORECAST) {
    rankingFlag = VALUE_FLAGS.FORECAST;
  } else if (cfStatus === VALUE_FLAGS.MEASURED || treatmentStatus === VALUE_FLAGS.MEASURED) {
    rankingFlag = VALUE_FLAGS.MEASURED;
  }

  return {
    actionLeverage: rankingFlag,
    marginalNetTotalBenefitNpv: rankingFlag,
    totalRoi: rankingFlag,
    outstandingDirectCosts: VALUE_FLAGS.DECLARED,
    counterfactual: cfStatus,
    treatment: treatmentStatus
  };
}

/**
 * Returns which arm is measured (treatment, counterfactual, both, or none).
 *
 * @param {Object} action
 * @returns {"counterfactual" | "treatment" | "both" | "none (declared)"}
 */
export function determineMeasuredArm(action = {}) {
  const flags = deriveValueFlags(action);
  const isCf = flags.counterfactual === VALUE_FLAGS.MEASURED || flags.counterfactual === VALUE_FLAGS.FORECAST;
  const isTx = flags.treatment === VALUE_FLAGS.MEASURED || flags.treatment === VALUE_FLAGS.FORECAST;

  if (isCf && isTx) return "both";
  if (isCf) return "counterfactual";
  if (isTx) return "treatment";
  return "none (declared)";
}

/**
 * Builds a structured counterfactual summary for an action to be embedded in dossiers and records.
 *
 * @param {Object} action
 * @returns {Object}
 */
export function buildActionCounterfactualSummary(action = {}) {
  const cf = action.counterfactual || {};
  const isMeasured = cf.armType === ARM_TYPES.MEASURED && Array.isArray(cf.series) && cf.series.length > 0;
  const method = cf.method || null;
  const methodLabel = method ? getCounterfactualMethodLabel(method) : null;
  const attributionDate = cf.attributionDate || null;
  const statement = formatCounterfactualStatement(cf);
  const assumptions = cf.assumptions || "";
  const limits = cf.limits || "";
  const flags = deriveValueFlags(action);
  const measuredArm = determineMeasuredArm(action);

  const series = Array.isArray(cf.series)
    ? cf.series.map(pt => ({
        date: pt.date || "",
        timeS: pt.timeS ?? (pt.date ? Math.floor(new Date(pt.date).getTime() / 1000) : null),
        value: Number(pt.value) || 0,
        nodeId: pt.nodeId || null,
        type: pt.type || (pt.isPredicted ? VALUE_FLAGS.FORECAST : VALUE_FLAGS.MEASURED),
        provenance: pt.provenance || "",
        citation: pt.citation || "",
        citationUrl: pt.citationUrl || ""
      }))
    : [];

  return {
    armType: isMeasured ? ARM_TYPES.MEASURED : ARM_TYPES.DECLARED,
    isMeasured,
    status: flags.counterfactual,
    method,
    methodLabel,
    attributionDate,
    statement,
    assumptions,
    limits,
    hasAssumptions: Boolean(assumptions && assumptions.trim().length > 0),
    hasLimits: Boolean(limits && limits.trim().length > 0),
    series,
    seriesCount: series.length,
    valueFlags: flags,
    measuredArm
  };
}
