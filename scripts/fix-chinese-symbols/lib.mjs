// Core logic for identifying non-ASCII factor symbols, suggesting meaningful
// English short names, and updating referring formulas safely.

export function isInvalidSymbol(symbol) {
  if (typeof symbol !== "string" || symbol.trim() === "") return true;
  return !/^[A-Za-z_][A-Za-z0-9_]*$/.test(symbol);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function camelize(str) {
  return str
    .toLowerCase()
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) =>
      index === 0 ? word.toLowerCase() : word.toUpperCase()
    )
    .replace(/[^a-zA-Z0-9_]+/g, "");
}

// Replaces symbols in a formula using Unicode-aware identifier boundaries.
// Longer symbols are replaced first to prevent accidental substring replacement.
export function replaceSymbolsInFormula(formula, replacements) {
  if (typeof formula !== "string" || !formula) return formula;
  const valid = replacements.filter(
    r => r.oldSymbol && r.newSymbol && r.oldSymbol !== r.newSymbol
  );
  const sorted = [...valid].sort(
    (a, b) => (b.oldSymbol || "").length - (a.oldSymbol || "").length
  );
  let updated = formula;
  for (const { oldSymbol, newSymbol } of sorted) {
    const regex = new RegExp(
      `(?<![\\p{L}\\p{N}_])${escapeRegex(oldSymbol)}(?![\\p{L}\\p{N}_])`,
      "gu"
    );
    updated = updated.replace(regex, newSymbol);
  }
  return updated;
}

// Common dictionary for Tzu Chi and non-profit domain terms in Traditional Chinese
const TERM_DICTIONARY = [
  // Compound terms first
  { zh: "志工招募人數", en: "volunteerRecruitmentCount" },
  { zh: "志工招募時數", en: "volunteerRecruitmentHours" },
  { zh: "志工服務時數", en: "volunteerServiceHours" },
  { zh: "志工培訓時數", en: "volunteerTrainingHours" },
  { zh: "志工培訓人數", en: "volunteerTrainingCount" },
  { zh: "志工總人數", en: "totalVolunteerCount" },
  { zh: "志工招募", en: "volunteerRecruitment" },
  { zh: "志工服務", en: "volunteerService" },
  { zh: "志工培訓", en: "volunteerTraining" },
  { zh: "志工人數", en: "volunteerCount" },
  { zh: "志願者", en: "volunteer" },
  { zh: "志工", en: "volunteer" },
  { zh: "服務時數", en: "serviceHours" },
  { zh: "服務人次", en: "serviceVisits" },
  { zh: "服務人數", en: "servedCount" },
  { zh: "服務成本", en: "serviceCost" },
  { zh: "培訓時數", en: "trainingHours" },
  { zh: "培訓成本", en: "trainingCost" },
  { zh: "招募成本", en: "recruitmentCost" },
  { zh: "招募人數", en: "recruitmentCount" },
  { zh: "善款收入", en: "donationIncome" },
  { zh: "募款金額", en: "fundraisingAmount" },
  { zh: "募款活動", en: "fundraisingEvent" },
  { zh: "捐款人數", en: "donorCount" },
  { zh: "捐款金額", en: "donationAmount" },
  { zh: "捐款", en: "donation" },
  { zh: "募款", en: "fundraising" },
  { zh: "照顧戶", en: "careHouseholds" },
  { zh: "關懷戶", en: "careHouseholds" },
  { zh: "個案數", en: "caseCount" },
  { zh: "個案", en: "case" },
  { zh: "受助人", en: "beneficiary" },
  { zh: "受災戶", en: "disasterVictims" },
  { zh: "物資發放", en: "reliefDistribution" },
  { zh: "物資採購", en: "supplyProcurement" },
  { zh: "物資成本", en: "suppliesCost" },
  { zh: "物資", en: "supplies" },
  { zh: "發放", en: "distribution" },
  { zh: "訪視次數", en: "visitCount" },
  { zh: "訪視", en: "visit" },
  { zh: "環保站", en: "recyclingStation" },
  { zh: "環保點", en: "recyclingPoint" },
  { zh: "回收量", en: "recyclingVolume" },
  { zh: "環保", en: "recycling" },
  { zh: "醫療援助", en: "medicalAid" },
  { zh: "義診", en: "freeClinic" },
  { zh: "醫療", en: "medical" },
  { zh: "助學金", en: "scholarship" },
  { zh: "教育補助", en: "educationGrant" },
  { zh: "教育", en: "education" },
  { zh: "行政成本", en: "adminCost" },
  { zh: "營運成本", en: "operatingCost" },
  { zh: "固定成本", en: "fixedCost" },
  { zh: "總成本", en: "totalCost" },
  { zh: "成本", en: "cost" },
  { zh: "費用", en: "expense" },
  { zh: "效益", en: "benefit" },
  { zh: "預算", en: "budget" },
  { zh: "人數", en: "count" },
  { zh: "人次", en: "visits" },
  { zh: "時數", en: "hours" },
  { zh: "天數", en: "days" },
  { zh: "月數", en: "months" },
  { zh: "年數", en: "years" },
  { zh: "比率", en: "rate" },
  { zh: "成長率", en: "growthRate" },
  { zh: "流失率", en: "churnRate" },
  { zh: "留存率", en: "retentionRate" },
  { zh: "平均", en: "average" },
  { zh: "總計", en: "total" },
  { zh: "總和", en: "total" },
  { zh: "收入", en: "income" },
  { zh: "支出", en: "spending" }
];

export function suggestEnglishSymbol(chineseText, takenSymbols = new Set()) {
  let text = String(chineseText || "").trim();
  let result = "";

  // 1. If text is already in English / Latin words, camelize it
  const asciiCandidate = camelize(text);
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(asciiCandidate)) {
    result = asciiCandidate;
  } else {
    // 2. Look up in domain dictionary
    for (const item of TERM_DICTIONARY) {
      if (text.includes(item.zh)) {
        result = item.en;
        break;
      }
    }
  }

  if (!result) {
    result = "factor";
  }

  // Ensure camelCase starting with lowercase letter
  result = result.charAt(0).toLowerCase() + result.slice(1);
  if (!/^[a-z_]/i.test(result)) {
    result = "f" + result;
  }

  let candidate = result;
  let counter = 2;
  while (takenSymbols.has(candidate)) {
    candidate = `${result}${counter++}`;
  }
  return candidate;
}

// Build a migration plan for a collection of nodes belonging to one model
export function planModelMigration(nodes, explicitMappings = {}) {
  const invalidNodes = nodes.filter(n => isInvalidSymbol(n.symbol));
  if (!invalidNodes.length) return null;

  const existingSymbols = new Set(
    nodes.filter(n => !isInvalidSymbol(n.symbol)).map(n => n.symbol)
  );

  const replacements = [];
  const symbolMap = new Map(); // oldSymbol -> newSymbol

  for (const node of invalidNodes) {
    const oldSym = node.symbol || "";
    // Explicit mapping can be keyed by node.id or node.symbol
    const mapped =
      explicitMappings[node.id] ||
      (oldSym && explicitMappings[oldSym]) ||
      suggestEnglishSymbol(node.name || oldSym, existingSymbols);

    existingSymbols.add(mapped);
    if (oldSym) {
      symbolMap.set(oldSym, mapped);
    }
    replacements.push({
      nodeId: node.id,
      name: node.name || "",
      oldSymbol: oldSym,
      newSymbol: mapped,
      isExplicit: Boolean(
        explicitMappings[node.id] || (oldSym && explicitMappings[oldSym])
      )
    });
  }

  const replacementPairs = replacements
    .filter(r => r.oldSymbol)
    .map(r => ({
      oldSymbol: r.oldSymbol,
      newSymbol: r.newSymbol
    }));

  // Analyze all nodes in the model to see which formulas need updating
  const updates = [];
  for (const node of nodes) {
    const renamed = replacements.find(r => r.nodeId === node.id);
    const isNodeRenamed = Boolean(renamed);
    const newSymbol = renamed ? renamed.newSymbol : node.symbol;

    const oldFormula = node.symbolFormula || "";
    const newFormula = replaceSymbolsInFormula(oldFormula, replacementPairs);

    const formulaChanged = oldFormula !== newFormula;
    if (isNodeRenamed || formulaChanged) {
      updates.push({
        id: node.id,
        name: node.name || "",
        symbolChanged: isNodeRenamed,
        formulaChanged,
        oldSymbol: node.symbol || "",
        newSymbol,
        oldFormula,
        newFormula
      });
    }
  }

  return {
    invalidCount: invalidNodes.length,
    replacements,
    updates
  };
}
