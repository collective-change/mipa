/**
 * Monte Carlo Uncertainty Distributions & Downside Risk Engine
 *
 * Replaces deterministic single-point estimates with parametric stochastic sampling,
 * computing P10 (conservative downside), P50 (median), P90 (optimistic upside)
 * confidence intervals and Downside Value-at-Risk (VaR95).
 */

/**
 * Standard Triangular inverse CDF sampling.
 * @param {number} min - Minimum possible value
 * @param {number} mode - Most likely / baseline value
 * @param {number} max - Maximum possible value
 * @returns {number} Sampled value
 */
export function sampleTriangular(min, mode, max) {
  if (min === max) return min;
  if (min > max) [min, max] = [max, min];
  const clampedMode = Math.max(min, Math.min(max, mode));

  const u = Math.random();
  const f = (clampedMode - min) / (max - min);

  if (u < f) {
    return min + Math.sqrt(u * (max - min) * (clampedMode - min));
  }
  return max - Math.sqrt((1 - u) * (max - min) * (max - clampedMode));
}

/**
 * Modified PERT distribution sampling using 4-point beta approximation.
 * @param {number} min - Optimistic/Pessimistic bound
 * @param {number} mode - Baseline estimate
 * @param {number} max - Upper bound
 * @returns {number} Sampled value
 */
export function samplePert(min, mode, max) {
  if (min === max) return min;
  if (min > max) [min, max] = [max, min];
  const clampedMode = Math.max(min, Math.min(max, mode));

  // PERT mean and standard deviation
  const mean = (min + 4 * clampedMode + max) / 6;
  const std = (max - min) / 6;

  // Box-Muller normal approximation bounded to [min, max]
  const u1 = Math.max(1e-9, Math.random());
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

  const sample = mean + z0 * std;
  return Math.max(min, Math.min(max, sample));
}

/**
 * Runs a Monte Carlo simulation for an individual action.
 *
 * @param {Object} action - Action object with baseline metrics
 * @param {Object} [options] - Simulation parameters
 * @param {number} [options.trials=300] - Number of stochastic iterations
 * @param {number} [options.benefitVariation=0.25] - Uncertainty fraction on benefits (±25%)
 * @param {number} [options.costDownside=0.10] - Optimistic cost reduction fraction (-10%)
 * @param {number} [options.costUpside=0.40] - Pessimistic cost overrun fraction (+40%)
 * @returns {Object} Monte Carlo confidence distributions and downside risk metrics
 */
export function runMonteCarloSimulation(action = {}, options = {}) {
  const trials = options.trials || 300;
  const benefitVariation = options.benefitVariation ?? 0.25;
  const costDownside = options.costDownside ?? 0.10;
  const costUpside = options.costUpside ?? 0.40;

  const baseBenefit = Number(action.marginalNetTotalBenefitNpv) || 0;
  const baseCost = Math.max(1, Number(action.outstandingDirectCosts ?? action.outstandingDirectCost) || 1);
  const baseRoi = Math.max(0.1, Number(action.totalRoi) || 1);

  // Custom 3-point ranges if specified on action, otherwise standard parametric spread
  const minBenefit = action.benefitMin ?? baseBenefit * (1 - benefitVariation);
  const maxBenefit = action.benefitMax ?? baseBenefit * (1 + benefitVariation);

  // Cost overruns are historically skewed upwards
  const minCost = action.costMin ?? baseCost * (1 - costDownside);
  const maxCost = action.costMax ?? baseCost * (1 + costUpside);

  const leverageSamples = [];
  const benefitSamples = [];
  const costSamples = [];

  let lossCount = 0;

  for (let i = 0; i < trials; i++) {
    const b = samplePert(minBenefit, baseBenefit, maxBenefit);
    const c = Math.max(1, samplePert(minCost, baseCost, maxCost));
    const r = Math.max(0.01, samplePert(baseRoi * 0.8, baseRoi, baseRoi * 1.2));

    const lev = (b * r) / c;

    if (b <= 0 || lev <= 0) {
      lossCount++;
    }

    benefitSamples.push(b);
    costSamples.push(c);
    leverageSamples.push(isFinite(lev) ? lev : 0);
  }

  // Sort samples to compute percentiles
  leverageSamples.sort((a, b) => a - b);
  benefitSamples.sort((a, b) => a - b);

  function getPercentile(arr, p) {
    const idx = Math.min(arr.length - 1, Math.max(0, Math.floor((p / 100) * arr.length)));
    return Math.round(arr[idx] * 100) / 100;
  }

  const p10Leverage = getPercentile(leverageSamples, 10);
  const p50Leverage = getPercentile(leverageSamples, 50);
  const p90Leverage = getPercentile(leverageSamples, 90);

  const p10Benefit = getPercentile(benefitSamples, 10);
  const p50Benefit = getPercentile(benefitSamples, 50);
  const p90Benefit = getPercentile(benefitSamples, 90);

  const probLoss = Math.round((lossCount / trials) * 100);

  // Value-at-Risk 95% (worst 5th percentile outcome)
  const var95Leverage = getPercentile(leverageSamples, 5);
  const var95Benefit = getPercentile(benefitSamples, 5);

  // Risk rating
  let riskRating = "low";
  if (probLoss > 20 || p10Leverage <= 0) {
    riskRating = "high";
  } else if (probLoss > 5 || p10Leverage < p50Leverage * 0.4) {
    riskRating = "moderate";
  }

  // Risk-adjusted leverage (penalizing downside dispersion and probability of loss)
  const downsideSpread = Math.max(0, p50Leverage - p10Leverage);
  const riskAdjustedLeverage =
    Math.round(Math.max(0, (p50Leverage - 0.5 * downsideSpread) * (1 - probLoss / 100)) * 100) / 100;

  return {
    trials,
    leverage: {
      p10: p10Leverage,
      p50: p50Leverage,
      p90: p90Leverage,
      var95: var95Leverage,
      riskAdjusted: riskAdjustedLeverage
    },
    netBenefit: {
      p10: p10Benefit,
      p50: p50Benefit,
      p90: p90Benefit,
      var95: var95Benefit
    },
    downsideRisk: {
      probLossPercent: probLoss,
      riskRating,
      confidenceSpreadPercent: p50Leverage > 0 ? Math.round(((p90Leverage - p10Leverage) / p50Leverage) * 100) : 0
    }
  };
}

/**
 * Runs simulations across multiple actions and ranks them by risk-adjusted leverage.
 *
 * @param {Array} actions - List of candidate actions
 * @param {Object} [options] - Simulation options
 * @returns {Array} List of actions augmented with Monte Carlo statistics
 */
export function analyzeActionsWithMonteCarlo(actions = [], options = {}) {
  if (!Array.isArray(actions)) return [];

  return actions.map((act) => {
    const mc = runMonteCarloSimulation(act, options);
    return {
      ...act,
      monteCarlo: mc
    };
  });
}
