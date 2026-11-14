/**
 * Cross-Lingual Collaboration Engine
 *
 * Enables multi-language UI localization, multilingual content fields (factors, actions),
 * dual-language subtitle displays, inline user-content translations,
 * and mathematical formula stability across locale switches.
 */

export const SUPPORTED_LOCALES = [
  { code: "en-us", name: "English", nativeName: "English", flag: "🇺🇸" },
  { code: "zh-tw", name: "Traditional Chinese", nativeName: "繁體中文", flag: "🇹🇼" },
  { code: "zh-cn", name: "Simplified Chinese", nativeName: "简体中文", flag: "🇨🇳" },
  { code: "es", name: "Spanish", nativeName: "Español", flag: "🇪🇸" },
  { code: "ja", name: "Japanese", nativeName: "日本語", flag: "🇯🇵" }
];

/**
 * Returns whether a locale code is among the supported application locales.
 */
export function isLocaleSupported(locale) {
  if (!locale) return false;
  const normalized = String(locale).toLowerCase().trim();
  return SUPPORTED_LOCALES.some((l) => l.code === normalized);
}

/**
 * Resolves the localized display text for an entity field.
 *
 * @param {Object} entity - The factor or action object
 * @param {string} field - Field name (e.g. 'name', 'title', 'notes', 'description')
 * @param {string} targetLocale - Target locale (e.g. 'en-us', 'zh-tw', 'es', 'ja')
 * @param {string} [fallback] - Optional default text if translation not found
 * @returns {string} Localized text
 */
export function getLocalizedText(entity = {}, field = "name", targetLocale = "en-us", fallback = "") {
  if (!entity) return fallback;

  const loc = (targetLocale || "en-us").toLowerCase();

  // 1. Check nested translations map: entity.translations?.[field]?.[locale]
  if (entity.translations && entity.translations[field] && entity.translations[field][loc]) {
    return entity.translations[field][loc];
  }

  // 2. Check localized object: entity.localized?.[loc]?.[field]
  if (entity.localized && entity.localized[loc] && entity.localized[loc][field]) {
    return entity.localized[loc][field];
  }

  // 3. Check legacy localizedTitles or localizedNames
  if (field === "title" && entity.localizedTitles && entity.localizedTitles[loc]) {
    return entity.localizedTitles[loc];
  }
  if (field === "name" && entity.localizedNames && entity.localizedNames[loc]) {
    return entity.localizedNames[loc];
  }

  // 4. Default to raw field value on the entity
  return entity[field] ?? fallback ?? "";
}

/**
 * Sets or updates a localized translation for an entity field.
 *
 * @param {Object} entity - Target entity
 * @param {string} field - Field to translate
 * @param {string} locale - Target locale code
 * @param {string} value - Translated text value
 * @returns {Object} Updated entity
 */
export function setLocalizedText(entity = {}, field = "name", locale = "en-us", value = "") {
  if (!entity) return entity;
  const loc = (locale || "en-us").toLowerCase();

  if (!entity.translations) {
    entity.translations = {};
  }
  if (!entity.translations[field]) {
    entity.translations[field] = {};
  }
  entity.translations[field][loc] = value;
  return entity;
}

/**
 * Returns dual-language display configuration for multilingual team alignment.
 * Displays the primary title in user's active language with an optional secondary subtitle.
 *
 * @param {Object} entity - Factor or action
 * @param {string} field - 'name' or 'title'
 * @param {string} currentLocale - Active user locale
 * @param {string} [secondaryLocale="en-us"] - Secondary reference locale
 * @returns {Object} { primary: string, subtitle: string | null }
 */
export function getDualLanguageDisplay(entity = {}, field = "name", currentLocale = "en-us", secondaryLocale = "en-us") {
  const primaryText = getLocalizedText(entity, field, currentLocale, entity[field] || "");
  const current = (currentLocale || "").toLowerCase();
  const secondary = (secondaryLocale || "en-us").toLowerCase();

  // If user is already on the secondary locale, no subtitle needed
  if (current === secondary) {
    return {
      primary: primaryText,
      subtitle: null
    };
  }

  const secondaryText = getLocalizedText(entity, field, secondary, "");
  const hasDistinctSubtitle = secondaryText && secondaryText.trim() !== primaryText.trim();

  return {
    primary: primaryText,
    subtitle: hasDistinctSubtitle ? secondaryText : null
  };
}

/**
 * Validates that a factor formula remains mathematically valid and linguistically neutral.
 * Formula identifiers must consist of ASCII symbols and math operators, ensuring
 * that switching languages never corrupts mathjs calculations or dependency graphs.
 *
 * @param {string} formula - Formula string
 * @returns {boolean} True if formula is linguistically neutral
 */
export function isFormulaLinguisticallyNeutral(formula = "") {
  if (!formula || typeof formula !== "string") return true;

  // Formula should not contain non-ASCII alphabetic characters (like CJK or accented non-ASCII)
  // that would break mathjs tokenization across locale switches
  for (let i = 0; i < formula.length; i++) {
    if (formula.charCodeAt(i) > 127) {
      return false;
    }
  }
  return true;
}

/**
 * Common cross-lingual glossary for instant in-app assistance & offline translations.
 */
export const CORE_GLOSSARY = {
  "en-us": {
    leverage: "Leverage",
    netBenefit: "Net Benefit",
    totalRoi: "Total ROI",
    cost: "Cost",
    hours: "Hours",
    factor: "Factor",
    action: "Action"
  },
  "zh-tw": {
    leverage: "效應比",
    netBenefit: "淨效益",
    totalRoi: "總投報率",
    cost: "經費",
    hours: "工時",
    factor: "要素",
    action: "行動方案"
  },
  "zh-cn": {
    leverage: "效应比",
    netBenefit: "净效益",
    totalRoi: "总投报率",
    cost: "经费",
    hours: "工时",
    factor: "要素",
    action: "行动方案"
  },
  "es": {
    leverage: "Apalancamiento",
    netBenefit: "Beneficio Neto",
    totalRoi: "ROI Total",
    cost: "Costo",
    hours: "Horas",
    factor: "Factor",
    action: "Acción"
  },
  "ja": {
    leverage: "効果比（レバレッジ）",
    netBenefit: "純便益",
    totalRoi: "総投資利益率（ROI）",
    cost: "費用",
    hours: "工数",
    factor: "要素",
    action: "アクション"
  }
};

/**
 * Translates short text strings using connected glossary or returns translated candidate.
 *
 * @param {string} text - Source text
 * @param {string} targetLocale - Target locale
 * @param {string} [sourceLocale="en-us"] - Source locale
 * @returns {string} Translated string
 */
export function translateTextFromGlossary(text = "", targetLocale = "en-us", sourceLocale = "en-us") {
  if (!text) return "";
  const src = (sourceLocale || "en-us").toLowerCase();
  const tgt = (targetLocale || "en-us").toLowerCase();

  if (src === tgt) return text;

  const srcDict = CORE_GLOSSARY[src] || {};
  const tgtDict = CORE_GLOSSARY[tgt] || {};

  // Check if text matches any key in source dictionary
  for (const [key, val] of Object.entries(srcDict)) {
    if (val.toLowerCase() === text.toLowerCase().trim()) {
      if (tgtDict[key]) {
        return tgtDict[key];
      }
    }
  }

  return text;
}
