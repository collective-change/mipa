import { create, all } from "mathjs";

/**
 * System Dynamics Methodology & Systems Thinking Engine
 *
 * Implements classical System Dynamics principles (Jay Forrester, Donella Meadows):
 * - Stock & Flow factor classification
 * - Automated Feedback Loop detection (Reinforcing R vs Balancing B cycles)
 * - Numerical edge polarity inference via single-pass factor perturbation
 * - System Archetype identification (Limits to Growth, Policy Resistance, Shifting the Burden)
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

/**
 * Identifies common System Dynamics Archetypes from factors and detected loops.
 *
 * @param {Array} nodes - Factor nodes
 * @param {Array} loops - Detected feedback loops
 * @returns {Array} List of diagnosed archetypes with strategic recommendations
 */
export function detectSystemArchetypes(nodes = [], loops = []) {
  const archetypes = [];

  const reinforcingLoops = loops.filter((l) => l.type === "reinforcing");
  const balancingLoops = loops.filter((l) => l.type === "balancing");

  // 1. Limits to Growth: Reinforcing engine paired with a Balancing constraint
  if (reinforcingLoops.length > 0 && balancingLoops.length > 0) {
    for (const rLoop of reinforcingLoops) {
      for (const bLoop of balancingLoops) {
        const shared = rLoop.nodeIds.filter((id) => bLoop.nodeIds.includes(id));
        if (shared.length > 0) {
          archetypes.push({
            id: `arch_limits_${rLoop.code}_${bLoop.code}`,
            name: "Limits to Growth",
            archetype: "limits_to_growth",
            reinforcingLoop: rLoop.code,
            balancingLoop: bLoop.code,
            sharedFactorIds: shared,
            meadowsLevel: 6,
            description: "A virtuous reinforcing growth engine eventually encounters a balancing constraint, causing growth to stall or reverse.",
            recommendation: "Do not push harder on the growth engine; proactively remove or expand the balancing capacity limit before saturation."
          });
          break;
        }
      }
      if (archetypes.length >= 3) break;
    }
  }

  // 2. Policy Resistance / Delayed Balancing
  const delayedBalancing = balancingLoops.filter((l) => l.hasDelay);
  if (delayedBalancing.length > 0) {
    archetypes.push({
      id: `arch_policy_resistance_${delayedBalancing[0].code}`,
      name: "Policy Resistance & Delayed Oscillation",
      archetype: "policy_resistance",
      balancingLoop: delayedBalancing[0].code,
      meadowsLevel: 8,
      description: "Delays in balancing feedback cause decision-makers to over-correct, inducing cyclic overshoot and systemic resistance.",
      recommendation: "Shorten reporting delays, slow down rapid policy adjustments, and base decisions on system stock trends rather than transient noise."
    });
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
