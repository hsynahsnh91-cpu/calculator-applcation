import {
  canonicalizeQuestion,
  questionFingerprint,
  questionSimilarity,
} from "../../admin/normalization";
import type { KnowledgeItem, KnowledgeSnapshot } from "../../admin/types";
import {
  emptyContext,
  type KnowledgeRuleContext,
  type SolverAnswer,
  type SolverResult,
} from "../solver/types";

export interface KnowledgeMatch {
  item: KnowledgeItem;
  score: number;
  exact: boolean;
}

function latexText(value: string): string {
  return `\\text{${value
    .replace(/[{}\\]/g, " ")
    .replace(/[%#$&_~^]/g, " ")
    .slice(0, 1_000)}}`;
}

function solutionResult(item: KnowledgeItem): SolverResult {
  const solution = item.approvedSolution!;
  return {
    id: `approved-${item.id}`,
    engine: "mathEngine",
    engines: ["mathEngine"],
    mode: "reference",
    title: "حل معتمد من المنهاج",
    finalLatex:
      solution.answerLatex ||
      (solution.answerText ? latexText(solution.answerText) : "\\text{حل معتمد}"),
    steps: solution.steps.map((step, index) => ({
      title: step.title || `الخطوة ${index + 1}`,
      text: step.text,
      latex: step.latex || (step.text ? latexText(step.text) : "\\text{—}"),
    })),
    visuals: [],
    verification: solution.verification ?? {
      passed: false,
      method:
        "هذا حل اعتمده المدير؛ لم تُعرض شارة تحقق لأن تصحيحه العددي لم يُسجّل مع هذا العنصر.",
    },
    note:
      solution.answerText && !solution.answerLatex ? solution.answerText : undefined,
  };
}

function matchable(item: KnowledgeItem): boolean {
  return (
    item.status === "published" &&
    Boolean(item.approvedSolution) &&
    (item.type === "correction" || item.type === "exercise" || item.type === "example")
  );
}

/** Corrections always win when score and source are otherwise equal. */
export function findApprovedKnowledge(
  question: string,
  snapshot: KnowledgeSnapshot | null,
  threshold: number,
): KnowledgeMatch | undefined {
  if (!snapshot) return undefined;
  const canonical = canonicalizeQuestion(question);
  if (!canonical) return undefined;
  const fingerprint = questionFingerprint(canonical);
  const candidates = snapshot.items
    .filter(matchable)
    .map((item) => {
      const exact = item.fingerprint === fingerprint && item.canonicalQuestion === canonical;
      return {
        item,
        exact,
        score: exact ? 1 : questionSimilarity(canonical, item.canonicalQuestion),
      };
    })
    .filter((candidate) => candidate.score >= threshold)
    .sort((first, second) => {
      if (first.item.type === "correction" && second.item.type !== "correction") return -1;
      if (second.item.type === "correction" && first.item.type !== "correction") return 1;
      return second.score - first.score;
    });
  return candidates[0];
}

export function findRelatedRules(
  question: string,
  snapshot: KnowledgeSnapshot | null,
  matched?: KnowledgeMatch,
): KnowledgeRuleContext[] {
  if (!snapshot) return [];
  const canonical = canonicalizeQuestion(question);
  const directlyLinked = new Set(matched?.item.relatedRuleIds ?? []);
  return snapshot.items
    .filter((item) => item.status === "published" && item.type === "rule")
    .map((item) => ({
      item,
      score: directlyLinked.has(item.id)
        ? 1
        : questionSimilarity(canonical, canonicalizeQuestion(`${item.originalText} ${item.structured}`)),
    }))
    .filter((candidate) => candidate.score >= 0.34)
    .sort((first, second) => second.score - first.score)
    .slice(0, 5)
    .map(({ item, score }) => ({
      id: item.id,
      text: item.structured || item.originalText,
      latex: item.latex || undefined,
      confidence: score,
    }));
}

export function approvedKnowledgeAnswer(
  question: string,
  match: KnowledgeMatch,
  relatedRules: KnowledgeRuleContext[],
): SolverAnswer {
  return {
    id: `approved-${Date.now()}-${match.item.id.slice(-8)}`,
    question,
    intro: "وُجد حل معتمد مطابق في المكتبة المعرفية؛ لذلك عُرض قبل تشغيل المحركات.",
    results: [solutionResult(match.item)],
    unsolved: [],
    suggestions: [],
    candidates: [],
    context: emptyContext(),
    elapsedMs: 0,
    knowledge: {
      source: "approved",
      itemId: match.item.id,
      matchScore: match.score,
      relatedRules,
    },
  };
}
