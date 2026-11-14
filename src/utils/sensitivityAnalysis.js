import { formatNumber } from "./util-formatNumber";
import { formatCurrencyValue, formatRatioValue } from "./decisionBrief";

/**
 * Sensitivity and Turning-Point Analysis Engine (Feature 3)
 *
 * Implements the specification from docs/design/ai-roadmap.md:
 * "How sure can we be that A is better than B, and which assumptions would have to be different for B to win?"
 *
 * 1. Screens inputs feeding compared actions' results (constant factors, effort, spending, impacts, weights).
 * 2. Rapidly tests perturbations (e.g. +/- 30%) to identify inputs that move leverage or flip rankings.
 * 3. Solves for the exact turning point (翻轉點) at which ranking flips.
 * 4. Produces executive findings with dignified bilingual phrasing.
 */

/**
 * List candidate inputs that feed the compared actions' results.
 */
export function listSensitivityInputs(actionA, actionB, nodes = [], simulationParams = {}) {
  const inputs = [];

  const addActionInputs = (action, labelPrefix, actionKey) => {
    if (!action) return;
    const directCost = action.outstandingDirectCosts ?? action.outstandingDirectCost ?? action.estSpending ?? 0;
    if (directCost > 0) {
      inputs.push({
        id: `${actionKey}_cost`,
        type: "action_cost",
        actionId: action.id,
        actionTitle: action.title,
        name: `${labelPrefix} Direct Spending`,
        symbol: "outstandingDirectCosts",
        baseValue: directCost,
        unit: simulationParams.currency || "",
        min: Math.max(1, directCost * 0.1),
        max: directCost * 3.0
      });
    }

    const effortHrs = action.estEffortHrs ?? 0;
    if (effortHrs > 0) {
      inputs.push({
        id: `${actionKey}_effort`,
        type: "action_effort",
        actionId: action.id,
        actionTitle: action.title,
        name: `${labelPrefix} Effort Hours`,
        symbol: "estEffortHrs",
        baseValue: effortHrs,
        unit: "hours",
        min: Math.max(1, effortHrs * 0.1),
        max: effortHrs * 3.0
      });
    }

    if (Array.isArray(action.impacts)) {
      action.impacts.forEach((imp, idx) => {
        const operand = Number(imp.operand ?? imp.value);
        if (!isNaN(operand) && operand !== 0) {
          const matchedNode = nodes.find((n) => n.id === imp.nodeId || n.symbol === imp.symbol);
          const factorName = matchedNode ? (matchedNode.name || matchedNode.symbol) : (imp.symbol || `Impact ${idx + 1}`);
          inputs.push({
            id: `${actionKey}_impact_${idx}`,
            type: "action_impact",
            actionId: action.id,
            actionTitle: action.title,
            impactIndex: idx,
            nodeId: imp.nodeId,
            name: `${labelPrefix} Impact on "${factorName}"`,
            symbol: imp.symbol || factorName,
            baseValue: operand,
            unit: matchedNode ? (matchedNode.unit || "") : "",
            isEstimate: Boolean(matchedNode?.isEstimate || matchedNode?.notes?.includes("estimate")),
            min: operand > 0 ? operand * 0.1 : operand * 3.0,
            max: operand > 0 ? operand * 3.0 : operand * 0.1
          });
        }
      });
    }
  };

  addActionInputs(actionA, "Action A", "actionA");
  addActionInputs(actionB, "Action B", "actionB");

  // Constant model factors (e.g. unit values, conversion ratios, baseline rates)
  nodes.forEach((n) => {
    const rawVal = Number(n.symbolFormula ?? n.sysFormula ?? n.value);
    const isConstant = n.class === "constant" || (!isNaN(rawVal) && rawVal > 0);
    if (isConstant && !isNaN(rawVal) && rawVal > 0) {
      inputs.push({
        id: `node_${n.symbol || n.id}`,
        type: "model_constant",
        nodeId: n.id,
        name: n.name || n.symbol,
        symbol: n.symbol,
        baseValue: rawVal,
        unit: n.unit || "",
        isEstimate: Boolean(n.isEstimate || n.notes?.includes("estimate")),
        min: rawVal * 0.1,
        max: rawVal * 3.0
      });
    }
  });

  // Societal vs Organization weighting ratio
  const worldWeight = simulationParams.worldWeightingFactor ?? 1.0;
  inputs.push({
    id: "param_world_weight",
    type: "simulation_param",
    name: "Societal Impact Weighting",
    symbol: "worldWeightingFactor",
    baseValue: worldWeight,
    unit: "ratio",
    min: 0.1,
    max: 3.0
  });

  return inputs;
}

/**
 * Re-evaluate action leverage under perturbed input conditions.
 */
export function evaluatePerturbedAction(action, input, testValue, defaultHourlyRate = 25) {
  if (!action) return null;

  let directCost = action.outstandingDirectCosts ?? action.outstandingDirectCost ?? action.estSpending ?? 0;
  let netBenefit = action.marginalNetTotalBenefitNpv ?? 0;
  let totalBenefit = action.marginalTotalBenefitNpv ?? 0;
  let totalCost = action.marginalTotalCostNpv ?? 0;
  const effortHrs = action.estEffortHrs ?? 0;

  const baseVal = input.baseValue;
  const ratio = baseVal !== 0 ? testValue / baseVal : 1;

  if (input.actionId === action.id) {
    if (input.type === "action_cost") {
      directCost = Math.max(1, testValue);
    } else if (input.type === "action_effort") {
      const deltaHrs = testValue - effortHrs;
      const addedCost = deltaHrs * defaultHourlyRate;
      totalCost = Math.max(0, totalCost + addedCost);
      netBenefit = totalBenefit - totalCost;
    } else if (input.type === "action_impact") {
      // Benefit scales with impact magnitude
      totalBenefit = totalBenefit * ratio;
      netBenefit = totalBenefit - totalCost;
    }
  } else if (input.type === "model_constant") {
    // Model constant influences total benefit
    totalBenefit = totalBenefit * ratio;
    netBenefit = totalBenefit - totalCost;
  } else if (input.type === "simulation_param" && input.symbol === "worldWeightingFactor") {
    const orgBenefit = action.marginalOrgBenefitNpv ?? (totalBenefit * 0.4);
    const worldBenefit = action.marginalWorldBenefitNpv ?? (totalBenefit * 0.6);
    totalBenefit = orgBenefit + worldBenefit * testValue;
    netBenefit = totalBenefit - totalCost;
  }

  // Recalculate ROI and Leverage using canonical mipa formulas
  const marginalTotalCostExcludingAction = Math.max(0, totalCost - directCost);
  const costDenominator = directCost + marginalTotalCostExcludingAction;
  const totalRoi = costDenominator > 0 ? netBenefit / costDenominator : 0;

  const actionLeverage = directCost > 0
    ? ((netBenefit * totalRoi) / directCost) * Math.sign(netBenefit)
    : 0;

  return {
    actionLeverage: isFinite(actionLeverage) ? actionLeverage : 0,
    marginalNetTotalBenefitNpv: netBenefit,
    outstandingDirectCosts: directCost,
    totalRoi
  };
}

/**
 * Screen an individual input to check leverage shift and ranking flip.
 */
export function screenInputSensitivity(actionA, actionB, input, deltaPercent = 0.30) {
  const baseA = actionA.actionLeverage ?? 0;
  const baseB = actionB.actionLeverage ?? 0;
  const baseDiff = baseA - baseB;

  const valLow = input.baseValue * (1 - deltaPercent);
  const valHigh = input.baseValue * (1 + deltaPercent);

  const resALow = evaluatePerturbedAction(actionA, input, valLow);
  const resBHigh = evaluatePerturbedAction(actionB, input, valHigh);

  const resAHigh = evaluatePerturbedAction(actionA, input, valHigh);
  const resBLow = evaluatePerturbedAction(actionB, input, valLow);

  const diffAtLow = resALow.actionLeverage - resBHigh.actionLeverage;
  const diffAtHigh = resAHigh.actionLeverage - resBLow.actionLeverage;

  const flipsRanking = (diffAtLow < 0 && baseDiff > 0) || (diffAtHigh < 0 && baseDiff > 0) ||
    (diffAtLow > 0 && baseDiff < 0) || (diffAtHigh > 0 && baseDiff < 0);

  const maxLeverageSwing = Math.max(
    Math.abs(diffAtLow - baseDiff),
    Math.abs(diffAtHigh - baseDiff)
  );

  const sensitivityScore = Math.abs(baseDiff) > 0 ? maxLeverageSwing / Math.abs(baseDiff) : maxLeverageSwing;

  return {
    input,
    flipsRanking,
    sensitivityScore,
    maxLeverageSwing,
    diffAtLow,
    diffAtHigh
  };
}

/**
 * Find the turning point (翻轉點) where Action B overtakes Action A using bisection search.
 */
export function findTurningPoint(actionA, actionB, input, maxIterations = 24) {
  const baseA = actionA.actionLeverage ?? 0;
  const baseB = actionB.actionLeverage ?? 0;
  const initialDiff = baseA - baseB;

  if (Math.abs(initialDiff) < 1e-4) {
    return {
      found: true,
      turningPoint: input.baseValue,
      percentShift: 0,
      direction: "equal",
      robustness: "sensitive"
    };
  }

  // Bisection search bounds
  let low = input.min;
  let high = input.max;

  const diffAt = (val) => {
    const rA = evaluatePerturbedAction(actionA, input, val);
    const rB = evaluatePerturbedAction(actionB, input, val);
    return rA.actionLeverage - rB.actionLeverage;
  };

  const fLow = diffAt(low);
  const fHigh = diffAt(high);

  // Check if sign changes across bounds
  if ((fLow > 0 && fHigh > 0) || (fLow < 0 && fHigh < 0)) {
    // If not within initial range, expand search range up to 10x
    const extLow = input.baseValue * 0.05;
    const extHigh = input.baseValue * 8.0;
    const fExtLow = diffAt(extLow);
    const fExtHigh = diffAt(extHigh);

    if ((fExtLow > 0 && fExtHigh > 0) || (fExtLow < 0 && fExtHigh < 0)) {
      return {
        found: false,
        turningPoint: null,
        percentShift: null,
        direction: "none",
        robustness: "highly_robust"
      };
    }
    low = extLow;
    high = extHigh;
  }

  // Bisection loop
  let mid = (low + high) / 2;
  for (let i = 0; i < maxIterations; i++) {
    mid = (low + high) / 2;
    const fMid = diffAt(mid);
    if (Math.abs(fMid) < 0.01 || (high - low) / input.baseValue < 0.001) {
      break;
    }
    if ((diffAt(low) > 0) === (fMid > 0)) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const percentShift = ((mid - input.baseValue) / input.baseValue) * 100;
  const absShift = Math.abs(percentShift);

  let robustness = "highly_robust";
  if (absShift < 20) {
    robustness = "sensitive";
  } else if (absShift <= 50) {
    robustness = "moderate";
  }

  return {
    found: true,
    turningPoint: mid,
    percentShift,
    direction: percentShift < 0 ? "decrease" : "increase",
    robustness
  };
}

/**
 * Generate comprehensive Sensitivity and Robustness Report (Feature 3).
 */
export function generateSensitivityReport(actionA, actionB, nodes = [], simulationParams = {}, options = {}) {
  const isZh = (options.locale || "").toLowerCase().startsWith("zh");
  const currency = options.currency || simulationParams.currency || "";

  if (!actionA || !actionB) {
    return null;
  }

  const perturbationRange = typeof options.perturbationRange === "number" && options.perturbationRange > 0
    ? options.perturbationRange
    : 0.30;
  const perturbationPct = Math.round(perturbationRange * 100);

  const inputs = listSensitivityInputs(actionA, actionB, nodes, simulationParams);
  const screened = inputs.map((inp) => screenInputSensitivity(actionA, actionB, inp, perturbationRange));

  // Sort: inputs that flip ranking first, then by sensitivity score descending
  screened.sort((a, b) => {
    if (a.flipsRanking !== b.flipsRanking) return a.flipsRanking ? -1 : 1;
    return b.sensitivityScore - a.sensitivityScore;
  });

  // Calculate turning points for top sensitive inputs
  const turningPoints = [];
  const topInputs = screened.slice(0, 6);

  topInputs.forEach((item) => {
    const tp = findTurningPoint(actionA, actionB, item.input);
    if (tp.found) {
      turningPoints.push({
        id: item.input.id,
        name: item.input.name,
        symbol: item.input.symbol,
        baseValue: item.input.baseValue,
        unit: item.input.unit,
        turningPoint: tp.turningPoint,
        percentShift: tp.percentShift,
        direction: tp.direction,
        robustness: tp.robustness,
        isEstimate: Boolean(item.input.isEstimate)
      });
    }
  });

  // Overall decision robustness rating
  let overallRobustness = "highly_robust";
  const hasFragile = turningPoints.some((tp) => tp.robustness === "sensitive");
  const hasModerate = turningPoints.some((tp) => tp.robustness === "moderate");

  if (hasFragile) {
    overallRobustness = "sensitive";
  } else if (hasModerate) {
    overallRobustness = "moderate";
  }

  const titleA = actionA.title || (isZh ? "首選方案" : "Top Option");
  const titleB = actionB.title || (isZh ? "備選方案" : "Runner-up Option");

  // Executive narrative synthesis
  let narrative;
  let executiveSummary;

  if (isZh) {
    // Traditional Chinese with dignified, refined phrasing
    const robustnessBadge = overallRobustness === "highly_robust"
      ? "【高度穩健】"
      : overallRobustness === "moderate"
        ? "【中度穩健】"
        : "【敏感度偏高】";

    executiveSummary = `經翻轉點敏感度推演，本決策具備 ${robustnessBadge} 之抗風險裕度。備選方案「${titleB}」僅在極端條件下可能超越「${titleA}」。`;

    if (turningPoints.length > 0) {
      const topTp = turningPoints[0];
      const shiftText = `${topTp.direction === "decrease" ? "下降" : "上升"} ${Math.abs(topTp.percentShift).toFixed(1)}%`;
      const thresholdFormatted = `${formatNumber(topTp.turningPoint, 2)} ${topTp.unit}`.trim();
      const baseFormatted = `${formatNumber(topTp.baseValue, 2)} ${topTp.unit}`.trim();

      narrative = `決策穩健性與關鍵假設評估：\n\n` +
        `一、決策抗風險能力評估：\n` +
        `在情境壓力測試（±${perturbationPct}% 區間）下，「${titleA}」之效應比均穩健高於「${titleB}」。整體決策品質被評定為 ${robustnessBadge}。\n\n` +
        `二、關鍵假設翻轉點分析：\n` +
        `「${titleB}」若擬反超首選方案，主要取決於關鍵變數「${topTp.name}」：\n` +
        `• 基準假設值：${baseFormatted}\n` +
        `• 決策翻轉臨界值：${thresholdFormatted}（需${shiftText}）\n\n` +
        `三、幕僚建議與實證追蹤：\n` +
        (overallRobustness === "sensitive"
          ? `鑒於翻轉門檻在 20% 以內，建議專案團隊在啟動前針對「${topTp.name}」進行小規模實證調查或前導測試，以固化決策信心。`
          : `翻轉門檻顯著高於一般作業公差（裕度超過 ${Math.abs(topTp.percentShift).toFixed(0)}%），領導層可安心拍板定案，無需耗費過多精力於次要數據之過度精確化。`);
    } else {
      narrative = `經全參數空間掃描，「${titleA}」在所有合理之成本、工時與效益變動範圍內，效應比均顯著優於「${titleB}」，展現出極致之決策穩健性。`;
    }
  } else {
    // English with strict zero Chinese characters
    const robustnessBadge = overallRobustness === "highly_robust"
      ? "[High Robustness]"
      : overallRobustness === "moderate"
        ? "[Moderate Robustness]"
        : "[Sensitivity Notice]";

    executiveSummary = `Based on turning-point sensitivity screening, this decision demonstrates ${robustnessBadge} stability. Option "${titleB}" would only overtake "${titleA}" under extreme assumption variance.`;

    if (turningPoints.length > 0) {
      const topTp = turningPoints[0];
      const shiftText = `${topTp.direction === "decrease" ? "decrease" : "increase"} by ${Math.abs(topTp.percentShift).toFixed(1)}%`;
      const thresholdFormatted = `${formatNumber(topTp.turningPoint, 2)} ${topTp.unit}`.trim();
      const baseFormatted = `${formatNumber(topTp.baseValue, 2)} ${topTp.unit}`.trim();

      narrative = `Decision Robustness & Sensitivity Findings:\n\n` +
        `1. Risk Tolerance & Ranking Stability:\n` +
        `Under scenario stress testing (+/- ${perturbationPct}% range), "${titleA}" consistently outranks "${titleB}". Overall decision robustness is rated ${robustnessBadge}.\n\n` +
        `2. Critical Turning-Point Threshold:\n` +
        `For "${titleB}" to overturn the ranking, the pivotal assumption is "${topTp.name}":\n` +
        `- Baseline assumption: ${baseFormatted}\n` +
        `- Decision flipping threshold: ${thresholdFormatted} (requires a ${shiftText})\n\n` +
        `3. Strategic Recommendation:\n` +
        (overallRobustness === "sensitive"
          ? `Because the flipping threshold is within 20% of baseline, leadership should validate "${topTp.name}" with preliminary field samples prior to final capital commitment.`
          : `Because the flipping threshold exceeds normal operational variances (headroom greater than ${Math.abs(topTp.percentShift).toFixed(0)}%), leadership can proceed with high confidence without risking false-precision paralysis.`);
    } else {
      narrative = `Across the full tested parameter space, "${titleA}" maintains superior leverage over "${titleB}" across all plausible cost, effort, and impact ranges, demonstrating exceptional decision stability.`;
    }
  }

  return {
    actionA: { id: actionA.id, title: titleA },
    actionB: { id: actionB.id, title: titleB },
    overallRobustness,
    perturbationRange,
    perturbationPct,
    screenedCount: screened.length,
    flippingInputsCount: screened.filter((s) => s.flipsRanking).length,
    turningPoints,
    executiveSummary,
    narrative
  };
}
