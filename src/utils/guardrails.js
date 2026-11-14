/**
 * Organizational Guardrails & Negative Side-Effect Detection Utility
 *
 * Evaluates simulated trajectories against designated factor threshold boundaries
 * to prevent high-leverage actions from inadvertently crashing vital organizational metrics.
 */

/**
 * Evaluates whether an action trajectory breaches any model factor guardrail boundaries.
 *
 * @param {Array} modelNodes - Array of factor objects from model
 * @param {Object} ifDoneNodesValues - Map of factor ID -> array of numbers under action
 * @param {Object} ifNotDoneNodesValues - Map of factor ID -> array of numbers without action
 * @param {Array} timeSPoints - Array of timestamps (seconds)
 * @returns {Array} List of breach violation objects
 */
export function evaluateGuardrailViolations(
  modelNodes = [],
  ifDoneNodesValues = {},
  ifNotDoneNodesValues = {},
  timeSPoints = []
) {
  if (!Array.isArray(modelNodes) || !ifDoneNodesValues) return [];

  const violations = [];

  for (const node of modelNodes) {
    const hasMin =
      node.guardrailMin !== undefined &&
      node.guardrailMin !== null &&
      node.guardrailMin !== "" &&
      !isNaN(Number(node.guardrailMin));
    const hasMax =
      node.guardrailMax !== undefined &&
      node.guardrailMax !== null &&
      node.guardrailMax !== "" &&
      !isNaN(Number(node.guardrailMax));

    if (!node.isGuardrail && !hasMin && !hasMax) continue;

    const minBound = hasMin ? Number(node.guardrailMin) : null;
    const maxBound = hasMax ? Number(node.guardrailMax) : null;

    const doneVals = ifDoneNodesValues[node.id];
    if (!Array.isArray(doneVals) || doneVals.length === 0) continue;

    const notDoneVals =
      ifNotDoneNodesValues && Array.isArray(ifNotDoneNodesValues[node.id])
        ? ifNotDoneNodesValues[node.id]
        : [];

    // Check minimum bound
    if (minBound !== null) {
      let worstDone = Infinity;
      let worstDoneIdx = -1;
      for (let i = 0; i < doneVals.length; i++) {
        const v = doneVals[i];
        if (typeof v === "number" && !isNaN(v) && v < worstDone) {
          worstDone = v;
          worstDoneIdx = i;
        }
      }

      if (worstDone < minBound) {
        let worstNotDone = Infinity;
        for (let i = 0; i < notDoneVals.length; i++) {
          const v = notDoneVals[i];
          if (typeof v === "number" && !isNaN(v) && v < worstNotDone) {
            worstNotDone = v;
          }
        }

        const isActionCaused = worstNotDone >= minBound;
        const isActionWorsened = worstDone < worstNotDone;

        violations.push({
          factorId: node.id,
          factorName: node.name || node.symbol || "Factor",
          factorSymbol: node.symbol || "",
          unit: node.unit || "",
          boundType: "min",
          threshold: minBound,
          worstValue: Math.round(worstDone * 100) / 100,
          timeIndex: worstDoneIdx,
          timeS: timeSPoints[worstDoneIdx] ?? null,
          breachMagnitude: Math.round(Math.abs(minBound - worstDone) * 100) / 100,
          isActionCaused,
          isActionWorsened,
          message: node.guardrailBreachMessage || ""
        });
      }
    }

    // Check maximum bound
    if (maxBound !== null) {
      let worstDone = -Infinity;
      let worstDoneIdx = -1;
      for (let i = 0; i < doneVals.length; i++) {
        const v = doneVals[i];
        if (typeof v === "number" && !isNaN(v) && v > worstDone) {
          worstDone = v;
          worstDoneIdx = i;
        }
      }

      if (worstDone > maxBound) {
        let worstNotDone = -Infinity;
        for (let i = 0; i < notDoneVals.length; i++) {
          const v = notDoneVals[i];
          if (typeof v === "number" && !isNaN(v) && v > worstNotDone) {
            worstNotDone = v;
          }
        }

        const isActionCaused = worstNotDone <= maxBound;
        const isActionWorsened = worstDone > worstNotDone;

        violations.push({
          factorId: node.id,
          factorName: node.name || node.symbol || "Factor",
          factorSymbol: node.symbol || "",
          unit: node.unit || "",
          boundType: "max",
          threshold: maxBound,
          worstValue: Math.round(worstDone * 100) / 100,
          timeIndex: worstDoneIdx,
          timeS: timeSPoints[worstDoneIdx] ?? null,
          breachMagnitude: Math.round(Math.abs(worstDone - maxBound) * 100) / 100,
          isActionCaused,
          isActionWorsened,
          message: node.guardrailBreachMessage || ""
        });
      }
    }
  }

  return violations;
}

/**
 * Helper to check if an action has any guardrail violations.
 */
export function hasGuardrailBreach(action) {
  return Boolean(
    action &&
    Array.isArray(action.guardrailViolations) &&
    action.guardrailViolations.length > 0
  );
}

/**
 * Helper to check if an action caused a NEW breach that didn't exist in baseline.
 */
export function hasActionCausedBreach(action) {
  return Boolean(
    action &&
    Array.isArray(action.guardrailViolations) &&
    action.guardrailViolations.some(v => v.isActionCaused)
  );
}
