import { z } from "zod";

export const relationTypeSchema = z.enum([
  "uses",
  "special_case_of",
  "generalizes",
  "equivalent_to",
  "prerequisite_of",
  "conflicts_with",
]);
export type RelationType = z.infer<typeof relationTypeSchema>;

/** A directional relation owned by the current knowledge item. */
export const knowledgeRelationSchema = z
  .object({
    targetId: z.string().trim().min(1).max(160),
    type: relationTypeSchema,
    note: z.string().trim().max(1_000).optional(),
  })
  .strict();
export type KnowledgeRelation = z.infer<typeof knowledgeRelationSchema>;

export const relationLabels: Record<RelationType, string> = {
  uses: "يستعمل",
  special_case_of: "حالة خاصة من",
  generalizes: "تعميم لـ",
  equivalent_to: "يكافئ",
  prerequisite_of: "متطلب سابق لـ",
  conflicts_with: "يتعارض مع",
};
