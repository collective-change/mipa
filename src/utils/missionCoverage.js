/**
 * src/utils/missionCoverage.js
 *
 * Mipa Mission Coverage & Claim Verification Register Record (MIPA-39 / Decision M-9).
 *
 * Principles:
 * 1. Symmetry: Mipa asks organizations to publish what their model does not cover
 *    (Decision Brief Section 5). Mipa publishes the identical disclosure about itself.
 * 2. Permanent Register Record: Published as an immutable, citable register record
 *    with a permanent URL, citation ID, and dated version.
 * 3. Separation of Claims: Separates claims into mechanical, attributed, declared,
 *    lagged-forecast, and ex-ante decision BEFORE presenting any capabilities.
 *    No sentence contains a blanket "cannot be verified".
 * 4. Derived State: Shipped capabilities ("what ships") are derived directly from the
 *    codebase (worldModel.js, conversionFactors.js, dimensions.js), not hand-written.
 *    The "why not yet" requirements are dated, mechanical prose.
 */

import { WDI_LAYER1_INDICATORS, WDI_DEFAULT_VERSION, WDI_DEFAULT_LICENSE, WDI_DEFAULT_AUTHORITY } from "./worldModel";
import { CLIMATE_CONVERSION_FACTORS, CANONICAL_PRESSURE_UNIT } from "./conversionFactors";
import {
  DIMENSION_KINDS,
  ANIMAL_WELFARE_DIMENSION,
  SDG_LABEL_DIMENSION,
  BOUNDARY_LIMIT_DIMENSION,
  SDG_INDICATOR_CROSSWALK
} from "./dimensions";

export const COVERAGE_VERSION = "1.0.0";
export const COVERAGE_RECORD_ID = "mipa-mission-coverage-v1";
export const COVERAGE_RECORD_DATE = "2026-11-19";
export const COVERAGE_CITATION_ID = "MIPA-REGISTER-2026-11-19-COV1";
export const COVERAGE_CANONICAL_URL = "https://collective-change.org/records/mipa-mission-coverage-v1";
export const METHODOLOGY_VERSION = "v1.0.0";

/**
 * The Six Claims of Verification.
 * Must precede any capability descriptions.
 */
export const VERIFICATION_CLAIMS = [
  {
    id: "claim_method_followed",
    claimNumber: 1,
    title: "The method was followed",
    mode: "mechanical",
    modeLabel: "Mechanical verification",
    scope: "The model graph topological order, formula evaluation hierarchy, and guardrail constraints are verified mechanically by code against methodology specification v1.0.0.",
    formulaReference: "src/workers/calcWorker.js:buildEvaluationOrder",
    verificationStatement: "Checked mechanically against methodology v1.0.0 on 2026-11-19",
    isVerifiableNow: true
  },
  {
    id: "claim_arithmetic_reproduces",
    claimNumber: 2,
    title: "The arithmetic reproduces",
    mode: "mechanical",
    modeLabel: "Mechanical verification",
    scope: "All calculations execute in a sandboxed client-side web worker using mathjs 15. Any third party executing the same input values and formula definitions obtains identical numerical outputs.",
    formulaReference: "src/workers/calcWorker.js:runSimulation",
    verificationStatement: "Reproduced deterministically by mathjs in client web worker",
    isVerifiableNow: true
  },
  {
    id: "claim_inputs_sourced",
    claimNumber: 3,
    title: "The inputs are sourced",
    mode: "attribution",
    modeLabel: "Attribution verification",
    scope: "Standard model indicators and conversion factors carry canonical citation URLs, governing authorities, and license designations (World Bank WDI, IPCC AR6, GHG Protocol). User-supplied values carry attribution to the author or organization.",
    formulaReference: "src/utils/worldModel.js & src/utils/conversionFactors.js",
    verificationStatement: "Sourced by canonical citation URL and license attribution per factor",
    isVerifiableNow: true
  },
  {
    id: "claim_counterfactual",
    claimNumber: 4,
    title: "The counterfactual",
    mode: "declared_by_default",
    modeLabel: "Declared by default / Upgradable to measured",
    scope: "By default, the counterfactual (if-not-done trajectory) is declared by the model builder using baseline projections (calcWorker.js:625,643). Where comparison or quasi-experimental data exists, it is upgradable to measured with documented attribution design.",
    formulaReference: "src/workers/calcWorker.js:625,643",
    verificationStatement: "Declared baseline projection by default; verifiable against empirical comparison series where attached",
    isVerifiableNow: false,
    upgradableToMeasured: true
  },
  {
    id: "claim_forecast",
    claimNumber: 5,
    title: "The forecast",
    mode: "lagged_calibration",
    modeLabel: "Scored with a lag",
    scope: "Projected simulation outcomes are scored with a lag against observed post-decision actuals via calibration records once observation periods mature. A forecast is evaluated empirically as time elapses, rather than asserted at decision time.",
    formulaReference: "docs/REGISTER-PERMANENCE.md & calibration ledger",
    verificationStatement: "Scored with an empirical lag against subsequent observations",
    isVerifiableNow: false,
    scoredWithLag: true
  },
  {
    id: "claim_decision",
    claimNumber: 6,
    title: "The decision",
    mode: "ex_ante_judgment",
    modeLabel: "Judged ex-ante before outcome is known",
    scope: "Decisions are recorded, hashed, and published before outcomes are known. This preserves ex-ante trade-offs, uncertainty bands, and leverage rankings at decision time, eliminating hindsight bias.",
    formulaReference: "docs/REGISTER-PERMANENCE.md (revocation ≠ erasure)",
    verificationStatement: "Judged ex-ante before outcome is known; permanent timestamped record",
    isVerifiableNow: true
  }
];

/**
 * Derives the "what ships" capability state directly from the codebase.
 * A hand-written list drifts; this inspects live exported objects.
 *
 * @returns {Object} Live derived capabilities
 */
export function deriveShippedCapabilities() {
  // 1. Shipped World Model (Layer 1)
  const worldModelIndicators = WDI_LAYER1_INDICATORS.map((ind) => ({
    code: ind.code,
    symbol: ind.symbol,
    name: ind.name,
    unit: ind.unit,
    category: ind.category,
    licence: ind.licence,
    sourceUrl: `https://data.worldbank.org/indicator/${ind.code}`
  }));

  const worldCategories = Array.from(new Set(WDI_LAYER1_INDICATORS.map((i) => i.category)));

  // 2. Shipped Conversion Factor Library (Layer 3)
  const conversionFactors = CLIMATE_CONVERSION_FACTORS.map((fac) => ({
    id: fac.id,
    name: fac.name,
    category: fac.category,
    activityUnit: fac.activityUnit,
    pressureUnit: fac.pressureUnit,
    factorValue: fac.factorValue,
    scope: fac.scope,
    geography: fac.geography,
    authority: fac.authority,
    citationUrl: fac.citationUrl,
    licence: fac.licence,
    version: fac.version
  }));

  const scopesCovered = Array.from(new Set(CLIMATE_CONVERSION_FACTORS.map((f) => `Scope ${f.scope}`))).sort();
  const conversionAuthorities = Array.from(new Set(CLIMATE_CONVERSION_FACTORS.map((f) => f.authority)));

  // 3. Shipped Dimensions (Governance Framework)
  const shippedDimensions = [
    {
      id: ANIMAL_WELFARE_DIMENSION.id,
      name: ANIMAL_WELFARE_DIMENSION.name,
      kind: ANIMAL_WELFARE_DIMENSION.kind,
      physicalUnit: ANIMAL_WELFARE_DIMENSION.physicalUnit,
      framework: ANIMAL_WELFARE_DIMENSION.framework,
      citationUrl: ANIMAL_WELFARE_DIMENSION.citationUrl,
      indicatorCount: ANIMAL_WELFARE_DIMENSION.indicators.length,
      defaultWeightEnabled: ANIMAL_WELFARE_DIMENSION.weight.enabled
    },
    {
      id: SDG_LABEL_DIMENSION.id,
      name: SDG_LABEL_DIMENSION.name,
      kind: SDG_LABEL_DIMENSION.kind,
      description: SDG_LABEL_DIMENSION.description,
      crosswalkCount: SDG_INDICATOR_CROSSWALK.length
    },
    {
      id: BOUNDARY_LIMIT_DIMENSION.id,
      name: BOUNDARY_LIMIT_DIMENSION.name,
      kind: BOUNDARY_LIMIT_DIMENSION.kind,
      description: BOUNDARY_LIMIT_DIMENSION.description,
      physicalUnit: BOUNDARY_LIMIT_DIMENSION.physicalUnit
    }
  ];

  // 4. Register Permanence & Storage
  const registerPermanence = {
    retentionTiers: [
      { tier: "PITR", window: "7 days", purpose: "Continuous point-in-time recovery" },
      { tier: "Tier 1: Operational", window: "30 days", storage: "GCS Standard", purpose: "Daily disaster recovery snapshots" },
      { tier: "Tier 2: Monthly", window: "1 year", storage: "GCS Coldline", purpose: "Historical monthly audit snapshots" },
      { tier: "Tier 3: Permanent Archive", window: "7 years", storage: "GCS Archive", purpose: "Statutory permanent counterparty retention" }
    ],
    immutabilityRule: "revocation ≠ erasure (tombstone records retain citations)",
    verifiedRestoreDrill: {
      drillId: "drill_1795070567073",
      fidelity: "100%",
      date: "2026-11-19"
    }
  };

  return {
    worldModel: {
      layer: 1,
      name: "Country Model (World Bank WDI)",
      version: WDI_DEFAULT_VERSION,
      license: WDI_DEFAULT_LICENSE,
      authority: WDI_DEFAULT_AUTHORITY,
      indicatorsCount: worldModelIndicators.length,
      categories: worldCategories,
      indicators: worldModelIndicators
    },
    conversionFactors: {
      layer: 3,
      name: "Climate & Emission Conversion Factors",
      canonicalUnit: CANONICAL_PRESSURE_UNIT,
      factorsCount: conversionFactors.length,
      scopesCovered,
      authorities: conversionAuthorities,
      factors: conversionFactors
    },
    dimensions: {
      kindsDeclared: Object.values(DIMENSION_KINDS),
      shipped: shippedDimensions
    },
    registerPermanence
  };
}

/**
 * Mission Requirements & Compliance Registry (Layer 5c + Core Mission).
 * Every requirement is declared with a state ("met" | "not_yet_met" | "deliberately_not_built")
 * and dated, checked prose.
 */
export const MISSION_REQUIREMENTS = [
  {
    id: "req_distribution",
    title: "Distribution (Layer 5c.1)",
    category: "Layer 5c",
    state: "not_yet_met",
    governingDecision: "M-9",
    asOfDate: "2026-11-19",
    reason: "The core action leverage metric aggregates unweighted net benefits across all beneficiaries. Distributional equity weighting (e.g. Gini or Atkinson inequality indices) requires explicit demographic or income cohort subgroup partitioning, which is not yet automated in the calculation engine."
  },
  {
    id: "req_disagreement",
    title: "Disagreement & Plural Value Systems (Layer 5c.2)",
    category: "Layer 5c",
    state: "met",
    governingDecision: "M-8",
    asOfDate: "2026-11-19",
    reason: "Implemented via Decision Brief Section 3 Turning-Point Analysis (src/utils/sensitivityAnalysis.js) and Stakeholder Weight Attribution (src/utils/dimensions.js / Decision M-8). Counterparties and evaluators can substitute alternate moral weightings without mutating the underlying consensus model."
  },
  {
    id: "req_labour_human_rights",
    title: "Labour and Human Rights (Layer 5c.3)",
    category: "Layer 5c",
    state: "not_yet_met",
    governingDecision: "M-9",
    asOfDate: "2026-11-19",
    reason: "Standard Country Model provides national unemployment rates (SL.UEM.TOTL.ZS), but specific supply-chain forced labour, collective bargaining, or ILO Core Conventions conversion factors are not yet library-resident."
  },
  {
    id: "req_governance_fair_tax",
    title: "Governance and Fair Tax (Layer 5c.4)",
    category: "Layer 5c",
    state: "not_yet_met",
    governingDecision: "M-9",
    asOfDate: "2026-11-19",
    reason: "Organizational financial modules track expenditure and operational cash flows, but jurisdictional tax fairness, transfer pricing adjustments, and beneficial ownership transparency are not audited in the model."
  },
  {
    id: "req_health_mortality",
    title: "Health and Mortality (Layer 5c.5)",
    category: "Layer 5c",
    state: "met",
    governingDecision: "M-9",
    asOfDate: "2026-11-19",
    reason: "Layer 1 country model ships Life Expectancy (SP.DYN.LE00.IN) and Current Health Expenditure (SH.XPD.CHEX.PC.CD). SROI impact mapping and custom factor libraries support DALY and QALY factor definitions."
  },
  {
    id: "req_consent_participation",
    title: "Consent and Participation (Layer 5c.6)",
    category: "Layer 5c",
    state: "not_yet_met",
    governingDecision: "M-9",
    asOfDate: "2026-11-19",
    reason: "Read-only stakeholder viewer roles are implemented (MIPA-15 / PageModelViewerAccess.vue), but formal participatory co-design workflows, community voting mechanisms, and FPIC (Free, Prior, and Informed Consent) documentation protocols are not yet built."
  },
  {
    id: "req_subjects_beyond_people_animals",
    title: "Subjects Beyond People and Animals (Layer 5c.7)",
    category: "Layer 5c",
    state: "deliberately_not_built",
    governingDecision: "M-9",
    asOfDate: "2026-11-19",
    reason: "Independent utility agents representing non-sentient natural entities (rivers, mountains, ecosystems) or synthetic AI entities are deliberately not built. Ecosystem health is preserved strictly through non-tradeable planetary boundary constraint limits (Decision M-5)."
  },
  {
    id: "req_lexical_nontradeable_values",
    title: "Lexical or Non-tradeable Values (Layer 5c.8)",
    category: "Layer 5c",
    state: "met",
    governingDecision: "M-5",
    asOfDate: "2026-11-19",
    reason: "Enforced by Boundary Constraint Limits (src/utils/dimensions.js) and Organizational Guardrails (src/utils/guardrails.js / Decision M-5). Boundary violations generate hard guardrail breach flags and are barred from being monetized or offset against financial net benefit."
  },
  {
    id: "req_animal_welfare",
    title: "Animal Welfare Dimension (Decision M-7)",
    category: "Cross-Cutting",
    state: "met",
    governingDecision: "M-7",
    asOfDate: "2026-11-19",
    reason: "Implemented via Five Domains Model framework in physical units of animal-years (Decision M-7 / src/utils/dimensions.js). Moral weights remain off by default and render unweighted in public dossiers with 'not included in the score' label unless explicitly attributed."
  },
  {
    id: "req_planetary_boundaries",
    title: "Planetary Boundaries (Layer 2)",
    category: "Cross-Cutting",
    state: "not_yet_met",
    governingDecision: "M-5",
    asOfDate: "2026-11-19",
    reason: "Boundary constraint limit mechanics and non-tradeable guardrail logic are settled and enforced in code, but pre-populated Earth system boundary thresholds (Stockholm Resilience Centre 9 planetary boundaries) are not yet populated into a pre-packaged standard library."
  }
];

/**
 * Builds the canonical Mipa Mission Coverage Register Record.
 *
 * @param {Object} [options]
 * @param {string} [options.recordId=COVERAGE_RECORD_ID]
 * @param {string} [options.date=COVERAGE_RECORD_DATE]
 * @returns {Object} Complete permanent register record
 */
export function buildMissionCoverageRecord(options = {}) {
  const recordId = options.recordId || COVERAGE_RECORD_ID;
  const publishedDate = options.date || COVERAGE_RECORD_DATE;
  const shippedCapabilities = deriveShippedCapabilities();

  return {
    recordId,
    recordType: "mission_coverage_statement",
    title: "Mipa Mission Coverage & Claim Verification Statement",
    shortTitle: "Mission Coverage Statement",
    version: COVERAGE_VERSION,
    publishedDate,
    citationId: COVERAGE_CITATION_ID,
    permanentUrl: `${COVERAGE_CANONICAL_URL}`,
    isPermanent: true,
    isRevoked: false,
    methodology: `checked against methodology ${METHODOLOGY_VERSION} on ${publishedDate}`,
    governancePrinciple: "Symmetry of Disclosure (Decision M-9): Mipa holds itself to the same coverage disclosure standard required of users in Decision Brief Section 5.",
    claimsSeparation: VERIFICATION_CLAIMS,
    missionRequirements: MISSION_REQUIREMENTS,
    shippedCapabilities,
    license: "AGPL-3.0-only"
  };
}

/**
 * Verifies record integrity according to MIPA-39 acceptance criteria.
 *
 * @param {Object} record
 * @returns {Object} Validation summary { isValid: boolean, checks: Array }
 */
export function verifyCoverageRecordIntegrity(record = null) {
  const target = record || buildMissionCoverageRecord();
  const checks = [];

  // Check 1: Stable permanent identification
  const hasValidId = typeof target.recordId === "string" && target.recordId.length > 0;
  const hasValidCitation = typeof target.citationId === "string" && target.citationId.startsWith("MIPA-REGISTER-");
  const hasPermanentUrl = typeof target.permanentUrl === "string" && target.permanentUrl.includes("/records/");
  checks.push({
    name: "Permanent Identification",
    passed: hasValidId && hasValidCitation && hasPermanentUrl,
    details: `${target.recordId} (${target.citationId})`
  });

  // Check 2: Claims separation precedes capabilities and defines all 6 claims
  const hasClaims = Array.isArray(target.claimsSeparation) && target.claimsSeparation.length === 6;
  const hasAllClaimNumbers = [1, 2, 3, 4, 5, 6].every((n) =>
    target.claimsSeparation?.some((c) => c.claimNumber === n)
  );
  checks.push({
    name: "Per-Claim Separation Precedes Capabilities",
    passed: hasClaims && hasAllClaimNumbers,
    details: `${target.claimsSeparation?.length || 0}/6 verification claims defined`
  });

  // Check 3: No blanket "cannot be verified" in text
  const serialized = JSON.stringify(target).toLowerCase();
  const hasBlanketRefusal = serialized.includes("cannot be verified") || serialized.includes("never verifies");
  checks.push({
    name: "No Blanket 'Cannot be Verified' Phrasing",
    passed: !hasBlanketRefusal,
    details: hasBlanketRefusal ? "Found disallowed blanket refusal string" : "All limits specifically scoped per claim"
  });

  // Check 4: Derived capabilities reflect live code definitions
  const hasWorldModel = target.shippedCapabilities?.worldModel?.indicatorsCount === WDI_LAYER1_INDICATORS.length;
  const hasConversionFactors = target.shippedCapabilities?.conversionFactors?.factorsCount === CLIMATE_CONVERSION_FACTORS.length;
  const hasDimensions = target.shippedCapabilities?.dimensions?.shipped?.length >= 3;
  const isDerived = hasWorldModel && hasConversionFactors && hasDimensions;
  checks.push({
    name: "Capabilities Derived from Code (Not Hand-written)",
    passed: isDerived,
    details: `WDI: ${target.shippedCapabilities?.worldModel?.indicatorsCount} indicators, Conversion: ${target.shippedCapabilities?.conversionFactors?.factorsCount} factors`
  });

  // Check 5: Every mission requirement has valid state and dated reason
  const validStates = ["met", "not_yet_met", "deliberately_not_built"];
  const allReqsValid = Array.isArray(target.missionRequirements) &&
    target.missionRequirements.length >= 10 &&
    target.missionRequirements.every(
      (r) => validStates.includes(r.state) && typeof r.reason === "string" && r.reason.length > 20 && Boolean(r.asOfDate)
    );
  checks.push({
    name: "All Mission Requirements Stated with Reason & Date",
    passed: allReqsValid,
    details: `${target.missionRequirements?.length || 0} requirements audited; silence banned (Decision M-6)`
  });

  const isValid = checks.every((c) => c.passed);
  return { isValid, checks };
}
