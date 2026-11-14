// One adapter per AI provider behind a common interface: send the fixed
// instructions and the conversation, get back a reply in DraftReplySchema
// and token usage. Organizations bring their own provider; mipa pays for
// none.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { DraftReply, DraftReplySchema } from "./schema";

export type ProviderId = "anthropic" | "openai-compatible";

export interface ProviderSettings {
  provider: ProviderId;
  model: string;
  baseUrl?: string; // openai-compatible only
}

export interface Turn {
  role: "user" | "assistant";
  text: string;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface AdapterRequest {
  system: string;
  turns: Turn[];
  kindHint: "questions-or-draft" | "draft";
}

export interface AdapterResult {
  reply: DraftReply;
  usage: Usage;
}

// A reply the provider declined to give, or couldn't give in the format.
export class ProviderReplyError extends Error {
  constructor(
    message: string,
    readonly reason: "refusal" | "invalid-reply" | "too-long" | "auth" | "unavailable"
  ) {
    super(message);
  }
}

export interface Adapter {
  draft(request: AdapterRequest): Promise<AdapterResult>;
  test(): Promise<void>;
}

export function adapterFor(settings: ProviderSettings, apiKey: string): Adapter {
  switch (settings.provider) {
    case "anthropic":
      return new AnthropicAdapter(settings.model, apiKey);
    case "openai-compatible":
      return new OpenAiCompatibleAdapter(settings.model, apiKey, settings.baseUrl || "");
  }
}

// ---------------------------------------------------------------------------
// Anthropic (Claude)

// Models mipa has tested, with the features each supports.
export const RECOMMENDED_CLAUDE_MODELS = [
  "claude-opus-5-5",
  "claude-sonnet-5-5",
  "claude-fable-5-2",
  "claude-haiku-5-5"
];
// Models that accept server-side refusal fallbacks.
const CLAUDE_FALLBACK_MODELS = new Set([
  "claude-fable-5-2",
  "claude-fable-5-1",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5"
]);

class AnthropicAdapter implements Adapter {
  private client: Anthropic;
  constructor(private model: string, apiKey: string) {
    // The function's own timeout is 300 s; leave room to save the result.
    this.client = new Anthropic({ apiKey, timeout: 280_000, maxRetries: 2 });
  }

  async draft(request: AdapterRequest): Promise<AdapterResult> {
    const known = RECOMMENDED_CLAUDE_MODELS.includes(this.model);
    const withFallbacks = CLAUDE_FALLBACK_MODELS.has(this.model);
    let message;
    try {
      const stream = this.client.beta.messages.stream({
        model: this.model,
        max_tokens: 64000,
        // The instructions are the same for everyone: cache them. The
        // top-level breakpoint also caches the conversation so far.
        system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
        cache_control: { type: "ephemeral" },
        messages: request.turns.map((t) => ({ role: t.role, content: t.text })),
        output_config: {
          format: zodOutputFormat(DraftReplySchema),
          ...(known ? { effort: request.kindHint == "draft" ? "high" : "medium" } : {})
        },
        ...(withFallbacks
          ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
          : {})
      });
      message = await stream.finalMessage();
    } catch (error) {
      throw anthropicError(error);
    }

    if (message.stop_reason == "refusal") {
      throw new ProviderReplyError(
        message.stop_details?.explanation || "The model declined this request.",
        "refusal"
      );
    }
    if (message.stop_reason == "max_tokens") {
      throw new ProviderReplyError("The reply was too long.", "too-long");
    }
    const text = message.content
      .filter((b) => b.type == "text")
      .map((b) => (b as { text: string }).text)
      .join("");
    const usage = message.usage;
    return {
      reply: parseReply(text),
      usage: {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheReadTokens: usage.cache_read_input_tokens || 0,
        cacheWriteTokens: usage.cache_creation_input_tokens || 0
      }
    };
  }

  async test(): Promise<void> {
    try {
      await this.client.models.retrieve(this.model);
    } catch (error) {
      throw anthropicError(error);
    }
  }
}

function anthropicError(error: unknown): Error {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new ProviderReplyError("The provider rejected the API key.", "auth");
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new ProviderReplyError("The provider doesn't offer this model.", "unavailable");
  }
  if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError) {
    return new ProviderReplyError("The provider is busy. Try again in a minute.", "unavailable");
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new ProviderReplyError("Couldn't reach the provider.", "unavailable");
  }
  if (error instanceof Anthropic.APIError) {
    return new ProviderReplyError(`The provider returned an error: ${error.message}`, "unavailable");
  }
  return error instanceof Error ? error : new Error(String(error));
}

// ---------------------------------------------------------------------------
// OpenAI-compatible endpoints (OpenRouter, Azure OpenAI, Mistral, Ollama,
// vLLM...). Plain HTTP against the widely shared chat-completions shape, so
// no provider SDK is needed. Providers cache long identical prompt prefixes
// automatically where they support it; the fixed instructions come first.

class OpenAiCompatibleAdapter implements Adapter {
  constructor(private model: string, private apiKey: string, private baseUrl: string) {
    if (!isAllowedEndpoint(baseUrl)) {
      throw new ProviderReplyError("The endpoint must be an https:// address.", "unavailable");
    }
  }

  private async post(path: string, body: unknown) {
    const url = this.baseUrl.replace(/\/+$/, "") + path;
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(280_000)
      });
    } catch {
      throw new ProviderReplyError("Couldn't reach the provider.", "unavailable");
    }
    if (response.status == 401 || response.status == 403) {
      throw new ProviderReplyError("The provider rejected the API key.", "auth");
    }
    if (!response.ok) {
      throw new ProviderReplyError(`The provider returned HTTP ${response.status}.`, "unavailable");
    }
    return response.json() as Promise<{
      choices?: { message?: { content?: string; refusal?: string }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
    }>;
  }

  async draft(request: AdapterRequest): Promise<AdapterResult> {
    const body = {
      model: this.model,
      messages: [
        { role: "system", content: request.system },
        ...request.turns.map((t) => ({ role: t.role, content: t.text }))
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "draft_reply", strict: true, schema: z.toJSONSchema(DraftReplySchema) }
      }
    };
    const json = await this.post("/chat/completions", body);
    const choice = json.choices?.[0];
    if (choice?.message?.refusal) throw new ProviderReplyError(choice.message.refusal, "refusal");
    if (choice?.finish_reason == "length") throw new ProviderReplyError("The reply was too long.", "too-long");
    const cached = json.usage?.prompt_tokens_details?.cached_tokens || 0;
    return {
      reply: parseReply(choice?.message?.content || ""),
      usage: {
        inputTokens: (json.usage?.prompt_tokens || 0) - cached,
        outputTokens: json.usage?.completion_tokens || 0,
        cacheReadTokens: cached,
        cacheWriteTokens: 0
      }
    };
  }

  async test(): Promise<void> {
    await this.post("/chat/completions", {
      model: this.model,
      max_tokens: 5,
      messages: [{ role: "user", content: "Reply with OK." }]
    });
  }
}

// ---------------------------------------------------------------------------

// Endpoints must use https. Only in the local emulator, a mock provider on
// this machine may use http (for end-to-end tests).
export function isAllowedEndpoint(url: string): boolean {
  if (/^https:\/\/\S+$/.test(url)) return true;
  return process.env.FUNCTIONS_EMULATOR === "true" && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url);
}

export function parseReply(text: string): DraftReply {
  // Some endpoints wrap JSON in a code fence despite the format.
  const trimmed = text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch {
    throw new ProviderReplyError("The reply wasn't valid JSON.", "invalid-reply");
  }
  const parsed = DraftReplySchema.safeParse(json);
  if (!parsed.success) {
    throw new ProviderReplyError(
      `The reply didn't match the format: ${parsed.error.issues[0]?.message || "unknown"}`,
      "invalid-reply"
    );
  }
  return parsed.data;
}
