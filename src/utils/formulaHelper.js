import { parse } from "mathjs";

export const BUILTIN_FORMULA_IDENTIFIERS = new Set([
  "delay",
  "min",
  "max",
  "abs",
  "round",
  "sqrt",
  "exp",
  "log",
  "ceil",
  "floor",
  "sign",
  "dt",
  "pi",
  "e",
  "true",
  "false"
]);

export const FORMULA_PRIMITIVES = [
  {
    id: "delay",
    label: "delay()",
    snippet: "delay({symbol}, dt, 0)",
    descKey: "formulaChipDelayDesc",
    icon: "history"
  },
  {
    id: "conditional",
    label: "? :",
    snippet: "condition ? 1 : 0",
    descKey: "formulaChipTernaryDesc",
    icon: "alt_route"
  },
  {
    id: "min",
    label: "min()",
    snippet: "min(a, b)",
    descKey: "formulaChipMinDesc",
    icon: "vertical_align_bottom"
  },
  {
    id: "max",
    label: "max()",
    snippet: "max(a, b)",
    descKey: "formulaChipMaxDesc",
    icon: "vertical_align_top"
  },
  {
    id: "abs",
    label: "abs()",
    snippet: "abs(x)",
    descKey: "formulaChipAbsDesc",
    icon: "all_inclusive"
  },
  {
    id: "round",
    label: "round()",
    snippet: "round(x)",
    descKey: "formulaChipRoundDesc",
    icon: "numbers"
  }
];

/**
 * Validate formula syntax with mathjs and inspect variables.
 * @param {string} formula
 * @param {Object} options
 * @param {string[]} [options.availableSymbols] - Symbols available to this factor (self + influencers)
 * @param {Array} [options.allNodes] - All nodes in the model
 * @param {string} [options.currentNodeId] - ID of node being edited
 * @returns {Object}
 */
export function validateFormulaSyntax(formula = "", options = {}) {
  const trimmed = (formula || "").trim();
  if (!trimmed) {
    return {
      valid: true,
      empty: true,
      error: null,
      errorType: null,
      usedSymbols: [],
      unlinkedSymbols: [],
      unknownSymbols: []
    };
  }

  let ast;
  try {
    ast = parse(trimmed);
  } catch (err) {
    let errorType = "syntax";
    const msg = err.message || "";
    if (msg.toLowerCase().includes("parenthesis") || msg.includes(")")) {
      errorType = "parenthesis";
    } else if (msg.toLowerCase().includes("unexpected end") || msg.toLowerCase().includes("value expected")) {
      errorType = "incomplete";
    } else if (msg.toLowerCase().includes("unexpected character")) {
      errorType = "character";
    }

    return {
      valid: false,
      empty: false,
      error: msg,
      errorType,
      usedSymbols: [],
      unlinkedSymbols: [],
      unknownSymbols: []
    };
  }

  // Extract variables from AST
  const usedSymbolsSet = new Set();
  try {
    ast.traverse((node) => {
      if (node.isSymbolNode && !BUILTIN_FORMULA_IDENTIFIERS.has(node.name)) {
        usedSymbolsSet.add(node.name);
      }
    });
  } catch (e) {
    // If traversal fails for any reason
  }

  const usedSymbols = Array.from(usedSymbolsSet);
  const availableSet = new Set(options.availableSymbols || []);
  const allNodes = options.allNodes || [];

  const unlinkedSymbols = [];
  const unknownSymbols = [];

  for (const sym of usedSymbols) {
    if (!availableSet.has(sym)) {
      const matchedNode = allNodes.find((n) => n.symbol === sym && n.id !== options.currentNodeId);
      if (matchedNode) {
        unlinkedSymbols.push({
          symbol: sym,
          nodeId: matchedNode.id,
          name: matchedNode.name,
          unit: matchedNode.unit || ""
        });
      } else {
        unknownSymbols.push(sym);
      }
    }
  }

  return {
    valid: true,
    empty: false,
    error: null,
    errorType: null,
    usedSymbols,
    unlinkedSymbols,
    unknownSymbols
  };
}

/**
 * Filter and sort factor suggestions based on query token.
 * @param {string} token
 * @param {Array} allNodes
 * @param {string} currentNodeId
 * @param {string[]} influencerIds
 * @returns {Array}
 */
export function getFactorSuggestions(token = "", allNodes = [], currentNodeId = "", influencerIds = []) {
  if (!Array.isArray(allNodes)) return [];
  const query = (token || "").trim().toLowerCase();
  const influencerSet = new Set(influencerIds || []);

  const candidates = allNodes.filter((n) => {
    if (!n || !n.symbol) return false;
    if (n.id === currentNodeId) return false;
    if (!query) return true;
    const sym = n.symbol.toLowerCase();
    const name = (n.name || "").toLowerCase();
    return sym.includes(query) || name.includes(query);
  });

  return candidates.sort((a, b) => {
    const aIsInf = influencerSet.has(a.id) ? 1 : 0;
    const bIsInf = influencerSet.has(b.id) ? 1 : 0;
    if (aIsInf !== bIsInf) return bIsInf - aIsInf; // Influencers first

    if (query) {
      const aStartsSym = a.symbol.toLowerCase().startsWith(query) ? 1 : 0;
      const bStartsSym = b.symbol.toLowerCase().startsWith(query) ? 1 : 0;
      if (aStartsSym !== bStartsSym) return bStartsSym - aStartsSym;
    }

    return (a.symbol || "").localeCompare(b.symbol || "");
  });
}

/**
 * Insert or replace snippet at current cursor or selection position.
 * @param {string} formula
 * @param {string} snippet
 * @param {number} selectionStart
 * @param {number} selectionEnd
 * @param {string} [tokenToReplace]
 * @returns {{ newFormula: string, newCursorPosition: number }}
 */
export function insertSnippetIntoFormula(formula = "", snippet = "", selectionStart = 0, selectionEnd = 0, tokenToReplace = "") {
  const text = formula || "";
  let start = typeof selectionStart === "number" ? Math.max(0, selectionStart) : text.length;
  let end = typeof selectionEnd === "number" ? Math.max(start, selectionEnd) : start;

  if (tokenToReplace && tokenToReplace.length > 0) {
    const tokenLen = tokenToReplace.length;
    // Check if the characters immediately preceding selectionStart match tokenToReplace
    if (start >= tokenLen && text.slice(start - tokenLen, start) === tokenToReplace) {
      start -= tokenLen;
    }
  }

  const before = text.slice(0, start);
  const after = text.slice(end);
  const newFormula = before + snippet + after;
  const newCursorPosition = start + snippet.length;

  return {
    newFormula,
    newCursorPosition
  };
}
