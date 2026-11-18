import { detectFeedbackLoops, detectSystemArchetypes } from "@/utils/systemDynamics";
import { runMonteCarloSimulation } from "@/utils/monteCarlo";
import { isWorldFactor } from "@/utils/worldModel";

/**
 * Builds a structured, self-contained executive model dossier.
 *
 * @param {Object} params
 * @param {Object} params.model
 * @param {Array} params.nodes
 * @param {Array} params.actions
 * @param {Object} [params.org]
 * @param {Object} [params.perturbations] Map of nodeId -> percentage shift (e.g. +20, -15)
 * @returns {Object} Structured dossier summary
 */
export function buildDossierSummary({
  model = {},
  nodes = [],
  actions = [],
  org = null,
  perturbations = {}
}) {
  const modelTitle = model.name || "Strategic Coordination Model";
  const modelDescription = model.description || "";
  const orgName = (org && org.name) || model.orgName || "Strategic Leadership Council";
  const tier = (org && org.subscriptionTier) || "community";
  const isUnbranded = tier === "pro" || tier === "enterprise";

  // Build factor list with in-memory sandbox perturbation values
  const factorSummaries = (nodes || []).map(node => {
    const shiftPercent = Number(perturbations[node.id]) || 0;
    const baseVal = Number(node.initialValue) || 0;
    const perturbedVal = shiftPercent !== 0 ? baseVal * (1 + shiftPercent / 100) : baseVal;

    const sourceCitation =
      node.sourceCitation ||
      (node.provenance && (node.provenance.citation || node.provenance.authority)) ||
      "";
    const citationUrl =
      node.citationUrl ||
      (node.provenance && node.provenance.canonicalCitationUrl) ||
      "";
    const licence =
      node.licence ||
      node.license ||
      (node.provenance && (node.provenance.licence || node.provenance.license)) ||
      "";
    const isWorld = Boolean(node.isWorldFactor || isWorldFactor(node));

    return {
      id: node.id,
      symbol: node.symbol || node.name || "F",
      name: node.name || node.symbol || "Factor",
      baseValue: baseVal,
      perturbedValue: Number(perturbedVal.toFixed(2)),
      shiftPercent,
      formula: node.formula || "",
      units: node.units || node.unit || "",
      description: node.description || node.notes || "",
      sourceCitation,
      citationUrl,
      licence,
      license: licence,
      isWorldFactor: isWorld,
      version: node.version || "",
      provenance: node.provenance || null
    };
  });

  // Collect shipped world factors and sourced factors for provenance audit
  const worldFactors = factorSummaries.filter(
    (f) => f.isWorldFactor || f.licence || f.citationUrl
  );

  // Sort candidate actions by simulated leverage descending
  const rankedActions = [...(actions || [])].sort((a, b) => {
    const levA = Number(a.actionLeverage) || 0;
    const levB = Number(b.actionLeverage) || 0;
    return levB - levA;
  });

  // System dynamics structural analysis
  const loops = detectFeedbackLoops(nodes || []);
  const archetypes = detectSystemArchetypes(nodes || [], loops);

  // Monte Carlo distribution across top actions
  let monteCarloSummary = null;
  if (rankedActions.length > 0) {
    const topAction = rankedActions[0];
    monteCarloSummary = runMonteCarloSimulation(topAction, {
      iterations: 300
    });
  }

  const attributionFooter = isUnbranded
    ? null
    : "Simulated on collective-change.org · An Open Platform for Strategic Coordination";

  return {
    modelTitle,
    modelDescription,
    orgName,
    tier,
    isUnbranded,
    factorsCount: factorSummaries.length,
    actionsCount: rankedActions.length,
    factors: factorSummaries,
    worldFactors,
    rankedActions,
    loopsCount: loops.length,
    reinforcingLoopsCount: loops.filter(l => l.polarity === "reinforcing").length,
    balancingLoopsCount: loops.filter(l => l.polarity === "balancing").length,
    archetypes,
    topAction: rankedActions[0] || null,
    monteCarloSummary,
    attributionFooter,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Triggers the browser print dialog optimized for saving as an Executive PDF Brief.
 *
 * @param {string} [title] Document title for PDF filename
 */
export function printDossierBrief(title = "Mipa Strategic Dossier") {
  const originalTitle = document.title;
  document.title = `${title} - Executive Decision Brief`;
  if (typeof window !== "undefined" && typeof window.print === "function") {
    window.print();
  }
  document.title = originalTitle;
}
