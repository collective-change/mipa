/**
 * Portfolio Resource Bandwidth & Multi-Action Concurrency Optimizer
 *
 * Solves multi-dimensional combinatorial allocation problems to recommend the
 * optimal portfolio of initiatives that maximizes systemic leverage and net benefit
 * without exceeding shared human bandwidth or budget limits.
 */

export const DEFAULT_DEPARTMENTS = [
  { id: "executive", labelEn: "Executive / Leadership", labelZh: "決策與主管辦公室" },
  { id: "operations", labelEn: "Operations & Programs", labelZh: "營運與專案推展" },
  { id: "fieldwork", labelEn: "Frontline & Volunteers", labelZh: "一線執行與志工群" },
  { id: "engineering", labelEn: "Technology & IT", labelZh: "資訊技術與系統工程" },
  { id: "finance", labelEn: "Finance & Admin", labelZh: "財務與法規行政" }
];

/**
 * Solves the optimal action portfolio subject to human capacity and budget constraints.
 *
 * @param {Array} actions - Array of action objects
 * @param {Object} constraints - Resource limits
 * @param {number} [constraints.maxTotalBudget] - Maximum outstanding direct cost
 * @param {number} [constraints.maxTotalHours] - Maximum total work hours across all actions
 * @param {Object} [constraints.departmentCaps] - Map of departmentTag -> max hours
 * @param {string} [constraints.objective='benefit'] - 'benefit' | 'leverage'
 * @returns {Object} Optimization results and allocation metrics
 */
export function solvePortfolioOptimization(actions = [], constraints = {}) {
  if (!Array.isArray(actions) || actions.length === 0) {
    return {
      selectedActions: [],
      excludedActions: [],
      totalBenefitNpv: 0,
      totalCostNpv: 0,
      totalEffortHrs: 0,
      portfolioLeverage: 0,
      resourceUtilization: []
    };
  }

  const maxTotalBudget =
    typeof constraints.maxTotalBudget === "number" && !isNaN(constraints.maxTotalBudget)
      ? constraints.maxTotalBudget
      : Infinity;

  const maxTotalHours =
    typeof constraints.maxTotalHours === "number" && !isNaN(constraints.maxTotalHours)
      ? constraints.maxTotalHours
      : Infinity;

  const departmentCaps = constraints.departmentCaps || {};
  const objective = constraints.objective || "benefit";

  // Pre-process actions with sanitized numerical metrics
  const cleanActions = actions.map((act) => {
    const cost = Math.max(0, Number(act.outstandingDirectCosts ?? act.outstandingDirectCost) || 0);
    const hrs = Math.max(0, Number(act.estEffortHrs) || 0);
    const benefit = Number(act.marginalNetTotalBenefitNpv) || 0;
    const leverage = Number(act.actionLeverage) || 0;
    const dept = act.departmentTag || "operations";

    // Efficiency heuristic: benefit per unit of resource consumed
    const resourceWeight = cost + hrs * 50; // nominal hourly shadow price for ranking
    const efficiency = resourceWeight > 0 ? benefit / resourceWeight : benefit;

    return {
      original: act,
      id: act.id,
      title: act.title || "Action",
      cost,
      hrs,
      benefit,
      leverage,
      dept,
      efficiency
    };
  });

  // Feasibility checker for a given subset
  function isFeasible(subset) {
    let totCost = 0;
    let totHrs = 0;
    const deptUsage = {};

    for (const item of subset) {
      totCost += item.cost;
      totHrs += item.hrs;
      deptUsage[item.dept] = (deptUsage[item.dept] || 0) + item.hrs;

      if (totCost > maxTotalBudget) return { feasible: false, reason: "budget_exceeded" };
      if (totHrs > maxTotalHours) return { feasible: false, reason: "total_hours_exceeded" };

      const cap = departmentCaps[item.dept];
      if (typeof cap === "number" && cap >= 0 && deptUsage[item.dept] > cap) {
        return { feasible: false, reason: `dept_cap_exceeded_${item.dept}`, dept: item.dept };
      }
    }

    return { feasible: true };
  }

  // Score function
  function scoreSubset(subset) {
    if (objective === "leverage") {
      // Aggregate leverage weighted by cost
      const totCost = subset.reduce((acc, a) => acc + a.cost, 0);
      const totBenefit = subset.reduce((acc, a) => acc + a.benefit, 0);
      return totCost > 0 ? (totBenefit / totCost) * subset.length : totBenefit;
    }
    return subset.reduce((acc, a) => acc + a.benefit, 0);
  }

  let bestSubset = [];
  let bestScore = -Infinity;

  // For small N <= 16, perform exact optimal combinatorial search
  if (cleanActions.length <= 16) {
    const n = cleanActions.length;
    const totalCombinations = 1 << n;

    for (let mask = 0; mask < totalCombinations; mask++) {
      const candidate = [];
      for (let i = 0; i < n; i++) {
        if ((mask & (1 << i)) !== 0) {
          candidate.push(cleanActions[i]);
        }
      }

      if (isFeasible(candidate).feasible) {
        const sc = scoreSubset(candidate);
        if (sc > bestScore || (sc === bestScore && candidate.length > bestSubset.length)) {
          bestScore = sc;
          bestSubset = candidate;
        }
      }
    }
  } else {
    // Greedy heuristic with 2-opt swap for larger sets
    const sorted = [...cleanActions].sort((a, b) => b.efficiency - a.efficiency);
    const candidate = [];

    for (const item of sorted) {
      if (isFeasible([...candidate, item]).feasible) {
        candidate.push(item);
      }
    }

    bestSubset = candidate;
  }

  // Calculate aggregate metrics
  const selectedIds = new Set(bestSubset.map((a) => a.id));
  const selectedActions = bestSubset.map((a) => a.original);

  const totalBenefitNpv = Math.round(bestSubset.reduce((sum, a) => sum + a.benefit, 0) * 100) / 100;
  const totalCostNpv = Math.round(bestSubset.reduce((sum, a) => sum + a.cost, 0) * 100) / 100;
  const totalEffortHrs = Math.round(bestSubset.reduce((sum, a) => sum + a.hrs, 0) * 10) / 10;
  const portfolioLeverage =
    totalCostNpv > 0 ? Math.round((totalBenefitNpv / totalCostNpv) * 100) / 100 : 0;

  // Track department utilization
  const deptHoursUsed = {};
  for (const item of bestSubset) {
    deptHoursUsed[item.dept] = (deptHoursUsed[item.dept] || 0) + item.hrs;
  }

  const resourceUtilization = [];

  // Total budget utilization
  if (maxTotalBudget !== Infinity) {
    const pct = maxTotalBudget > 0 ? Math.round((totalCostNpv / maxTotalBudget) * 100) : 0;
    resourceUtilization.push({
      key: "budget",
      type: "budget",
      name: "Direct Budget",
      used: totalCostNpv,
      cap: maxTotalBudget,
      unit: "$",
      percent: Math.min(100, pct),
      status: pct >= 100 ? "capped" : pct >= 85 ? "warning" : "safe"
    });
  }

  // Total hours utilization
  if (maxTotalHours !== Infinity) {
    const pct = maxTotalHours > 0 ? Math.round((totalEffortHrs / maxTotalHours) * 100) : 0;
    resourceUtilization.push({
      key: "totalHours",
      type: "hours",
      name: "Total Work Hours",
      used: totalEffortHrs,
      cap: maxTotalHours,
      unit: "hrs",
      percent: Math.min(100, pct),
      status: pct >= 100 ? "capped" : pct >= 85 ? "warning" : "safe"
    });
  }

  // Per-department utilization
  for (const [deptKey, cap] of Object.entries(departmentCaps)) {
    if (typeof cap === "number" && cap > 0) {
      const used = deptHoursUsed[deptKey] || 0;
      const pct = Math.round((used / cap) * 100);
      resourceUtilization.push({
        key: deptKey,
        type: "department",
        name: deptKey,
        used,
        cap,
        unit: "hrs",
        percent: Math.min(100, pct),
        status: pct >= 100 ? "capped" : pct >= 85 ? "warning" : "safe"
      });
    }
  }

  // Classify excluded actions and bottlenecks
  const excludedActions = [];
  for (const act of cleanActions) {
    if (!selectedIds.has(act.id)) {
      // Test why this specific action couldn't be added to the chosen bundle
      const testBundle = [...bestSubset, act];
      const check = isFeasible(testBundle);
      let bottleneckReason = "lower_relative_leverage";
      if (!check.feasible) {
        if (check.reason === "budget_exceeded") bottleneckReason = "budget_bottleneck";
        else if (check.reason === "total_hours_exceeded") bottleneckReason = "hours_bottleneck";
        else if (check.reason && check.reason.startsWith("dept_cap_exceeded_")) {
          bottleneckReason = `dept_bottleneck_${check.dept}`;
        }
      }

      excludedActions.push({
        action: act.original,
        bottleneckReason,
        cost: act.cost,
        hrs: act.hrs,
        dept: act.dept,
        benefit: act.benefit
      });
    }
  }

  return {
    selectedActions,
    excludedActions,
    totalBenefitNpv,
    totalCostNpv,
    totalEffortHrs,
    portfolioLeverage,
    resourceUtilization
  };
}
