/**
 * Unit Economics & Margin Guard Analysis for Firestore Backups (MIPA-34 / MIPA-27).
 *
 * Sourced from Google Cloud Pricing (us-central1 / multi-region):
 * - Firestore Reads: $0.06 / 100,000 documents ($0.0000006 / document).
 * - GCS Standard Storage: $0.020 / GB / month.
 * - GCS Coldline Storage: $0.004 / GB / month (for 1-year monthly snapshots).
 * - GCS Archive Storage: $0.0012 / GB / month (for 7-year annual snapshots).
 * - GCS Class A (Mutations / Writes): $0.05 / 10,000 operations.
 * - Cloud Function Executions: $0.40 / million (daily invocation = negligible $0.000012/mo).
 */

export const PRICING = {
  FIRESTORE_READ_PER_DOC: 0.0000006,
  GCS_STANDARD_GB_MONTH: 0.020,
  GCS_COLDLINE_GB_MONTH: 0.004,
  GCS_ARCHIVE_GB_MONTH: 0.0012,
  GCS_CLASS_A_PER_OP: 0.000005,
  DAYS_IN_MONTH: 30,
  DAILY_EXPORTS_PER_MONTH: 30
};

export interface BackupEconomicsInput {
  numOrgs: number;
  avgDocsPerOrg?: number;
  avgDocBytes?: number;
  retentionDailyDays?: number;
  retentionMonthlyYears?: number;
  retentionAnnualYears?: number;
}

export interface BackupEconomicsResult {
  totalDocs: number;
  snapshotSizeBytes: number;
  snapshotSizeGb: number;
  monthlyReadCostUsd: number;
  monthlyGcsStandardCostUsd: number;
  monthlyGcsColdlineCostUsd: number;
  monthlyGcsArchiveCostUsd: number;
  totalMonthlyBackupCostUsd: number;
  monthlyCostPerOrgUsd: number;
  pctOfStarterMrr: number;
  pctOfProMrr: number;
  fitsMarginGuard: boolean;
}

export const BENCHMARK_DEFAULTS = {
  AVG_DOCS_PER_ORG: 500, // models, nodes, actions, chats, audit entries
  AVG_DOC_BYTES: 1024,   // 1 KB average document size in LevelDB format
  RETENTION_DAILY_DAYS: 30,
  RETENTION_MONTHLY_YEARS: 1,
  RETENTION_ANNUAL_YEARS: 7,
  STARTER_MRR_USD: 79.00,
  PRO_MRR_USD: 165.83
};

/**
 * Calculates the monthly cost of scheduled Firestore exports and GCS retention tiers.
 */
export function calculateBackupEconomics(input: BackupEconomicsInput): BackupEconomicsResult {
  const numOrgs = Math.max(1, input.numOrgs);
  const avgDocs = input.avgDocsPerOrg ?? BENCHMARK_DEFAULTS.AVG_DOCS_PER_ORG;
  const avgBytes = input.avgDocBytes ?? BENCHMARK_DEFAULTS.AVG_DOC_BYTES;
  const dailyDays = input.retentionDailyDays ?? BENCHMARK_DEFAULTS.RETENTION_DAILY_DAYS;
  const monthlyYears = input.retentionMonthlyYears ?? BENCHMARK_DEFAULTS.RETENTION_MONTHLY_YEARS;
  const annualYears = input.retentionAnnualYears ?? BENCHMARK_DEFAULTS.RETENTION_ANNUAL_YEARS;

  const totalDocs = numOrgs * avgDocs;
  const snapshotSizeBytes = totalDocs * avgBytes;
  const snapshotSizeGb = snapshotSizeBytes / (1024 * 1024 * 1024);

  // 1. Firestore Read Cost: 30 daily runs * totalDocs * read price
  const monthlyReadCostUsd = PRICING.DAILY_EXPORTS_PER_MONTH * totalDocs * PRICING.FIRESTORE_READ_PER_DOC;

  // 2. GCS Storage Costs:
  // Rolling 30 daily snapshots stored in Standard Storage
  const standardStoredGb = snapshotSizeGb * dailyDays;
  const monthlyGcsStandardCostUsd = standardStoredGb * PRICING.GCS_STANDARD_GB_MONTH;

  // 12 monthly snapshots stored in Coldline Storage
  const coldlineStoredGb = snapshotSizeGb * (monthlyYears * 12);
  const monthlyGcsColdlineCostUsd = coldlineStoredGb * PRICING.GCS_COLDLINE_GB_MONTH;

  // 7 annual snapshots stored in Archive Storage
  const archiveStoredGb = snapshotSizeGb * annualYears;
  const monthlyGcsArchiveCostUsd = archiveStoredGb * PRICING.GCS_ARCHIVE_GB_MONTH;

  const totalMonthlyBackupCostUsd =
    monthlyReadCostUsd +
    monthlyGcsStandardCostUsd +
    monthlyGcsColdlineCostUsd +
    monthlyGcsArchiveCostUsd;

  const monthlyCostPerOrgUsd = totalMonthlyBackupCostUsd / numOrgs;
  const pctOfStarterMrr = (monthlyCostPerOrgUsd / BENCHMARK_DEFAULTS.STARTER_MRR_USD) * 100;
  const pctOfProMrr = (monthlyCostPerOrgUsd / BENCHMARK_DEFAULTS.PRO_MRR_USD) * 100;

  // Margin guard requires operational costs to stay under 10% of revenue basis (MIPA-27)
  const fitsMarginGuard = pctOfStarterMrr < 10.0;

  return {
    totalDocs,
    snapshotSizeBytes,
    snapshotSizeGb,
    monthlyReadCostUsd,
    monthlyGcsStandardCostUsd,
    monthlyGcsColdlineCostUsd,
    monthlyGcsArchiveCostUsd,
    totalMonthlyBackupCostUsd,
    monthlyCostPerOrgUsd,
    pctOfStarterMrr,
    pctOfProMrr,
    fitsMarginGuard
  };
}
