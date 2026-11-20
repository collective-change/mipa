import { create, all } from "mathjs";

/**
 * System Dynamics Methodology & Systems Thinking Engine
 *
 * Implements classical System Dynamics principles (Jay Forrester, Donella Meadows):
 * - Stock & Flow factor classification
 * - Automated Feedback Loop detection (Reinforcing R vs Balancing B cycles)
 * - Numerical edge polarity inference via single-pass factor perturbation
 * - System Archetype identification (Shifting the Burden, Fixes that Fail, Eroding Goals,
 *   Success to the Successful, Tragedy of the Commons, Escalation, Growth and Underinvestment,
 *   Attractiveness Principle, Limits to Growth, Policy Resistance)
 * - Donella Meadows' 12 Leverage Points hierarchy mapping
 */

const VALID_IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const POLARITY_EPSILON = 1e-12;
const DEFAULT_TIME_SCOPE = Object.freeze({ dt: 1, timeS: 0, initialTimeS: 0 });

const BUILTIN_FORMULA_IDENTIFIERS = new Set([
  "delay",
  "min",
  "max",
  "abs",
  "round",
  "sqrt",
  "exp",
  "log",
  "log10",
  "log2",
  "ceil",
  "floor",
  "sign",
  "pow",
  "sin",
  "cos",
  "tan",
  "dt",
  "timeS",
  "initialTimeS",
  "pi",
  "e",
  "true",
  "false",
  "best_guess",
  "valueInUnit",
  "getSimDayOfWeek",
  "getSimMonth",
  "getSimCalendarMonth",
  "getSimYear"
]);

function createPolarityMath() {
  const instance = create(all);

  const delayFn = (args, _math, scopeMap) => {
    if (args.length > 0 && args[0]) {
      try {
        const val = args[0].compile().evaluate(scopeMap);
        const numeric = toFiniteNumber(val);
        if (numeric !== null) return numeric;
      } catch {
        // Fallback to initial value argument if expression fails at unseeded scope
      }
    }
    if (args.length >= 3 && args[2]) {
      try {
        const initVal = args[2].compile().evaluate(scopeMap);
        const numeric = toFiniteNumber(initVal);
        if (numeric !== null) return numeric;
      } catch {
        // Ignore non-numeric initial value like "best_guess"
      }
    }
    return 1.7;
  };
  delayFn.rawArgs = true;

  const valueInUnitFn = (args, _math, scopeMap) => {
    if (args.length === 0 || !args[0]) return 0;
    const val = args[0].compile().evaluate(scopeMap);
    return toFiniteNumber(val) ?? val;
  };
  valueInUnitFn.rawArgs = true;

  instance.import(
    {
      delay: delayFn,
      valueInUnit: valueInUnitFn,
      getSimDayOfWeek: () => 1,
      getSimMonth: () => 1,
      getSimCalendarMonth: () => 1,
      getSimYear: () => 2026
    },
    { override: true }
  );

  return instance;
}

const polarityMath = createPolarityMath();

/**
 * Extracts a finite real number from a mathjs evaluation result.
 * Rejects NaN, Infinity, and non-real Complex results.
 */
function toFiniteNumber(val) {
  if (typeof val === "number") {
    return Number.isFinite(val) ? val : null;
  }
  if (typeof val === "boolean") {
    return val ? 1 : 0;
  }
  if (val && typeof val === "object") {
    if (val.isComplex) {
      if (typeof val.im === "number" && Math.abs(val.im) > POLARITY_EPSILON) return null;
      return Number.isFinite(val.re) ? val.re : null;
    }
    if (val.isUnit) {
      try {
        const inOwnUnit = val.toNumber(val.formatUnits());
        if (typeof inOwnUnit === "number" && Number.isFinite(inOwnUnit)) return inOwnUnit;
      } catch {
        // Fall through to raw SI value
      }
      return typeof val.value === "number" && Number.isFinite(val.value) ? val.value : null;
    }
    if (typeof val.toNumber === "function") {
      try {
        const num = val.toNumber();
        return typeof num === "number" && Number.isFinite(num) ? num : null;
      } catch {
        return null;
      }
    }
    if ("value" in val && typeof val.value === "number") {
      return Number.isFinite(val.value) ? val.value : null;
    }
  }
  if (typeof val === "string" && val.trim() === "") return null;
  const parsed = Number(val);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Returns the formula text of a node across test (`formula`) and persisted (`symbolFormula` / `sysFormula`) schemas.
 */
function getNodeRawFormula(node = {}) {
  const candidate = node?.formula ?? node?.symbolFormula ?? node?.sysFormula ?? "";
  return String(candidate).trim();
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replaces `$<nodeId>` references (including hyphenated IDs) with safe mathjs identifiers.
 */
function normalizeDollarReferences(formulaText, idAliasEntries) {
  if (!formulaText || !formulaText.includes("$") || !idAliasEntries.length) {
    return formulaText;
  }
  let normalized = formulaText;
  for (const { id, alias } of idAliasEntries) {
    if (!id) continue;
    const pattern = new RegExp(`\\$${escapeRegExp(id)}(?![A-Za-z0-9_-])`, "g");
    normalized = normalized.replace(pattern, alias);
  }
  return normalized;
}

function compileFormulaSpec(rawFormula, idAliasEntries) {
  if (!rawFormula) {
    return { compiled: null, usedSymbols: new Set(), hasSyntaxError: false };
  }
  const normalized = normalizeDollarReferences(rawFormula, idAliasEntries);
  try {
    const ast = polarityMath.parse(normalized);
    const usedSymbols = new Set();
    ast.traverse((astNode, path, parent) => {
      if (astNode.isSymbolNode && !(parent && parent.isFunctionNode && path === "fn")) {
        if (!BUILTIN_FORMULA_IDENTIFIERS.has(astNode.name)) {
          usedSymbols.add(astNode.name);
        }
      }
    });
    return { compiled: ast.compile(), usedSymbols, hasSyntaxError: false };
  } catch {
    return { compiled: null, usedSymbols: new Set(), hasSyntaxError: true };
  }
}

function defaultSeedForIndex(idx) {
  // Distinct positive values avoid zero division and tie kinks in min()/max().
  return 1.7 + (idx % 19) * 0.37;
}

function extractCallerBaselineValue(baselineValues, node) {
  if (!baselineValues) return null;
  const lookupKeys = [node.id, node.symbol].filter(Boolean);
  for (const key of lookupKeys) {
    const raw = baselineValues instanceof Map ? baselineValues.get(key) : baselineValues[key];
    if (Array.isArray(raw)) {
      for (let i = raw.length - 1; i >= 0; i--) {
        const n = toFiniteNumber(raw[i]);
        if (n !== null) return n;
      }
    } else {
      const n = toFiniteNumber(raw);
      if (n !== null) return n;
    }
  }
  return null;
}

function readNodeSeedValue(node) {
  for (const candidate of [node?.baseValue, node?.latestValue, node?.value]) {
    if (candidate === "" || candidate === null || candidate === undefined) continue;
    const numeric = toFiniteNumber(candidate);
    if (numeric !== null) return numeric;
  }
  return null;
}

function setScopeKeys(scope, keys, value) {
  for (const key of keys) {
    scope.set(key, value);
  }
}

function evaluateCompiled(compiled, scope) {
  if (!compiled) return null;
  try {
    return toFiniteNumber(compiled.evaluate(scope));
  } catch {
    return null;
  }
}

function computePerturbationDelta(baseVal) {
  return Math.max(Math.abs(baseVal) * 0.05, 0.25);
}

/**
 * Resolves the sign of `target - base` from a sequence of perturbation steps on an edge
 * that hits a flat region (e.g., `round()`, `max(0, ...)` clamp) or domain error at baseline.
 */
function probeIsolatedEdgePolarity(srcEntry, tgtEntry, baseScope) {
  const probeConfigs = [
    { srcVal: srcEntry.baseline, delta: Math.max(Math.abs(srcEntry.baseline) * 0.5, 2.5), boostOthers: false },
    { srcVal: 0.25, delta: 0.25, boostOthers: true },
    { srcVal: 2.5, delta: 2.5, boostOthers: true }
  ];

  for (const cfg of probeConfigs) {
    const probeScope = new Map(baseScope);
    if (cfg.boostOthers) {
      let freeIdx = 0;
      for (const sym of tgtEntry.usedSymbols) {
        if (!srcEntry.scopeKeys.includes(sym)) {
          probeScope.set(sym, 15 + freeIdx * 2.3);
          freeIdx++;
        }
      }
    }

    setScopeKeys(probeScope, srcEntry.scopeKeys, cfg.srcVal);
    const valBefore = evaluateCompiled(tgtEntry.compiled, probeScope);
    if (valBefore === null) continue;

    setScopeKeys(probeScope, srcEntry.scopeKeys, cfg.srcVal + cfg.delta);
    const valAfter = evaluateCompiled(tgtEntry.compiled, probeScope);
    if (valAfter === null) continue;

    const diff = valAfter - valBefore;
    if (diff < -POLARITY_EPSILON) return -1;
    if (diff > POLARITY_EPSILON) return 1;
  }

  return 1;
}

function getNodeScopeKeys(node, alias, symbolSet) {
  const keys = [alias];
  if (node?.symbol && VALID_IDENTIFIER_RE.test(node.symbol)) {
    keys.push(node.symbol);
  }
  if (node?.id) {
    keys.push(`$${node.id}`);
    if (VALID_IDENTIFIER_RE.test(node.id) && !symbolSet.has(node.id) && !keys.includes(node.id)) {
      keys.push(node.id);
    }
  }
  return Array.from(new Set(keys));
}

function orderNodesForBaselinePass(entries) {
  const count = entries.length;
  const inDegree = new Array(count).fill(0);
  const dependents = Array.from({ length: count }, () => []);
  const keyToIndex = new Map();

  entries.forEach((entry, idx) => {
    for (const key of entry.scopeKeys) {
      if (!keyToIndex.has(key)) keyToIndex.set(key, idx);
    }
  });

  entries.forEach((entry, tgtIdx) => {
    const seenSources = new Set();
    const influencers = Array.isArray(entry.node.influencers) ? entry.node.influencers : [];
    for (const infId of influencers) {
      const idx = keyToIndex.get(`$${infId}`) ?? keyToIndex.get(infId);
      if (idx !== undefined && idx !== tgtIdx) seenSources.add(idx);
    }
    for (const sym of entry.usedSymbols) {
      const idx = keyToIndex.get(sym);
      if (idx !== undefined && idx !== tgtIdx) seenSources.add(idx);
    }
    for (const srcIdx of seenSources) {
      dependents[srcIdx].push(tgtIdx);
      inDegree[tgtIdx]++;
    }
  });

  const queue = [];
  for (let i = 0; i < count; i++) {
    if (inDegree[i] === 0) queue.push(i);
  }

  const ordered = [];
  const visited = new Array(count).fill(false);
  while (queue.length > 0) {
    const idx = queue.shift();
    if (visited[idx]) continue;
    visited[idx] = true;
    ordered.push(entries[idx]);
    for (const nextIdx of dependents[idx]) {
      inDegree[nextIdx]--;
      if (inDegree[nextIdx] <= 0 && !visited[nextIdx]) {
        queue.push(nextIdx);
      }
    }
  }

  // Append cyclic nodes in original order so every node executes in the baseline pass
  for (let i = 0; i < count; i++) {
    if (!visited[i]) ordered.push(entries[i]);
  }
  return ordered;
}

/**
 * Computes numerical edge polarities across a factor model in one perturbation pass per source factor.
 *
 * Each factor is perturbed at most once against the baseline evaluation scope, and every direct
 * reader target is evaluated once per perturbation (`O(V + E)` formula evaluations across the model).
 *
 * @param {Array} nodes - Model factor nodes
 * @param {Object} [options] - Optional { baselineValues, edgePairs, onPerturbFactor }
 * @returns {{ edgePolarities: Map<string, number>, perturbedFactorIds: string[], baselineValues: Map<string, number> }}
 */
export function computeModelEdgePolarities(nodes = [], options = {}) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return { edgePolarities: new Map(), perturbedFactorIds: [], baselineValues: new Map() };
  }

  const symbolSet = new Set(nodes.map((n) => n?.symbol).filter(Boolean));
  const idAliasEntries = nodes
    .map((n, idx) => ({ id: n?.id || "", alias: `__n_${idx}_ref` }))
    .filter((entry) => entry.id)
    .sort((a, b) => b.id.length - a.id.length);

  const aliasById = new Map(idAliasEntries.map((item) => [item.id, item.alias]));

  const entries = nodes.map((node, idx) => {
    const nodeId = node?.id || `__node_${idx}`;
    const alias = aliasById.get(node?.id) || `__n_${idx}_ref`;
    const rawFormula = getNodeRawFormula(node);
    const { compiled, usedSymbols, hasSyntaxError } = compileFormulaSpec(rawFormula, idAliasEntries);
    const scopeKeys = getNodeScopeKeys(node, alias, symbolSet);
    const callerBaseline = extractCallerBaselineValue(options.baselineValues, node);
    const initialSeed = callerBaseline ?? readNodeSeedValue(node) ?? defaultSeedForIndex(idx);

    return {
      nodeId,
      node,
      alias,
      compiled,
      usedSymbols,
      hasSyntaxError,
      scopeKeys,
      hasExplicitBaseline: callerBaseline !== null,
      baseline: initialSeed
    };
  });

  const entryById = new Map(entries.map((entry) => [entry.nodeId, entry]));
  const baseScope = new Map(Object.entries(DEFAULT_TIME_SCOPE));

  // Seed all free symbols and initial node placeholders with distinct positive defaults
  let freeSeedCounter = entries.length + 1;
  for (const entry of entries) {
    for (const sym of entry.usedSymbols) {
      if (!baseScope.has(sym)) {
        const callerFree = options.baselineValues
          ? extractCallerBaselineValue(options.baselineValues, { symbol: sym })
          : null;
        baseScope.set(sym, callerFree ?? defaultSeedForIndex(freeSeedCounter++));
      }
    }
    setScopeKeys(baseScope, entry.scopeKeys, entry.baseline);
  }

  // Single topological/Gauss-Seidel pass to resolve real baseline values across nodes
  const orderedEntries = orderNodesForBaselinePass(entries);
  for (const entry of orderedEntries) {
    if (!entry.hasExplicitBaseline && entry.compiled) {
      const evaluated = evaluateCompiled(entry.compiled, baseScope);
      if (evaluated !== null) {
        entry.baseline = evaluated;
        setScopeKeys(baseScope, entry.scopeKeys, evaluated);
      }
    }
  }

  // Cache each target's exact formula value under the final settled baseline scope
  const baselineOutputs = new Map();
  for (const entry of entries) {
    baselineOutputs.set(
      entry.nodeId,
      entry.compiled ? evaluateCompiled(entry.compiled, baseScope) : entry.baseline
    );
  }

  // Collect edges to evaluate, grouped by unique source factor so each factor is perturbed once
  const readersBySource = new Map();
  if (Array.isArray(options.edgePairs)) {
    for (const pair of options.edgePairs) {
      if (!pair) continue;
      const srcId = pair.srcId ?? pair[0];
      const tgtId = pair.tgtId ?? pair[1];
      if (!entryById.has(srcId) || !entryById.has(tgtId)) continue;
      if (!readersBySource.has(srcId)) readersBySource.set(srcId, new Set());
      readersBySource.get(srcId).add(tgtId);
    }
  } else {
    for (const tgt of entries) {
      const influencers = Array.isArray(tgt.node.influencers) ? tgt.node.influencers : [];
      for (const srcId of influencers) {
        if (!entryById.has(srcId)) continue;
        if (!readersBySource.has(srcId)) readersBySource.set(srcId, new Set());
        readersBySource.get(srcId).add(tgt.nodeId);
      }
    }
  }

  const edgePolarities = new Map();
  const perturbedFactorIds = [];
  const perturbedScope = new Map(baseScope);

  for (const [srcId, readerIds] of readersBySource.entries()) {
    const srcEntry = entryById.get(srcId);
    const delta = computePerturbationDelta(srcEntry.baseline);
    const perturbedVal = srcEntry.baseline + delta;

    // Perturb this source factor ONCE for all of its readers
    setScopeKeys(perturbedScope, srcEntry.scopeKeys, perturbedVal);
    perturbedFactorIds.push(srcId);
    if (typeof options.onPerturbFactor === "function") {
      options.onPerturbFactor(srcId);
    }

    for (const tgtId of readerIds) {
      const tgtEntry = entryById.get(tgtId);
      const edgeKey = `${srcId}->${tgtId}`;

      if (!tgtEntry.compiled || tgtEntry.hasSyntaxError) {
        edgePolarities.set(edgeKey, 1);
        continue;
      }

      const srcReferenced = srcEntry.scopeKeys.some((key) => tgtEntry.usedSymbols.has(key));
      if (!srcReferenced) {
        edgePolarities.set(edgeKey, 1);
        continue;
      }

      const baseOut = baselineOutputs.get(tgtId);
      const pertOut = evaluateCompiled(tgtEntry.compiled, perturbedScope);

      if (baseOut !== null && pertOut !== null) {
        const diff = pertOut - baseOut;
        if (diff < -POLARITY_EPSILON) {
          edgePolarities.set(edgeKey, -1);
          continue;
        }
        if (diff > POLARITY_EPSILON) {
          edgePolarities.set(edgeKey, 1);
          continue;
        }
      }

      edgePolarities.set(edgeKey, probeIsolatedEdgePolarity(srcEntry, tgtEntry, baseScope));
    }

    // Restore source factor to baseline before perturbing the next source factor
    setScopeKeys(perturbedScope, srcEntry.scopeKeys, srcEntry.baseline);
  }

  const resolvedBaselineMap = new Map(entries.map((entry) => [entry.nodeId, entry.baseline]));
  return { edgePolarities, perturbedFactorIds, baselineValues: resolvedBaselineMap };
}

/**
 * Classifies a factor into classical System Dynamics types:
 * - 'stock': Accumulation over time (uses delay(), integral behavior, inertia)
 * - 'flow': Rate of change modifying a stock
 * - 'constant': Parameter or static baseline number
 * - 'auxiliary': Intermediate algebra / policy calculation
 *
 * @param {Object} node - Factor node object
 * @returns {Object} Factor classification { type, label, description }
 */
export function classifyFactorType(node = {}) {
  const formula = getNodeRawFormula(node);

  // If formula is empty or purely a numeric literal -> Constant parameter
  if (!formula || /^-?\d+(\.\d+)?$/.test(formula)) {
    return {
      type: "constant",
      label: "Constant / Parameter",
      description: "Fixed baseline number or operational constant (Meadows Level 12)."
    };
  }

  // If formula contains delay() -> Stock / Accumulation with historical inertia
  if (/delay\s*\(/.test(formula)) {
    return {
      type: "stock",
      label: "Stock / Accumulation",
      description: "Accumulated state over time with physical or informational inertia."
    };
  }

  // Rate / Flow heuristic: names or formulas with rate, delta, change, growth, per, flow
  const isFlowPattern = /\b(rate|delta|flow|speed|flux|growth|decline)\b/i.test(node.name || "") ||
    /(rate|delta|flow|speed|flux|growth|decline)/i.test(node.symbol || "");
  if (isFlowPattern) {
    return {
      type: "flow",
      label: "Flow / Rate of Change",
      description: "Rate that fills or drains an accumulation over time."
    };
  }

  // Standard auxiliary calculation
  return {
    type: "auxiliary",
    label: "Auxiliary Variable",
    description: "Intermediate algebra, information link, or decision rule."
  };
}

/**
 * Evaluates the numerical polarity (+1 or -1) of the causal dependency from source to target
 * by perturbing the source factor and reading the sign of the change in the target's formula.
 *
 * @param {Object} sourceNode - Influencer node
 * @param {Object} targetNode - Influenced node
 * @param {Object} [options] - Optional precomputed { edgePolarities, baselineValues }
 * @returns {number} +1 (positive link / reinforcing), -1 (negative link / balancing)
 */
export function determineEdgePolarity(sourceNode = {}, targetNode = {}, options = {}) {
  const srcId = sourceNode?.id || sourceNode?.symbol || "__src";
  const tgtId = targetNode?.id || targetNode?.symbol || "__tgt";

  if (options.edgePolarities instanceof Map) {
    const precomputed = options.edgePolarities.get(`${srcId}->${tgtId}`);
    if (precomputed === 1 || precomputed === -1) return precomputed;
  }

  const rawFormula = getNodeRawFormula(targetNode);
  if (!rawFormula || (!sourceNode?.symbol && !sourceNode?.id)) return 1;

  const srcNormalized = { ...sourceNode, id: srcId };
  const tgtNormalized = { ...targetNode, id: tgtId };
  const { edgePolarities } = computeModelEdgePolarities([srcNormalized, tgtNormalized], {
    baselineValues: options.baselineValues,
    edgePairs: [{ srcId, tgtId }]
  });

  return edgePolarities.get(`${srcId}->${tgtId}`) ?? 1;
}

/**
 * Detects all directed elementary feedback loops (cycles) in the factor graph.
 *
 * @param {Array} nodes - Factor node list
 * @param {Object} [options] - Options { maxCycleLength: 6, baselineValues, onPerturbFactor }
 * @returns {Array} List of detected feedback loops
 */
export function detectFeedbackLoops(nodes = [], options = {}) {
  if (!Array.isArray(nodes) || nodes.length < 2) return [];

  const maxLen = options.maxCycleLength || 6;
  const nodeMap = new Map();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  // Build adjacency list: source -> [targets]
  // In Mipa: targetNode has influencers = [sourceNodeId]
  const adj = new Map();
  nodes.forEach((n) => adj.set(n.id, []));

  nodes.forEach((target) => {
    const influencers = Array.isArray(target.influencers) ? target.influencers : [];
    influencers.forEach((srcId) => {
      if (adj.has(srcId)) {
        adj.get(srcId).push(target.id);
      }
    });
  });

  const rawCycles = [];
  const visited = new Set();
  const path = [];

  function dfs(currId, startId, depth) {
    if (depth > maxLen) return;

    path.push(currId);
    visited.add(currId);

    const neighbors = adj.get(currId) || [];
    for (const neighborId of neighbors) {
      if (neighborId === startId && path.length >= 2) {
        // Found a cycle! Canonicalize to avoid duplicates: lowest node ID must be first
        const cycle = [...path];
        const minId = cycle.reduce((m, id) => (id < m ? id : m), cycle[0]);
        if (cycle[0] === minId) {
          rawCycles.push(cycle);
        }
      } else if (!visited.has(neighborId)) {
        dfs(neighborId, startId, depth + 1);
      }
    }

    path.pop();
    visited.delete(currId);
  }

  // Run DFS from each node as start
  for (const node of nodes) {
    dfs(node.id, node.id, 1);
  }

  if (rawCycles.length === 0) return [];

  // Deduplicate cycle edges so each source factor is perturbed once per model
  const uniqueCycleEdges = [];
  const seenEdgeKeys = new Set();
  for (const cycleIds of rawCycles) {
    for (let i = 0; i < cycleIds.length; i++) {
      const srcId = cycleIds[i];
      const tgtId = cycleIds[(i + 1) % cycleIds.length];
      const key = `${srcId}->${tgtId}`;
      if (!seenEdgeKeys.has(key)) {
        seenEdgeKeys.add(key);
        uniqueCycleEdges.push({ srcId, tgtId });
      }
    }
  }

  const { edgePolarities } = computeModelEdgePolarities(nodes, {
    baselineValues: options.baselineValues,
    edgePairs: uniqueCycleEdges,
    onPerturbFactor: options.onPerturbFactor
  });

  // Analyze cycle polarities
  let reinforcingCount = 0;
  let balancingCount = 0;

  return rawCycles.map((cycleIds) => {
    let polarityProduct = 1;
    let hasDelay = false;
    const factorDetails = [];

    for (let i = 0; i < cycleIds.length; i++) {
      const srcId = cycleIds[i];
      const tgtId = cycleIds[(i + 1) % cycleIds.length];

      const src = nodeMap.get(srcId) || { id: srcId, symbol: srcId, name: srcId };
      const tgt = nodeMap.get(tgtId) || { id: tgtId, symbol: tgtId, name: tgtId };

      const edgePolarity = edgePolarities.get(`${srcId}->${tgtId}`) ?? 1;
      polarityProduct *= edgePolarity;

      if (/delay\s*\(/.test(getNodeRawFormula(tgt))) {
        hasDelay = true;
      }

      factorDetails.push({
        id: src.id,
        symbol: src.symbol || src.id,
        name: src.name || src.symbol || src.id,
        edgeToNextPolarity: edgePolarity
      });
    }

    const isReinforcing = polarityProduct > 0;
    const loopType = isReinforcing ? "reinforcing" : "balancing";

    if (isReinforcing) reinforcingCount++;
    else balancingCount++;

    const code = isReinforcing ? `R${reinforcingCount}` : `B${balancingCount}`;
    const nameStr = factorDetails.map((f) => f.symbol || f.name).join(" → ") + " → " + (factorDetails[0].symbol || factorDetails[0].name);

    return {
      id: `loop_${code}_${cycleIds.join("_")}`,
      code,
      type: loopType,
      polarityProduct,
      length: cycleIds.length,
      nodeIds: cycleIds,
      factors: factorDetails,
      hasDelay,
      name: `${code}: ${nameStr}`,
      description: isReinforcing
        ? "Reinforcing loop (positive feedback): compounds virtuous growth or vicious decline."
        : "Balancing loop (negative feedback): creates goal-seeking behavior, equilibrium, or systemic resistance."
    };
  });
}

export const SYSTEM_ARCHETYPE_CATALOG = Object.freeze({
  shifting_the_burden: {
    archetype: "shifting_the_burden",
    i18nKey: "shiftingTheBurden",
    name: "Shifting the Burden",
    meadowsLevel: 5,
    looksLike:
      "A quick symptomatic fix and a slower fundamental solution both target the same problem symptom, while the quick fix quietly erodes capacity for the fundamental solution.",
    implication:
      "The quick fix looks most attractive in short-term comparisons because relief is immediate, yet root capability degrades over time and dependency grows.",
    recommendation:
      "Commit resources to rebuilding the fundamental capability while tapering reliance on the symptomatic relief loop."
  },
  fixes_that_fail: {
    archetype: "fixes_that_fail",
    i18nKey: "fixesThatFail",
    name: "Fixes that Fail",
    meadowsLevel: 9,
    looksLike:
      "A fast corrective fix relieves a problem symptom in the short run, but the same fix triggers a delayed unintended consequence that brings the problem back worse than before.",
    implication:
      "Actions judged only on immediate relief appear effective while actually compounding long-term systemic cost behind the delay.",
    recommendation:
      "Acknowledge the delayed side effect, avoid repeating the symptomatic fix blindly, and redesign the intervention around root causes."
  },
  eroding_goals: {
    archetype: "eroding_goals",
    i18nKey: "erodingGoals",
    name: "Eroding Goals",
    meadowsLevel: 3,
    looksLike:
      "A performance gap can be closed in two opposing ways: delayed effort to lift actual performance, or lowering the target goal itself so the shortfall looks smaller.",
    implication:
      "Because lowering standards relieves tension faster than real improvement, long-term ambition steadily drifts downward.",
    recommendation:
      "Anchor the performance target externally so shortfalls drive sustained capability improvement rather than softer goals."
  },
  success_to_successful: {
    archetype: "success_to_successful",
    i18nKey: "successToSuccessful",
    name: "Success to the Successful",
    meadowsLevel: 5,
    looksLike:
      "Two reinforcing growth loops compete through a zero-sum resource split where early advantage to one starves the other of funding or attention.",
    implication:
      "Outcomes reflect initial allocation rules rather than merit: one contender dominates while a potentially viable alternative withers.",
    recommendation:
      "Decouple the shared allocation rule, guarantee baseline resources for alternatives, or evaluate both tracks independently."
  },
  tragedy_of_the_commons: {
    archetype: "tragedy_of_the_commons",
    i18nKey: "tragedyOfTheCommons",
    name: "Tragedy of the Commons",
    meadowsLevel: 5,
    looksLike:
      "Independent actors pursue their own reinforcing gains while drawing on a shared resource pool, eroding returns for everyone as total load climbs.",
    implication:
      "Each participant sees local benefit from doing more while shared capacity collapses under collective overuse.",
    recommendation:
      "Establish shared stewardship rules, transparent commons metrics, or collective caps that reconnect total usage back to each actor."
  },
  escalation: {
    archetype: "escalation",
    i18nKey: "escalation",
    name: "Escalation",
    meadowsLevel: 8,
    looksLike:
      "Two separate parties each react to protect their relative standing, creating a figure-eight reinforcing arms race that pushes both sides upward.",
    implication:
      "Neither side gains lasting advantage as effort and cost escalate endlessly in response to the other.",
    recommendation:
      "Shift from relative comparisons to absolute goals, create unilateral de-escalation steps, or negotiate mutual balancing agreements."
  },
  growth_and_underinvestment: {
    archetype: "growth_and_underinvestment",
    i18nKey: "growthAndUnderinvestment",
    name: "Growth and Underinvestment",
    meadowsLevel: 6,
    looksLike:
      "Demand growth slows against a capacity limit while delayed investment in capacity responds sluggishly or gets deferred as standards soften.",
    implication:
      "Temporary slowdowns get misread as weak demand, justifying underinvestment that locks in a permanent ceiling.",
    recommendation:
      "Invest ahead of capacity bottlenecks and hold service standards steady instead of cutting capacity forecasts when quality dips."
  },
  attractiveness_principle: {
    archetype: "attractiveness_principle",
    i18nKey: "attractivenessPrinciple",
    name: "Attractiveness Principle",
    meadowsLevel: 6,
    looksLike:
      "A single reinforcing growth engine pushes directly against multiple distinct balancing constraints (such as funding, staffing, and quality) at once.",
    implication:
      "Relieving only one limit immediately shifts binding pressure onto the others; spreading effort thinly across every front stalls progress.",
    recommendation:
      "Identify which constraints are binding first and decide explicitly which tradeoffs to accept rather than chasing every goal equally."
  },
  limits_to_growth: {
    archetype: "limits_to_growth",
    i18nKey: "limitsToGrowth",
    name: "Limits to Growth",
    meadowsLevel: 6,
    looksLike:
      "A reinforcing growth engine encounters a balancing constraint loop that slows, caps, or reverses further expansion.",
    implication:
      "Pushing harder on the growth driver yields diminishing returns once the limiting constraint begins to bind.",
    recommendation:
      "Do not push harder on the growth engine; proactively remove or expand the balancing capacity limit before saturation."
  },
  policy_resistance: {
    archetype: "policy_resistance",
    i18nKey: "policyResistance",
    name: "Policy Resistance & Delayed Oscillation",
    meadowsLevel: 8,
    looksLike:
      "A balancing control loop contains a delay between action and observed result, causing adjustments to overshoot the target and oscillate.",
    implication:
      "Aggressive short-term corrections amplify swings and undermine trust in the policy.",
    recommendation:
      "Shorten reporting delays, slow down rapid policy adjustments, and base decisions on system stock trends rather than transient noise."
  }
});

export const MISSING_LOOP_DESCRIPTIONS = Object.freeze({
  shiftingSideEffectR:
    "Missing reinforcing side-effect loop (R) showing whether the symptomatic quick fix weakens capacity for the fundamental solution.",
  shiftingFundamentalB:
    "Missing fundamental solution balancing loop (B) showing how direct capability investment resolves the root cause without the quick fix.",
  fixesReboundR:
    "Missing delayed reinforcing rebound loop (R) closing from the unintended side-effect factor back to worsen the original problem.",
  fixesReboundDelay:
    "Missing time delay on the reinforcing rebound loop (R) explaining why the side effect appears after short-term relief.",
  erodingCorrectiveB:
    "Missing corrective action balancing loop (B) raising actual performance toward the goal instead of lowering the target.",
  successCompetingR:
    "Missing competing reinforcing loop (R) capturing how resource diversion weakens the second contender over time.",
  tragedyCommonsB:
    "Missing balancing commons-depletion loop (B) feeding shared congestion or scarcity back to every user.",
  tragedySecondActorR:
    "Missing second actor's reinforcing growth loop (R) driving independent pressure on the shared commons.",
  escalationCompetitorB:
    "Missing opponent's balancing anchor loop (B) balancing its own effort against its internal standard.",
  growthCapacityInvestB:
    "Missing delayed capacity investment balancing loop (B) expanding bottleneck capacity before growth stalls.",
  growthDemandEngineR:
    "Missing reinforcing demand growth loop (R) that capacity expansion would otherwise sustain.",
  attractivenessSecondLimitB:
    "Missing second balancing constraint loop (B) closing the unlooped limit factor back onto the growth engine.",
  limitsBoundingB:
    "Missing balancing constraint loop (B) naming what real-world ceiling or limit slows and stops this growth.",
  policyResistanceDelay:
    "Missing reporting or physical response delay on opposing balancing loops explaining why corrective pushes overshoot."
});

function buildLoopMeta(loop, nodeMap) {
  const nodeIds = Array.isArray(loop?.nodeIds) ? loop.nodeIds : [];
  const factors = Array.isArray(loop?.factors) ? loop.factors : [];
  const nodeSet = new Set(nodeIds);
  const edges = [];
  const edgeKeys = new Set();
  const incomingByTarget = new Map();
  const outgoingBySource = new Map();

  for (let i = 0; i < nodeIds.length; i++) {
    const from = nodeIds[i];
    const to = nodeIds[(i + 1) % nodeIds.length];
    const factorEntry = factors[i];
    const polarity =
      factorEntry && (factorEntry.edgeToNextPolarity === 1 || factorEntry.edgeToNextPolarity === -1)
        ? factorEntry.edgeToNextPolarity
        : 1;
    edges.push({ from, to, polarity });
    edgeKeys.add(`${from}->${to}`);
    if (!outgoingBySource.has(from)) outgoingBySource.set(from, []);
    outgoingBySource.get(from).push(polarity);
    if (!incomingByTarget.has(to)) incomingByTarget.set(to, []);
    incomingByTarget.get(to).push(polarity);
  }

  const label = (id) => {
    const factor = factors.find((f) => f.id === id);
    const node = nodeMap.get(id);
    return factor?.name || node?.name || factor?.symbol || node?.symbol || id;
  };

  return { loop, nodeIds, nodeSet, edges, edgeKeys, incomingByTarget, outgoingBySource, label };
}

function setIntersect(a, b) {
  const out = [];
  for (const id of a) {
    if (b.has(id)) out.push(id);
  }
  return out;
}

function setDiff(a, b) {
  const out = [];
  for (const id of a) {
    if (!b.has(id)) out.push(id);
  }
  return out;
}

function directedPathPolarity(meta, startId, endId) {
  const n = meta.nodeIds.length;
  const startIdx = meta.nodeIds.indexOf(startId);
  if (startIdx < 0 || !meta.nodeSet.has(endId) || startId === endId) return null;
  let product = 1;
  for (let step = 0; step < n; step++) {
    const edge = meta.edges[(startIdx + step) % n];
    product *= edge.polarity;
    if (edge.to === endId) return product;
  }
  return null;
}

function sameSignAtSharedNode(metaA, metaB, sharedId) {
  const inA = metaA.incomingByTarget.get(sharedId) || [];
  const inB = metaB.incomingByTarget.get(sharedId) || [];
  return inA.length > 0 && inB.length > 0 && inA[0] === inB[0];
}

function oppositeSignAtSharedNode(metaA, metaB, sharedId) {
  const inA = metaA.incomingByTarget.get(sharedId) || [];
  const inB = metaB.incomingByTarget.get(sharedId) || [];
  const outA = metaA.outgoingBySource.get(sharedId) || [];
  const outB = metaB.outgoingBySource.get(sharedId) || [];
  const inDiff = inA.length > 0 && inB.length > 0 && inA[0] !== inB[0];
  const outDiff = outA.length > 0 && outB.length > 0 && outA[0] !== outB[0];
  return inDiff || outDiff;
}

function factorNamesFor(ids, nodeMap, loopMetas = [], limit = 4) {
  const seen = new Set();
  const names = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const node = nodeMap.get(id);
    let label = node?.name || node?.symbol;
    if (!label) {
      for (const meta of loopMetas) {
        const f = meta.loop.factors?.find((item) => item.id === id);
        if (f) {
          label = f.name || f.symbol;
          break;
        }
      }
    }
    names.push(label || id);
    if (names.length >= limit) break;
  }
  return names;
}

function createArchetypeResult({
  id,
  archetypeKey,
  status = "complete",
  presentLoops = [],
  missingLoopKey = null,
  involvedFactorIds = [],
  involvedFactorNames = [],
  descriptionOverride = null,
  recommendationOverride = null,
  looksLikeOverride = null,
  extra = {}
}) {
  const spec = SYSTEM_ARCHETYPE_CATALOG[archetypeKey];
  const isPartial = status === "partial";
  const missingLoop = isPartial && missingLoopKey ? MISSING_LOOP_DESCRIPTIONS[missingLoopKey] || null : null;
  const looksLike = looksLikeOverride || spec.looksLike;
  const implication = spec.implication;
  const description = descriptionOverride || `${looksLike} ${implication}`;

  return {
    id,
    name: spec.name,
    archetype: spec.archetype,
    i18nKey: spec.i18nKey,
    status,
    isPartial,
    presentLoops,
    missingLoopKey,
    missingLoop,
    involvedFactorIds,
    involvedFactorNames,
    looksLike,
    implication,
    meadowsLevel: spec.meadowsLevel,
    description,
    recommendation: recommendationOverride || spec.recommendation,
    ...extra
  };
}

function hasDelayFormula(node) {
  return /delay\s*\(/.test(getNodeRawFormula(node));
}

function getTargetInfluencers(node) {
  return Array.isArray(node?.influencers) ? node.influencers : [];
}

/**
 * Identifies common System Dynamics Archetypes from factors and detected loops.
 * Uses existing `detectFeedbackLoops` output without running a separate cycle walk.
 *
 * @param {Array} nodes - Factor nodes
 * @param {Array} loops - Detected feedback loops
 * @returns {Array} List of diagnosed complete and partial archetypes with missing-loop diagnostics
 */
export function detectSystemArchetypes(nodes = [], loops = []) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const safeLoops = Array.isArray(loops) ? loops : [];
  const nodeMap = new Map(safeNodes.map((n) => [n.id, n]));
  const archetypes = [];
  const seenIds = new Set();

  const pushUnique = (entry) => {
    if (!seenIds.has(entry.id)) {
      seenIds.add(entry.id);
      archetypes.push(entry);
    }
  };

  const reinforcingMetas = safeLoops
    .filter((l) => l.type === "reinforcing")
    .map((l) => buildLoopMeta(l, nodeMap));
  const balancingMetas = safeLoops
    .filter((l) => l.type === "balancing")
    .map((l) => buildLoopMeta(l, nodeMap));
  const allLoopNodeIds = new Set(safeLoops.flatMap((l) => l.nodeIds || []));

  const shiftingClaimedRIds = new Set();
  const shiftingBalancingPairs = new Set();
  const erodingBalancingPairs = new Set();
  const pairKey = (a, b) => (a < b ? `${a}::${b}` : `${b}::${a}`);

  // 1. Shifting the Burden (IMPLEMENTED FIRST - third sector's core trap)
  for (let i = 0; i < balancingMetas.length; i++) {
    for (let j = i + 1; j < balancingMetas.length; j++) {
      const mA = balancingMetas[i];
      const mB = balancingMetas[j];
      const shared = setIntersect(mA.nodeSet, mB.nodeSet);
      if (shared.length === 0) continue;

      const onlyA = setDiff(mA.nodeSet, mB.nodeSet);
      const onlyB = setDiff(mB.nodeSet, mA.nodeSet);
      if (onlyA.length === 0 || onlyB.length === 0) continue;

      const matchingIncoming = shared.some((sid) => sameSignAtSharedNode(mA, mB, sid));
      if (!matchingIncoming) continue;

      let bSymp = mA;
      let bFund = mB;
      if (mA.loop.hasDelay && !mB.loop.hasDelay) {
        bSymp = mB;
        bFund = mA;
      } else if (!mA.loop.hasDelay && !mB.loop.hasDelay && mA.loop.length > mB.loop.length) {
        bSymp = mB;
        bFund = mA;
      }

      const sympOnly = setDiff(bSymp.nodeSet, bFund.nodeSet);
      const fundOnly = setDiff(bFund.nodeSet, bSymp.nodeSet);

      const sideEffectR = reinforcingMetas.find((rMeta) => {
        const sMatch = sympOnly.find((id) => rMeta.nodeSet.has(id));
        const fMatch = fundOnly.find((id) => rMeta.nodeSet.has(id));
        if (!sMatch || !fMatch) return false;
        return directedPathPolarity(rMeta, sMatch, fMatch) === -1;
      });

      if (sideEffectR) {
        shiftingClaimedRIds.add(sideEffectR.loop.id);
        shiftingBalancingPairs.add(pairKey(bSymp.loop.id, bFund.loop.id));
        const ids = Array.from(new Set([...bSymp.nodeSet, ...bFund.nodeSet, ...sideEffectR.nodeSet]));
        const names = factorNamesFor(ids, nodeMap, [bSymp, bFund, sideEffectR]);
        pushUnique(
          createArchetypeResult({
            id: `arch_shifting_${bSymp.loop.code}_${bFund.loop.code}_${sideEffectR.loop.code}`,
            archetypeKey: "shifting_the_burden",
            status: "complete",
            presentLoops: [bSymp.loop.code, bFund.loop.code, sideEffectR.loop.code],
            involvedFactorIds: ids,
            involvedFactorNames: names,
            looksLikeOverride: `Quick fix (${bSymp.loop.code}) and fundamental fix (${bFund.loop.code}) both target ${factorNamesFor(shared, nodeMap, [bSymp]).join(", ")}, while ${sideEffectR.loop.code} erodes root capacity.`,
            extra: {
              symptomaticLoop: bSymp.loop.code,
              fundamentalLoop: bFund.loop.code,
              sideEffectLoop: sideEffectR.loop.code,
              sharedFactorIds: shared
            }
          })
        );
      } else if ((!bSymp.loop.hasDelay && bFund.loop.hasDelay) || bSymp.loop.length < bFund.loop.length) {
        shiftingBalancingPairs.add(pairKey(bSymp.loop.id, bFund.loop.id));
        const ids = Array.from(new Set([...bSymp.nodeSet, ...bFund.nodeSet]));
        const names = factorNamesFor(ids, nodeMap, [bSymp, bFund]);
        pushUnique(
          createArchetypeResult({
            id: `arch_shifting_partial_r_${bSymp.loop.code}_${bFund.loop.code}`,
            archetypeKey: "shifting_the_burden",
            status: "partial",
            presentLoops: [bSymp.loop.code, bFund.loop.code],
            missingLoopKey: "shiftingSideEffectR",
            involvedFactorIds: ids,
            involvedFactorNames: names,
            looksLikeOverride: `Both quick fix (${bSymp.loop.code}) and delayed solution (${bFund.loop.code}) act on ${factorNamesFor(shared, nodeMap, [bSymp]).join(", ")}, without showing whether the quick fix undermines fundamental capacity.`,
            extra: {
              symptomaticLoop: bSymp.loop.code,
              fundamentalLoop: bFund.loop.code,
              sharedFactorIds: shared
            }
          })
        );
      }
    }
  }

  // Partial Shifting the Burden P2: fast symptomatic B + delayed R(-1 -> -1 erosion) without direct fundamental B
  for (const bMeta of balancingMetas) {
    if (bMeta.loop.hasDelay) continue;
    for (const rMeta of reinforcingMetas) {
      if (shiftingClaimedRIds.has(rMeta.loop.id)) continue;
      if (rMeta.loop.length <= bMeta.loop.length) continue;
      const shared = setIntersect(bMeta.nodeSet, rMeta.nodeSet);
      if (shared.length < 2) continue;

      const outsideIds = setDiff(rMeta.nodeSet, bMeta.nodeSet);
      const hasSharedDirectedEdge = bMeta.edges.some((e) => rMeta.edgeKeys.has(`${e.from}->${e.to}`));
      if (!hasSharedDirectedEdge || outsideIds.length === 0) continue;

      const erodesExternal = bMeta.edges.some((edge) => {
        if (!rMeta.edgeKeys.has(`${edge.from}->${edge.to}`)) return false;
        const quickFixId = edge.to;
        const symptomId = edge.from;
        return outsideIds.some((capId) => {
          const toCap = directedPathPolarity(rMeta, quickFixId, capId);
          const toSymp = directedPathPolarity(rMeta, capId, symptomId);
          return toCap === -1 && toSymp === -1;
        });
      });
      if (!erodesExternal) continue;

      const hasDirectFundB = balancingMetas.some(
        (otherB) =>
          otherB.loop.id !== bMeta.loop.id &&
          setIntersect(otherB.nodeSet, new Set(outsideIds)).length > 0 &&
          setIntersect(otherB.nodeSet, bMeta.nodeSet).length > 0
      );
      if (hasDirectFundB) continue;

      shiftingClaimedRIds.add(rMeta.loop.id);
      const ids = Array.from(new Set([...bMeta.nodeSet, ...rMeta.nodeSet]));
      const names = factorNamesFor(ids, nodeMap, [bMeta, rMeta]);
      pushUnique(
        createArchetypeResult({
          id: `arch_shifting_partial_b_${bMeta.loop.code}_${rMeta.loop.code}`,
          archetypeKey: "shifting_the_burden",
          status: "partial",
          presentLoops: [bMeta.loop.code, rMeta.loop.code],
          missingLoopKey: "shiftingFundamentalB",
          involvedFactorIds: ids,
          involvedFactorNames: names,
          looksLikeOverride: `Quick fix (${bMeta.loop.code}) relieves the symptom while side-effect loop (${rMeta.loop.code}) erodes ${factorNamesFor(outsideIds, nodeMap, [rMeta]).join(", ")}, with no direct loop restoring root capability.`,
          extra: {
            symptomaticLoop: bMeta.loop.code,
            sideEffectLoop: rMeta.loop.code,
            sharedFactorIds: shared
          }
        })
      );
    }
  }

  // 2. Fixes that Fail: fast B + delayed R sharing a directed [problem -> fix] edge
  for (const bMeta of balancingMetas) {
    if (bMeta.loop.hasDelay) continue;
    let matchedFixRebound = false;

    for (const rMeta of reinforcingMetas) {
      if (shiftingClaimedRIds.has(rMeta.loop.id)) continue;
      if (rMeta.loop.length <= bMeta.loop.length) continue;

      const sharedEdge = bMeta.edges.find((e) => rMeta.edgeKeys.has(`${e.from}->${e.to}`));
      if (!sharedEdge) continue;

      matchedFixRebound = true;
      const ids = Array.from(new Set([...bMeta.nodeSet, ...rMeta.nodeSet]));
      const names = factorNamesFor(ids, nodeMap, [bMeta, rMeta]);
      if (rMeta.loop.hasDelay) {
        pushUnique(
          createArchetypeResult({
            id: `arch_fixes_that_fail_${bMeta.loop.code}_${rMeta.loop.code}`,
            archetypeKey: "fixes_that_fail",
            status: "complete",
            presentLoops: [bMeta.loop.code, rMeta.loop.code],
            involvedFactorIds: ids,
            involvedFactorNames: names,
            looksLikeOverride: `Quick fix (${bMeta.loop.code}) suppresses ${bMeta.label(sharedEdge.from)}, while delayed unintended rebound (${rMeta.loop.code}) reinforces it later.`,
            extra: { balancingLoop: bMeta.loop.code, reinforcingLoop: rMeta.loop.code }
          })
        );
      } else {
        pushUnique(
          createArchetypeResult({
            id: `arch_fixes_that_fail_partial_delay_${bMeta.loop.code}_${rMeta.loop.code}`,
            archetypeKey: "fixes_that_fail",
            status: "partial",
            presentLoops: [bMeta.loop.code, rMeta.loop.code],
            missingLoopKey: "fixesReboundDelay",
            involvedFactorIds: ids,
            involvedFactorNames: names,
            looksLikeOverride: `Fast fix (${bMeta.loop.code}) and unintended consequence loop (${rMeta.loop.code}) act together without a time delay separating short-term relief from rebound.`,
            extra: { balancingLoop: bMeta.loop.code, reinforcingLoop: rMeta.loop.code }
          })
        );
      }
    }

    if (!matchedFixRebound) {
      const openDelayedChildren = safeNodes.filter(
        (n) =>
          !allLoopNodeIds.has(n.id) &&
          hasDelayFormula(n) &&
          getTargetInfluencers(n).some((infId) => bMeta.nodeSet.has(infId))
      );
      if (openDelayedChildren.length > 0) {
        const ids = [...bMeta.nodeIds, ...openDelayedChildren.map((n) => n.id)];
        const names = factorNamesFor(ids, nodeMap, [bMeta]);
        pushUnique(
          createArchetypeResult({
            id: `arch_fixes_that_fail_partial_r_${bMeta.loop.code}`,
            archetypeKey: "fixes_that_fail",
            status: "partial",
            presentLoops: [bMeta.loop.code],
            missingLoopKey: "fixesReboundR",
            involvedFactorIds: ids,
            involvedFactorNames: names,
            looksLikeOverride: `Fast fix (${bMeta.loop.code}) feeds delayed side-effect stock (${openDelayedChildren.map((n) => n.name || n.symbol).join(", ")}) that does not yet loop back to the problem.`,
            extra: { balancingLoop: bMeta.loop.code }
          })
        );
      }
    }
  }

  // 3. Eroding Goals: two B loops sharing discrepancy node with OPPOSITE incoming polarities
  const erodingGoalsSharedIds = new Set();
  for (let i = 0; i < balancingMetas.length; i++) {
    for (let j = i + 1; j < balancingMetas.length; j++) {
      const mA = balancingMetas[i];
      const mB = balancingMetas[j];
      const shared = setIntersect(mA.nodeSet, mB.nodeSet);
      if (shared.length === 0) continue;

      const gapId = shared.find((sid) => {
        const inA = mA.incomingByTarget.get(sid) || [];
        const inB = mB.incomingByTarget.get(sid) || [];
        return inA.length > 0 && inB.length > 0 && inA[0] !== inB[0];
      });
      if (!gapId) continue;

      const onlyA = setDiff(mA.nodeSet, mB.nodeSet);
      const onlyB = setDiff(mB.nodeSet, mA.nodeSet);
      if (onlyA.length === 0 || onlyB.length === 0) continue;

      // Classify as Eroding Goals when at least one side has delay or unequal loop depth
      // (pure symmetric un-delayed tug-of-war falls under partial Policy Resistance below).
      const hasAsymmetry = mA.loop.hasDelay || mB.loop.hasDelay || mA.loop.length !== mB.loop.length;
      if (!hasAsymmetry) continue;

      const bAction = mA.loop.length >= mB.loop.length ? mA : mB;
      const bGoal = bAction === mA ? mB : mA;
      erodingGoalsSharedIds.add(gapId);
      erodingBalancingPairs.add(pairKey(bAction.loop.id, bGoal.loop.id));
      const ids = Array.from(new Set([...bAction.nodeSet, ...bGoal.nodeSet]));
      const names = factorNamesFor(ids, nodeMap, [bAction, bGoal]);
      pushUnique(
        createArchetypeResult({
          id: `arch_eroding_goals_${bAction.loop.code}_${bGoal.loop.code}`,
          archetypeKey: "eroding_goals",
          status: "complete",
          presentLoops: [bAction.loop.code, bGoal.loop.code],
          involvedFactorIds: ids,
          involvedFactorNames: names,
          looksLikeOverride: `Operational repair (${bAction.loop.code}) and target revision (${bGoal.loop.code}) pull gap factor ${bAction.label(gapId)} from opposite directions.`,
          extra: {
            correctiveLoop: bAction.loop.code,
            goalErosionLoop: bGoal.loop.code,
            gapFactorId: gapId
          }
        })
      );
    }
  }

  for (const bMeta of balancingMetas) {
    if (bMeta.loop.length !== 2) continue;
    for (const sid of bMeta.nodeIds) {
      if (erodingGoalsSharedIds.has(sid)) continue;
      const gapNode = nodeMap.get(sid);
      const goalId = bMeta.nodeIds.find((id) => id !== sid);
      const goalNode = nodeMap.get(goalId);
      if (!gapNode || !goalNode || !hasDelayFormula(goalNode)) continue;

      const externalInfluencers = getTargetInfluencers(gapNode).filter(
        (infId) => !bMeta.nodeSet.has(infId) && !balancingMetas.some((other) => other.nodeSet.has(infId) && other.nodeSet.has(sid))
      );
      const opposingExt = externalInfluencers.find((extId) => {
        const extNode = nodeMap.get(extId);
        if (!extNode) return false;
        const extSign = determineEdgePolarity(extNode, gapNode);
        const goalInSign = (bMeta.incomingByTarget.get(sid) || [])[0] || 1;
        return extSign !== goalInSign;
      });
      if (opposingExt) {
        const ids = [sid, goalId, opposingExt];
        const names = factorNamesFor(ids, nodeMap, [bMeta]);
        pushUnique(
          createArchetypeResult({
            id: `arch_eroding_goals_partial_${bMeta.loop.code}`,
            archetypeKey: "eroding_goals",
            status: "partial",
            presentLoops: [bMeta.loop.code],
            missingLoopKey: "erodingCorrectiveB",
            involvedFactorIds: ids,
            involvedFactorNames: names,
            looksLikeOverride: `Target-lowering loop (${bMeta.loop.code}) closes the shortfall by adjusting ${bMeta.label(goalId)}, while ${bMeta.label(opposingExt)} has no closed corrective action loop.`,
            extra: { goalErosionLoop: bMeta.loop.code, gapFactorId: sid }
          })
        );
      }
    }
  }

  // 4. Success to the Successful: zero-sum allocation between two reinforcing loops
  for (let i = 0; i < reinforcingMetas.length; i++) {
    for (let j = i + 1; j < reinforcingMetas.length; j++) {
      const rA = reinforcingMetas[i];
      const rB = reinforcingMetas[j];
      const shared = setIntersect(rA.nodeSet, rB.nodeSet);

      if (shared.length > 0) {
        const opposingSplit = shared.some((sid) => oppositeSignAtSharedNode(rA, rB, sid));
        if (opposingSplit) {
          const ids = Array.from(new Set([...rA.nodeSet, ...rB.nodeSet]));
          const names = factorNamesFor(ids, nodeMap, [rA, rB]);
          pushUnique(
            createArchetypeResult({
              id: `arch_success_successful_${rA.loop.code}_${rB.loop.code}`,
              archetypeKey: "success_to_successful",
              status: "complete",
              presentLoops: [rA.loop.code, rB.loop.code],
              involvedFactorIds: ids,
              involvedFactorNames: names,
              looksLikeOverride: `Reinforcing loops (${rA.loop.code}, ${rB.loop.code}) compete asymmetrically through shared allocation factor ${factorNamesFor(shared, nodeMap, [rA]).join(", ")}.`,
              extra: { winnerLoop: rA.loop.code, competingLoop: rB.loop.code, sharedFactorIds: shared }
            })
          );
        }
      } else {
        const bridgeR = reinforcingMetas.find(
          (rC) =>
            rC.loop.id !== rA.loop.id &&
            rC.loop.id !== rB.loop.id &&
            setIntersect(rC.nodeSet, rA.nodeSet).length > 0 &&
            setIntersect(rC.nodeSet, rB.nodeSet).length > 0 &&
            rC.edges.filter((e) => e.polarity === -1).length >= 2
        );
        if (bridgeR) {
          const ids = Array.from(new Set([...rA.nodeSet, ...rB.nodeSet, ...bridgeR.nodeSet]));
          const names = factorNamesFor(ids, nodeMap, [rA, rB, bridgeR]);
          pushUnique(
            createArchetypeResult({
              id: `arch_success_successful_${rA.loop.code}_${rB.loop.code}_${bridgeR.loop.code}`,
              archetypeKey: "success_to_successful",
              status: "complete",
              presentLoops: [rA.loop.code, rB.loop.code, bridgeR.loop.code],
              involvedFactorIds: ids,
              involvedFactorNames: names,
              looksLikeOverride: `Growth loops (${rA.loop.code}, ${rB.loop.code}) mutually inhibit each other via ${bridgeR.loop.code}.`,
              extra: { winnerLoop: rA.loop.code, competingLoop: rB.loop.code, bridgeLoop: bridgeR.loop.code }
            })
          );
        }
      }
    }
  }

  for (const rA of reinforcingMetas) {
    for (const rBridge of reinforcingMetas) {
      if (rBridge.loop.id === rA.loop.id || rBridge.loop.length <= rA.loop.length) continue;
      if (rBridge.edges.filter((e) => e.polarity === -1).length < 2) continue;
      const outside = setDiff(rBridge.nodeSet, rA.nodeSet);
      if (outside.length < 2 || setIntersect(rA.nodeSet, rBridge.nodeSet).length === 0) continue;

      const outsideSet = new Set(outside);
      const hasSecondLoop = reinforcingMetas.some(
        (otherR) =>
          otherR.loop.id !== rA.loop.id &&
          otherR.loop.id !== rBridge.loop.id &&
          setIntersect(otherR.nodeSet, outsideSet).length > 0
      );
      if (hasSecondLoop) continue;

      const ids = Array.from(new Set([...rA.nodeSet, ...rBridge.nodeSet]));
      const names = factorNamesFor(ids, nodeMap, [rA, rBridge]);
      pushUnique(
        createArchetypeResult({
          id: `arch_success_successful_partial_${rA.loop.code}_${rBridge.loop.code}`,
          archetypeKey: "success_to_successful",
          status: "partial",
          presentLoops: [rA.loop.code, rBridge.loop.code],
          missingLoopKey: "successCompetingR",
          involvedFactorIds: ids,
          involvedFactorNames: names,
          looksLikeOverride: `Reinforcing loop (${rA.loop.code}) diverts resources across ${rBridge.loop.code}, while ${factorNamesFor(outside, nodeMap, [rBridge]).join(", ")} lacks its own closed reinforcing loop.`,
          extra: { winnerLoop: rA.loop.code, bridgeLoop: rBridge.loop.code }
        })
      );
    }
  }

  // 5. Tragedy of the Commons: disjoint R1, R2 + coupled B1, B2 sharing non-R commons factors
  for (let i = 0; i < reinforcingMetas.length; i++) {
    for (let j = i + 1; j < reinforcingMetas.length; j++) {
      const rA = reinforcingMetas[i];
      const rB = reinforcingMetas[j];
      if (setIntersect(rA.nodeSet, rB.nodeSet).length > 0) continue;

      const bListA = balancingMetas.filter(
        (b) => setIntersect(b.nodeSet, rA.nodeSet).length > 0 && setIntersect(b.nodeSet, rB.nodeSet).length === 0
      );
      const bListB = balancingMetas.filter(
        (b) => setIntersect(b.nodeSet, rB.nodeSet).length > 0 && setIntersect(b.nodeSet, rA.nodeSet).length === 0
      );

      let matchedCompleteTragedy = false;
      for (const bA of bListA) {
        for (const bB of bListB) {
          const commons = setIntersect(bA.nodeSet, bB.nodeSet).filter(
            (id) => !rA.nodeSet.has(id) && !rB.nodeSet.has(id)
          );
          if (commons.length === 0) continue;
          matchedCompleteTragedy = true;
          const ids = Array.from(new Set([...rA.nodeSet, ...rB.nodeSet, ...bA.nodeSet, ...bB.nodeSet]));
          const names = factorNamesFor(ids, nodeMap, [rA, rB, bA, bB]);
          pushUnique(
            createArchetypeResult({
              id: `arch_tragedy_${rA.loop.code}_${rB.loop.code}_${bA.loop.code}_${bB.loop.code}`,
              archetypeKey: "tragedy_of_the_commons",
              status: "complete",
              presentLoops: [rA.loop.code, rB.loop.code, bA.loop.code, bB.loop.code],
              involvedFactorIds: ids,
              involvedFactorNames: names,
              looksLikeOverride: `Separate growth loops (${rA.loop.code}, ${rB.loop.code}) both draw on shared commons ${factorNamesFor(commons, nodeMap, [bA]).join(", ")}, driving joint limits (${bA.loop.code}, ${bB.loop.code}).`,
              extra: { actorLoops: [rA.loop.code, rB.loop.code], limitLoops: [bA.loop.code, bB.loop.code], commonsFactorIds: commons }
            })
          );
        }
      }

      if (!matchedCompleteTragedy && bListA.length > 0 && bListB.length === 0) {
        for (const bA of bListA) {
          const bOnly = setDiff(bA.nodeSet, rA.nodeSet);
          const sharedCommonsNode = bOnly.find((cid) => {
            const cNode = nodeMap.get(cid);
            return getTargetInfluencers(cNode).some((infId) => rB.nodeSet.has(infId));
          });
          if (sharedCommonsNode) {
            const ids = Array.from(new Set([...rA.nodeSet, ...rB.nodeSet, ...bA.nodeSet]));
            const names = factorNamesFor(ids, nodeMap, [rA, rB, bA]);
            pushUnique(
              createArchetypeResult({
                id: `arch_tragedy_partial_b_${rA.loop.code}_${rB.loop.code}_${bA.loop.code}`,
                archetypeKey: "tragedy_of_the_commons",
                status: "partial",
                presentLoops: [rA.loop.code, rB.loop.code, bA.loop.code],
                missingLoopKey: "tragedyCommonsB",
                involvedFactorIds: ids,
                involvedFactorNames: names,
                looksLikeOverride: `Both actors (${rA.loop.code}, ${rB.loop.code}) feed ${bA.label(sharedCommonsNode)}, yet only ${rA.loop.code} receives the balancing commons constraint (${bA.loop.code}).`,
                extra: { actorLoops: [rA.loop.code, rB.loop.code], limitLoops: [bA.loop.code] }
              })
            );
          }
        }
      }
    }
  }

  for (let i = 0; i < balancingMetas.length; i++) {
    for (let j = i + 1; j < balancingMetas.length; j++) {
      const bA = balancingMetas[i];
      const bB = balancingMetas[j];
      const sharedCommons = setIntersect(bA.nodeSet, bB.nodeSet);
      if (sharedCommons.length === 0 || shiftingBalancingPairs.has(pairKey(bA.loop.id, bB.loop.id))) continue;

      const rOnlyA = reinforcingMetas.find(
        (r) => setIntersect(r.nodeSet, bA.nodeSet).length > 0 && setIntersect(r.nodeSet, bB.nodeSet).length === 0
      );
      const rOnlyB = reinforcingMetas.find(
        (r) => setIntersect(r.nodeSet, bB.nodeSet).length > 0 && setIntersect(r.nodeSet, bA.nodeSet).length === 0
      );
      if (Boolean(rOnlyA) === Boolean(rOnlyB)) continue;

      const presentR = rOnlyA || rOnlyB;
      const onlyBranchesDistinct =
        setDiff(bA.nodeSet, bB.nodeSet).length > 0 && setDiff(bB.nodeSet, bA.nodeSet).length > 0;
      const sameIntoCommons = sharedCommons.some((cid) => sameSignAtSharedNode(bA, bB, cid));
      if (!onlyBranchesDistinct || !sameIntoCommons) continue;

      const ids = Array.from(new Set([...bA.nodeSet, ...bB.nodeSet, ...presentR.nodeSet]));
      const names = factorNamesFor(ids, nodeMap, [bA, bB, presentR]);
      pushUnique(
        createArchetypeResult({
          id: `arch_tragedy_partial_r_${presentR.loop.code}_${bA.loop.code}_${bB.loop.code}`,
          archetypeKey: "tragedy_of_the_commons",
          status: "partial",
          presentLoops: [presentR.loop.code, bA.loop.code, bB.loop.code],
          missingLoopKey: "tragedySecondActorR",
          involvedFactorIds: ids,
          involvedFactorNames: names,
          looksLikeOverride: `Two balancing resource limits (${bA.loop.code}, ${bB.loop.code}) share ${factorNamesFor(sharedCommons, nodeMap, [bA]).join(", ")}, while only one user has an active growth loop (${presentR.loop.code}).`,
          extra: { actorLoops: [presentR.loop.code], limitLoops: [bA.loop.code, bB.loop.code] }
        })
      );
    }
  }

  // 6. Escalation: two disjoint balancing actor loops coupled by figure-8 reinforcing loop
  const escalationMatchedRIds = new Set();
  for (let i = 0; i < balancingMetas.length; i++) {
    for (let j = i + 1; j < balancingMetas.length; j++) {
      const bA = balancingMetas[i];
      const bB = balancingMetas[j];
      if (setIntersect(bA.nodeSet, bB.nodeSet).length > 0) continue;

      const fig8R = reinforcingMetas.find(
        (r) =>
          setIntersect(r.nodeSet, bA.nodeSet).length > 0 &&
          setIntersect(r.nodeSet, bB.nodeSet).length > 0 &&
          r.edges.filter((e) => e.polarity === -1).length === 0
      );
      if (!fig8R) continue;

      escalationMatchedRIds.add(fig8R.loop.id);
      const ids = Array.from(new Set([...bA.nodeSet, ...bB.nodeSet, ...fig8R.nodeSet]));
      const names = factorNamesFor(ids, nodeMap, [bA, bB, fig8R]);
      pushUnique(
        createArchetypeResult({
          id: `arch_escalation_${bA.loop.code}_${bB.loop.code}_${fig8R.loop.code}`,
          archetypeKey: "escalation",
          status: "complete",
          presentLoops: [bA.loop.code, bB.loop.code, fig8R.loop.code],
          involvedFactorIds: ids,
          involvedFactorNames: names,
          looksLikeOverride: `Two independent balancing responses (${bA.loop.code}, ${bB.loop.code}) drive each other upward in figure-eight arms race (${fig8R.loop.code}).`,
          extra: { balancingLoops: [bA.loop.code, bB.loop.code], escalationLoop: fig8R.loop.code }
        })
      );
    }
  }

  for (const bMeta of balancingMetas) {
    for (const rMeta of reinforcingMetas) {
      if (escalationMatchedRIds.has(rMeta.loop.id) || shiftingClaimedRIds.has(rMeta.loop.id)) continue;
      const shared = setIntersect(bMeta.nodeSet, rMeta.nodeSet);
      const external = setDiff(rMeta.nodeSet, bMeta.nodeSet);
      if (shared.length < 2 || external.length < 2) continue;
      if (rMeta.edges.filter((e) => e.polarity === -1).length > 0) continue;

      const externalSet = new Set(external);
      const hasSecondActorB = balancingMetas.some(
        (otherB) => otherB.loop.id !== bMeta.loop.id && setIntersect(otherB.nodeSet, externalSet).length > 0
      );
      if (hasSecondActorB) continue;

      const ids = Array.from(new Set([...bMeta.nodeSet, ...rMeta.nodeSet]));
      const names = factorNamesFor(ids, nodeMap, [bMeta, rMeta]);
      pushUnique(
        createArchetypeResult({
          id: `arch_escalation_partial_${bMeta.loop.code}_${rMeta.loop.code}`,
          archetypeKey: "escalation",
          status: "partial",
          presentLoops: [bMeta.loop.code, rMeta.loop.code],
          missingLoopKey: "escalationCompetitorB",
          involvedFactorIds: ids,
          involvedFactorNames: names,
          looksLikeOverride: `Party response (${bMeta.loop.code}) forms cross-escalation loop (${rMeta.loop.code}) through ${factorNamesFor(external, nodeMap, [rMeta]).join(", ")}, without the counterparty's own balancing loop.`,
          extra: { balancingLoop: bMeta.loop.code, escalationLoop: rMeta.loop.code }
        })
      );
    }
  }

  // 7. Growth and Underinvestment: R + B_limit + delayed B_invest on B_limit's bottleneck
  const completeGrowthInvestPairs = new Set();
  for (const rMeta of reinforcingMetas) {
    const limitBs = balancingMetas.filter((b) => setIntersect(b.nodeSet, rMeta.nodeSet).length > 0);
    for (const bLimit of limitBs) {
      const limitOnly = new Set(setDiff(bLimit.nodeSet, rMeta.nodeSet));
      if (limitOnly.size === 0) continue;

      const investB = balancingMetas.find(
        (bInv) =>
          bInv.loop.id !== bLimit.loop.id &&
          bInv.loop.hasDelay &&
          setIntersect(bInv.nodeSet, limitOnly).length > 0 &&
          setIntersect(bInv.nodeSet, rMeta.nodeSet).length === 0
      );

      if (investB) {
        completeGrowthInvestPairs.add(pairKey(bLimit.loop.id, investB.loop.id));
        const ids = Array.from(new Set([...rMeta.nodeSet, ...bLimit.nodeSet, ...investB.nodeSet]));
        const names = factorNamesFor(ids, nodeMap, [rMeta, bLimit, investB]);
        pushUnique(
          createArchetypeResult({
            id: `arch_growth_underinvest_${rMeta.loop.code}_${bLimit.loop.code}_${investB.loop.code}`,
            archetypeKey: "growth_and_underinvestment",
            status: "complete",
            presentLoops: [rMeta.loop.code, bLimit.loop.code, investB.loop.code],
            involvedFactorIds: ids,
            involvedFactorNames: names,
            looksLikeOverride: `Growth (${rMeta.loop.code}) hits bottleneck (${bLimit.loop.code}), governed by delayed capacity investment (${investB.loop.code}).`,
            extra: { growthLoop: rMeta.loop.code, limitLoop: bLimit.loop.code, investLoop: investB.loop.code }
          })
        );
      } else {
        const limitErosion = archetypes.find(
          (a) =>
            a.archetype === "eroding_goals" &&
            !a.isPartial &&
            Array.isArray(a.involvedFactorIds) &&
            a.involvedFactorIds.some((fid) => limitOnly.has(fid))
        );
        const unclosedCapacityInput = Array.from(limitOnly).some((fid) => {
          const node = nodeMap.get(fid);
          if (!node || !hasDelayFormula(node)) return false;
          return getTargetInfluencers(node).some((infId) => {
            const infNode = nodeMap.get(infId);
            return infNode && !allLoopNodeIds.has(infId) && classifyFactorType(infNode).type === "constant";
          });
        });

        if (limitErosion || unclosedCapacityInput) {
          const ids = Array.from(new Set([...rMeta.nodeSet, ...bLimit.nodeSet]));
          const names = factorNamesFor(ids, nodeMap, [rMeta, bLimit]);
          pushUnique(
            createArchetypeResult({
              id: `arch_growth_underinvest_partial_b_${rMeta.loop.code}_${bLimit.loop.code}`,
              archetypeKey: "growth_and_underinvestment",
              status: "partial",
              presentLoops: [rMeta.loop.code, bLimit.loop.code],
              missingLoopKey: "growthCapacityInvestB",
              involvedFactorIds: ids,
              involvedFactorNames: names,
              looksLikeOverride: `Growth (${rMeta.loop.code}) encounters bottleneck (${bLimit.loop.code}) without a delayed balancing loop expanding capacity.`,
              extra: { growthLoop: rMeta.loop.code, limitLoop: bLimit.loop.code }
            })
          );
        }
      }
    }
  }

  for (let i = 0; i < balancingMetas.length; i++) {
    for (let j = i + 1; j < balancingMetas.length; j++) {
      const mA = balancingMetas[i];
      const mB = balancingMetas[j];
      if (completeGrowthInvestPairs.has(pairKey(mA.loop.id, mB.loop.id))) continue;
      if (mA.loop.hasDelay === mB.loop.hasDelay) continue;
      if (setIntersect(mA.nodeSet, mB.nodeSet).length === 0) continue;

      const bLimit = mA.loop.hasDelay ? mB : mA;
      const bInvest = mA.loop.hasDelay ? mA : mB;
      if (
        archetypes.some(
          (a) =>
            (a.archetype === "shifting_the_burden" || a.archetype === "eroding_goals") &&
            a.presentLoops.includes(bLimit.loop.code) &&
            a.presentLoops.includes(bInvest.loop.code)
        )
      ) {
        continue;
      }

      const sharesWithAnyR = reinforcingMetas.some((r) => setIntersect(r.nodeSet, bLimit.nodeSet).length > 0);
      if (sharesWithAnyR) continue;

      const sameDir = setIntersect(bLimit.nodeSet, bInvest.nodeSet).some((sid) => sameSignAtSharedNode(bLimit, bInvest, sid));
      if (!sameDir) continue;

      const ids = Array.from(new Set([...bLimit.nodeSet, ...bInvest.nodeSet]));
      const names = factorNamesFor(ids, nodeMap, [bLimit, bInvest]);
      pushUnique(
        createArchetypeResult({
          id: `arch_growth_underinvest_partial_r_${bLimit.loop.code}_${bInvest.loop.code}`,
          archetypeKey: "growth_and_underinvestment",
          status: "partial",
          presentLoops: [bLimit.loop.code, bInvest.loop.code],
          missingLoopKey: "growthDemandEngineR",
          involvedFactorIds: ids,
          involvedFactorNames: names,
          looksLikeOverride: `Capacity constraint (${bLimit.loop.code}) and delayed capacity expansion (${bInvest.loop.code}) exist without the reinforcing demand engine.`,
          extra: { limitLoop: bLimit.loop.code, investLoop: bInvest.loop.code }
        })
      );
    }
  }

  // 8. Attractiveness Principle: single R bounded by >= 2 distinct independent B constraints
  for (const rMeta of reinforcingMetas) {
    const boundingBs = balancingMetas.filter((b) => setIntersect(b.nodeSet, rMeta.nodeSet).length > 0);
    const hasShiftingOrTragedyOnR = archetypes.some(
      (a) =>
        !a.isPartial &&
        (a.archetype === "shifting_the_burden" || a.archetype === "tragedy_of_the_commons") &&
        a.presentLoops.includes(rMeta.loop.code)
    );
    if (!hasShiftingOrTragedyOnR && boundingBs.length >= 2) {
      const distinctPair = boundingBs.some((b1, idx) =>
        boundingBs.slice(idx + 1).some((b2) => {
          const b1Extra = setDiff(b1.nodeSet, new Set([...rMeta.nodeSet, ...b2.nodeSet]));
          const b2Extra = setDiff(b2.nodeSet, new Set([...rMeta.nodeSet, ...b1.nodeSet]));
          return b1Extra.length > 0 && b2Extra.length > 0;
        })
      );
      if (distinctPair) {
        const bCodes = boundingBs.map((b) => b.loop.code);
        const ids = Array.from(new Set([...rMeta.nodeSet, ...boundingBs.flatMap((b) => b.nodeIds)]));
        const names = factorNamesFor(ids, nodeMap, [rMeta, ...boundingBs]);
        pushUnique(
          createArchetypeResult({
            id: `arch_attractiveness_${rMeta.loop.code}_${bCodes.join("_")}`,
            archetypeKey: "attractiveness_principle",
            status: "complete",
            presentLoops: [rMeta.loop.code, ...bCodes],
            involvedFactorIds: ids,
            involvedFactorNames: names,
            looksLikeOverride: `Growth loop (${rMeta.loop.code}) encounters multiple separate balancing limits (${bCodes.join(", ")}) simultaneously.`,
            extra: { reinforcingLoop: rMeta.loop.code, boundingBalancingLoops: bCodes }
          })
        );
      }
    } else if (boundingBs.length === 1) {
      const b1 = boundingBs[0];
      const openLimitNode = safeNodes.find(
        (n) =>
          (n.dimensionKind === "limit" || n.isGuardrail) &&
          !allLoopNodeIds.has(n.id) &&
          (getTargetInfluencers(n).some((infId) => rMeta.nodeSet.has(infId)) ||
            Array.from(rMeta.nodeSet).some((rid) => getTargetInfluencers(nodeMap.get(rid)).includes(n.id)))
      );
      if (openLimitNode) {
        const ids = Array.from(new Set([...rMeta.nodeSet, ...b1.nodeSet, openLimitNode.id]));
        const names = factorNamesFor(ids, nodeMap, [rMeta, b1]);
        pushUnique(
          createArchetypeResult({
            id: `arch_attractiveness_partial_${rMeta.loop.code}_${b1.loop.code}`,
            archetypeKey: "attractiveness_principle",
            status: "partial",
            presentLoops: [rMeta.loop.code, b1.loop.code],
            missingLoopKey: "attractivenessSecondLimitB",
            involvedFactorIds: ids,
            involvedFactorNames: names,
            looksLikeOverride: `Growth loop (${rMeta.loop.code}) is bounded by ${b1.loop.code} while second limit factor (${openLimitNode.name || openLimitNode.symbol}) is not yet closed into its own balancing loop.`,
            extra: { reinforcingLoop: rMeta.loop.code, boundingBalancingLoops: [b1.loop.code] }
          })
        );
      }
    }
  }

  // 9. Limits to Growth: Reinforcing engine paired with Balancing constraint (or partial when unbounded)
  for (const rMeta of reinforcingMetas) {
    const matchingBs = balancingMetas.filter((b) => setIntersect(b.nodeSet, rMeta.nodeSet).length > 0);
    if (matchingBs.length > 0) {
      const primaryB = matchingBs[0];
      const shared = setIntersect(rMeta.nodeSet, primaryB.nodeSet);
      const ids = Array.from(new Set([...rMeta.nodeSet, ...primaryB.nodeSet]));
      const names = factorNamesFor(ids, nodeMap, [rMeta, primaryB]);
      pushUnique(
        createArchetypeResult({
          id: `arch_limits_${rMeta.loop.code}_${primaryB.loop.code}`,
          archetypeKey: "limits_to_growth",
          status: "complete",
          presentLoops: [rMeta.loop.code, ...matchingBs.map((b) => b.loop.code)],
          involvedFactorIds: ids,
          involvedFactorNames: names,
          descriptionOverride:
            "A virtuous reinforcing growth engine eventually encounters a balancing constraint, causing growth to stall or reverse.",
          extra: {
            reinforcingLoop: rMeta.loop.code,
            balancingLoop: primaryB.loop.code,
            boundingBalancingLoops: matchingBs.map((b) => b.loop.code),
            sharedFactorIds: shared
          }
        })
      );
    } else if (!shiftingClaimedRIds.has(rMeta.loop.id) && !escalationMatchedRIds.has(rMeta.loop.id)) {
      const names = factorNamesFor(rMeta.nodeIds, nodeMap, [rMeta]);
      pushUnique(
        createArchetypeResult({
          id: `arch_limits_partial_${rMeta.loop.code}`,
          archetypeKey: "limits_to_growth",
          status: "partial",
          presentLoops: [rMeta.loop.code],
          missingLoopKey: "limitsBoundingB",
          involvedFactorIds: [...rMeta.nodeIds],
          involvedFactorNames: names,
          looksLikeOverride: `Reinforcing growth loop (${rMeta.loop.code}: ${names.join(", ")}) grows unchecked with no balancing constraint loop slowing it.`,
          extra: {
            reinforcingLoop: rMeta.loop.code,
            balancingLoop: null,
            boundingBalancingLoops: [],
            sharedFactorIds: []
          }
        })
      );
    }
  }

  // 10. Policy Resistance & Delayed Oscillation: Balancing feedback containing a delay,
  // or fast opposing balancing loops lacking the delay that induces overshoot.
  const delayedBalancing = balancingMetas.filter((b) => b.loop.hasDelay);
  if (delayedBalancing.length > 0) {
    const primary = delayedBalancing[0];
    const names = factorNamesFor(primary.nodeIds, nodeMap, [primary]);
    pushUnique(
      createArchetypeResult({
        id: `arch_policy_resistance_${primary.loop.code}`,
        archetypeKey: "policy_resistance",
        status: "complete",
        presentLoops: delayedBalancing.map((b) => b.loop.code),
        involvedFactorIds: [...primary.nodeIds],
        involvedFactorNames: names,
        descriptionOverride:
          "Delays in balancing feedback cause decision-makers to over-correct, inducing cyclic overshoot and systemic resistance.",
        extra: {
          balancingLoop: primary.loop.code
        }
      })
    );
  } else {
    for (let i = 0; i < balancingMetas.length; i++) {
      for (let j = i + 1; j < balancingMetas.length; j++) {
        const bA = balancingMetas[i];
        const bB = balancingMetas[j];
        const key = pairKey(bA.loop.id, bB.loop.id);
        if (shiftingBalancingPairs.has(key) || erodingBalancingPairs.has(key)) continue;
        const shared = setIntersect(bA.nodeSet, bB.nodeSet);
        if (shared.length === 0) continue;
        const opposes = shared.some((sid) => oppositeSignAtSharedNode(bA, bB, sid));
        if (!opposes) continue;
        const ids = Array.from(new Set([...bA.nodeSet, ...bB.nodeSet]));
        const names = factorNamesFor(ids, nodeMap, [bA, bB]);
        pushUnique(
          createArchetypeResult({
            id: `arch_policy_resistance_partial_${bA.loop.code}_${bB.loop.code}`,
            archetypeKey: "policy_resistance",
            status: "partial",
            presentLoops: [bA.loop.code, bB.loop.code],
            missingLoopKey: "policyResistanceDelay",
            involvedFactorIds: ids,
            involvedFactorNames: names,
            looksLikeOverride: `Opposing balancing loops (${bA.loop.code}, ${bB.loop.code}) pull ${factorNamesFor(shared, nodeMap, [bA]).join(", ")} in opposite directions without modeling the response delay.`,
            extra: { balancingLoop: bA.loop.code }
          })
        );
      }
    }
  }

  return archetypes;
}

/**
 * Donella Meadows' 12 Leverage Points in Increasing Order of Effectiveness.
 */
export const MEADOWS_LEVERAGE_HIERARCHY = [
  { level: 12, name: "Constants, parameters, and numbers", power: "low", example: "Subsidies, tax rates, standard spending" },
  { level: 11, name: "Buffer and stock sizes relative to flows", power: "low", example: "Inventory reserves, surge capacity" },
  { level: 10, name: "Stock and flow structures", power: "medium", example: "Physical networks, operational supply chains" },
  { level: 9, name: "Delays relative to rate of change", power: "medium", example: "Information cycle frequency, reporting lag" },
  { level: 8, name: "Balancing feedback loop strength", power: "medium", example: "Quality control, guardrails, automated dampening" },
  { level: 7, name: "Reinforcing feedback loop gain", power: "high", example: "Donor viral growth, word of mouth, compounding gains" },
  { level: 6, name: "Information flows", power: "high", example: "Transparent performance visibility, open scorecards" },
  { level: 5, name: "Rules of the system", power: "high", example: "Governance charters, bylaws, procurement criteria" },
  { level: 4, name: "Self-organization ability", power: "very_high", example: "Decentralized task distribution, community teams" },
  { level: 3, name: "Goals of the system", power: "very_high", example: "Shifting from volume to societal net impact" },
  { level: 2, name: "Mindset or paradigm", power: "transformative", example: "Holistic systems thinking vs siloed budgeting" },
  { level: 1, name: "Transcending paradigms", power: "transformative", example: "Fluid adaptability and systemic enlightenment" }
];
