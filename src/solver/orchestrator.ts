import { isSpaceIntent } from "./spaceNotation";
import { splitSpaceDemands } from "./spaceDemands";
import {
  prepareSchoolContext,
  runSchoolProbability,
  schoolUnimplemented,
  partInfo,
} from "./schoolRuntime";
import {
  matrixDefinitionOnly,
  extractMatrixRequest,
  matrixIntent,
  splitMatrixDemands,
} from "./extractors/matrices";
import { schoolIntent } from "./schoolDocument";
import type { SchoolPart } from "./schoolTypes";
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

/** Preserve valid system givens on method failure, never its stale numerical solution. */
function matrixFailureContext(
  request: string,
  context: import("./types").SolverContext,
): import("./types").SolverContext {
  const systemRequest = /غاوس|جاوس|كرامر|كريمر/.test(request);
  let matrices = context.matrices
    ? { ...context.matrices, lastScalar: undefined }
    : undefined;
  if (systemRequest) {
    try {
      const parsed = extractMatrixRequest(request, context);
      if (parsed.operations.some((op) => op === "gauss" || op === "cramer"))
        matrices = { ...parsed.context, lastScalar: undefined };
    } catch {
      if (matrices) matrices = { ...matrices, system: undefined };
    }
  }
  return {
    ...context,
    matrices,
    solutions: systemRequest ? undefined : context.solutions,
  };
}
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
  try {
    context = await prepareSchoolContext(parsed.preamble || "", context);
  } catch (error) {
    if (
      /غاوس|جاوس|كرامر|كريمر/.test(question) &&
      matrixIntent(question, context)
    )
      context = matrixFailureContext(question, context);
    if (context.geometry && isSpaceIntent(parsed.preamble || question, context))
      context = {
        ...context,
        geometry: {
          ...context.geometry,
          lastScalar: undefined,
          lastScalarExpression: undefined,
        },
      };
    return composeAnswer(
      question,
      [],
      [
        {
          request: question,
          message:
            error instanceof Error && /[\u0600-\u06ff]/.test(error.message)
              ? error.message
              : "تعذّر قراءة التعريف الرياضي؛ هل يمكنك إكمال العبارة والأقواس؟",
          choices: [],
        },
      ],
      [],
      context,
      performance.now() - started,
    );
  }
  const parts: SchoolPart[] =
    parsed.parts ||
    parsed.requests.map((text) => ({
      text,
      title: text,
      label: "",
      intent: schoolIntent(text),
      setup: false,
      depends:
        /استنتج|النتيجة السابقة|الطلب السابق|الجملة السابقة|المصفوفة السابقة|الارتفاع السابق|البعد السابق/.test(
          text,
        ),
    }));
  const orderedParts = parts.flatMap((part) => {
    const demands = part.setup
      ? [part.text]
      : splitMatrixDemands(part.text).flatMap(splitSpaceDemands);
    return demands.length === 1
      ? [part]
      : demands.map((text, i) => ({
          ...part,
          text,
          title: text.slice(0, 1000),
          intent: schoolIntent(text),
          depends: i === 0 ? part.depends : false,
        }));
  });
  let previousFailed = false,
    demands = 0;
  for (const [partIndex, part] of orderedParts.entries()) {
    if (!part.setup && ++demands > 12) break;
    let request = part.text;
    const info = partInfo(part);
    if (part.depends && previousFailed) {
      unsolved.push({
        request,
        school: info,
        message:
          "يعتمد هذا الطلب على نتيجة لم تكتمل؛ أكمل معطيات الطلب السابق أولًا.",
        choices: [],
      });
      continue;
    }
    try {
      context = parsePrompt(request, context).context;
      context = await prepareSchoolContext(request, context);
      schoolUnimplemented(request, context);
    } catch (error) {
      if (
        /غاوس|جاوس|كرامر|كريمر/.test(request) &&
        matrixIntent(request, context)
      )
        context = matrixFailureContext(request, context);
      if (context.geometry && isSpaceIntent(request, context))
        context = {
          ...context,
          geometry: {
            ...context.geometry,
            lastScalar: undefined,
            lastScalarExpression: undefined,
          },
          lastPrompt: request,
        };
      unsolved.push({
        request,
        school: info,
        message:
          error instanceof Error && /[\u0600-\u06ff]/.test(error.message)
            ? error.message
            : "تعذّر قراءة التعريف الرياضي؛ هل يمكنك إكمال العبارة والأقواس؟",
        choices: [],
      });
      previousFailed = true;
      continue;
    }
    if (part.setup || matrixDefinitionOnly(request)) continue;
    previousFailed = false;
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
        school: info,
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
        const namedProbability =
          engine === "probabilityEngine" || engine === "probabilityTools"
            ? await runSchoolProbability(request, context)
            : undefined;
        const prefix =
          partIndex === 0 &&
          parsed.preamble &&
          [
            "complexEngine",
            "complexTools",
            "geometryEngine",
            "geometryTools",
            "probabilityEngine",
            "sequences",
          ].includes(engine)
            ? parsed.preamble + "\n"
            : "";
        const value =
          namedProbability ||
          (await runEngine(
            engine,
            prefix + request,
            context,
            options.angleMode,
          ));
        value.school = info;
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
        previousFailed = true;
        if (selected[index] === "matricesEngine")
          context = matrixFailureContext(request, context);
        if (
          ["geometryEngine", "geometryTools"].includes(selected[index]) &&
          context.geometry
        )
          context = {
            ...context,
            geometry: {
              ...context.geometry,
              lastScalar: undefined,
              lastScalarExpression: undefined,
            },
          };
        const error: unknown = value.reason;
        const message =
          error instanceof Error && /[\u0600-\u06ff]/.test(error.message)
            ? error.message
            : "تعذّر إكمال هذا الجزء بهذه الصيغة. تحقق من المعطيات ومجال التعريف.";
        unsolved.push({
          request,
          school: info,
          engine: selected[index],
          message,
          choices:
            error instanceof ClarificationError && error.choices.length
              ? error.choices
              : selected[index] === "matricesEngine" &&
                  /كرامر|كريمر/.test(request) &&
                  context.matrices?.system &&
                  context.matrices.system.coefficients.length !==
                    context.matrices.system.variables.length
                ? ["حل الجملة السابقة بطريقة غاوس"]
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
  if (orderedParts.filter((p) => !p.setup).length > 12)
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
