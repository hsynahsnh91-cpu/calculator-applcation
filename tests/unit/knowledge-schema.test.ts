import { describe, expect, it } from "vitest";
import { defaultSolverSettings, knowledgeItemSchema, solverSettingsSchema } from "../../src/shared";

const sample = {
  id: "item-0001",
  type: "example" as const,
  originalText: "جد نهاية (4x-5)/(2x+3) عندما x تؤول إلى +∞",
  structured: "lim x->inf (4x-5)/(2x+3)",
  latex: "\\lim_{x \\to +\\infty} \\frac{4x-5}{2x+3}",
  grade: "الثالث الثانوي العلمي",
  unit: "النهايات والاستمرار",
  lesson: "نهاية تابع كسري عند اللانهاية",
  source: "كتاب الطالب",
  fileName: "unit-2.pdf",
  page: 27,
  status: "draft" as const,
  confidence: 0.9,
  needsReview: true,
  createdAt: "2026-10-19T00:00:00.000Z",
  updatedAt: "2026-10-19T00:00:00.000Z",
  version: 0,
  canonicalQuestion: "جد نهاية (4x-5)/(2x+3) عندما x تؤول إلى +∞",
  fingerprint: "lim-4x-5-2x-3",
  approvedSolution: {
    answerText: "2",
    answerLatex: "2",
    steps: [{ title: "إخراج الحد المسيطر", latex: "\\frac{4}{2}" }],
  },
};

describe("knowledgeItemSchema", () => {
  it("accepts a current-field knowledge item", () => {
    const parsed = knowledgeItemSchema.parse(sample);
    expect(parsed.relatedRuleIds).toEqual([]);
    expect(parsed.comparison).toBe("not_compared");
    expect(parsed.approvedSolution?.steps).toHaveLength(1);
  });

  it("rejects an empty id", () => {
    const result = knowledgeItemSchema.safeParse({ ...sample, id: "short" });
    expect(result.success).toBe(false);
  });

  it("rejects a solution with neither answer nor steps", () => {
    const result = knowledgeItemSchema.safeParse({
      ...sample,
      approvedSolution: { steps: [] },
    });
    expect(result.success).toBe(false);
  });
});

describe("solverSettingsSchema", () => {
  it("uses the documented defaults", () => {
    expect(solverSettingsSchema.parse({})).toEqual(defaultSolverSettings);
  });

  it("rejects a match threshold below 0.85", () => {
    const result = solverSettingsSchema.safeParse({ matchThreshold: 0.5 });
    expect(result.success).toBe(false);
  });
});
