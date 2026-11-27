// The model-judged half of the review (MIPA-50): the fixed instructions sent
// to the organisation's provider and the strict parser for its reply. The
// instructions are part of the methodology: changing them is a new
// METHODOLOGY_VERSION.

import { z } from "zod";
import { CRITERIA, CriterionId } from "./rubric";
import type { Finding, ReviewInput } from "./assurance";

const MODEL_CRITERIA = CRITERIA.filter((c) => c.method === "model");

export const JUDGE_SYSTEM_PROMPT = [
  "You check a strategic model dossier against the published Longecho review methodology.",
  "You do not decide whether the organisation's strategy is good. You judge only these criteria:",
  ...MODEL_CRITERIA.map((c) => `- ${c.id}: ${c.checks}`),
  "Score each criterion from 0 to 1. For every point you deduct, give one finding that names the factor or action id and says what disagrees with what.",
  "Read outcome factors and any 'no other significant factors, because ...' omission records adversarially: name the strongest omitted driver, the loop that breaks, or the assumption the conclusion rests on, without deciding for the organisation.",
  "You cannot see the sources behind citations and must not claim to have checked them.",
  'Reply with JSON only: {"scores": {"<criterion>": number}, "findings": [{"criterion": string, "subject": string, "text": string}]}.',
].join("\n");

export function judgeUserPrompt(input: ReviewInput): string {
  return JSON.stringify({ modelId: input.modelId, factors: input.factors, actions: input.actions });
}

const ReplySchema = z.object({
  scores: z.record(z.string(), z.number().min(0).max(1)),
  findings: z
    .array(z.object({ criterion: z.string(), subject: z.string().optional(), text: z.string().min(1).max(1000) }))
    .max(100),
});

// Strict: a reply that omits a model criterion, invents one, or is not JSON
// is rejected rather than scored as zero, so a broken call cannot quietly
// cost an organisation its tier.
export function parseJudgeReply(text: string): { scores: Partial<Record<CriterionId, number>>; findings: Finding[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("The review model did not reply with JSON.");
  }
  const reply = ReplySchema.parse(raw);
  const allowed = new Set<string>(MODEL_CRITERIA.map((c) => c.id));
  for (const id of allowed) {
    if (!(id in reply.scores)) throw new Error(`The review model did not score ${id}.`);
  }
  for (const id of Object.keys(reply.scores)) {
    if (!allowed.has(id)) throw new Error(`The review model scored an unknown criterion ${id}.`);
  }
  return {
    scores: reply.scores as Partial<Record<CriterionId, number>>,
    findings: reply.findings
      .filter((f) => allowed.has(f.criterion))
      .map((f) => ({ criterion: f.criterion as CriterionId, subject: f.subject, text: f.text })),
  };
}
