/**
 * src/utils/dimensions.js
 *
 * Mipa World Dimensions & Governance Architecture (MIPA-33 / Decisions M-5, M-6, M-7, M-8).
 *
 * Requirements:
 * 1. A world dimension must declare its kind: exactly one of "value", "limit", or "label".
 *    - "value": a factor. May carry a weight (named, dated, off by default). Without weight,
 *      it MUST NOT be summed into netBenefit.
 *    - "limit": a non-tradeable guardrail/boundary (Decision M-5: no code path converts it to money).
 *    - "label": tags only (Decision M-6: navigates, never scores; no SDG produces a figure).
 * 2. Three legitimate states (silence is banned, not display):
 *    - weighted: carries a named, dated weight and can change the ranking.
 *    - shown_unweighted: rendered as a fact in physical units, explicitly labelled
 *      "not included in the score", and listed in the document's coverage statement.
 *    - not_modelled: omitted from the simulation model.
 * 3. Weight attribution (Decision M-8):
 *    - A weight's source is a first-class field: "org" | "counterparty" | "published standard",
 *      each named and dated. A record must be able to say whose weight produced the number.
 * 4. First instances:
 *    - Value + named weight -> Animal Welfare (Five Domains framework, physical units: animal-years).
 *    - Label -> SDG tagging (actions carry SDG target tags; published crosswalk to world indicators).
 *    - Limit -> Boundary constraints (guardrails that block, never trade against money).
 */

export const DIMENSION_KINDS = {
  VALUE: "value",
  LIMIT: "limit",
  LABEL: "label"
};

export const WEIGHT_SOURCE_TYPES = {
  ORG: "org",
  COUNTERPARTY: "counterparty",
  PUBLISHED_STANDARD: "published standard"
};

export const DIMENSION_STATES = {
  WEIGHTED: "weighted",
  SHOWN_UNWEIGHTED: "shown_unweighted",
  NOT_MODELLED: "not_modelled"
};

/**
 * Published crosswalk mapping world model indicators to UN Sustainable Development Goals (SDGs).
 * "A label navigates; a number scores. No SDG ever produces a figure."
 */
export const SDG_INDICATOR_CROSSWALK = [
  {
    indicatorCode: "EN.ATM.CO2E.PC",
    indicatorName: "CO2 emissions per capita",
    sdgTarget: "SDG 13.2",
    sdgTitle: "Climate Action: Integrate climate change measures into national policies",
    dimensionKind: "label"
  },
  {
    indicatorCode: "SI.POV.DDAY",
    indicatorName: "Poverty headcount ratio at $2.15 a day",
    sdgTarget: "SDG 1.1",
    sdgTitle: "No Poverty: Eradicate extreme poverty for all people everywhere",
    dimensionKind: "label"
  },
  {
    indicatorCode: "EG.ELC.ACCS.ZS",
    indicatorName: "Access to electricity",
    sdgTarget: "SDG 7.1",
    sdgTitle: "Affordable & Clean Energy: Universal access to affordable, reliable modern energy",
    dimensionKind: "label"
  },
  {
    indicatorCode: "EG.FEC.RNEW.ZS",
    indicatorName: "Renewable energy consumption (% of total)",
    sdgTarget: "SDG 7.2",
    sdgTitle: "Affordable & Clean Energy: Increase substantially the share of renewable energy",
    dimensionKind: "label"
  },
  {
    indicatorCode: "SE.SEC.ENRR",
    indicatorName: "School enrollment, secondary (% gross)",
    sdgTarget: "SDG 4.1",
    sdgTitle: "Quality Education: Free, equitable and quality primary and secondary education",
    dimensionKind: "label"
  },
  {
    indicatorCode: "SH.XPD.CHEX.PC.CD",
    indicatorName: "Current health expenditure per capita",
    sdgTarget: "SDG 3.8",
    sdgTitle: "Good Health: Universal health coverage and access to quality healthcare",
    dimensionKind: "label"
  },
  {
    indicatorCode: "SL.UEM.TOTL.ZS",
    indicatorName: "Unemployment rate (% of total labor force)",
    sdgTarget: "SDG 8.5",
    sdgTitle: "Decent Work: Full and productive employment and decent work for all",
    dimensionKind: "label"
  },
  {
    indicatorCode: "AG.LND.FRST.ZS",
    indicatorName: "Forest area (% of land area)",
    sdgTarget: "SDG 15.1",
    sdgTitle: "Life on Land: Conserve and restore terrestrial and freshwater ecosystems",
    dimensionKind: "label"
  },
  {
    indicatorCode: "SP.POP.TOTL",
    indicatorName: "Population, total",
    sdgTarget: "SDG 11.a",
    sdgTitle: "Sustainable Cities: Support positive economic, social and environmental links",
    dimensionKind: "label"
  },
  {
    indicatorCode: "dim_animal_confinement",
    indicatorName: "Days in Confinement / Animal Suffering",
    sdgTarget: "SDG 12.4",
    sdgTitle: "Responsible Consumption: Environmentally sound agricultural management",
    dimensionKind: "label"
  }
];

/**
 * Canonical Animal Welfare Dimension definition (Decision M-7).
 *
 * Physical indicators: countable, physical units, sourced from the Five Domains Model.
 * Moral weight: off by default; named, dated, overridable; shows uncertainty band.
 */
export const ANIMAL_WELFARE_DIMENSION = {
  id: "dim_animal_welfare",
  name: "Animal Welfare",
  kind: DIMENSION_KINDS.VALUE,
  physicalUnit: "animal-years",
  framework: "Five Domains Model (Mellor et al., 2020)",
  citationUrl: "https://doi.org/10.3390/ani10101870",
  description: "Countable physical suffering, confinement, and mortality across animal lifespans.",
  indicators: [
    { id: "animals_affected", name: "Animals Affected", unit: "animals" },
    { id: "animal_years", name: "Animal Years of Suffering", unit: "animal-years" },
    { id: "days_in_confinement", name: "Days in Confinement", unit: "days" },
    { id: "pre_slaughter_mortality", name: "Pre-slaughter Mortality Rate", unit: "%" },
    { id: "stocking_density", name: "Stocking Density", unit: "animals/m²" },
    { id: "antibiotic_use", name: "Antibiotic Use per Animal", unit: "mg/animal" }
  ],
  // Moral weight: off by default
  weight: {
    enabled: false,
    value: 0,
    uncertaintyBand: { min: 0.1, max: 0.5 },
    source: WEIGHT_SOURCE_TYPES.ORG,
    sourceName: "",
    sourceDate: "",
    author: ""
  }
};

/**
 * Canonical SDG Label Dimension definition.
 * Labels navigate; never scores.
 */
export const SDG_LABEL_DIMENSION = {
  id: "dim_sdg_tagging",
  name: "Sustainable Development Goals (SDG)",
  kind: DIMENSION_KINDS.LABEL,
  description: "UN 2030 Agenda SDG target navigation tags. Labels navigate; never scores.",
  crosswalk: SDG_INDICATOR_CROSSWALK
};

/**
 * Canonical Boundary Constraint Limit Dimension definition (Decision M-5).
 * Limits block; never traded against money.
 */
export const BOUNDARY_LIMIT_DIMENSION = {
  id: "dim_boundary_constraints",
  name: "Planetary & Social Boundaries",
  kind: DIMENSION_KINDS.LIMIT,
  physicalUnit: "threshold",
  description: "Non-tradeable constraint guardrails. Money adds up; limits block and never enter the net."
};

/**
 * Declares and validates a world dimension object.
 *
 * @param {Object} config
 * @param {string} config.id
 * @param {string} config.name
 * @param {string} config.kind - "value" | "limit" | "label"
 * @param {string} [config.physicalUnit]
 * @param {string} [config.framework]
 * @param {Object} [config.weight]
 * @returns {Object} Validated dimension
 */
export function declareDimension(config = {}) {
  if (!config.id || typeof config.id !== "string") {
    throw new Error("Dimension must have a non-empty string 'id'.");
  }
  if (!config.name || typeof config.name !== "string") {
    throw new Error("Dimension must have a non-empty string 'name'.");
  }

  const kind = String(config.kind || "").toLowerCase();
  const validKinds = Object.values(DIMENSION_KINDS);
  if (!validKinds.includes(kind)) {
    throw new Error(`Dimension kind must be one of [${validKinds.join(", ")}], received: "${config.kind}".`);
  }

  // Enforcement of M-5: Limits cannot be monetized or weighted into the net
  if (kind === DIMENSION_KINDS.LIMIT && config.weight && config.weight.enabled) {
    throw new Error("A limit dimension cannot carry an active monetization weight (Decision M-5: money adds up, limits block).");
  }

  // Enforcement of M-6: Labels navigate, never score
  if (kind === DIMENSION_KINDS.LABEL && config.weight && config.weight.enabled) {
    throw new Error("A label dimension cannot carry an active monetization weight (Decision M-6: a label navigates, never scores).");
  }

  const weight = config.weight
    ? {
        enabled: Boolean(config.weight.enabled),
        value: Number(config.weight.value) || 0,
        uncertaintyBand: config.weight.uncertaintyBand || null,
        source: config.weight.source || WEIGHT_SOURCE_TYPES.ORG,
        sourceName: String(config.weight.sourceName || ""),
        sourceDate: String(config.weight.sourceDate || ""),
        author: String(config.weight.author || "")
      }
    : {
        enabled: false,
        value: 0,
        uncertaintyBand: null,
        source: WEIGHT_SOURCE_TYPES.ORG,
        sourceName: "",
        sourceDate: "",
        author: ""
      };

  return {
    id: config.id,
    name: config.name,
    kind,
    physicalUnit: config.physicalUnit || "",
    framework: config.framework || "",
    citationUrl: config.citationUrl || "",
    description: config.description || "",
    indicators: Array.isArray(config.indicators) ? config.indicators : [],
    weight,
    sdgTargets: Array.isArray(config.sdgTargets) ? config.sdgTargets : []
  };
}

/**
 * Returns the three-state governance status of a dimension (Decision M-6).
 *
 * @param {Object} dimension
 * @returns {"weighted" | "shown_unweighted" | "not_modelled"}
 */
export function getDimensionState(dimension) {
  if (!dimension || typeof dimension !== "object") {
    return DIMENSION_STATES.NOT_MODELLED;
  }
  if (dimension.kind === DIMENSION_KINDS.VALUE) {
    if (dimension.weight && dimension.weight.enabled && Number(dimension.weight.value) > 0) {
      return DIMENSION_STATES.WEIGHTED;
    }
    return DIMENSION_STATES.SHOWN_UNWEIGHTED;
  }
  if (dimension.kind === DIMENSION_KINDS.LIMIT) {
    return DIMENSION_STATES.SHOWN_UNWEIGHTED;
  }
  if (dimension.kind === DIMENSION_KINDS.LABEL) {
    return DIMENSION_STATES.SHOWN_UNWEIGHTED;
  }
  return DIMENSION_STATES.NOT_MODELLED;
}

/**
 * Formats a weight's source as a first-class, rendered attribution string (Decision M-8).
 *
 * @param {Object} weight
 * @param {Object} [options]
 * @param {boolean} [options.isZh=false]
 * @returns {string} e.g. "Published standard: Five Domains (Author: Dr. David Mellor, 2026-11-18)"
 */
export function formatDimensionWeightSource(weight = {}, { isZh = false } = {}) {
  if (!weight || !weight.enabled) {
    return isZh ? "未加權（預設關閉）" : "Unweighted (Off by default)";
  }

  const sourceType = weight.source || WEIGHT_SOURCE_TYPES.ORG;
  const sourceName = weight.sourceName ? `"${weight.sourceName}"` : (isZh ? "未命名來源" : "Unnamed source");
  const author = weight.author ? (isZh ? `制定者：${weight.author}` : `Author: ${weight.author}`) : "";
  const date = weight.sourceDate ? (isZh ? `日期：${weight.sourceDate}` : `Date: ${weight.sourceDate}`) : "";
  const details = [author, date].filter(Boolean).join(", ");

  let typeLabel;
  if (sourceType === WEIGHT_SOURCE_TYPES.COUNTERPARTY) {
    typeLabel = isZh ? "對手方標準 (Counterparty)" : "Counterparty requirement";
  } else if (sourceType === WEIGHT_SOURCE_TYPES.PUBLISHED_STANDARD) {
    typeLabel = isZh ? "公開標準 (Published standard)" : "Published standard";
  } else {
    typeLabel = isZh ? "組織內部權重 (Org)" : "Organization weight";
  }

  return `${typeLabel}: ${sourceName}${details ? ` (${details})` : ""}`;
}

/**
 * Generates the Section 5 coverage statement for decision briefs and dossiers.
 *
 * Every unweighted dimension is listed with its physical units and the explicit label:
 * "not included in the score" (en-us) / "未計入評分" (zh-tw).
 *
 * @param {Array|Object} modelOrDimensions Model object or array of dimensions
 * @param {Object} [options]
 * @param {boolean} [options.isZh=false]
 * @returns {Object} Structured coverage statement
 */
export function generateCoverageStatement(modelOrDimensions = [], { isZh = false } = {}) {
  const dimensions = Array.isArray(modelOrDimensions)
    ? modelOrDimensions
    : (modelOrDimensions && modelOrDimensions.dimensions) || [];

  const weighted = [];
  const unweighted = [];

  for (const dim of dimensions) {
    const state = getDimensionState(dim);
    if (state === DIMENSION_STATES.WEIGHTED) {
      weighted.push({
        id: dim.id,
        name: dim.name,
        kind: dim.kind,
        weight: dim.weight?.value,
        weightSource: formatDimensionWeightSource(dim.weight, { isZh }),
        physicalUnit: dim.physicalUnit || ""
      });
    } else {
      unweighted.push({
        id: dim.id,
        name: dim.name,
        kind: dim.kind,
        physicalUnit: dim.physicalUnit || "physical units",
        label: isZh ? "not included in the score（未計入評分）" : "not included in the score",
        state: "shown_unweighted"
      });
    }
  }

  let statementText;
  if (isZh) {
    statementText = "維度評估涵蓋範圍聲明（Dimension Coverage Statement）：\n" +
      (weighted.length > 0
        ? `一、計入綜合評分之維度（已賦權）：\n${weighted.map(w => `- ${w.name}：權重值 ${w.weight}，來源：${w.weightSource}`).join("\n")}\n\n`
        : "一、計入綜合評分之維度：無額外外部加權維度。\n\n") +
      (unweighted.length > 0
        ? `二、呈現於決策文件但未計入評分之實體指標（not included in the score）：\n${unweighted.map(u => `- ${u.name}（單位：${u.physicalUnit}）：以實體計量揭露，not included in the score（未計入評分）`).join("\n")}`
        : "二、未計入評分之維度：無。");
  } else {
    statementText = "Dimension Coverage Statement (Scope of Quantified Scoring):\n" +
      (weighted.length > 0
        ? `1. Dimensions Included in the Score (Weighted):\n${weighted.map(w => `- ${w.name}: Weight ${w.weight} (${w.weightSource})`).join("\n")}\n\n`
        : "1. Dimensions Included in the Score: Core operational factors only.\n\n") +
      (unweighted.length > 0
        ? `2. Dimensions Shown as Physical Facts (Not Included in the Score):\n${unweighted.map(u => `- ${u.name} (${u.physicalUnit}): rendered in physical units, not included in the score`).join("\n")}`
        : "2. Dimensions Shown as Physical Facts: None.");
  }

  return {
    weighted,
    unweighted,
    statementText
  };
}

/**
 * Adds the canonical Animal Welfare dimension to a model (Decision M-7).
 *
 * @param {Object} model Model object
 * @param {Object} [options]
 * @param {Object} [options.weight] Optional custom weight config (off by default)
 * @returns {Object} Updated model with animal welfare dimension and indicator factor nodes
 */
export function addAnimalWelfareDimensionToModel(model = {}, { weight = null } = {}) {
  const updatedModel = { ...model };
  const existingDimensions = Array.isArray(updatedModel.dimensions) ? [...updatedModel.dimensions] : [];

  const dimConfig = JSON.parse(JSON.stringify(ANIMAL_WELFARE_DIMENSION));
  if (weight) {
    dimConfig.weight = {
      enabled: Boolean(weight.enabled),
      value: Number(weight.value) || 0,
      uncertaintyBand: weight.uncertaintyBand || { min: 0.1, max: 0.5 },
      source: weight.source || WEIGHT_SOURCE_TYPES.ORG,
      sourceName: String(weight.sourceName || ""),
      sourceDate: String(weight.sourceDate || ""),
      author: String(weight.author || "")
    };
  }

  // Remove existing if present to avoid duplication
  const filtered = existingDimensions.filter(d => d.id !== dimConfig.id);
  filtered.push(dimConfig);
  updatedModel.dimensions = filtered;

  return updatedModel;
}

/**
 * Hard architectural invariant guard (Decisions M-5 & M-6):
 * Asserts that NO code path converts a limit or a label into a scalar that enters the net.
 *
 * @param {Array} nodes Model nodes
 * @param {Object} [roleNodes] Map of role node IDs (e.g. orgBenefit, worldBenefit)
 * @throws {Error} if any limit or label factor is designated as an economic benefit or cost
 */
export function assertNoMonetizedLimitsOrLabels(nodes = [], roleNodes = {}) {
  if (!Array.isArray(nodes)) return true;

  const forbiddenRoleKeys = ["orgBenefit", "orgCost", "worldBenefit", "worldCost"];
  const forbiddenNodeIds = new Set();

  for (const rk of forbiddenRoleKeys) {
    if (roleNodes && roleNodes[rk]) {
      forbiddenNodeIds.add(roleNodes[rk]);
    }
  }

  for (const node of nodes) {
    if (!node) continue;
    const isLimit = node.dimensionKind === DIMENSION_KINDS.LIMIT || Boolean(node.isGuardrail);
    const isLabel = node.dimensionKind === DIMENSION_KINDS.LABEL;

    if (isLimit || isLabel) {
      if (forbiddenNodeIds.has(node.id)) {
        throw new Error(
          `Architectural violation (M-5 / M-6): Factor "${node.name || node.id}" has dimension kind "${isLimit ? 'limit' : 'label'}" and cannot be assigned as a monetary net benefit/cost role node.`
        );
      }

      // Check if node has a unit of currency or is tagged as monetized
      const unit = String(node.unit || node.units || "").toUpperCase();
      if ((unit === "USD" || unit === "TWD" || unit === "EUR") && isLimit) {
        throw new Error(
          `Architectural violation (M-5): Limit guardrail "${node.name || node.id}" cannot be defined in a currency unit.`
        );
      }
    }
  }

  return true;
}
