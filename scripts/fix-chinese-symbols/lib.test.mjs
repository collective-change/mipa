import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isInvalidSymbol,
  replaceSymbolsInFormula,
  suggestEnglishSymbol,
  planModelMigration
} from "./lib.mjs";

describe("fix-chinese-symbols lib", () => {
  describe("isInvalidSymbol", () => {
    it("flags non-ASCII / Chinese symbols as invalid", () => {
      assert.equal(isInvalidSymbol("志工招募"), true);
      assert.equal(isInvalidSymbol("成本A"), true);
      assert.equal(isInvalidSymbol("123abc"), true);
      assert.equal(isInvalidSymbol("with space"), true);
      assert.equal(isInvalidSymbol("with-dash"), true);
      assert.equal(isInvalidSymbol(""), true);
    });

    it("accepts valid camelCase or snake_case ASCII symbols", () => {
      assert.equal(isInvalidSymbol("volunteerHours"), false);
      assert.equal(isInvalidSymbol("total_cost"), false);
      assert.equal(isInvalidSymbol("cost1"), false);
      assert.equal(isInvalidSymbol("_hourlyRate"), false);
    });
  });

  describe("replaceSymbolsInFormula", () => {
    it("safely replaces Chinese symbols with ASCII symbols", () => {
      const formula = "delay(志工招募, dt, 0) + 志工 * 2";
      const replacements = [
        { oldSymbol: "志工招募", newSymbol: "volunteerRecruitment" },
        { oldSymbol: "志工", newSymbol: "volunteers" }
      ];
      const updated = replaceSymbolsInFormula(formula, replacements);
      assert.equal(
        updated,
        "delay(volunteerRecruitment, dt, 0) + volunteers * 2"
      );
    });

    it("does not replace substrings when a shorter symbol is a substring of another", () => {
      // Regardless of array order, longer symbols must be replaced first
      const formula = "志工 + 志工培訓時數";
      const replacements = [
        { oldSymbol: "志工", newSymbol: "volunteers" },
        { oldSymbol: "志工培訓時數", newSymbol: "volunteerTrainingHours" }
      ];
      const updated = replaceSymbolsInFormula(formula, replacements);
      assert.equal(updated, "volunteers + volunteerTrainingHours");
    });

    it("preserves formulas that do not mention the symbols", () => {
      const formula = "price * quantity";
      const replacements = [
        { oldSymbol: "志工", newSymbol: "volunteers" }
      ];
      const updated = replaceSymbolsInFormula(formula, replacements);
      assert.equal(updated, "price * quantity");
    });
  });

  describe("suggestEnglishSymbol", () => {
    it("suggests meaningful English symbols for Tzu Chi domain terms", () => {
      assert.equal(suggestEnglishSymbol("志工招募人數"), "volunteerRecruitmentCount");
      assert.equal(suggestEnglishSymbol("志工服務時數"), "volunteerServiceHours");
      assert.equal(suggestEnglishSymbol("善款收入"), "donationIncome");
      assert.equal(suggestEnglishSymbol("物資發放成本"), "reliefDistribution");
      assert.equal(suggestEnglishSymbol("醫療援助"), "medicalAid");
      assert.equal(suggestEnglishSymbol("環保站回收量"), "recyclingStation");
    });

    it("avoids conflicts with existing symbols", () => {
      const taken = new Set(["volunteerCount"]);
      const suggested = suggestEnglishSymbol("志工人數", taken);
      assert.equal(suggested, "volunteerCount2");
    });
  });

  describe("planModelMigration", () => {
    it("plans migration for factors and all referring formulas", () => {
      const nodes = [
        {
          id: "node1",
          name: "志工服務時數",
          symbol: "志工服務時數",
          symbolFormula: "delay(志工服務時數, dt, 0)"
        },
        {
          id: "node2",
          name: "平均時薪",
          symbol: "hourlyCost",
          symbolFormula: "150"
        },
        {
          id: "node3",
          name: "服務總成本",
          symbol: "totalCost",
          symbolFormula: "志工服務時數 * hourlyCost"
        }
      ];

      const plan = planModelMigration(nodes);
      assert.ok(plan);
      assert.equal(plan.invalidCount, 1);
      assert.equal(plan.replacements.length, 1);
      assert.equal(plan.replacements[0].oldSymbol, "志工服務時數");
      assert.equal(plan.replacements[0].newSymbol, "volunteerServiceHours");

      // Check updates: node1's symbol and formula, and node3's formula
      const node1Update = plan.updates.find(u => u.id === "node1");
      assert.ok(node1Update);
      assert.equal(node1Update.newSymbol, "volunteerServiceHours");
      assert.equal(node1Update.newFormula, "delay(volunteerServiceHours, dt, 0)");

      const node3Update = plan.updates.find(u => u.id === "node3");
      assert.ok(node3Update);
      assert.equal(node3Update.symbolChanged, false);
      assert.equal(node3Update.formulaChanged, true);
      assert.equal(node3Update.newFormula, "volunteerServiceHours * hourlyCost");

      // node2 is unchanged
      const node2Update = plan.updates.find(u => u.id === "node2");
      assert.equal(node2Update, undefined);
    });

    it("supports explicit mappings over auto-suggestions", () => {
      const nodes = [
        {
          id: "node1",
          name: "志工",
          symbol: "志工",
          symbolFormula: "10"
        }
      ];
      const mappings = {
        node1: "volunteersActive"
      };
      const plan = planModelMigration(nodes, mappings);
      assert.equal(plan.replacements[0].newSymbol, "volunteersActive");
    });
  });
});
