/**
 * Utility functions for organizational document ingestion, financial categorization,
 * factor freshness audits, and fiscal cadence management.
 */

export const ACCOUNTING_CATEGORIES = [
  { value: "direct_program", labelKey: "categoryDirectProgram" },
  { value: "overhead", labelKey: "categoryOverhead" },
  { value: "capital", labelKey: "categoryCapital" },
  { value: "operational", labelKey: "categoryOperational" },
  { value: "social_benefit", labelKey: "categorySocialBenefit" },
  { value: "general", labelKey: "categoryGeneral" }
];

/**
 * Parses CSV, TSV, or formatted table text into structured factor proposals.
 * @param {string} rawText
 * @param {Object} [options]
 * @returns {Array<Object>}
 */
export function parseTabularData(rawText = "", options = {}) {
  const text = (rawText || "").trim();
  if (!text) return [];

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  // Detect delimiter: tab, comma, semicolon, or markdown pipe
  const firstLine = lines[0];
  let delimiter = ",";
  if (firstLine.includes("\t")) {
    delimiter = "\t";
  } else if (firstLine.includes("|")) {
    delimiter = "|";
  } else if (firstLine.includes(";")) {
    delimiter = ";";
  }

  const rawHeaders = splitLine(firstLine, delimiter).map((h) => h.trim().toLowerCase());
  const headerMap = mapHeaders(rawHeaders);

  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    // Skip markdown table divider lines like |---|---|
    if (/^[|\-\s:]+$/.test(line)) continue;

    const cells = splitLine(line, delimiter).map((c) => c.trim());
    if (cells.length === 0 || cells.every((c) => c === "")) continue;

    const rowObj = {};
    for (const [key, colIdx] of Object.entries(headerMap)) {
      if (colIdx >= 0 && colIdx < cells.length) {
        rowObj[key] = cells[colIdx];
      }
    }

    const name = rowObj.name || rowObj.symbol || `Factor ${i}`;
    const valueNum = parseNumericValue(rowObj.value);
    const symbol = generateAsciiSymbol(rowObj.symbol || name);

    results.push({
      id: `imported_${Date.now()}_${i}`,
      name,
      symbol,
      latestValue: isNaN(valueNum) ? null : valueNum,
      unit: rowObj.unit || options.defaultUnit || "",
      costCategory: normalizeCostCategory(rowObj.category),
      reportingPeriod: rowObj.period || options.defaultPeriod || "",
      effectiveDate: normalizeDate(rowObj.date),
      sourceCitation: rowObj.citation || options.defaultCitation || "",
      isVerified: rowObj.verified !== undefined ? parseBoolean(rowObj.verified) : true,
      notes: rowObj.notes || ""
    });
  }

  return results;
}

function splitLine(line, delimiter) {
  if (delimiter === "|") {
    return line.replace(/^\|/, "").replace(/\|$/, "").split("|");
  }
  // Simple regex for CSV handling quoted values
  if (delimiter === ",") {
    const matches = [];
    let match;
    const re = /(?:,|\n|^)("(?:(?:"")*[^"]*)*"|[^",\n]*|(?:\n|$))/g;
    while ((match = re.exec(line)) !== null && match.index < line.length) {
      let val = match[1] || "";
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1).replace(/""/g, '"');
      }
      matches.push(val);
      if (re.lastIndex === match.index) re.lastIndex++;
    }
    return matches.length > 0 ? matches : line.split(",");
  }
  return line.split(delimiter);
}

function mapHeaders(headers) {
  const map = {
    name: -1,
    symbol: -1,
    value: -1,
    unit: -1,
    category: -1,
    period: -1,
    date: -1,
    citation: -1,
    verified: -1,
    notes: -1
  };

  headers.forEach((h, idx) => {
    const clean = h.replace(/[^a-z0-9]/g, "");
    if (/^(name|factor|metric|item|account|title)$/.test(clean)) map.name = idx;
    else if (/^(symbol|shortname|code|id|var)$/.test(clean)) map.symbol = idx;
    else if (/^(value|amount|latestvalue|number|baseline|budget|actual|cost)$/.test(clean)) map.value = idx;
    else if (/^(unit|currency)$/.test(clean)) map.unit = idx;
    else if (/^(category|costcategory|type|classification)$/.test(clean)) map.category = idx;
    else if (/^(period|reportingperiod|fiscalyear|fy|quarter)$/.test(clean)) map.period = idx;
    else if (/^(date|effectivedate|asof)$/.test(clean)) map.date = idx;
    else if (/^(citation|source|reference|sourcecitation|provenance)$/.test(clean)) map.citation = idx;
    else if (/^(verified|isverified|audit|status)$/.test(clean)) map.verified = idx;
    else if (/^(notes|note|comment|description)$/.test(clean)) map.notes = idx;
  });

  // If no name header was detected, default first column to name and second to value
  if (map.name === -1 && headers.length > 0) map.name = 0;
  if (map.value === -1 && headers.length > 1) map.value = 1;

  return map;
}

function parseNumericValue(val) {
  if (typeof val === "number") return val;
  if (!val) return NaN;
  // Remove commas, currency symbols, and spaces
  const clean = String(val).replace(/[\$,\s\(\)]/g, (m) => (m === "(" || m === ")" ? "-" : ""));
  return parseFloat(clean);
}

function generateAsciiSymbol(str) {
  if (!str) return "factor";
  const clean = String(str)
    .replace(/[^a-zA-Z0-9\s_]/g, "")
    .trim();
  if (!clean) return "factor";
  const words = clean.split(/\s+/);
  return words[0].toLowerCase() + words.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
}

function normalizeCostCategory(cat) {
  if (!cat) return "general";
  const lower = String(cat).toLowerCase();
  if (lower.includes("program") || lower.includes("direct")) return "direct_program";
  if (lower.includes("overhead") || lower.includes("admin")) return "overhead";
  if (lower.includes("capital") || lower.includes("capex")) return "capital";
  if (lower.includes("operational") || lower.includes("opex")) return "operational";
  if (lower.includes("benefit") || lower.includes("social") || lower.includes("revenue")) return "social_benefit";
  return "general";
}

function normalizeDate(d) {
  if (!d) return "";
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return String(d).trim();
  return parsed.toISOString().split("T")[0];
}

function parseBoolean(val) {
  if (typeof val === "boolean") return val;
  const s = String(val).toLowerCase().trim();
  return s === "true" || s === "yes" || s === "1" || s === "verified";
}

/**
 * Evaluates the freshness of a factor's latest value.
 * @param {Object} factor
 * @param {Object} [options]
 * @param {Date} [options.currentDate]
 * @param {number} [options.staleDays] - Days before factor is considered stale (default 365)
 * @param {number} [options.expiringDays] - Days before factor is considered expiring (default 180)
 * @returns {Object}
 */
export function evaluateFactorFreshness(factor = {}, options = {}) {
  const now = options.currentDate || new Date();
  const staleThreshold = options.staleDays || 365;
  const expiringThreshold = options.expiringDays || 180;

  let effectiveDate = null;
  if (factor.effectiveDate) {
    effectiveDate = new Date(factor.effectiveDate);
  } else if (factor.updateTime) {
    effectiveDate = factor.updateTime.toDate ? factor.updateTime.toDate() : new Date(factor.updateTime);
  }

  if (!effectiveDate || isNaN(effectiveDate.getTime())) {
    return {
      status: "unknown",
      daysElapsed: null,
      labelKey: "freshnessUnknown",
      color: "grey-6",
      isStale: false
    };
  }

  const diffMs = now.getTime() - effectiveDate.getTime();
  const daysElapsed = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  if (daysElapsed >= staleThreshold) {
    return {
      status: "stale",
      daysElapsed,
      labelKey: "freshnessStale",
      color: "negative",
      isStale: true
    };
  }

  if (daysElapsed >= expiringThreshold) {
    return {
      status: "expiring",
      daysElapsed,
      labelKey: "freshnessExpiring",
      color: "warning",
      isStale: false
    };
  }

  return {
    status: "fresh",
    daysElapsed,
    labelKey: "freshnessFresh",
    color: "positive",
    isStale: false
  };
}

/**
 * Group factors into accounting categories.
 * @param {Array<Object>} nodes
 * @returns {Record<string, Array<Object>>}
 */
export function groupFactorsByCategory(nodes = []) {
  const groups = {
    direct_program: [],
    overhead: [],
    capital: [],
    operational: [],
    social_benefit: [],
    general: []
  };

  nodes.forEach((node) => {
    const cat = node.costCategory || "general";
    if (groups[cat]) {
      groups[cat].push(node);
    } else {
      groups.general.push(node);
    }
  });

  return groups;
}

/**
 * Create a reconciliation audit trail entry.
 * @param {Object} factor
 * @param {number|string} oldValue
 * @param {number|string} newValue
 * @param {string} userEmail
 * @param {string} sourceCitation
 * @param {string} reportingPeriod
 * @returns {Object}
 */
export function createAuditTrailEntry(factor, oldValue, newValue, userEmail, sourceCitation = "", reportingPeriod = "") {
  return {
    timestamp: new Date().toISOString(),
    factorId: factor.id,
    factorSymbol: factor.symbol,
    factorName: factor.name,
    oldValue,
    newValue,
    variance: typeof oldValue === "number" && typeof newValue === "number" ? newValue - oldValue : null,
    userEmail: userEmail || "system",
    sourceCitation: sourceCitation || factor.sourceCitation || "",
    reportingPeriod: reportingPeriod || factor.reportingPeriod || ""
  };
}
