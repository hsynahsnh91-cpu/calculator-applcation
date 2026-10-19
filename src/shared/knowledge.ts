import { z } from "zod";
import { solverSettingsSchema } from "./settings";

/**
 * Current KnowledgeItem fields only (spec 05). Optional understanding /
 * statement / relations fields are added in phase 6, not here.
 */
export const knowledgeItemTypeSchema = z.enum([
  "rule",
  "example",
  "exercise",
  "correction",
  "notation",
]);
export type KnowledgeItemType = z.infer<typeof knowledgeItemTypeSchema>;

export const knowledgeStatusSchema = z.enum(["draft", "approved", "published"]);
export type KnowledgeStatus = z.infer<typeof knowledgeStatusSchema>;

export const solutionStepSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    text: z.string().trim().max(4_000).optional(),
    latex: z.string().trim().max(8_000).optional(),
  })
  .strict();

export const approvedSolutionSchema = z
  .object({
    answerText: z.string().trim().max(12_000).optional(),
    answerLatex: z.string().trim().max(12_000).optional(),
    steps: z.array(solutionStepSchema).max(80).default([]),
    verification: z
      .object({
        passed: z.boolean(),
        method: z.string().trim().min(1).max(1_000),
      })
      .strict()
      .optional(),
    elapsedMs: z.number().finite().min(0).max(300_000).optional(),
  })
  .strict()
  .refine(
    (value) => Boolean(value.answerText || value.answerLatex || value.steps.length),
    "يجب أن يتضمن الحل جوابًا أو خطوة واحدة على الأقل.",
  );
export type ApprovedSolution = z.infer<typeof approvedSolutionSchema>;

export const negativeExampleSchema = z
  .object({
    answerText: z.string().trim().max(12_000),
    answerLatex: z.string().trim().max(12_000).optional(),
    reason: z.string().trim().min(1).max(2_000),
    createdAt: z.string().datetime(),
  })
  .strict();

export const errorCategorySchema = z.enum([
  "missing_rule",
  "ocr_error",
  "engine_selection",
  "formulation",
  "unknown",
]);
export type ErrorCategory = z.infer<typeof errorCategorySchema>;

export const errorAnalysisSchema = z
  .object({
    category: errorCategorySchema,
    explanation: z.string().trim().min(1).max(3_000),
    suggestedRule: z.string().trim().min(1).max(6_000),
  })
  .strict();
export type ErrorAnalysis = z.infer<typeof errorAnalysisSchema>;

export const knowledgeItemSchema = z
  .object({
    id: z.string().trim().min(8).max(160),
    type: knowledgeItemTypeSchema,
    originalText: z.string().trim().min(1).max(30_000),
    structured: z.string().trim().max(30_000),
    latex: z.string().trim().max(30_000),
    grade: z.string().trim().min(1).max(120),
    unit: z.string().trim().min(1).max(180),
    lesson: z.string().trim().min(1).max(240),
    source: z.string().trim().min(1).max(500),
    fileName: z.string().trim().min(1).max(500),
    page: z.number().int().min(1).max(20_000),
    status: knowledgeStatusSchema,
    confidence: z.number().finite().min(0).max(1),
    needsReview: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    version: z.number().int().min(0).max(1_000_000),
    canonicalQuestion: z.string().trim().max(30_000),
    fingerprint: z.string().trim().min(6).max(160),
    relatedRuleIds: z.array(z.string().trim().min(1).max(160)).max(80).default([]),
    approvedSolution: approvedSolutionSchema.optional(),
    bookSolution: approvedSolutionSchema.optional(),
    comparison: z.enum(["matching", "needs_review", "not_compared"]).default("not_compared"),
    negativeExample: negativeExampleSchema.optional(),
    errorAnalysis: errorAnalysisSchema.optional(),
  })
  .strict();
export type KnowledgeItem = z.infer<typeof knowledgeItemSchema>;

export const knowledgeSnapshotSchema = z
  .object({
    version: z.number().int().min(0).max(1_000_000),
    publishedAt: z.string().datetime(),
    items: z.array(knowledgeItemSchema).max(2_000),
    settings: solverSettingsSchema,
  })
  .strict();
export type KnowledgeSnapshot = z.infer<typeof knowledgeSnapshotSchema>;
