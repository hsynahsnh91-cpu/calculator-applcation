import {
  ENGINE_LABELS,
  type Candidate,
  type SolverAnswer,
  type SolverContext,
  type SolverResult,
  type UnsolvedPart,
} from "./types";
const samples: Record<string, string> = {
  mathEngine: "احسب sin(30°)+√2",
  equationSolver: "حل المعادلة 2x^2-5x+3=0",
  calculusEngine: "جد مشتق f(x)=x^3-3x+1 ونظم جدول تغيراته",
  limitsEngine: "جد نهاية (x^2-1)/(x-1) عندما x تؤول إلى 1",
  integrationEngine: "احسب تكامل x e^x من 0 إلى 1",
  sequences: "متتالية حسابية حدها الأول 3 وأساسها 4، جد مجموع أول 20 حدًا",
  matricesEngine: "جد محدد ومقلوب المصفوفة [[1,2],[3,4]]",
  geometryEngine: "جد المسافة بين النقطة A(1,2,3) والمستوي 2x-y+2z-5=0",
  geometryTools: "احسب حجم مكعب طول حرفه 3",
  probabilityEngine:
    "كيس فيه 3 كرات حمراء و5 بيضاء سحبت كرتان معا، جد احتمال اختلاف اللون",
  probabilityTools: "التوزيع الثنائي n=10 p=0.5 k=5",
  complexEngine: "حوّل العدد العقدي 3+4i إلى الشكل الأسي",
  complexTools: "حل المعادلة z^2+2z+5=0 في الأعداد العقدية",
};
export function clarificationChoices(candidates: Candidate[]): string[] {
  const probable = candidates
    .filter((candidate) => candidate.confidence > 0.2)
    .slice(0, 3);
  return (
    probable.length
      ? probable.map((candidate) => samples[candidate.engine])
      : [
          samples.equationSolver,
          samples.calculusEngine,
          samples.probabilityEngine,
        ]
  ).filter(Boolean);
}
export function composeAnswer(
  question: string,
  results: SolverResult[],
  unsolved: UnsolvedPart[],
  candidates: Candidate[],
  context: SolverContext,
  elapsedMs: number,
): SolverAnswer {
  const suggestions: string[] = [];
  if (results.some((value) => value.engine === "complexEngine")) {
    const complex = context.complex;
    if (complex?.current) {
      if (results.some((value) => value.title.includes("الأشكال الثلاثة")))
        suggestions.push("جد مرافقه");
      else suggestions.push("اكتب الأشكال الثلاثة للعدد العقدي");
      suggestions.push("احسب قوته 2 بديموافر", "مثّله في المستوي العقدي");
    }
    if ((complex?.pointNames?.length ?? 0) === 2)
      suggestions.push(
        "احسب المسافة بين النقطتين في المستوي العقدي",
        "احسب الزاوية بين الشعاعين في المستوي العقدي",
      );
    suggestions.push(
      "اشرح قانون أويلر",
      "بسط cos(3theta) وsin(3theta) بديموافر",
    );
  }
  if (
    results.some(
      (value) =>
        value.engine === "equationSolver" &&
        value.finalLatex.includes("varnothing"),
    )
  ) {
    const equation = (context.lastPrompt ?? question)
      .replace(
        /(?:في|علي)\s*(?:مجموعة\s*)?(?:الاعداد\s*)?(?:الحقيقية|حقيقي|ℝ|R)(?=\s|$|[،,.])/g,
        "",
      )
      .trim();
    suggestions.push(`${equation} في الأعداد العقدية`);
  }
  if (
    context.expression &&
    results.some((value) =>
      [
        "calculusEngine",
        "limitsEngine",
        "integrationEngine",
        "equationSolver",
      ].includes(value.engine),
    )
  ) {
    suggestions.push("ارسم المنحنى");
    if (!results.some((value) => value.engine === "limitsEngine"))
      suggestions.push("جد النهايات عند أطراف المجال");
    if (!results.some((value) => value.engine === "integrationEngine"))
      suggestions.push("أوجد الدالة الأصلية للدالة");
  }
  if (results.some((r) => r.mode === "probability") && context.probability) {
    const p = context.probability;
    if (p.active === "urn" && p.urn) {
      if (p.urnQuery?.type === "law")
        suggestions.push(
          "احسب E(X)",
          "احسب V(X)",
          "أنشئ الدالة المولدة الاحتمالية",
        );
      else
        suggestions.push(
          "جد الفضاء العيني",
          `احسب قانون احتمال عدد الكرات من اللون ${p.urn.target || p.urn.colors.find((c) => c.count > 0)?.name}`,
          p.urn.mode === "successive_with_rep"
            ? "السحب متتاليًا دون إعادة"
            : "السحب متتاليًا مع إعادة",
        );
    } else if (p.active === "events")
      suggestions.push("احسب متمم A", "احسب P(A|B)", "هل الحدثان مستقلان؟");
    else if (p.active === "mixture")
      suggestions.push(
        "بايز، احسب P(H1|B)",
        "احسب الاحتمال الكلي",
        "اشرح شجرة الاحتمالات",
      );
    else if (p.active === "statistics")
      suggestions.push(
        "احسب المتوسط فقط",
        "احسب التباين فقط",
        ...(new Set(p.statistics?.values).size <= 6
          ? ["حول جدول التكرارات إلى مصفوفة"]
          : []),
      );
    else if (p.active === "law" && p.law) {
      const symbol = p.law.symbol;
      suggestions.push(`احسب E(${symbol})`, `احسب V(${symbol})`);
      if (p.law.values.every((v) => /^\d+$/.test(v) && Number(v) <= 32))
        suggestions.push("أنشئ الدالة المولدة الاحتمالية");
    } else if (p.active === "binomial")
      suggestions.push(
        "احسب E(X)",
        "احسب V(X)",
        ...(p.binomial && p.binomial.n <= 32
          ? ["أنشئ الدالة المولدة الاحتمالية"]
          : []),
      );
    else if (p.active === "joint") suggestions.push("اشرح استقلال المتحولين");
    else if (p.active === "normal")
      suggestions.push(
        "ارسم كثافة التوزيع الطبيعي",
        "اشرح قواعد الاحتمال الشرطي",
      );
  }
  if (results.length) suggestions.push("اشرح الخطوات بتفصيل أكثر");
  const intro = results.length
    ? unsolved.length
      ? "اكتمل حل الأجزاء التالية، وبقيت أجزاء تحتاج توضيحًا."
      : results.length > 1
        ? "ربطتُ المعطيات المشتركة، وهذه نتائج الطلبات بالترتيب."
        : "إليك النتيجة، ثم طريقة الوصول إليها."
    : "أحتاج إلى توضيح صغير قبل أن أبدأ الحل.";
  return {
    id: `answer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    question,
    intro,
    results,
    unsolved,
    candidates: candidates.filter((candidate) => candidate.confidence > 0.15),
    suggestions: [...new Set(suggestions)].slice(0, 4),
    context,
    elapsedMs,
  };
}
export function answerAsText(answer: SolverAnswer): string {
  return [
    answer.intro,
    ...answer.results.flatMap((result) => [
      `${ENGINE_LABELS[result.engine]} — ${result.title}`,
      String.raw`\[${result.finalLatex}\]`,
      ...result.steps.map(
        (step) =>
          `${step.title}: ${step.text ?? ""}\n${String.raw`\[${step.latex}\]`}`,
      ),
    ]),
    ...answer.unsolved.map((part) => part.message),
  ].join("\n\n");
}
