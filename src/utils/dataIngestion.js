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

export function splitLine(line, delimiter = ",") {
  if (typeof line !== "string") return [];
  if (delimiter === "|") {
    return line.replace(/^\|/, "").replace(/\|$/, "").split("|");
  }
  // Single-pass state machine for CSV handling quoted values without exponential backtracking (MIPA-26 / CodeQL js/redos)
  if (delimiter === ",") {
    const cleanLine = line.replace(/\r$/, "");
    const fields = [];
    let current = "";
    let inQuotes = false;
    let isQuotedField = false;
    let i = 0;
    const len = cleanLine.length;

    while (i < len) {
      const char = cleanLine[i];

      if (inQuotes) {
        if (char === '"') {
          if (i + 1 < len && cleanLine[i + 1] === '"') {
            current += '"';
            i++; // skip escaped quote
          } else {
            inQuotes = false;
          }
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          if (current.length === 0) {
            inQuotes = true;
            isQuotedField = true;
          } else {
            current += '"';
          }
        } else if (char === ",") {
          fields.push(current);
          current = "";
          inQuotes = false;
          isQuotedField = false;
        } else {
          current += char;
        }
      }
      i++;
    }

    if (inQuotes && isQuotedField) {
      current = '"' + current;
    }
    fields.push(current);
    return fields;
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

export const SAMPLE_TIME_SERIES = `Date,Value,Type,Source
2023-01-01,85000,historical,FY2023 Audited Report
2023-07-01,92000,historical,FY2023 Midyear Ledger
2024-01-01,104000,historical,FY2024 Audited Report
2024-07-01,115000,historical,FY2024 Midyear Ledger
2025-01-01,128000,historical,FY2025 Audited Report
2025-07-01,139000,historical,FY2025 Midyear Ledger
2026-01-01,150000,historical,FY2026 Opening Balance
2026-07-01,162000,predicted,Executive Committee Forecast
2027-01-01,175000,predicted,Strategic Plan 2027`;

/**
 * Normalizes an arbitrary date string (ISO, YYYY-MM, YYYY/MM/DD, YYYY-QX) to YYYY-MM-DD.
 * @param {string} dateStr
 * @returns {string}
 */
export function normalizeSeriesDate(dateStr) {
  if (!dateStr) return "";
  const s = String(dateStr).trim();

  // Handle Quarter formats: 2024-Q1, 2024 Q2, Q3 2024
  const qMatch = s.match(/^(\d{4})[-\s]?[Qq]([1-4])$/) || s.match(/^[Qq]([1-4])[-\s]?(\d{4})$/);
  if (qMatch) {
    const year = qMatch[1].length === 4 ? qMatch[1] : qMatch[2];
    const quarter = qMatch[1].length === 4 ? qMatch[2] : qMatch[1];
    const monthMap = { "1": "01", "2": "04", "3": "07", "4": "10" };
    return `${year}-${monthMap[quarter]}-01`;
  }

  // Handle YYYY-MM format: 2024-06 -> 2024-06-01
  if (/^\d{4}-\d{2}$/.test(s)) {
    return `${s}-01`;
  }

  // Handle standard date parsing
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }

  return s;
}

/**
 * Parses time-series CSV, TSV, or table text into dated factor data points with provenance.
 * @param {string} rawText
 * @param {Object} [options]
 * @param {string} [options.sourceCitation]
 * @param {string} [options.userEmail]
 * @param {string|Date} [options.referenceDate]
 * @returns {{ series: Array<Object>, provenance: Object }}
 */
export function parseTimeSeriesData(rawText = "", options = {}) {
  const text = (rawText || "").trim();
  if (!text) {
    return {
      series: [],
      provenance: {
        sourceCitation: options.sourceCitation || "",
        importedAt: new Date().toISOString(),
        importedBy: options.userEmail || "",
        pointCount: 0,
        historicalCount: 0,
        predictedCount: 0,
        startDate: "",
        endDate: ""
      }
    };
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { series: [], provenance: {} };
  }

  // Detect delimiter
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
  const headerMap = {
    date: -1,
    value: -1,
    type: -1,
    source: -1,
    notes: -1
  };

  rawHeaders.forEach((h, idx) => {
    const clean = h.replace(/[^a-z0-9]/g, "");
    if (/^(date|time|period|year|month|timestamp|day|datetime|asof)$/.test(clean)) headerMap.date = idx;
    else if (/^(value|amount|number|val|latestvalue|metric|price|level|cost|sales|actual|forecast)$/.test(clean)) headerMap.value = idx;
    else if (/^(type|status|category|kind|classification)$/.test(clean)) headerMap.type = idx;
    else if (/^(source|citation|reference|provenance|sourcecitation)$/.test(clean)) headerMap.source = idx;
    else if (/^(notes|note|comment|description)$/.test(clean)) headerMap.notes = idx;
  });

  // Fallback column positions if unmapped
  if (headerMap.date === -1 && rawHeaders.length > 0) headerMap.date = 0;
  if (headerMap.value === -1 && rawHeaders.length > 1) headerMap.value = 1;

  // Check if first line was actually a data row without headers (e.g. "2024-01-01,100")
  let startIndex = 1;
  const firstColAsDate = normalizeSeriesDate(splitLine(firstLine, delimiter)[0]?.trim());
  const secondColAsVal = parseNumericValue(splitLine(firstLine, delimiter)[1]?.trim());
  if (!isNaN(new Date(firstColAsDate).getTime()) && !isNaN(secondColAsVal)) {
    startIndex = 0;
  }

  const points = [];
  const detectedSources = [];

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^[|\-\s:]+$/.test(line)) continue;

    const cells = splitLine(line, delimiter).map((c) => c.trim());
    if (cells.length === 0 || cells.every((c) => c === "")) continue;

    const rowObj = {};
    for (const [key, colIdx] of Object.entries(headerMap)) {
      if (colIdx >= 0 && colIdx < cells.length) {
        rowObj[key] = cells[colIdx];
      }
    }

    const date = normalizeSeriesDate(rowObj.date);
    const value = parseNumericValue(rowObj.value);
    if (!date || isNaN(value)) continue;

    const rawType = (rowObj.type || "").toLowerCase();
    let isPredicted = false;
    if (/(predict|forecast|project|estimate|plan|future)/i.test(rawType)) {
      isPredicted = true;
    } else if (/(history|historical|actual|past)/i.test(rawType)) {
      isPredicted = false;
    } else if (options.referenceDate) {
      const refDateStr = normalizeSeriesDate(options.referenceDate);
      if (refDateStr && date > refDateStr) {
        isPredicted = true;
      }
    }

    const sourceCitation = rowObj.source || options.sourceCitation || "";
    if (sourceCitation && !detectedSources.includes(sourceCitation)) {
      detectedSources.push(sourceCitation);
    }

    points.push({
      date,
      value,
      isPredicted,
      sourceCitation,
      notes: rowObj.notes || ""
    });
  }

  // Sort ascending by date
  points.sort((a, b) => a.date.localeCompare(b.date));

  const resolvedSource = options.sourceCitation || detectedSources.join(", ") || "";

  const provenance = {
    sourceCitation: resolvedSource,
    importedAt: new Date().toISOString(),
    importedBy: options.userEmail || "system",
    pointCount: points.length,
    historicalCount: points.filter((p) => !p.isPredicted).length,
    predictedCount: points.filter((p) => p.isPredicted).length,
    startDate: points.length > 0 ? points[0].date : "",
    endDate: points.length > 0 ? points[points.length - 1].date : ""
  };

  return { series: points, provenance };
}

/**
 * Merges a newly parsed time-series with an existing series using the specified mode.
 * @param {Array<Object>} existingSeries
 * @param {Array<Object>} newSeries
 * @param {"replace"|"merge"} [mode]
 * @returns {Array<Object>}
 */
export function mergeTimeSeries(existingSeries = [], newSeries = [], mode = "replace") {
  if (mode === "replace" || !Array.isArray(existingSeries) || existingSeries.length === 0) {
    return [...(newSeries || [])].sort((a, b) => a.date.localeCompare(b.date));
  }

  const map = new Map();
  existingSeries.forEach((p) => {
    if (p && p.date) map.set(p.date, { ...p });
  });

  (newSeries || []).forEach((p) => {
    if (p && p.date) {
      map.set(p.date, { ...p });
    }
  });

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}
