# Longecho review methodology v1.1.0

This is the published method by which Longecho's automated review scores a dossier. It includes
**the weights**: anyone can recompute a published score from the published findings. The
scoring code is `functions/src/review/rubric.ts`; a test fails if this document and the code
disagree.

> [!IMPORTANT]
> **The review is automated. No person reviews any dossier.** Longecho both supplies the modelling
> tool and runs this review: the operator is supplier and rater. A tier is evidence that a dossier
> passed the checks below. It is **not** assurance that the dossier's claims about the world are
> true.

## What a reviewed dossier carries

Every review stores, and every published dossier shows:

- the **methodology version** (this document's version), the **provider** and the **exact model
  identifier**, and the **date** - the mark reads *"Checked against Longecho methodology vX by model Y
  (provider) on date Z"*, generated from the stored record, never typed;
- the **score**, the **tier** if one was earned, and **every finding** - not just a badge;
- every **re-review** of it and every **appeal** against it.

## Criteria and weights

| Criterion | Weight | Method | What it checks |
| --- | --- | --- | --- |
| recalculation | 25 | mechanical | Every ranked action's leverage is recomputed from its stored net benefit, total ROI and outstanding direct costs with Longecho's formula, and must match the published figure. |
| sourceTraceability | 20 | mechanical | Share of factors with a stated value that carry a source citation or citation URL. |
| completeness | 15 | mechanical | Share of factors with units and a description, and of actions with a stated direct cost. |
| antiPatterns | 15 | mechanical | The top-ranked action does not claim the top leverage band with deadweight, attribution and displacement all left at zero; no action claims positive leverage while every one of its impacts is zero; every outcome factor records a completed 'what else drives this?' pass (either adding a driver factor or recording 'no other significant factors, because ...' confirmed by the organisation). Each pattern found costs half the criterion. |
| robustness | 10 | mechanical | The top action's Monte Carlo probability of a positive outcome (full marks at 0.9 or more, none below 0.5, linear between), and the preferred action does not flip when low-confidence factor ranges are widened under sensitivity to ignorance. |
| internalConsistency | 15 | model | The model reads the dossier's descriptions, formulas and citations and judges whether they agree with each other and with the numbers. |

*Mechanical* criteria are computed by code: the same dossier always gets the same score.
The *model* criterion is judged by the AI model named in the mark, at temperature 0.

Score = sum over criteria of (criterion score 0-1 x weight), out of 100.

## Tiers

| Tier | Minimum score | Criteria that must score in full |
| --- | --- | --- |
| tier3 | 85 | recalculation, antiPatterns |
| tier2 | 70 | recalculation, antiPatterns |
| tier1 | 50 | recalculation |

Below tier1 a dossier carries no tier. A tier is shown only when the published rubric earned
it; there is no manual override.

## What the review cannot see

- The counterfactual itself: what would have happened without the action is declared by the organisation (or measured, where comparison data exists), never checked by the review.
- Whether a cited source actually says what the dossier says it does: the review checks that a citation is present and, through the model, that it is plausible; it does not fetch or read the source.
- Whether the model's structure is the right structure: the review checks the arithmetic follows from the stated formulas, not that the formulas describe the world.
- Anything not entered into Longecho: omitted factors, actions or side effects are invisible to every check.
- Whether a recorded omission reason is true in the world: the forced omission record requires every outcome factor either to add a driver or to state 'no other significant factors, because ...' in the published record (and rejects unconfirmed AI drafts), so an omission cannot stay silent; it cannot see factors the organisation and the review model both fail to name, or verify that a stated reason holds outside the dossier.
- Whether the right factors were marked low-confidence or whether the widened range covers the true ignorance: sensitivity to ignorance widens factors marked confidence 'low', flagged isEstimate (or described as an estimate), or carrying an unsourced stated value, and tests whether the preferred action flips under linear benefit scaling; it cannot see deep uncertainty on factors the organisation marked high-confidence with a citation, or non-linear structural tipping points outside the stated formulas.
- The model-judged criterion depends on the AI model named in the mark; another model may judge differently, which is why the model and methodology version are published with every review.

## Why publishing the weights does not hand out tiers (anti-gaming)

Published weights make the review checkable, and also gameable. So these five measures are part
of the method, not options:

1. **Findings are published**, not just a badge: a dossier that games one criterion shows it.
2. **Random-sample re-review with public downgrades**: each period a sample of reviewed dossiers,
   chosen by a published seed, is re-run under the version it was reviewed with. A lower result is
   published as a downgrade; a re-review can never raise a tier.
3. **Appeals are published verbatim**: an organisation may answer a review. The answer is
   published as written, beside the review, and is not adjudicated - it does not change the tier.
4. **Model and methodology versions are published** with every review, so anyone can re-run it.
5. **The operator discloses that it is both supplier and rater**, on every reviewed dossier.

## Cost

One review is one model call per published dossier. D-1 (unit economics, 2026-11-18) assumes an
AI unit cost of **\$0.005 per operation** - the code's own assumption, unmeasured. No price for a
review is set by this method; see MIPA-50 in the backlog.
