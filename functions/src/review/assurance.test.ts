// node --test lib/review/assurance.test.js (npm test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ReviewInput,
  Judge,
  mechanicalChecks,
  scoreReview,
  recomputeLeverage,
  reviewDossier,
  selectForReReview,
  reReviewEvent,
  appealEvent,
  effectiveTier,
  publicReviewLedger,
  ReviewConclusion,
  elicitOmissionFollowUp,
  draftUnconfirmedOmissionRecord,
  discardAiOmissionDraft,
  isLowConfidenceFactor,
  checkIgnoranceSensitivity,
} from "./assurance";
import { CRITERIA, TIERS, LIMITS, DISCLOSURE, totalWeight } from "./rubric";
import { JUDGE_SYSTEM_PROMPT, parseJudgeReply } from "./judge";
import { METHODOLOGY_VERSION, memoryReviewStore, ProvenanceError } from "./provenance";

const AT = new Date("2026-11-20T03:00:00Z");
const MODEL = "claude-3-5-sonnet-20241022";

function lev(net: number, roi: number, c: number) {
  return ((net * roi) / c) * Math.sign(net);
}

// A dossier that earns full marks on every mechanical criterion.
function goodDossier(): ReviewInput {
  return {
    modelId: "m1",
    factors: [
      { id: "f1", name: "Volunteers", initialValue: 120, units: "people", description: "Active volunteers", sourceCitation: "2025 roster" },
      {
        id: "f2",
        name: "Meals",
        formula: "f1 * 3",
        units: "meals/day",
        description: "Meals served",
        omissionRecord: "no other significant factors, because kitchen capacity and ingredients are contracted in full for 2025",
      },
    ],
    actions: [
      {
        id: "a1",
        title: "Train leads",
        marginalNetTotalBenefitNpv: 5000,
        totalRoi: 2,
        outstandingDirectCosts: 1000,
        actionLeverage: lev(5000, 2, 1000),
        deadweight: 10,
        impacts: [{ operand: 5 }],
      },
      {
        id: "a2",
        title: "Done already",
        marginalNetTotalBenefitNpv: 100,
        totalRoi: null,
        outstandingDirectCosts: 0,
        actionLeverage: null,
        impacts: [{ operand: 1 }],
      },
    ],
    robustness: { probabilityPositive: 0.95 },
  };
}

const judgeAll =
  (score: number): Judge =>
  async () => ({ scores: { internalConsistency: score }, findings: [] });

// --- the published rubric ---------------------------------------------------

test("the rubric's weights total 100 and every criterion has a method", () => {
  assert.equal(totalWeight(), 100);
  for (const c of CRITERIA) assert.ok(c.method === "mechanical" || c.method === "model");
  assert.deepEqual(TIERS.map((t) => t.id), ["tier3", "tier2", "tier1"]);
});

test("the published methodology document matches the code, weight for weight", () => {
  const doc = readFileSync(resolve(__dirname, "../../../docs/methodology/review-methodology.md"), "utf8");
  assert.ok(doc.includes(`# mipa review methodology v${METHODOLOGY_VERSION}`), "version heading");
  for (const c of CRITERIA) {
    assert.ok(doc.includes(`| ${c.id} | ${c.weight} | ${c.method} | ${c.checks} |`), `row for ${c.id}`);
  }
  for (const t of TIERS) {
    assert.ok(doc.includes(`| ${t.id} | ${t.minScore} | ${t.requiresFull.join(", ")} |`), `row for ${t.id}`);
  }
  // The limits live in the same document as the weights, not in a footnote.
  for (const l of LIMITS) assert.ok(doc.includes(`- ${l}`), `limit: ${l.slice(0, 40)}`);
  assert.ok(doc.includes("supplier and rater"));
  assert.ok(DISCLOSURE.includes("supplier and rater"));
});

test("no published text claims assurance the method cannot support", () => {
  const doc = readFileSync(resolve(__dirname, "../../../docs/methodology/review-methodology.md"), "utf8");
  const text = [doc, DISCLOSURE, ...LIMITS, ...CRITERIA.map((c) => c.checks)].join("\n").toLowerCase();
  for (const banned of ["certified", "guaranteed", "verified impact", "audited", "assured by"]) {
    assert.ok(!text.includes(banned), banned);
  }
  assert.ok(doc.includes("**not** assurance"));
});

// --- mechanical checks ------------------------------------------------------

test("leverage is recomputed with mipa's formula, null when direct costs are not positive", () => {
  assert.equal(recomputeLeverage({ id: "x", marginalNetTotalBenefitNpv: 5000, totalRoi: 2, outstandingDirectCosts: 1000 }), 10);
  assert.equal(recomputeLeverage({ id: "x", marginalNetTotalBenefitNpv: -100, totalRoi: -0.5, outstandingDirectCosts: 10 }), -5);
  assert.equal(recomputeLeverage({ id: "x", marginalNetTotalBenefitNpv: 1, totalRoi: 1, outstandingDirectCosts: 0 }), null);
});

test("a good dossier scores full marks mechanically and earns tier3", () => {
  const mech = mechanicalChecks(goodDossier());
  for (const r of mech) assert.equal(r.score, 1, `${r.id}: ${JSON.stringify(r.findings)}`);
  const c = scoreReview([...mech, { id: "internalConsistency", score: 1, findings: [] }]);
  assert.equal(c.score, 100);
  assert.equal(c.tier, "tier3");
  assert.deepEqual(c.findings, []);
});

test("a leverage that does not reproduce is a finding and blocks every tier", () => {
  const d = goodDossier();
  d.actions[0].actionLeverage = 99999;
  const c = scoreReview([...mechanicalChecks(d), { id: "internalConsistency", score: 1, findings: [] }]);
  assert.equal(c.tier, null, "recalculation must be full for any tier");
  assert.ok(c.score >= 85, "even with a high total");
  assert.ok(c.findings.some((f) => f.criterion === "recalculation" && f.subject === "a1"));
});

test("the named anti-patterns are found", () => {
  const d = goodDossier();
  d.actions[0].deadweight = 0; // top band with all-zero adjustments
  d.actions.push({
    id: "a3",
    title: "Empty",
    marginalNetTotalBenefitNpv: 10,
    totalRoi: 1,
    outstandingDirectCosts: 10,
    actionLeverage: lev(10, 1, 10),
    impacts: [{ operand: 0 }, { operand: 0 }],
  });
  const anti = mechanicalChecks(d).find((r) => r.id === "antiPatterns")!;
  assert.equal(anti.findings.length, 2);
  assert.equal(anti.score, 0);
  const c = scoreReview([...mechanicalChecks(d), { id: "internalConsistency", score: 1, findings: [] }]);
  assert.equal(c.tier, "tier1", "anti-patterns cap the tier at tier1");
});

test("unsourced values, missing units and missing robustness are findings", () => {
  const d = goodDossier();
  d.factors[0].sourceCitation = "";
  d.factors[1].units = "";
  d.robustness = null;
  const byId = Object.fromEntries(mechanicalChecks(d).map((r) => [r.id, r]));
  assert.equal(byId.sourceTraceability.score, 0);
  assert.equal(byId.completeness.score, 5 / 6);
  assert.equal(byId.robustness.score, 0);
});

// --- the review end to end ---------------------------------------------------

test("a review stores its findings, score, tier and provenance; the same dossier replays", async () => {
  const store = memoryReviewStore<ReviewConclusion>();
  let calls = 0;
  const judge: Judge = async (_i, s) => {
    calls++;
    assert.equal(s.temperature, 0);
    return { scores: { internalConsistency: 0.8 }, findings: [{ criterion: "internalConsistency", subject: "f2", text: "x" }] };
  };
  const first = await reviewDossier({ judge, store, now: () => AT }, { input: goodDossier(), provider: "anthropic", model: MODEL });
  assert.equal(first.record.conclusion.score, 97);
  assert.equal(first.record.conclusion.tier, "tier3");
  assert.equal(first.record.provenance.methodologyVersion, METHODOLOGY_VERSION);
  assert.equal(first.record.provenance.model, MODEL);
  const again = await reviewDossier({ judge, store }, { input: goodDossier(), provider: "anthropic", model: MODEL });
  assert.equal(again.replayed, true);
  assert.equal(calls, 1);
});

// --- (ii) re-review ------------------------------------------------------------

test("the re-review sample is deterministic for a published seed and roughly the stated rate", () => {
  const keys = Array.from({ length: 2000 }, (_, i) => `k${i}`);
  const a = selectForReReview(keys, 0.1, "2026-11");
  assert.deepEqual(a, selectForReReview(keys, 0.1, "2026-11"));
  assert.notDeepEqual(a, selectForReReview(keys, 0.1, "2026-12"));
  assert.ok(a.length > 140 && a.length < 260, `${a.length}`);
  assert.deepEqual(selectForReReview(keys, 0, "s"), []);
});

test("a re-review that scores lower publishes a downgrade; one that scores higher changes nothing", async () => {
  const store = memoryReviewStore<ReviewConclusion>();
  const { record } = await reviewDossier({ judge: judgeAll(1), store, now: () => AT }, { input: goodDossier(), provider: "anthropic", model: MODEL });
  assert.equal(record.conclusion.tier, "tier3");

  // A harsher judge drops the score to exactly 85: not reproduced, but still
  // tier3 - a disagreement is published, a downgrade only when the tier falls.
  const down = await reReviewEvent(record, goodDossier(), judgeAll(0), { seed: "2026-12", at: AT });
  assert.equal(down.reproduced, false);
  assert.equal(down.toTier, "tier3");
  assert.equal(down.downgraded, false);

  const tampered = goodDossier();
  tampered.actions[0].title = "changed after review";
  const gone = await reReviewEvent(record, tampered, judgeAll(1), { seed: "2026-12", at: AT });
  assert.equal(gone.toTier, null, "a dossier that no longer matches what was reviewed loses its tier");
  assert.equal(gone.downgraded, true);
  assert.equal(effectiveTier(record, [gone]), null);
  assert.equal(store.records.get(record.reproducibilityKey)!.conclusion.tier, "tier3", "stored record untouched");
});

test("a lower re-review score lowers the effective tier, and nothing can raise it", async () => {
  const store = memoryReviewStore<ReviewConclusion>();
  const d = goodDossier();
  d.robustness = { probabilityPositive: 0.5 }; // 90 with a perfect judge
  const { record } = await reviewDossier({ judge: judgeAll(1), store, now: () => AT }, { input: d, provider: "anthropic", model: MODEL });
  assert.equal(record.conclusion.score, 90);
  assert.equal(record.conclusion.tier, "tier3");
  const down = await reReviewEvent(record, d, judgeAll(0), { seed: "s", at: AT });
  assert.equal(down.toTier, "tier2");
  assert.equal(down.downgraded, true);
  const up = { ...down, toTier: "tier3" as const, fromTier: "tier1" as const, downgraded: false };
  assert.equal(effectiveTier(record, [down, up]), "tier2");
});

// --- (iii) appeals ---------------------------------------------------------------

test("an appeal is published verbatim and does not change the tier", async () => {
  const store = memoryReviewStore<ReviewConclusion>();
  const { record } = await reviewDossier({ judge: judgeAll(1), store, now: () => AT }, { input: goodDossier(), provider: "anthropic", model: MODEL });
  const text = "  We disagree:\n the roster is audited yearly.  ";
  const appeal = appealEvent({ reviewKey: record.reproducibilityKey, text, submittedBy: "uid1", at: AT });
  assert.equal(appeal.text, text, "verbatim, not trimmed or edited");
  assert.equal(effectiveTier(record, [appeal]), "tier3");
  assert.throws(() => appealEvent({ reviewKey: "k", text: " ", submittedBy: "u", at: AT }), ProvenanceError);
  assert.throws(() => appealEvent({ reviewKey: "k", text: "x".repeat(5001), submittedBy: "u", at: AT }), ProvenanceError);
});

// --- (i)+(iv)+(v) the public ledger ---------------------------------------------

test("the public ledger carries findings, versions, re-reviews, appeals, disclosure and limits", async () => {
  const store = memoryReviewStore<ReviewConclusion>();
  const d = goodDossier();
  d.factors[0].sourceCitation = "";
  const { record } = await reviewDossier({ judge: judgeAll(1), store, now: () => AT }, { input: d, provider: "anthropic", model: MODEL });
  const appeal = appealEvent({ reviewKey: record.reproducibilityKey, text: "Source exists.", submittedBy: "u", at: AT });
  const other = appealEvent({ reviewKey: "someone-else", text: "x", submittedBy: "u", at: AT });
  const ledger = publicReviewLedger(record, [appeal, other]);
  assert.ok(ledger.findings.some((f) => f.criterion === "sourceTraceability"));
  assert.equal(ledger.provenance.model, MODEL);
  assert.equal(ledger.provenance.methodologyVersion, METHODOLOGY_VERSION);
  assert.deepEqual(ledger.appeals, [appeal]);
  assert.equal(ledger.disclosure, DISCLOSURE);
  assert.deepEqual(ledger.limits, LIMITS);
  assert.equal(ledger.tier, record.conclusion.tier);
});

// --- the judge -------------------------------------------------------------------

test("the judge prompt names every model criterion and forbids claiming to have read sources", () => {
  for (const c of CRITERIA.filter((x) => x.method === "model")) assert.ok(JUDGE_SYSTEM_PROMPT.includes(c.id));
  assert.ok(JUDGE_SYSTEM_PROMPT.includes("must not claim to have checked them"));
});

test("a judge reply is parsed strictly", () => {
  const ok = parseJudgeReply(JSON.stringify({ scores: { internalConsistency: 0.7 }, findings: [{ criterion: "internalConsistency", subject: "f1", text: "t" }] }));
  assert.equal(ok.scores.internalConsistency, 0.7);
  assert.throws(() => parseJudgeReply("not json"));
  assert.throws(() => parseJudgeReply(JSON.stringify({ scores: {}, findings: [] })));
  assert.throws(() => parseJudgeReply(JSON.stringify({ scores: { internalConsistency: 1, recalculation: 1 }, findings: [] })));
  assert.throws(() => parseJudgeReply(JSON.stringify({ scores: { internalConsistency: 2 }, findings: [] })));
});

// --- todo212: forced omission record & sensitivity to ignorance ----------------

test("todo212 (regression): a model missing its dominant factor omission record can no longer reach tier2 or tier3", async () => {
  const d = goodDossier();
  // Exact v1.0.0 shape where outcome factor f2 had no forced omission record (previously scored 100 / tier3).
  delete d.factors[1].omissionRecord;
  const store = memoryReviewStore<ReviewConclusion>();
  const { record } = await reviewDossier({ judge: judgeAll(1), store, now: () => AT }, { input: d, provider: "anthropic", model: MODEL });
  assert.ok(record.conclusion.score < 100, `expected < 100, got ${record.conclusion.score}`);
  assert.equal(record.conclusion.tier, "tier1", "missing omission record must block tier2 and tier3");
  assert.ok(
    record.conclusion.findings.some((f) => f.criterion === "antiPatterns" && f.subject === "f2" && f.code === "omission-record"),
    "expected omission-record finding on outcome factor f2"
  );
  assert.equal(record.conclusion.omissionRecords[0].status, "missing");
});

test("todo212: placeholder reasons, flagged omissions and unconfirmed AI drafts block upper tiers; adding a driver satisfies the check", async () => {
  // Placeholder underscores are rejected
  const placeholder = goodDossier();
  placeholder.factors[1].omissionRecord = "no other significant factors, because ____";
  const cPlaceholder = scoreReview([...mechanicalChecks(placeholder), { id: "internalConsistency", score: 1, findings: [] }]);
  assert.equal(cPlaceholder.tier, "tier1");
  assert.ok(elicitOmissionFollowUp(placeholder.factors[1]).includes('What else drives "Meals"?'));

  // Flagged omission is rejected
  const flagged = goodDossier();
  flagged.factors[1].omissionFlagged = true;
  const cFlagged = scoreReview([...mechanicalChecks(flagged), { id: "internalConsistency", score: 1, findings: [] }]);
  assert.equal(cFlagged.tier, "tier1");
  assert.equal(cFlagged.omissionRecords[0].status, "flagged");

  // AI ceiling: unconfirmed AI draft is marked unconfirmed + discardable in one action and blocks upper tiers
  const aiDraft = draftUnconfirmedOmissionRecord("seasonal volatility is captured elsewhere");
  assert.equal(aiDraft.draftedByAi, true);
  assert.equal(aiDraft.confirmed, false);
  assert.equal(aiDraft.discardable, true);
  assert.equal(discardAiOmissionDraft(aiDraft), null);

  const withAiDraft = goodDossier();
  withAiDraft.factors[1].omissionRecord = aiDraft;
  const cAi = scoreReview([...mechanicalChecks(withAiDraft), { id: "internalConsistency", score: 1, findings: [] }]);
  assert.equal(cAi.tier, "tier1");
  assert.equal(cAi.omissionRecords[0].status, "unconfirmed-ai-draft");

  // Adding a missing dominant driver factor and wiring it into formula satisfies the record and earns tier3
  const withAddedDriver = goodDossier();
  withAddedDriver.factors.push({
    id: "f3",
    name: "KitchenCapacity",
    initialValue: 400,
    units: "meals/day",
    description: "Daily kitchen throughput",
    sourceCitation: "2025 facility audit",
  });
  withAddedDriver.factors[1].formula = "min(f1 * 3, f3)";
  withAddedDriver.factors[1].omissionRecord = { addedFactorIds: ["f3"] };

  const store = memoryReviewStore<ReviewConclusion>();
  const { record } = await reviewDossier({ judge: judgeAll(1), store, now: () => AT }, { input: withAddedDriver, provider: "anthropic", model: MODEL });
  assert.equal(record.conclusion.score, 100);
  assert.equal(record.conclusion.tier, "tier3");
  const ledger = publicReviewLedger(record);
  assert.deepEqual(ledger.omissionRecords[0], {
    factorId: "f2",
    factorName: "Meals",
    status: "added-driver",
    addedFactorIds: ["f3"],
    statement: undefined,
  });
});

test("todo212: sensitivity to ignorance widens low-confidence factors, flips decision and names the assumption", async () => {
  function ignoranceDossier(confidence: "low" | "high"): ReviewInput {
    return {
      modelId: "m-ign",
      factors: [
        {
          id: "f_vol",
          symbol: "volunteers",
          name: "Volunteers",
          initialValue: 100,
          units: "people",
          description: "Estimated active volunteers",
          sourceCitation: confidence === "high" ? "Verified 2025 registry" : "Rough field guess",
          confidence,
          isEstimate: confidence === "low",
        },
        {
          id: "f_out",
          name: "Meals",
          formula: "f_vol * 3",
          units: "meals/day",
          description: "Meals delivered",
          omissionRecord: "no other significant factors, because kitchen supplies scale linearly with volunteer shifts",
        },
      ],
      actions: [
        {
          id: "a1",
          title: "Outreach Drive",
          marginalTotalBenefitNpv: 7500,
          marginalTotalCostNpv: 2500,
          marginalNetTotalBenefitNpv: 5000,
          totalRoi: 2,
          outstandingDirectCosts: 1000,
          actionLeverage: lev(5000, 2, 1000), // 10.0; at -30% -> 3.025 > 3.0, at -75% -> -0.156 < 3.0
          deadweight: 10,
          impacts: [{ nodeId: "f_vol", symbol: "volunteers", operand: 5 }],
        },
        {
          id: "a2",
          title: "Partner Hub",
          marginalTotalBenefitNpv: 3000,
          marginalTotalCostNpv: 1500,
          marginalNetTotalBenefitNpv: 1500,
          totalRoi: 1,
          outstandingDirectCosts: 500,
          actionLeverage: lev(1500, 1, 500), // 3.0
          deadweight: 5,
          impacts: [{ operand: 2 }],
        },
      ],
      robustness: { probabilityPositive: 0.95 },
    };
  }

  // With high confidence & citation, decision is supported and earns tier3
  const highStore = memoryReviewStore<ReviewConclusion>();
  const highRun = await reviewDossier({ judge: judgeAll(1), store: highStore, now: () => AT }, { input: ignoranceDossier("high"), provider: "anthropic", model: MODEL });
  assert.equal(highRun.record.conclusion.tier, "tier3");
  assert.equal(highRun.record.conclusion.decisionSupport.supportsDecision, true);
  assert.equal(highRun.record.conclusion.decisionSupport.flippingAssumptions.length, 0);

  // With low confidence, widened ±75% range flips from Outreach Drive to Partner Hub around 69.85
  const lowInput = ignoranceDossier("low");
  assert.equal(isLowConfidenceFactor(lowInput.factors[0]), true);
  const direct = checkIgnoranceSensitivity(lowInput);
  assert.equal(direct.decisionSupport.supportsDecision, false);
  assert.match(direct.decisionSupport.verdict, /this model does not support this decision/i);
  assert.equal(direct.decisionSupport.flippingAssumptions.length, 1);
  const flip = direct.decisionSupport.flippingAssumptions[0];
  assert.equal(flip.factorId, "f_vol");
  assert.equal(flip.fromActionId, "a1");
  assert.equal(flip.toActionId, "a2");
  assert.ok(flip.turningPoint !== null && flip.turningPoint > 69 && flip.turningPoint < 70.5, `turningPoint=${flip.turningPoint}`);
  assert.match(flip.assumption, /Volunteers/);

  const lowStore = memoryReviewStore<ReviewConclusion>();
  const lowRun = await reviewDossier({ judge: judgeAll(1), store: lowStore, now: () => AT }, { input: lowInput, provider: "anthropic", model: MODEL });
  assert.equal(lowRun.record.conclusion.tier, "tier1", "ignorance flip blocks upper tiers");
  assert.ok(
    lowRun.record.conclusion.findings.some(
      (f) => f.criterion === "robustness" && f.code === "ignorance-flip" && /Volunteers/.test(f.text)
    )
  );
  const ledger = publicReviewLedger(lowRun.record);
  assert.equal(ledger.decisionSupport.supportsDecision, false);
  assert.match(ledger.decisionSupport.verdict, /this model does not support this decision/i);
});

test("todo212: LIMITS and judge prompt reflect both forced omission records and sensitivity to ignorance", () => {
  const joinedLimits = LIMITS.join("\n").toLowerCase();
  assert.ok(joinedLimits.includes("omission"), "LIMITS states what omission check cannot see");
  assert.ok(joinedLimits.includes("low-confidence") || joinedLimits.includes("ignorance"), "LIMITS states what sensitivity to ignorance cannot see");
  assert.ok(JUDGE_SYSTEM_PROMPT.includes("Read outcome factors"), "judge prompt includes adversarial check");
  assert.ok(JUDGE_SYSTEM_PROMPT.includes("without deciding"), "judge prompt enforces AI ceiling");
});
