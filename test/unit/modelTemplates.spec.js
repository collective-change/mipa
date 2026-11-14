import { describe, it, expect } from "vitest";
import {
  PUBLIC_MODEL_TEMPLATES,
  getPublicTemplates,
  getTemplateById,
  exportModelAsShareableTemplate,
  validateAndParseTemplate,
  ONBOARDING_TOUR_STEPS
} from "@/utils/modelTemplates";

describe("Public Model Template Library & Open Ecosystem", () => {
  describe("Public Starter Templates", () => {
    it("provides four rich public starter templates across major sectors", () => {
      const templates = getPublicTemplates();
      expect(templates.length).toBeGreaterThanOrEqual(4);

      const ids = templates.map((t) => t.id);
      expect(ids).toContain("disaster_relief_surge");
      expect(ids).toContain("community_healthcare_clinic");
      expect(ids).toContain("education_digital_literacy");
      expect(ids).toContain("philanthropic_donor_flywheel");
    });

    it("ensures each template has valid nodes and sample actions", () => {
      PUBLIC_MODEL_TEMPLATES.forEach((tpl) => {
        expect(tpl.title).toBeDefined();
        expect(tpl.sector).toBeDefined();
        expect(tpl.attribution).toContain("CC BY-SA 4.0");
        expect(Array.isArray(tpl.nodes)).toBe(true);
        expect(tpl.nodes.length).toBeGreaterThan(0);
        expect(Array.isArray(tpl.sampleActions)).toBe(true);
        expect(tpl.sampleActions.length).toBeGreaterThan(0);

        tpl.nodes.forEach((n) => {
          expect(n.symbol).toMatch(/^[a-zA-Z0-9_]+$/);
          expect(n.name).toBeDefined();
          expect(n.costCategory).toBeDefined();
        });
      });
    });

    it("retrieves template by ID accurately", () => {
      const disaster = getTemplateById("disaster_relief_surge");
      expect(disaster).not.toBeNull();
      expect(disaster.category).toBe("Disaster Response");

      const nonExistent = getTemplateById("invalid_id_999");
      expect(nonExistent).toBeNull();
    });

    it("guarantees ZERO Chinese characters in default template strings", () => {
      const chineseRegex = /[\u4e00-\u9fff]/;
      PUBLIC_MODEL_TEMPLATES.forEach((tpl) => {
        expect(chineseRegex.test(tpl.title)).toBe(false);
        expect(chineseRegex.test(tpl.summary)).toBe(false);
        expect(chineseRegex.test(tpl.description)).toBe(false);
      });
    });
  });

  describe("Shareable Model Export", () => {
    it("exports an active model into an open shareable template JSON", () => {
      const mockModel = { id: "mod_1", name: "Community Outreach Model", notes: "Operational model" };
      const mockNodes = [
        { id: "n1", symbol: "volunteers", name: "Volunteers", unit: "people", initialValue: 50, formula: "50", costCategory: "direct_program" }
      ];
      const mockActions = [
        { id: "act1", title: "Recruit Team", estSpending: 1000, estEffortHrs: 20, impacts: [{ symbol: "volunteers", operation: "+", operand: 10 }] }
      ];

      const exported = exportModelAsShareableTemplate(mockModel, mockNodes, mockActions, {
        author: "Community Partner",
        category: "Volunteer Management"
      });

      expect(exported.schemaVersion).toBe("mipa.template.v1");
      expect(exported.license).toBe("CC BY-SA 4.0");
      expect(exported.title).toBe("Community Outreach Model");
      expect(exported.nodes).toHaveLength(1);
      expect(exported.nodes[0].symbol).toBe("volunteers");
      expect(exported.sampleActions).toHaveLength(1);
    });
  });

  describe("Template Validation & Parsing", () => {
    it("validates and parses valid template JSON", () => {
      const validPayload = {
        title: "Test Clinic Model",
        nodes: [
          { symbol: "patients", name: "Patients", initialValue: 100, formula: "100" }
        ],
        sampleActions: []
      };

      const parsed = validateAndParseTemplate(JSON.stringify(validPayload));
      expect(parsed.title).toBe("Test Clinic Model");
      expect(parsed.nodes).toHaveLength(1);
      expect(parsed.nodes[0].symbol).toBe("patients");
    });

    it("rejects invalid JSON, missing title, or missing nodes", () => {
      expect(() => validateAndParseTemplate("invalid json text")).toThrow();
      expect(() => validateAndParseTemplate({ nodes: [{ symbol: "a" }] })).toThrow("missing required 'title'");
      expect(() => validateAndParseTemplate({ title: "No nodes", nodes: [] })).toThrow("at least one factor node");
    });
  });

  describe("Onboarding Tour Steps", () => {
    it("defines 4 core onboarding steps", () => {
      expect(ONBOARDING_TOUR_STEPS).toHaveLength(4);
      expect(ONBOARDING_TOUR_STEPS[0].key).toBe("system_map");
      expect(ONBOARDING_TOUR_STEPS[1].key).toBe("actions_interventions");
      expect(ONBOARDING_TOUR_STEPS[2].key).toBe("simulation_leverage");
      expect(ONBOARDING_TOUR_STEPS[3].key).toBe("decision_brief");
    });
  });
});
