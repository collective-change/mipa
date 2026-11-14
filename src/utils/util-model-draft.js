// Turns a model described in plain terms into factor documents as the app
// stores them.
//
// A draft lists factors by their short name (symbol) and gives each formula
// in terms of other short names, the way people type them in the factor
// panel. compileDraftNodes() works out what the app normally works out as
// people edit: which factors each one uses (influencers) and is used by
// (influencees), the formula with $<id> references (sysFormula), which
// references must be calculated first (blockingInfluencers), and each
// factor's class. Used for the sample organization and, later, for drafts
// written with AI help.

import { parse } from "mathjs";
import { classifyInfluencers } from "./util-node-operations";

// The model's role factors and the short names they get in new models
// (see store-model createInitialNodes).
export const ROLE_SYMBOLS = {
  averageEffortCostPerHour: "averageEffortCostPerHour",
  effort: "oneTimeEffort",
  spending: "oneTimeSpending",
  orgCost: "costToOrganizationDuringInterval",
  worldCost: "costToWorldDuringInterval",
  orgBenefit: "benefitToOrganizationDuringInterval",
  worldBenefit: "benefitToWorldDuringInterval"
};

const SYMBOL_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function symbolsUsedIn(parsedFormula) {
  const used = new Set();
  parsedFormula.traverse((node, path, parent) => {
    // skip function names: in min(a, b), "min" is the callee, not a factor
    if (node.isSymbolNode && !(parent && parent.isFunctionNode && path == "fn")) {
      used.add(node.name);
    }
  });
  return used;
}

// Same replacement the factor panel makes (NodeSummary.vue): longest short
// names first, so "costs" inside "costsTotal" is not replaced by mistake.
function toSysFormula(parsedFormula, symbolIds) {
  let sysFormula = parsedFormula.toString();
  [...symbolIds]
    .sort((a, b) => b.symbol.length - a.symbol.length)
    .forEach(({ symbol, id }) => {
      sysFormula = sysFormula.replace(new RegExp("\\b" + symbol + "\\b", "g"), "$" + id);
    });
  return sysFormula.trim().replace(/  +/g, " ");
}

function classOf(node) {
  const hasInfluencers = node.influencers.length > 0;
  const hasInfluencees = node.influencees.length > 0;
  if (hasInfluencers && hasInfluencees) return "state";
  if (hasInfluencers) return "output";
  if (hasInfluencees) return "input";
  return "unlinked";
}

// draft.factors: [{ symbol, name, formula, unit?, notes? }]
// idFor(symbol): the document id to give that factor.
// Returns factor documents with an `id` field, in draft order. Throws an
// Error listing every problem found, so a draft is used whole or not at all.
export function compileDraftNodes(draft, idFor) {
  const problems = [];
  const factors = draft.factors || [];
  const bySymbol = new Map();
  factors.forEach((factor, index) => {
    if (!factor.symbol || !SYMBOL_PATTERN.test(factor.symbol))
      problems.push(`Factor ${index + 1} has an invalid short name "${factor.symbol}".`);
    else if (bySymbol.has(factor.symbol))
      problems.push(`The short name "${factor.symbol}" is used twice.`);
    else bySymbol.set(factor.symbol, factor);
  });

  const ids = new Map(factors.map(f => [f.symbol, idFor(f.symbol)]));
  const parsed = new Map();
  const influencerSymbols = new Map();
  factors.forEach(factor => {
    const formula = String(factor.formula ?? "").trim() || "0";
    try {
      const tree = parse(formula);
      parsed.set(factor.symbol, tree);
      const used = [...symbolsUsedIn(tree)].filter(
        s => bySymbol.has(s) && s != factor.symbol
      );
      influencerSymbols.set(factor.symbol, used);
    } catch (error) {
      problems.push(`The formula of "${factor.symbol}" can't be read: ${error.message}`);
    }
  });
  if (problems.length) throw new Error(problems.join("\n"));

  const nodes = factors.map(factor => {
    const id = ids.get(factor.symbol);
    const influencers = influencerSymbols.get(factor.symbol);
    const symbolIds = [factor.symbol, ...influencers].map(symbol => ({
      symbol,
      id: ids.get(symbol)
    }));
    const tree = parsed.get(factor.symbol);
    return {
      id,
      name: factor.name || factor.symbol,
      symbol: factor.symbol,
      symbolFormula: tree.toString(),
      sysFormula: toSysFormula(tree, symbolIds),
      unit: factor.unit || "",
      notes: factor.notes || "",
      isNew: false,
      influencers: influencers.map(s => ids.get(s)),
      influencees: []
    };
  });

  const nodeById = new Map(nodes.map(n => [n.id, n]));
  nodes.forEach(node =>
    node.influencers.forEach(influencerId =>
      nodeById.get(influencerId).influencees.push(node.id)
    )
  );
  nodes.forEach(node => {
    node.class = classOf(node);
    const { blocking, unused } = classifyInfluencers({ thisNode: node });
    node.blockingInfluencers = blocking;
    node.unusedInfluencers = unused;
    node.isSelfBlocking = blocking.includes(node.id);
  });
  return nodes;
}

// Role name -> factor id, for the role factors present in the nodes.
export function roleNodesOf(nodes) {
  const roleNodes = {};
  Object.entries(ROLE_SYMBOLS).forEach(([role, symbol]) => {
    const node = nodes.find(n => n.symbol == symbol);
    if (node) roleNodes[role] = node.id;
  });
  return roleNodes;
}
