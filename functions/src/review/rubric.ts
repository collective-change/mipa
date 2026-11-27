// The published review rubric (MIPA-50, decision M-3).
//
// This file IS the methodology's scoring rule: the criteria, their weights,
// the tier thresholds and the method's limits. docs/methodology/review-
// methodology.md is checked against it by a test, so the published document
// cannot drift from what the code scores. Publishing the weights is what
// makes a review checkable rather than asserted - and also what makes it
// gameable, which is why the anti-gaming measures in assurance.ts are not
// optional.
//
// Any change to a weight, a threshold, a check or the judge prompt is a new
// methodology: bump METHODOLOGY_VERSION in provenance.ts.

import { METHODOLOGY_VERSION } from "./provenance";

export type CriterionId =
  | "recalculation"
  | "sourceTraceability"
  | "completeness"
  | "antiPatterns"
  | "robustness"
  | "internalConsistency";

export interface Criterion {
  id: CriterionId;
  weight: number; // points out of 100
  // "mechanical": computed by code from the dossier, same input same score.
  // "model": judged by the AI model named in the review's provenance.
  method: "mechanical" | "model";
  checks: string;
}

export const CRITERIA: readonly Criterion[] = Object.freeze([
  {
    id: "recalculation",
    weight: 25,
    method: "mechanical",
    checks:
      "Every ranked action's leverage is recomputed from its stored net benefit, total ROI and outstanding direct costs with Longecho's formula, and must match the published figure.",
  },
  {
    id: "sourceTraceability",
    weight: 20,
    method: "mechanical",
    checks: "Share of factors with a stated value that carry a source citation or citation URL.",
  },
  {
    id: "completeness",
    weight: 15,
    method: "mechanical",
    checks: "Share of factors with units and a description, and of actions with a stated direct cost.",
  },
  {
    id: "antiPatterns",
    weight: 15,
    method: "mechanical",
    checks:
      "The top-ranked action does not claim the top leverage band with deadweight, attribution and displacement all left at zero; no action claims positive leverage while every one of its impacts is zero; every outcome factor records a completed 'what else drives this?' pass (either adding a driver factor or recording 'no other significant factors, because ...' confirmed by the organisation). Each pattern found costs half the criterion.",
  },
  {
    id: "robustness",
    weight: 10,
    method: "mechanical",
    checks:
      "The top action's Monte Carlo probability of a positive outcome (full marks at 0.9 or more, none below 0.5, linear between), and the preferred action does not flip when low-confidence factor ranges are widened under sensitivity to ignorance.",
  },
  {
    id: "internalConsistency",
    weight: 15,
    method: "model",
    checks:
      "The model reads the dossier's descriptions, formulas and citations and judges whether they agree with each other and with the numbers.",
  },
]);

export type TierId = "tier1" | "tier2" | "tier3";

export interface Tier {
  id: TierId;
  minScore: number; // inclusive, out of 100
  // Criteria that must score in full for the tier, whatever the total.
  requiresFull: readonly CriterionId[];
}

// Ordered from highest to lowest. A dossier below tier1 carries no tier.
export const TIERS: readonly Tier[] = Object.freeze([
  { id: "tier3", minScore: 85, requiresFull: ["recalculation", "antiPatterns"] },
  { id: "tier2", minScore: 70, requiresFull: ["recalculation", "antiPatterns"] },
  { id: "tier1", minScore: 50, requiresFull: ["recalculation"] },
]);

// What the review cannot see. Published in the same document as the weights.
export const LIMITS: readonly string[] = Object.freeze([
  "The counterfactual itself: what would have happened without the action is declared by the organisation (or measured, where comparison data exists), never checked by the review.",
  "Whether a cited source actually says what the dossier says it does: the review checks that a citation is present and, through the model, that it is plausible; it does not fetch or read the source.",
  "Whether the model's structure is the right structure: the review checks the arithmetic follows from the stated formulas, not that the formulas describe the world.",
  "Anything not entered into Longecho: omitted factors, actions or side effects are invisible to every check.",
  "Whether a recorded omission reason is true in the world: the forced omission record requires every outcome factor either to add a driver or to state 'no other significant factors, because ...' in the published record (and rejects unconfirmed AI drafts), so an omission cannot stay silent; it cannot see factors the organisation and the review model both fail to name, or verify that a stated reason holds outside the dossier.",
  "Whether the right factors were marked low-confidence or whether the widened range covers the true ignorance: sensitivity to ignorance widens factors marked confidence 'low', flagged isEstimate (or described as an estimate), or carrying an unsourced stated value, and tests whether the preferred action flips under linear benefit scaling; it cannot see deep uncertainty on factors the organisation marked high-confidence with a citation, or non-linear structural tipping points outside the stated formulas.",
  "The model-judged criterion depends on the AI model named in the mark; another model may judge differently, which is why the model and methodology version are published with every review.",
]);

export const DISCLOSURE =
  "Longecho both supplies the modelling tool and runs this review: the operator is supplier and rater. The review is automated; no person reviewed this dossier.";

export const RUBRIC = Object.freeze({
  methodologyVersion: METHODOLOGY_VERSION,
  criteria: CRITERIA,
  tiers: TIERS,
  limits: LIMITS,
  disclosure: DISCLOSURE,
});

export function totalWeight(): number {
  return CRITERIA.reduce((s, c) => s + c.weight, 0);
}
