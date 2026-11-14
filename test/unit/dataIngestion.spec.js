import { describe, it, expect } from "vitest";
import {
  parseTabularData,
  evaluateFactorFreshness,
  groupFactorsByCategory,
  createAuditTrailEntry
} from "@/utils/dataIngestion";

describe("Data Ingestion & Financial Currency Utilities", () => {
  describe("parseTabularData", () => {
    it("parses CSV with accounting categories and provenance", () => {
      const csv = `Metric,Amount,Unit,Category,Period,Date,Citation
Program Outreach,45000,USD,direct_program,FY2026,2026-01-15,Audited Annual Report 2025 Note 4
General Admin Expenses,12000,USD,overhead,FY2026,2026-01-15,Audited Annual Report 2025 Note 6
Community Facility Renovation,80000,USD,capital,FY2026,2026-01-10,Capital Budget 2026 Schedule B`;

      const results = parseTabularData(csv);
      expect(results.length).toBe(3);

      expect(results[0].name).toBe("Program Outreach");
      expect(results[0].latestValue).toBe(45000);
      expect(results[0].unit).toBe("USD");
      expect(results[0].costCategory).toBe("direct_program");
      expect(results[0].reportingPeriod).toBe("FY2026");
      expect(results[0].effectiveDate).toBe("2026-01-15");
      expect(results[0].sourceCitation).toContain("Note 4");

      expect(results[1].costCategory).toBe("overhead");
      expect(results[2].costCategory).toBe("capital");
    });

    it("parses TSV and markdown formatted tables", () => {
      const markdown = `| Factor | Latest Value | Unit | Citation |
| Active Volunteers | 120 | people | Q4 2025 Volunteer Census |
| Fuel Costs | 3400 | TWD | Q4 Logistics Report |`;

      const results = parseTabularData(markdown);
      expect(results.length).toBe(2);
      expect(results[0].name).toBe("Active Volunteers");
      expect(results[0].latestValue).toBe(120);
      expect(results[0].unit).toBe("people");
      expect(results[0].sourceCitation).toBe("Q4 2025 Volunteer Census");
    });

    it("handles currency symbols, commas, and parentheses for negative numbers", () => {
      const csv = `Name,Budget
Food Supplies,"$12,500"
Operating Deficit,"(4,200)"`;

      const results = parseTabularData(csv);
      expect(results[0].latestValue).toBe(12500);
      expect(results[1].latestValue).toBe(-4200);
    });

    it("returns empty array on empty input", () => {
      expect(parseTabularData("")).toEqual([]);
      expect(parseTabularData("   ")).toEqual([]);
    });
  });

  describe("evaluateFactorFreshness", () => {
    const referenceDate = new Date("2026-11-14T00:00:00Z");

    it("marks recent factors as fresh", () => {
      const factor = { effectiveDate: "2026-10-01" }; // ~44 days old
      const result = evaluateFactorFreshness(factor, { currentDate: referenceDate });
      expect(result.status).toBe("fresh");
      expect(result.isStale).toBe(false);
      expect(result.daysElapsed).toBeLessThan(180);
    });

    it("marks factors older than 180 days as expiring", () => {
      const factor = { effectiveDate: "2026-04-01" }; // ~227 days old
      const result = evaluateFactorFreshness(factor, { currentDate: referenceDate });
      expect(result.status).toBe("expiring");
      expect(result.isStale).toBe(false);
    });

    it("marks factors older than 365 days as stale", () => {
      const factor = { effectiveDate: "2025-05-01" }; // > 500 days old
      const result = evaluateFactorFreshness(factor, { currentDate: referenceDate });
      expect(result.status).toBe("stale");
      expect(result.isStale).toBe(true);
    });

    it("handles missing effective date gracefully", () => {
      const result = evaluateFactorFreshness({});
      expect(result.status).toBe("unknown");
      expect(result.daysElapsed).toBeNull();
    });
  });

  describe("groupFactorsByCategory", () => {
    it("groups nodes into accounting categories", () => {
      const nodes = [
        { id: "n1", name: "Direct Program Cost", costCategory: "direct_program" },
        { id: "n2", name: "Rent & Utilities", costCategory: "overhead" },
        { id: "n3", name: "Server Hardware", costCategory: "capital" },
        { id: "n4", name: "Volunteer Morale", costCategory: "social_benefit" },
        { id: "n5", name: "Generic Factor" }
      ];

      const grouped = groupFactorsByCategory(nodes);
      expect(grouped.direct_program.length).toBe(1);
      expect(grouped.overhead.length).toBe(1);
      expect(grouped.capital.length).toBe(1);
      expect(grouped.social_benefit.length).toBe(1);
      expect(grouped.general.length).toBe(1);
    });
  });

  describe("createAuditTrailEntry", () => {
    it("generates a structured reconciliation record with variance", () => {
      const factor = { id: "n1", symbol: "sales", name: "Annual Sales", sourceCitation: "2024 Audit", reportingPeriod: "FY2024" };
      const record = createAuditTrailEntry(factor, 100000, 125000, "auditor@org.org", "2025 Audit Note 3", "FY2025");

      expect(record.factorId).toBe("n1");
      expect(record.oldValue).toBe(100000);
      expect(record.newValue).toBe(125000);
      expect(record.variance).toBe(25000);
      expect(record.sourceCitation).toBe("2025 Audit Note 3");
      expect(record.reportingPeriod).toBe("FY2025");
      expect(record.userEmail).toBe("auditor@org.org");
      expect(record.timestamp).toBeDefined();
    });
  });
});
