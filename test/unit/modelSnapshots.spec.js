import { describe, it, expect } from "vitest";
import {
  sha256,
  createModelSnapshot,
  verifySnapshotIntegrity,
  diffModelSnapshots,
  saveSnapshotToStorage,
  loadSnapshotsFromStorage
} from "../../src/utils/modelSnapshots";
import { generateDecisionBrief, formatBriefAsMarkdown } from "../../src/utils/decisionBrief";
import fs from "fs";
import path from "path";

describe("Model Governance Snapshots & Decision Provenance Engine", () => {
  describe("Cryptographic SHA-256 Hashing", () => {
    it("produces standard 64-character hex digests for known test vectors", () => {
      // Standard SHA-256 test vectors
      expect(sha256("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
      expect(sha256("test")).toBe("9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08");
    });
  });

  describe("createModelSnapshot", () => {
    it("creates an immutable snapshot with metadata and deterministic SHA-256 hash", () => {
      const model = {
        id: "model-rel",
        name: "Disaster Relief Logistics",
        discountRate: 0.05,
        timeHorizonYears: 5
      };

      const nodes = [
        { id: "n1", symbol: "VC", name: "Volunteer Capacity", formula: "100", initialValue: 100, unit: "people" },
        { id: "n2", symbol: "DR", name: "Disaster Response Speed", formula: "VC * 0.8", initialValue: 80, unit: "hrs" }
      ];

      const snapshot = createModelSnapshot(model, nodes, {
        note: "Board Approval FY2026",
        author: { uid: "user-1", displayName: "CEO Staff" }
      });

      expect(snapshot).toBeDefined();
      expect(snapshot.id).toMatch(/^snap_/);
      expect(snapshot.modelId).toBe("model-rel");
      expect(snapshot.note).toBe("Board Approval FY2026");
      expect(snapshot.author.displayName).toBe("CEO Staff");
      expect(snapshot.nodeCount).toBe(2);
      expect(snapshot.contentHash).toHaveLength(64);
    });
  });

  describe("verifySnapshotIntegrity", () => {
    it("verifies untampered snapshots as cryptographically valid", () => {
      const model = { id: "m1", name: "Model 1" };
      const nodes = [{ id: "n1", symbol: "A", name: "Factor A", formula: "50", initialValue: 50 }];

      const snapshot = createModelSnapshot(model, nodes, { note: "Untampered Baseline" });
      const verification = verifySnapshotIntegrity(snapshot);

      expect(verification.valid).toBe(true);
      expect(verification.calculatedHash).toBe(snapshot.contentHash);
    });

    it("detects tampered snapshots when factors or formulas are secretly modified", () => {
      const model = { id: "m1", name: "Model 1" };
      const nodes = [{ id: "n1", symbol: "A", name: "Factor A", formula: "50", initialValue: 50 }];

      const snapshot = createModelSnapshot(model, nodes, { note: "Original Baseline" });

      // Simulate malicious or accidental in-place mutation
      snapshot.nodes[0].formula = "5000";

      const verification = verifySnapshotIntegrity(snapshot);
      expect(verification.valid).toBe(false);
      expect(verification.calculatedHash).not.toBe(snapshot.contentHash);
    });
  });

  describe("diffModelSnapshots", () => {
    it("detects modified formulas, baseline values, added and removed factors", () => {
      const baselineNodes = [
        { id: "n1", symbol: "VC", name: "Volunteer Capacity", formula: "100", initialValue: 100, unit: "people" },
        { id: "n2", symbol: "CS", name: "Community Support", formula: "VC * 0.5", initialValue: 50, unit: "index" },
        { id: "n3", symbol: "OLD", name: "Deprecated Metric", formula: "10", initialValue: 10 }
      ];

      const currentNodes = [
        { id: "n1", symbol: "VC", name: "Volunteer Capacity", formula: "120", initialValue: 120, unit: "people" }, // modified formula & value (+20%)
        { id: "n2", symbol: "CS", name: "Community Support", formula: "VC * 0.5", initialValue: 50, unit: "index" }, // unchanged
        { id: "n4", symbol: "NEW", name: "New Resilience Factor", formula: "CS * 1.2", initialValue: 60 } // added
        // n3 was removed
      ];

      const diff = diffModelSnapshots(baselineNodes, currentNodes, { locale: "en-us" });

      expect(diff.totalDifferences).toBe(3); // 1 modified + 1 added + 1 removed
      expect(diff.modified).toHaveLength(1);
      expect(diff.modified[0].id).toBe("n1");
      expect(diff.modified[0].changes.some((c) => c.field === "initialValue" && c.shiftPercent === 20)).toBe(true);

      expect(diff.added).toHaveLength(1);
      expect(diff.added[0].id).toBe("n4");

      expect(diff.removed).toHaveLength(1);
      expect(diff.removed[0].id).toBe("n3");

      expect(diff.unchangedCount).toBe(1);
      expect(diff.summaryNarrative).toContain("Modified factor(s) (1)");
      expect(diff.summaryNarrative).toContain("Added factor(s) (1)");
      expect(diff.summaryNarrative).toContain("Removed factor(s) (1)");
    });

    it("generates Traditional Chinese diff summary narrative", () => {
      const baselineNodes = [{ id: "n1", name: "志工服務量", initialValue: 100 }];
      const currentNodes = [{ id: "n1", name: "志工服務量", initialValue: 150 }];

      const diff = diffModelSnapshots(baselineNodes, currentNodes, { locale: "zh-tw" });
      expect(diff.summaryNarrative).toContain("修改要素");
      expect(diff.summaryNarrative).toContain("志工服務量");
    });
  });

  describe("Snapshot Storage Persistence", () => {
    it("saves and reloads snapshots from storage correctly", () => {
      const model = { id: "model-test-storage", name: "Test Model" };
      const nodes = [{ id: "n1", symbol: "A", name: "Factor A", formula: "10", initialValue: 10 }];

      const snap1 = createModelSnapshot(model, nodes, { note: "Snapshot 1" });
      saveSnapshotToStorage(model.id, snap1);

      const loaded = loadSnapshotsFromStorage(model.id);
      expect(loaded.length).toBeGreaterThanOrEqual(1);
      expect(loaded[0].id).toBe(snap1.id);
      expect(loaded[0].contentHash).toBe(snap1.contentHash);
    });
  });

  describe("Decision Brief Provenance Binding", () => {
    it("binds frozen snapshot to decision brief and renders verification notice", () => {
      const model = { id: "model-gov", name: "Governance Model" };
      const nodes = [{ id: "n1", symbol: "B", name: "Factor B", formula: "20", initialValue: 20 }];
      const snapshot = createModelSnapshot(model, nodes, { note: "Board Approved Q4" });

      const actions = [
        {
          id: "act-gov",
          title: "Strategic Initiative",
          actionLeverage: 8.5,
          marginalNetTotalBenefitNpv: 100000,
          outstandingDirectCosts: 10000,
          totalRoi: 8.5
        }
      ];

      const brief = generateDecisionBrief(actions, nodes, {
        orgName: "Foundation",
        modelName: "Governance Model",
        locale: "en-us",
        snapshot
      });

      expect(brief.metadata.provenance).toBeDefined();
      expect(brief.metadata.provenance.isFrozen).toBe(true);
      expect(brief.metadata.provenance.snapshotId).toBe(snapshot.id);
      expect(brief.metadata.provenance.contentHash).toBe(snapshot.contentHash);

      const markdown = formatBriefAsMarkdown(brief);
      expect(markdown).toContain("Decision Baseline Snapshot");
      expect(markdown).toContain(snapshot.id);
      expect(markdown).toContain("SHA-256");
    });

    it("outputs draft warning when brief is not bound to a frozen snapshot", () => {
      const actions = [
        {
          id: "act-draft",
          title: "Tentative Initiative",
          actionLeverage: 3.0,
          marginalNetTotalBenefitNpv: 30000,
          outstandingDirectCosts: 10000,
          totalRoi: 3.0
        }
      ];

      const brief = generateDecisionBrief(actions, [], {
        orgName: "Foundation",
        modelName: "Draft Model",
        locale: "en-us"
      });

      expect(brief.metadata.provenance.isFrozen).toBe(false);

      const markdown = formatBriefAsMarkdown(brief);
      expect(markdown).toContain("Draft Notice");
      expect(markdown).toContain("mutable working draft");
    });
  });

  describe("Localization Standard Compliance", () => {
    it("ensures zero Chinese characters in src/i18n/en-us/index.js", () => {
      const enUsPath = path.resolve(__dirname, "../../src/i18n/en-us/index.js");
      const enUsContent = fs.readFileSync(enUsPath, "utf-8");
      const chineseCharMatch = enUsContent.match(/[\u4e00-\u9fff]/g);

      expect(chineseCharMatch).toBeNull();
    });
  });
});
