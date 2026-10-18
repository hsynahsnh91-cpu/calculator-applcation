import {
  type KnowledgeItem,
  type RegressionOutcome,
  type SolverSettings,
} from "../../src/admin/types";
import {
  approvedSolutionFromAnswer,
  approvedSolutionsMatch,
  isRegressionKnowledgeItem,
} from "../../src/knowledge/regression";
import { solvePrompt } from "../../src/solver/orchestrator";
import { emptyContext } from "../../src/solver/types";

type RegressionCandidate = Pick<
  KnowledgeItem,
  "id" | "type" | "approvedSolution" | "originalText" | "structured" | "unit" | "lesson"
>;

class RegressionTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`انتهت مهلة الاختبار الخادمي (${Math.ceil(timeoutMs / 1000)} ثوانٍ) قبل اكتمال المحرك.`);
    this.name = "RegressionTimeoutError";
  }
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RegressionTimeoutError(timeoutMs)), timeoutMs);
  });
  return Promise.race([work, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/**
 * Run the same unified orchestrator used by the calculator. Cases are
 * sequential and receive a clean context so no result can leak to another.
 */
export async function runServerRegression(
  items: RegressionCandidate[],
  settings: SolverSettings,
): Promise<RegressionOutcome[]> {
  const outcomes: RegressionOutcome[] = [];
  for (const item of items.filter(isRegressionKnowledgeItem)) {
    const started = Date.now();
    if (!item.approvedSolution) {
      outcomes.push({
        itemId: item.id,
        passed: false,
        elapsedMs: 0,
        message: "العنصر المعتمد لا يحمل حلًا معتمدًا صالحًا للمقارنة.",
      });
      continue;
    }
    try {
      const answer = await withTimeout(
        solvePrompt(
          item.structured || item.originalText,
          {
            angleMode: "DEG",
            context: emptyContext(),
            disabledEngines: settings.disabledEngines,
            timeoutMs: settings.timeoutMs,
          },
        ),
        settings.timeoutMs,
      );
      const actual = approvedSolutionFromAnswer(answer);
      const passed = approvedSolutionsMatch(actual, item.approvedSolution);
      outcomes.push({
        itemId: item.id,
        passed,
        elapsedMs: Date.now() - started,
        message: passed
          ? `نجح: ${item.unit} — ${item.lesson}`
          : "اختلفت نتيجة المحرك الخادمي أو صيغتها عن الحل المعتمد.",
      });
    } catch (error) {
      outcomes.push({
        itemId: item.id,
        passed: false,
        elapsedMs: Date.now() - started,
        message:
          error instanceof Error
            ? error.message
            : "تعذر تشغيل المحرك الموحد على هذا المثال.",
      });
    }
  }
  return outcomes;
}
