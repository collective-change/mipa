import { describe, it, expect } from "vitest";
import {
  FORMULA_PRIMITIVES,
  validateFormulaSyntax,
  getFactorSuggestions,
  insertSnippetIntoFormula,
  toSysFormula,
  getInvalidFormulaCharacters
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

    it("allows $ in valid factor references and resolves linked/unlinked states (MIPA-25)", () => {
      // 1. Linked factor reference with $<nodeId>
      const linkedRes = validateFormulaSyntax("$node_volunteers * 2", {
        availableSymbols: ["volunteers"],
        allNodes: mockNodes,
        currentNodeId: "node_meals"
      });
      expect(linkedRes.valid).toBe(true);
      expect(linkedRes.usedSymbols).toContain("$node_volunteers");
      expect(linkedRes.unlinkedSymbols).toEqual([]);
      expect(linkedRes.unknownSymbols).toEqual([]);

      // 2. Unlinked factor reference with $<nodeId>
      const unlinkedRes = validateFormulaSyntax("$node_food_cost * 2", {
        availableSymbols: ["volunteers"], // costPerMeal not linked yet
        allNodes: mockNodes,
        currentNodeId: "node_meals"
      });
      expect(unlinkedRes.valid).toBe(true);
      expect(unlinkedRes.unlinkedSymbols.length).toBe(1);
      expect(unlinkedRes.unlinkedSymbols[0].nodeId).toBe("node_food_cost");
      expect(unlinkedRes.unlinkedSymbols[0].symbol).toBe("$node_food_cost");

      // 3. Self-reference with $<currentNodeId> (e.g. in delay)
      const selfRes = validateFormulaSyntax("delay($node_meals, dt, 0)", {
        availableSymbols: ["volunteers"],
        allNodes: mockNodes,
        currentNodeId: "node_meals"
      });
      expect(selfRes.valid).toBe(true);
      expect(selfRes.unlinkedSymbols).toEqual([]);
      expect(selfRes.unknownSymbols).toEqual([]);

      // 4. Unknown factor reference with $<unknownNodeId>
      const unknownRes = validateFormulaSyntax("$nonExistentNode * 2", {
        availableSymbols: ["volunteers"],
        allNodes: mockNodes,
        currentNodeId: "node_meals"
      });
      expect(unknownRes.valid).toBe(true);
      expect(unknownRes.unknownSymbols).toContain("$nonExistentNode");

      // 5. Bare '$' or '$$' or invalid dollar references are rejected as syntax errors
      const bareDollar = validateFormulaSyntax("$");
      expect(bareDollar.valid).toBe(false);
      expect(bareDollar.errorType).toBe("syntax");

      const doubleDollar = validateFormulaSyntax("$$node_volunteers");
      expect(doubleDollar.valid).toBe(false);
      expect(doubleDollar.errorType).toBe("syntax");

      const trailingDollar = validateFormulaSyntax("volunteers + $");
      expect(trailingDollar.valid).toBe(false);
      expect(trailingDollar.errorType).toBe("syntax");
    });
  });

  describe("getInvalidFormulaCharacters (MIPA-25)", () => {
    it("returns empty array for valid formula characters including $", () => {
      expect(getInvalidFormulaCharacters("volunteers * 2 + delay(volunteers, dt, 0)")).toEqual([]);
      expect(getInvalidFormulaCharacters("$node_volunteers * 10.5 - 3 / 2 ^ 2")).toEqual([]);
      expect(getInvalidFormulaCharacters("a ? b : c")).toEqual([]);
      expect(getInvalidFormulaCharacters("")).toEqual([]);
      expect(getInvalidFormulaCharacters(null)).toEqual([]);
    });

    it("identifies and names offending characters", () => {
      expect(getInvalidFormulaCharacters("volunteers @ 2")).toEqual(["@"]);
      expect(getInvalidFormulaCharacters("100 # 50 & 20 ~ 5")).toEqual(["#", "&", "~"]);
      expect(getInvalidFormulaCharacters("test!value")).toEqual(["!"]);
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

  describe("toSysFormula (MIPA-8)", () => {
    it("resolves bare factor short names to $<nodeId> in formulas", () => {
      const result = toSysFormula("volunteers * costPerMeal", mockNodes, {
        id: "node_meals",
        symbol: "mealsServed",
        influencers: []
      });

      expect(result.sysFormula).toBe("$node_volunteers * $node_food_cost");
      expect(result.referencedNodeIds).toContain("node_volunteers");
      expect(result.referencedNodeIds).toContain("node_food_cost");
      expect(result.referencedNodeIds).not.toContain("node_meals");
      expect(result.unlinkedSymbols.map(u => u.symbol)).toEqual(
        expect.arrayContaining(["volunteers", "costPerMeal"])
      );
    });

    it("prioritizes longer symbol names over substrings to prevent partial corruption", () => {
      const extendedNodes = [
        ...mockNodes,
        { id: "node_vol_active", symbol: "volunteersActive", name: "Active Volunteers Count", unit: "people" }
      ];

      const result = toSysFormula("volunteersActive + volunteers", extendedNodes, {
        id: "node_meals",
        symbol: "mealsServed",
        influencers: []
      });

      expect(result.sysFormula).toBe("$node_vol_active + $node_volunteers");
    });

    it("preserves already resolved $<nodeId> references without re-replacing or corrupting them", () => {
      const result = toSysFormula("$node_volunteers * 10", mockNodes, {
        id: "node_meals",
        symbol: "mealsServed",
        influencers: ["node_volunteers"]
      });

      expect(result.sysFormula).toBe("$node_volunteers * 10");
      expect(result.referencedNodeIds).toContain("node_volunteers");
      expect(result.unlinkedSymbols).toEqual([]);
    });

    it("handles self-referencing nodes with delay()", () => {
      const result = toSysFormula("delay(mealsServed, dt, 0) + volunteers", mockNodes, {
        id: "node_meals",
        symbol: "mealsServed",
        influencers: []
      });

      expect(result.sysFormula).toBe("delay($node_meals, dt, 0) + $node_volunteers");
      expect(result.referencedNodeIds).toContain("node_volunteers");
      expect(result.referencedNodeIds).not.toContain("node_meals");
    });

    it("returns empty sysFormula and empty references for blank input", () => {
      const result = toSysFormula("", mockNodes);
      expect(result.sysFormula).toBe("");
      expect(result.referencedNodeIds).toEqual([]);
      expect(result.unlinkedSymbols).toEqual([]);
    });

    it("supports Unicode Traditional Chinese factor symbols with proper word boundaries", () => {
      const zhNodes = [
        { id: "node_zh_1", symbol: "志工人數", name: "志工人數", unit: "people" },
        { id: "node_zh_2", symbol: "餐點數量", name: "餐點數量", unit: "meals" }
      ];

      const result = toSysFormula("志工人數 * 10", zhNodes, {
        id: "node_zh_2",
        symbol: "餐點數量",
        influencers: []
      });

      expect(result.sysFormula).toBe("$node_zh_1 * 10");
      expect(result.referencedNodeIds).toContain("node_zh_1");
    });
  });
});
