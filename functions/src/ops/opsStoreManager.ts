/**
 * Ops Issue Store Manager & Write Gate (todo281, step 1B)
 *
 * Provisions and governs the server-only `ops/` subtree in Firestore (`mipa-2`):
 *   - `ops/items/all/{code}`           Structured issue items
 *   - `ops/transitions/log/{txId}`     Append-only, immutable transition log
 *   - `ops/relations/edges/{edgeId}`   Normalized directed relation edges
 *   - `ops/board/cards/{code}`         Published board card view
 *   - `ops/views/meta/digest`          Coarse-grained digest document (1-read poll)
 *   - `ops/views/meta/latest`          Published board lane summary metadata
 *
 * Automation & Safety Governance (per CLAUDE.md):
 * 1. Instrumentation: `ops/views/meta/digest` maintains non-zero operational counters
 *    (`revision`, `counts.*`, `write_gate_stats.{accepted,deduplicated}`).
 * 2. Loud Failure & Sentinel: Unauthenticated callers, non-operator product users, and
 *    §2 invariant violations throw typed `HttpsError` codes and emit structured warning
 *    logs; `board-contradictions-watch` verifies live store invariants and wakes the
 *    operator (昕 / Ted) on drift. Callers verify via `readBackOpsCounts` / `pollOpsDigest`.
 * 3. Retention Rule: `ops/items/all` and `ops/transitions/log` are bounded permanent
 *    operational governance records; `ops/relations/edges` removes stale edges atomically
 *    when an item's relations change; no `.bak` or machine-local queue files are created.
 */

import * as crypto from "node:crypto";
import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {
  getFirestore,
  FieldValue,
  Firestore,
  Transaction,
  DocumentReference,
  DocumentSnapshot,
  Query,
  QuerySnapshot
} from "firebase-admin/firestore";

export const OPS_ITEMS_COLLECTION = "ops/items/all";
export const OPS_TRANSITIONS_COLLECTION = "ops/transitions/log";
export const OPS_RELATIONS_COLLECTION = "ops/relations/edges";
export const OPS_BOARD_CARDS_COLLECTION = "ops/board/cards";
export const OPS_DIGEST_DOC_PATH = "ops/views/meta/digest";
export const OPS_BOARD_META_DOC_PATH = "ops/views/meta/latest";

const PAGE_LIMIT = 500;

export const OPS_STAGES = [
  "discovered",
  "triaged",
  "queued",
  "claimed",
  "working",
  "verifiable",
  "closed",
  "blocked"
] as const;
export type OpsStage = (typeof OPS_STAGES)[number];

export const OPS_MARKERS = ["TODO", "IN PROGRESS", "BLOCKED", "DONE"] as const;
export type OpsMarker = (typeof OPS_MARKERS)[number];

export const OPS_LANES = ["ted", "free", "eng", "research", "closed"] as const;
export type OpsLane = (typeof OPS_LANES)[number];

export const OPS_RELATION_TYPES = [
  "blocks",
  "blocked_by",
  "duplicate_of",
  "part_of",
  "discovered_from",
  "supersedes"
] as const;
export type OpsRelationType = (typeof OPS_RELATION_TYPES)[number];

export type OpsRelationsMap = Partial<Record<OpsRelationType, string[]>>;

export interface OpsEvidence {
  command: string;
  read_back: string;
}

export interface OpsProvenance {
  discovered_from: string;
  collector?: string;
  from?: string;
  complete_body_from?: string;
}

export interface OpsBlockedModifier {
  reason: string;
  unblock_when: string;
}

export interface OpsWaitingOnTedModifier {
  question: string;
  options: string[];
  recommendation: string;
}

export interface OpsModifiers {
  blocked?: OpsBlockedModifier;
  waiting_on_Ted?: OpsWaitingOnTedModifier;
  duplicate_of?: string;
  superseded_by?: string;
}

export interface OpsComment {
  note: string;
  source: string | null;
  ts: string;
}

export interface OpsItemRecord {
  code: string;
  title: string;
  stage: OpsStage;
  marker: OpsMarker;
  status: string;
  lane: OpsLane;
  detail: string;
  section?: string;
  source: string;
  tags: string[];
  flag: string;
  need: boolean;
  ask: string;
  order: number;
  fields: Record<string, string>;
  acceptance_criteria: string[];
  evidence: OpsEvidence | null;
  provenance: OpsProvenance;
  modifiers?: OpsModifiers;
  relations: OpsRelationsMap;
  comments: OpsComment[];
  violations: string[];
  actor: string;
  updated_at: unknown;
}

export interface OpsRelationEdge {
  edge_id: string;
  from: string;
  type: OpsRelationType;
  to: string;
  actor: string;
  updated_at: unknown;
}

export interface OpsDigestCounts {
  items: number;
  transitions: number;
  relations: number;
  board_cards: number;
  by_marker: Record<string, number>;
  by_stage: Record<string, number>;
  by_lane: Record<string, number>;
}

export interface OpsDigestDocument {
  schema_version: 1;
  revision: number;
  digest_sha: string;
  counts: OpsDigestCounts;
  write_gate_stats: {
    accepted: number;
    deduplicated: number;
  };
  last_write: {
    op: string;
    code: string | null;
    transition_id: string | null;
    actor: string;
  };
  updated_iso: string;
  updated_at: unknown;
}

export interface OpsPutPayload {
  op: "put";
  idempotencyKey: string;
  code: string;
  title?: string;
  stage?: OpsStage;
  marker?: OpsMarker;
  lane?: OpsLane;
  detail?: string;
  clearDetail?: boolean;
  section?: string;
  source?: string;
  tags?: string[];
  flag?: string;
  need?: boolean;
  ask?: string;
  order?: number;
  fields?: Record<string, string>;
  acceptance_criteria?: string[];
  evidence?: OpsEvidence | null;
  provenance?: Partial<OpsProvenance>;
  modifiers?: OpsModifiers;
  relations?: OpsRelationsMap;
  comment?: { note: string; source?: string };
  why?: string;
}

export interface OpsClosePayload {
  op: "close";
  idempotencyKey: string;
  code: string;
  evidence: OpsEvidence;
  why?: string;
  comment?: { note: string; source?: string };
}

export interface OpsTransitionPayload {
  op: "transition";
  idempotencyKey: string;
  code: string;
  toMarker: OpsMarker;
  toStage?: OpsStage;
  toLane?: OpsLane;
  why: string;
  evidence?: OpsEvidence;
  modifiers?: OpsModifiers;
  fields?: Record<string, string>;
}

export interface OpsPollDigestPayload {
  op: "poll_digest";
  sinceDigestSha?: string;
}

export interface OpsReadBoardViewPayload {
  op: "read_board_view";
  lane?: OpsLane;
  limit?: number;
}

export type OpsManagerRequestPayload =
  | OpsPutPayload
  | OpsClosePayload
  | OpsTransitionPayload
  | OpsPollDigestPayload
  | OpsReadBoardViewPayload;

/**
 * Named error raised when an offline caller attempts an ops write without retry
 * or exhausts bounded retry attempts while disconnected.
 */
export class OpsWriteOfflineError extends Error {
  public readonly code = "functions/unavailable";
  public readonly isRetryable = true;

  constructor(message = "Caller is offline or write gate is unreachable (functions/unavailable).") {
    super(message);
    this.name = "OpsWriteOfflineError";
  }
}

const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

// Machine-checkable unblock pattern: references a card code, PR, release key, env/secret, or structured token
const MACHINE_CHECKABLE_UNBLOCK_RE =
  /(?:\b(?:todo|MIPA-?)\d+\b|\b[A-Z]\d+[a-z]?\b|#\d+|^(?:card|dep|pr|event|cron|secret|workflow|check|cmd):[^\s]+|[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+|=)/i;

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

export function sanitizeDocKey(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/[^A-Za-z0-9_.-]/g, "_");
}

export function buildIdempotentTransitionId(op: string, code: string, idempotencyKey: string): string {
  const hash = sha256Hex(`${op}:${code.trim()}:${idempotencyKey.trim()}`).slice(0, 32);
  return `idem_${hash}`;
}

export function buildRelationEdgeId(from: string, type: OpsRelationType, to: string): string {
  return `${sanitizeDocKey(from)}__${sanitizeDocKey(type)}__${sanitizeDocKey(to)}`;
}

export function stageForMarker(marker: OpsMarker, explicitStage?: OpsStage): OpsStage {
  if (explicitStage && (OPS_STAGES as readonly string[]).includes(explicitStage)) {
    return explicitStage;
  }
  switch (marker) {
    case "DONE":
      return "closed";
    case "IN PROGRESS":
      return "claimed";
    case "BLOCKED":
      return "blocked";
    case "TODO":
    default:
      return "queued";
  }
}

const LANE_LABELS: Record<OpsLane, string> = {
  ted: "NEEDS YOU",
  free: "MINE",
  eng: "ENGINEERING",
  research: "TO RESEARCH",
  closed: "RECENTLY CLOSED"
};

export function normalizeRelations(raw?: OpsRelationsMap | null): OpsRelationsMap {
  if (!raw || typeof raw !== "object") return {};
  const out: OpsRelationsMap = {};
  for (const relType of OPS_RELATION_TYPES) {
    const targets = raw[relType];
    if (Array.isArray(targets)) {
      const cleaned = [...new Set(targets.map((t) => String(t || "").trim()).filter(Boolean))].sort();
      if (cleaned.length > 0) {
        out[relType] = cleaned;
      }
    }
  }
  return out;
}

export function flattenRelationEdges(
  code: string,
  relations: OpsRelationsMap,
  actor: string,
  timestampValue: unknown
): OpsRelationEdge[] {
  const edges: OpsRelationEdge[] = [];
  for (const relType of OPS_RELATION_TYPES) {
    const targets = relations[relType] || [];
    for (const target of targets) {
      const edge_id = buildRelationEdgeId(code, relType, target);
      edges.push({
        edge_id,
        from: code,
        type: relType,
        to: target,
        actor,
        updated_at: timestampValue
      });
    }
  }
  return edges;
}

export function isMachineCheckableUnblock(condition: string): boolean {
  const trimmed = String(condition || "").trim();
  if (!trimmed) return false;
  return MACHINE_CHECKABLE_UNBLOCK_RE.test(trimmed);
}

/**
 * Validates §2 invariants for any candidate item write/transition before touching Firestore.
 */
export function validateOpsItemInvariants(
  candidate: OpsItemRecord,
  isNewItem: boolean
): void {
  if (!CODE_PATTERN.test(candidate.code)) {
    throw new HttpsError(
      "invalid-argument",
      `Invalid item code "${candidate.code}": must match ${CODE_PATTERN.source}.`
    );
  }
  if (!candidate.title || !candidate.title.trim()) {
    throw new HttpsError("invalid-argument", "Field 'title' is required and must be non-empty.");
  }
  if (!(OPS_MARKERS as readonly string[]).includes(candidate.marker)) {
    throw new HttpsError("invalid-argument", `Invalid marker "${candidate.marker}".`);
  }
  if (!(OPS_STAGES as readonly string[]).includes(candidate.stage)) {
    throw new HttpsError("invalid-argument", `Invalid stage "${candidate.stage}".`);
  }
  if (!(OPS_LANES as readonly string[]).includes(candidate.lane)) {
    throw new HttpsError("invalid-argument", `Invalid lane "${candidate.lane}".`);
  }

  // §2.0 Mandatory provenance on new intake
  if (isNewItem) {
    const discoveredFrom = candidate.provenance?.discovered_from?.trim();
    if (!discoveredFrom) {
      throw new HttpsError(
        "invalid-argument",
        "Refused intake: missing mandatory 'provenance.discovered_from' field."
      );
    }
  }

  // §2.1 Close requires evidence = { command, read_back }
  if (candidate.marker === "DONE" || candidate.stage === "closed") {
    const cmd = candidate.evidence?.command?.trim();
    const readBack = candidate.evidence?.read_back?.trim();
    if (!cmd) {
      throw new HttpsError(
        "failed-precondition",
        "Refused close: missing required field 'evidence.command'."
      );
    }
    if (!readBack) {
      throw new HttpsError(
        "failed-precondition",
        "Refused close: missing required field 'evidence.read_back'."
      );
    }
  }

  // §2.2 Blocked requires a machine-checkable unblock condition (cites MIPA-66 precedent)
  if (
    candidate.marker === "BLOCKED" ||
    candidate.stage === "blocked" ||
    candidate.modifiers?.blocked !== undefined
  ) {
    const unblockCandidate =
      candidate.modifiers?.blocked?.unblock_when ||
      candidate.fields?.["depends on"] ||
      candidate.fields?.["release"] ||
      "";
    if (!isMachineCheckableUnblock(unblockCandidate)) {
      throw new HttpsError(
        "failed-precondition",
        "Refused blocked state: requires a machine-checkable unblock condition " +
          "(modifiers.blocked.unblock_when, fields['depends on'], or fields['release']), " +
          "not prose-only (per MIPA-66 precedent in design §1)."
      );
    }
  }

  // §2.3 waiting_on_Ted requires question + non-empty options + recommendation
  if (candidate.need === true || candidate.modifiers?.waiting_on_Ted !== undefined) {
    const w = candidate.modifiers?.waiting_on_Ted;
    const question = (w?.question || candidate.ask || "").trim();
    const options = Array.isArray(w?.options)
      ? w.options.map((o) => String(o || "").trim()).filter(Boolean)
      : [];
    const recommendation = (w?.recommendation || "").trim();
    if (!question) {
      throw new HttpsError(
        "failed-precondition",
        "Refused waiting_on_Ted: missing required field 'waiting_on_Ted.question' (or 'ask')."
      );
    }
    if (options.length === 0) {
      throw new HttpsError(
        "failed-precondition",
        "Refused waiting_on_Ted: 'waiting_on_Ted.options' must contain at least one option."
      );
    }
    if (!recommendation) {
      throw new HttpsError(
        "failed-precondition",
        "Refused waiting_on_Ted: missing required field 'waiting_on_Ted.recommendation'."
      );
    }
  }
}

export function buildPublishedBoardCard(
  item: OpsItemRecord,
  timestampValue: unknown
): Record<string, unknown> {
  const cardPayload = {
    code: item.code,
    title: item.title,
    detail: item.detail,
    flag: item.flag,
    need: item.need,
    ask: item.ask || null,
    tags: item.tags,
    comments: item.comments
  };
  const sha = sha256Hex(JSON.stringify(cardPayload)).slice(0, 16);
  return {
    actor: item.actor,
    item: cardPayload,
    lane_id: item.lane,
    lane: LANE_LABELS[item.lane] || item.lane.toUpperCase(),
    order: item.order,
    sha,
    synced_at: timestampValue
  };
}

export function computeDigestSha(counts: OpsDigestCounts, itemFingerprintSeed = ""): string {
  const canonical = JSON.stringify({
    items: counts.items,
    transitions: counts.transitions,
    relations: counts.relations,
    board_cards: counts.board_cards,
    by_marker: Object.keys(counts.by_marker)
      .sort()
      .reduce<Record<string, number>>((acc, k) => {
        acc[k] = counts.by_marker[k];
        return acc;
      }, {}),
    by_stage: Object.keys(counts.by_stage)
      .sort()
      .reduce<Record<string, number>>((acc, k) => {
        acc[k] = counts.by_stage[k];
        return acc;
      }, {}),
    by_lane: Object.keys(counts.by_lane)
      .sort()
      .reduce<Record<string, number>>((acc, k) => {
        acc[k] = counts.by_lane[k];
        return acc;
      }, {}),
    seed: itemFingerprintSeed
  });
  return sha256Hex(canonical).slice(0, 32);
}

function adjustMapCounter(
  map: Record<string, number>,
  oldKey: string | undefined,
  newKey: string
): Record<string, number> {
  const next = { ...map };
  if (oldKey !== undefined && oldKey !== "") {
    next[oldKey] = Math.max(0, (next[oldKey] || 0) - 1);
    if (next[oldKey] === 0) {
      delete next[oldKey];
    }
  }
  next[newKey] = (next[newKey] || 0) + 1;
  return next;
}

function countRelationsInMap(relations?: OpsRelationsMap): number {
  if (!relations) return 0;
  let total = 0;
  for (const key of OPS_RELATION_TYPES) {
    total += (relations[key] || []).length;
  }
  return total;
}

/**
 * Enforces caller authentication and `opsOperator === true` custom claim.
 */
export function requireOpsOperator(request: CallableRequest): { uid: string; actor: string } {
  if (!request.auth) {
    logger.warn("[opsStoreManager] Unauthenticated call rejected.");
    throw new HttpsError("unauthenticated", "Authentication required for opsStoreManager.");
  }
  const token = (request.auth.token || {}) as Record<string, unknown>;
  if (token.opsOperator !== true) {
    logger.warn("[opsStoreManager] Non-operator caller rejected.", { uid: request.auth.uid });
    throw new HttpsError(
      "permission-denied",
      "Permission denied: caller lacks 'opsOperator' authorization for ops/ write gate."
    );
  }
  const actor =
    typeof token.email === "string" && token.email.trim()
      ? token.email.trim()
      : `uid:${request.auth.uid}`;
  return { uid: request.auth.uid, actor };
}

function requireIdempotencyKey(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim() || raw.trim().length > 200) {
    throw new HttpsError(
      "invalid-argument",
      "Field 'idempotencyKey' is required (1..200 chars) for mutating ops operations."
    );
  }
  return raw.trim();
}

/**
 * Reads all documents in a collection using bounded cursor pagination (`limit(500)`).
 */
async function readBoundedAllDocs(
  db: Firestore,
  collectionPath: string
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const out: Array<{ id: string; data: Record<string, unknown> }> = [];
  let cursorId: string | null = null;
  const col = db.collection(collectionPath);

  while (true) {
    const q: Query = cursorId
      ? col.orderBy("__name__").startAfter(cursorId).limit(PAGE_LIMIT)
      : col.orderBy("__name__").limit(PAGE_LIMIT);
    const snap: QuerySnapshot = await q.get();
    for (const docSnap of snap.docs) {
      out.push({ id: docSnap.id, data: (docSnap.data() || {}) as Record<string, unknown> });
    }
    if (snap.docs.length < PAGE_LIMIT) {
      break;
    }
    cursorId = String(snap.docs[snap.docs.length - 1].id);
  }
  return out;
}

/**
 * Polls the coarse-grained digest document using EXACTLY ONE Firestore document read.
 */
export async function pollOpsDigest(
  db: Firestore,
  sinceDigestSha?: string
): Promise<{
  exists: boolean;
  changed: boolean;
  digest: OpsDigestDocument | null;
  readsIssued: 1;
}> {
  const snap = await db.doc(OPS_DIGEST_DOC_PATH).get();
  if (!snap.exists) {
    return {
      exists: false,
      changed: Boolean(sinceDigestSha),
      digest: null,
      readsIssued: 1
    };
  }
  const digest = snap.data() as OpsDigestDocument;
  const changed = sinceDigestSha ? digest.digest_sha !== sinceDigestSha : true;
  return {
    exists: true,
    changed,
    digest,
    readsIssued: 1
  };
}

/**
 * Reads the published board view (`ops/views/meta/latest` + bounded `ops/board/cards`).
 */
export async function readPublishedBoardView(
  db: Firestore,
  options: { lane?: OpsLane; limit?: number } = {}
): Promise<{
  meta: Record<string, unknown> | null;
  cards: Array<Record<string, unknown>>;
}> {
  const cap = Math.min(Math.max(Number(options.limit) || 250, 1), PAGE_LIMIT);
  const metaSnap = await db.doc(OPS_BOARD_META_DOC_PATH).get();
  const cardsCol = db.collection(OPS_BOARD_CARDS_COLLECTION);
  const cardsQuery = options.lane
    ? cardsCol.where("lane_id", "==", options.lane).limit(cap)
    : cardsCol.limit(cap);
  const cardsSnap = await cardsQuery.get();
  const cards = cardsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
  return {
    meta: metaSnap.exists ? (metaSnap.data() as Record<string, unknown>) : null,
    cards
  };
}

/**
 * Executes a validated, atomic, idempotent mutating operation through the write gate.
 */
export async function executeOpsMutation(
  db: Firestore,
  payload: OpsPutPayload | OpsClosePayload | OpsTransitionPayload,
  actor: string
): Promise<{
  ok: true;
  deduplicated: boolean;
  code: string;
  transitionId: string;
  digest: OpsDigestDocument;
}> {
  const idempotencyKey = requireIdempotencyKey(payload.idempotencyKey);
  const code = String(payload.code || "").trim();
  if (!CODE_PATTERN.test(code)) {
    throw new HttpsError("invalid-argument", `Invalid item code "${code}".`);
  }

  const transitionId = buildIdempotentTransitionId(payload.op, code, idempotencyKey);
  const itemRef = db.doc(`${OPS_ITEMS_COLLECTION}/${code}`);
  const transitionRef = db.doc(`${OPS_TRANSITIONS_COLLECTION}/${transitionId}`);
  const boardCardRef = db.doc(`${OPS_BOARD_CARDS_COLLECTION}/${code}`);
  const digestRef = db.doc(OPS_DIGEST_DOC_PATH);

  return db.runTransaction(async (tx: Transaction) => {
    const [transitionSnap, itemSnap, boardCardSnap, digestSnap] = (await Promise.all([
      tx.get(transitionRef),
      tx.get(itemRef),
      tx.get(boardCardRef),
      tx.get(digestRef)
    ])) as [DocumentSnapshot, DocumentSnapshot, DocumentSnapshot, DocumentSnapshot];

    const existingDigest = digestSnap.exists
      ? (digestSnap.data() as OpsDigestDocument)
      : null;

    // Exact-once idempotency guarantee: if this transition already committed, do not mutate anything.
    if (transitionSnap.exists) {
      const updatedStatsDigest: OpsDigestDocument = existingDigest || {
        schema_version: 1,
        revision: 1,
        digest_sha: "",
        counts: {
          items: 0,
          transitions: 0,
          relations: 0,
          board_cards: 0,
          by_marker: {},
          by_stage: {},
          by_lane: {}
        },
        write_gate_stats: { accepted: 1, deduplicated: 1 },
        last_write: { op: payload.op, code, transition_id: transitionId, actor },
        updated_iso: new Date().toISOString(),
        updated_at: FieldValue.serverTimestamp()
      };
      return {
        ok: true,
        deduplicated: true,
        code,
        transitionId,
        digest: updatedStatsDigest
      };
    }

    const isNewItem = !itemSnap.exists;
    const prev = isNewItem ? null : (itemSnap.data() as OpsItemRecord);
    const nowIso = new Date().toISOString();
    const serverTs = FieldValue.serverTimestamp();

    let nextItem: OpsItemRecord;
    let transitionWhy: string;

    if (payload.op === "put") {
      if (isNewItem && (!payload.title || !payload.title.trim())) {
        throw new HttpsError("invalid-argument", "Field 'title' is required when creating a new item.");
      }
      // Preserve non-empty detail unless clearDetail is explicitly true or new detail is supplied
      const nextDetail =
        payload.detail !== undefined
          ? payload.detail
          : payload.clearDetail
            ? ""
            : prev?.detail || "";

      const nextMarker: OpsMarker = payload.marker || prev?.marker || "TODO";
      const nextStage: OpsStage = stageForMarker(nextMarker, payload.stage || prev?.stage);
      const nextLane: OpsLane =
        payload.lane || (nextMarker === "DONE" ? "closed" : prev?.lane || "eng");
      const nextRelations =
        payload.relations !== undefined
          ? normalizeRelations(payload.relations)
          : normalizeRelations(prev?.relations);
      const nextComments = [...(prev?.comments || [])];
      if (payload.comment?.note?.trim()) {
        nextComments.push({
          note: payload.comment.note.trim(),
          source: payload.comment.source || "opsStoreManager",
          ts: nowIso
        });
      }

      const mergedFields: Record<string, string> = {
        ...(prev?.fields || {}),
        ...(payload.fields || {})
      };

      const mergedProvenance: OpsProvenance = {
        ...(prev?.provenance || { discovered_from: "" }),
        ...(payload.provenance || {}),
        discovered_from:
          payload.provenance?.discovered_from?.trim() ||
          prev?.provenance?.discovered_from?.trim() ||
          ""
      };

      nextItem = {
        code,
        title: (payload.title !== undefined ? payload.title : prev?.title || "").trim(),
        stage: nextStage,
        marker: nextMarker,
        status: nextMarker,
        lane: nextLane,
        detail: nextDetail,
        section: payload.section ?? prev?.section ?? "Queue (Priority Order)",
        source: payload.source || prev?.source || "opsStoreManager",
        tags: payload.tags ?? prev?.tags ?? [],
        flag: payload.flag || prev?.flag || "mid",
        need: payload.need !== undefined ? payload.need : prev?.need ?? false,
        ask:
          payload.ask !== undefined
            ? payload.ask
            : prev?.ask ?? "",
        order: payload.order !== undefined ? payload.order : prev?.order ?? 0,
        fields: mergedFields,
        acceptance_criteria: payload.acceptance_criteria ?? prev?.acceptance_criteria ?? [],
        evidence: payload.evidence !== undefined ? payload.evidence : prev?.evidence ?? null,
        provenance: mergedProvenance,
        ...(payload.modifiers !== undefined
          ? { modifiers: payload.modifiers }
          : prev?.modifiers
            ? { modifiers: prev.modifiers }
            : {}),
        relations: nextRelations,
        comments: nextComments,
        violations: [],
        actor,
        updated_at: serverTs
      };
      transitionWhy = payload.why?.trim() || (isNewItem ? "created via opsStoreManager" : "updated via opsStoreManager");
    } else if (payload.op === "close") {
      if (isNewItem || !prev) {
        throw new HttpsError("not-found", `Cannot close non-existent item "${code}".`);
      }
      const nextComments = [...(prev.comments || [])];
      if (payload.comment?.note?.trim()) {
        nextComments.push({
          note: payload.comment.note.trim(),
          source: payload.comment.source || "opsStoreManager",
          ts: nowIso
        });
      }
      nextItem = {
        ...prev,
        code,
        marker: "DONE",
        stage: "closed",
        status: "DONE",
        lane: "closed",
        need: false,
        evidence: payload.evidence,
        comments: nextComments,
        actor,
        updated_at: serverTs
      };
      transitionWhy = payload.why?.trim() || "closed with verified evidence via opsStoreManager";
    } else {
      // payload.op === "transition"
      if (isNewItem || !prev) {
        throw new HttpsError("not-found", `Cannot transition non-existent item "${code}".`);
      }
      if (!payload.why || !payload.why.trim()) {
        throw new HttpsError("invalid-argument", "Field 'why' is required for transitions.");
      }
      const nextMarker = payload.toMarker;
      const nextStage = stageForMarker(nextMarker, payload.toStage);
      const nextLane: OpsLane =
        payload.toLane || (nextMarker === "DONE" ? "closed" : prev.lane);
      nextItem = {
        ...prev,
        code,
        marker: nextMarker,
        stage: nextStage,
        status: nextMarker,
        lane: nextLane,
        fields: { ...(prev.fields || {}), ...(payload.fields || {}) },
        ...(payload.evidence !== undefined ? { evidence: payload.evidence } : {}),
        ...(payload.modifiers !== undefined ? { modifiers: payload.modifiers } : {}),
        actor,
        updated_at: serverTs
      };
      transitionWhy = payload.why.trim();
    }

    validateOpsItemInvariants(nextItem, isNewItem);

    // Sync relation edges (add new, delete removed)
    const prevEdges = prev ? flattenRelationEdges(code, normalizeRelations(prev.relations), actor, serverTs) : [];
    const nextEdges = flattenRelationEdges(code, nextItem.relations, actor, serverTs);
    const nextEdgeIds = new Set(nextEdges.map((e) => e.edge_id));

    for (const oldEdge of prevEdges) {
      if (!nextEdgeIds.has(oldEdge.edge_id)) {
        const oldRef: DocumentReference = db.doc(`${OPS_RELATIONS_COLLECTION}/${oldEdge.edge_id}`);
        tx.delete(oldRef);
      }
    }
    for (const edge of nextEdges) {
      const edgeRef: DocumentReference = db.doc(`${OPS_RELATIONS_COLLECTION}/${edge.edge_id}`);
      tx.set(edgeRef, edge);
    }

    // Write item, append-only transition (strict create!), and published board card
    tx.set(itemRef, nextItem);
    tx.create(transitionRef, {
      code,
      from: prev ? prev.marker : null,
      to: nextItem.marker,
      actor,
      why: transitionWhy,
      op: payload.op,
      idempotency_key: idempotencyKey,
      at: serverTs
    });
    tx.set(boardCardRef, buildPublishedBoardCard(nextItem, serverTs));

    // Update coarse-grained digest atomically
    const prevCounts: OpsDigestCounts = existingDigest?.counts || {
      items: 0,
      transitions: 0,
      relations: 0,
      board_cards: 0,
      by_marker: {},
      by_stage: {},
      by_lane: {}
    };
    const relationDelta =
      countRelationsInMap(nextItem.relations) - countRelationsInMap(prev?.relations);
    const nextCounts: OpsDigestCounts = {
      items: prevCounts.items + (isNewItem ? 1 : 0),
      transitions: prevCounts.transitions + 1,
      relations: Math.max(0, prevCounts.relations + relationDelta),
      board_cards: prevCounts.board_cards + (boardCardSnap.exists ? 0 : 1),
      by_marker: adjustMapCounter(prevCounts.by_marker, prev?.marker, nextItem.marker),
      by_stage: adjustMapCounter(prevCounts.by_stage, prev?.stage, nextItem.stage),
      by_lane: adjustMapCounter(prevCounts.by_lane, prev?.lane, nextItem.lane)
    };
    const nextRevision = (existingDigest?.revision || 0) + 1;
    const nextDigestSha = computeDigestSha(nextCounts, `${nextRevision}:${code}:${nextItem.marker}:${transitionId}`);
    const nextDigest: OpsDigestDocument = {
      schema_version: 1,
      revision: nextRevision,
      digest_sha: nextDigestSha,
      counts: nextCounts,
      write_gate_stats: {
        accepted: (existingDigest?.write_gate_stats?.accepted || 0) + 1,
        deduplicated: existingDigest?.write_gate_stats?.deduplicated || 0
      },
      last_write: {
        op: payload.op,
        code,
        transition_id: transitionId,
        actor
      },
      updated_iso: nowIso,
      updated_at: serverTs
    };
    tx.set(digestRef, nextDigest);

    return {
      ok: true,
      deduplicated: false,
      code,
      transitionId,
      digest: nextDigest
    };
  });
}

/**
 * Core callable handler (accepts an optional Firestore instance for unit/emulator testing).
 */
export async function handleOpsCallable(
  request: CallableRequest,
  dbOverride?: Firestore
): Promise<unknown> {
  const { actor } = requireOpsOperator(request);
  const data = (request.data || {}) as Partial<OpsManagerRequestPayload>;
  const db = dbOverride || getFirestore();

  switch (data.op) {
    case "put":
    case "close":
    case "transition":
      return executeOpsMutation(db, data as OpsPutPayload | OpsClosePayload | OpsTransitionPayload, actor);
    case "poll_digest":
      return pollOpsDigest(db, data.sinceDigestSha);
    case "read_board_view":
      return readPublishedBoardView(db, { lane: data.lane, limit: data.limit });
    default:
      throw new HttpsError(
        "invalid-argument",
        `Unsupported opsStoreManager operation "${String((data as Record<string, unknown>).op || "")}".`
      );
  }
}

/**
 * The single Cloud Function write gate for `ops/` in `mipa-2`.
 */
export const opsStoreManager = onCall(async (request: CallableRequest) => {
  return handleOpsCallable(request);
});

/**
 * Reads back exact collection counts and digest metadata from Firestore.
 */
export async function readBackOpsCounts(db: Firestore): Promise<{
  items: number;
  transitions: number;
  relations: number;
  board_cards: number;
  digest_exists: boolean;
  digest_sha: string | null;
  digest_revision: number | null;
  board_meta_card_count: number | null;
  board_meta_counts: string[];
}> {
  const [itemsCount, transitionsCount, relationsCount, cardsCount, digestSnap, boardMetaSnap] =
    await Promise.all([
      db.collection(OPS_ITEMS_COLLECTION).count().get(),
      db.collection(OPS_TRANSITIONS_COLLECTION).count().get(),
      db.collection(OPS_RELATIONS_COLLECTION).count().get(),
      db.collection(OPS_BOARD_CARDS_COLLECTION).count().get(),
      db.doc(OPS_DIGEST_DOC_PATH).get(),
      db.doc(OPS_BOARD_META_DOC_PATH).get()
    ]);

  const digestData = digestSnap.exists ? (digestSnap.data() as OpsDigestDocument) : null;
  const boardMeta = boardMetaSnap.exists
    ? (boardMetaSnap.data() as Record<string, unknown>)
    : null;

  return {
    items: itemsCount.data().count,
    transitions: transitionsCount.data().count,
    relations: relationsCount.data().count,
    board_cards: cardsCount.data().count,
    digest_exists: digestSnap.exists,
    digest_sha: digestData?.digest_sha ?? null,
    digest_revision: digestData?.revision ?? null,
    board_meta_card_count:
      typeof boardMeta?.card_count === "number" ? boardMeta.card_count : null,
    board_meta_counts: Array.isArray(boardMeta?.counts)
      ? (boardMeta.counts as string[])
      : []
  };
}

export interface MigrateItemSeed {
  code: string;
  title: string;
  marker?: OpsMarker;
  stage?: OpsStage;
  lane?: OpsLane;
  detail?: string;
  source?: string;
  tags?: string[];
  flag?: string;
  need?: boolean;
  ask?: string;
  order?: number;
  fields?: Record<string, string>;
  acceptance_criteria?: string[];
  evidence?: OpsEvidence | null;
  provenance?: Partial<OpsProvenance>;
  relations?: OpsRelationsMap;
  comments?: OpsComment[];
}

/**
 * Idempotently migrates seed items (e.g. legacy backlog + inbox items) into `ops/`
 * and synchronizes relation edges, published board cards, board meta, and the digest.
 * Running it twice with the same input performs 0 mutations and leaves all counts unchanged.
 */
export async function migrateOpsItems(
  db: Firestore,
  options: {
    items: MigrateItemSeed[];
    actor?: string;
  }
): Promise<{
  itemsCreated: number;
  transitionsCreated: number;
  relationsCreated: number;
  boardCardsCreated: number;
  digestUpdated: boolean;
  counts: OpsDigestCounts;
  digestSha: string;
}> {
  const actor = options.actor || "system:ops-migration";
  let itemsCreated = 0;
  let transitionsCreated = 0;
  let relationsCreated = 0;
  let boardCardsCreated = 0;

  for (const seed of options.items) {
    const code = String(seed.code || "").trim();
    if (!CODE_PATTERN.test(code)) {
      throw new Error(`Invalid migration item code "${code}".`);
    }
    const marker: OpsMarker = seed.marker || "TODO";
    const stage: OpsStage = stageForMarker(marker, seed.stage);
    const lane: OpsLane = seed.lane || (marker === "DONE" ? "closed" : "eng");
    const relations = normalizeRelations(seed.relations);
    const source = seed.source || "migration";

    const itemRef = db.doc(`${OPS_ITEMS_COLLECTION}/${code}`);
    const migTransitionId = `mig_${sanitizeDocKey(code)}`;
    const transRef = db.doc(`${OPS_TRANSITIONS_COLLECTION}/${migTransitionId}`);
    const cardRef = db.doc(`${OPS_BOARD_CARDS_COLLECTION}/${code}`);

    const [itemSnap, transSnap, cardSnap] = await Promise.all([
      itemRef.get(),
      transRef.get(),
      cardRef.get()
    ]);

    const serverTs = FieldValue.serverTimestamp();
    const itemRecord: OpsItemRecord = itemSnap.exists
      ? (itemSnap.data() as OpsItemRecord)
      : {
          code,
          title: seed.title.trim(),
          stage,
          marker,
          status: marker,
          lane,
          detail: seed.detail || "",
          section: "Queue (Priority Order)",
          source,
          tags: seed.tags || [],
          flag: seed.flag || "mid",
          need: Boolean(seed.need),
          ask: seed.ask || "",
          order: seed.order ?? 0,
          fields: seed.fields || {},
          acceptance_criteria: seed.acceptance_criteria || [],
          evidence: seed.evidence ?? null,
          provenance: {
            discovered_from: seed.provenance?.discovered_from || `${source}:${code}`,
            ...(seed.provenance || {})
          },
          relations,
          comments: seed.comments || [],
          violations: [],
          actor,
          updated_at: serverTs
        };

    if (!itemSnap.exists) {
      await itemRef.set(itemRecord);
      itemsCreated++;
    }

    if (!transSnap.exists) {
      await transRef.create({
        code,
        from: null,
        to: itemRecord.marker,
        actor,
        why: "initial idempotent migration",
        op: "migrate",
        idempotency_key: migTransitionId,
        at: serverTs
      });
      transitionsCreated++;
    }

    if (!cardSnap.exists) {
      await cardRef.set(buildPublishedBoardCard(itemRecord, serverTs));
      boardCardsCreated++;
    }

    const edges = flattenRelationEdges(code, normalizeRelations(itemRecord.relations), actor, serverTs);
    for (const edge of edges) {
      const edgeRef = db.doc(`${OPS_RELATIONS_COLLECTION}/${edge.edge_id}`);
      const edgeSnap = await edgeRef.get();
      if (!edgeSnap.exists) {
        await edgeRef.set(edge);
        relationsCreated++;
      }
    }
  }

  const provisioned = await provisionOpsStore(db, {
    actor,
    dryRun: false,
    ensureBoardMeta: true
  });

  return {
    itemsCreated,
    transitionsCreated,
    relationsCreated,
    boardCardsCreated,
    digestUpdated: provisioned.digestUpdated,
    counts: provisioned.counts,
    digestSha: provisioned.digestSha
  };
}

/**
 * Non-destructively provisions and reconciles `ops/relations/edges` and
 * `ops/views/meta/digest` against the live `ops/` tree in Firestore.
 * Idempotent: running twice with no intervening store changes writes 0 documents.
 */
export async function provisionOpsStore(
  db: Firestore,
  options: {
    actor?: string;
    dryRun?: boolean;
    ensureBoardMeta?: boolean;
  } = {}
): Promise<{
  dryRun: boolean;
  relationsSynced: number;
  digestUpdated: boolean;
  boardMetaCreated: boolean;
  counts: OpsDigestCounts;
  digestSha: string;
  revision: number;
}> {
  const actor = options.actor || "system:ops-provisioner";
  const dryRun = Boolean(options.dryRun);

  const [itemDocs, existingEdgeDocs, transitionsCountSnap, cardsCountSnap, digestSnap, boardMetaSnap] =
    await Promise.all([
      readBoundedAllDocs(db, OPS_ITEMS_COLLECTION),
      readBoundedAllDocs(db, OPS_RELATIONS_COLLECTION),
      db.collection(OPS_TRANSITIONS_COLLECTION).count().get(),
      db.collection(OPS_BOARD_CARDS_COLLECTION).count().get(),
      db.doc(OPS_DIGEST_DOC_PATH).get(),
      db.doc(OPS_BOARD_META_DOC_PATH).get()
    ]);

  const by_marker: Record<string, number> = {};
  const by_stage: Record<string, number> = {};
  const by_lane: Record<string, number> = {};
  const desiredEdges = new Map<string, OpsRelationEdge>();
  const fingerprintParts: string[] = [];

  for (const { id, data } of itemDocs) {
    const marker = String(data.marker || "TODO");
    const stage = String(data.stage || stageForMarker(marker as OpsMarker));
    const lane = String(data.lane || "eng");
    by_marker[marker] = (by_marker[marker] || 0) + 1;
    by_stage[stage] = (by_stage[stage] || 0) + 1;
    by_lane[lane] = (by_lane[lane] || 0) + 1;
    fingerprintParts.push(`${id}:${marker}:${stage}:${lane}`);

    const rels = normalizeRelations(data.relations as OpsRelationsMap | undefined);
    for (const edge of flattenRelationEdges(id, rels, actor, FieldValue.serverTimestamp())) {
      desiredEdges.set(edge.edge_id, edge);
    }
  }
  fingerprintParts.sort();

  const existingEdgeIds = new Set(existingEdgeDocs.map((e) => e.id));
  let relationsSynced = 0;
  for (const [edgeId, edge] of desiredEdges.entries()) {
    if (!existingEdgeIds.has(edgeId)) {
      if (!dryRun) {
        await db.doc(`${OPS_RELATIONS_COLLECTION}/${edgeId}`).set(edge);
      }
      relationsSynced++;
    }
  }

  const totalRelations = existingEdgeIds.size + relationsSynced;
  const counts: OpsDigestCounts = {
    items: itemDocs.length,
    transitions: transitionsCountSnap.data().count,
    relations: totalRelations,
    board_cards: cardsCountSnap.data().count,
    by_marker,
    by_stage,
    by_lane
  };

  const digestSha = computeDigestSha(counts, sha256Hex(fingerprintParts.join("|")).slice(0, 24));
  const existingDigest = digestSnap.exists ? (digestSnap.data() as OpsDigestDocument) : null;
  const needsDigestWrite = !existingDigest || existingDigest.digest_sha !== digestSha;
  const revision = needsDigestWrite
    ? (existingDigest?.revision || 0) + 1
    : existingDigest.revision;

  let digestUpdated = false;
  if (needsDigestWrite && !dryRun) {
    const digestDoc: OpsDigestDocument = {
      schema_version: 1,
      revision,
      digest_sha: digestSha,
      counts,
      write_gate_stats: {
        accepted: existingDigest?.write_gate_stats?.accepted || 1,
        deduplicated: existingDigest?.write_gate_stats?.deduplicated || 0
      },
      last_write: {
        op: "provision",
        code: null,
        transition_id: null,
        actor
      },
      updated_iso: new Date().toISOString(),
      updated_at: FieldValue.serverTimestamp()
    };
    await db.doc(OPS_DIGEST_DOC_PATH).set(digestDoc);
    digestUpdated = true;
  } else if (needsDigestWrite && dryRun) {
    digestUpdated = true;
  }

  let boardMetaCreated = false;
  if (options.ensureBoardMeta && !boardMetaSnap.exists) {
    boardMetaCreated = true;
    if (!dryRun) {
      const laneCounts = OPS_LANES.map(
        (laneId) => `${LANE_LABELS[laneId]}:${by_lane[laneId] || 0}`
      );
      await db.doc(OPS_BOARD_META_DOC_PATH).set({
        actor,
        card_count: counts.board_cards,
        counts: laneCounts,
        payload_sha: digestSha.slice(0, 16),
        tabs: OPS_LANES.map((laneId) => ({
          id: laneId,
          label: LANE_LABELS[laneId],
          n: by_lane[laneId] || 0,
          ...(laneId === "closed" ? { closed: true } : {})
        })),
        synced_at: FieldValue.serverTimestamp()
      });
    }
  }

  return {
    dryRun,
    relationsSynced,
    digestUpdated,
    boardMetaCreated,
    counts,
    digestSha,
    revision
  };
}

function isRetryableOfflineOrTransportError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof OpsWriteOfflineError) return true;
  const rec = err as { code?: unknown; message?: unknown; name?: unknown };
  const code = String(rec.code || "").toLowerCase();
  const msg = String(rec.message || "").toLowerCase();
  if (
    code.includes("unavailable") ||
    code.includes("deadline-exceeded") ||
    code.includes("aborted") ||
    code.includes("network-request-failed")
  ) {
    return true;
  }
  return (
    msg.includes("offline") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("etimedout") ||
    msg.includes("enotfound") ||
    msg.includes("fetch failed") ||
    msg.includes("network disconnected")
  );
}

/**
 * Invokes the ops write gate using Firestore/SDK retry semantics without any
 * bespoke local queue:
 * - When `retryOnOffline` is `false` and the caller is offline, fails immediately
 *   with a NAMED `OpsWriteOfflineError` (`code = "functions/unavailable"`).
 * - When `retryOnOffline` is `true` (default), retries transient offline/disconnect
 *   errors with the SAME `idempotencyKey`, landing EXACTLY ONCE upon reconnect.
 */
export async function invokeOpsWriteWithRetry<TResult>(
  transport: (payload: OpsPutPayload | OpsClosePayload | OpsTransitionPayload) => Promise<TResult>,
  payload: OpsPutPayload | OpsClosePayload | OpsTransitionPayload,
  options: {
    retryOnOffline?: boolean;
    maxAttempts?: number;
    initialBackoffMs?: number;
  } = {}
): Promise<TResult & { attempts: number }> {
  requireIdempotencyKey(payload.idempotencyKey);
  const retryOnOffline = options.retryOnOffline ?? true;
  const maxAttempts = retryOnOffline ? Math.max(1, options.maxAttempts ?? 4) : 1;
  const baseBackoff = Math.max(1, options.initialBackoffMs ?? 25);

  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt++;
    try {
      const res = await transport(payload);
      return { ...(res as object), attempts: attempt } as TResult & { attempts: number };
    } catch (err: unknown) {
      if (!isRetryableOfflineOrTransportError(err)) {
        throw err;
      }
      if (!retryOnOffline || attempt >= maxAttempts) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new OpsWriteOfflineError(
          `Ops write failed while offline after ${attempt} attempt(s): ${reason}`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, baseBackoff * Math.pow(2, attempt - 1)));
    }
  }

  throw new OpsWriteOfflineError("Ops write failed while offline.");
}
