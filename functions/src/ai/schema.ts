// The one reply format every provider must produce for "Draft my model".
// Kept flat (no unions, every field present) so it works with each
// provider's strict structured-output mode: fields that don't apply to the
// reply's kind are left empty.

import { z } from "zod";

export const QuestionSchema = z.object({
  question: z.string(),
  why: z.string()
});

export const DraftFactorSchema = z.object({
  name: z.string(),
  symbol: z.string(),
  formula: z.string(),
  unit: z.string(),
  group: z.string(),
  explanation: z.string(),
  isEstimate: z.boolean(),
  estimateReasoning: z.string(),
  isHourlyCost: z.boolean()
});

export const ChangeToExistingSchema = z.object({
  symbol: z.string(),
  newFormula: z.string(),
  explanation: z.string()
});

export const ActionImpactProposalSchema = z.object({
  factorSymbol: z.string(),
  factorName: z.string(),
  operation: z.enum(["+", "-", "*", "/", "="]),
  operand: z.string(),
  durationType: z.enum(["forever", "just_once", "for_period", "with_half_life"]),
  durationNumber: z.number().nullable(),
  durationUnit: z.enum(["days", "weeks", "months", "years"]).nullable(),
  thenText: z.string(),
  source: z.string()
});

export const DraftActionReplySchema = z.object({
  title: z.string(),
  summary: z.string(),
  estEffortHrs: z.number().nullable(),
  effortReasoning: z.string(),
  estSpending: z.number().nullable(),
  spendingReasoning: z.string(),
  currency: z.string(),
  impacts: z.array(ActionImpactProposalSchema),
  notes: z.string()
});

export type ActionImpactProposal = z.infer<typeof ActionImpactProposalSchema>;
export type DraftActionReply = z.infer<typeof DraftActionReplySchema>;

export const DraftReplySchema = z.object({
  kind: z.enum(["questions", "draft"]),
  message: z.string(),
  questions: z.array(QuestionSchema),
  summary: z.string(),
  groups: z.array(z.string()),
  factors: z.array(DraftFactorSchema),
  changesToExisting: z.array(ChangeToExistingSchema)
});

export type DraftReply = z.infer<typeof DraftReplySchema>;
