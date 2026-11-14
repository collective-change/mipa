/**
 * System Dynamics Methodology & Systems Thinking Engine
 *
 * Implements classical System Dynamics principles (Jay Forrester, Donella Meadows):
 * - Stock & Flow factor classification
 * - Automated Feedback Loop detection (Reinforcing R vs Balancing B cycles)
 * - System Archetype identification (Limits to Growth, Policy Resistance, Shifting the Burden)
 * - Donella Meadows' 12 Leverage Points hierarchy mapping
 */

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
  const formula = String(node.formula || "").trim();

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
 * Evaluates the qualitative polarity (+1 or -1) of the causal dependency from source to target.
 *
 * @param {Object} sourceNode - Influencer node
 * @param {Object} targetNode - Influenced node
 * @returns {number} +1 (positive link / reinforcing), -1 (negative link / balancing)
 */
export function determineEdgePolarity(sourceNode = {}, targetNode = {}) {
  const formula = String(targetNode.formula || "");
  const sym = sourceNode.symbol || sourceNode.id || "";

  if (!formula || !sym) return 1;

  // Check for simple negative coefficient or subtraction: "- sym", "/ sym"
  const negativeRegex = new RegExp(`-\\s*\\b${sym}\\b|\\/\\s*\\b${sym}\\b`, "i");
  if (negativeRegex.test(formula)) {
    return -1;
  }

  return 1;
}

/**
 * Detects all directed elementary feedback loops (cycles) in the factor graph.
 *
 * @param {Array} nodes - Factor node list
 * @param {Object} [options] - Options { maxCycleLength: 6 }
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

      const edgePolarity = determineEdgePolarity(src, tgt);
      polarityProduct *= edgePolarity;

      if (/delay\s*\(/.test(tgt.formula || "")) {
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
