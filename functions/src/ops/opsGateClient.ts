import * as crypto from "node:crypto";
import type { OpsDigestPollResult, OpsMutationOp, OpsMutationResponse } from "./opsWriteGate";

export class OpsGateOfflineError extends Error {
  readonly code = "OPS_GATE_OFFLINE" as const;
  readonly idempotencyKey?: string;
  readonly endpoint: string;
  override readonly cause?: unknown;

  constructor(message: string, options: { endpoint: string; idempotencyKey?: string; cause?: unknown }) {
    super(message);
    this.name = "OpsGateOfflineError";
    this.endpoint = options.endpoint;
    this.idempotencyKey = options.idempotencyKey;
    this.cause = options.cause;
  }
}

export class OpsGateHttpError extends Error {
  readonly code: string;
  readonly status: number;
  readonly body?: unknown;

  constructor(code: string, status: number, message: string, body?: unknown) {
    super(message);
    this.name = "OpsGateHttpError";
    this.code = code;
    this.status = status;
    this.body = body;
  }
}

export interface OpsGateAuthOptions {
  gateToken?: string;
  bearerToken?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface OpsGateWriteOptions extends OpsGateAuthOptions {
  endpoint: string;
  op: OpsMutationOp;
  idempotencyKey?: string;
  payload?: Record<string, unknown>;
}

export interface OpsGateRetryOptions extends OpsGateWriteOptions {
  maxAttempts?: number;
  backoffMs?: number;
}

function buildHeaders(options: OpsGateAuthOptions, includeJsonContentType: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeJsonContentType) {
    headers["Content-Type"] = "application/json";
  }
  if (options.gateToken) {
    headers["X-Ops-Gate-Token"] = options.gateToken;
  }
  if (options.bearerToken) {
    headers["Authorization"] = `Bearer ${options.bearerToken}`;
  }
  return headers;
}

function isOfflineNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return true;
  if (err.name === "AbortError" || err.name === "TimeoutError" || err.name === "TypeError") {
    return true;
  }
  const code = (err as Error & { code?: string; cause?: { code?: string } }).code
    || (err as Error & { cause?: { code?: string } }).cause?.code;
  if (
    code &&
    [
      "ECONNREFUSED",
      "ECONNRESET",
      "ETIMEDOUT",
      "EHOSTUNREACH",
      "ENETUNREACH",
      "ENOTFOUND",
      "EPIPE",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_SOCKET",
      "UND_ERR_HEADERS_TIMEOUT",
      "UND_ERR_BODY_TIMEOUT"
    ].includes(code)
  ) {
    return true;
  }
  return /fetch failed|network|socket|econn|closed|terminated/i.test(err.message);
}

/**
 * Sends a single mutation through the `opsWriteGate` Cloud Function.
 * Zero local queue: when offline or disconnected before receiving an HTTP response,
 * fails explicitly with `OpsGateOfflineError` carrying the `idempotencyKey` for safe retry.
 */
export async function writeViaOpsGate(options: OpsGateWriteOptions): Promise<OpsMutationResponse> {
  const fetchFn = options.fetchImpl || fetch;
  const idempotencyKey = options.idempotencyKey || crypto.randomUUID();
  const timeoutMs = options.timeoutMs ?? 15_000;

  const body = {
    ...(options.payload || {}),
    op: options.op,
    idempotencyKey
  };

  let res: Response;
  let text: string;

  try {
    res = await fetchFn(options.endpoint, {
      method: "POST",
      headers: buildHeaders(options, true),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });
    text = await res.text();
  } catch (err: unknown) {
    if (isOfflineNetworkError(err)) {
      throw new OpsGateOfflineError(
        `Unable to reach opsWriteGate at ${options.endpoint}: ${err instanceof Error ? err.message : String(err)}`,
        { endpoint: options.endpoint, idempotencyKey, cause: err }
      );
    }
    throw err;
  }

  let parsedBody: unknown;
  if (text) {
    try {
      parsedBody = JSON.parse(text) as unknown;
    } catch {
      parsedBody = text;
    }
  }

  if (!res.ok) {
    const errObj =
      parsedBody && typeof parsedBody === "object" && "error" in parsedBody
        ? ((parsedBody as { error?: { code?: string; message?: string } }).error ?? {})
        : {};
    throw new OpsGateHttpError(
      errObj.code || `HTTP_${res.status}`,
      res.status,
      errObj.message || `opsWriteGate returned HTTP ${res.status}`,
      parsedBody
    );
  }

  return parsedBody as OpsMutationResponse;
}

/**
 * Retries transient offline / 502-504 failures reusing the exact same `idempotencyKey`
 * so Firestore transaction idempotency ensures at-most-once logical mutation.
 * Does not retry 4xx validation or auth errors, and maintains no local disk queue.
 */
export async function writeViaOpsGateWithRetry(
  options: OpsGateRetryOptions
): Promise<OpsMutationResponse> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const backoffMs = Math.max(0, options.backoffMs ?? 50);
  const idempotencyKey = options.idempotencyKey || crypto.randomUUID();

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await writeViaOpsGate({ ...options, idempotencyKey });
    } catch (err: unknown) {
      lastError = err;
      const isTransientHttp =
        err instanceof OpsGateHttpError && [502, 503, 504].includes(err.status);
      const isRetryable = err instanceof OpsGateOfflineError || isTransientHttp;
      if (!isRetryable || attempt === maxAttempts) {
        throw err;
      }
      if (backoffMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs * attempt));
      }
    }
  }

  throw lastError;
}

/**
 * Polls the coarse-grained `ops/digest` view via `opsWriteGate` (single Firestore read server-side).
 */
export async function pollOpsDigestViaGate(
  options: OpsGateAuthOptions & { endpoint: string }
): Promise<OpsDigestPollResult> {
  const fetchFn = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;

  let res: Response;
  let text: string;
  try {
    res = await fetchFn(options.endpoint, {
      method: "GET",
      headers: buildHeaders(options, false),
      signal: AbortSignal.timeout(timeoutMs)
    });
    text = await res.text();
  } catch (err: unknown) {
    if (isOfflineNetworkError(err)) {
      throw new OpsGateOfflineError(
        `Unable to reach opsWriteGate at ${options.endpoint}: ${err instanceof Error ? err.message : String(err)}`,
        { endpoint: options.endpoint, cause: err }
      );
    }
    throw err;
  }

  let parsedBody: unknown;
  if (text) {
    try {
      parsedBody = JSON.parse(text) as unknown;
    } catch {
      parsedBody = text;
    }
  }

  if (!res.ok) {
    const errObj =
      parsedBody && typeof parsedBody === "object" && "error" in parsedBody
        ? ((parsedBody as { error?: { code?: string; message?: string } }).error ?? {})
        : {};
    throw new OpsGateHttpError(
      errObj.code || `HTTP_${res.status}`,
      res.status,
      errObj.message || `opsWriteGate returned HTTP ${res.status}`,
      parsedBody
    );
  }

  return parsedBody as OpsDigestPollResult;
}
