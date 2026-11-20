import { detectFeedbackLoops, detectSystemArchetypes } from "./systemDynamics";

const EPSILON_SCALE = 1e-6;
const CONSTANT_TOLERANCE = 1e-9;

export function formatHorizonLabel(simulationParams = {}, seriesLength = 0) {
  const count =
    simulationParams.finalTimeNumber ??
    simulationParams.numTimeSteps ??
    (seriesLength > 1 ? seriesLength - 1 : 0);
  const unit = simulationParams.finalTimeUnit || simulationParams.timeStepUnit || "months";
  return `${count} ${unit}`;
}

/**
 * Numerical horizon check (MIPA-55 / MIPA-59):
 * Inspects calculated factor time series to identify any factor that is still rising
 * at the end of the simulation horizon without a decreasing rate of rise (i.e. no flattening).
 *
 * Tolerates constants, asymptotically flattening steady states, and oscillations.
 *
 * @param {Array} nodes - Model factor objects
 * @param {Object} baseline - Calculation baseline result `{ nodesValues, timeSPoints }`
 * @param {Object} [simulationParams] - Model simulation params for horizon wording
 * @returns {Array} List of unboundedly rising factor descriptors
 */
export function analyzeHorizonGrowth(nodes = [], baseline = {}, simulationParams = {}) {
  const nodesValues = baseline && baseline.nodesValues;
  if (!Array.isArray(nodes) || !nodesValues || typeof nodesValues !== "object") {
    return [];
  }

  const growing = [];

  for (const node of nodes) {
    if (!node || !node.id) continue;
    const rawSeries = nodesValues[node.id];
    if (!Array.isArray(rawSeries) || rawSeries.length < 3) continue;

    const series = rawSeries.filter((v) => typeof v === "number" && Number.isFinite(v));
    if (series.length < 3) continue;

    const min = Math.min(...series);
    const max = Math.max(...series);
    const range = max - min;
    const scale = Math.max(1, Math.abs(max), Math.abs(min));

    // Constants are not growth.
    if (range <= CONSTANT_TOLERANCE * scale) continue;

    const deltas = [];
    for (let i = 1; i < series.length; i++) {
      deltas.push(series[i] - series[i - 1]);
    }

    const eps = Math.max(EPSILON_SCALE * scale, EPSILON_SCALE * range);
    const lastDelta = deltas[deltas.length - 1];
    const prevDelta = deltas[deltas.length - 2];
    const endValue = series[series.length - 1];
    const startValue = series[0];

    // Must actually still be rising at the end of the horizon and not below an earlier peak.
    if (lastDelta <= eps) continue;
    if (max > endValue + eps) continue;

    // Periodic oscillation or damped overshoot reverses sign repeatedly across the horizon.
    let signFlips = 0;
    let lastNonZeroSign = 0;
    for (const d of deltas) {
      if (Math.abs(d) <= eps) continue;
      const sign = d > 0 ? 1 : -1;
      if (lastNonZeroSign !== 0 && sign !== lastNonZeroSign) signFlips++;
      lastNonZeroSign = sign;
    }
    if (signFlips >= 2) continue;

    // Rate of rise must not be decreasing (flattening/saturating curves decelerate toward a ceiling).
    const slopeTol = 1e-6 * Math.max(1, Math.abs(prevDelta), scale * EPSILON_SCALE);
    if (lastDelta < prevDelta - slopeTol) continue;

    const name = node.name || node.symbol || node.id;
    const symbol = node.symbol || node.id;
    const horizonLabel = formatHorizonLabel(simulationParams, series.length);

    growing.push({
      id: node.id,
      symbol,
      name,
      horizonLabel,
      startValue,
      endValue,
      lastDelta,
      message: `In this model, "${name}" (${symbol}) is still growing at ${horizonLabel} and has not begun to level off.`
    });
  }

  return growing;
}

function loopFactorNames(loop) {
  return (loop.factors || []).map((f) => f.name || f.symbol || f.id).filter(Boolean);
}

/**
 * Assesses a compiled trial model for feedback-loop limits, numerical horizon growth,
 * and factor connectivity before allowing silent acceptance.
 *
 * @param {Object} params
 * @param {Array} params.nodes - Compiled trial nodes
 * @param {Object|null} [params.baseline] - Baseline calculation result `{ nodesValues, timeSPoints }`
 * @param {Object} [params.simulationParams] - Model simulation parameters
 * @returns {Object} Full assessment with named limits, pairings, unlinked factors, growing factors, and repair messages
 */
export function assessDraftLimits({ nodes = [], baseline = null, simulationParams = {} } = {}) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const loops = detectFeedbackLoops(safeNodes);
  const archetypes = detectSystemArchetypes(safeNodes, loops);

  const reinforcingLoops = loops.filter((l) => l.type === "reinforcing");
  const balancingLoops = loops.filter((l) => l.type === "balancing");

  const namedLimits = balancingLoops.map((bLoop) => {
    const factorNames = loopFactorNames(bLoop);
    const factorSymbols = (bLoop.factors || []).map((f) => f.symbol || f.id).filter(Boolean);
    return {
      id: bLoop.id,
      code: bLoop.code,
      factorNames,
      factorSymbols,
      summary: `${bLoop.code}: ${factorNames.join(" -> ")}`
    };
  });

  const limitsArchetypeByRCode = new Map(
    archetypes
      .filter((a) => a.archetype === "limits_to_growth")
      .map((a) => [a.reinforcingLoop, a])
  );

  const bLoopByCode = new Map(balancingLoops.map((b) => [b.code, b]));

  const loopPairings = reinforcingLoops.map((rLoop) => {
    const archetype = limitsArchetypeByRCode.get(rLoop.code);
    const boundingCodes = archetype?.boundingBalancingLoops
      ? archetype.boundingBalancingLoops
      : balancingLoops
          .filter((bLoop) => rLoop.nodeIds.some((id) => bLoop.nodeIds.includes(id)))
          .map((bLoop) => bLoop.code);

    const boundingLimitNames = [];
    const seenNames = new Set();
    for (const bCode of boundingCodes) {
      const bLoop = bLoopByCode.get(bCode);
      if (!bLoop) continue;
      for (const name of loopFactorNames(bLoop)) {
        if (!seenNames.has(name)) {
          seenNames.add(name);
          boundingLimitNames.push(name);
        }
      }
    }

    const rFactorNames = loopFactorNames(rLoop);
    return {
      id: rLoop.id,
      code: rLoop.code,
      label: `${rLoop.code}: ${rFactorNames.join(" -> ")}`,
      factorNames: rFactorNames,
      bounded: boundingCodes.length > 0,
      boundingCodes,
      boundingLimitNames
    };
  });

  const unboundedReinforcingLoops = loopPairings.filter((p) => !p.bounded);

  const unlinkedFactors = safeNodes
    .filter((n) => n && n.class === "unlinked")
    .map((n) => ({
      id: n.id,
      symbol: n.symbol || n.id,
      name: n.name || n.symbol || n.id
    }));

  const hasBaseline = Boolean(baseline && baseline.nodesValues);
  const growingFactors = hasBaseline
    ? analyzeHorizonGrowth(safeNodes, baseline, simulationParams)
    : [];

  // Note: a bare balancing loop count (B >= 1) never passes on its own.
  // Any unbounded reinforcing loop, numerical unbounded growth, or unlinked factor fails the gate.
  const passed =
    unlinkedFactors.length === 0 &&
    unboundedReinforcingLoops.length === 0 &&
    growingFactors.length === 0;

  const repairErrors = [];
  if (unboundedReinforcingLoops.length > 0) {
    const list = unboundedReinforcingLoops
      .map((u) => `${u.code} (${u.factorNames.join(" -> ")})`)
      .join("; ");
    repairErrors.push(
      `Reinforcing growth loop(s) have no bounding balancing limit: ${list}. Name what real-world constraint slows or stops this growth and wire it into the loop.`
    );
  }
  if (growingFactors.length > 0) {
    for (const g of growingFactors) {
      repairErrors.push(
        `In this model, "${g.name}" (${g.symbol}) is still growing at ${g.horizonLabel} without leveling off. Add or strengthen the real-world limit that slows or caps this growth.`
      );
    }
  }
  if (unlinkedFactors.length > 0) {
    const list = unlinkedFactors.map((u) => `"${u.name}" (${u.symbol})`).join(", ");
    repairErrors.push(
      `These factors are unconnected (class = unlinked) and contribute nothing to the calculation: ${list}. Connect each to the model formulas and role factors, or remove unused ones.`
    );
  }

  return {
    passed,
    loops,
    archetypes,
    reinforcingLoops,
    balancingLoops,
    namedLimits,
    loopPairings,
    unboundedReinforcingLoops,
    unlinkedFactors,
    growingFactors,
    hasBaseline,
    horizonLabel: formatHorizonLabel(simulationParams, baseline?.timeSPoints?.length || 0),
    growthRuleSummary:
      "Numerical horizon rule: flags any factor still rising at the final time step whose step-to-step increase has not begun to shrink (constants, steady states, and oscillations are tolerated).",
    repairErrors
  };
}
