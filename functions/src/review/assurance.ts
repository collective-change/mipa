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

export interface ReviewFactor {
  id: string;
  name?: string;
  initialValue?: number | null;
  units?: string;
  description?: string;
  formula?: string;
  sourceCitation?: string;
  citationUrl?: string;
}

export interface ReviewAction {
  id: string;
  title?: string;
  marginalNetTotalBenefitNpv?: number | null;
  totalRoi?: number | null;
  outstandingDirectCosts?: number | null;
  actionLeverage?: number | null;
  deadweight?: number;
  attribution?: number;
  displacement?: number;
  impacts?: { operand?: number | null }[];
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
      text: `Top-ranked action "${top.title || top.id}" claims the top leverage band with deadweight, attribution and displacement all at zero.`,
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
  return { id: "antiPatterns", score: clamp01(1 - 0.5 * findings.length), findings };
}

function checkRobustness(input: ReviewInput): Omit<CriterionResult, "points"> {
  const p = input.robustness?.probabilityPositive;
  if (!isNum(p)) {
    return {
      id: "robustness",
      score: 0,
      findings: [{ criterion: "robustness", text: "No Monte Carlo result was published for the top action." }],
    };
  }
  const score = clamp01((p - 0.5) / 0.4);
  const findings: Finding[] =
    score < 1
      ? [{ criterion: "robustness", text: `The top action is positive in ${(p * 100).toFixed(0)}% of simulated runs.` }]
      : [];
  return { id: "robustness", score, findings };
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

export function scoreReview(results: Omit<CriterionResult, "points">[]): ReviewConclusion {
  const byId = new Map(results.map((r) => [r.id, r]));
  const criteria: CriterionResult[] = CRITERIA.map((c) => {
    const r = byId.get(c.id);
    if (!r) throw new ProvenanceError(`Criterion ${c.id} was not scored.`, "missing-field");
    const score = clamp01(Number.isFinite(r.score) ? r.score : 0);
    return { id: c.id, score, points: round2(score * c.weight), findings: r.findings };
  });
  const score = round2((criteria.reduce((s, c) => s + c.points, 0) * 100) / totalWeight());
  const full = (id: CriterionId) => criteria.find((c) => c.id === id)!.score === 1;
  const tier = TIERS.find((t) => score >= t.minScore && t.requiresFull.every(full))?.id ?? null;
  return { score, tier, criteria, findings: criteria.flatMap((c) => c.findings) };
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
    return { conclusion: scoreReview([...mech, ...modelResults]), resolvedModel: judged.resolvedModel };
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
    rereviews: mine.filter((e): e is ReReviewEvent => e.type === "rereview"),
    appeals: mine.filter((e): e is AppealEvent => e.type === "appeal"),
    disclosure: DISCLOSURE,
    limits: LIMITS,
  };
}
