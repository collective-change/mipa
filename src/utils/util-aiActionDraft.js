// "Idea to complete action": helpers to request an action proposal from the
// AI provider, or generate heuristic proposals offline, and compile them into
// mipa's action store format.

import { uid } from "quasar";
import { httpsCallable } from "firebase/functions";
import { firebaseFunctions } from "@/boot/firebase";

/**
 * Requests an action proposal from the Cloud Function "draftAction".
 * Resolves { proposal, usage }.
 */
export async function requestActionDraft({ orgId, modelId, ideaText }) {
  const call = httpsCallable(firebaseFunctions, "draftAction", { timeout: 310000 });
  const result = await call({ orgId, modelId, ideaText });
  return result.data;
}

/**
 * Offline / fallback heuristic action proposal generator.
 * Analyzes the user's idea sentence, matches relevant model factors by keywords,
 * and generates conservative, transparent effort, spending, and impact estimates.
 */
export function heuristicDraftAction(ideaText = "", nodes = [], org = {}) {
  const text = (ideaText || "").trim();
  const currency = org?.currency || "USD";

  // Title extraction: first phrase or sentence up to 40 characters
  let title = text.split(/[，,。.\n]/)[0].trim();
  if (!title) {
    title = org?.currency === "TWD" ? "新行動方案" : "New Action Initiative";
  }
  if (title.length > 50) {
    title = title.slice(0, 47) + "...";
  }

  // Detect language: check for Chinese characters
  const isChinese = /[\u4e00-\u9fff]/.test(text);

  // Keyword categories for matching model factors
  const categoryRules = [
    {
      keywords: ["太陽能", "發電", "電費", "電力", "能源", "solar", "electric", "power", "energy", "kwh"],
      operation: "-",
      operandRatio: 0.15,
      fallbackOperand: "12000",
      reasonZh: "藉由節能與發電設備降低每月用電支出",
      reasonEn: "Reduces monthly electricity spending through renewable generation",
      sourceZh: "節能技術與用電模式基準推算",
      sourceEn: "Energy efficiency and power generation benchmark"
    },
    {
      keywords: ["志工", "人力", "工時", "招募", "培訓", "volunteer", "staff", "labor", "recruit", "training"],
      operation: "+",
      operandRatio: 0.2,
      fallbackOperand: "50",
      reasonZh: "招募與培訓提升組織有效志工人數與投入服務工時",
      reasonEn: "Recruitment and training expands volunteer participation and service hours",
      sourceZh: "志工培育與參與留存率經驗估計",
      sourceEn: "Volunteer onboarding and retention rate estimate"
    },
    {
      keywords: ["餐食", "剩食", "蔬食", "食物", "餐", "food", "meal", "waste", "nutrition", "diet"],
      operation: "+",
      operandRatio: 0.25,
      fallbackOperand: "200",
      reasonZh: "擴展蔬食餐食供應份數並促進健康飲食推廣",
      reasonEn: "Expands healthy meal distributions and nutritional outreach",
      sourceZh: "社區廚房發放能力與食材運用效益推估",
      sourceEn: "Community kitchen capacity and food distribution metrics"
    },
    {
      keywords: ["碳", "碳排", "減碳", "環保", "回收", "carbon", "emission", "green", "recycle", "footprint"],
      operation: "-",
      operandRatio: 0.2,
      fallbackOperand: "500",
      reasonZh: "透過資源回收與減少廢棄物，減緩溫室氣體排放量",
      reasonEn: "Reduces greenhouse gas emissions through circular recovery and waste reduction",
      sourceZh: "環保減碳係數與廢棄物減量標準",
      sourceEn: "Environmental emission reduction standards"
    },
    {
      keywords: ["成本", "支出", "費用", "採購", "營運", "cost", "spending", "expense", "operation", "budget"],
      operation: "-",
      operandRatio: 0.1,
      fallbackOperand: "8000",
      reasonZh: "改善作業流程以樽節日常營運開支",
      reasonEn: "Streamlines operational processes to curb recurring expenses",
      sourceZh: "年度營運預算與流程精簡評估",
      sourceEn: "Annual operating budget optimization assessment"
    },
    {
      keywords: ["收入", "募款", "效益", "捐款", "營收", "benefit", "income", "donation", "revenue", "grant"],
      operation: "+",
      operandRatio: 0.15,
      fallbackOperand: "30000",
      reasonZh: "增進社會大眾認同，提高捐款支持與資源效益",
      reasonEn: "Enhances public engagement and increases sustained philanthropic support",
      sourceZh: "專案倡議與公眾募款效益分析",
      sourceEn: "Campaign outreach and donor conversion benchmark"
    }
  ];

  // Exclude one-time effort/spending role factors from targeted impact nodes
  const availableNodes = nodes.filter(
    n => !["oneTimeEffort", "oneTimeSpending", "averageEffortCostPerHour"].includes(n.symbol)
  );

  const matchedImpacts = [];
  const lowerText = text.toLowerCase();

  for (const rule of categoryRules) {
    const textMatches = rule.keywords.some(k => lowerText.includes(k.toLowerCase()));
    if (!textMatches) continue;

    // Find node matching these keywords
    const candidate = availableNodes.find(n => {
      const name = (n.name || "").toLowerCase();
      const symbol = (n.symbol || "").toLowerCase();
      return rule.keywords.some(k => name.includes(k.toLowerCase()) || symbol.includes(k.toLowerCase()));
    });

    if (candidate && !matchedImpacts.some(m => m.factorSymbol === candidate.symbol)) {
      matchedImpacts.push({
        nodeId: candidate.id,
        factorSymbol: candidate.symbol,
        factorName: candidate.name,
        operation: rule.operation,
        operand: rule.fallbackOperand,
        durationType: "for_period",
        durationNumber: 12,
        durationUnit: "months",
        thenText: isChinese ? rule.reasonZh : rule.reasonEn,
        source: isChinese ? rule.sourceZh : rule.sourceEn
      });
    }
  }

  // If no direct keyword matches, pick 1-2 key output/cost/benefit factors from model
  if (matchedImpacts.length === 0 && availableNodes.length > 0) {
    const candidate = availableNodes.find(
      n => n.symbol.includes("benefit") || n.symbol.includes("cost") || n.symbol.includes("World") || n.symbol.includes("Org")
    ) || availableNodes[0];

    if (candidate) {
      const isCost = (candidate.symbol || "").toLowerCase().includes("cost");
      matchedImpacts.push({
        nodeId: candidate.id,
        factorSymbol: candidate.symbol,
        factorName: candidate.name,
        operation: isCost ? "-" : "+",
        operand: isCost ? "5000" : "10000",
        durationType: "for_period",
        durationNumber: 12,
        durationUnit: "months",
        thenText: isChinese
          ? `推動本行動對「${candidate.name}」產生直接成效`
          : `Directly influences ${candidate.name} through focused implementation`,
        source: isChinese ? "依據模型基準值與專案規模推算" : "Estimated from baseline model parameters"
      });
    }
  }

  // Effort & spending heuristics
  const estEffortHrs = isChinese ? 96 : 80;
  const effortReasoning = isChinese
    ? "規劃評估約16小時，團隊溝通與籌備30小時，執行推動與成效追蹤50小時。"
    : "16 hours planning, 30 hours coordination, 34 hours execution and monitoring.";

  const isTwd = currency === "TWD";
  const estSpending = isTwd ? 150000 : 5000;
  const spendingReasoning = isChinese
    ? (isTwd
        ? "初期設備採購約100,000元，專業外包施工與行政雜支約50,000元。"
        : `Initial equipment and materials: ${estSpending * 0.7} ${currency}; contractor and setup: ${estSpending * 0.3} ${currency}.`)
    : `Direct procurement and equipment: ${estSpending * 0.7} ${currency}; setup and vendor fees: ${estSpending * 0.3} ${currency}.`;

  const summary = isChinese
    ? `針對「${title}」之行動提案，旨在落實預期目標並優化關鍵指標。`
    : `Action initiative for "${title}", aimed at achieving measurable operational gains.`;

  const notes = isChinese
    ? "建議於啟動前先確認跨組室權責、執行時程與必要驗收準則。"
    : "Recommended to confirm cross-team ownership and milestone deliverables before kickoff.";

  return {
    title,
    summary,
    estEffortHrs,
    effortReasoning,
    estSpending,
    spendingReasoning,
    currency,
    impacts: matchedImpacts,
    notes
  };
}

/**
 * Compiles a proposal (from AI or heuristic generator) into a full mipa action
 * object ready for store.dispatch("actions/addAction", action).
 */
export function compileActionFromProposal(proposal, nodes = [], orgId = "") {
  // Map factor symbols to nodeIds
  const symbolToNode = new Map();
  nodes.forEach(n => {
    if (n.symbol) symbolToNode.set(n.symbol, n);
    if (n.name) symbolToNode.set(n.name, n);
  });

  const formattedImpacts = (proposal.impacts || []).map((imp, idx) => {
    let matchedNode = null;
    if (imp.nodeId) {
      matchedNode = nodes.find(n => n.id === imp.nodeId);
    }
    if (!matchedNode && imp.factorSymbol) {
      matchedNode = symbolToNode.get(imp.factorSymbol);
    }
    if (!matchedNode && imp.factorName) {
      matchedNode = symbolToNode.get(imp.factorName);
    }

    return {
      id: Date.now() + idx,
      nodeId: matchedNode ? matchedNode.id : (imp.nodeId || ""),
      impactType: "if_done",
      hasDeadline: false,
      deadline: null,
      thenText: imp.thenText || "",
      operation: imp.operation || "+",
      operand: String(imp.operand ?? 0),
      durationType: imp.durationType || "forever",
      durationNumber: imp.durationNumber ?? null,
      durationUnit: imp.durationUnit || "months",
      source: imp.source || ""
    };
  }).filter(imp => Boolean(imp.nodeId));

  const notesCombined = [
    proposal.summary,
    proposal.effortReasoning ? `[${proposal.effortReasoning}]` : "",
    proposal.spendingReasoning ? `[${proposal.spendingReasoning}]` : "",
    proposal.notes
  ].filter(Boolean).join("\n\n");

  return {
    orgId,
    title: proposal.title || "Untitled Action",
    isProject: false,
    notes: notesCombined,
    actionMchState: { value: "initiating" },
    useSimpleEstimateMethod: false,
    simpleEstimateTotalBenefit: null,
    simpleEstimateTotalBenefitNotes: null,
    simpleEstimateOtherCosts: null,
    simpleEstimateOtherCostsNotes: null,
    estEffortHrs: typeof proposal.estEffortHrs === "number" ? proposal.estEffortHrs : null,
    effortCompletionPercentage: null,
    effortCostPerHrType: "use_average",
    customEffortCostPerHr: null,
    estSpending: typeof proposal.estSpending === "number" ? proposal.estSpending : null,
    spentAmount: null,
    totalDirectCost: 0,
    marginalTotalBenefitNpv: 0,
    marginalNetTotalBenefitNpv: 0,
    marginalTotalCostNpv: 0,
    actionLeverage: null,
    impacts: formattedImpacts
  };
}
