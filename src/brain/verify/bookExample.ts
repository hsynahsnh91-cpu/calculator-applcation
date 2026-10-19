import { approvedSolutionFromAnswer, approvedSolutionsMatch } from "../../core/knowledge/regression";
import type { ApprovedSolution } from "../../admin/types";
import type { SolverAnswer } from "../../core/solver/types";
import type { VerificationEvidence } from "../semantic/statement";

export interface BookExampleComparison {
  evidence: VerificationEvidence;
  firstDifferentStep?: number;
}

/** Compares a real unified-engine result with the solution visibly stored from a book. */
export function verifyBookExample(
  answer: SolverAnswer,
  expected: ApprovedSolution | undefined,
): BookExampleComparison {
  const actual = approvedSolutionFromAnswer(answer);
  const passed = Boolean(
    actual?.verification?.passed && expected && approvedSolutionsMatch(actual, expected),
  );
  let firstDifferentStep: number | undefined;
  if (!passed && expected) {
    const maximum = Math.max(actual?.steps.length ?? 0, expected.steps.length);
    for (let index = 0; index < maximum; index++) {
      const actualStep = actual?.steps[index];
      const expectedStep = expected.steps[index];
      if (
        !actualStep ||
        !expectedStep ||
        actualStep.latex !== expectedStep.latex ||
        actualStep.text !== expectedStep.text
      ) {
        firstDifferentStep = index + 1;
        break;
      }
    }
  }
  return {
    ...(firstDifferentStep ? { firstDifferentStep } : {}),
    evidence: {
      type: "book_example_match",
      method: "تشغيل solvePrompt/المحرك الموحد ومقارنة الجواب النهائي مع حل الكتاب المحافظ",
      passed,
      createdAt: new Date().toISOString(),
      detail: passed
        ? "الجواب المتحقق من المحرك يطابق حل الكتاب."
        : expected
          ? `اختلف الحل${firstDifferentStep ? ` بدءًا من الخطوة ${firstDifferentStep}` : " في الجواب النهائي"}.`
          : "لا يوجد حل كتاب صالح للمقارنة.",
    },
  };
}
