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

/**
 * Execute the same orchestrator used by the calculator in the server function.
 * This is intentionally sequential: each case receives a fresh context and a
 * slow/failing case cannot contaminate or hide a later case.
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
      const answer = await solvePrompt(
        item.structured || item.originalText,
        {
          angleMode: "DEG",
          context: emptyContext(),
          disabledEngines: settings.disabledEngines,
          timeoutMs: settings.timeoutMs,
        },
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
