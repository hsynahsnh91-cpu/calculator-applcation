import {
  approvedSolutionSchema,
  type ApprovedSolution,
  type KnowledgeItem,
} from "../../admin/types.js";
import { canonicalizeQuestion } from "../../admin/normalization.js";
import type { SolverAnswer } from "../solver/types.js";

/**
 * Convert only an actual unified-engine answer into the persistence schema.
 * A missing result stays undefined and therefore blocks an approval/regression.
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
 * This intentionally accepts only an exact safe-normalized final answer.
 * Potentially equivalent but differently written mathematics requires review;
 * it must not create a false regression pass.
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
