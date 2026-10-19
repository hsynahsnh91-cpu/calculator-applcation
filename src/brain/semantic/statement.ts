import { z } from "zod";
import { knowledgeRelationSchema } from "./relations";
import { symbolDomainSchema } from "./domains";

export const mathematicalStatementKindSchema = z.enum([
  "definition",
  "theorem",
  "rule",
  "identity",
  "procedure",
  "example",
  "exercise",
]);
export type MathematicalStatementKind = z.infer<typeof mathematicalStatementKindSchema>;

export const procedureStepSchema = z
  .object({
    order: z.number().int().min(1).max(100),
    latex: z.string().trim().min(1).max(8_000),
    conditionLatex: z.string().trim().max(4_000).optional(),
    explanation: z.string().trim().max(3_000).optional(),
  })
  .strict();

export const mathematicalStatementSchema = z
  .object({
    kind: mathematicalStatementKindSchema,
    symbols: z.array(symbolDomainSchema).max(60).default([]),
    assumptionsLatex: z.array(z.string().trim().min(1).max(8_000)).max(40).default([]),
    conclusionLatex: z.string().trim().max(12_000).optional(),
    validityScopeLatex: z.string().trim().max(8_000).optional(),
    procedure: z.array(procedureStepSchema).max(40).default([]),
    dependsOnDiagram: z.boolean().default(false),
    unresolvedQuote: z.string().trim().max(8_000).optional(),
  })
  .strict();
export type MathematicalStatement = z.infer<typeof mathematicalStatementSchema>;

export const understandingLevelSchema = z.enum([
  "verified_understood",
  "understood_unverified",
  "partial",
  "not_understood",
]);
export type UnderstandingLevel = z.infer<typeof understandingLevelSchema>;

export const verificationEvidenceTypeSchema = z.enum([
  "symbolic_equal",
  "numeric_evidence",
  "book_example_match",
  "engine_agreement",
  "not_automatically_testable",
]);
export type VerificationEvidenceType = z.infer<typeof verificationEvidenceTypeSchema>;

export const verificationEvidenceSchema = z
  .object({
    type: verificationEvidenceTypeSchema,
    method: z.string().trim().min(1).max(1_000),
    passed: z.boolean(),
    createdAt: z.string().datetime(),
    samples: z.number().int().min(0).max(10_000).optional(),
    seed: z.string().trim().max(160).optional(),
    tolerance: z.number().finite().min(0).max(1).optional(),
    maxError: z.number().finite().min(0).max(1_000_000).optional(),
    counterexample: z
      .record(z.string().trim().max(80), z.number().finite().min(-1_000_000).max(1_000_000))
      .optional(),
    detail: z.string().trim().max(4_000).optional(),
  })
  .strict();
export type VerificationEvidence = z.infer<typeof verificationEvidenceSchema>;

export const learningSourceSchema = z
  .object({
    kind: z.enum(["scan", "teaching", "manual", "correction"]),
    /** Local-only opaque pointers; publication strips them rather than chat text. */
    messageId: z.string().trim().min(1).max(160).optional(),
    sessionId: z.string().trim().min(1).max(160).optional(),
  })
  .strict();
export type LearningSource = z.infer<typeof learningSourceSchema>;

/** A distilled audit trail. It cannot carry raw chat/OCR/tool payloads. */
export const learningLogEntrySchema = z
  .object({
    kind: z.enum(["draft_created", "source_linked", "evidence_attached", "relation_added", "manager_reviewed"]),
    createdAt: z.string().datetime(),
    summary: z.string().trim().min(1).max(600),
    evidenceTypes: z.array(verificationEvidenceTypeSchema).max(8).default([]),
  })
  .strict();
export type LearningLogEntry = z.infer<typeof learningLogEntrySchema>;

/** Re-exported here so KnowledgeItem can keep a single semantic contract. */
export const knowledgeSemanticFieldsSchema = z
  .object({
    mathematicalStatement: mathematicalStatementSchema.optional(),
    relations: z.array(knowledgeRelationSchema).max(80).default([]),
    understanding: understandingLevelSchema.default("not_understood"),
    evidence: z.array(verificationEvidenceSchema).max(40).default([]),
    learningLog: z.array(learningLogEntrySchema).max(80).default([]),
    learningSource: learningSourceSchema.optional(),
  })
  .strict();

export function understandingFromEvidence(
  current: UnderstandingLevel,
  evidence: VerificationEvidence[],
): UnderstandingLevel {
  if (evidence.some((entry) => entry.passed && entry.type !== "not_automatically_testable"))
    return "verified_understood";
  if (current === "verified_understood") return "understood_unverified";
  return current;
}
