import { parsePrompt } from "./parser";
import { routePrompt, selectEngines } from "./router";
import { clarificationChoices, composeAnswer } from "./composer";
import {
  ClarificationError,
  type Candidate,
  type SolveOptions,
  type SolverAnswer,
  type SolverProgress,
  type SolverResult,
  type UnsolvedPart,
} from "./types";

/** Independent requests run together; successive groups consume the previous context patch. */
export async function solvePrompt(
  question: string,
  options: SolveOptions,
  progress?: (value: SolverProgress) => void,
): Promise<SolverAnswer> {
  const started = performance.now();
  const parsed = parsePrompt(question, options.context);
  let context = parsed.context;
  const results: SolverResult[] = [],
    unsolved: UnsolvedPart[] = [],
    candidates: Candidate[] = [];
  if (!parsed.text || parsed.text.length > 7000 || question.length > 7000)
    return composeAnswer(
      question,
      [],
      [
        {
          request: question,
          message:
            "اكتب مسألة واضحة بطول لا يتجاوز 7000 محرف، أو قسّمها إلى طلبات أصغر.",
          choices: [],
        },
      ],
      [],
      context,
      performance.now() - started,
    );
  progress?.({ stage: "analyzing", engines: [] });
  const { runEngine } = await import("./runners");
  for (let request of parsed.requests.slice(0, 12)) {
    context = parsePrompt(request, context).context;
    if (
      /^(?:(?:لتكن|ضع|حيث)\s*)?[a-dkmpqrt]\s*=\s*-?\d+(?:\.\d+)?$/.test(request)
    )
      continue;
    if (
      /^(?:لتكن|لتعرف|الدالة)/.test(request) &&
      /[fgh]\(x\)=/.test(request) &&
      !/(?:مشتق|تكامل|نهاية|ارسم|ادرس|تغيرات)/.test(request)
    )
      continue;
    if (/اشرح.*خطوات|تفصيل اكثر/.test(request) && context.lastPrompt)
      request = context.lastPrompt;
    const ranked = routePrompt(request, context);
    const selected = selectEngines(ranked, request);
    for (const candidate of ranked) {
      const existing = candidates.find(
        (value) => value.engine === candidate.engine,
      );
      if (!existing) candidates.push(candidate);
      else
        existing.confidence = Math.max(
          existing.confidence,
          candidate.confidence,
        );
    }
    if (!selected.length) {
      unsolved.push({
        request,
        message:
          "هل تريد حساب قيمة، أم حل معادلة، أم دراسة دالة؟ لا توجد معطيات كافية لاختيار حل موثوق.",
        choices: clarificationChoices(ranked),
      });
      continue;
    }
    progress?.({ stage: "running", engines: selected, results: [...results] });
    const completed: SolverResult[] = [];
    const group = await Promise.allSettled(
      selected.map(async (engine) => {
        const value = await runEngine(
          engine,
          request,
          context,
          options.angleMode,
        );
        completed.push(value);
        progress?.({
          stage: "verifying",
          engines: value.engines,
          results: [...results, ...completed],
        });
        return value;
      }),
    );
    for (let index = 0; index < group.length; index++) {
      const value = group[index];
      if (value.status === "fulfilled") {
        results.push(value.value);
        context = {
          ...context,
          ...value.value.contextPatch,
          assignments: {
            ...context.assignments,
            ...value.value.contextPatch?.assignments,
          },
          lastEngine: value.value.engine,
          lastPrompt: request,
        };
      } else {
        const error: unknown = value.reason;
        const message =
          error instanceof Error && /[\u0600-\u06ff]/.test(error.message)
            ? error.message
            : "تعذّر إكمال هذا الجزء بهذه الصيغة. تحقق من المعطيات ومجال التعريف.";
        unsolved.push({
          request,
          engine: selected[index],
          message,
          choices:
            error instanceof ClarificationError && error.choices.length
              ? error.choices
              : clarificationChoices(ranked),
        });
        if (!results.length)
          context = {
            ...context,
            lastEngine: selected[index],
            lastPrompt: request,
          };
      }
    }
  }
  if (!results.length && !unsolved.length)
    unsolved.push({
      request: question,
      message: "حُفظت المعطيات في سياق هذه المحادثة. ما المطلوب حسابه؟",
      choices: context.expression
        ? ["جد مشتقة الدالة", "ارسم المنحنى", "أوجد الدالة الأصلية للدالة"]
        : [],
    });
  if (parsed.requests.length > 12)
    unsolved.push({
      request: "الطلبات المتبقية",
      message: "قُرئت أول 12 فقرة. أرسل بقية الطلبات في رسالة جديدة.",
      choices: [],
    });
  return composeAnswer(
    question,
    results,
    unsolved,
    candidates.sort((a, b) => b.confidence - a.confidence),
    context,
    performance.now() - started,
  );
}
