import { describe, it, expect } from "vitest";
import {
  parseTabularData,
  splitLine,
  evaluateFactorFreshness,
  groupFactorsByCategory,
  createAuditTrailEntry,
  parseTimeSeriesData,
  mergeTimeSeries,
  normalizeSeriesDate,
  SAMPLE_TIME_SERIES
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

  describe("MIPA-20: parseTimeSeriesData & mergeTimeSeries", () => {
    it("parses CSV time series text into sorted dated points with provenance", () => {
      const csv = `Date,Value,Type,Source
2024-01-01,100,historical,FY2024 Audit
2024-07-01,120,historical,FY2024 Midyear
2025-01-01,150,predicted,FY2025 Projection`;

      const result = parseTimeSeriesData(csv, { sourceCitation: "Default Source", userEmail: "tester@mipa.org" });
      expect(result.series.length).toBe(3);
      expect(result.series[0].date).toBe("2024-01-01");
      expect(result.series[0].value).toBe(100);
      expect(result.series[0].isPredicted).toBe(false);
      expect(result.series[0].sourceCitation).toBe("FY2024 Audit");

      expect(result.series[2].date).toBe("2025-01-01");
      expect(result.series[2].value).toBe(150);
      expect(result.series[2].isPredicted).toBe(true);

      expect(result.provenance.pointCount).toBe(3);
      expect(result.provenance.historicalCount).toBe(2);
      expect(result.provenance.predictedCount).toBe(1);
      expect(result.provenance.startDate).toBe("2024-01-01");
      expect(result.provenance.endDate).toBe("2025-01-01");
      expect(result.provenance.importedBy).toBe("tester@mipa.org");
    });

    it("parses SAMPLE_TIME_SERIES successfully", () => {
      const result = parseTimeSeriesData(SAMPLE_TIME_SERIES);
      expect(result.series.length).toBe(9);
      expect(result.provenance.historicalCount).toBe(7);
      expect(result.provenance.predictedCount).toBe(2);
    });

    it("normalizes quarters and dates cleanly", () => {
      expect(normalizeSeriesDate("2024-Q1")).toBe("2024-01-01");
      expect(normalizeSeriesDate("2024-Q2")).toBe("2024-04-01");
      expect(normalizeSeriesDate("2024-Q3")).toBe("2024-07-01");
      expect(normalizeSeriesDate("2024-Q4")).toBe("2024-10-01");
      expect(normalizeSeriesDate("2024-06")).toBe("2024-06-01");
      expect(normalizeSeriesDate("2024-05-18")).toBe("2024-05-18");
    });

    it("supports merge and replace strategies for non-silent overwrites", () => {
      const existing = [
        { date: "2024-01-01", value: 100, isPredicted: false },
        { date: "2024-07-01", value: 120, isPredicted: false }
      ];
      const incoming = [
        { date: "2024-07-01", value: 130, isPredicted: false },
        { date: "2025-01-01", value: 160, isPredicted: true }
      ];

      // Replace mode
      const replaced = mergeTimeSeries(existing, incoming, "replace");
      expect(replaced.length).toBe(2);
      expect(replaced[0].date).toBe("2024-07-01");

      // Merge mode
      const merged = mergeTimeSeries(existing, incoming, "merge");
      expect(merged.length).toBe(3);
      expect(merged[0].date).toBe("2024-01-01");
      expect(merged[0].value).toBe(100);
      expect(merged[1].date).toBe("2024-07-01");
      expect(merged[1].value).toBe(130); // updated
      expect(merged[2].date).toBe("2025-01-01");
      expect(merged[2].value).toBe(160); // appended
    });

    it("handles empty or malformed inputs without throwing", () => {
      const empty = parseTimeSeriesData("");
      expect(empty.series).toEqual([]);
      expect(empty.provenance.pointCount).toBe(0);

      const invalid = parseTimeSeriesData("HeaderOnly,Column\nnotADate,notANumber");
      expect(invalid.series).toEqual([]);
    });
  });

  describe("MIPA-26: splitLine ReDoS Immunity & Quoted Parsing", () => {
    it("handles standard comma-separated fields with empty values and edges", () => {
      expect(splitLine("a,b,c", ",")).toEqual(["a", "b", "c"]);
      expect(splitLine("a,,b", ",")).toEqual(["a", "", "b"]);
      expect(splitLine(",a,b", ",")).toEqual(["", "a", "b"]);
      expect(splitLine("a,b,", ",")).toEqual(["a", "b", ""]);
      expect(splitLine("", ",")).toEqual([""]);
    });

    it("handles quoted fields containing embedded commas and delimiters", () => {
      const line = 'Program Outreach,"45,000",USD,"Audited Report, Note 4"';
      expect(splitLine(line, ",")).toEqual([
        "Program Outreach",
        "45,000",
        "USD",
        "Audited Report, Note 4"
      ]);
    });

    it("handles escaped quotes inside quoted fields correctly", () => {
      const line = '"He said ""Hello""",123,"""Three Quotes"""';
      expect(splitLine(line, ",")).toEqual([
        'He said "Hello"',
        "123",
        '"Three Quotes"'
      ]);
    });

    it("handles pipes and fallback delimiters", () => {
      expect(splitLine("| Factor | Value | Unit |", "|")).toEqual([" Factor ", " Value ", " Unit "]);
      expect(splitLine("a\tb\tc", "\t")).toEqual(["a", "b", "c"]);
    });

    it("defends against pathological input (ReDoS regression test for alert #8)", () => {
      // Pathological unclosed quote input: '"' + '!' x 40
      // Under the legacy regex /(?:,|\n|^)("(?:(?:"")*[^"]*)*"|[^",\n]*|(?:\n|$))/g,
      // backtracking on n=26 was ~3s and n=40 would hang the event loop for days.
      const pathological = '"' + "!".repeat(40);

      const t0 = performance.now();
      const result = splitLine(pathological, ",");
      const elapsed = performance.now() - t0;

      expect(elapsed).toBeLessThan(100); // Must execute in well under 1 second (< 100ms)
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toContain("!");

      // Even on n=1000, execution must be instantaneous (< 50ms)
      const largePathological = '"' + "!".repeat(1000);
      const t1 = performance.now();
      const largeResult = splitLine(largePathological, ",");
      const largeElapsed = performance.now() - t1;

      expect(largeElapsed).toBeLessThan(50);
      expect(largeResult.length).toBeGreaterThan(0);
    });

    it("parses CSV with pathological rows via parseTabularData without hanging", () => {
      const badCsv = `Factor,Value,Unit
Normal Factor,100,units
${'"' + "!".repeat(50)},200,units
Another Factor,300,USD`;

      const t0 = performance.now();
      const results = parseTabularData(badCsv);
      const elapsed = performance.now() - t0;

      expect(elapsed).toBeLessThan(100);
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.some((r) => r.name === "Normal Factor")).toBe(true);
    });
  });
});
