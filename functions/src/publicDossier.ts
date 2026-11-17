import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

/** Hard cap on rows returned to an unauthenticated caller. */
export const PUBLIC_DOSSIER_ACTIONS_LIMIT = 100;

export interface PublicDossierAction {
  id: string;
  title: string;
  actionLeverage: number;
}

/**
 * Pure projection: the ONLY fields a public dossier may expose for an action
 * are its title and computed leverage (MIPA-4). Everything else - costs,
 * notes, responsible persons, org ids - is dropped by construction because
 * the output object is built field by field, never spread from the input.
 */
export function projectPublicActions(
  rawActions: Record<string, unknown>[]
): PublicDossierAction[] {
  const out: PublicDossierAction[] = [];
  for (const a of rawActions || []) {
    if (!a || typeof a.title !== "string" || !a.title.trim()) continue;
    const lev = a.actionLeverage;
    out.push({
      id: String(a.id ?? ""),
      title: a.title,
      // Missing, non-numeric and non-finite leverage are reported as 0.
      actionLeverage: typeof lev === "number" && Number.isFinite(lev) ? lev : 0
    });
  }
  out.sort((x, y) => y.actionLeverage - x.actionLeverage);
  return out.slice(0, PUBLIC_DOSSIER_ACTIONS_LIMIT);
}

/**
 * Returns title + leverage of the actions of a PUBLIC model's organisation.
 * Callable without sign-in, but refuses unless the model has isPublic === true.
 */
export const getPublicDossierActions = onCall(async (request) => {
  const { modelId } = request.data || {};
  if (typeof modelId !== "string" || !modelId || modelId.includes("/")) {
    throw new HttpsError("invalid-argument", "modelId is required.");
  }
  const db = getFirestore();
  const modelSnap = await db.collection("models").doc(modelId).get();
  const model = modelSnap.data();
  if (!modelSnap.exists || !model || model.isPublic !== true) {
    // Same answer for "missing" and "private": do not reveal which.
    throw new HttpsError("not-found", "No public dossier for this model.");
  }
  if (typeof model.orgId !== "string" || !model.orgId) {
    return { actions: [] };
  }
  const snap = await db
    .collection("actions")
    .where("orgId", "==", model.orgId)
    .limit(1000)
    .get();
  const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return { actions: projectPublicActions(raw) };
});
