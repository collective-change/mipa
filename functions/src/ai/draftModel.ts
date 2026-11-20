// "Draft my model": one turn of the conversation with the organization's AI
// provider. The browser sends only the new text; the conversation is kept
// here, in models/{modelId}/aiDrafts/{draftId}, so the AI's earlier turns
// can't be rewritten. Nothing is written to the model: the browser shows the
// draft, test-calculates it and writes it only when the person accepts.

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp, Firestore } from "firebase-admin/firestore";
import { aiKeyEncryptionKey, systemAiProviderKey } from "./keyBox";
import { loadProvider } from "./aiSettings";
import {
  getSystemAiProvider,
  withAiCreditProtection,
  AllowanceResult,
  ConsumeAiCreditOptions
} from "./starterAllowance";
import { adapterFor, ProviderReplyError, Turn, Usage } from "./providers";
import { SYSTEM_PROMPT, contextText, repairText, ModelContext } from "./prompt";
import { DraftReply } from "./schema";

const MAX_TEXT = 8000;
const MAX_REQUESTS_PER_DRAFT = 6;
const KEEP_DAYS = 30;

interface Session {
  orgId: string;
  createdBy: string;
  turns: Turn[];
  questionRounds: number;
  requestCount: number;
}

async function modelContext(orgId: string, modelId: string): Promise<ModelContext> {
  const db = getFirestore();
  const [org, model, nodes] = await Promise.all([
    db.doc(`orgs/${orgId}`).get(),
    db.doc(`models/${modelId}`).get(),
    db.collection(`models/${modelId}/nodes`).get()
  ]);
  const params = model.get("simulationParams") || {};
  const groupOf = new Map<string, string>();
  for (const group of (model.get("nodeGroups") || []) as { name?: string; nodeIds?: string[] }[]) {
    for (const id of group.nodeIds || []) groupOf.set(id, group.name || "");
  }
  return {
    org: {
      name: org.get("name") || "",
      goal: org.get("goal") || "",
      orgType: org.get("orgType") || "",
      currency: org.get("currency") || "USD"
    },
    timeStep: `${params.timeStepNumber || 1} ${params.timeStepUnit || "months"}`,
    horizon: `${params.finalTimeNumber || params.numTimeSteps || 120} ${params.finalTimeUnit || params.timeStepUnit || "months"}`,
    factors: nodes.docs.map((d) => ({
      name: d.get("name") || "",
      symbol: d.get("symbol") || "",
      formula: d.get("symbolFormula") || "0",
      unit: d.get("unit") || "",
      group: groupOf.get(d.id) || ""
    }))
  };
}

export async function draftModelWithCreditProtection(params: {
  db: Firestore;
  uid: string;
  orgId: string;
  auth: { token?: { email_verified?: boolean } };
  useSystemFallback: boolean;
  creditOptions?: ConsumeAiCreditOptions;
  turns: Turn[];
  mustDraft: boolean;
  adapter: {
    draft: (req: {
      system: string;
      turns: Turn[];
      kindHint: "draft" | "questions-or-draft";
    }) => Promise<{ reply: DraftReply; usage: Usage }>;
  };
}): Promise<{ reply: DraftReply; usage: Usage; requests: number; allowance: AllowanceResult | null }> {
  const { result, allowance } = await withAiCreditProtection(
    params.db,
    params.uid,
    params.orgId,
    params.auth,
    params.useSystemFallback,
    async () => {
      const usage: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
      let reply: DraftReply | undefined;
      let requests = 0;
      // One retry when the reply doesn't match the format.
      for (let attempt = 0; attempt < 2 && !reply; attempt++) {
        requests++;
        try {
          const draftResult = await params.adapter.draft({
            system: SYSTEM_PROMPT,
            turns: params.turns,
            kindHint: params.mustDraft ? "draft" : "questions-or-draft"
          });
          for (const k of Object.keys(usage) as (keyof Usage)[]) usage[k] += draftResult.usage[k];
          reply = draftResult.reply;
        } catch (error) {
          if (error instanceof ProviderReplyError) {
            if (error.reason == "invalid-reply" && attempt == 0) continue;
            throw new HttpsError("failed-precondition", error.message, { reason: error.reason });
          }
          throw error;
        }
      }
      if (!reply) throw new HttpsError("internal", "No reply.");
      return { reply, usage, requests };
    },
    params.creditOptions ? { creditOptions: params.creditOptions } : undefined
  );

  return { ...result, allowance };
}

export const draftModel = onCall(
  { secrets: [aiKeyEncryptionKey, systemAiProviderKey], timeoutSeconds: 300, memory: "512MiB" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Please sign in.");
    const uid = request.auth.uid;
    const { orgId, modelId, draftId } = request.data || {};
    if (typeof orgId != "string" || typeof modelId != "string" || !orgId || !modelId) {
      throw new HttpsError("invalid-argument", "orgId and modelId are required.");
    }
    const text = typeof request.data?.text == "string" ? request.data.text.trim() : "";
    const errors: string[] = Array.isArray(request.data?.errors)
      ? request.data.errors.filter((e: unknown) => typeof e == "string").slice(0, 20)
      : [];
    const draftNow = request.data?.draftNow === true;
    if (text.length > MAX_TEXT || errors.join("").length > MAX_TEXT) {
      throw new HttpsError("invalid-argument", "That text is too long.");
    }
    if (!text && !errors.length && !draftNow) {
      throw new HttpsError("invalid-argument", "Please describe your organization.");
    }

    const db = getFirestore();
    const model = await db.doc(`models/${modelId}`).get();
    if (!model.exists) throw new HttpsError("not-found", "Model not found.");
    const editors: string[] = model.get("editors.users") || [];
    const viewerOrgs: string[] = model.get("viewers.org") || [];
    const modelOrgId = model.get("orgId");
    const isOrgMatch = modelOrgId === orgId || modelId === orgId || viewerOrgs.includes(orgId);
    if (!editors.includes(uid) || !isOrgMatch) {
      throw new HttpsError("permission-denied", "Only the model's editors can draft it.");
    }

    // Load or start the conversation before resolving/consuming any credit so
    // expired drafts or request-cap errors fail fast with zero credit burn.
    const sessionRef = draftId
      ? db.doc(`models/${modelId}/aiDrafts/${String(draftId)}`)
      : db.collection(`models/${modelId}/aiDrafts`).doc();
    let session: Session;
    if (draftId) {
      const snapshot = await sessionRef.get();
      if (!snapshot.exists || snapshot.get("createdBy") != uid) {
        throw new HttpsError("not-found", "This draft has expired. Please start again.");
      }
      session = snapshot.data() as Session;
    } else {
      session = { orgId, createdBy: uid, turns: [], questionRounds: 0, requestCount: 0 };
    }
    if (session.requestCount >= MAX_REQUESTS_PER_DRAFT) {
      throw new HttpsError(
        "resource-exhausted",
        "This draft has reached its limit of AI requests. Please start a new draft."
      );
    }

    let provider = await loadProvider(orgId);
    const useSystemFallback = !provider;
    if (!provider) {
      provider = getSystemAiProvider();
      if (!provider) {
        throw new HttpsError(
          "failed-precondition",
          "This organization hasn't connected an AI provider and no system AI fallback is configured.",
          { reason: "no-provider", degraded: true }
        );
      }
    }

    // The new user turn. The organization and model go into the first one,
    // after the cached instructions.
    let userText: string;
    if (!session.turns.length) {
      const context = await modelContext(orgId, modelId);
      userText = `${contextText(context)}\n\n# What the user wrote\n${text}`;
    } else if (errors.length) {
      userText = repairText(errors);
    } else if (draftNow) {
      userText =
        (text ? text + "\n\n" : "") +
        "Please draft the model now, making reasonable assumptions for anything still open.";
    } else {
      userText = text;
    }
    const turns: Turn[] = [...session.turns, { role: "user", text: userText }];
    const mustDraft = errors.length > 0 || draftNow || session.questionRounds >= 2;

    const adapter = adapterFor(provider.settings, provider.apiKey);
    const { reply, usage, requests, allowance } = await draftModelWithCreditProtection({
      db,
      uid,
      orgId,
      auth: request.auth,
      useSystemFallback,
      turns,
      mustDraft,
      adapter
    });

    await sessionRef.set(
      {
        orgId,
        createdBy: uid,
        turns: [...turns, { role: "assistant", text: JSON.stringify(reply) }],
        questionRounds: session.questionRounds + (reply.kind == "questions" ? 1 : 0),
        requestCount: session.requestCount + requests,
        provider: provider.settings.provider,
        model: provider.settings.model,
        usage: {
          inputTokens: FieldValue.increment(usage.inputTokens),
          outputTokens: FieldValue.increment(usage.outputTokens),
          cacheReadTokens: FieldValue.increment(usage.cacheReadTokens),
          cacheWriteTokens: FieldValue.increment(usage.cacheWriteTokens)
        },
        updateTime: FieldValue.serverTimestamp(),
        // Removed by a Firestore TTL policy on aiDrafts.expireAt.
        expireAt: Timestamp.fromMillis(Date.now() + KEEP_DAYS * 24 * 3600 * 1000),
        ...(session.turns.length ? {} : { createTime: FieldValue.serverTimestamp() })
      },
      { merge: true }
    );

    return { draftId: sessionRef.id, reply, allowance };
  }
);
