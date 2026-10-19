import { canonicalizeQuestion } from "../../admin/normalization.js";
import type { AngleMode } from "../../types/index.js";
import { solveLocally } from "../solver/client.js";
import type { EngineId } from "../solver/types.js";
import { replaceOneCoefficient } from "./practiceText.js";
import { approvedSolutionFromAnswer, approvedSolutionsMatch } from "./regression.js";

export {
  isApprovedPracticeItem,
  isPublishedPracticeItem,
  replaceOneCoefficient,
} from "./practiceText.js";

export interface PracticeSolveOptions {
  angleMode: AngleMode;
  disabledEngines?: EngineId[];
  timeoutMs?: number;
}

export type PracticeVariantResult =
  | { ok: true; question: string; expectedLatex: string }
  | { ok: false; error: string };

/**
 * A practice task is shown only after the unified local solver verifies a new
 * answer. Unverified variants are never offered to the student.
 */
export async function createVerifiedPracticeVariant(
  sourceText: string,
  options: PracticeSolveOptions,
): Promise<PracticeVariantResult> {
  const question = replaceOneCoefficient(sourceText);
  if (!question)
    return {
      ok: false,
      error: "لا يحتوي هذا المثال على معامل عددي آمن لتغييره تلقائيًا. اختر مثالًا آخر.",
    };
  try {
    const result = await solveLocally(
      question,
      {
        angleMode: options.angleMode,
        disabledEngines: options.disabledEngines,
        timeoutMs: options.timeoutMs,
      },
      () => undefined,
    );
    const expected = approvedSolutionFromAnswer(result);
    if (!expected?.verification?.passed || !expected.answerLatex)
      return {
        ok: false,
        error: "لم يتحقق المحرك من جواب التمرين المتغير، لذلك لم يُعرض.",
      };
    return { ok: true, question, expectedLatex: expected.answerLatex };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "تعذر إنشاء تمرين متحقق.",
    };
  }
}

export async function checkPracticeAnswer(
  studentAnswer: string,
  expectedLatex: string,
  options: PracticeSolveOptions,
): Promise<{ matched: boolean; error?: string }> {
  const trimmed = studentAnswer.trim();
  if (!trimmed) return { matched: false, error: "اكتب إجابة أولًا." };
  if (canonicalizeQuestion(trimmed) === canonicalizeQuestion(expectedLatex))
    return { matched: true };
  try {
    const studentRun = await solveLocally(
      trimmed,
      {
        angleMode: options.angleMode,
        disabledEngines: options.disabledEngines,
        timeoutMs: options.timeoutMs,
      },
      () => undefined,
    );
    const actual = approvedSolutionFromAnswer(studentRun);
    const matched = Boolean(
      actual?.verification?.passed &&
        approvedSolutionsMatch(actual, { answerLatex: expectedLatex, steps: [] }),
    );
    return { matched };
  } catch (error) {
    return {
      matched: false,
      error: error instanceof Error ? error.message : "تعذر التحقق من إجابتك.",
    };
  }
}
