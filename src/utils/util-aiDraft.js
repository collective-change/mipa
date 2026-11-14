// "Draft my model" in the browser: asking the organization's AI provider
// (through the draftModel Cloud Function), writing an accepted draft to the
// model in one batch, and removing it again.

import { uid } from "quasar";
import { httpsCallable } from "firebase/functions";
import {
  arrayUnion,
  collection,
  deleteField,
  doc,
  serverTimestamp,
  writeBatch
} from "firebase/firestore";
import { firebaseAuth, firebaseDb, firebaseFunctions } from "@/boot/firebase";
import { classifyInfluencers } from "@/utils/util-node-operations";

// One turn of the conversation. Resolves { draftId, reply }.
export async function requestDraft(params) {
  const call = httpsCallable(firebaseFunctions, "draftModel", { timeout: 310000 });
  const result = await call(params);
  return result.data;
}

// The draft as compileModelDraft takes it, keeping only the chosen factors.
export function draftForCompile(reply, chosenSymbols, notesFor) {
  return {
    factors: reply.factors
      .filter(f => chosenSymbols.has(f.symbol))
      .map(f => ({
        symbol: f.symbol,
        name: f.name,
        formula: f.formula,
        unit: f.unit,
        group: f.group,
        isHourlyCost: f.isHourlyCost,
        notes: notesFor(f)
      })),
    changesToExisting: reply.changesToExisting
  };
}

// Writes an accepted draft: new factors, changed existing ones (remembering
// how they were, for undo) and one group per group name, in one batch.
export async function writeDraft({ modelId, draftId, compiled, reply }) {
  const user = firebaseAuth.currentUser;
  const nodesRef = collection(firebaseDb, "models", modelId, "nodes");
  const batch = writeBatch(firebaseDb);
  compiled.creates.forEach(({ id, ...node }) =>
    batch.set(doc(nodesRef, id), {
      ...node,
      draftId,
      createTime: serverTimestamp(),
      createdBy: user.uid
    })
  );
  compiled.updates.forEach(({ id, fields, previous }) =>
    batch.update(doc(nodesRef, id), {
      ...fields,
      aiDraftPrevious: {
        draftId,
        previous,
        // to tell later whether someone edited the formula since
        appliedSysFormula: fields.sysFormula ?? null
      },
      updateTime: serverTimestamp(),
      updatedBy: user.uid
    })
  );

  const groupOf = new Map(reply.factors.map(f => [f.symbol, f.group]));
  const groups = new Map();
  compiled.creates.forEach(node => {
    const name = groupOf.get(node.symbol);
    if (!name) return;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(node.id);
  });
  const nodeGroups = [...groups].map(([name, nodeIds]) => ({ id: uid(), name, nodeIds, draftId }));
  batch.update(doc(firebaseDb, "models", modelId), {
    ...(nodeGroups.length ? { nodeGroups: arrayUnion(...nodeGroups) } : {}),
    appliedAiDrafts: arrayUnion({
      draftId,
      appliedAt: Date.now(),
      appliedBy: user.uid,
      factorCount: compiled.creates.length
    }),
    updateTime: serverTimestamp(),
    updatedBy: user.uid
  });
  await batch.commit();
}

// Works out what removing a draft does, without writing:
// - deletes: ids of the factors the draft added;
// - updates: { id, fields } for the remaining factors;
// - conflicts: names of remaining factors whose formulas use drafted
//   factors (someone built on the draft) - they will need fixing;
// - kept: names of factors the draft changed that were edited since, so
//   their current formulas are kept.
export function planDraftRemoval(nodes, draftId) {
  const deletes = new Set(nodes.filter(n => n.draftId == draftId).map(n => n.id));
  const remaining = nodes
    .filter(n => !deletes.has(n.id))
    .map(n => ({ ...n, influencers: [...(n.influencers || [])] }));
  const conflicts = [];
  const kept = [];
  const changed = new Map();
  const mark = (node, field, value) => {
    if (!changed.has(node.id)) changed.set(node.id, {});
    changed.get(node.id)[field] = value;
    node[field] = value;
  };

  remaining.forEach(node => {
    const record = node.aiDraftPrevious;
    if (record && record.draftId == draftId) {
      const unchanged =
        record.appliedSysFormula == null || record.appliedSysFormula == node.sysFormula;
      if (unchanged) {
        Object.entries(record.previous || {}).forEach(([field, value]) => {
          if (!["influencees", "class", "blockingInfluencers", "unusedInfluencers", "isSelfBlocking"].includes(field))
            // Factors that had no list of influencers get an empty one.
            mark(node, field, value === null ? (field == "influencers" ? [] : deleteField()) : value);
        });
      } else kept.push(node.name);
      mark(node, "aiDraftPrevious", deleteField());
    }
    if ([...deletes].some(id => (node.sysFormula || "").includes("$" + id))) conflicts.push(node.name);
    const influencers = node.influencers.filter(id => !deletes.has(id));
    if (influencers.length != node.influencers.length) mark(node, "influencers", influencers);
  });

  // Rebuild influencees and classes from the influencers.
  const influencees = new Map(remaining.map(n => [n.id, []]));
  remaining.forEach(n =>
    (Array.isArray(n.influencers) ? n.influencers : []).forEach(id => {
      if (influencees.has(id)) influencees.get(id).push(n.id);
    })
  );
  remaining.forEach(node => {
    const list = influencees.get(node.id);
    const same = (a, b) => JSON.stringify([...(a || [])].sort()) == JSON.stringify([...(b || [])].sort());
    if (!same(list, node.influencees)) mark(node, "influencees", list);
    const plain = { ...node, influencers: Array.isArray(node.influencers) ? node.influencers : [] };
    const hasIn = plain.influencers.length > 0;
    const hasOut = list.length > 0;
    const cls = hasIn && hasOut ? "state" : hasIn ? "output" : hasOut ? "input" : "unlinked";
    if (cls != node.class) mark(node, "class", cls);
    if (changed.has(node.id) && typeof plain.sysFormula == "string") {
      const { blocking, unused } = classifyInfluencers({ thisNode: plain });
      mark(node, "blockingInfluencers", blocking);
      mark(node, "unusedInfluencers", unused);
      mark(node, "isSelfBlocking", blocking.includes(node.id));
    }
  });
  return {
    deletes: [...deletes],
    updates: [...changed].map(([id, fields]) => ({ id, fields })),
    conflicts,
    kept
  };
}

export async function removeDraft({ model, nodes, draftId }) {
  const plan = planDraftRemoval(nodes, draftId);
  const nodesRef = collection(firebaseDb, "models", model.id, "nodes");
  const batch = writeBatch(firebaseDb);
  plan.deletes.forEach(id => batch.delete(doc(nodesRef, id)));
  plan.updates.forEach(({ id, fields }) => batch.update(doc(nodesRef, id), fields));
  const deleted = new Set(plan.deletes);
  const nodeGroups = (model.nodeGroups || [])
    .filter(g => g.draftId != draftId)
    .map(g => ({ ...g, nodeIds: (g.nodeIds || []).filter(id => !deleted.has(id)) }));
  batch.update(doc(firebaseDb, "models", model.id), {
    nodeGroups,
    appliedAiDrafts: (model.appliedAiDrafts || []).filter(d => d.draftId != draftId),
    updateTime: serverTimestamp(),
    updatedBy: firebaseAuth.currentUser.uid
  });
  await batch.commit();
  return plan;
}
