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

export const ALLOWED_FORMULA_CHAR_REGEX = /^[a-z0-9 _,=<>/:%\-\(\)\+\^\.\?\*\$]+$/i;

/**
 * Returns any characters in str that are not allowed in a formula.
 * @param {string} str
 * @returns {string[]} Array of unique invalid characters
 */
export function getInvalidFormulaCharacters(str) {
  if (!str) return [];
  const invalid = [];
  const seen = new Set();
  for (const ch of str) {
    if (!ch.match(/[a-z0-9 _,=<>/:%\-\(\)\+\^\.\?\*\$]/i)) {
      if (!seen.has(ch)) {
        seen.add(ch);
        invalid.push(ch);
      }
    }
  }
  return invalid;
}

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
      unknownSymbols: [],
      usedCustomVariables: []
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
      unknownSymbols: [],
      usedCustomVariables: []
    };
  }

  // Extract variables from AST
  const usedSymbolsSet = new Set();
  let invalidDollarRef = false;
  try {
    ast.traverse((node) => {
      if (node.isSymbolNode && !BUILTIN_FORMULA_IDENTIFIERS.has(node.name)) {
        usedSymbolsSet.add(node.name);
        if (node.name.startsWith("$")) {
          // Reject bare '$' or '$$' or invalid non-identifier dollar references
          if (!/^\$[a-zA-Z0-9_]+$/.test(node.name)) {
            invalidDollarRef = true;
          }
        }
      }
    });
  } catch (e) {
    // If traversal fails for any reason
  }

  if (invalidDollarRef) {
    return {
      valid: false,
      empty: false,
      error: "Invalid factor reference starting with '$'",
      errorType: "syntax",
      usedSymbols: Array.from(usedSymbolsSet),
      unlinkedSymbols: [],
      unknownSymbols: [],
      usedCustomVariables: []
    };
  }

  const usedSymbols = Array.from(usedSymbolsSet);
  const availableSet = new Set(options.availableSymbols || []);
  const allNodes = options.allNodes || [];
  const customVariables = options.customVariables || [];
  const customVarNames = new Set(
    Array.isArray(customVariables)
      ? customVariables.map((v) => v && (v.name || v.id)).filter(Boolean)
      : Object.keys(customVariables || {})
  );

  const usedCustomVariables = [];
  const unlinkedSymbols = [];
  const unknownSymbols = [];

  for (const sym of usedSymbols) {
    if (customVarNames.has(sym)) {
      usedCustomVariables.push(sym);
    } else if (sym.startsWith("$")) {
      const refIdOrSymbol = sym.slice(1);
      if (refIdOrSymbol === options.currentNodeId) {
        // Self reference (e.g. in delay($self, dt, 0))
      } else {
        const matchedNode = allNodes.find(
          (n) => (n.id === refIdOrSymbol || n.symbol === refIdOrSymbol) && n.id !== options.currentNodeId
        );
        if (matchedNode) {
          const isLinked = availableSet.has(matchedNode.symbol) || availableSet.has(matchedNode.id) || availableSet.has(sym);
          if (!isLinked) {
            unlinkedSymbols.push({
              symbol: sym,
              nodeId: matchedNode.id,
              name: matchedNode.name,
              unit: matchedNode.unit || ""
            });
          }
        } else {
          unknownSymbols.push(sym);
        }
      }
    } else if (!availableSet.has(sym)) {
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
    unknownSymbols,
    usedCustomVariables
  };
}

/**
 * Filter and sort factor suggestions based on query token.
 * @param {string} token
 * @param {Array} allNodes
 * @param {string} currentNodeId
 * @param {string[]} influencerIds
 * @param {Array|Object} [customVariables]
 * @returns {Array}
 */
export function getFactorSuggestions(
  token = "",
  allNodes = [],
  currentNodeId = "",
  influencerIds = [],
  customVariables = []
) {
  const query = (token || "").trim().toLowerCase();
  const influencerSet = new Set(influencerIds || []);

  const candidates = [];

  if (Array.isArray(allNodes)) {
    for (const n of allNodes) {
      if (!n || !n.symbol) continue;
      if (n.id === currentNodeId) continue;
      const sym = n.symbol.toLowerCase();
      const name = (n.name || "").toLowerCase();
      if (!query || sym.includes(query) || name.includes(query)) {
        candidates.push({
          ...n,
          isCustomVariable: false
        });
      }
    }
  }

  const varList = Array.isArray(customVariables)
    ? customVariables
    : Object.entries(customVariables || {}).map(([name, item]) => ({
        name,
        ...(typeof item === "object" && item !== null ? item : { value: item })
      }));

  for (const v of varList) {
    if (!v || !v.name) continue;
    const sym = String(v.name).toLowerCase();
    const desc = String(v.description || "").toLowerCase();
    if (!query || sym.includes(query) || desc.includes(query)) {
      candidates.push({
        id: `cvar_${v.name}`,
        symbol: v.name,
        name: v.description || v.name,
        unit: v.unit || "",
        value: v.value,
        isCustomVariable: true
      });
    }
  }

  return candidates.sort((a, b) => {
    // If one is influencer factor, it has top priority
    const aIsInf = !a.isCustomVariable && influencerSet.has(a.id) ? 1 : 0;
    const bIsInf = !b.isCustomVariable && influencerSet.has(b.id) ? 1 : 0;
    if (aIsInf !== bIsInf) return bIsInf - aIsInf;

    if (query) {
      const aStartsSym = (a.symbol || "").toLowerCase().startsWith(query) ? 1 : 0;
      const bStartsSym = (b.symbol || "").toLowerCase().startsWith(query) ? 1 : 0;
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

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolves a formula written with factor short names into a sysFormula with $<nodeId> references.
 * Also returns the referenced factor IDs and unlinked factors for auto-linking.
 *
 * @param {string} formula - The human-written formula (e.g. "organisationsReachedPerStep * valueOfBetterDecision")
 * @param {Array} allNodes - All factor nodes available in the model
 * @param {Object} [currentNode] - The node being edited/saved
 * @returns {{ sysFormula: string, referencedNodeIds: string[], unlinkedSymbols: Array }}
 */
export function toSysFormula(formula = "", allNodes = [], currentNode = null) {
  if (typeof formula !== "string" || !formula.trim()) {
    return { sysFormula: "", referencedNodeIds: [], unlinkedSymbols: [] };
  }

  const nodes = Array.isArray(allNodes) ? allNodes : [];
  const currentNodeId = currentNode?.id || null;
  const currentInfluencers = new Set(
    Array.isArray(currentNode?.influencers) ? currentNode.influencers : []
  );

  // Gather candidate factor mappings
  const potentials = [];
  const seenIds = new Set();

  if (currentNode && (currentNode.symbol || currentNode.name)) {
    potentials.push({
      id: currentNode.id,
      symbol: currentNode.symbol || currentNode.name,
      name: currentNode.name,
      isSelf: true
    });
    seenIds.add(currentNode.id);
  }

  for (const n of nodes) {
    if (!n || !n.id || seenIds.has(n.id)) continue;
    seenIds.add(n.id);
    if (n.symbol) {
      potentials.push({
        id: n.id,
        symbol: n.symbol,
        name: n.name || n.symbol,
        isSelf: false
      });
    }
  }

  // Sort candidate factors by symbol length descending to prevent partial substring matches
  potentials.sort((a, b) => (b.symbol || "").length - (a.symbol || "").length);

  // Parse with mathjs if possible to identify symbols
  let ast;
  try {
    ast = parse(formula.trim());
  } catch (e) {
    ast = null;
  }

  // Find used symbols from AST if available
  const usedSymbolsSet = new Set();
  if (ast) {
    ast.traverse((node, path, parent) => {
      if (node.isSymbolNode && !(parent && parent.isFunctionNode && path === "fn")) {
        if (!BUILTIN_FORMULA_IDENTIFIERS.has(node.name)) {
          usedSymbolsSet.add(node.name);
        }
      }
    });
  }

  let sysFormula = ast ? ast.toString() : formula.trim();
  const referencedNodeIdsSet = new Set();
  const unlinkedSymbols = [];

  for (const p of potentials) {
    if (!p.symbol) continue;
    const isUsedInAst = usedSymbolsSet.size > 0 ? usedSymbolsSet.has(p.symbol) : true;
    const regex = new RegExp(
      `(?<![\\$\\p{L}\\p{N}_])${escapeRegex(p.symbol)}(?![\\p{L}\\p{N}_])`,
      "gu"
    );

    if (regex.test(sysFormula) && isUsedInAst) {
      sysFormula = sysFormula.replace(regex, () => "$" + p.id);
      if (!p.isSelf) {
        referencedNodeIdsSet.add(p.id);
        if (!currentInfluencers.has(p.id)) {
          unlinkedSymbols.push({
            symbol: p.symbol,
            nodeId: p.id,
            name: p.name
          });
        }
      }
    }
  }

  // Also collect any existing $<id> or $<symbol> references
  const dollarMatches = sysFormula.match(/\$([a-zA-Z0-9_-]+)/g);
  if (dollarMatches) {
    dollarMatches.forEach(m => {
      const ref = m.substring(1);
      const nodeById = nodes.find(n => n.id === ref);
      if (nodeById && nodeById.id !== currentNodeId) {
        referencedNodeIdsSet.add(nodeById.id);
      } else {
        const nodeBySymbol = nodes.find(n => n.symbol === ref);
        if (nodeBySymbol && nodeBySymbol.id !== currentNodeId) {
          referencedNodeIdsSet.add(nodeBySymbol.id);
          sysFormula = sysFormula.replace(new RegExp(`\\$${escapeRegex(ref)}(?![\\p{L}\\p{N}_])`, "gu"), "$" + nodeBySymbol.id);
        }
      }
    });
  }

  sysFormula = sysFormula.trim().replace(/  +/g, " ");

  return {
    sysFormula,
    referencedNodeIds: Array.from(referencedNodeIdsSet),
    unlinkedSymbols
  };
}
