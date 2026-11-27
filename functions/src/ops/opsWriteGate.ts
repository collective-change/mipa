import * as crypto from "node:crypto";
import { onRequest, Request, Response } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getAuth } from "firebase-admin/auth";
import { Firestore, FieldPath, FieldValue, getFirestore } from "firebase-admin/firestore";

export const OPS_PATHS = {
  ITEMS_COLLECTION: "ops/items/all",
  TRANSITIONS_COLLECTION: "ops/transitions/all",
  RELATIONS_COLLECTION: "ops/relations/all",
  DIGEST_DOC: "ops/views/all/digest"
} as const;

export const MAX_RECENT_ITEMS = 25;
export const REBUILD_PAGE_SIZE = 500;
export const REBUILD_MAX_PAGES = 50;
export const MAX_TEXT_LENGTH = 10_000;

export const VALID_RELATION_TYPES = [
  "blocks",
  "depends_on",
  "parent_of",
  "relates_to",
  "duplicates"
] as const;

export type OpsRelationType = (typeof VALID_RELATION_TYPES)[number];

export type OpsMutationOp =
  | "put_item"
  | "comment_item"
  | "close_item"
  | "add_relation"
  | "remove_relation"
  | "rebuild_digest";

export type OpsErrorCode =
  | "OPS_UNAUTHORIZED"
  | "OPS_FORBIDDEN"
  | "OPS_INVALID_ARGUMENT"
  | "OPS_INVALID_OPERATION"
  | "OPS_ITEM_NOT_FOUND"
  | "OPS_METHOD_NOT_ALLOWED"
  | "OPS_CONFLICT"
  | "OPS_INTERNAL_ERROR";

export class OpsGateError extends Error {
  readonly code: OpsErrorCode;
  readonly httpStatus: number;

  constructor(code: OpsErrorCode, httpStatus: number, message: string) {
    super(message);
    this.name = "OpsGateError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export interface DecodedOperatorToken {
  uid: string;
  opsAdmin?: unknown;
  opsOperator?: unknown;
  opsActor?: unknown;
}

export interface OpsCaller {
  authenticated: true;
  actor: string;
  method: "gate_token" | "firebase_claim";
}

export interface OpsDigestRecentItem {
  id: string;
  title?: string;
  status?: string;
  marker?: string;
  updatedAtIso: string;
}

export interface OpsDigestDocument {
  schemaVersion: 1;
  revision: number;
  etag: string;
  updatedAtIso: string;
  lastMutation: {
    idempotencyKey: string;
    op: OpsMutationOp;
    targetId: string;
    actor: string;
    at: string;
  } | null;
  counts: {
    totalItems: number;
    byStatus: Record<string, number>;
    byMarker: Record<string, number>;
    totalTransitions: number;
    totalRelations: number;
  };
  recentItems: OpsDigestRecentItem[];
}

export interface OpsDigestPollResult {
  ok: true;
  exists: boolean;
  reads: 1;
  digest: OpsDigestDocument;
}

export interface OpsMutationResponse {
  ok: true;
  deduplicated: boolean;
  idempotencyKey: string;
  op: OpsMutationOp;
  targetId: string;
  transitionId: string;
  digestRevision: number;
  result: Record<string, unknown>;
}

export interface OpsGateDeps {
  db?: Firestore;
  expectedToken?: string;
  expectedTokens?: Record<string, string>;
  verifyIdToken?: (token: string) => Promise<DecodedOperatorToken>;
  now?: () => Date;
}

const VALID_DOC_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function isValidOpsDocId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > 128) return false;
  if (value.includes("..") || value.includes("/") || value.startsWith("__")) {
    return false;
  }
  return VALID_DOC_ID_RE.test(value);
}

function sha256Buffer(value: string): Buffer {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

function timingSafeStringEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const digestA = sha256Buffer(a);
  const digestB = sha256Buffer(b);
  return crypto.timingSafeEqual(digestA, digestB);
}

function readHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | undefined {
  const target = name.toLowerCase();
  for (const [key, raw] of Object.entries(headers)) {
    if (key.toLowerCase() !== target) continue;
    if (Array.isArray(raw)) {
      const first = raw.find((v) => typeof v === "string" && v.trim() !== "");
      return first?.trim();
    }
    if (typeof raw === "string" && raw.trim() !== "") {
      return raw.trim();
    }
  }
  return undefined;
}

function extractBearerToken(authHeader: string | undefined): string | undefined {
  if (!authHeader) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match) return undefined;
  const token = match[1].trim();
  return token || undefined;
}

function parseExpectedTokensMap(raw?: Record<string, string>): Record<string, string> {
  if (raw && typeof raw === "object") {
    return raw;
  }
  const envJson = (process.env.OPS_WRITE_GATE_TOKENS_JSON ?? "").trim();
  if (!envJson) return {};
  try {
    const parsed = JSON.parse(envJson) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [actorKey, secret] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof secret === "string" && secret.trim() && actorKey.trim()) {
        out[actorKey.trim()] = secret.trim();
      }
    }
    return out;
  } catch {
    return {};
  }
}

function matchGateCredential(
  candidate: string,
  expectedToken: string,
  expectedTokens: Record<string, string>
): string | null {
  let matchedActor: string | null = null;
  for (const [actorId, secret] of Object.entries(expectedTokens)) {
    if (secret && timingSafeStringEqual(candidate, secret)) {
      matchedActor = `operator:${actorId}`;
    }
  }
  if (matchedActor) return matchedActor;
  if (expectedToken && timingSafeStringEqual(candidate, expectedToken)) {
    const fingerprint = sha256Buffer(expectedToken).toString("hex").slice(0, 8);
    return `operator:token:${fingerprint}`;
  }
  return null;
}

/**
 * Authenticates an operator request and derives `actor` strictly from the
 * verified credential (never from request payload fields or unverified headers).
 */
export async function authenticateOpsCaller(
  headers: Record<string, string | string[] | undefined>,
  options?: {
    expectedToken?: string;
    expectedTokens?: Record<string, string>;
    verifyIdToken?: (token: string) => Promise<DecodedOperatorToken>;
  }
): Promise<OpsCaller> {
  const expectedToken = (options?.expectedToken ?? process.env.OPS_WRITE_GATE_TOKEN ?? "").trim();
  const expectedTokens = parseExpectedTokensMap(options?.expectedTokens);
  const xGateToken = readHeader(headers, "x-ops-gate-token");
  const bearerToken = extractBearerToken(readHeader(headers, "authorization"));

  if (xGateToken !== undefined) {
    const matchedActor = matchGateCredential(xGateToken, expectedToken, expectedTokens);
    if (matchedActor) {
      return {
        authenticated: true,
        actor: matchedActor,
        method: "gate_token"
      };
    }
    throw new OpsGateError("OPS_UNAUTHORIZED", 401, "Invalid operator gate token.");
  }

  if (bearerToken !== undefined) {
    const matchedActor = matchGateCredential(bearerToken, expectedToken, expectedTokens);
    if (matchedActor) {
      return {
        authenticated: true,
        actor: matchedActor,
        method: "gate_token"
      };
    }

    const verify =
      options?.verifyIdToken ||
      (async (token: string) => {
        const decoded = await getAuth().verifyIdToken(token);
        return decoded as DecodedOperatorToken;
      });

    let decoded: DecodedOperatorToken;
    try {
      decoded = await verify(bearerToken);
    } catch {
      throw new OpsGateError("OPS_UNAUTHORIZED", 401, "Invalid operator credentials.");
    }

    if (decoded.opsAdmin === true || decoded.opsOperator === true) {
      const claimActor =
        typeof decoded.opsActor === "string" && decoded.opsActor.trim().length > 0 && decoded.opsActor.trim().length <= 64
          ? `operator:${decoded.opsActor.trim()}`
          : `uid:${decoded.uid}`;
      return {
        authenticated: true,
        actor: claimActor,
        method: "firebase_claim"
      };
    }

    throw new OpsGateError("OPS_FORBIDDEN", 403, "Caller does not have operator privileges.");
  }

  throw new OpsGateError("OPS_UNAUTHORIZED", 401, "Operator authentication is required.");
}

function createEmptyDigest(nowIso: string): OpsDigestDocument {
  return {
    schemaVersion: 1,
    revision: 0,
    etag: "v0:empty",
    updatedAtIso: nowIso,
    lastMutation: null,
    counts: {
      totalItems: 0,
      byStatus: {},
      byMarker: {},
      totalTransitions: 0,
      totalRelations: 0
    },
    recentItems: []
  };
}

function toCountRecord(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      out[k] = Math.floor(v);
    }
  }
  return out;
}

function adjustCountMap(map: Record<string, number>, key: string | undefined, delta: number): void {
  if (!key || delta === 0) return;
  const next = Math.max(0, (map[key] || 0) + delta);
  if (next === 0) {
    delete map[key];
  } else {
    map[key] = next;
  }
}

function normalizeRecentItems(raw: unknown): OpsDigestRecentItem[] {
  if (!Array.isArray(raw)) return [];
  const items: OpsDigestRecentItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    if (typeof obj.id !== "string" || typeof obj.updatedAtIso !== "string") continue;
    const item: OpsDigestRecentItem = {
      id: obj.id,
      updatedAtIso: obj.updatedAtIso
    };
    if (typeof obj.title === "string") item.title = obj.title;
    if (typeof obj.status === "string") item.status = obj.status;
    if (typeof obj.marker === "string") item.marker = obj.marker;
    items.push(item);
    if (items.length >= MAX_RECENT_ITEMS) break;
  }
  return items;
}

function normalizeDigestDoc(raw: unknown, fallbackIso: string): OpsDigestDocument {
  if (!raw || typeof raw !== "object") {
    return createEmptyDigest(fallbackIso);
  }
  const obj = raw as Record<string, unknown>;
  const rawCounts = (obj.counts && typeof obj.counts === "object" ? obj.counts : {}) as Record<string, unknown>;
  const rawLast = obj.lastMutation && typeof obj.lastMutation === "object"
    ? (obj.lastMutation as Record<string, unknown>)
    : null;

  const revision = typeof obj.revision === "number" && Number.isFinite(obj.revision) && obj.revision >= 0
    ? Math.floor(obj.revision)
    : 0;

  return {
    schemaVersion: 1,
    revision,
    etag: typeof obj.etag === "string" && obj.etag ? obj.etag : `v${revision}:init`,
    updatedAtIso: typeof obj.updatedAtIso === "string" ? obj.updatedAtIso : fallbackIso,
    lastMutation:
      rawLast &&
      typeof rawLast.idempotencyKey === "string" &&
      typeof rawLast.op === "string" &&
      typeof rawLast.targetId === "string" &&
      typeof rawLast.actor === "string" &&
      typeof rawLast.at === "string"
        ? {
            idempotencyKey: rawLast.idempotencyKey,
            op: rawLast.op as OpsMutationOp,
            targetId: rawLast.targetId,
            actor: rawLast.actor,
            at: rawLast.at
          }
        : null,
    counts: {
      totalItems:
        typeof rawCounts.totalItems === "number" && Number.isFinite(rawCounts.totalItems)
          ? Math.max(0, Math.floor(rawCounts.totalItems))
          : 0,
      byStatus: toCountRecord(rawCounts.byStatus),
      byMarker: toCountRecord(rawCounts.byMarker),
      totalTransitions:
        typeof rawCounts.totalTransitions === "number" && Number.isFinite(rawCounts.totalTransitions)
          ? Math.max(0, Math.floor(rawCounts.totalTransitions))
          : 0,
      totalRelations:
        typeof rawCounts.totalRelations === "number" && Number.isFinite(rawCounts.totalRelations)
          ? Math.max(0, Math.floor(rawCounts.totalRelations))
          : 0
    },
    recentItems: normalizeRecentItems(obj.recentItems)
  };
}

function upsertRecentItem(
  existing: OpsDigestRecentItem[],
  item: OpsDigestRecentItem
): OpsDigestRecentItem[] {
  const filtered = existing.filter((entry) => entry.id !== item.id);
  return [item, ...filtered].slice(0, MAX_RECENT_ITEMS);
}

/**
 * Coarse-grained poll path: reads ONLY the single `ops/digest` document.
 * Always issues exactly 1 Firestore document read regardless of queue size.
 */
export async function readOpsDigest(
  db: Firestore,
  now: () => Date = () => new Date()
): Promise<OpsDigestPollResult> {
  const snap = await db.doc(OPS_PATHS.DIGEST_DOC).get();
  const fallbackIso = now().toISOString();
  const digest = snap.exists
    ? normalizeDigestDoc(snap.data(), fallbackIso)
    : createEmptyDigest(fallbackIso);

  return {
    ok: true,
    exists: snap.exists,
    reads: 1,
    digest
  };
}

function requireNonEmptyString(value: unknown, fieldName: string, maxLen = MAX_TEXT_LENGTH): string {
  if (typeof value !== "string") {
    throw new OpsGateError("OPS_INVALID_ARGUMENT", 400, `${fieldName} must be a non-empty string.`);
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen) {
    throw new OpsGateError(
      "OPS_INVALID_ARGUMENT",
      400,
      `${fieldName} must be between 1 and ${maxLen} characters.`
    );
  }
  return trimmed;
}

const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const SERVER_AUTHORED_PROVENANCE_KEYS = new Set([
  "actor",
  "createdBy",
  "updatedBy",
  "closedBy",
  "createdAt",
  "updatedAt"
]);

function sanitizeItemFields(rawFields: unknown): Record<string, unknown> {
  if (!rawFields || typeof rawFields !== "object" || Array.isArray(rawFields)) {
    throw new OpsGateError("OPS_INVALID_ARGUMENT", 400, "fields must be a non-empty plain object.");
  }
  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(rawFields as Record<string, unknown>)) {
    if (RESERVED_KEYS.has(key) || key.startsWith("__") || key.includes("/")) {
      throw new OpsGateError("OPS_INVALID_ARGUMENT", 400, `Invalid field key: ${key}`);
    }
    if (SERVER_AUTHORED_PROVENANCE_KEYS.has(key)) {
      // Never accept caller-supplied actor/provenance fields from payload.
      continue;
    }
    if (val !== undefined) {
      clean[key] = val;
    }
  }
  if (Object.keys(clean).length === 0) {
    throw new OpsGateError("OPS_INVALID_ARGUMENT", 400, "fields must contain at least one defined property.");
  }
  return clean;
}

function validateRelationType(value: unknown): OpsRelationType {
  if (typeof value !== "string" || !(VALID_RELATION_TYPES as readonly string[]).includes(value)) {
    throw new OpsGateError(
      "OPS_INVALID_ARGUMENT",
      400,
      `relationType must be one of: ${VALID_RELATION_TYPES.join(", ")}.`
    );
  }
  return value as OpsRelationType;
}

function resolveRelationId(payload: Record<string, unknown>): {
  relationId: string;
  fromId?: string;
  toId?: string;
  relationType?: OpsRelationType;
} {
  if (payload.relationId !== undefined) {
    if (!isValidOpsDocId(payload.relationId)) {
      throw new OpsGateError("OPS_INVALID_ARGUMENT", 400, "relationId is invalid.");
    }
    return { relationId: payload.relationId };
  }

  if (!isValidOpsDocId(payload.fromId) || !isValidOpsDocId(payload.toId)) {
    throw new OpsGateError("OPS_INVALID_ARGUMENT", 400, "fromId and toId must be valid ops document IDs.");
  }
  if (payload.fromId === payload.toId) {
    throw new OpsGateError("OPS_INVALID_ARGUMENT", 400, "Self-referential relations are not allowed.");
  }
  const relationType = validateRelationType(payload.relationType);
  const relationId = `${payload.fromId}__${relationType}__${payload.toId}`;
  if (!isValidOpsDocId(relationId)) {
    throw new OpsGateError("OPS_INVALID_ARGUMENT", 400, "Combined relation ID exceeds 128 characters.");
  }
  return {
    relationId,
    fromId: payload.fromId,
    toId: payload.toId,
    relationType
  };
}

interface RebuildScanSnapshot {
  totalItems: number;
  byStatus: Record<string, number>;
  byMarker: Record<string, number>;
  totalRelations: number;
  totalTransitions: number;
  recentItems: OpsDigestRecentItem[];
}

async function scanLiveOpsForDigest(db: Firestore, fallbackIso: string): Promise<RebuildScanSnapshot> {
  const byStatus: Record<string, number> = {};
  const byMarker: Record<string, number> = {};
  const recentPool: OpsDigestRecentItem[] = [];
  let totalItems = 0;

  let itemCursor: string | undefined;
  for (let page = 0; page < REBUILD_MAX_PAGES; page++) {
    let q = db
      .collection(OPS_PATHS.ITEMS_COLLECTION)
      .orderBy(FieldPath.documentId())
      .limit(REBUILD_PAGE_SIZE);
    if (itemCursor) {
      q = q.startAfter(itemCursor);
    }
    const snap = await q.get();
    if (snap.empty) break;

    for (const docSnap of snap.docs) {
      totalItems += 1;
      const data = docSnap.data() as Record<string, unknown>;
      const status = typeof data.status === "string" ? data.status : undefined;
      const marker = typeof data.marker === "string" ? data.marker : undefined;
      const title = typeof data.title === "string" ? data.title : undefined;
      const updatedAtIso = typeof data.updatedAtIso === "string" ? data.updatedAtIso : fallbackIso;

      if (status) byStatus[status] = (byStatus[status] || 0) + 1;
      if (marker) byMarker[marker] = (byMarker[marker] || 0) + 1;

      recentPool.push({
        id: docSnap.id,
        ...(title ? { title } : {}),
        ...(status ? { status } : {}),
        ...(marker ? { marker } : {}),
        updatedAtIso
      });
    }

    itemCursor = snap.docs[snap.docs.length - 1].id;
    if (snap.size < REBUILD_PAGE_SIZE) break;
  }

  recentPool.sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
  const recentItems = recentPool.slice(0, MAX_RECENT_ITEMS);

  async function countCollectionBounded(collectionPath: string): Promise<number> {
    let count = 0;
    let cursor: string | undefined;
    for (let page = 0; page < REBUILD_MAX_PAGES; page++) {
      let q = db
        .collection(collectionPath)
        .orderBy(FieldPath.documentId())
        .select()
        .limit(REBUILD_PAGE_SIZE);
      if (cursor) {
        q = q.startAfter(cursor);
      }
      const snap = await q.get();
      if (snap.empty) break;
      count += snap.size;
      cursor = snap.docs[snap.docs.length - 1].id;
      if (snap.size < REBUILD_PAGE_SIZE) break;
    }
    return count;
  }

  const [totalRelations, totalTransitions] = await Promise.all([
    countCollectionBounded(OPS_PATHS.RELATIONS_COLLECTION),
    countCollectionBounded(OPS_PATHS.TRANSITIONS_COLLECTION)
  ]);

  return {
    totalItems,
    byStatus,
    byMarker,
    totalRelations,
    totalTransitions,
    recentItems
  };
}

const VALID_MUTATION_OPS = new Set<OpsMutationOp>([
  "put_item",
  "comment_item",
  "close_item",
  "add_relation",
  "remove_relation",
  "rebuild_digest"
]);

export async function executeOpsMutation(
  db: Firestore,
  rawBody: unknown,
  actor: string,
  now: () => Date = () => new Date()
): Promise<OpsMutationResponse> {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    throw new OpsGateError("OPS_INVALID_ARGUMENT", 400, "Request body must be a JSON object.");
  }

  const body = rawBody as Record<string, unknown>;
  const opRaw = body.op;
  if (typeof opRaw !== "string" || !VALID_MUTATION_OPS.has(opRaw as OpsMutationOp)) {
    throw new OpsGateError(
      "OPS_INVALID_OPERATION",
      400,
      `Unsupported op "${String(opRaw ?? "")}".`
    );
  }
  const op = opRaw as OpsMutationOp;

  if (!isValidOpsDocId(body.idempotencyKey)) {
    throw new OpsGateError(
      "OPS_INVALID_ARGUMENT",
      400,
      "idempotencyKey must be a valid ops identifier (1..128 chars, alphanumeric/._:-, no traversal)."
    );
  }
  const idempotencyKey = body.idempotencyKey;

  let targetId: string;
  let fieldsPatch: Record<string, unknown> | undefined;
  let commentNote: string | undefined;
  let closeEvidence: string | undefined;
  let closeReadBack: string | undefined;
  let relationSpec:
    | { relationId: string; fromId?: string; toId?: string; relationType?: OpsRelationType; note?: string }
    | undefined;

  if (op === "put_item") {
    if (!isValidOpsDocId(body.itemId)) {
      throw new OpsGateError("OPS_INVALID_ARGUMENT", 400, "itemId must be a valid ops document ID.");
    }
    targetId = body.itemId;
    fieldsPatch = sanitizeItemFields(body.fields);
  } else if (op === "comment_item") {
    if (!isValidOpsDocId(body.itemId)) {
      throw new OpsGateError("OPS_INVALID_ARGUMENT", 400, "itemId must be a valid ops document ID.");
    }
    targetId = body.itemId;
    commentNote = requireNonEmptyString(body.note, "note");
  } else if (op === "close_item") {
    if (!isValidOpsDocId(body.itemId)) {
      throw new OpsGateError("OPS_INVALID_ARGUMENT", 400, "itemId must be a valid ops document ID.");
    }
    targetId = body.itemId;
    closeEvidence = requireNonEmptyString(body.evidence, "evidence");
    closeReadBack = requireNonEmptyString(body.readBack, "readBack");
  } else if (op === "add_relation") {
    const resolved = resolveRelationId(body);
    if (!resolved.fromId || !resolved.toId || !resolved.relationType) {
      throw new OpsGateError(
        "OPS_INVALID_ARGUMENT",
        400,
        "add_relation requires fromId, toId, and relationType."
      );
    }
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 1000) : undefined;
    relationSpec = { ...resolved, note };
    targetId = resolved.relationId;
  } else if (op === "remove_relation") {
    relationSpec = resolveRelationId(body);
    targetId = relationSpec.relationId;
  } else {
    targetId = OPS_PATHS.DIGEST_DOC;
  }

  const transitionRef = db.doc(`${OPS_PATHS.TRANSITIONS_COLLECTION}/${idempotencyKey}`);
  const digestRef = db.doc(OPS_PATHS.DIGEST_DOC);

  // For rebuild_digest, check idempotency first and perform bounded scan outside transaction.
  let rebuildSnapshot: RebuildScanSnapshot | undefined;
  if (op === "rebuild_digest") {
    const preCheck = await transitionRef.get();
    if (preCheck.exists) {
      const prevData = preCheck.data() as Record<string, unknown>;
      return {
        ok: true,
        deduplicated: true,
        idempotencyKey,
        op,
        targetId,
        transitionId: idempotencyKey,
        digestRevision: typeof prevData.digestRevision === "number" ? prevData.digestRevision : 0,
        result: (prevData.result as Record<string, unknown>) || {}
      };
    }
    rebuildSnapshot = await scanLiveOpsForDigest(db, now().toISOString());
  }

  return db.runTransaction(async (tx) => {
    const nowIso = now().toISOString();

    // 1. Idempotency check FIRST inside the transaction
    const transitionSnap = await tx.get(transitionRef);
    if (transitionSnap.exists) {
      const prevData = transitionSnap.data() as Record<string, unknown>;
      return {
        ok: true,
        deduplicated: true,
        idempotencyKey,
        op,
        targetId,
        transitionId: idempotencyKey,
        digestRevision: typeof prevData.digestRevision === "number" ? prevData.digestRevision : 0,
        result: (prevData.result as Record<string, unknown>) || {}
      };
    }

    // 2. Read target document (if applicable) and digest BEFORE any writes
    const itemRef =
      op === "put_item" || op === "comment_item" || op === "close_item"
        ? db.doc(`${OPS_PATHS.ITEMS_COLLECTION}/${targetId}`)
        : null;
    const relationRef =
      op === "add_relation" || op === "remove_relation"
        ? db.doc(`${OPS_PATHS.RELATIONS_COLLECTION}/${targetId}`)
        : null;

    const [targetSnap, digestSnap] = await Promise.all([
      itemRef ? tx.get(itemRef) : relationRef ? tx.get(relationRef) : Promise.resolve(null),
      tx.get(digestRef)
    ]);

    const currentDigest = digestSnap.exists
      ? normalizeDigestDoc(digestSnap.data(), nowIso)
      : createEmptyDigest(nowIso);

    const nextRevision = currentDigest.revision + 1;
    const nextEtag = `v${nextRevision}:${idempotencyKey}`;

    const nextCounts = {
      totalItems: currentDigest.counts.totalItems,
      byStatus: { ...currentDigest.counts.byStatus },
      byMarker: { ...currentDigest.counts.byMarker },
      totalTransitions: currentDigest.counts.totalTransitions + 1,
      totalRelations: currentDigest.counts.totalRelations
    };
    let nextRecentItems = [...currentDigest.recentItems];
    let opResult: Record<string, unknown> = {};

    // 3. Validate and apply operation writes
    if (op === "put_item" && itemRef && fieldsPatch) {
      const prev = targetSnap?.exists ? (targetSnap.data() as Record<string, unknown>) : {};
      const prevStatus = typeof prev.status === "string" ? prev.status : undefined;
      const prevMarker = typeof prev.marker === "string" ? prev.marker : undefined;

      const writePayload: Record<string, unknown> = {
        ...fieldsPatch,
        id: targetId,
        createdBy: typeof prev.createdBy === "string" ? prev.createdBy : actor,
        updatedAtIso: nowIso,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor
      };
      if (!targetSnap?.exists && writePayload.createdAtIso === undefined) {
        writePayload.createdAtIso = nowIso;
        writePayload.createdAt = FieldValue.serverTimestamp();
      }

      const merged = { ...prev, ...writePayload };
      const nextStatus = typeof merged.status === "string" ? merged.status : undefined;
      const nextMarker = typeof merged.marker === "string" ? merged.marker : undefined;
      const nextTitle = typeof merged.title === "string" ? merged.title : undefined;

      if (!targetSnap?.exists) {
        nextCounts.totalItems += 1;
        adjustCountMap(nextCounts.byStatus, nextStatus, 1);
        adjustCountMap(nextCounts.byMarker, nextMarker, 1);
      } else {
        if (prevStatus !== nextStatus) {
          adjustCountMap(nextCounts.byStatus, prevStatus, -1);
          adjustCountMap(nextCounts.byStatus, nextStatus, 1);
        }
        if (prevMarker !== nextMarker) {
          adjustCountMap(nextCounts.byMarker, prevMarker, -1);
          adjustCountMap(nextCounts.byMarker, nextMarker, 1);
        }
      }

      nextRecentItems = upsertRecentItem(nextRecentItems, {
        id: targetId,
        ...(nextTitle ? { title: nextTitle } : {}),
        ...(nextStatus ? { status: nextStatus } : {}),
        ...(nextMarker ? { marker: nextMarker } : {}),
        updatedAtIso: nowIso
      });

      tx.set(itemRef, writePayload, { merge: true });
      opResult = { created: !targetSnap?.exists, itemId: targetId };
    } else if (op === "comment_item" && itemRef && commentNote) {
      if (!targetSnap || !targetSnap.exists) {
        throw new OpsGateError("OPS_ITEM_NOT_FOUND", 404, `Ops item "${targetId}" does not exist.`);
      }
      const prev = targetSnap.data() as Record<string, unknown>;
      const prevComments = Array.isArray(prev.comments) ? prev.comments : [];
      const commentEntry = {
        id: idempotencyKey,
        note: commentNote,
        actor,
        at: nowIso
      };
      const nextComments = [...prevComments, commentEntry];

      tx.set(
        itemRef,
        {
          comments: nextComments,
          lastCommentAtIso: nowIso,
          updatedAtIso: nowIso,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: actor
        },
        { merge: true }
      );

      const title = typeof prev.title === "string" ? prev.title : undefined;
      const status = typeof prev.status === "string" ? prev.status : undefined;
      const marker = typeof prev.marker === "string" ? prev.marker : undefined;
      nextRecentItems = upsertRecentItem(nextRecentItems, {
        id: targetId,
        ...(title ? { title } : {}),
        ...(status ? { status } : {}),
        ...(marker ? { marker } : {}),
        updatedAtIso: nowIso
      });

      opResult = { itemId: targetId, commentCount: nextComments.length, comment: commentEntry };
    } else if (op === "close_item" && itemRef && closeEvidence && closeReadBack) {
      if (!targetSnap || !targetSnap.exists) {
        throw new OpsGateError("OPS_ITEM_NOT_FOUND", 404, `Ops item "${targetId}" does not exist.`);
      }
      const prev = targetSnap.data() as Record<string, unknown>;
      const prevStatus = typeof prev.status === "string" ? prev.status : undefined;
      const prevMarker = typeof prev.marker === "string" ? prev.marker : undefined;

      if (prevStatus !== "closed") {
        adjustCountMap(nextCounts.byStatus, prevStatus, -1);
        adjustCountMap(nextCounts.byStatus, "closed", 1);
      }
      if (prevMarker !== "DONE") {
        adjustCountMap(nextCounts.byMarker, prevMarker, -1);
        adjustCountMap(nextCounts.byMarker, "DONE", 1);
      }

      tx.set(
        itemRef,
        {
          status: "closed",
          marker: "DONE",
          closedAtIso: nowIso,
          closedBy: actor,
          closeEvidence,
          closeReadBack,
          updatedAtIso: nowIso,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: actor
        },
        { merge: true }
      );

      const title = typeof prev.title === "string" ? prev.title : undefined;
      nextRecentItems = upsertRecentItem(nextRecentItems, {
        id: targetId,
        ...(title ? { title } : {}),
        status: "closed",
        marker: "DONE",
        updatedAtIso: nowIso
      });

      opResult = { itemId: targetId, status: "closed", marker: "DONE" };
    } else if (op === "add_relation" && relationRef && relationSpec) {
      const existed = Boolean(targetSnap?.exists);
      const prev = existed ? (targetSnap?.data() as Record<string, unknown>) : {};
      tx.set(
        relationRef,
        {
          id: targetId,
          fromId: relationSpec.fromId,
          toId: relationSpec.toId,
          relationType: relationSpec.relationType,
          ...(relationSpec.note ? { note: relationSpec.note } : {}),
          createdBy: typeof prev.createdBy === "string" ? prev.createdBy : actor,
          updatedBy: actor,
          updatedAtIso: nowIso,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      if (!existed) {
        nextCounts.totalRelations += 1;
      }
      opResult = { relationId: targetId, created: !existed };
    } else if (op === "remove_relation" && relationRef) {
      const existed = Boolean(targetSnap?.exists);
      if (existed) {
        tx.delete(relationRef);
        nextCounts.totalRelations = Math.max(0, nextCounts.totalRelations - 1);
      }
      opResult = { relationId: targetId, removed: existed };
    } else if (op === "rebuild_digest" && rebuildSnapshot) {
      nextCounts.totalItems = rebuildSnapshot.totalItems;
      nextCounts.byStatus = { ...rebuildSnapshot.byStatus };
      nextCounts.byMarker = { ...rebuildSnapshot.byMarker };
      nextCounts.totalRelations = rebuildSnapshot.totalRelations;
      nextCounts.totalTransitions = rebuildSnapshot.totalTransitions + 1;
      nextRecentItems = rebuildSnapshot.recentItems;
      opResult = {
        rebuilt: true,
        totalItems: rebuildSnapshot.totalItems,
        totalRelations: rebuildSnapshot.totalRelations
      };
    }

    const nextDigest: OpsDigestDocument & { updatedAt: FieldValue } = {
      schemaVersion: 1,
      revision: nextRevision,
      etag: nextEtag,
      updatedAtIso: nowIso,
      updatedAt: FieldValue.serverTimestamp(),
      lastMutation: {
        idempotencyKey,
        op,
        targetId,
        actor,
        at: nowIso
      },
      counts: nextCounts,
      recentItems: nextRecentItems
    };

    // Append-only transition write: tx.create enforces engine-level immutability.
    tx.create(transitionRef, {
      id: idempotencyKey,
      idempotencyKey,
      op,
      targetId,
      actor,
      digestRevision: nextRevision,
      createdAtIso: nowIso,
      createdAt: FieldValue.serverTimestamp(),
      result: opResult
    });

    tx.set(digestRef, nextDigest);

    return {
      ok: true,
      deduplicated: false,
      idempotencyKey,
      op,
      targetId,
      transitionId: idempotencyKey,
      digestRevision: nextRevision,
      result: opResult
    };
  });
}

function parseJsonBody(rawBody: unknown): Record<string, unknown> {
  if (typeof rawBody === "string") {
    try {
      const parsed = JSON.parse(rawBody) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new OpsGateError("OPS_INVALID_ARGUMENT", 400, "Request body must be a JSON object.");
      }
      return parsed as Record<string, unknown>;
    } catch (err) {
      if (err instanceof OpsGateError) throw err;
      throw new OpsGateError("OPS_INVALID_ARGUMENT", 400, "Invalid JSON payload.");
    }
  }
  if (rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)) {
    return rawBody as Record<string, unknown>;
  }
  throw new OpsGateError("OPS_INVALID_ARGUMENT", 400, "Request body must be a JSON object.");
}

export function createOpsWriteGateHandler(deps: OpsGateDeps = {}) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      if (req.method !== "GET" && req.method !== "POST") {
        throw new OpsGateError("OPS_METHOD_NOT_ALLOWED", 405, `Method ${req.method} is not allowed.`);
      }

      const db = deps.db || getFirestore();
      const now = deps.now || (() => new Date());

      if (req.method === "GET") {
        await authenticateOpsCaller(req.headers as Record<string, string | string[] | undefined>, {
          expectedToken: deps.expectedToken,
          expectedTokens: deps.expectedTokens,
          verifyIdToken: deps.verifyIdToken
        });
        const poll = await readOpsDigest(db, now);
        res.status(200).json(poll);
        return;
      }

      const caller = await authenticateOpsCaller(
        req.headers as Record<string, string | string[] | undefined>,
        {
          expectedToken: deps.expectedToken,
          expectedTokens: deps.expectedTokens,
          verifyIdToken: deps.verifyIdToken
        }
      );

      const body = parseJsonBody(req.body);

      if (body.op === "get_digest") {
        const poll = await readOpsDigest(db, now);
        res.status(200).json(poll);
        return;
      }

      // Actor is strictly derived from caller's verified credential, never from request payload or headers.
      const outcome = await executeOpsMutation(db, body, caller.actor, now);
      res.status(200).json(outcome);
    } catch (err: unknown) {
      if (err instanceof OpsGateError) {
        res.status(err.httpStatus).json({
          ok: false,
          error: {
            code: err.code,
            message: err.message
          }
        });
        return;
      }
      logger.error("[opsWriteGate] Unexpected error:", err);
      res.status(500).json({
        ok: false,
        error: {
          code: "OPS_INTERNAL_ERROR",
          message: "Internal error processing ops write gate request."
        }
      });
    }
  };
}

/**
 * Single authoritative Cloud Function write gate for the `ops/` store.
 */
export const opsWriteGate = onRequest(createOpsWriteGateHandler());
