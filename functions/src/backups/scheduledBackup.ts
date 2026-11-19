import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { v1 } from "@google-cloud/firestore";

export interface MinimalFirestoreAdminClient {
  databasePath(project: string, database: string): string;
  exportDocuments(request: { name: string; outputUriPrefix: string; collectionIds?: string[] }): Promise<[{ name?: string | null }]>;
  importDocuments(request: { name: string; inputUriPrefix: string; collectionIds?: string[] }): Promise<[{ name?: string | null }]>;
}

export type FirestoreAdminClientType = InstanceType<typeof v1.FirestoreAdminClient> | MinimalFirestoreAdminClient;

let firestoreAdminClientInstance: FirestoreAdminClientType | null = null;

export function getFirestoreAdminClient(): FirestoreAdminClientType {
  if (!firestoreAdminClientInstance) {
    firestoreAdminClientInstance = new v1.FirestoreAdminClient();
  }
  return firestoreAdminClientInstance;
}

export function setFirestoreAdminClientForTesting(client: FirestoreAdminClientType | null) {
  firestoreAdminClientInstance = client;
}

export interface ExportBackupOptions {
  projectId?: string;
  bucket?: string;
  collectionIds?: string[];
  triggerSource?: string;
  triggeredBy?: string;
  skipAudit?: boolean;
}

export interface ExportBackupResult {
  operationName: string;
  outputUriPrefix: string;
  timestamp: string;
  collectionIds: string[];
  auditDocId: string;
}

export interface RestoreBackupOptions {
  projectId?: string;
  inputUriPrefix: string;
  collectionIds?: string[];
  triggeredBy?: string;
  skipAudit?: boolean;
}

export interface RestoreBackupResult {
  operationName: string;
  inputUriPrefix: string;
  timestamp: string;
  auditDocId: string;
}

/**
 * Executes a managed Firestore export to Google Cloud Storage.
 *
 * Retention Tiers:
 * - Daily snapshots: 30 days retention (Rolling disaster recovery).
 * - Monthly snapshots: 1 year retention (Coldline storage).
 * - Annual snapshots: 7 years retention (Permanent audit register compliance).
 */
export async function executeFirestoreExport(options: ExportBackupOptions = {}): Promise<ExportBackupResult> {
  const client = getFirestoreAdminClient();
  const projectId =
    options.projectId ||
    process.env.GCLOUD_PROJECT ||
    (process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG).projectId : "mipa-2");

  const databaseName = client.databasePath(projectId, "(default)");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rawBucket = options.bucket || process.env.BACKUP_BUCKET || `${projectId}-firestore-backups`;
  const cleanBucket = rawBucket.replace(/^gs:\/\//, "").replace(/\/+$/, "");
  const outputUriPrefix = `gs://${cleanBucket}/exports/${timestamp}`;

  const request: {
    name: string;
    outputUriPrefix: string;
    collectionIds?: string[];
  } = {
    name: databaseName,
    outputUriPrefix
  };

  const collectionIds = options.collectionIds || [];
  if (collectionIds.length > 0) {
    request.collectionIds = collectionIds;
  }

  logger.info("[Firestore Backup] Initiating export operation...", {
    databaseName,
    outputUriPrefix,
    collectionIds: collectionIds.length > 0 ? collectionIds : "ALL"
  });

  const [operation] = await client.exportDocuments(request);
  const operationName = operation?.name || `operations/mock-${timestamp}`;

  logger.info("[Firestore Backup] Operation dispatched", { operationName });

  let auditDocId = `mock-audit-${timestamp}`;
  if (!options.skipAudit) {
    try {
      const db = getFirestore();
      const auditRef = db.collection("backups_audit").doc();
      auditDocId = auditRef.id;
      const auditData = {
        type: "export",
        operationName,
        outputUriPrefix,
        timestamp: new Date().toISOString(),
        triggerSource: options.triggerSource || "scheduled",
        triggeredBy: options.triggeredBy || "system",
        collectionIds,
        createdAt: FieldValue.serverTimestamp()
      };
      await auditRef.set(auditData);
    } catch (err) {
      logger.warn("[Firestore Backup] Could not record backup audit document:", err);
    }
  }

  return {
    operationName,
    outputUriPrefix,
    timestamp,
    collectionIds,
    auditDocId
  };
}

/**
 * Executes a managed Firestore restore from Google Cloud Storage.
 * Restores documents from an export directory to the target database.
 */
export async function executeFirestoreRestore(options: RestoreBackupOptions): Promise<RestoreBackupResult> {
  if (!options.inputUriPrefix || !options.inputUriPrefix.startsWith("gs://")) {
    throw new Error("inputUriPrefix must be a valid gs:// Google Cloud Storage URI.");
  }

  const client = getFirestoreAdminClient();
  const projectId =
    options.projectId ||
    process.env.GCLOUD_PROJECT ||
    (process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG).projectId : "mipa-2");

  const databaseName = client.databasePath(projectId, "(default)");
  const timestamp = new Date().toISOString();

  const request: {
    name: string;
    inputUriPrefix: string;
    collectionIds?: string[];
  } = {
    name: databaseName,
    inputUriPrefix: options.inputUriPrefix
  };

  if (options.collectionIds && options.collectionIds.length > 0) {
    request.collectionIds = options.collectionIds;
  }

  logger.info("[Firestore Restore] Initiating restore operation...", {
    databaseName,
    inputUriPrefix: options.inputUriPrefix
  });

  const [operation] = await client.importDocuments(request);
  const operationName = operation?.name || `operations/mock-restore-${Date.now()}`;

  logger.info("[Firestore Restore] Operation dispatched", { operationName });

  let auditDocId = `mock-restore-audit-${Date.now()}`;
  if (!options.skipAudit) {
    try {
      const db = getFirestore();
      const auditRef = db.collection("backups_audit").doc();
      auditDocId = auditRef.id;
      const auditData = {
        type: "restore",
        operationName,
        inputUriPrefix: options.inputUriPrefix,
        timestamp,
        triggeredBy: options.triggeredBy || "system",
        collectionIds: options.collectionIds || [],
        createdAt: FieldValue.serverTimestamp()
      };
      await auditRef.set(auditData);
    } catch (err) {
      logger.warn("[Firestore Restore] Could not record restore audit document:", err);
    }
  }

  return {
    operationName,
    inputUriPrefix: options.inputUriPrefix,
    timestamp,
    auditDocId
  };
}

/**
 * Scheduled Cloud Function (v2 Scheduler):
 * Runs daily at 03:00 UTC (customizable via BACKUP_SCHEDULE).
 */
export const scheduledFirestoreBackup = onSchedule(
  {
    schedule: process.env.BACKUP_SCHEDULE ?? "0 3 * * *",
    timeZone: process.env.BACKUP_TIME_ZONE ?? "Etc/UTC",
    region: process.env.BACKUP_REGION ?? "us-central1"
  },
  async () => {
    logger.info("[Firestore Backup] Scheduled job started.");
    const result = await executeFirestoreExport({ triggerSource: "scheduled" });
    logger.info("[Firestore Backup] Scheduled job completed successfully.", result);
  }
);

/**
 * Callable Function for Manual / Ad-hoc Backup Trigger (e.g. disaster drills):
 * Restricted to superAdmins of active organizations.
 */
export const triggerManualBackup = onCall(async (request: CallableRequest) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Please sign in to trigger backups.");
  }

  const orgId = request.data?.orgId;
  if (!orgId || typeof orgId !== "string") {
    throw new HttpsError("invalid-argument", "orgId is required.");
  }

  // Authorization check: Caller must be a superAdmin in orgs/{orgId}
  const db = getFirestore();
  const orgDoc = await db.doc(`orgs/${orgId}`).get();
  if (!orgDoc.exists) {
    throw new HttpsError("not-found", "Organization not found.");
  }

  const superAdmins: string[] = orgDoc.get("superAdmins") || [];
  if (!superAdmins.includes(request.auth.uid)) {
    throw new HttpsError("permission-denied", "Only organization superAdmins can trigger manual backups.");
  }

  const collectionIds = Array.isArray(request.data?.collectionIds) ? request.data.collectionIds : undefined;

  logger.info(`[Firestore Backup] Manual backup requested by UID ${request.auth.uid} for org ${orgId}`);
  const result = await executeFirestoreExport({
    triggerSource: "manual",
    triggeredBy: request.auth.uid,
    collectionIds
  });

  return {
    status: "dispatched",
    result
  };
});
