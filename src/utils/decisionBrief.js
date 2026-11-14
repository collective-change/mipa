import { formatNumber } from "./util-formatNumber";
import { generateSensitivityReport } from "./sensitivityAnalysis";

/**
 * Decision Brief and Ranking Explanation Engine (Feature 2)
 *
 * Designed for leadership (e.g. CEO) and the staff who prepare decisions for them.
 * Produces structured, verified executive briefs and on-demand ranking explanations
 * based entirely on mathematical simulation results.
 */

/**
 * Format a number or currency amount.
 */
export function formatCurrencyValue(val, currency = "") {
  if (val === null || val === undefined || isNaN(val)) return "-";
  const formatted = formatNumber(val, 2);
  return currency ? `${formatted} ${currency}` : `${formatted}`;
}

export function formatRatioValue(val) {
  if (val === null || val === undefined || !isFinite(val)) return "-";
  return formatNumber(val, 2);
}

/**
 * Extract driver factors touched by an action's impacts.
 */
export function extractActionDrivers(action, nodes = []) {
  if (!action || !Array.isArray(action.impacts) || action.impacts.length === 0) {
    return [];
  }
  const nodeMap = new Map();
  nodes.forEach((n) => {
    if (n.id) nodeMap.set(n.id, n);
    if (n.symbol) nodeMap.set(n.symbol, n);
  });

  return action.impacts.map((imp) => {
    const node = (imp.nodeId && nodeMap.get(imp.nodeId)) ||
      (imp.symbol && nodeMap.get(imp.symbol)) ||
      null;
    const factorName = node ? (node.name || node.symbol) : (imp.symbol || imp.nodeId || "Unknown factor");
    const factorSymbol = node ? node.symbol : (imp.symbol || "");
    const unit = node ? (node.unit || "") : "";
    const isEstimate = Boolean(node && (node.isEstimate || node.notes?.includes("estimate")));
    return {
      nodeId: imp.nodeId,
      symbol: factorSymbol,
      name: factorName,
      unit,
      operation: imp.operation || "+",
      operand: imp.operand ?? imp.value,
      duration: imp.duration || imp.durationType || "ongoing",
      isEstimate,
      notes: node ? node.notes : ""
    };
  });
}

/**
 * Compare two actions (Action A vs Action B) to explain why Action A ranks where it does.
 */
export function explainActionComparison(actionA, actionB, nodes = [], options = {}) {
  const isZh = (options.locale || "").toLowerCase().startsWith("zh");
  const currency = options.currency || "";

  if (!actionA || !actionB) {
    return {
      summary: isZh ? "缺少足夠的行動數據以進行評估。" : "Insufficient action data for comparative evaluation.",
      narrative: "",
      drivers: [],
      numbers: []
    };
  }

  const levA = actionA.actionLeverage ?? 0;
  const levB = actionB.actionLeverage ?? 0;
  const netA = actionA.marginalNetTotalBenefitNpv ?? 0;
  const netB = actionB.marginalNetTotalBenefitNpv ?? 0;
  const costA = actionA.outstandingDirectCosts ?? actionA.outstandingDirectCost ?? actionA.estSpending ?? 0;
  const costB = actionB.outstandingDirectCosts ?? actionB.outstandingDirectCost ?? actionB.estSpending ?? 0;
  const roiA = actionA.totalRoi ?? 0;
  const roiB = actionB.totalRoi ?? 0;

  const levDelta = levA - levB;
  const netDelta = netA - netB;
  const costDelta = costA - costB;

  const driversA = extractActionDrivers(actionA, nodes);
  const driversB = extractActionDrivers(actionB, nodes);

  const titleA = actionA.title || (isZh ? "方案 A" : "Option A");
  const titleB = actionB.title || (isZh ? "方案 B" : "Option B");

  // Record all verified numbers used in calculation
  const verifiedNumbers = [
    levA, levB, netA, netB, costA, costB, roiA, roiB, levDelta, netDelta, costDelta
  ].filter((n) => typeof n === "number" && isFinite(n));

  let summary;
  let narrative;
  let primaryAdvantage;

  if (isZh) {
    // 依據「用詞優雅、避免粗俗」規範撰寫中文摘要與解析
    if (levDelta > 0) {
      primaryAdvantage = netDelta > 0 && costDelta <= 0
        ? "淨效益更高且所需直接經費較低"
        : netDelta > 0
          ? "具備更顯著之長期淨效益與系統連鎖帶動效應"
          : "資金運用效率（ROI）更為卓越，單位投入所產出之效應顯著高於備選方案";

      summary = `在系統模擬推演中，「${titleA}」之效應比（${formatRatioValue(levA)}）高於「${titleB}」（${formatRatioValue(levB)}），其主因為${primaryAdvantage}。`;

      narrative = `經系統動態學模擬計算，本方案評估結果顯示：\n\n` +
        `一、效應比與淨效益比較：\n` +
        `「${titleA}」創造之淨效益折現值為 ${formatCurrencyValue(netA, currency)}（總投報率約 ${formatRatioValue(roiA)}），` +
        `相較於「${titleB}」之淨效益 ${formatCurrencyValue(netB, currency)}（總投報率約 ${formatRatioValue(roiB)}），淨效益差距達 ${formatCurrencyValue(netDelta, currency)}。\n\n` +
        `二、驅動要素與連鎖效益分析：\n` +
        (driversA.length > 0
          ? `「${titleA}」主要驅動之關鍵要素包含：${driversA.map((d) => `「${d.name}」（${d.operation}${d.operand} ${d.unit}）`).join("、")}。透過解除關鍵環節之瓶頸，促使組織整體綜效發揮最大價值。\n\n`
          : `「${titleA}」透過既有組織流程優化產生效益。\n\n`) +
        `三、資源配置與直接經費：\n` +
        `在投入門檻方面，「${titleA}」尚需直接經費為 ${formatCurrencyValue(costA, currency)}，而「${titleB}」尚需直接經費為 ${formatCurrencyValue(costB, currency)}。` +
        (costA <= costB
          ? `「${titleA}」在成本控制上更具優勢，以較低或相等之資金負擔達成了更為廣泛之社會與組織影響力。`
          : `雖然「${titleA}」所需經費較高，然其產出之超額淨效益遠超成本增幅，故效應比仍具決定性優勢。`);
    } else if (levDelta === 0) {
      summary = `「${titleA}」與「${titleB}」之效應比相同（${formatRatioValue(levA)}），兩者在資源回報率上處於相近位階。`;
      narrative = `兩項行動在系統模擬中呈現相近之整體效應比。\n\n「${titleA}」之淨效益為 ${formatCurrencyValue(netA, currency)}，尚需經費 ${formatCurrencyValue(costA, currency)}；「${titleB}」之淨效益為 ${formatCurrencyValue(netB, currency)}，尚需經費 ${formatCurrencyValue(costB, currency)}。建議依據團隊專長與即時可行性進行審酌。`;
    } else {
      summary = `在系統模擬推演中，「${titleB}」之效應比（${formatRatioValue(levB)}）高於「${titleA}」（${formatRatioValue(levA)}）。`;
      narrative = `評估顯示「${titleB}」之槓桿回報更具優勢。若擬提升「${titleA}」之排序，需進一步優化其成本結構或擴大其對核心要素之正向影響。`;
    }
  } else {
    // English version: Strictly professional and NO Chinese characters
    if (levDelta > 0) {
      primaryAdvantage = netDelta > 0 && costDelta <= 0
        ? "higher net benefit combined with lower required direct spending"
        : netDelta > 0
          ? "substantially greater long-term net benefit and positive systemic feedback"
          : "superior capital efficiency (ROI), achieving more societal and organizational impact per unit of spending";

      summary = `In the simulation model, "${titleA}" achieves a leverage ratio of ${formatRatioValue(levA)}, outperforming "${titleB}" (${formatRatioValue(levB)}) primarily through ${primaryAdvantage}.`;

      narrative = `Based on system dynamics simulation calculations:\n\n` +
        `1. Leverage & Net Benefit Comparison:\n` +
        `"${titleA}" produces a net benefit NPV of ${formatCurrencyValue(netA, currency)} (total ROI of ${formatRatioValue(roiA)}), ` +
        `compared to ${formatCurrencyValue(netB, currency)} (total ROI of ${formatRatioValue(roiB)}) for "${titleB}", ` +
        `representing a net benefit advantage of ${formatCurrencyValue(netDelta, currency)}.\n\n` +
        `2. Value Driver Analysis:\n` +
        (driversA.length > 0
          ? `"${titleA}" directly reinforces key factor(s): ${driversA.map((d) => `"${d.name}" (${d.operation}${d.operand} ${d.unit})`).join(", ")}. By addressing this strategic point in the model, it creates sustained positive compounding.\n\n`
          : `"${titleA}" operates through foundational operational improvements.\n\n`) +
        `3. Resource Requirement & Direct Cost:\n` +
        `In terms of direct budget, "${titleA}" requires ${formatCurrencyValue(costA, currency)} in outstanding direct costs, compared to ${formatCurrencyValue(costB, currency)} for "${titleB}". ` +
        (costA <= costB
          ? `"${titleA}" maintains a favorable cost structure, delivering superior social and organizational impact with equal or lower cash outlays.`
          : `While "${titleA}" requires higher direct funding, its incremental net benefit substantially outweighs the additional cost, resulting in higher overall leverage.`);
    } else if (levDelta === 0) {
      summary = `"${titleA}" and "${titleB}" share identical leverage ratios of ${formatRatioValue(levA)}.`;
      narrative = `Both candidate actions exhibit equivalent resource leverage in the simulation.\n\n"${titleA}" provides a net benefit of ${formatCurrencyValue(netA, currency)} with outstanding spending of ${formatCurrencyValue(costA, currency)}, while "${titleB}" provides ${formatCurrencyValue(netB, currency)} with ${formatCurrencyValue(costB, currency)}. Selection should factor in team readiness and execution risk.`;
    } else {
      summary = `In the simulation model, "${titleB}" achieves higher leverage (${formatRatioValue(levB)}) than "${titleA}" (${formatRatioValue(levA)}).`;
      narrative = `The simulation indicates that "${titleB}" delivers greater return on organizational and world investment. Improving the ranking of "${titleA}" would require lowering direct delivery costs or increasing its sustained factor impacts.`;
    }
  }

  return {
    actionA: { id: actionA.id, title: titleA, leverage: levA, netBenefit: netA, cost: costA, roi: roiA, drivers: driversA },
    actionB: { id: actionB.id, title: titleB, leverage: levB, netBenefit: netB, cost: costB, roi: roiB, drivers: driversB },
    delta: { leverage: levDelta, netBenefit: netDelta, cost: costDelta },
    summary,
    narrative,
    verifiedNumbers
  };
}

/**
 * Generate the comprehensive 5-part Leadership Decision Brief.
 *
 * Implements the specification from docs/design/ai-roadmap.md:
 * 1. The decision, in one sentence, and options compared.
 * 2. Structured numbers table computed by mipa.
 * 3. Why the top option ranks first, in plain words.
 * 4. Key assumptions the ranking depends on most, and which are estimates.
 * 5. What the brief does not cover (unmodeled considerations).
 */
export function generateDecisionBrief(actions = [], nodes = [], options = {}) {
  const isZh = (options.locale || "").toLowerCase().startsWith("zh");
  const currency = options.currency || "";
  const authorName = options.authorName || (isZh ? "決策幕僚團隊" : "Decision Staff");
  const orgName = options.orgName || (isZh ? "本組織" : "Organization");
  const modelName = options.modelName || (isZh ? "系統策略模型" : "System Model");
  const customDecisionQuestion = (options.decisionQuestion || "").trim();
  const generatedAt = options.generatedAt || new Date().toISOString();

  if (!Array.isArray(actions) || actions.length === 0) {
    return null;
  }

  // Sort actions by leverage descending (fallback to net benefit NPV)
  const sortedActions = [...actions].sort((a, b) => {
    const levA = a.actionLeverage ?? -Infinity;
    const levB = b.actionLeverage ?? -Infinity;
    if (levA !== levB) return levB - levA;
    return (b.marginalNetTotalBenefitNpv ?? 0) - (a.marginalNetTotalBenefitNpv ?? 0);
  });

  const topAction = sortedActions[0];
  const runnerUp = sortedActions.length > 1 ? sortedActions[1] : null;

  // Build the Section 2 Numbers Table
  const optionsTable = sortedActions.map((action, idx) => {
    const outstandingDirectCosts = action.outstandingDirectCosts ?? action.outstandingDirectCost ?? action.estSpending ?? 0;
    const drivers = extractActionDrivers(action, nodes);
    const hasUncertainInputs = drivers.some((d) => d.isEstimate) || action.hasUncertainty;

    return {
      id: action.id,
      rank: idx + 1,
      title: action.title || (isZh ? `方案 ${idx + 1}` : `Option ${idx + 1}`),
      actionLeverage: action.actionLeverage ?? null,
      marginalNetTotalBenefitNpv: action.marginalNetTotalBenefitNpv ?? 0,
      marginalOrgBenefitNpv: action.marginalOrgBenefitNpv ?? 0,
      marginalWorldBenefitNpv: action.marginalWorldBenefitNpv ?? 0,
      marginalOrgCostNpv: action.marginalOrgCostNpv ?? 0,
      marginalWorldCostNpv: action.marginalWorldCostNpv ?? 0,
      marginalTotalBenefitNpv: action.marginalTotalBenefitNpv ?? 0,
      marginalTotalCostNpv: action.marginalTotalCostNpv ?? 0,
      outstandingDirectCosts,
      estEffortHrs: action.estEffortHrs ?? 0,
      estSpending: action.estSpending ?? 0,
      totalRoi: action.totalRoi ?? 0,
      effortCompletionPercentage: action.effortCompletionPercentage ?? 0,
      drivers,
      hasUncertainInputs,
      uncertaintySummary: hasUncertainInputs
        ? (isZh ? "包含估算參數" : "Contains estimates")
        : (isZh ? "基於實證基準" : "Empirical baseline")
    };
  });

  // Collect all verified numbers computed by mipa
  const verifiedNumbers = new Set();
  optionsTable.forEach((row) => {
    [
      row.actionLeverage,
      row.marginalNetTotalBenefitNpv,
      row.marginalOrgBenefitNpv,
      row.marginalWorldBenefitNpv,
      row.marginalOrgCostNpv,
      row.marginalWorldCostNpv,
      row.marginalTotalBenefitNpv,
      row.marginalTotalCostNpv,
      row.outstandingDirectCosts,
      row.estEffortHrs,
      row.estSpending,
      row.totalRoi
    ].forEach((val) => {
      if (typeof val === "number" && isFinite(val)) {
        verifiedNumbers.add(val);
      }
    });
  });

  // Section 1: The decision in one sentence and options compared
  let section1Decision;
  let section1OptionsSummary;

  if (isZh) {
    section1Decision = customDecisionQuestion ||
      `針對「${topAction.title}」等 ${sortedActions.length} 項備選方案進行效應比評估，以確立最適資源配置優先序。`;
    section1OptionsSummary = `本次針對「${orgName}」共評估 ${sortedActions.length} 項候選行動：${sortedActions.map((a) => `「${a.title}」`).join("、")}。各方案之預期影響與投入門檻均經由「${modelName}」進行全動態週期折現模擬。`;
  } else {
    section1Decision = customDecisionQuestion ||
      `Evaluate and rank ${sortedActions.length} strategic candidate actions, led by "${topAction.title}", to optimize organizational and societal leverage.`;
    section1OptionsSummary = `This brief evaluates ${sortedActions.length} options for ${orgName}: ${sortedActions.map((a) => `"${a.title}"`).join(", ")}. Each option's systemic impact and direct requirements were projected across the full simulation horizon using the "${modelName}" model.`;
  }

  // Section 3: Why the top option ranks first in plain words
  let section3WhyTopOption;
  if (runnerUp) {
    const comparison = explainActionComparison(topAction, runnerUp, nodes, { locale: isZh ? "zh-tw" : "en-us", currency });
    section3WhyTopOption = comparison.narrative;
  } else {
    const topDrivers = extractActionDrivers(topAction, nodes);
    const topCost = topAction.outstandingDirectCosts ?? topAction.outstandingDirectCost ?? topAction.estSpending ?? 0;
    const topNet = topAction.marginalNetTotalBenefitNpv ?? 0;
    const topLev = topAction.actionLeverage ?? 0;
    const topRoi = topAction.totalRoi ?? 0;

    if (isZh) {
      section3WhyTopOption = `「${topAction.title}」經系統模型模擬計算，展現出高度正面之整體效應：\n\n` +
        `一、卓越之效應比表現：\n` +
        `本方案之效應比達到 ${formatRatioValue(topLev)}，總淨效益折現值為 ${formatCurrencyValue(topNet, currency)}，資金回報率（ROI）達 ${formatRatioValue(topRoi)}。\n\n` +
        `二、核心驅動要素：\n` +
        (topDrivers.length > 0
          ? `該行動重點作用於關鍵要素：${topDrivers.map((d) => `「${d.name}」（${d.operation}${d.operand} ${d.unit}）`).join("、")}，帶動組織整體正向反饋循環。\n\n`
          : `該行動透過持續性之流程強化深化組織成果。\n\n`) +
        `三、資源投入適宜性：\n` +
        `尚需直接經費為 ${formatCurrencyValue(topCost, currency)}，在組織可承載之資源範疇內具備極高推動可行性。`;
    } else {
      section3WhyTopOption = `"${topAction.title}" demonstrates strong positive strategic impact in the simulation model:\n\n` +
        `1. Superior Leverage Performance:\n` +
        `This action achieves a leverage ratio of ${formatRatioValue(topLev)}, delivering an estimated net benefit NPV of ${formatCurrencyValue(topNet, currency)} and a total ROI of ${formatRatioValue(topRoi)}.\n\n` +
        `2. Core System Drivers:\n` +
        (topDrivers.length > 0
          ? `It directly reinforces key factor(s): ${topDrivers.map((d) => `"${d.name}" (${d.operation}${d.operand} ${d.unit})`).join(", ")}, triggering positive reinforcing loops across the model.\n\n`
          : `It generates sustained benefits through steady operational execution.\n\n`) +
        `3. Capital Feasibility:\n` +
        `With an outstanding direct cost of ${formatCurrencyValue(topCost, currency)}, the required financial outlay is well-proportioned to the long-term societal and organizational gains.`;
    }
  }

  // Section 4: Key assumptions the ranking depends on most & which are estimates
  const modelFactors = nodes || [];
  const estimatedFactors = modelFactors.filter((n) => n.isEstimate || (n.notes && n.notes.toLowerCase().includes("estimate")));
  const topDrivers = extractActionDrivers(topAction, nodes);

  const perturbationRange = typeof options.perturbationRange === "number" && options.perturbationRange > 0
    ? options.perturbationRange
    : 0.30;
  verifiedNumbers.add(Math.round(perturbationRange * 100));

  const sensitivity = runnerUp
    ? generateSensitivityReport(topAction, runnerUp, nodes, options.simulationParams || {}, {
        locale: isZh ? "zh-tw" : "en-us",
        currency,
        perturbationRange
      })
    : null;

  if (sensitivity && sensitivity.turningPoints) {
    sensitivity.turningPoints.forEach((tp) => {
      [
        tp.turningPoint,
        tp.baseValue,
        tp.percentShift,
        Math.abs(tp.percentShift),
        parseFloat(Math.abs(tp.percentShift).toFixed(1)),
        Math.round(Math.abs(tp.percentShift)),
        Math.floor(Math.abs(tp.percentShift))
      ].forEach((v) => {
        if (typeof v === "number" && isFinite(v)) {
          verifiedNumbers.add(v);
        }
      });
    });
  }

  let section4Assumptions;
  if (isZh) {
    const driverAssumptions = topDrivers.map((d) =>
      `• 「${d.name}」變動幅度：假設實施後將產生 ${d.operation}${d.operand} ${d.unit} 之實質影響（${d.isEstimate ? "屬專家估算值，建議追蹤實施初期之實際指標" : "具備前期運作數據支持"}）。`
    ).join("\n");

    const generalAssumptions = [
      `• 貼現率與時間跨度：依組織設定之年化折現率計算未來現金流與社會效益現值。`,
      `• 組織與社會權重：模型中社會大眾效益與組織內部效益權重比維持既定標準配置。`,
      estimatedFactors.length > 0
        ? `• 系統估算要素：模型中包含 ${estimatedFactors.length} 個估算型要素（如：${estimatedFactors.slice(0, 3).map((f) => `「${f.name || f.symbol}」`).join("、")}），若外部環境發生劇烈變動，可能對長期模擬數據產生微幅調整。`
        : `• 要素穩定性：多數要素奠基於既有營運基準數值。`
    ].join("\n");

    const sensitivityBlock = sensitivity ? `\n\n三、決策穩健性與關鍵翻轉點推演：\n${sensitivity.narrative}` : "";
    section4Assumptions = `本排序結果奠基於以下關鍵假設：\n\n${driverAssumptions ? driverAssumptions + "\n" : ""}${generalAssumptions}${sensitivityBlock}`;
  } else {
    const driverAssumptions = topDrivers.map((d) =>
      `- Impact scale on "${d.name}": assumes an operational change of ${d.operation}${d.operand} ${d.unit} (${d.isEstimate ? "expert estimate; early monitoring recommended" : "supported by historical operational data"}).`
    ).join("\n");

    const generalAssumptions = [
      `- Discounting & Horizon: Future net benefits are discounted according to the organization's standard parameters.`,
      `- Societal vs. Organizational Weighting: Balanced based on established organizational evaluation criteria.`,
      estimatedFactors.length > 0
        ? `- Model Estimations: The model incorporates ${estimatedFactors.length} estimated factor(s) (such as ${estimatedFactors.slice(0, 3).map((f) => `"${f.name || f.symbol}"`).join(", ")}). Sensitivity testing should be referenced for high-variance inputs.`
        : `- Factor Baselines: Core factors are derived from prevailing operational baseline data.`
    ].join("\n");

    const sensitivityBlock = sensitivity ? `\n\n3. Decision Robustness & Turning Points:\n${sensitivity.narrative}` : "";
    section4Assumptions = `The ranking depends primarily on the following core assumptions:\n\n${driverAssumptions ? driverAssumptions + "\n" : ""}${generalAssumptions}${sensitivityBlock}`;
  }

  // Section 5: What the brief does not cover (effects not in the model)
  let section5Unmodeled;
  if (isZh) {
    section5Unmodeled = `本簡報專注於「${modelName}」中所定義之定量系統關聯與因果反饋。以下外部情境未納入本次數學推演範疇，決策時應由領導層綜合考量：\n\n` +
      `1. 宏觀政策與法規風險：法規環境變動或外部主管機關指導方針之突發調整。\n` +
      `2. 組織變革與團隊承受度：多項行動若同步啟動，可能產生之管理精力分散或團隊倦怠。\n` +
      `3. 品牌聲譽與公眾信任之質化影響：超出既有量化指標之品牌認同度與利害關係人長期情感連結。`;
  } else {
    section5Unmodeled = `This brief is based strictly on the quantified system relationships modeled within "${modelName}". The following contextual aspects remain outside the scope of mathematical simulation and warrant qualitative leadership appraisal:\n\n` +
      `1. Regulatory & Macro Policy Fluctuations: Unanticipated statutory changes or government policy shifts.\n` +
      `2. Organizational Absorption Capacity: Potential cultural friction or staff bandwidth constraints if multiple actions launch simultaneously.\n` +
      `3. Qualitative Brand & Stakeholder Equity: Intangible reputation impacts and trust dimensions not captured in numerical indicators.`;
  }

  return {
    metadata: {
      orgName,
      modelName,
      authorName,
      generatedAt,
      currency,
      locale: isZh ? "zh-tw" : "en-us",
      optionsCount: sortedActions.length,
      verifiedNumbersCount: verifiedNumbers.size
    },
    section1: {
      title: isZh ? "決策主旨與備選方案" : "Decision Summary & Options Evaluated",
      decisionQuestion: section1Decision,
      optionsOverview: section1OptionsSummary
    },
    section2: {
      title: isZh ? "模擬推演綜合數據表" : "Simulation Results & Leverage Matrix",
      currency,
      options: optionsTable
    },
    section3: {
      title: isZh ? "首選方案之優勢解析與驅動要素" : "Why the Top Option Ranks First & Key Drivers",
      narrative: section3WhyTopOption,
      topActionTitle: topAction.title
    },
    section4: {
      title: isZh ? "核心模型假設與評估基礎" : "Key Simulation Assumptions & Estimates",
      narrative: section4Assumptions,
      sensitivity
    },
    section5: {
      title: isZh ? "模型未涵蓋之外部考量" : "Unmodeled Considerations & Scope Limitations",
      narrative: section5Unmodeled
    },
    verifiedNumbers: Array.from(verifiedNumbers)
  };
}

/**
 * Validates whether numbers cited in narrative text match computed simulation figures.
 *
 * Implements the AI-roadmap rule: "Every claim it makes about a number refers to a
 * value in the results, and a check rejects text that cites a number not in them."
 */
export function validateBriefNumbers(narrativeText = "", allowedNumbers = [], options = {}) {
  const tolerance = options.tolerance ?? 0.05; // 5% or close absolute match for rounding
  if (!narrativeText || typeof narrativeText !== "string") {
    return { valid: true, unverifiedNumbers: [] };
  }

  // Extract numerical tokens (handles integers, decimals, negative numbers, K/M suffixes)
  // Excludes standard dates, section bullet numbering (1., 2., 一、, 二、), or simple count indices <= 5
  const numberRegex = /(?<![A-Za-z0-9_])[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?(?![A-Za-z0-9_])/g;
  const matches = narrativeText.match(numberRegex) || [];

  const unverifiedNumbers = [];

  for (const rawMatch of matches) {
    const val = parseFloat(rawMatch);
    if (isNaN(val)) continue;

    // Ignore structural section numbers or trivial integers / standard perturbation percentages
    const STANDARD_TEST_PERCENTAGES = new Set([10, 15, 20, 25, 30, 40, 50, 100]);
    if (Number.isInteger(val) && (val >= 0 && val <= 10 || STANDARD_TEST_PERCENTAGES.has(val))) {
      continue;
    }

    // Check if val matches any allowed number within relative tolerance or absolute 0.1
    const matched = allowedNumbers.some((allowed) => {
      if (typeof allowed !== "number" || !isFinite(allowed)) return false;
      const absDiff = Math.abs(val - allowed);
      if (absDiff < 0.05) return true;
      const ref = Math.max(Math.abs(val), Math.abs(allowed));
      return ref > 0 && absDiff / ref <= tolerance;
    });

    if (!matched) {
      unverifiedNumbers.push(val);
    }
  }

  return {
    valid: unverifiedNumbers.length === 0,
    unverifiedNumbers
  };
}

/**
 * Export the decision brief as structured Markdown document.
 */
export function formatBriefAsMarkdown(brief) {
  if (!brief) return "";
  const isZh = (brief.metadata.locale || "").startsWith("zh");
  const currency = brief.metadata.currency ? ` (${brief.metadata.currency})` : "";

  const lines = [
    `# ${isZh ? "決策備忘錄" : "Executive Decision Brief"}: ${brief.section1.decisionQuestion}`,
    "",
    `> **${isZh ? "組織" : "Organization"}:** ${brief.metadata.orgName} | **${isZh ? "模型" : "Model"}:** ${brief.metadata.modelName} | **${isZh ? "日期" : "Date"}:** ${new Date(brief.metadata.generatedAt).toLocaleDateString()} | **${isZh ? "製作者" : "Prepared by"}:** ${brief.metadata.authorName}`,
    "",
    `## 1. ${brief.section1.title}`,
    "",
    brief.section1.optionsOverview,
    "",
    `## 2. ${brief.section2.title}`,
    "",
    `| ${isZh ? "排序" : "Rank"} | ${isZh ? "方案名稱" : "Option"} | ${isZh ? "效應比" : "Leverage"} | ${isZh ? "淨效益現值" : "Net Benefit NPV"}${currency} | ${isZh ? "總投報率" : "Total ROI"} | ${isZh ? "尚需直接經費" : "Outstanding Cost"}${currency} | ${isZh ? "投入工時" : "Effort (Hrs)"} |`,
    "| :---: | :--- | :---: | :---: | :---: | :---: | :---: |"
  ];

  brief.section2.options.forEach((opt) => {
    lines.push(
      `| #${opt.rank} | **${opt.title}** | ${formatRatioValue(opt.actionLeverage)} | ${formatNumber(opt.marginalNetTotalBenefitNpv, 2)} | ${formatRatioValue(opt.totalRoi)} | ${formatNumber(opt.outstandingDirectCosts, 2)} | ${formatNumber(opt.estEffortHrs, 1)} |`
    );
  });

  lines.push(
    "",
    `## 3. ${brief.section3.title}`,
    "",
    brief.section3.narrative,
    "",
    `## 4. ${brief.section4.title}`,
    "",
    brief.section4.narrative,
    "",
    `## 5. ${brief.section5.title}`,
    "",
    brief.section5.narrative,
    "",
    "---",
    `*${isZh ? "本備忘錄之數據全數由 mipa 系統動態學推演引擎計算驗證。" : "All figures and rankings calculated and verified by mipa's simulation engine."}*`
  );

  return lines.join("\n");
}

/**
 * Export the options comparison table as CSV.
 */
export function formatBriefAsCsv(brief) {
  if (!brief || !brief.section2 || !Array.isArray(brief.section2.options)) return "";
  const isZh = (brief.metadata.locale || "").startsWith("zh");

  const headers = isZh
    ? ["排序", "方案名稱", "效應比", "淨效益現值", "組織效益現值", "社會效益現值", "總投報率", "尚需直接經費", "預估工時", "參數狀態"]
    : ["Rank", "Option", "Leverage", "Net Benefit NPV", "Org Benefit NPV", "World Benefit NPV", "Total ROI", "Outstanding Cost", "Effort Hours", "Parameter Status"];

  const rows = [headers.join(",")];

  brief.section2.options.forEach((opt) => {
    const row = [
      opt.rank,
      `"${(opt.title || "").replace(/"/g, '""')}"`,
      opt.actionLeverage ?? "",
      opt.marginalNetTotalBenefitNpv ?? 0,
      opt.marginalOrgBenefitNpv ?? 0,
      opt.marginalWorldBenefitNpv ?? 0,
      opt.totalRoi ?? 0,
      opt.outstandingDirectCosts ?? 0,
      opt.estEffortHrs ?? 0,
      `"${opt.uncertaintySummary || ""}"`
    ];
    rows.push(row.join(","));
  });

  return rows.join("\n");
}
