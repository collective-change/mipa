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
  const unlinkedSymbols = context.factors
    .filter((f) => f.class === "unlinked")
    .map((f) => f.symbol || f.name)
    .filter(Boolean);

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
    unlinkedSymbols.length ? unlinkedSymbols.join(", ") : "none"
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
