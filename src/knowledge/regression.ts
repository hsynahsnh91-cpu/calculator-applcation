import {
  approvedSolutionSchema,
  type ApprovedSolution,
  type KnowledgeItem,
} from "../admin/types";
import { canonicalizeQuestion } from "../admin/normalization";
import type { SolverAnswer } from "../solver/types";

/**
 * Convert only an actual unified-engine answer into the stored solution shape.
 * A missing result remains undefined: callers must treat it as a failed test.
 */
export function approvedSolutionFromAnswer(
  answer: SolverAnswer,
): ApprovedSolution | undefined {
  if (!answer.results.length) return undefined;
  const primary = answer.results[0];
  const parsed = approvedSolutionSchema.safeParse({
    answerText: primary.note || undefined,
    answerLatex: primary.finalLatex,
    steps: answer.results.flatMap((result) =>
      result.steps.map((step) => ({
        title: step.title,
        ...(step.text ? { text: step.text } : {}),
        latex: step.latex,
      })),
    ),
    verification: {
      passed: primary.verification.passed,
      method: primary.verification.method,
    },
    elapsedMs: answer.elapsedMs,
  });
  return parsed.success ? parsed.data : undefined;
}

function solutionKey(solution: ApprovedSolution | undefined): string {
  if (!solution) return "";
  return canonicalizeQuestion(solution.answerLatex || solution.answerText || "");
}

/**
 * Regression comparison is intentionally exact after safe normalization. An
 * apparently equivalent but differently expressed result is a review item,
 * never an automatically accepted regression pass.
 */
export function approvedSolutionsMatch(
  actual: ApprovedSolution | undefined,
  expected: ApprovedSolution | undefined,
): boolean {
  const actualKey = solutionKey(actual);
  const expectedKey = solutionKey(expected);
  return Boolean(actualKey && expectedKey && actualKey === expectedKey);
}

export function isRegressionKnowledgeItem(item: Pick<KnowledgeItem, "type">): boolean {
  return ["example", "exercise", "correction"].includes(item.type);
}
