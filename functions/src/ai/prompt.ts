// What "Draft my model" sends to the AI provider.
//
// The fixed instructions come first and are the same for every organization,
// so providers can cache them. Nothing that varies per request (dates, ids,
// names) may go into SYSTEM_PROMPT.
//
// Sent: the organization's name, goal, type and currency; the model's time
// settings; each existing factor's name, short name, formula, unit and group;
// the current loop census and unlinked factors; the conversation; and
// trial-calculation errors. Not sent: members, emails, chats, actions,
// factor notes or calculation results (see
// docs/design/draft-my-model.md, "What the AI receives").

export const SYSTEM_PROMPT = `You help people describe how their organization works as a small simulation model in mipa, an app for deciding which actions do the most good. Most people using mipa have never built a model. Your drafts must be small, correct and explained in plain language.

# How mipa models work

A model is a set of factors. Each factor has:
- name: a short plain-language name, in the user's language ("loaves sold per month").
- symbol: a short name used in formulas. camelCase ASCII letters and digits only, starting with a letter, unique in the model ("loavesSoldPerMonth").
- formula: how the factor's value is worked out at each time step, using other factors' symbols. A plain number makes the factor a constant input.
- unit: the factor's unit, or "" for a plain count or ratio.

Factors that a formula mentions are linked to it automatically. Never refer to a symbol that is neither in the current model nor in your draft.

Formulas use mathjs syntax: + - * / ^, parentheses, and functions such as min(a, b), max(a, b), round(x), abs(x), if-then as (condition ? a : b).

Time:
- The model is calculated step by step. dt is the length of one time step (for example 1 month).
- Anything that builds up or runs down over time (people, money in the bank, trees, stock, reputation) is a stock: write it as delay(stockSymbol, dt, initialValue) + inflow - outflow, where delay(stockSymbol, dt, initialValue) is the stock's value one step earlier (initialValue at the start). A stock may refer to itself only inside delay().
- Flows per step (sales this month, costs this month) are ordinary formulas.
- A formula must not depend on itself, directly or through other factors, except through delay(). Circular dependencies make the model impossible to calculate.

Units:
- Use "" (no unit) for counts, people, items and ratios, unless the model already uses units for them. This keeps formulas simple and avoids unit errors.
- Money factors use the organization's currency code as unit (for example "TWD"). A formula that multiplies a count by a money factor gives money: loavesSold * pricePerLoaf, where pricePerLoaf has unit "TWD", has unit "TWD".
- Work hours use the unit "workhours".
- Every factor in a formula must give the factor's unit. Don't add or subtract money and plain numbers.

# The role factors

Every model has these factors (their symbols are fixed). Actions are compared through them, so your draft must connect to them, or the draft changes nothing when actions are compared:
- averageEffortCostPerHour: the organization's rough average cost of one hour of work (money per hour, unit = currency). A constant.
- oneTimeEffort (unit "workhours") and oneTimeSpending (unit = currency): when actions are compared, each action adds the hours and money it needs here. Their formulas stay 0.
- costToOrganizationDuringInterval: the organization's costs in one time step (unit = currency). Should include oneTimeSpending + oneTimeEffort / (1 workhour) * averageEffortCostPerHour, plus the organization's running costs.
- benefitToOrganizationDuringInterval: what the organization gains in one time step (unit = currency), for example income or profit.
- benefitToWorldDuringInterval: the good done to others in one time step, valued in money (unit = currency), for example people helped times the value of that help to them.
- costToWorldDuringInterval: harm done to others in one time step, valued in money (unit = currency), for example emissions times their social cost.

Change a role factor's formula through changesToExisting, never by drafting it again. Only change it when your draft gives it something better than its current formula, and keep what its current formula already includes (for example the oneTimeSpending and oneTimeEffort parts of costToOrganizationDuringInterval).

Optionally, a factor can hold the hourly cost of a particular role or person (isHourlyCost true, unit = currency), when the description makes clear that some people's time costs much more or less than the average. Don't add these otherwise.

# A model good enough to compare actions

Nothing in the world grows without limit. There is always something that stops it, and your job is to find what the important limits are for this organization and represent them. A draft that lets something grow forever is not a simplified model of the world, it is a wrong one, and every figure derived from it inherits the error while still looking precise.

- Find what stops each growing quantity from growing: For each thing the model makes grow — demand, income, volunteers, output, reputation — represent what stops it growing: staff hours, physical or kitchen capacity, funding, donor attention, market size, regulation, trust, or a resource that runs out. A limit is written as a balancing loop: a chain of cause and effect that returns to where it started with the opposite sign.
- How to write one: take a stock read through delay() and add a term that reduces an inflow or growth as that stock grows — a capacity ceiling, a budget, staff fatigue, or saturation.
- Name and explain every limit in plain language, not merely present: only the user knows whether the limit named is the real one, and a limit nobody can name is a number someone invented.
- Spend your question rounds on limits before anything else: a limit is exactly the kind of fact only the user knows, so ask what stops the organization or its growing quantities from growing further before asking about anything else.
- Every factor must be connected: a factor that reads nothing and is read by nothing is invisible to the calculation and contributes nothing. Keep all factors connected to the model and role factors.
- Worked example (bakery limits): monthlyCapacity = 4000; unmetDemand = max(0, demand - monthlyCapacity); fatigue = delay(fatigue, dt, 0) + hoursWorked / 160 - fatigue / 3; quality = baseQuality * (1 - fatigue / 10) feeding back into demand. The bakery's limit is not "the market" in the abstract: it is how many loaves four staff can bake before quality falls and demand follows it down.

If the model already has the limits it needs, do not invent more.

# System archetype diagnostics to recognise

When a user's description fits a classic system dynamics archetype, name it silently in your structure by ensuring all of its feedback loops are drafted rather than only the obvious symptoms:
- Shifting the Burden (most common third-sector failure, where a quick fix looks artificially attractive): model all three loops — the fast symptomatic relief balancing loop (B), the slower fundamental capability balancing loop (B, typically with delay()), and the reinforcing side-effect loop (R) showing how relying on the quick fix erodes fundamental capacity.
- Fixes that Fail: pair the fast balancing fix (B) with its delayed reinforcing unintended consequence loop (R, using delay()) so delayed rebound is visible.
- Eroding Goals: pair the delayed corrective-action balancing loop (B) with any goal-lowering balancing loop (B) pulling opposite sides of a performance gap.
- Success to the Successful: pair both competing reinforcing loops (R1, R2) coupled through the shared zero-sum allocation rule.
- Tragedy of the Commons: connect independent reinforcing actor loops (R1, R2) to the shared resource stock and couple both back through balancing depletion limits (B1, B2).
- Escalation: represent each party's internal balancing loop (B1, B2) plus the figure-eight reinforcing cross-reaction loop (R).
- Growth and Underinvestment: alongside reinforcing growth (R) and a capacity bottleneck limit (B), add the delayed capacity-investment balancing loop (B, using delay()) rather than leaving capacity fixed.
- Attractiveness Principle: when multiple balancing limits (B1, B2) slow one reinforcing engine (R), keep all distinct limiting factors explicit.
- Limits to Growth & Policy Resistance: keep every reinforcing flywheel paired with a named balancing constraint loop (B), and use delay() where reporting or adjustment lags cause overshoot.

When the current model context reports a partial archetype and names a missing loop, add or wire that missing loop directly.

# What to produce

Reply with exactly one JSON object in the required format.

Ask questions (kind "questions") only when the answer would change which factors the model has or how they connect, and you can't make a reasonable assumption. Spend your question rounds on limits before anything else — ask what stops key growing quantities (such as capacity, staff hours, funding, donor attention, market size, regulation or trust) before asking about anything else. At most four short questions, each with why you ask. Never ask about numbers you can estimate. If the conversation already has two rounds of questions, draft.

Otherwise draft (kind "draft"):
- summary: two or three sentences on what the draft models and what it leaves out.
- groups: 2 to 5 short group names for the factors ("Sales", "Volunteers", "Emissions").
- factors: about 8 to 25 new factors, each with group, and an explanation of one or two plain sentences saying what it means, what real-world limit it represents when applicable, and why it is connected the way it is. Prefer fewer, clearer factors over completeness.
- Numbers you supplied yourself: isEstimate true, with estimateReasoning saying how you got it ("about 25 kg of flour per 100 loaves"). Numbers the user gave: isEstimate false, estimateReasoning "".
- changesToExisting: new formulas for existing factors (usually role factors), each with an explanation.
- message: one short sentence to the user about the draft.

When the user asks for changes to a previous draft, reply with the whole revised draft, not only the changes.

When you are given calculation errors for your previous draft, fix exactly those problems and reply with the whole corrected draft.

Write names, explanations, questions, summary and message in the language the user writes in. Symbols are always ASCII camelCase.

Fields that don't apply to the kind of reply are empty strings or empty lists.

# Example

A user writes: "We are a small bakery with 4 staff. We sell bread in our shop. Our biggest costs are flour, energy and wages." Currency USD, time step 1 month.

A good draft has factors such as:
- loavesSoldPerMonth = min(monthlyCapacity, loavesDemanded)
- monthlyCapacity = 4000 (estimate: about 4 staff working full time)
- pricePerLoaf = 4 (unit USD, estimate)
- salesIncome = loavesSoldPerMonth * pricePerLoaf (unit USD)
- flourCostPerLoaf = 0.6 (unit USD, estimate)
- energyCostPerMonth = 900 (unit USD, estimate)
- wagesPerMonth = 4 * 2800 (unit USD, estimate: 4 staff)
- runningCosts = loavesSoldPerMonth * flourCostPerLoaf + energyCostPerMonth + wagesPerMonth (unit USD)
and changesToExisting:
- benefitToOrganizationDuringInterval = salesIncome
- costToOrganizationDuringInterval = runningCosts + oneTimeSpending + oneTimeEffort / (1 workhour) * averageEffortCostPerHour`;

export interface ModelContextFactor {
  id?: string;
  name: string;
  symbol: string;
  formula: string;
  unit: string;
  group: string;
  influencers?: string[];
  class?: string;
}

export interface FeedbackLoopFactor {
  id: string;
  symbol: string;
  name: string;
  edgeToNextPolarity: number;
}

export interface FeedbackLoop {
  id: string;
  code: string;
  type: "reinforcing" | "balancing";
  polarityProduct: number;
  length: number;
  nodeIds: string[];
  factors: FeedbackLoopFactor[];
  hasDelay: boolean;
  name: string;
}

export interface SystemArchetypeDiagnosis {
  id: string;
  archetype: string;
  name: string;
  status: "complete" | "partial";
  isPartial: boolean;
  presentLoops: string[];
  missingLoop: string | null;
  looksLike: string;
  implication: string;
  recommendation: string;
  meadowsLevel: number;
}

export interface ModelContext {
  org: { name: string; goal: string; orgType: string; currency: string };
  timeStep: string;
  horizon: string;
  factors: ModelContextFactor[];
  loops?: FeedbackLoop[];
}

type TokenType = "number" | "ident" | "op" | "paren" | "comma" | "question" | "colon";

interface Token {
  type: TokenType;
  value: string;
}

type ExprEvaluator = (scope: Map<string, number>) => number;

const POLARITY_EPSILON = 1e-12;
const VALID_IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FORMULA_BUILTIN_NAMES = new Set([
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

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenizeFormula(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if ((ch >= "0" && ch <= "9") || (ch === "." && i + 1 < input.length && input[i + 1] >= "0" && input[i + 1] <= "9")) {
      const start = i;
      while (i < input.length && ((input[i] >= "0" && input[i] <= "9") || input[i] === ".")) i++;
      if (i < input.length && (input[i] === "e" || input[i] === "E")) {
        const expPos = i + 1;
        let j = expPos;
        if (j < input.length && (input[j] === "+" || input[j] === "-")) j++;
        if (j < input.length && input[j] >= "0" && input[j] <= "9") {
          while (j < input.length && input[j] >= "0" && input[j] <= "9") j++;
          i = j;
        }
      }
      tokens.push({ type: "number", value: input.slice(start, i) });
      continue;
    }
    if ((ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z") || ch === "_" || ch === "$") {
      const start = i;
      i++;
      while (i < input.length && /[A-Za-z0-9_$]/.test(input[i])) i++;
      tokens.push({ type: "ident", value: input.slice(start, i) });
      continue;
    }
    const two = input.slice(i, i + 2);
    if (["<=", ">=", "==", "!=", "&&", "||"].includes(two)) {
      tokens.push({ type: "op", value: two });
      i += 2;
      continue;
    }
    if ("+-*/^%<>!".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }
    if (ch === "(" || ch === ")") {
      tokens.push({ type: "paren", value: ch });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ type: "comma", value: ch });
      i++;
      continue;
    }
    if (ch === "?") {
      tokens.push({ type: "question", value: ch });
      i++;
      continue;
    }
    if (ch === ":") {
      tokens.push({ type: "colon", value: ch });
      i++;
      continue;
    }
    throw new Error(`Unexpected token "${ch}"`);
  }
  return tokens;
}

function callFormulaFunction(fnName: string, argFns: ExprEvaluator[], scope: Map<string, number>): number {
  const args = argFns.map((fn) => fn(scope));
  switch (fnName) {
    case "delay": {
      const val = args[0];
      if (typeof val === "number" && Number.isFinite(val)) return val;
      const fallback = args[2];
      return typeof fallback === "number" && Number.isFinite(fallback) ? fallback : 1.7;
    }
    case "valueInUnit":
      return args[0] ?? 0;
    case "min":
      return Math.min(...args);
    case "max":
      return Math.max(...args);
    case "abs":
      return Math.abs(args[0]);
    case "round":
      return Math.round(args[0]);
    case "sqrt":
      return args[0] < 0 ? Number.NaN : Math.sqrt(args[0]);
    case "exp":
      return Math.exp(args[0]);
    case "log":
      return args[0] <= 0 ? Number.NaN : Math.log(args[0]);
    case "log10":
      return args[0] <= 0 ? Number.NaN : Math.log10(args[0]);
    case "log2":
      return args[0] <= 0 ? Number.NaN : Math.log2(args[0]);
    case "ceil":
      return Math.ceil(args[0]);
    case "floor":
      return Math.floor(args[0]);
    case "sign":
      return Math.sign(args[0]);
    case "pow":
      return Math.pow(args[0], args[1]);
    case "sin":
      return Math.sin(args[0]);
    case "cos":
      return Math.cos(args[0]);
    case "tan":
      return Math.tan(args[0]);
    case "getSimDayOfWeek":
    case "getSimMonth":
    case "getSimCalendarMonth":
      return 1;
    case "getSimYear":
      return 2026;
    default:
      return Number.NaN;
  }
}

function compileFormulaExpression(
  rawFormula: string,
  idAliases: { id: string; alias: string }[]
): { evaluate: ExprEvaluator | null; usedSymbols: Set<string>; hasSyntaxError: boolean } {
  let normalized = rawFormula.trim();
  if (!normalized) {
    return { evaluate: null, usedSymbols: new Set(), hasSyntaxError: false };
  }
  if (normalized.includes("$") && idAliases.length) {
    for (const { id, alias } of idAliases) {
      normalized = normalized.replace(new RegExp(`\\$${escapeRegExp(id)}(?![A-Za-z0-9_-])`, "g"), alias);
    }
  }

  let tokens: Token[];
  try {
    tokens = tokenizeFormula(normalized);
  } catch {
    return { evaluate: null, usedSymbols: new Set(), hasSyntaxError: true };
  }
  if (!tokens.length) {
    return { evaluate: null, usedSymbols: new Set(), hasSyntaxError: false };
  }

  const usedSymbols = new Set<string>();
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const consume = (): Token => tokens[pos++];

  const parseTernary = (): ExprEvaluator => {
    const cond = parseOr();
    if (peek()?.type === "question") {
      consume();
      const whenTrue = parseTernary();
      if (peek()?.type !== "colon") throw new Error("Expected ':' in ternary expression");
      consume();
      const whenFalse = parseTernary();
      return (scope) => (cond(scope) !== 0 ? whenTrue(scope) : whenFalse(scope));
    }
    return cond;
  };

  const parseOr = (): ExprEvaluator => {
    let left = parseAnd();
    while (peek()?.type === "op" && peek()?.value === "||") {
      consume();
      const right = parseAnd();
      const prev = left;
      left = (scope) => (prev(scope) !== 0 || right(scope) !== 0 ? 1 : 0);
    }
    return left;
  };

  const parseAnd = (): ExprEvaluator => {
    let left = parseCompare();
    while (peek()?.type === "op" && peek()?.value === "&&") {
      consume();
      const right = parseCompare();
      const prev = left;
      left = (scope) => (prev(scope) !== 0 && right(scope) !== 0 ? 1 : 0);
    }
    return left;
  };

  const parseCompare = (): ExprEvaluator => {
    let left = parseAddSub();
    while (peek()?.type === "op" && ["<", "<=", ">", ">=", "==", "!="].includes(peek()!.value)) {
      const op = consume().value;
      const right = parseAddSub();
      const prev = left;
      left = (scope) => {
        const a = prev(scope);
        const b = right(scope);
        switch (op) {
          case "<":
            return a < b ? 1 : 0;
          case "<=":
            return a <= b ? 1 : 0;
          case ">":
            return a > b ? 1 : 0;
          case ">=":
            return a >= b ? 1 : 0;
          case "==":
            return a === b ? 1 : 0;
          default:
            return a !== b ? 1 : 0;
        }
      };
    }
    return left;
  };

  const parseAddSub = (): ExprEvaluator => {
    let left = parseMulDiv();
    while (peek()?.type === "op" && (peek()?.value === "+" || peek()?.value === "-")) {
      const op = consume().value;
      const right = parseMulDiv();
      const prev = left;
      left = op === "+" ? (scope) => prev(scope) + right(scope) : (scope) => prev(scope) - right(scope);
    }
    return left;
  };

  const parseMulDiv = (): ExprEvaluator => {
    let left = parseUnary();
    while (peek()?.type === "op" && (peek()?.value === "*" || peek()?.value === "/" || peek()?.value === "%")) {
      const op = consume().value;
      const right = parseUnary();
      const prev = left;
      if (op === "*") {
        left = (scope) => prev(scope) * right(scope);
      } else if (op === "/") {
        left = (scope) => prev(scope) / right(scope);
      } else {
        left = (scope) => prev(scope) % right(scope);
      }
    }
    return left;
  };

  const parseUnary = (): ExprEvaluator => {
    if (peek()?.type === "op" && (peek()?.value === "+" || peek()?.value === "-" || peek()?.value === "!")) {
      const op = consume().value;
      const inner = parseUnary();
      if (op === "-") return (scope) => -inner(scope);
      if (op === "!") return (scope) => (inner(scope) === 0 ? 1 : 0);
      return inner;
    }
    return parsePower();
  };

  const parsePower = (): ExprEvaluator => {
    const base = parsePrimary();
    if (peek()?.type === "op" && peek()?.value === "^") {
      consume();
      const exponent = parseUnary();
      return (scope) => Math.pow(base(scope), exponent(scope));
    }
    return base;
  };

  const parsePrimary = (): ExprEvaluator => {
    const tok = peek();
    if (!tok) throw new Error("Unexpected end of formula");

    if (tok.type === "number") {
      consume();
      const val = Number(tok.value);
      return () => val;
    }

    if (tok.type === "paren" && tok.value === "(") {
      consume();
      const expr = parseTernary();
      if (peek()?.type !== "paren" || peek()?.value !== ")") throw new Error("Expected ')'");
      consume();
      return expr;
    }

    if (tok.type === "ident") {
      consume();
      if (peek()?.type === "paren" && peek()?.value === "(") {
        consume();
        const argFns: ExprEvaluator[] = [];
        if (!(peek()?.type === "paren" && peek()?.value === ")")) {
          argFns.push(parseTernary());
          while (peek()?.type === "comma") {
            consume();
            argFns.push(parseTernary());
          }
        }
        if (peek()?.type !== "paren" || peek()?.value !== ")") throw new Error("Expected ')' after arguments");
        consume();
        return (scope) => callFormulaFunction(tok.value, argFns, scope);
      }
      if (!FORMULA_BUILTIN_NAMES.has(tok.value)) {
        usedSymbols.add(tok.value);
      }
      return (scope) => scope.get(tok.value) ?? 1.7;
    }

    throw new Error(`Unexpected token "${tok.value}"`);
  };

  try {
    const evaluator = parseTernary();
    if (pos < tokens.length) {
      return { evaluate: null, usedSymbols: new Set(), hasSyntaxError: true };
    }
    return { evaluate: evaluator, usedSymbols, hasSyntaxError: false };
  } catch {
    return { evaluate: null, usedSymbols: new Set(), hasSyntaxError: true };
  }
}

function defaultSeed(index: number): number {
  return 1.7 + (index % 19) * 0.37;
}

function safeEval(fn: ExprEvaluator | null, scope: Map<string, number>): number | null {
  if (!fn) return null;
  try {
    const value = fn(scope);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function getFactorKeys(factor: ModelContextFactor, alias: string, symbols: Set<string>, fallbackId: string): string[] {
  const id = factor.id || fallbackId;
  const keys = [alias];
  if (factor.symbol && VALID_IDENT_RE.test(factor.symbol)) keys.push(factor.symbol);
  if (id) {
    keys.push(`$${id}`);
    if (VALID_IDENT_RE.test(id) && !symbols.has(id) && !keys.includes(id)) {
      keys.push(id);
    }
  }
  return Array.from(new Set(keys));
}

function setKeys(scope: Map<string, number>, keys: string[], value: number): void {
  for (const key of keys) scope.set(key, value);
}

/**
 * Detects directed feedback loops and computes loop polarities numerically
 * using single-pass factor perturbation across the model.
 */
export function detectFeedbackLoops(
  factors: ModelContextFactor[] = [],
  options: { maxCycleLength?: number } = {}
): FeedbackLoop[] {
  if (!Array.isArray(factors) || factors.length < 2) return [];

  const maxLen = options.maxCycleLength || 6;
  const symbols = new Set(factors.map((f) => f.symbol).filter(Boolean));
  const idAliases = factors
    .map((f, idx) => ({ id: f.id || f.symbol || `__f_${idx}`, alias: `__f_${idx}_ref` }))
    .sort((a, b) => b.id.length - a.id.length);
  const aliasById = new Map(idAliases.map((item) => [item.id, item.alias]));

  const compiledEntries = factors.map((f, idx) => {
    const id = f.id || f.symbol || `__f_${idx}`;
    const alias = aliasById.get(id) || `__f_${idx}_ref`;
    const { evaluate, usedSymbols, hasSyntaxError } = compileFormulaExpression(f.formula || "", idAliases);
    const scopeKeys = getFactorKeys(f, alias, symbols, id);
    return { id, factor: f, evaluate, usedSymbols, hasSyntaxError, scopeKeys, baseline: defaultSeed(idx) };
  });

  const entryById = new Map(compiledEntries.map((entry) => [entry.id, entry]));
  const keyToId = new Map<string, string>();
  for (const entry of compiledEntries) {
    for (const key of entry.scopeKeys) {
      if (!keyToId.has(key)) keyToId.set(key, entry.id);
    }
  }

  // Build adjacency list: source -> [targets]. Infer from formula symbols if `influencers` omitted.
  const adj = new Map<string, string[]>();
  for (const entry of compiledEntries) adj.set(entry.id, []);

  for (const target of compiledEntries) {
    const sourceIds = Array.isArray(target.factor.influencers)
      ? target.factor.influencers
      : Array.from(target.usedSymbols)
          .map((sym) => keyToId.get(sym))
          .filter((sid): sid is string => Boolean(sid && sid !== target.id));

    const uniqueSources = new Set(sourceIds);
    for (const srcId of uniqueSources) {
      if (adj.has(srcId) && srcId !== target.id) {
        adj.get(srcId)!.push(target.id);
      }
    }
  }

  const rawCycles: string[][] = [];
  const visited = new Set<string>();
  const path: string[] = [];

  const dfs = (currId: string, startId: string, depth: number): void => {
    if (depth > maxLen) return;
    path.push(currId);
    visited.add(currId);

    for (const neighborId of adj.get(currId) || []) {
      if (neighborId === startId && path.length >= 2) {
        const cycle = [...path];
        const minId = cycle.reduce((m, id) => (id < m ? id : m), cycle[0]);
        if (cycle[0] === minId) rawCycles.push(cycle);
      } else if (!visited.has(neighborId)) {
        dfs(neighborId, startId, depth + 1);
      }
    }

    path.pop();
    visited.delete(currId);
  };

  for (const entry of compiledEntries) {
    dfs(entry.id, entry.id, 1);
  }
  if (!rawCycles.length) return [];

  // Initialize baseline scope with builtins + distinct positive seeds
  const baseScope = new Map<string, number>([
    ["dt", 1],
    ["timeS", 0],
    ["initialTimeS", 0],
    ["pi", Math.PI],
    ["e", Math.E],
    ["true", 1],
    ["false", 0]
  ]);
  let freeCounter = compiledEntries.length + 1;
  for (const entry of compiledEntries) {
    for (const sym of entry.usedSymbols) {
      if (!baseScope.has(sym)) baseScope.set(sym, defaultSeed(freeCounter++));
    }
    setKeys(baseScope, entry.scopeKeys, entry.baseline);
  }

  // Evaluate formulas once to settle baseline values
  for (const entry of compiledEntries) {
    const val = safeEval(entry.evaluate, baseScope);
    if (val !== null) {
      entry.baseline = val;
      setKeys(baseScope, entry.scopeKeys, val);
    }
  }

  const baseOutputs = new Map<string, number | null>();
  for (const entry of compiledEntries) {
    baseOutputs.set(entry.id, entry.evaluate ? safeEval(entry.evaluate, baseScope) : entry.baseline);
  }

  // Group cycle edges by unique source factor and perturb each source factor once
  const readersBySource = new Map<string, Set<string>>();
  for (const cycle of rawCycles) {
    for (let i = 0; i < cycle.length; i++) {
      const srcId = cycle[i];
      const tgtId = cycle[(i + 1) % cycle.length];
      if (!readersBySource.has(srcId)) readersBySource.set(srcId, new Set());
      readersBySource.get(srcId)!.add(tgtId);
    }
  }

  const edgePolarities = new Map<string, number>();
  const perturbedScope = new Map(baseScope);

  for (const [srcId, readerIds] of readersBySource.entries()) {
    const srcEntry = entryById.get(srcId);
    if (!srcEntry) continue;
    const delta = Math.max(Math.abs(srcEntry.baseline) * 0.05, 0.25);
    setKeys(perturbedScope, srcEntry.scopeKeys, srcEntry.baseline + delta);

    for (const tgtId of readerIds) {
      const tgtEntry = entryById.get(tgtId);
      const edgeKey = `${srcId}->${tgtId}`;
      if (!tgtEntry || !tgtEntry.evaluate || tgtEntry.hasSyntaxError) {
        edgePolarities.set(edgeKey, 1);
        continue;
      }
      if (!srcEntry.scopeKeys.some((k) => tgtEntry.usedSymbols.has(k))) {
        edgePolarities.set(edgeKey, 1);
        continue;
      }

      const baseOut = baseOutputs.get(tgtId) ?? null;
      const pertOut = safeEval(tgtEntry.evaluate, perturbedScope);
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

      // Probe fallback for flat / boundary-clamped expressions
      let fallbackSign = 1;
      for (const probeDelta of [Math.max(Math.abs(srcEntry.baseline) * 0.5, 2.5)]) {
        setKeys(perturbedScope, srcEntry.scopeKeys, 0.25);
        const pBefore = safeEval(tgtEntry.evaluate, perturbedScope);
        setKeys(perturbedScope, srcEntry.scopeKeys, 0.25 + probeDelta);
        const pAfter = safeEval(tgtEntry.evaluate, perturbedScope);
        if (pBefore !== null && pAfter !== null) {
          if (pAfter - pBefore < -POLARITY_EPSILON) fallbackSign = -1;
          else if (pAfter - pBefore > POLARITY_EPSILON) fallbackSign = 1;
        }
      }
      edgePolarities.set(edgeKey, fallbackSign);
    }

    setKeys(perturbedScope, srcEntry.scopeKeys, srcEntry.baseline);
  }

  let reinforcingCount = 0;
  let balancingCount = 0;

  return rawCycles.map((cycleIds) => {
    let polarityProduct = 1;
    let hasDelay = false;
    const factorDetails: FeedbackLoopFactor[] = [];

    for (let i = 0; i < cycleIds.length; i++) {
      const srcId = cycleIds[i];
      const tgtId = cycleIds[(i + 1) % cycleIds.length];
      const src = entryById.get(srcId)?.factor;
      const tgt = entryById.get(tgtId)?.factor;
      const polarity = edgePolarities.get(`${srcId}->${tgtId}`) ?? 1;
      polarityProduct *= polarity;
      if (/delay\s*\(/.test(tgt?.formula || "")) hasDelay = true;

      factorDetails.push({
        id: src?.id || srcId,
        symbol: src?.symbol || srcId,
        name: src?.name || src?.symbol || srcId,
        edgeToNextPolarity: polarity
      });
    }

    const isReinforcing = polarityProduct > 0;
    const loopType: "reinforcing" | "balancing" = isReinforcing ? "reinforcing" : "balancing";
    if (isReinforcing) reinforcingCount++;
    else balancingCount++;

    const code = isReinforcing ? `R${reinforcingCount}` : `B${balancingCount}`;
    const startLabel = factorDetails[0].symbol || factorDetails[0].name;
    const chainStr = [...factorDetails.map((f) => f.symbol || f.name), startLabel].join(" → ");

    return {
      id: `loop_${code}_${cycleIds.join("_")}`,
      code,
      type: loopType,
      polarityProduct,
      length: cycleIds.length,
      nodeIds: cycleIds,
      factors: factorDetails,
      hasDelay,
      name: `${code}: ${chainStr}`
    };
  });
}

interface LoopEdge {
  from: string;
  to: string;
  polarity: number;
}

interface LoopMeta {
  loop: FeedbackLoop;
  nodeIds: string[];
  nodeSet: Set<string>;
  edges: LoopEdge[];
  edgeKeys: Set<string>;
  incomingByTarget: Map<string, number[]>;
  outgoingBySource: Map<string, number[]>;
}

function buildLoopMeta(loop: FeedbackLoop): LoopMeta {
  const nodeIds = Array.isArray(loop.nodeIds) ? loop.nodeIds : [];
  const factors = Array.isArray(loop.factors) ? loop.factors : [];
  const nodeSet = new Set(nodeIds);
  const edges: LoopEdge[] = [];
  const edgeKeys = new Set<string>();
  const incomingByTarget = new Map<string, number[]>();
  const outgoingBySource = new Map<string, number[]>();

  for (let i = 0; i < nodeIds.length; i++) {
    const from = nodeIds[i];
    const to = nodeIds[(i + 1) % nodeIds.length];
    const polarity = factors[i]?.edgeToNextPolarity === -1 ? -1 : 1;
    edges.push({ from, to, polarity });
    edgeKeys.add(`${from}->${to}`);
    if (!outgoingBySource.has(from)) outgoingBySource.set(from, []);
    outgoingBySource.get(from)!.push(polarity);
    if (!incomingByTarget.has(to)) incomingByTarget.set(to, []);
    incomingByTarget.get(to)!.push(polarity);
  }
  return { loop, nodeIds, nodeSet, edges, edgeKeys, incomingByTarget, outgoingBySource };
}

function intersectIds(a: Set<string>, b: Set<string>): string[] {
  return Array.from(a).filter((id) => b.has(id));
}

function diffIds(a: Set<string>, b: Set<string>): string[] {
  return Array.from(a).filter((id) => !b.has(id));
}

function directedPolarityInLoop(meta: LoopMeta, startId: string, endId: string): number | null {
  const startIdx = meta.nodeIds.indexOf(startId);
  if (startIdx < 0 || !meta.nodeSet.has(endId) || startId === endId) return null;
  let prod = 1;
  for (let step = 0; step < meta.nodeIds.length; step++) {
    const edge = meta.edges[(startIdx + step) % meta.nodeIds.length];
    prod *= edge.polarity;
    if (edge.to === endId) return prod;
  }
  return null;
}

function sameSignAtNode(metaA: LoopMeta, metaB: LoopMeta, sharedId: string): boolean {
  const inA = metaA.incomingByTarget.get(sharedId) || [];
  const inB = metaB.incomingByTarget.get(sharedId) || [];
  return inA.length > 0 && inB.length > 0 && inA[0] === inB[0];
}

function oppositeSignAtNode(metaA: LoopMeta, metaB: LoopMeta, sharedId: string): boolean {
  const inA = metaA.incomingByTarget.get(sharedId) || [];
  const inB = metaB.incomingByTarget.get(sharedId) || [];
  const outA = metaA.outgoingBySource.get(sharedId) || [];
  const outB = metaB.outgoingBySource.get(sharedId) || [];
  return (inA.length > 0 && inB.length > 0 && inA[0] !== inB[0]) ||
    (outA.length > 0 && outB.length > 0 && outA[0] !== outB[0]);
}

function factorLabels(ids: string[], factorById: Map<string, ModelContextFactor>): string {
  return ids
    .slice(0, 4)
    .map((id) => factorById.get(id)?.symbol || factorById.get(id)?.name || id)
    .join(", ");
}

/**
 * Diagnoses complete and partial system archetypes directly from `detectFeedbackLoops` output
 * so the drafting AI receives concrete loop-completion guidance without a second DFS walk.
 */
export function detectSystemArchetypes(
  factors: ModelContextFactor[] = [],
  loops: FeedbackLoop[] = []
): SystemArchetypeDiagnosis[] {
  const factorById = new Map<string, ModelContextFactor>();
  for (const f of factors) factorById.set(f.id || f.symbol, f);

  const reinforcing = loops.filter((l) => l.type === "reinforcing").map(buildLoopMeta);
  const balancing = loops.filter((l) => l.type === "balancing").map(buildLoopMeta);
  const allLoopNodeIds = new Set(loops.flatMap((l) => l.nodeIds || []));
  const out: SystemArchetypeDiagnosis[] = [];
  const seen = new Set<string>();
  const add = (item: SystemArchetypeDiagnosis) => {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      out.push(item);
    }
  };

  const shiftingClaimedRIds = new Set<string>();
  const shiftingBPairs = new Set<string>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}::${b}` : `${b}::${a}`);

  // 1. Shifting the Burden (first - third sector's core trap)
  for (let i = 0; i < balancing.length; i++) {
    for (let j = i + 1; j < balancing.length; j++) {
      const mA = balancing[i];
      const mB = balancing[j];
      const shared = intersectIds(mA.nodeSet, mB.nodeSet);
      if (!shared.length || !diffIds(mA.nodeSet, mB.nodeSet).length || !diffIds(mB.nodeSet, mA.nodeSet).length) continue;
      if (!shared.some((sid) => sameSignAtNode(mA, mB, sid))) continue;

      let bSymp = mA;
      let bFund = mB;
      if (mA.loop.hasDelay && !mB.loop.hasDelay) {
        bSymp = mB;
        bFund = mA;
      } else if (!mA.loop.hasDelay && !mB.loop.hasDelay && mA.loop.length > mB.loop.length) {
        bSymp = mB;
        bFund = mA;
      }

      const sympOnly = diffIds(bSymp.nodeSet, bFund.nodeSet);
      const fundOnly = diffIds(bFund.nodeSet, bSymp.nodeSet);
      const sideR = reinforcing.find((rMeta) => {
        const sMatch = sympOnly.find((id) => rMeta.nodeSet.has(id));
        const fMatch = fundOnly.find((id) => rMeta.nodeSet.has(id));
        return Boolean(sMatch && fMatch && directedPolarityInLoop(rMeta, sMatch, fMatch) === -1);
      });

      if (sideR) {
        shiftingClaimedRIds.add(sideR.loop.id);
        shiftingBPairs.add(pairKey(bSymp.loop.id, bFund.loop.id));
        add({
          id: `arch_shifting_${bSymp.loop.code}_${bFund.loop.code}_${sideR.loop.code}`,
          archetype: "shifting_the_burden",
          name: "Shifting the Burden",
          status: "complete",
          isPartial: false,
          presentLoops: [bSymp.loop.code, bFund.loop.code, sideR.loop.code],
          missingLoop: null,
          looksLike: `Quick fix (${bSymp.loop.code}) and fundamental fix (${bFund.loop.code}) both address ${factorLabels(shared, factorById)}, while ${sideR.loop.code} erodes root capacity.`,
          implication: "Short-term quick fix looks most attractive while fundamental capacity steadily erodes.",
          recommendation: "Invest in rebuilding the fundamental loop while tapering the symptomatic relief.",
          meadowsLevel: 5
        });
      } else if ((!bSymp.loop.hasDelay && bFund.loop.hasDelay) || bSymp.loop.length < bFund.loop.length) {
        shiftingBPairs.add(pairKey(bSymp.loop.id, bFund.loop.id));
        add({
          id: `arch_shifting_partial_r_${bSymp.loop.code}_${bFund.loop.code}`,
          archetype: "shifting_the_burden",
          name: "Shifting the Burden",
          status: "partial",
          isPartial: true,
          presentLoops: [bSymp.loop.code, bFund.loop.code],
          missingLoop: "Missing reinforcing side-effect loop (R) showing whether the symptomatic quick fix weakens capacity for the fundamental solution.",
          looksLike: `Quick fix (${bSymp.loop.code}) and slower solution (${bFund.loop.code}) share ${factorLabels(shared, factorById)} with no side-effect link.`,
          implication: "Without the side-effect loop, relying on the quick fix hides whether fundamental capacity decays.",
          recommendation: "Check whether the quick fix erodes the fundamental capacity factor.",
          meadowsLevel: 5
        });
      }
    }
  }

  for (const bMeta of balancing) {
    if (bMeta.loop.hasDelay) continue;
    for (const rMeta of reinforcing) {
      if (shiftingClaimedRIds.has(rMeta.loop.id) || rMeta.loop.length <= bMeta.loop.length) continue;
      const shared = intersectIds(bMeta.nodeSet, rMeta.nodeSet);
      const outside = diffIds(rMeta.nodeSet, bMeta.nodeSet);
      if (shared.length < 2 || !outside.length) continue;
      const erodes = bMeta.edges.some(
        (e) =>
          rMeta.edgeKeys.has(`${e.from}->${e.to}`) &&
          outside.some(
            (capId) =>
              directedPolarityInLoop(rMeta, e.to, capId) === -1 &&
              directedPolarityInLoop(rMeta, capId, e.from) === -1
          )
      );
      if (!erodes) continue;
      const hasFundB = balancing.some(
        (otherB) =>
          otherB.loop.id !== bMeta.loop.id &&
          intersectIds(otherB.nodeSet, new Set(outside)).length > 0 &&
          intersectIds(otherB.nodeSet, bMeta.nodeSet).length > 0
      );
      if (hasFundB) continue;

      shiftingClaimedRIds.add(rMeta.loop.id);
      add({
        id: `arch_shifting_partial_b_${bMeta.loop.code}_${rMeta.loop.code}`,
        archetype: "shifting_the_burden",
        name: "Shifting the Burden",
        status: "partial",
        isPartial: true,
        presentLoops: [bMeta.loop.code, rMeta.loop.code],
        missingLoop: "Missing fundamental solution balancing loop (B) resolving root capacity directly without the quick fix.",
        looksLike: `Quick fix (${bMeta.loop.code}) relieves the symptom while ${rMeta.loop.code} erodes ${factorLabels(outside, factorById)}.`,
        implication: "The quick fix undermines capability while no fundamental balancing loop restores it directly.",
        recommendation: "Add a direct fundamental balancing loop that builds capability independently of the quick fix.",
        meadowsLevel: 5
      });
    }
  }

  // 2. Fixes that Fail
  for (const bMeta of balancing) {
    if (bMeta.loop.hasDelay) continue;
    let matchedRebound = false;
    for (const rMeta of reinforcing) {
      if (shiftingClaimedRIds.has(rMeta.loop.id) || rMeta.loop.length <= bMeta.loop.length) continue;
      const sharedEdge = bMeta.edges.find((e) => rMeta.edgeKeys.has(`${e.from}->${e.to}`));
      if (!sharedEdge) continue;
      matchedRebound = true;
      add({
        id: `arch_fixes_${bMeta.loop.code}_${rMeta.loop.code}`,
        archetype: "fixes_that_fail",
        name: "Fixes that Fail",
        status: rMeta.loop.hasDelay ? "complete" : "partial",
        isPartial: !rMeta.loop.hasDelay,
        presentLoops: [bMeta.loop.code, rMeta.loop.code],
        missingLoop: rMeta.loop.hasDelay
          ? null
          : "Missing time delay on the reinforcing rebound loop (R) explaining why the side effect appears after short-term relief.",
        looksLike: `Fast fix (${bMeta.loop.code}) and unintended consequence loop (${rMeta.loop.code}) diverge from the same intervention.`,
        implication: "Short-term symptom relief triggers a rebound that brings the problem back worse over time.",
        recommendation: "Expose delayed unintended consequences and redesign around root causes.",
        meadowsLevel: 9
      });
    }
    if (!matchedRebound) {
      const openDelayed = factors.filter((f) => {
        const fid = f.id || f.symbol;
        return !allLoopNodeIds.has(fid) && /delay\s*\(/.test(f.formula || "") &&
          (f.influencers || []).some((inf) => bMeta.nodeSet.has(inf));
      });
      if (openDelayed.length) {
        add({
          id: `arch_fixes_partial_r_${bMeta.loop.code}`,
          archetype: "fixes_that_fail",
          name: "Fixes that Fail",
          status: "partial",
          isPartial: true,
          presentLoops: [bMeta.loop.code],
          missingLoop: "Missing delayed reinforcing rebound loop (R) closing from the unintended side-effect factor back to worsen the problem.",
          looksLike: `Fast fix (${bMeta.loop.code}) drives delayed stock (${openDelayed.map((f) => f.symbol).join(", ")}) without closing back.`,
          implication: "Side effects accumulate silently without feeding back into future symptom severity.",
          recommendation: "Close the delayed side-effect stock back to the problem symptom if unintended harm rebounds.",
          meadowsLevel: 9
        });
      }
    }
  }

  // 3. Eroding Goals
  const erodingShared = new Set<string>();
  const erodingPairs = new Set<string>();
  for (let i = 0; i < balancing.length; i++) {
    for (let j = i + 1; j < balancing.length; j++) {
      const mA = balancing[i];
      const mB = balancing[j];
      const shared = intersectIds(mA.nodeSet, mB.nodeSet);
      const gapId = shared.find((sid) => {
        const inA = mA.incomingByTarget.get(sid) || [];
        const inB = mB.incomingByTarget.get(sid) || [];
        return inA.length > 0 && inB.length > 0 && inA[0] !== inB[0];
      });
      if (!gapId) continue;
      if (!diffIds(mA.nodeSet, mB.nodeSet).length || !diffIds(mB.nodeSet, mA.nodeSet).length) continue;
      if (!mA.loop.hasDelay && !mB.loop.hasDelay && mA.loop.length === mB.loop.length) continue;
      erodingShared.add(gapId);
      erodingPairs.add(pairKey(mA.loop.id, mB.loop.id));
      add({
        id: `arch_eroding_${mA.loop.code}_${mB.loop.code}`,
        archetype: "eroding_goals",
        name: "Eroding Goals",
        status: "complete",
        isPartial: false,
        presentLoops: [mA.loop.code, mB.loop.code],
        missingLoop: null,
        looksLike: `Corrective action and goal revision (${mA.loop.code}, ${mB.loop.code}) pull gap factor ${factorLabels([gapId], factorById)} from opposite directions.`,
        implication: "Lowering targets resolves perceived gaps faster than operational improvement, eroding standards.",
        recommendation: "Anchor goals externally rather than drifting standards down to match performance.",
        meadowsLevel: 3
      });
    }
  }

  // 4. Success to the Successful
  for (let i = 0; i < reinforcing.length; i++) {
    for (let j = i + 1; j < reinforcing.length; j++) {
      const rA = reinforcing[i];
      const rB = reinforcing[j];
      const shared = intersectIds(rA.nodeSet, rB.nodeSet);
      if (shared.length > 0 && shared.some((sid) => oppositeSignAtNode(rA, rB, sid))) {
        add({
          id: `arch_success_${rA.loop.code}_${rB.loop.code}`,
          archetype: "success_to_successful",
          name: "Success to the Successful",
          status: "complete",
          isPartial: false,
          presentLoops: [rA.loop.code, rB.loop.code],
          missingLoop: null,
          looksLike: `Reinforcing loops (${rA.loop.code}, ${rB.loop.code}) split a shared resource asymmetrically through ${factorLabels(shared, factorById)}.`,
          implication: "Early winner takes all resources and starves potentially viable alternatives.",
          recommendation: "Decouple zero-sum allocation or protect baseline resources for both tracks.",
          meadowsLevel: 5
        });
      } else if (!shared.length) {
        const bridge = reinforcing.find(
          (rC) =>
            rC.loop.id !== rA.loop.id &&
            rC.loop.id !== rB.loop.id &&
            intersectIds(rC.nodeSet, rA.nodeSet).length > 0 &&
            intersectIds(rC.nodeSet, rB.nodeSet).length > 0 &&
            rC.edges.filter((e) => e.polarity === -1).length >= 2
        );
        if (bridge) {
          add({
            id: `arch_success_${rA.loop.code}_${rB.loop.code}_${bridge.loop.code}`,
            archetype: "success_to_successful",
            name: "Success to the Successful",
            status: "complete",
            isPartial: false,
            presentLoops: [rA.loop.code, rB.loop.code, bridge.loop.code],
            missingLoop: null,
            looksLike: `Growth engines (${rA.loop.code}, ${rB.loop.code}) mutually suppress each other across ${bridge.loop.code}.`,
            implication: "Winner dominance reflects competitive suppression rather than underlying merit.",
            recommendation: "Decouple shared allocation criteria.",
            meadowsLevel: 5
          });
        }
      }
    }
  }

  // 5. Tragedy of the Commons
  for (let i = 0; i < reinforcing.length; i++) {
    for (let j = i + 1; j < reinforcing.length; j++) {
      const rA = reinforcing[i];
      const rB = reinforcing[j];
      if (intersectIds(rA.nodeSet, rB.nodeSet).length > 0) continue;
      const bAList = balancing.filter((b) => intersectIds(b.nodeSet, rA.nodeSet).length > 0 && intersectIds(b.nodeSet, rB.nodeSet).length === 0);
      const bBList = balancing.filter((b) => intersectIds(b.nodeSet, rB.nodeSet).length > 0 && intersectIds(b.nodeSet, rA.nodeSet).length === 0);
      let foundComplete = false;
      for (const bA of bAList) {
        for (const bB of bBList) {
          const commons = intersectIds(bA.nodeSet, bB.nodeSet).filter((id) => !rA.nodeSet.has(id) && !rB.nodeSet.has(id));
          if (!commons.length) continue;
          foundComplete = true;
          add({
            id: `arch_tragedy_${rA.loop.code}_${rB.loop.code}_${bA.loop.code}_${bB.loop.code}`,
            archetype: "tragedy_of_the_commons",
            name: "Tragedy of the Commons",
            status: "complete",
            isPartial: false,
            presentLoops: [rA.loop.code, rB.loop.code, bA.loop.code, bB.loop.code],
            missingLoop: null,
            looksLike: `Actors (${rA.loop.code}, ${rB.loop.code}) exploit shared commons ${factorLabels(commons, factorById)} under coupled limits (${bA.loop.code}, ${bB.loop.code}).`,
            implication: "Individual gains encourage overuse until shared capacity degrades for everyone.",
            recommendation: "Connect total usage signals and shared limits back to every participant.",
            meadowsLevel: 5
          });
        }
      }
      if (!foundComplete && bAList.length > 0 && bBList.length === 0) {
        for (const bA of bAList) {
          const commons = diffIds(bA.nodeSet, rA.nodeSet).find((cid) =>
            (factorById.get(cid)?.influencers || []).some((inf) => rB.nodeSet.has(inf))
          );
          if (commons) {
            add({
              id: `arch_tragedy_partial_b_${rA.loop.code}_${rB.loop.code}_${bA.loop.code}`,
              archetype: "tragedy_of_the_commons",
              name: "Tragedy of the Commons",
              status: "partial",
              isPartial: true,
              presentLoops: [rA.loop.code, rB.loop.code, bA.loop.code],
              missingLoop: "Missing balancing commons-depletion loop (B) feeding shared congestion or scarcity back to every user.",
              looksLike: `Actors (${rA.loop.code}, ${rB.loop.code}) both feed ${factorLabels([commons], factorById)} with scarcity closing back only to ${rA.loop.code}.`,
              implication: "One actor ignores shared resource degradation while continuing unchecked expansion.",
              recommendation: "Close the shared commons limit back into all actors.",
              meadowsLevel: 5
            });
          }
        }
      }
    }
  }

  // 6. Escalation
  const escalationRIds = new Set<string>();
  for (let i = 0; i < balancing.length; i++) {
    for (let j = i + 1; j < balancing.length; j++) {
      const bA = balancing[i];
      const bB = balancing[j];
      if (intersectIds(bA.nodeSet, bB.nodeSet).length > 0) continue;
      const fig8R = reinforcing.find(
        (r) =>
          intersectIds(r.nodeSet, bA.nodeSet).length > 0 &&
          intersectIds(r.nodeSet, bB.nodeSet).length > 0 &&
          r.edges.filter((e) => e.polarity === -1).length === 0
      );
      if (!fig8R) continue;
      escalationRIds.add(fig8R.loop.id);
      add({
        id: `arch_escalation_${bA.loop.code}_${bB.loop.code}_${fig8R.loop.code}`,
        archetype: "escalation",
        name: "Escalation",
        status: "complete",
        isPartial: false,
        presentLoops: [bA.loop.code, bB.loop.code, fig8R.loop.code],
        missingLoop: null,
        looksLike: `Separate actor responses (${bA.loop.code}, ${bB.loop.code}) amplify each other via figure-eight loop ${fig8R.loop.code}.`,
        implication: "Mutual retaliation escalates total effort without yielding lasting advantage.",
        recommendation: "Shift to absolute internal goals or negotiate mutual de-escalation.",
        meadowsLevel: 8
      });
    }
  }

  for (const bMeta of balancing) {
    for (const rMeta of reinforcing) {
      if (escalationRIds.has(rMeta.loop.id) || shiftingClaimedRIds.has(rMeta.loop.id)) continue;
      const shared = intersectIds(bMeta.nodeSet, rMeta.nodeSet);
      const external = diffIds(rMeta.nodeSet, bMeta.nodeSet);
      if (shared.length < 2 || external.length < 2 || rMeta.edges.some((e) => e.polarity === -1)) continue;
      if (balancing.some((otherB) => otherB.loop.id !== bMeta.loop.id && intersectIds(otherB.nodeSet, new Set(external)).length > 0)) continue;
      add({
        id: `arch_escalation_partial_${bMeta.loop.code}_${rMeta.loop.code}`,
        archetype: "escalation",
        name: "Escalation",
        status: "partial",
        isPartial: true,
        presentLoops: [bMeta.loop.code, rMeta.loop.code],
        missingLoop: "Missing opponent's balancing anchor loop (B) balancing its own effort against its internal standard.",
        looksLike: `Actor loop (${bMeta.loop.code}) couples into cross-escalation (${rMeta.loop.code}) with unanchored counterparty response.`,
        implication: "Escalation loop appears without the opponent's self-limiting goal.",
        recommendation: "Add the counterparty's balancing anchor loop.",
        meadowsLevel: 8
      });
    }
  }

  // 7. Growth and Underinvestment
  for (const rMeta of reinforcing) {
    for (const bLimit of balancing.filter((b) => intersectIds(b.nodeSet, rMeta.nodeSet).length > 0)) {
      const limitOnly = new Set(diffIds(bLimit.nodeSet, rMeta.nodeSet));
      if (!limitOnly.size) continue;
      const investB = balancing.find(
        (bInv) =>
          bInv.loop.id !== bLimit.loop.id &&
          bInv.loop.hasDelay &&
          intersectIds(bInv.nodeSet, limitOnly).length > 0 &&
          intersectIds(bInv.nodeSet, rMeta.nodeSet).length === 0
      );
      if (investB) {
        add({
          id: `arch_growth_underinvest_${rMeta.loop.code}_${bLimit.loop.code}_${investB.loop.code}`,
          archetype: "growth_and_underinvestment",
          name: "Growth and Underinvestment",
          status: "complete",
          isPartial: false,
          presentLoops: [rMeta.loop.code, bLimit.loop.code, investB.loop.code],
          missingLoop: null,
          looksLike: `Growth (${rMeta.loop.code}) hits limit (${bLimit.loop.code}), governed by delayed capacity investment (${investB.loop.code}).`,
          implication: "Sluggish investment risks locking the organization into a lower capacity equilibrium.",
          recommendation: "Invest ahead of capacity bottlenecks and hold service standards steady.",
          meadowsLevel: 6
        });
      }
    }
  }

  // 8. Attractiveness Principle & 9. Limits to Growth
  for (const rMeta of reinforcing) {
    const boundingBs = balancing.filter((b) => intersectIds(b.nodeSet, rMeta.nodeSet).length > 0);
    if (boundingBs.length >= 2) {
      const distinctPair = boundingBs.some((b1, idx) =>
        boundingBs.slice(idx + 1).some((b2) => {
          const unionR1 = new Set([...rMeta.nodeSet, ...b2.nodeSet]);
          const unionR2 = new Set([...rMeta.nodeSet, ...b1.nodeSet]);
          return diffIds(b1.nodeSet, unionR1).length > 0 && diffIds(b2.nodeSet, unionR2).length > 0;
        })
      );
      if (distinctPair) {
        add({
          id: `arch_attractiveness_${rMeta.loop.code}_${boundingBs.map((b) => b.loop.code).join("_")}`,
          archetype: "attractiveness_principle",
          name: "Attractiveness Principle",
          status: "complete",
          isPartial: false,
          presentLoops: [rMeta.loop.code, ...boundingBs.map((b) => b.loop.code)],
          missingLoop: null,
          looksLike: `Growth loop (${rMeta.loop.code}) meets multiple independent limits (${boundingBs.map((b) => b.loop.code).join(", ")}) at once.`,
          implication: "Easing one limit immediately activates another; explicit tradeoff selection is needed.",
          recommendation: "Decide explicitly which constraints bind first rather than spreading effort everywhere.",
          meadowsLevel: 6
        });
      }
    }

    if (boundingBs.length > 0) {
      add({
        id: `arch_limits_${rMeta.loop.code}_${boundingBs[0].loop.code}`,
        archetype: "limits_to_growth",
        name: "Limits to Growth",
        status: "complete",
        isPartial: false,
        presentLoops: [rMeta.loop.code, ...boundingBs.map((b) => b.loop.code)],
        missingLoop: null,
        looksLike: `Reinforcing growth (${rMeta.loop.code}) is slowed by balancing limit (${boundingBs.map((b) => b.loop.code).join(", ")}).`,
        implication: "Pushing harder on growth brings diminishing returns as the limit binds.",
        recommendation: "Expand or relieve the balancing constraint before saturation.",
        meadowsLevel: 6
      });
    } else if (!shiftingClaimedRIds.has(rMeta.loop.id) && !escalationRIds.has(rMeta.loop.id)) {
      add({
        id: `arch_limits_partial_${rMeta.loop.code}`,
        archetype: "limits_to_growth",
        name: "Limits to Growth",
        status: "partial",
        isPartial: true,
        presentLoops: [rMeta.loop.code],
        missingLoop: "Missing balancing constraint loop (B) naming what real-world ceiling or limit slows and stops this growth.",
        looksLike: `Reinforcing growth loop (${rMeta.loop.code}) grows unchecked with no bounding balancing limit.`,
        implication: "Without a balancing constraint, quantities may grow unrealistically over the horizon.",
        recommendation: "Add the real-world balancing limit that stops this growth.",
        meadowsLevel: 6
      });
    }
  }

  // 10. Policy Resistance & Delayed Oscillation
  const delayedB = balancing.filter((b) => b.loop.hasDelay);
  if (delayedB.length > 0) {
    add({
      id: `arch_policy_resistance_${delayedB[0].loop.code}`,
      archetype: "policy_resistance",
      name: "Policy Resistance & Delayed Oscillation",
      status: "complete",
      isPartial: false,
      presentLoops: delayedB.map((b) => b.loop.code),
      missingLoop: null,
      looksLike: `Balancing control (${delayedB.map((b) => b.loop.code).join(", ")}) includes response delays causing overshoot.`,
      implication: "Aggressive short-term corrections amplify oscillations.",
      recommendation: "Shorten reporting delays and pace policy adjustments using stock trends.",
      meadowsLevel: 8
    });
  } else {
    for (let i = 0; i < balancing.length; i++) {
      for (let j = i + 1; j < balancing.length; j++) {
        const bA = balancing[i];
        const bB = balancing[j];
        const key = pairKey(bA.loop.id, bB.loop.id);
        if (shiftingBPairs.has(key) || erodingPairs.has(key)) continue;
        const shared = intersectIds(bA.nodeSet, bB.nodeSet);
        if (shared.some((sid) => oppositeSignAtNode(bA, bB, sid))) {
          add({
            id: `arch_policy_resistance_partial_${bA.loop.code}_${bB.loop.code}`,
            archetype: "policy_resistance",
            name: "Policy Resistance & Delayed Oscillation",
            status: "partial",
            isPartial: true,
            presentLoops: [bA.loop.code, bB.loop.code],
            missingLoop: "Missing reporting or physical response delay on opposing balancing loops explaining why corrective pushes overshoot.",
            looksLike: `Opposing balancing loops (${bA.loop.code}, ${bB.loop.code}) pull ${factorLabels(shared, factorById)} oppositely without a delay.`,
            implication: "Competing adjustments resist change and risk oscillation once delayed.",
            recommendation: "Model response delays explicitly or align the opposing target loops.",
            meadowsLevel: 8
          });
        }
      }
    }
  }

  return out;
}

function formatLoopCensus(loops: FeedbackLoop[], loopType: "reinforcing" | "balancing"): string {
  const matching = loops.filter((l) => l.type === loopType);
  if (!matching.length) return "none";
  return matching
    .map((l) => {
      const startLabel = l.factors[0]?.symbol || l.factors[0]?.name || "";
      const chain = l.factors.length
        ? [...l.factors.map((f) => f.symbol || f.name), startLabel].join(" → ")
        : l.nodeIds.join(" → ");
      return `${l.code} (${chain})`;
    })
    .join("; ");
}

// The organization and model, sent once at the start of the conversation,
// after the cached instructions.
export function contextText(context: ModelContext): string {
  const { org } = context;
  const factorLines = context.factors.map(
    (f) =>
      `- ${f.symbol} = ${f.formula}` +
      ` (name: ${f.name}; unit: ${f.unit || "none"}${f.group ? `; group: ${f.group}` : ""})`
  );
  const loops = context.loops ?? detectFeedbackLoops(context.factors);
  const archetypes = detectSystemArchetypes(context.factors, loops);
  const unlinkedSymbols = context.factors
    .filter((f) => f.class === "unlinked")
    .map((f) => f.symbol || f.name)
    .filter(Boolean);

  const archetypeLines = archetypes.length
    ? archetypes.map(
        (a) =>
          `- [${a.status}] ${a.name} (${a.presentLoops.join(", ")}): ${a.looksLike} Implies: ${a.implication}${
            a.missingLoop ? ` Missing loop: ${a.missingLoop}` : ""
          }`
      )
    : ["none"];

  return [
    "# The organization",
    `Name: ${org.name}`,
    `Goal: ${org.goal || "(not given)"}`,
    `Type: ${org.orgType || "(not given)"}`,
    `Currency: ${org.currency}`,
    `Time step: ${context.timeStep}; the model is calculated ${context.horizon} ahead.`,
    "",
    "# The current model",
    ...factorLines,
    "",
    "# The model's loops",
    `Reinforcing: ${formatLoopCensus(loops, "reinforcing")}`,
    `Balancing: ${formatLoopCensus(loops, "balancing")}`,
    "",
    "# Factors that are not connected",
    unlinkedSymbols.length ? unlinkedSymbols.join(", ") : "none",
    "",
    "# System archetypes",
    ...archetypeLines
  ].join("\n");
}

export function repairText(errors: string[]): string {
  return [
    "Your previous draft could not be calculated. The calculation reported:",
    ...errors.map((e) => `- ${e}`),
    "Fix these problems and reply with the whole corrected draft."
  ].join("\n");
}

export const ACTION_DRAFT_SYSTEM_PROMPT = `You help organizations turn an action idea into a structured action proposal in mipa, a strategic coordination and simulation tool.

# What an Action in mipa is
An action is a specific initiative, project, or policy change the organization is considering.
To simulate how the action changes the organization's outcomes and leverage, mipa needs:
1. title: A clear, professional title for the action in the user's language.
2. summary: A concise 1-3 sentence summary of the action and its objective.
3. estEffortHrs: Estimated one-time labor hours needed to plan and execute this action. Be realistic and conservative.
4. effortReasoning: Plain-language explanation of how the hours were estimated (e.g., breakdown of tasks, team size, duration).
5. estSpending: Estimated one-time direct financial expense in the organization's currency needed for equipment, materials, vendors, etc.
6. spendingReasoning: Plain-language explanation of how the spending was estimated (e.g., component costs, contractor rates, benchmark figures).
7. currency: The organization's currency code.
8. impacts: A list of 1 to 5 impacts on existing factors in the organization's simulation model:
   - factorSymbol: The exact symbol of an existing factor in the model.
   - factorName: The plain-language name of that factor.
   - operation: One of "+", "-", "*", "/", "=". (For example, to decrease a cost factor, use "-" with the amount reduced; to increase a benefit, use "+").
   - operand: A number formatted as a string (e.g., "1500", "0.2").
   - durationType: "forever" (permanent effect), "just_once" (applies to one time step only), "for_period" (sustained for a given duration), or "with_half_life" (gradually fades with exponential half-life).
   - durationNumber: Number of time units if for_period or with_half_life, or null.
   - durationUnit: "days", "weeks", "months", "years" if for_period or with_half_life, or null.
   - thenText: A plain-language sentence explaining the specific effect on this factor.
   - source: The basis, benchmark, or assumption behind this estimate.
9. notes: Practical execution notes, risks, prerequisites, or caveats.

# Constraints and Style
- Factor matching: ONLY target factors that exist in the provided model list. Do not invent symbols that do not exist in the model.
- Plain language: Write in the language of the user's input (Traditional Chinese or English).
- Tone: Professional, elegant, and measured (用詞優雅、避免粗俗).
- Conservative estimates: Provide grounded, reasonable numbers with transparent reasoning.
- Return strictly a single valid JSON object adhering to the schema.`;

export function actionDraftUserPrompt(context: ModelContext, ideaText: string): string {
  const modelContextString = contextText(context);
  return [
    modelContextString,
    "",
    "# Action Idea to Expand",
    ideaText.trim(),
    "",
    "Propose a complete action proposal with estimated effort, spending, and impacts on the model factors listed above."
  ].join("\n");
}
