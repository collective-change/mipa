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
