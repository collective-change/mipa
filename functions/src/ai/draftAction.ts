// "Idea to complete action": turns a short idea description into a complete
// action proposal with effort hours, spending, and factor impacts.
// Relayed through Cloud Function so the organization's encrypted AI key is kept safe.

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { aiKeyEncryptionKey } from "./keyBox";
import { loadProvider } from "./aiSettings";
import { adapterFor, ProviderReplyError } from "./providers";
import { ACTION_DRAFT_SYSTEM_PROMPT, actionDraftUserPrompt, ModelContext } from "./prompt";
import { DraftActionReply } from "./schema";

const MAX_IDEA_LENGTH = 4000;

async function getModelContext(orgId: string, modelId: string): Promise<ModelContext> {
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

export const draftAction = onCall(
  { secrets: [aiKeyEncryptionKey], timeoutSeconds: 300, memory: "512MiB" },
  async (request): Promise<{ proposal: DraftActionReply; usage: { inputTokens: number; outputTokens: number } }> => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Please sign in.");
    const uid = request.auth.uid;
    const { orgId, modelId, ideaText } = request.data || {};

    if (typeof orgId !== "string" || typeof modelId !== "string" || !orgId || !modelId) {
      throw new HttpsError("invalid-argument", "orgId and modelId are required.");
    }

    const text = typeof ideaText === "string" ? ideaText.trim() : "";
    if (!text) {
      throw new HttpsError("invalid-argument", "Please provide an action idea.");
    }
    if (text.length > MAX_IDEA_LENGTH) {
      throw new HttpsError("invalid-argument", "Action idea text is too long.");
    }

    const db = getFirestore();
    const [modelDoc, memberDoc] = await Promise.all([
      db.doc(`models/${modelId}`).get(),
      db.doc(`orgs/${orgId}/members/${uid}`).get()
    ]);

    if (!modelDoc.exists) {
      throw new HttpsError("not-found", "Model not found.");
    }

    const editors: string[] = modelDoc.get("editors.users") || [];
    const isMember = memberDoc.exists;
    const isEditor = editors.includes(uid);

    if (!isMember && !isEditor) {
      throw new HttpsError("permission-denied", "You must be a member of this organization to draft actions.");
    }

    const provider = await loadProvider(orgId);
    if (!provider) {
      throw new HttpsError("failed-precondition", "This organization hasn't connected an AI provider.", {
        reason: "no-provider"
      });
    }

    const context = await getModelContext(orgId, modelId);
    const userPrompt = actionDraftUserPrompt(context, text);

    const adapter = adapterFor(provider.settings, provider.apiKey);

    try {
      const result = await adapter.draftAction({
        system: ACTION_DRAFT_SYSTEM_PROMPT,
        turns: [{ role: "user", text: userPrompt }]
      });

      return {
        proposal: result.reply,
        usage: {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens
        }
      };
    } catch (error) {
      if (error instanceof ProviderReplyError) {
        throw new HttpsError("unavailable", error.message, { reason: error.reason });
      }
      throw error;
    }
  }
);
