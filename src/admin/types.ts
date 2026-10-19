import { z } from "zod";
import {
  learningLogEntrySchema,
  learningSourceSchema,
  mathematicalStatementSchema,
  understandingLevelSchema,
  verificationEvidenceSchema,
} from "../brain/semantic/statement.js";
import { knowledgeRelationSchema } from "../brain/semantic/relations.js";
import type { EngineId } from "../solver/types.js";

/**
 * The admin and API layers share these schemas.  Data is always parsed before
 * it is saved locally, sent to Redis, or displayed as published knowledge.
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

export const analysisClassificationSchema = z.enum([
  "rule",
  "definition",
  "solved_example",
  "exercise",
]);
export type AnalysisClassification = z.infer<typeof analysisClassificationSchema>;

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
    /** Optional semantic data defaults safely when reading old published versions. */
    mathematicalStatement: mathematicalStatementSchema.optional(),
    relations: z.array(knowledgeRelationSchema).max(80).default([]),
    understanding: understandingLevelSchema.default("not_understood"),
    evidence: z.array(verificationEvidenceSchema).max(40).default([]),
    learningLog: z.array(learningLogEntrySchema).max(80).default([]),
    learningSource: learningSourceSchema.optional(),
    approvedSolution: approvedSolutionSchema.optional(),
    bookSolution: approvedSolutionSchema.optional(),
    comparison: z.enum(["matching", "needs_review", "not_compared"]).default("not_compared"),
    negativeExample: negativeExampleSchema.optional(),
    errorAnalysis: errorAnalysisSchema.optional(),
  })
  .strict();
export type KnowledgeItem = z.infer<typeof knowledgeItemSchema>;

export const engineIdSchema = z.enum([
  "mathEngine",
  "equationSolver",
  "sequences",
  "calculusEngine",
  "limitsEngine",
  "integrationEngine",
  "geometryEngine",
  "geometryTools",
  "matricesEngine",
  "probabilityEngine",
  "probabilityTools",
  "complexEngine",
  "complexTools",
]);

export const solverSettingsSchema = z
  .object({
    disabledEngines: z.array(engineIdSchema).max(30).default([]),
    matchThreshold: z.number().finite().min(0.85).max(0.999).default(0.96),
    timeoutMs: z.number().int().min(2_000).max(60_000).default(15_000),
  })
  .strict();
export type SolverSettings = z.infer<typeof solverSettingsSchema>;

export const defaultSolverSettings: SolverSettings = {
  disabledEngines: [],
  matchThreshold: 0.96,
  timeoutMs: 15_000,
};

export const knowledgeSnapshotSchema = z
  .object({
    version: z.number().int().min(0).max(1_000_000),
    publishedAt: z.string().datetime(),
    items: z.array(knowledgeItemSchema).max(2_000),
    settings: solverSettingsSchema,
  })
  .strict();
export type KnowledgeSnapshot = z.infer<typeof knowledgeSnapshotSchema>;

export const analysisBlockSchema = z
  .object({
    classification: analysisClassificationSchema,
    originalText: z.string().trim().min(1).max(20_000),
    structured: z.string().trim().max(20_000),
    latex: z.string().trim().max(20_000),
    grade: z.string().trim().min(1).max(120).default("غير محدد"),
    unit: z.string().trim().min(1).max(180).default("غير محددة"),
    lesson: z.string().trim().min(1).max(240).default("غير محدد"),
    page: z.number().int().min(1).max(20_000).default(1),
    confidence: z.number().finite().min(0).max(1),
    needs_review: z.boolean(),
    linked_rule_text: z.string().trim().max(8_000).optional(),
    book_solution: approvedSolutionSchema.optional(),
  })
  .strict();
export type AnalysisBlock = z.infer<typeof analysisBlockSchema>;

export const analysisResponseSchema = z
  .object({
    mode: z.enum(["ai", "pattern"]),
    blocks: z.array(analysisBlockSchema).min(1).max(120),
    warnings: z.array(z.string().trim().min(1).max(1_000)).max(20).default([]),
  })
  .strict();
export type AnalysisResponse = z.infer<typeof analysisResponseSchema>;

export const analyzeRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(120_000),
    source: z.string().trim().min(1).max(500),
    pageHints: z.array(z.number().int().min(1).max(20_000)).max(2_000).default([]),
    // Administrative context travels with a document chunk. It is not an
    // instruction channel and never bypasses the server-side schema.
    attachmentMessage: z.string().trim().max(12_000).default(""),
  })
  .strict();
export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;

export const adminChatMessageRoleSchema = z.enum(["user", "assistant"]);
export type AdminChatMessageRole = z.infer<typeof adminChatMessageRoleSchema>;

/** Browser-provided history deliberately excludes tool messages and credentials. */
export const adminChatMessageSchema = z
  .object({
    id: z.string().trim().min(8).max(160),
    role: adminChatMessageRoleSchema,
    content: z.string().trim().min(1).max(16_000),
    createdAt: z.string().datetime(),
  })
  .strict();
export type AdminChatMessage = z.infer<typeof adminChatMessageSchema>;

export const adminChatContextSchema = z
  .object({
    selectedText: z.string().trim().max(24_000).optional(),
    sourceName: z.string().trim().max(500).optional(),
    page: z.number().int().min(1).max(20_000).optional(),
  })
  .strict();
export type AdminChatContext = z.infer<typeof adminChatContextSchema>;

export const adminChatToolNameSchema = z.enum([
  "parse_latex",
  "convert_latex",
  "verify_symbolic",
  "verify_numeric",
  "solve_with_engine",
]);
export type AdminChatToolName = z.infer<typeof adminChatToolNameSchema>;

export const adminChatToolCallSchema = z
  .object({
    id: z.string().trim().min(1).max(160),
    name: adminChatToolNameSchema,
    input: z.record(z.string().trim().max(120), z.unknown()),
  })
  .strict();
export type AdminChatToolCall = z.infer<typeof adminChatToolCallSchema>;

export const adminChatToolResultSchema = z
  .object({
    callId: z.string().trim().min(1).max(160),
    name: adminChatToolNameSchema,
    ok: z.boolean(),
    output: z.unknown(),
  })
  .strict();
export type AdminChatToolResult = z.infer<typeof adminChatToolResultSchema>;

export const adminChatRequestSchema = z
  .object({
    sessionId: z.string().trim().min(8).max(160),
    messages: z.array(adminChatMessageSchema).min(1).max(40),
    context: adminChatContextSchema.optional(),
    /** Both browser and server cap the assistant's tool loop at four rounds. */
    maxToolRounds: z.number().int().min(1).max(4).default(4),
    /** Browser-persisted counter; the server refuses a fourth clarification loop. */
    clarificationRounds: z.number().int().min(0).max(3).default(0),
  })
  .strict()
  .refine(
    (value) => value.messages.some((message) => message.role === "user"),
    "يجب أن تحتوي المحادثة على رسالة مدير واحدة على الأقل.",
  )
  .refine(
    (value) => value.messages.reduce((total, message) => total + message.content.length, 0) <= 60_000,
    "سجل المحادثة أكبر من الحد الآمن للإرسال.",
  );
export type AdminChatRequest = z.infer<typeof adminChatRequestSchema>;

export const adminChatResponseSchema = z
  .object({
    mode: z.enum(["ai", "local"]),
    message: z.string().trim().min(1).max(20_000),
    toolCalls: z.array(adminChatToolCallSchema).max(16).default([]),
    toolResults: z.array(adminChatToolResultSchema).max(16).default([]),
    toolRounds: z.number().int().min(0).max(4),
    clarificationRounds: z.number().int().min(0).max(3).default(0),
    waitingForClarification: z.boolean().default(false),
    warnings: z.array(z.string().trim().min(1).max(1_000)).max(20).default([]),
  })
  .strict();
export type AdminChatResponse = z.infer<typeof adminChatResponseSchema>;

export const regressionOutcomeSchema = z
  .object({
    itemId: z.string().trim().min(1).max(160),
    passed: z.boolean(),
    message: z.string().trim().min(1).max(2_000),
    elapsedMs: z.number().finite().min(0).max(300_000),
  })
  .strict();
export type RegressionOutcome = z.infer<typeof regressionOutcomeSchema>;

export const publishRequestSchema = z
  .object({
    items: z.array(knowledgeItemSchema).max(2_000),
    settings: solverSettingsSchema,
    /** Fresh outcomes from the mandatory comprehensive regression run. */
    regression: z.array(regressionOutcomeSchema).max(2_000),
  })
  .strict();
export type PublishRequest = z.infer<typeof publishRequestSchema>;

export const failureRecordSchema = z
  .object({
    fingerprint: z.string().trim().min(6).max(160),
    canonicalQuestion: z.string().trim().min(1).max(30_000),
    sampleQuestion: z.string().trim().min(1).max(7_000),
    count: z.number().int().min(1).max(1_000_000),
    lastSeenAt: z.string().datetime(),
    reason: z.string().trim().min(1).max(1_500),
  })
  .strict();
export type FailureRecord = z.infer<typeof failureRecordSchema>;

export const publicFailureRequestSchema = z
  .object({
    question: z.string().trim().min(1).max(7_000),
    reason: z.string().trim().min(1).max(1_500),
  })
  .strict();

export const versionSummarySchema = z
  .object({
    version: z.number().int().min(0).max(1_000_000),
    publishedAt: z.string().datetime(),
    itemCount: z.number().int().min(0).max(2_000),
  })
  .strict();
export type VersionSummary = z.infer<typeof versionSummarySchema>;

export function isEngineId(value: string): value is EngineId {
  return engineIdSchema.safeParse(value).success;
}
