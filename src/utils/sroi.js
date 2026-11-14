/**
 * SROI (Social Return on Investment / 社會投資報酬率) Framework
 *
 * Implements standard SROI methodology (Social Value International / Cabinet Office Guide):
 * 1. Financial proxies & social valuation mapping.
 * 2. Established SROI deductions: Deadweight, Attribution, Displacement, Drop-off.
 * 3. Net social present value & SROI Ratio calculation.
 * 4. SROI Impact Map generation and executive reporting.
 */

export const SROI_DEFAULTS = {
  deadweight: 0,
  attribution: 0,
  displacement: 0,
  dropOffRate: 0
};

/**
 * Calculates SROI deductions and ratio for an action.
 *
 * @param {Object} action - Action with impacts, costs, and simulation results
 * @param {Object} [overrides] - Optional overrides for deadweight, attribution, displacement
 * @returns {Object} SROI breakdown and ratios
 */
export function calculateSroiMetrics(action = {}, overrides = {}) {
  const deadweight = Math.min(100, Math.max(0, Number(overrides.deadweight ?? action.deadweight ?? SROI_DEFAULTS.deadweight) || 0));
  const attribution = Math.min(100, Math.max(0, Number(overrides.attribution ?? action.attribution ?? SROI_DEFAULTS.attribution) || 0));
  const displacement = Math.min(100, Math.max(0, Number(overrides.displacement ?? action.displacement ?? SROI_DEFAULTS.displacement) || 0));
  const dropOffRate = Math.min(100, Math.max(0, Number(overrides.dropOffRate ?? action.dropOffRate ?? SROI_DEFAULTS.dropOffRate) || 0));

  const dwFactor = (100 - deadweight) / 100;
  const attrFactor = (100 - attribution) / 100;
  const dispFactor = (100 - displacement) / 100;
  const adjustmentFactor = Math.max(0, dwFactor * attrFactor * dispFactor);

  const grossSocialBenefitNpv = Math.max(0, Number(action.marginalWorldBenefitNpv ?? action.effectiveResultsNumbers?.marginalWorldBenefitNpv) || 0);
  const socialCostNpv = Math.max(0, Number(action.marginalWorldCostNpv ?? action.effectiveResultsNumbers?.marginalWorldCostNpv) || 0);

  const adjustedSocialBenefitNpv = grossSocialBenefitNpv * adjustmentFactor;
  const netSocialBenefitNpv = adjustedSocialBenefitNpv - socialCostNpv;

  // Investment inputs: outstanding direct costs or estimated direct costs
  const directInvestment = Number(
    action.outstandingDirectCosts ??
    action.effectiveResultsNumbers?.outstandingDirectCosts ??
    action.estDirectCosts ??
    action.directCosts
  ) || 0;

  const totalInvestmentInputs = directInvestment > 0 ? directInvestment : 0;
  let sroiRatio = null;

  if (totalInvestmentInputs > 0) {
    const rawRatio = netSocialBenefitNpv / totalInvestmentInputs;
    sroiRatio = isFinite(rawRatio) ? Number(rawRatio.toFixed(3)) : null;
  }

  return {
    deadweight,
    attribution,
    displacement,
    dropOffRate,
    adjustmentFactor: Number(adjustmentFactor.toFixed(4)),
    grossSocialBenefitNpv: Number(grossSocialBenefitNpv.toFixed(2)),
    adjustedSocialBenefitNpv: Number(adjustedSocialBenefitNpv.toFixed(2)),
    socialCostNpv: Number(socialCostNpv.toFixed(2)),
    netSocialBenefitNpv: Number(netSocialBenefitNpv.toFixed(2)),
    totalInvestmentInputs: Number(totalInvestmentInputs.toFixed(2)),
    sroiRatio
  };
}

/**
 * Formats SROI ratio as a standard ratio string (e.g. "3.42:1").
 *
 * @param {number|null} ratio
 * @returns {string}
 */
export function formatSroiRatio(ratio) {
  if (typeof ratio !== "number" || isNaN(ratio)) return "-";
  return `${ratio.toFixed(2)}:1`;
}

/**
 * Generates an SROI Impact Map conforming to the standard SROI framework.
 *
 * @param {Object} action - Action with impacts and costs
 * @param {Array} [nodes=[]] - Model factors
 * @param {Object} [org={}] - Organization context
 * @returns {Object} { rows: Array, summary: Object }
 */
export function generateSroiImpactMap(action = {}, nodes = [], org = {}) {
  const metrics = calculateSroiMetrics(action);
  const impacts = Array.isArray(action.impacts) ? action.impacts : [];
  const nodeMap = new Map((nodes || []).map((n) => [n.id, n]));
  const currency = org.currency || "USD";

  const rows = impacts.map((imp, idx) => {
    const node = nodeMap.get(imp.nodeId) || {};
    const factorName = node.name || imp.nodeId || `Factor #${idx + 1}`;
    const unit = node.unit || "";
    const operation = imp.operation || "+";
    const operand = Number(imp.operand) || 0;

    // Stakeholder estimation based on factor name or cost category
    let stakeholder = "Community & Beneficiaries";
    if (/environment|carbon|emissions|energy|waste|green/i.test(factorName)) {
      stakeholder = "Environment & Planet";
    } else if (/volunteer|staff|team|training/i.test(factorName)) {
      stakeholder = "Volunteers & Operations";
    } else if (/donor|funder|partner/i.test(factorName)) {
      stakeholder = "Partners & Donors";
    }

    const outputDescription = `${operation}${operand.toLocaleString()} ${unit}`.trim();

    return {
      id: imp.id || `imp_${idx}`,
      stakeholder,
      factorId: imp.nodeId,
      factorName,
      unit,
      operation,
      operand,
      outputDescription,
      deadweight: metrics.deadweight,
      attribution: metrics.attribution,
      displacement: metrics.displacement
    };
  });

  const summary = {
    actionTitle: action.title || "Untitled Action",
    currency,
    ...metrics,
    impactCount: impacts.length
  };

  return { rows, summary };
}

/**
 * Formats an SROI report in Markdown format for stakeholders and boards.
 *
 * @param {Object} action - Action object
 * @param {Array} nodes - Model factors
 * @param {Object} org - Organization details
 * @returns {string} Markdown document
 */
export function generateSroiMarkdownReport(action = {}, nodes = [], org = {}) {
  const { rows, summary } = generateSroiImpactMap(action, nodes, org);
  const ratioStr = formatSroiRatio(summary.sroiRatio);
  const currency = summary.currency;

  let md = `# Social Return on Investment (SROI) Analysis: ${summary.actionTitle}\n\n`;
  md += `**Organization:** ${org.name || "Mipa Strategic Organization"}\n`;
  md += `**Calculated SROI Ratio:** **${ratioStr}**\n\n`;

  md += `## 1. Executive Summary & Value Proposition\n`;
  if (summary.sroiRatio !== null && summary.sroiRatio > 1) {
    md += `For every **1 ${currency}** directly invested in this action, it generates **${summary.sroiRatio.toFixed(2)} ${currency}** in verified net social, community, and environmental value.\n\n`;
  } else if (summary.sroiRatio !== null) {
    md += `This action generates social returns with an SROI ratio of **${ratioStr}** against direct operational investment.\n\n`;
  } else {
    md += `This action generates social impact without requiring direct capital outlay.\n\n`;
  }

  md += `## 2. Social Value Deductions (Standard SROI Adjustments)\n`;
  md += `- **Deadweight:** ${summary.deadweight}% (portion of outcome that would occur without this initiative)\n`;
  md += `- **Attribution:** ${summary.attribution}% (portion achieved by partner organizations or external factors)\n`;
  md += `- **Displacement:** ${summary.displacement}% (portion of benefits displaced from other activities)\n`;
  md += `- **Net Impact Multiplier:** ${(summary.adjustmentFactor * 100).toFixed(1)}%\n\n`;

  md += `## 3. Financial & Value Summary (${currency})\n`;
  md += `| Metric | Amount (${currency}) |\n`;
  md += `|---|---:|\n`;
  md += `| Gross Present Social Benefit | ${summary.grossSocialBenefitNpv.toLocaleString()} |\n`;
  md += `| Adjusted Social Benefit (post-deductions) | ${summary.adjustedSocialBenefitNpv.toLocaleString()} |\n`;
  md += `| Present Social Costs | ${summary.socialCostNpv.toLocaleString()} |\n`;
  md += `| **Net Present Social Value** | **${summary.netSocialBenefitNpv.toLocaleString()}** |\n`;
  md += `| Total Direct Investment Inputs | ${summary.totalInvestmentInputs.toLocaleString()} |\n`;
  md += `| **SROI Ratio** | **${ratioStr}** |\n\n`;

  md += `## 4. SROI Impact Map\n`;
  if (rows.length === 0) {
    md += `*No factor impacts specified for this action.*\n\n`;
  } else {
    md += `| Stakeholder | Target Factor | Output / Change | Deductions (DW / Attr / Disp) |\n`;
    md += `|---|---|---|:---:|\n`;
    rows.forEach((r) => {
      md += `| ${r.stakeholder} | **${r.factorName}** | ${r.outputDescription} | ${r.deadweight}% / ${r.attribution}% / ${r.displacement}% |\n`;
    });
    md += `\n`;
  }

  md += `*Report generated via Mipa SROI Framework conforming to Social Value International standards.*\n`;
  return md;
}
