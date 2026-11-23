// The automated review of a published dossier, and the anti-gaming measures
// that stop being optional once the rubric weights are public (MIPA-50, M-3).
//
//   (i)   each review's findings are published, not just a badge
//         (publicReviewLedger);
//   (ii)  a random sample is re-reviewed and a downgrade is published
//         (selectForReReview, reReviewEvent, effectiveTier);
//   (iii) an organisation may appeal and the appeal is published verbatim,
//         with no adjudication (appealEvent);
//   (iv)  model and methodology versions are published with every review
//         (MIPA-43's provenance, carried on every record and ledger);
//   (v)   the operator discloses that it is both supplier and rater
//         (DISCLOSURE on every ledger).
//
// A tier exists only as the output of scoreReview over the published rubric.
// There is no function, field or rule through which a tier can be set by
// hand: browsers cannot write reviews (firestore.rules), and effectiveTier
// can only lower a stored tier, never raise it.

import {
  ReviewRecord,
  ReviewStore,
  Reviewer,
  ReviewerCallSettings,
  runReview,
  verifyReproduction,
  sha256,
  ProvenanceError,
} from "./provenance";
import { CRITERIA, TIERS, DISCLOSURE, LIMITS, CriterionId, TierId, totalWeight } from "./rubric";

// ---------------------------------------------------------------------------
// What the review reads: a projection of the published dossier.

export type FactorConfidence = "low" | "medium" | "high";

export interface OmissionRecord {
  addedFactorIds?: string[];
  statement?: string;
  draftedByAi?: boolean;
  confirmed?: boolean;
  discardable?: boolean;
}

export interface RecordedOmission {
  factorId: string;
  factorName: string;
  status: "added-driver" | "stated-omission" | "missing" | "unconfirmed-ai-draft" | "flagged";
  addedFactorIds?: string[];
  statement?: string;
}

export interface IgnoranceFlip {
  factorId: string;
  factorName: string;
  baseValue: number;
  widenedMin: number;
  widenedMax: number;
  turningPoint: number | null;
  percentShift: number | null;
  fromActionId: string;
  fromActionTitle: string;
  toActionId: string;
  toActionTitle: string;
  assumption: string;
}

export interface DecisionSupportAssessment {
  supportsDecision: boolean;
  verdict: string;
  flippingAssumptions: IgnoranceFlip[];
}

export interface ReviewFactor {
  id: string;
  symbol?: string;
  name?: string;
  initialValue?: number | null;
  units?: string;
  description?: string;
  notes?: string;
  formula?: string;
  sourceCitation?: string;
  citationUrl?: string;
  confidence?: FactorConfidence;
  isEstimate?: boolean;
  isOutcome?: boolean;
  omissionRecord?: OmissionRecord | string | null;
  omissionFlagged?: boolean;
  affectedActionIds?: string[];
  lowConfidenceDeltaPercent?: number;
}

export interface ReviewAction {
  id: string;
  title?: string;
  marginalNetTotalBenefitNpv?: number | null;
  marginalTotalBenefitNpv?: number | null;
  marginalTotalCostNpv?: number | null;
  totalRoi?: number | null;
  outstandingDirectCosts?: number | null;
  actionLeverage?: number | null;
  deadweight?: number;
  attribution?: number;
  displacement?: number;
  impacts?: { nodeId?: string; symbol?: string; operand?: number | null }[];
}

export interface ReviewInput {
  modelId: string;
  factors: ReviewFactor[];
  actions: ReviewAction[];
  robustness?: { probabilityPositive: number } | null;
}

export interface Finding {
  criterion: CriterionId;
  subject?: string; // factor or action id
  code?: "omission-record" | "ignorance-flip";
  text: string;
}

export interface CriterionResult {
  id: CriterionId;
  score: number; // 0..1
  points: number; // score * weight, rounded to 0.01
  findings: Finding[];
}

export interface ReviewConclusion {
  score: number; // 0..100
  tier: TierId | null;
  criteria: CriterionResult[];
  findings: Finding[];
  omissionRecords: RecordedOmission[];
  decisionSupport: DecisionSupportAssessment;
}

// The model-judged criteria. The real judge calls the organisation's provider
// with the settings it is given; tests inject a fake.
export type Judge = (
  input: ReviewInput,
  settings: ReviewerCallSettings
) => Promise<{
  scores: Partial<Record<CriterionId, number>>;
  findings: Finding[];
  resolvedModel?: string | null;
}>;

// ---------------------------------------------------------------------------
// Mechanical checks.

const REL_TOL = 1e-6;

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= REL_TOL * Math.max(1, Math.abs(a), Math.abs(b));
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const hasText = (v: unknown) => typeof v === "string" && v.trim().length > 0;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// mipa's leverage formula (calcWorker.js): sign(net) * net * ROI / C, null
// when C <= 0.
export function recomputeLeverage(a: ReviewAction): number | null {
  const net = a.marginalNetTotalBenefitNpv;
  const roi = a.totalRoi;
  const c = a.outstandingDirectCosts;
  if (!isNum(net) || !isNum(roi) || !isNum(c) || c <= 0) return null;
  const lev = ((net * roi) / c) * Math.sign(net);
  return Number.isFinite(lev) ? lev : null;
}

function checkRecalculation(input: ReviewInput): Omit<CriterionResult, "points"> {
  const findings: Finding[] = [];
  const claimed = input.actions.filter((a) => a.actionLeverage !== undefined);
  for (const a of claimed) {
    const expected = recomputeLeverage(a);
    const stated = a.actionLeverage ?? null;
    const ok = expected === null ? stated === null : isNum(stated) && nearlyEqual(stated, expected);
    if (!ok) {
      findings.push({
        criterion: "recalculation",
        subject: a.id,
        text: `Stated leverage ${stated} does not reproduce; recomputed ${expected}.`,
      });
    }
  }
  const score = claimed.length === 0 ? 0 : (claimed.length - findings.length) / claimed.length;
  if (claimed.length === 0) {
    findings.push({ criterion: "recalculation", text: "No action states a leverage, so nothing can be recomputed." });
  }
  return { id: "recalculation", score, findings };
}

function checkSourceTraceability(input: ReviewInput): Omit<CriterionResult, "points"> {
  const valued = input.factors.filter((f) => isNum(f.initialValue) && !hasText(f.formula));
  const findings: Finding[] = valued
    .filter((f) => !hasText(f.sourceCitation) && !hasText(f.citationUrl))
    .map((f) => ({ criterion: "sourceTraceability" as const, subject: f.id, text: `Factor "${f.name || f.id}" states a value with no source.` }));
  const score = valued.length === 0 ? 1 : (valued.length - findings.length) / valued.length;
  return { id: "sourceTraceability", score, findings };
}

function checkCompleteness(input: ReviewInput): Omit<CriterionResult, "points"> {
  const findings: Finding[] = [];
  let checks = 0;
  let passed = 0;
  for (const f of input.factors) {
    checks += 2;
    if (hasText(f.units)) passed++;
    else findings.push({ criterion: "completeness", subject: f.id, text: `Factor "${f.name || f.id}" has no units.` });
    if (hasText(f.description)) passed++;
    else findings.push({ criterion: "completeness", subject: f.id, text: `Factor "${f.name || f.id}" has no description.` });
  }
  for (const a of input.actions) {
    checks++;
    if (isNum(a.outstandingDirectCosts)) passed++;
    else findings.push({ criterion: "completeness", subject: a.id, text: `Action "${a.title || a.id}" states no direct cost.` });
  }
  return { id: "completeness", score: checks === 0 ? 0 : passed / checks, findings };
}

export const LOW_CONFIDENCE_DELTA_PERCENT = 0.75;

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const OMISSION_STATEMENT_PATTERN = /^\s*no other significant factors\s*,\s*because\s+(.+?)\s*$/is;
const PLACEHOLDER_REASON_PATTERN = /^(_+|\.+|-+|tbd|n\/a|none|\?+)$/i;
const DEFAULT_SUPPORTED_VERDICT = "Decision supported under widened low-confidence factor ranges.";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formulaReferencesFactor(formula: string | undefined, factor: ReviewFactor): boolean {
  if (!hasText(formula)) return false;
  const tokens = [factor.id, factor.symbol, factor.name]
    .filter((t): t is string => hasText(t))
    .map((t) => t.trim())
    .filter((t, idx, arr) => IDENTIFIER_PATTERN.test(t) && arr.indexOf(t) === idx);
  for (const token of tokens) {
    const pattern = new RegExp(`(^|[^A-Za-z0-9_$])\\$?${escapeRegExp(token)}([^A-Za-z0-9_]|$)`);
    if (pattern.test(formula!)) return true;
  }
  return false;
}

export function isOutcomeFactor(factor: ReviewFactor, allFactors: readonly ReviewFactor[]): boolean {
  if (factor.isOutcome === true) return true;
  if (factor.isOutcome === false) return false;
  if (!hasText(factor.formula)) return false;
  return !allFactors.some((other) => other.id !== factor.id && formulaReferencesFactor(other.formula, factor));
}

export function elicitOmissionFollowUp(factor: ReviewFactor): string {
  const label = factor.name || factor.id;
  return `What else drives "${label}"? Add the missing driver factor, or state: no other significant factors, because <reason>.`;
}

export function draftUnconfirmedOmissionRecord(reason: string): OmissionRecord {
  return {
    statement: `no other significant factors, because ${reason.trim()}`,
    draftedByAi: true,
    confirmed: false,
    discardable: true,
  };
}

export function discardAiOmissionDraft(draft?: OmissionRecord | string | null): null {
  return draft === undefined ? null : null;
}

export function checkOmissionRecords(input: ReviewInput): {
  findings: Finding[];
  omissionRecords: RecordedOmission[];
} {
  const findings: Finding[] = [];
  const omissionRecords: RecordedOmission[] = [];
  const factorById = new Map(input.factors.map((f) => [f.id, f]));

  for (const factor of input.factors) {
    if (!isOutcomeFactor(factor, input.factors)) continue;
    const label = factor.name || factor.id;

    if (factor.omissionFlagged === true) {
      omissionRecords.push({ factorId: factor.id, factorName: label, status: "flagged" });
      findings.push({
        criterion: "antiPatterns",
        subject: factor.id,
        code: "omission-record",
        text: `Outcome factor "${label}" was flagged for an unaddressed omission; resolve or record a reason after "what else drives this?".`,
      });
      continue;
    }

    const raw = factor.omissionRecord;
    const record: OmissionRecord | null =
      typeof raw === "string" ? { statement: raw } : raw && typeof raw === "object" ? raw : null;

    if (!record) {
      omissionRecords.push({ factorId: factor.id, factorName: label, status: "missing" });
      findings.push({
        criterion: "antiPatterns",
        subject: factor.id,
        code: "omission-record",
        text: `Outcome factor "${label}" has no forced omission record. Complete one "what else drives this?" pass: add a factor or record "no other significant factors, because ...".`,
      });
      continue;
    }

    if (record.draftedByAi === true && record.confirmed !== true) {
      omissionRecords.push({
        factorId: factor.id,
        factorName: label,
        status: "unconfirmed-ai-draft",
        statement: record.statement,
      });
      findings.push({
        criterion: "antiPatterns",
        subject: factor.id,
        code: "omission-record",
        text: `Outcome factor "${label}" has an unconfirmed AI omission draft; confirm it or discard it and record the organisation's own reason.`,
      });
      continue;
    }

    const validAddedIds = (record.addedFactorIds || []).filter((id) => {
      if (id === factor.id) return false;
      const added = factorById.get(id);
      if (!added) return false;
      return !hasText(factor.formula) || formulaReferencesFactor(factor.formula, added);
    });

    if (validAddedIds.length > 0) {
      omissionRecords.push({
        factorId: factor.id,
        factorName: label,
        status: "added-driver",
        addedFactorIds: validAddedIds,
        statement: hasText(record.statement) ? record.statement!.trim() : undefined,
      });
      continue;
    }

    const match = typeof record.statement === "string" ? OMISSION_STATEMENT_PATTERN.exec(record.statement) : null;
    const reason = match?.[1]?.trim() ?? "";
    if (reason.length >= 10 && !PLACEHOLDER_REASON_PATTERN.test(reason)) {
      omissionRecords.push({
        factorId: factor.id,
        factorName: label,
        status: "stated-omission",
        statement: record.statement!.trim(),
      });
      continue;
    }

    omissionRecords.push({
      factorId: factor.id,
      factorName: label,
      status: "missing",
      statement: typeof record.statement === "string" ? record.statement : undefined,
    });
    findings.push({
      criterion: "antiPatterns",
      subject: factor.id,
      code: "omission-record",
      text: elicitOmissionFollowUp(factor),
    });
  }

  return { findings, omissionRecords };
}

export function isLowConfidenceFactor(factor: ReviewFactor): boolean {
  if (factor.confidence === "low") return true;
  if (factor.confidence === "high" || factor.confidence === "medium") return false;
  if (factor.isEstimate === true) return true;
  if (/\bestimate\b/i.test(`${factor.notes || ""} ${factor.description || ""}`)) return true;
  // An unsourced non-formula numerical assumption is treated as low-confidence unless marked otherwise.
  return (
    factor.isEstimate !== false &&
    isNum(factor.initialValue) &&
    !hasText(factor.formula) &&
    !hasText(factor.sourceCitation) &&
    !hasText(factor.citationUrl)
  );
}

function actionReferencesFactor(action: ReviewAction, factor: ReviewFactor): boolean {
  return Boolean(
    action.impacts?.some(
      (imp) => imp.nodeId === factor.id || (hasText(factor.symbol) && imp.symbol === factor.symbol)
    )
  );
}

function factorAppliesToAction(
  action: ReviewAction,
  factor: ReviewFactor,
  allActions: readonly ReviewAction[]
): boolean {
  if (Array.isArray(factor.affectedActionIds)) {
    return factor.affectedActionIds.includes(action.id);
  }
  const taggedActions = allActions.filter((a) => actionReferencesFactor(a, factor));
  if (taggedActions.length > 0) {
    return actionReferencesFactor(action, factor);
  }
  return true;
}

function evaluateFactorPerturbedLeverage(
  action: ReviewAction,
  factor: ReviewFactor,
  testValue: number,
  baseValue: number,
  allActions: readonly ReviewAction[]
): number {
  const baseLev = isNum(action.actionLeverage) ? action.actionLeverage : (recomputeLeverage(action) ?? 0);
  if (!factorAppliesToAction(action, factor, allActions) || baseValue === 0) return baseLev;
  const c = action.outstandingDirectCosts;
  const netBase = action.marginalNetTotalBenefitNpv;
  if (!isNum(c) || c <= 0 || !isNum(netBase)) return baseLev;

  let totalCost: number;
  if (isNum(action.marginalTotalCostNpv)) {
    totalCost = action.marginalTotalCostNpv;
  } else if (isNum(action.totalRoi) && Math.abs(action.totalRoi) > 1e-9) {
    totalCost = Math.abs(netBase / action.totalRoi);
  } else {
    totalCost = c;
  }

  const totalBenefitBase = isNum(action.marginalTotalBenefitNpv) ? action.marginalTotalBenefitNpv : netBase + totalCost;
  const ratio = testValue / baseValue;
  const perturbedBenefit = totalBenefitBase * ratio;
  const net = perturbedBenefit - totalCost;
  const roi = totalCost > 0 ? net / totalCost : (action.totalRoi ?? 0);
  const lev = ((net * roi) / c) * Math.sign(net);
  return Number.isFinite(lev) ? lev : 0;
}

function bisectTurningPoint(
  top: ReviewAction,
  challenger: ReviewAction,
  factor: ReviewFactor,
  baseValue: number,
  edgeValue: number,
  allActions: readonly ReviewAction[]
): number {
  let stay = baseValue;
  let flip = edgeValue;
  for (let i = 0; i < 32; i++) {
    const mid = (stay + flip) / 2;
    const diff =
      evaluateFactorPerturbedLeverage(top, factor, mid, baseValue, allActions) -
      evaluateFactorPerturbedLeverage(challenger, factor, mid, baseValue, allActions);
    if (diff < 0) {
      flip = mid;
    } else {
      stay = mid;
    }
  }
  return flip;
}

export function checkIgnoranceSensitivity(input: ReviewInput): {
  decisionSupport: DecisionSupportAssessment;
  findings: Finding[];
} {
  const ranked = input.actions
    .map((a) => ({
      action: a,
      lev: isNum(a.actionLeverage) ? a.actionLeverage : recomputeLeverage(a),
    }))
    .filter((entry): entry is { action: ReviewAction; lev: number } => isNum(entry.lev) && isNum(entry.action.outstandingDirectCosts) && entry.action.outstandingDirectCosts > 0)
    .sort((x, y) => y.lev - x.lev);

  if (ranked.length < 2 || ranked[0].lev <= 0) {
    return {
      decisionSupport: {
        supportsDecision: true,
        verdict: DEFAULT_SUPPORTED_VERDICT,
        flippingAssumptions: [],
      },
      findings: [],
    };
  }

  const top = ranked[0].action;
  const topTitle = top.title || top.id;
  const flippingAssumptions: IgnoranceFlip[] = [];
  const findings: Finding[] = [];

  for (const factor of input.factors) {
    if (!isLowConfidenceFactor(factor)) continue;
    const baseValue = factor.initialValue;
    if (!isNum(baseValue) || baseValue === 0 || hasText(factor.formula)) continue;

    const delta =
      isNum(factor.lowConfidenceDeltaPercent) && factor.lowConfidenceDeltaPercent > 0
        ? factor.lowConfidenceDeltaPercent
        : LOW_CONFIDENCE_DELTA_PERCENT;
    const valLow = baseValue * (1 - delta);
    const valHigh = baseValue * (1 + delta);
    const widenedMin = Math.min(valLow, valHigh);
    const widenedMax = Math.max(valLow, valHigh);
    const factorName = factor.name || factor.id;

    let chosenFlip: IgnoranceFlip | null = null;
    for (const challengerEntry of ranked.slice(1)) {
      const challenger = challengerEntry.action;
      const baseDiff = ranked[0].lev - challengerEntry.lev;
      if (baseDiff <= 1e-9) continue;

      const diffLow =
        evaluateFactorPerturbedLeverage(top, factor, valLow, baseValue, input.actions) -
        evaluateFactorPerturbedLeverage(challenger, factor, valLow, baseValue, input.actions);
      const diffHigh =
        evaluateFactorPerturbedLeverage(top, factor, valHigh, baseValue, input.actions) -
        evaluateFactorPerturbedLeverage(challenger, factor, valHigh, baseValue, input.actions);

      const candidates: number[] = [];
      if (diffLow < 0) {
        candidates.push(bisectTurningPoint(top, challenger, factor, baseValue, valLow, input.actions));
      }
      if (diffHigh < 0) {
        candidates.push(bisectTurningPoint(top, challenger, factor, baseValue, valHigh, input.actions));
      }
      if (candidates.length === 0) continue;

      candidates.sort((a, b) => Math.abs(a - baseValue) - Math.abs(b - baseValue));
      const tp = Math.round(candidates[0] * 1000) / 1000;
      const shift = Math.round((((candidates[0] - baseValue) / baseValue) * 100) * 10) / 10;
      const challengerTitle = challenger.title || challenger.id;
      const assumption = `Assumption "${factorName}" (base ${baseValue}, widened ±${Math.round(delta * 100)}% to [${round2(widenedMin)}, ${round2(widenedMax)}]) flips preferred action from "${topTitle}" to "${challengerTitle}" past ${tp} (${shift >= 0 ? "+" : ""}${shift}%).`;

      const candidateFlip: IgnoranceFlip = {
        factorId: factor.id,
        factorName,
        baseValue,
        widenedMin: round2(widenedMin),
        widenedMax: round2(widenedMax),
        turningPoint: tp,
        percentShift: shift,
        fromActionId: top.id,
        fromActionTitle: topTitle,
        toActionId: challenger.id,
        toActionTitle: challengerTitle,
        assumption,
      };
      if (
        !chosenFlip ||
        Math.abs(candidateFlip.percentShift ?? Infinity) < Math.abs(chosenFlip.percentShift ?? Infinity)
      ) {
        chosenFlip = candidateFlip;
      }
    }

    if (chosenFlip) {
      flippingAssumptions.push(chosenFlip);
      findings.push({
        criterion: "robustness",
        subject: factor.id,
        code: "ignorance-flip",
        text: `This model does not support this decision: ${chosenFlip.assumption}`,
      });
    }
  }

  const supportsDecision = flippingAssumptions.length === 0;
  const verdict = supportsDecision
    ? DEFAULT_SUPPORTED_VERDICT
    : `This model does not support this decision: ${flippingAssumptions.map((f) => f.assumption).join(" ")}`;

  return {
    decisionSupport: { supportsDecision, verdict, flippingAssumptions },
    findings,
  };
}

const omissionCache = new WeakMap<object, RecordedOmission[]>();
const decisionCache = new WeakMap<object, DecisionSupportAssessment>();

function checkAntiPatterns(input: ReviewInput): Omit<CriterionResult, "points"> {
  const findings: Finding[] = [];
  const ranked = [...input.actions]
    .filter((a) => isNum(a.actionLeverage))
    .sort((x, y) => (y.actionLeverage as number) - (x.actionLeverage as number));
  const top = ranked[0];
  if (top && (top.actionLeverage as number) > 0 && !top.deadweight && !top.attribution && !top.displacement) {
    findings.push({
      criterion: "antiPatterns",
      subject: top.id,
      text: `Top-ranked action "${top.title || top.id}" claims the top leverage band with deadweight, attribution and displacement all left at zero.`,
    });
  }
  for (const a of input.actions) {
    const impacts = a.impacts || [];
    if (isNum(a.actionLeverage) && a.actionLeverage > 0 && impacts.length > 0 && impacts.every((i) => !i.operand)) {
      findings.push({
        criterion: "antiPatterns",
        subject: a.id,
        text: `Action "${a.title || a.id}" claims positive leverage while every impact is zero.`,
      });
    }
  }
  const omissionCheck = checkOmissionRecords(input);
  findings.push(...omissionCheck.findings);

  const result: Omit<CriterionResult, "points"> = {
    id: "antiPatterns",
    score: clamp01(1 - 0.5 * findings.length),
    findings,
  };
  omissionCache.set(result, omissionCheck.omissionRecords);
  return result;
}

function checkRobustness(input: ReviewInput): Omit<CriterionResult, "points"> {
  const ignorance = checkIgnoranceSensitivity(input);
  const p = input.robustness?.probabilityPositive;
  if (!isNum(p)) {
    const result: Omit<CriterionResult, "points"> = {
      id: "robustness",
      score: 0,
      findings: [
        { criterion: "robustness", text: "No Monte Carlo result was published for the top action." },
        ...ignorance.findings,
      ],
    };
    decisionCache.set(result, ignorance.decisionSupport);
    return result;
  }
  const baseScore = clamp01((p - 0.5) / 0.4);
  const findings: Finding[] =
    baseScore < 1
      ? [{ criterion: "robustness", text: `The top action is positive in ${(p * 100).toFixed(0)}% of simulated runs.` }]
      : [];
  findings.push(...ignorance.findings);
  const score = ignorance.decisionSupport.supportsDecision ? baseScore : 0;
  const result: Omit<CriterionResult, "points"> = { id: "robustness", score, findings };
  decisionCache.set(result, ignorance.decisionSupport);
  return result;
}

export function mechanicalChecks(input: ReviewInput): Omit<CriterionResult, "points">[] {
  return [
    checkRecalculation(input),
    checkSourceTraceability(input),
    checkCompleteness(input),
    checkAntiPatterns(input),
    checkRobustness(input),
  ];
}

// ---------------------------------------------------------------------------
// Scoring: the only path to a tier.

const round2 = (x: number) => Math.round(x * 100) / 100;

export function scoreReview(
  results: Omit<CriterionResult, "points">[],
  meta?: {
    omissionRecords?: RecordedOmission[];
    decisionSupport?: DecisionSupportAssessment;
  }
): ReviewConclusion {
  const byId = new Map(results.map((r) => [r.id, r]));
  const criteria: CriterionResult[] = CRITERIA.map((c) => {
    const r = byId.get(c.id);
    if (!r) throw new ProvenanceError(`Criterion ${c.id} was not scored.`, "missing-field");
    const score = clamp01(Number.isFinite(r.score) ? r.score : 0);
    return { id: c.id, score, points: round2(score * c.weight), findings: r.findings };
  });
  const score = round2((criteria.reduce((s, c) => s + c.points, 0) * 100) / totalWeight());
  const findings = criteria.flatMap((c) => c.findings);
  const full = (id: CriterionId) => criteria.find((c) => c.id === id)!.score === 1;
  const blockedFromUpperTiers = findings.some(
    (f) => f.code === "omission-record" || f.code === "ignorance-flip"
  );
  const tier =
    TIERS.find(
      (t) =>
        score >= t.minScore &&
        t.requiresFull.every(full) &&
        !(blockedFromUpperTiers && (t.id === "tier2" || t.id === "tier3"))
    )?.id ?? null;

  const antiResult = byId.get("antiPatterns");
  const robResult = byId.get("robustness");
  const omissionRecords =
    meta?.omissionRecords ?? (antiResult ? omissionCache.get(antiResult) : undefined) ?? [];
  const decisionSupport =
    meta?.decisionSupport ??
    (robResult ? decisionCache.get(robResult) : undefined) ?? {
      supportsDecision: !findings.some((f) => f.code === "ignorance-flip"),
      verdict: findings.some((f) => f.code === "ignorance-flip")
        ? findings
            .filter((f) => f.code === "ignorance-flip")
            .map((f) => f.text)
            .join(" ")
        : DEFAULT_SUPPORTED_VERDICT,
      flippingAssumptions: [],
    };

  return { score, tier, criteria, findings, omissionRecords, decisionSupport };
}

export function dossierReviewer(judge: Judge): Reviewer<ReviewInput, ReviewConclusion> {
  return async (input, settings) => {
    const mech = mechanicalChecks(input);
    const judged = await judge(input, settings);
    const modelResults = CRITERIA.filter((c) => c.method === "model").map((c) => ({
      id: c.id,
      score: judged.scores[c.id] ?? 0,
      findings: judged.findings.filter((f) => f.criterion === c.id),
    }));
    const conclusion = scoreReview([...mech, ...modelResults], {
      omissionRecords: checkOmissionRecords(input).omissionRecords,
      decisionSupport: checkIgnoranceSensitivity(input).decisionSupport,
    });
    return { conclusion, resolvedModel: judged.resolvedModel };
  };
}

export async function reviewDossier(
  deps: { judge: Judge; store: ReviewStore<ReviewConclusion>; now?: () => Date },
  args: { input: ReviewInput; provider: string; model: string; methodologyVersion?: string }
) {
  return runReview({ reviewer: dossierReviewer(deps.judge), store: deps.store, now: deps.now }, args);
}

// ---------------------------------------------------------------------------
// (ii) Random-sample re-review with public downgrades.

// Deterministic given the seed (e.g. the month), so the sample itself can be
// published and checked: a review is sampled iff hash(seed, key) < rate.
export function selectForReReview(keys: string[], rate: number, seed: string): string[] {
  const r = clamp01(rate);
  return keys.filter((k) => parseInt(sha256(`${seed}\n${k}`).slice(0, 8), 16) / 0x100000000 < r);
}

const TIER_RANK: Record<TierId, number> = { tier1: 1, tier2: 2, tier3: 3 };
const rank = (t: TierId | null) => (t ? TIER_RANK[t] : 0);

export interface ReReviewEvent {
  type: "rereview";
  reviewKey: string;
  at: string;
  seed: string;
  reproduced: boolean;
  fromTier: TierId | null;
  toTier: TierId | null;
  downgraded: boolean;
}

export async function reReviewEvent(
  record: ReviewRecord<ReviewConclusion>,
  input: ReviewInput,
  judge: Judge,
  opts: { seed: string; at: Date }
): Promise<ReReviewEvent> {
  const reviewer = dossierReviewer(judge);
  let rerun: ReviewConclusion | null = null;
  const capture: Reviewer<ReviewInput, ReviewConclusion> = async (i, s) => {
    const out = await reviewer(i, s);
    rerun = out.conclusion;
    return out;
  };
  const check = await verifyReproduction(record, input, capture);
  const fromTier = record.conclusion.tier;
  // An input that no longer matches the reviewed dossier cannot keep its tier.
  const rerunTier: TierId | null = check.inputMatches ? (rerun as ReviewConclusion | null)?.tier ?? null : null;
  const toTier = rank(rerunTier) < rank(fromTier) ? rerunTier : fromTier;
  return {
    type: "rereview",
    reviewKey: record.reproducibilityKey,
    at: opts.at.toISOString(),
    seed: opts.seed,
    reproduced: check.reproduced,
    fromTier,
    toTier,
    downgraded: rank(toTier) < rank(fromTier),
  };
}

// ---------------------------------------------------------------------------
// (iii) Appeals: published verbatim, never adjudicated, never change a tier.

export const APPEAL_MAX_LENGTH = 5000;

export interface AppealEvent {
  type: "appeal";
  reviewKey: string;
  at: string;
  submittedBy: string;
  text: string;
}

export function appealEvent(args: { reviewKey: string; text: string; submittedBy: string; at: Date }): AppealEvent {
  if (typeof args.text !== "string" || !args.text.trim()) {
    throw new ProvenanceError("An appeal needs text.", "missing-field");
  }
  if (args.text.length > APPEAL_MAX_LENGTH) {
    throw new ProvenanceError(`An appeal is at most ${APPEAL_MAX_LENGTH} characters.`, "invalid-field");
  }
  if (!args.submittedBy) throw new ProvenanceError("An appeal names who submitted it.", "missing-field");
  return { type: "appeal", reviewKey: args.reviewKey, at: args.at.toISOString(), submittedBy: args.submittedBy, text: args.text };
}

export type ReviewEvent = ReReviewEvent | AppealEvent;

// The tier a dossier may display: the stored tier, lowered by any published
// downgrade. Nothing can raise it; appeals do not touch it.
export function effectiveTier(record: ReviewRecord<ReviewConclusion>, events: ReviewEvent[]): TierId | null {
  let tier = record.conclusion.tier;
  for (const e of events) {
    if (e.type === "rereview" && e.reviewKey === record.reproducibilityKey && rank(e.toTier) < rank(tier)) {
      tier = e.toTier;
    }
  }
  return tier;
}

// ---------------------------------------------------------------------------
// (i)+(iv)+(v) What is published with every reviewed dossier.

export interface PublicReviewLedger {
  provenance: ReviewRecord<ReviewConclusion>["provenance"];
  inputHash: string;
  reviewKey: string;
  score: number;
  storedTier: TierId | null;
  tier: TierId | null;
  criteria: CriterionResult[];
  findings: Finding[];
  omissionRecords: RecordedOmission[];
  decisionSupport: DecisionSupportAssessment;
  rereviews: ReReviewEvent[];
  appeals: AppealEvent[];
  disclosure: string;
  limits: readonly string[];
}

export function publicReviewLedger(record: ReviewRecord<ReviewConclusion>, events: ReviewEvent[] = []): PublicReviewLedger {
  const mine = events.filter((e) => e.reviewKey === record.reproducibilityKey);
  return {
    provenance: record.provenance,
    inputHash: record.inputHash,
    reviewKey: record.reproducibilityKey,
    score: record.conclusion.score,
    storedTier: record.conclusion.tier,
    tier: effectiveTier(record, mine),
    criteria: record.conclusion.criteria,
    findings: record.conclusion.findings,
    omissionRecords: record.conclusion.omissionRecords ?? [],
    decisionSupport: record.conclusion.decisionSupport ?? {
      supportsDecision: true,
      verdict: DEFAULT_SUPPORTED_VERDICT,
      flippingAssumptions: [],
    },
    rereviews: mine.filter((e): e is ReReviewEvent => e.type === "rereview"),
    appeals: mine.filter((e): e is AppealEvent => e.type === "appeal"),
    disclosure: DISCLOSURE,
    limits: LIMITS,
  };
}
