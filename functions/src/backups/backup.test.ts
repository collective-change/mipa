import test from "node:test";
import assert from "node:assert/strict";
import {
  executeFirestoreExport,
  executeFirestoreRestore,
  setFirestoreAdminClientForTesting,
  MinimalFirestoreAdminClient
} from "./scheduledBackup";
import {
  calculateBackupEconomics,
  BENCHMARK_DEFAULTS
} from "./backupEconomics";
import { runDrill } from "./restoreDrill";

interface ExportDocRequest {
  name: string;
  outputUriPrefix: string;
  collectionIds?: string[];
}

interface ImportDocRequest {
  name: string;
  inputUriPrefix: string;
  collectionIds?: string[];
}

// Mock Firestore Admin Client for testing
class MockFirestoreAdminClient implements MinimalFirestoreAdminClient {
  public exportedRequests: ExportDocRequest[] = [];
  public importedRequests: ImportDocRequest[] = [];

  databasePath(project: string, database: string): string {
    return `projects/${project}/databases/${database}`;
  }

  async exportDocuments(request: ExportDocRequest): Promise<[{ name?: string | null }]> {
    this.exportedRequests.push(request);
    return [
      {
        name: `projects/demo-mipa/databases/(default)/operations/mock-export-${Date.now()}`
      }
    ];
  }

  async importDocuments(request: ImportDocRequest): Promise<[{ name?: string | null }]> {
    this.importedRequests.push(request);
    return [
      {
        name: `projects/demo-mipa/databases/(default)/operations/mock-import-${Date.now()}`
      }
    ];
  }
}

test("MIPA-34: Scheduled Firestore Export initiates with correct bucket and timestamp prefix", async () => {
  const mockClient = new MockFirestoreAdminClient();
  setFirestoreAdminClientForTesting(mockClient);

  try {
    const result = await executeFirestoreExport({
      projectId: "mipa-test-prod",
      bucket: "mipa-test-prod-backups",
      triggerSource: "scheduled",
      skipAudit: true
    });

    assert.ok(result.operationName.includes("operations/mock-export-"));
    assert.ok(result.outputUriPrefix.startsWith("gs://mipa-test-prod-backups/exports/"));
    assert.strictEqual(mockClient.exportedRequests.length, 1);

    const req = mockClient.exportedRequests[0];
    assert.strictEqual(req.name, "projects/mipa-test-prod/databases/(default)");
    assert.ok(req.outputUriPrefix.startsWith("gs://mipa-test-prod-backups/exports/"));
  } finally {
    setFirestoreAdminClientForTesting(null);
  }
});

test("MIPA-34: Firestore Export with collection filtering scopes exports accurately", async () => {
  const mockClient = new MockFirestoreAdminClient();
  setFirestoreAdminClientForTesting(mockClient);

  try {
    const collections = ["orgs", "models", "actions", "published_records"];
    const result = await executeFirestoreExport({
      projectId: "mipa-test-prod",
      collectionIds: collections,
      triggerSource: "manual",
      triggeredBy: "admin-uid-1",
      skipAudit: true
    });

    assert.strictEqual(result.collectionIds.length, 4);
    assert.deepStrictEqual(mockClient.exportedRequests[0].collectionIds, collections);
  } finally {
    setFirestoreAdminClientForTesting(null);
  }
});

test("MIPA-34: Firestore Restore executes importDocuments with exact URI prefix", async () => {
  const mockClient = new MockFirestoreAdminClient();
  setFirestoreAdminClientForTesting(mockClient);

  try {
    const inputUri = "gs://mipa-test-prod-backups/exports/2026-11-19T14-30-00-000Z";
    const result = await executeFirestoreRestore({
      projectId: "mipa-test-prod",
      inputUriPrefix: inputUri,
      triggeredBy: "ops-drill-runner",
      skipAudit: true
    });

    assert.strictEqual(result.inputUriPrefix, inputUri);
    assert.strictEqual(mockClient.importedRequests.length, 1);
    assert.strictEqual(mockClient.importedRequests[0].inputUriPrefix, inputUri);
  } finally {
    setFirestoreAdminClientForTesting(null);
  }
});

test("MIPA-34: Firestore Restore rejects invalid non-gs:// URI prefixes", async () => {
  await assert.rejects(
    async () => {
      await executeFirestoreRestore({
        inputUriPrefix: "https://storage.googleapis.com/bad-prefix",
        skipAudit: true
      });
    },
    { message: /must be a valid gs:\/\/ Google Cloud Storage URI/ }
  );
});

test("MIPA-34: Unit Economics & Margin Guard (MIPA-27) verification", () => {
  // Test baseline with 100 organizations
  const result100 = calculateBackupEconomics({ numOrgs: 100 });

  assert.strictEqual(result100.totalDocs, 100 * BENCHMARK_DEFAULTS.AVG_DOCS_PER_ORG); // 50,000 docs
  assert.ok(result100.monthlyReadCostUsd > 0);
  assert.ok(result100.totalMonthlyBackupCostUsd > 0);

  // Total cost for 100 organizations should be under $2.00 / month
  assert.ok(
    result100.totalMonthlyBackupCostUsd < 2.0,
    `Total monthly backup cost ($${result100.totalMonthlyBackupCostUsd}) should be under $2.00 for 100 orgs`
  );

  // Cost per org must be a few cents (< $0.05)
  assert.ok(
    result100.monthlyCostPerOrgUsd < 0.05,
    `Monthly cost per org ($${result100.monthlyCostPerOrgUsd}) should be under $0.05`
  );

  // Must consume < 0.1% of Starter MRR ($79)
  assert.ok(
    result100.pctOfStarterMrr < 0.1,
    `Backup cost percent of Starter MRR (${result100.pctOfStarterMrr}%) should be < 0.1%`
  );

  // Strictly fits within MIPA-27 Margin Guard (10% ceiling)
  assert.strictEqual(result100.fitsMarginGuard, true);

  // Test scaling to 1,000 organizations
  const result1000 = calculateBackupEconomics({ numOrgs: 1000 });
  assert.ok(result1000.totalMonthlyBackupCostUsd < 20.0);
  assert.strictEqual(result1000.fitsMarginGuard, true);
});

test("MIPA-34: Restore drill verification asserting byte-for-byte fidelity", async () => {
  const drillResult = await runDrill();

  assert.strictEqual(drillResult.status, "SUCCESS");
  assert.ok(typeof drillResult.drillId === "string");
  assert.ok(drillResult.durationMs >= 0);
  assert.ok(typeof drillResult.verifiedAt === "string");
  assert.strictEqual(drillResult.recordsRestored, 1);
  assert.strictEqual(drillResult.assertions.every(a => a.pass), true);
});
