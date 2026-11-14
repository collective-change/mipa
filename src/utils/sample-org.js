// A small, complete example organization that newcomers can create as their
// own copy and explore without risk: a neighbourhood food bank with a model
// and three actions to compare. Texts come from the i18n "sample" keys, so
// the copy is in the language the person is using when they create it.

import { ROLE_SYMBOLS } from "./util-model-draft";

// Money amounts are written in US dollars and scaled for the currency used.
const MONEY_SCALE = { USD: 1, TWD: 30 };

export function sampleCurrencyFor(locale) {
  return /^zh/i.test(locale || "") ? "TWD" : "USD";
}

// t(key): translate. Returns { org, factors, actions } for createSampleOrg.
export function buildSampleOrg(t, currency) {
  const scale = MONEY_SCALE[currency] || 1;
  const money = amount => String(amount * scale);
  const f = (symbol, formula, unit = "", extra = {}) => ({
    symbol,
    formula,
    unit,
    ...extra,
    name: t(`sample.factors.${symbol}.name`),
    notes: t(`sample.factors.${symbol}.notes`)
  });

  const factors = [
    // the role factors every model has
    f(ROLE_SYMBOLS.averageEffortCostPerHour, money(15), currency),
    f(ROLE_SYMBOLS.effort, "0", "workhours"),
    f(ROLE_SYMBOLS.spending, "0", currency),
    f(
      ROLE_SYMBOLS.orgCost,
      `monthlyRunningCosts + ${ROLE_SYMBOLS.spending} + ${ROLE_SYMBOLS.effort} / (1 workhour) * ${ROLE_SYMBOLS.averageEffortCostPerHour}`,
      currency
    ),
    f(ROLE_SYMBOLS.worldCost, "0", currency),
    f(ROLE_SYMBOLS.orgBenefit, "0", currency),
    f(ROLE_SYMBOLS.worldBenefit, "mealsServed * valueOfAMeal", currency),

    // how the food bank works
    f("volunteers", "delay(volunteers, dt, 40) + newVolunteersPerMonth - delay(volunteers, dt, 40) * volunteersLeavingPerMonth"),
    f("newVolunteersPerMonth", "4"),
    f("volunteersLeavingPerMonth", "0.08"),
    f("hoursPerVolunteer", "6"),
    f("mealsPackedPerHour", "10"),
    f("packingCapacity", "volunteers * hoursPerVolunteer * mealsPackedPerHour"),
    f("foodDonatedKg", "2000"),
    f("mealsPerKg", "2"),
    f("foodAvailableInMeals", "foodDonatedKg * mealsPerKg"),
    f("mealsServed", "min(packingCapacity, foodAvailableInMeals)"),
    f("valueOfAMeal", money(3), currency),
    f("monthlyRunningCosts", money(1200), currency),
    // the hourly cost of a role, which some actions use instead of the average
    f("coordinatorPerHour", money(25), currency, { isHourlyCost: true })
  ];

  const impact = (symbol, operation, operand) => ({
    symbol,
    impactType: "if_done",
    operation,
    operand,
    durationType: "forever"
  });
  const actions = [
    {
      key: "recruit",
      estEffortHrs: 40,
      estSpending: 300 * scale,
      impacts: [impact("newVolunteersPerMonth", "+", 2)]
    },
    {
      key: "supermarkets",
      estEffortHrs: 60,
      effortCostSymbol: "coordinatorPerHour",
      estSpending: 0,
      impacts: [impact("foodDonatedKg", "+", 800)]
    },
    {
      key: "report",
      estEffortHrs: 30,
      estSpending: 2000 * scale,
      impacts: []
    }
  ].map(action => ({
    ...action,
    title: t(`sample.actions.${action.key}.title`),
    notes: t(`sample.actions.${action.key}.notes`)
  }));

  return {
    org: {
      name: t("sample.org.name"),
      goal: t("sample.org.goal"),
      currency,
      isSample: true
    },
    factors,
    actions
  };
}
