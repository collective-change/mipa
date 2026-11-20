// Provenance of an automated review (MIPA-43, decision M-3).
//
// M-3: the review is fully automated and no human reviews anything, so the
// only honest claim mipa can make is a mechanical one -
// "checked against mipa methodology vX by model Y on date Z". That sentence
// is true only if the record itself stores X, Y and Z, and stores them at the
// moment of the review: a model provider can move a name to new weights
// without asking, and mipa's methodology will change too. This module is the
// storage contract behind the sentence:
//
//   - every review record carries provider, exact model identifier,
//     methodology version and timestamp (buildProvenance);
//   - a floating model alias ("...-latest") is refused, and an identifier
//     whose pin cannot be confirmed is stored with a flag (assessModelPin);
//   - records are write-once and keyed by input + version, so a later run of
//     the same input under the same stored version returns the same
//     conclusion, and a model upgrade creates a new record instead of
//     rewriting an old one (runReview, reviewStore);
//   - version drift is computed against the stored fields, never by editing
//     them (versionDrift).
//
// The reviewer itself (what the model is asked, the rubric) is MIPA-50. It
// plugs in as a `Reviewer`, so it cannot store a review without provenance.

import { createHash } from "node:crypto";
import type { ProviderId } from "../ai/providers";

// The version of the published mipa methodology an automated review checks
// against. Bump it whenever the rubric, its weights or the review prompt
// change: a review run under a new methodology is a different claim.
export const METHODOLOGY_VERSION = "1.0.0";

// Shape version of the stored provenance block itself.
export const PROVENANCE_SCHEMA_VERSION = 1;

const PROVIDERS: readonly ProviderId[] = ["anthropic", "openai-compatible"];

export class ProvenanceError extends Error {
  constructor(
    message: string,
    readonly reason:
      | "floating-model"
      | "missing-field"
      | "invalid-field"
      | "already-recorded"
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Is the model identifier pinned to fixed weights?

export type PinStatus = "pinned" | "unverified" | "floating";

export interface PinAssessment {
  status: PinStatus;
  reason: string;
}

// Words that name a moving target rather than a fixed snapshot.
const FLOATING_TOKENS = new Set(["latest", "current", "default", "auto", "stable", "newest"]);

// A dated snapshot: 20241022, 2024-08-06, or a Vertex-style @20240620 / @001.
const DATE_COMPACT = /(^|[^0-9])20\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])($|[^0-9])/;
const DATE_DASHED = /(^|[^0-9])20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])($|[^0-9])/;
const REVISION_SUFFIX = /(@|-)\d{3}$/;

export function assessModelPin(model: string): PinAssessment {
  const id = (model || "").trim();
  if (!id) return { status: "floating", reason: "no model identifier" };
  const tokens = id.toLowerCase().split(/[-_.:/@\s]+/);
  const floating = tokens.find((t) => FLOATING_TOKENS.has(t));
  if (floating) {
    return { status: "floating", reason: `"${floating}" names a moving alias, not fixed weights` };
  }
  if (DATE_COMPACT.test(id) || DATE_DASHED.test(id)) {
    return { status: "pinned", reason: "dated snapshot identifier" };
  }
  if (REVISION_SUFFIX.test(id)) {
    return { status: "pinned", reason: "numbered revision identifier" };
  }
  return {
    status: "unverified",
    reason: "the identifier carries no snapshot date or revision, so mipa cannot confirm the provider never moves it",
  };
}

// ---------------------------------------------------------------------------
// The provenance block stored on every review record.

export interface ReviewProvenance {
  readonly schemaVersion: number;
  readonly provider: ProviderId;
  // The exact identifier of the model that produced the review: the one the
  // provider reported serving, when it reported one, else the one requested.
  readonly model: string;
  readonly requestedModel: string;
  readonly pinStatus: Exclude<PinStatus, "floating">;
  readonly methodologyVersion: string;
  readonly reviewedAt: string; // ISO 8601, UTC
}

export interface ProvenanceInput {
  provider: string;
  requestedModel: string;
  resolvedModel?: string | null;
  methodologyVersion: string;
  reviewedAt: Date;
}

const SEMVER = /^\d+\.\d+\.\d+$/;

export function buildProvenance(input: ProvenanceInput): ReviewProvenance {
  const provider = input.provider as ProviderId;
  if (!input.provider) throw new ProvenanceError("A review must name its provider.", "missing-field");
  if (!PROVIDERS.includes(provider)) {
    throw new ProvenanceError(`Unknown provider "${input.provider}".`, "invalid-field");
  }
  const requestedModel = (input.requestedModel || "").trim();
  if (!requestedModel) throw new ProvenanceError("A review must name its model.", "missing-field");
  const model = (input.resolvedModel || "").trim() || requestedModel;

  // Both names are checked: requesting "-latest" is refused even when the
  // provider reports a dated snapshot, because the next run would not ask for
  // the same weights.
  for (const id of [requestedModel, model]) {
    const pin = assessModelPin(id);
    if (pin.status === "floating") {
      throw new ProvenanceError(`Model "${id}" cannot support a reproducible review: ${pin.reason}.`, "floating-model");
    }
  }

  const methodologyVersion = (input.methodologyVersion || "").trim();
  if (!methodologyVersion) {
    throw new ProvenanceError("A review must name its methodology version.", "missing-field");
  }
  if (!SEMVER.test(methodologyVersion)) {
    throw new ProvenanceError(`Methodology version "${methodologyVersion}" is not MAJOR.MINOR.PATCH.`, "invalid-field");
  }
  if (!(input.reviewedAt instanceof Date) || Number.isNaN(input.reviewedAt.getTime())) {
    throw new ProvenanceError("A review must carry a valid timestamp.", "invalid-field");
  }

  return Object.freeze({
    schemaVersion: PROVENANCE_SCHEMA_VERSION,
    provider,
    model,
    requestedModel,
    pinStatus: assessModelPin(model).status as "pinned" | "unverified",
    methodologyVersion,
    reviewedAt: input.reviewedAt.toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Hashing: the same input always hashes the same, whatever its key order.

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) return "null";
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function inputHash(input: unknown): string {
  return sha256(canonicalJson(input));
}

// Identifies "this input under this version". Two reviews with the same key
// must reach the same conclusion; the key is also the record's document id.
export function reproducibilityKey(
  hash: string,
  version: { provider: string; model: string; methodologyVersion: string }
): string {
  return sha256([hash, version.provider, version.model, version.methodologyVersion].join("\n"));
}

// ---------------------------------------------------------------------------
// Version drift: what has changed since a stored review. The stored record is
// never touched; drift is computed against it and reported next to it.

export interface CurrentReviewConfig {
  provider: string;
  model: string;
  methodologyVersion: string;
}

export interface DriftEntry {
  field: "provider" | "model" | "methodologyVersion";
  stored: string;
  current: string;
}

export function versionDrift(stored: ReviewProvenance, current: CurrentReviewConfig): DriftEntry[] {
  const fields: DriftEntry["field"][] = ["provider", "model", "methodologyVersion"];
  return fields
    .filter((f) => stored[f] !== current[f])
    .map((f) => ({ field: f, stored: stored[f], current: current[f] }));
}

// ---------------------------------------------------------------------------
// Running and storing a review.

export interface ReviewRecord<C = unknown> {
  readonly provenance: ReviewProvenance;
  readonly inputHash: string;
  readonly reproducibilityKey: string;
  readonly conclusion: C;
  readonly conclusionHash: string;
}

// The model call. MIPA-50 supplies the real one; it must use the settings it
// is given (temperature 0) and report the model the provider actually served.
export interface ReviewerCallSettings {
  provider: ProviderId;
  model: string;
  methodologyVersion: string;
  temperature: 0;
}

export type Reviewer<I, C> = (
  input: I,
  settings: ReviewerCallSettings
) => Promise<{ conclusion: C; resolvedModel?: string | null }>;

export interface ReviewStore<C = unknown> {
  find(key: string): Promise<ReviewRecord<C> | null>;
  // Write-once: rejects with ProvenanceError("already-recorded") if a record
  // with this key exists. A stored review is never overwritten.
  create(record: ReviewRecord<C>): Promise<void>;
}

export interface RunReviewArgs<I> {
  input: I;
  provider: string;
  model: string;
  methodologyVersion?: string;
}

export interface RunReviewResult<C> {
  record: ReviewRecord<C>;
  // True when the conclusion came from the stored record for this input and
  // version rather than from a new model call.
  replayed: boolean;
}

export async function runReview<I, C>(
  deps: { reviewer: Reviewer<I, C>; store: ReviewStore<C>; now?: () => Date },
  args: RunReviewArgs<I>
): Promise<RunReviewResult<C>> {
  const methodologyVersion = args.methodologyVersion ?? METHODOLOGY_VERSION;
  // Validate everything before any model call is paid for.
  const preflight = buildProvenance({
    provider: args.provider,
    requestedModel: args.model,
    methodologyVersion,
    reviewedAt: new Date(0),
  });
  const hash = inputHash(args.input);
  const requestedKey = reproducibilityKey(hash, preflight);

  const existing = await deps.store.find(requestedKey);
  if (existing) return { record: existing, replayed: true };

  const { conclusion, resolvedModel } = await deps.reviewer(args.input, {
    provider: preflight.provider,
    model: preflight.requestedModel,
    methodologyVersion,
    temperature: 0,
  });

  const provenance = buildProvenance({
    provider: preflight.provider,
    requestedModel: preflight.requestedModel,
    resolvedModel,
    methodologyVersion,
    reviewedAt: (deps.now ?? (() => new Date()))(),
  });

  // When the provider served a different identifier than was asked for, the
  // record is keyed by what was asked (so a rerun finds it) and stores both.
  const record: ReviewRecord<C> = Object.freeze({
    provenance,
    inputHash: hash,
    reproducibilityKey: requestedKey,
    conclusion,
    conclusionHash: sha256(canonicalJson(conclusion)),
  });
  await deps.store.create(record);
  return { record, replayed: false };
}

// Re-runs a stored review under its own stored version and compares. Used for
// random-sample re-review (MIPA-50); it never rewrites the stored record.
export async function verifyReproduction<I, C>(
  record: ReviewRecord<C>,
  input: I,
  reviewer: Reviewer<I, C>
): Promise<{ reproduced: boolean; inputMatches: boolean; conclusionHash: string | null }> {
  if (inputHash(input) !== record.inputHash) {
    return { reproduced: false, inputMatches: false, conclusionHash: null };
  }
  const { conclusion } = await reviewer(input, {
    provider: record.provenance.provider,
    model: record.provenance.requestedModel,
    methodologyVersion: record.provenance.methodologyVersion,
    temperature: 0,
  });
  const conclusionHash = sha256(canonicalJson(conclusion));
  return { reproduced: conclusionHash === record.conclusionHash, inputMatches: true, conclusionHash };
}

// ---------------------------------------------------------------------------
// Stores.

export function memoryReviewStore<C>(): ReviewStore<C> & { records: Map<string, ReviewRecord<C>> } {
  const records = new Map<string, ReviewRecord<C>>();
  return {
    records,
    async find(key) {
      return records.get(key) ?? null;
    },
    async create(record) {
      if (records.has(record.reproducibilityKey)) {
        throw new ProvenanceError("This review is already recorded.", "already-recorded");
      }
      records.set(record.reproducibilityKey, record);
    },
  };
}

// Minimal slice of the Admin SDK Firestore used here, so tests can fake it.
export interface ReviewDocDb {
  doc(path: string): {
    get(): Promise<{ exists: boolean; data(): unknown }>;
    create(data: unknown): Promise<unknown>;
  };
}

// Reviews live at orgs/{orgId}/reviews/{reproducibilityKey}. Browsers may
// read them (members only) and never write them; see firestore.rules.
export function firestoreReviewStore<C>(db: ReviewDocDb, orgId: string): ReviewStore<C> {
  if (!orgId || orgId.includes("/")) throw new ProvenanceError("Invalid organization id.", "invalid-field");
  const path = (key: string) => `orgs/${orgId}/reviews/${key}`;
  return {
    async find(key) {
      const snap = await db.doc(path(key)).get();
      return snap.exists ? (snap.data() as ReviewRecord<C>) : null;
    },
    async create(record) {
      try {
        // create() fails if the document exists: the write-once guarantee is
        // enforced by Firestore, not by a read-then-write race.
        await db.doc(path(record.reproducibilityKey)).create({ ...record, provenance: { ...record.provenance } });
      } catch (err) {
        const code = (err as { code?: unknown }).code;
        if (code === 6 || code === "already-exists") {
          throw new ProvenanceError("This review is already recorded.", "already-recorded");
        }
        throw err;
      }
    },
  };
}
