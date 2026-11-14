import { describe, it, expect } from "vitest";
import {
  FORMULA_PRIMITIVES,
  validateFormulaSyntax,
  getFactorSuggestions,
  insertSnippetIntoFormula
} from "@/utils/formulaHelper";

describe("Formula Helper Utilities for Model Builders", () => {
  const mockNodes = [
    { id: "node_volunteers", symbol: "volunteers", name: "Active Volunteers", unit: "people" },
    { id: "node_meals", symbol: "mealsServed", name: "Meals Served", unit: "meals" },
    { id: "node_food_cost", symbol: "costPerMeal", name: "Cost Per Meal", unit: "USD" },
    { id: "node_budget", symbol: "totalBudget", name: "Total Budget", unit: "USD" }
  ];

  describe("validateFormulaSyntax", () => {
    it("handles empty formula as valid and empty", () => {
      const result = validateFormulaSyntax("");
      expect(result.valid).toBe(true);
      expect(result.empty).toBe(true);
      expect(result.usedSymbols).toEqual([]);
    });

    it("validates correct mathjs formula and extracts symbols", () => {
      const result = validateFormulaSyntax("volunteers * 2 + delay(volunteers, dt, 0)", {
        availableSymbols: ["volunteers"],
        allNodes: mockNodes,
        currentNodeId: "node_meals"
      });

      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
      expect(result.usedSymbols).toContain("volunteers");
      expect(result.unlinkedSymbols).toEqual([]);
      expect(result.unknownSymbols).toEqual([]);
    });

    it("detects syntax error with incomplete expression", () => {
      const result = validateFormulaSyntax("volunteers + * 2");
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("detects unclosed parentheses", () => {
      const result = validateFormulaSyntax("min(volunteers, mealsServed");
      expect(result.valid).toBe(false);
      expect(result.errorType).toBe("parenthesis");
    });

    it("identifies unlinked factors available in the model", () => {
      const result = validateFormulaSyntax("volunteers * costPerMeal", {
        availableSymbols: ["volunteers"], // costPerMeal is not linked yet
        allNodes: mockNodes,
        currentNodeId: "node_meals"
      });

      expect(result.valid).toBe(true);
      expect(result.unlinkedSymbols.length).toBe(1);
      expect(result.unlinkedSymbols[0].symbol).toBe("costPerMeal");
      expect(result.unlinkedSymbols[0].name).toBe("Cost Per Meal");
    });

    it("identifies completely unknown symbols", () => {
      const result = validateFormulaSyntax("volunteers + mysteriousVariable", {
        availableSymbols: ["volunteers"],
        allNodes: mockNodes,
        currentNodeId: "node_meals"
      });

      expect(result.valid).toBe(true);
      expect(result.unknownSymbols).toContain("mysteriousVariable");
    });
  });

  describe("getFactorSuggestions", () => {
    it("returns suggestions filtered by token matching symbol or name", () => {
      const suggestions = getFactorSuggestions("meal", mockNodes, "node_volunteers", ["node_meals"]);
      expect(suggestions.length).toBe(2);
      expect(suggestions.map((s) => s.symbol)).toContain("mealsServed");
      expect(suggestions.map((s) => s.symbol)).toContain("costPerMeal");
    });

    it("prioritizes currently linked influencers at the top", () => {
      const suggestions = getFactorSuggestions("", mockNodes, "node_volunteers", ["node_food_cost"]);
      expect(suggestions[0].symbol).toBe("costPerMeal");
    });

    it("excludes the current node from suggestions", () => {
      const suggestions = getFactorSuggestions("", mockNodes, "node_volunteers", []);
      expect(suggestions.find((s) => s.id === "node_volunteers")).toBeUndefined();
    });
  });

  describe("insertSnippetIntoFormula", () => {
    it("inserts snippet at cursor position", () => {
      const result = insertSnippetIntoFormula("volunteers + ", "costPerMeal", 13, 13);
      expect(result.newFormula).toBe("volunteers + costPerMeal");
      expect(result.newCursorPosition).toBe(24);
    });

    it("replaces typed token prefix with selected factor symbol", () => {
      // User typed "vol" (start: 3, end: 3)
      const result = insertSnippetIntoFormula("vol", "volunteers", 3, 3, "vol");
      expect(result.newFormula).toBe("volunteers");
      expect(result.newCursorPosition).toBe(10);
    });

    it("replaces selected text range with primitive snippet", () => {
      const result = insertSnippetIntoFormula("10 + x", "min(a, b)", 5, 6);
      expect(result.newFormula).toBe("10 + min(a, b)");
    });
  });

  describe("FORMULA_PRIMITIVES", () => {
    it("includes system dynamics and mathjs primitives", () => {
      const ids = FORMULA_PRIMITIVES.map((p) => p.id);
      expect(ids).toContain("delay");
      expect(ids).toContain("conditional");
      expect(ids).toContain("min");
      expect(ids).toContain("max");
    });
  });
});
