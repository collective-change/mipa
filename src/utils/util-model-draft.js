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

// draft.factors: [{ symbol, name, formula, unit?, notes?, isHourlyCost? }]
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
      ...(factor.isHourlyCost ? { isHourlyCost: true } : {}),
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

// Applies a draft to an existing model, without writing anything.
//
// draft: { factors: [{ symbol, name, formula, unit, group, notes,
//          isHourlyCost }], changesToExisting: [{ symbol, newFormula }] }
// existingNodes: the model's current factor documents (with id).
// idFor(symbol): the document id to give a new factor.
//
// Returns { creates, updates, problems }:
// - creates: new factor documents (with id), linked to each other and to
//   existing factors;
// - updates: { id, fields, previous } for existing factors whose formula
//   changes or that gain or lose links; `previous` holds the fields as they
//   were, so the draft can be undone;
// - problems: plain descriptions of anything that keeps the draft from
//   being applied (invalid or duplicate short names, unreadable formulas).
//   When there are problems, creates and updates are empty.
export function compileModelDraft(draft, existingNodes, idFor) {
  const problems = [];
  const existingBySymbol = new Map(existingNodes.map(n => [n.symbol, n]));
  const factors = draft.factors || [];
  const newSymbols = new Set();
  factors.forEach((factor, index) => {
    if (!factor.symbol || !SYMBOL_PATTERN.test(factor.symbol))
      problems.push(`Factor ${index + 1} has an invalid short name "${factor.symbol}".`);
    else if (existingBySymbol.has(factor.symbol))
      problems.push(`The short name "${factor.symbol}" is already used in the model.`);
    else if (newSymbols.has(factor.symbol))
      problems.push(`The short name "${factor.symbol}" is used twice.`);
    else newSymbols.add(factor.symbol);
  });
  const changes = (draft.changesToExisting || []).filter(change => {
    if (existingBySymbol.has(change.symbol)) return true;
    problems.push(`The draft changes "${change.symbol}", which isn't in the model.`);
    return false;
  });

  const idOf = new Map(existingNodes.map(n => [n.symbol, n.id]));
  factors.forEach(f => idOf.set(f.symbol, idFor(f.symbol)));

  // Formulas to (re)compile: every new factor and every changed one.
  const toCompile = [
    ...factors.map(f => ({ symbol: f.symbol, formula: f.formula })),
    ...changes.map(c => ({ symbol: c.symbol, formula: c.newFormula }))
  ];
  const compiled = new Map();
  toCompile.forEach(({ symbol, formula }) => {
    try {
      const tree = parse(String(formula ?? "").trim() || "0");
      const influencers = [...symbolsUsedIn(tree)].filter(s => idOf.has(s) && s != symbol);
      compiled.set(symbol, {
        symbolFormula: tree.toString(),
        sysFormula: toSysFormula(
          tree,
          [symbol, ...influencers].map(s => ({ symbol: s, id: idOf.get(s) }))
        ),
        influencers: influencers.map(s => idOf.get(s))
      });
    } catch (error) {
      problems.push(`The formula of "${symbol}" can't be read: ${error.message}`);
    }
  });
  if (problems.length) return { creates: [], updates: [], problems };

  // Working copies of every factor that may change.
  const LINK_FIELDS = [
    "symbolFormula",
    "sysFormula",
    "influencers",
    "influencees",
    "blockingInfluencers",
    "unusedInfluencers",
    "isSelfBlocking",
    "class"
  ];
  const working = new Map();
  existingNodes.forEach(n =>
    working.set(n.id, {
      ...n,
      influencers: [...(n.influencers || [])],
      influencees: [...(n.influencees || [])]
    })
  );
  const creates = factors.map(f => {
    const c = compiled.get(f.symbol);
    const node = {
      id: idOf.get(f.symbol),
      name: f.name || f.symbol,
      symbol: f.symbol,
      symbolFormula: c.symbolFormula,
      sysFormula: c.sysFormula,
      unit: f.unit || "",
      notes: f.notes || "",
      isNew: false,
      ...(f.isHourlyCost ? { isHourlyCost: true } : {}),
      influencers: c.influencers,
      influencees: []
    };
    working.set(node.id, node);
    return node;
  });
  const touched = new Set(creates.map(n => n.id));

  // Changed formulas: new links replace old ones.
  changes.forEach(change => {
    const node = working.get(idOf.get(change.symbol));
    const c = compiled.get(change.symbol);
    node.influencers.forEach(oldId => {
      if (c.influencers.includes(oldId)) return;
      const old = working.get(oldId);
      if (old) {
        old.influencees = old.influencees.filter(id => id != node.id);
        touched.add(oldId);
      }
    });
    node.symbolFormula = c.symbolFormula;
    node.sysFormula = c.sysFormula;
    node.influencers = c.influencers;
    touched.add(node.id);
  });

  // Every influencer of a new or changed factor lists it as an influencee.
  [...creates.map(n => n.id), ...changes.map(c => idOf.get(c.symbol))].forEach(id => {
    working.get(id).influencers.forEach(influencerId => {
      const influencer = working.get(influencerId);
      if (!influencer.influencees.includes(id)) {
        influencer.influencees.push(id);
        touched.add(influencerId);
      }
    });
  });

  touched.forEach(id => {
    const node = working.get(id);
    node.class = classOf(node);
    const { blocking, unused } = classifyInfluencers({ thisNode: node });
    node.blockingInfluencers = blocking;
    node.unusedInfluencers = unused;
    node.isSelfBlocking = blocking.includes(node.id);
  });

  const createdIds = new Set(creates.map(n => n.id));
  const updates = [...touched]
    .filter(id => !createdIds.has(id))
    .map(id => {
      const before = existingNodes.find(n => n.id == id);
      const after = working.get(id);
      const fields = {};
      const previous = {};
      LINK_FIELDS.forEach(field => {
        if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
          fields[field] = after[field];
          previous[field] = before[field] === undefined ? null : before[field];
        }
      });
      return { id, fields, previous };
    })
    .filter(u => Object.keys(u.fields).length);
  return { creates, updates, problems };
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
