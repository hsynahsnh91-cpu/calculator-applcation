import { isSpaceIntent } from "./spaceNotation";
import { isComplexIntent } from "./complexTypes";
import {
  ENGINE_LABELS,
  type Candidate,
  type EngineId,
  type SolverContext,
} from "./types";

/** Transparent keyword/shape scoring. No remote service or learned intent classifier. */
export function routePrompt(
  text: string,
  context?: SolverContext,
): Candidate[] {
  const scores: Record<EngineId, { confidence: number; reason: string }> =
    Object.fromEntries(
      Object.keys(ENGINE_LABELS).map((key) => [
        key,
        { confidence: 0, reason: "لا توجد قرينة كافية" },
      ]),
    ) as Record<EngineId, { confidence: number; reason: string }>;
  const give = (engine: EngineId, confidence: number, reason: string) => {
    if (confidence > scores[engine].confidence)
      scores[engine] = { confidence, reason };
  };
  if (
    /مشتق|اشتق|تفاضل|تغيرات|تغييرات|مماس|تناقص|تزايد|ارسم|منحني|المنحنى/.test(
      text,
    )
  )
    give("calculusEngine", 0.98, "طلب اشتقاق أو دراسة تابع أو رسمه");
  if (
    /تكامل|\bint\b|∫|تابع اصلي|دالة اصلية|الدالة الاصلية|التابع الاصلي/.test(
      text,
    )
  )
    give("integrationEngine", 0.99, "طلب مكاملة");
  if (/نهاية|تؤول|\blim\b|→|مقارب|اطراف المجال/.test(text))
    give("limitsEngine", 0.99, "نهاية أو سلوك عند طرف المجال");
  if (
    /مصفوف|محدد|مقلوب|مدرج(?! (?:ال)?تكراري)|رتبة|قيم ذاتية|\[\s*\[/.test(text)
  )
    give("matricesEngine", 0.99, "مصفوفة أو عملية عليها");
  if (/متتالي|حدها|حدودها|اساسها|الحد الاول|\bu_?\{?n|\bu\([n0-9]/.test(text))
    give("sequences", 0.99, "معطيات متتالية أو مجموع حدودها");
  const sequenceIntent =
    /\bu_?\{?n(?:\+1)?|\bu\(n|متتالي|التدريج/.test(text) &&
    !/متحول|متغير|احتمال|سحب|السحب|كرات|كرت|كيس|صندوق/.test(text);
  if (
    sequenceIntent ||
    (!!context?.school?.sequence &&
      /عبار|صريح|اساس|نهاية المتتالية|رتابة/.test(text) &&
      !/سحب|كيس|صندوق/.test(text))
  )
    give("sequences", 1, "تعريف متتالية أو علاقة تدريجية أو طلب تابع لها");
  if (/حل(?:ا)? وحيد|حلا وحيدا|وجود حل وحيد/.test(text))
    give("calculusEngine", 1, "وجود ووحدانية بدراسة الاستمرار والرتابة");
  if (
    /مساحة.*(?:منحني|منحنى)|حجم دوراني|الحجم الدوراني|القيمة الوسط[ىي]|القيمة المتوسطة/.test(
      text,
    )
  )
    give("integrationEngine", 1, "مساحة أو حجم أو قيمة وسطى بتكامل معرف");
  if (/(?:^|\s)تحقق/.test(text) && /جذر|\b[fgh]\s*\(/.test(text))
    give("calculusEngine", 1, "تحقق بالتعويض عند قيمة محددة في تابع معطى");
  const spatialIntent = isSpaceIntent(text, context);
  if (spatialIntent)
    give("geometryEngine", 1, "معطيات أو متابعة هندسية فراغية منظمة");
  const scalarReference =
    /(?:الاحتمال|النتيجة(?:\s+الهندسية)?)\s+السابق(?:ة)?/.test(text) ||
    /\bans\b/.test(text);
  const probabilityIntent =
    /احتمال|احصاء|كرات|كرت|كيس|صندوق|متغير عشوائي|المتغير العشوائي|ثنائي|برنولي|توزيع|طبيعي|غاوسي|توافيق|تراتيب|عاملي|متوسط|وسيط|منوال|انحراف|تباين|امل رياضي|الامل|العزم الثاني|قواعد الاحداث|متمم|مكمل|الفضاء العيني|مدرج (?:ال)?تكراري|بيانات|تكرارات|متحول (?:ال)?عشوائي|متغير (?:ال)?عشوائي|استقلال|مستقلان|متنافي|اتحاد|تقاطع|بايز|شجرة الاحتمالات|دالة مولدة|الدالة المولدة|[Pp]\s*\(\s*[A-Z](?![A-Za-z0-9_,])|[EV]\s*\(\s*[XY]|n\s*\(\s*Ω|(?:X|Y|J|q)\s*=\s*\[/.test(
      text,
    ) ||
    ((!!context?.probability ||
      context?.lastEngine === "probabilityEngine" ||
      context?.lastEngine === "probabilityTools") &&
      /^(?:و?احسب |و?جد |و?الان )?(?:السحب|سحب|معا|متتال(?:يا|ي)?(?=\s|$)|مع (?:ال)?اعادة|دون (?:ال)?اعادة|اقل|اكثر|المتمم|الشرطي|قانون|امل|توقع|X\s*[<>=]|Y\s*=)/.test(
        text,
      ));
  if (
    (probabilityIntent ||
      (context?.probability?.active === "normal" &&
        /منحني|منحنى|كثاف/.test(text))) &&
    !scalarReference
  ) {
    give("probabilityEngine", 0.99, "تجربة احتمالية أو توزيع أو إحصاء");
    give("probabilityTools", 0.86, "تفسير الحدث وبناء الشجرة أو التوزيع");
  }
  if (
    /مستوي|مستقيم|متجه|متجهة|ناظم|مسافة|نقطة|النقط|تعامد|تواز|رباعي الوجوه|جداء سلمي/.test(
      text,
    )
  )
    give("geometryEngine", 0.99, "نقاط أو متجهات أو مستقيمات أو مستويات");
  if (
    /حجم|مكعب|اسطوان|اسطوان|كرة|مخروط|موشور|هرم|متوازي مستطيلات/.test(text) &&
    !/كرات|كرت/.test(text)
  )
    give("geometryTools", 0.99, "قياسات مجسم");
  const realDomain = /حقيقي|ℝ|\bR\b/.test(text) && !/عقدي|ℂ|¢|\bC\b/.test(text);
  const complexIntent =
    !realDomain &&
    !spatialIntent &&
    isComplexIntent(
      text,
      (context?.lastEngine === "complexEngine" ||
        context?.lastEngine === "complexTools") &&
        !!context.complex,
    );
  if (complexIntent) {
    give("complexEngine", 0.99, "عدد عقدي أو أويلر أو تطبيق في المستوي العقدي");
    const numberOperation =
      /اشكال|شكل|صيغة|صيغ|حول|مرافق|مقلوب|اويلر|اولر|د[يو]\s*موا?فر|ديموافر|انسحاب|تحاكي|دوران|زاوية|مسافة|اجمع|اطرح|اقسم|جداء|العمليات|نقطة|النقط|شعاع|تمثيل/.test(
        text,
      );
    if (
      !numberOperation &&
      (/معادل|(?:^|\s)حل\s/.test(text) ||
        /[xyz][^=\u0600-\u06ff]*=\s*0(?:\s|$)/.test(text))
    )
      give("complexTools", 1, "معادلة مطلوب حلها في مجموعة الأعداد العقدية");
  }
  if (/معادل|حل\s|جملة|جذور/.test(text) || /[xyz][^\u0600-\u06ff]*=/.test(text))
    give("equationSolver", 0.94, "معادلة تحتوي مجهولاً وعلامة مساواة");
  const stripped = text
    .replace(/(?:الاحتمال|النتيجة(?:\s+الهندسية)?)\s+السابق(?:ة)?/g, "ans")
    .replace(
      /(?:احسب|احسبي|احسبلي|جد|قيمة|كم|يساوي|نتيجة|لي|بالتفصيل|عدديا|تقريبا|تقريبي|تقريب|درجة|راديان|غراد|جراد)/g,
      "",
    )
    .trim();
  if (
    /^[\s\dA-Za-z+*/^().,!=\[\]{}°_\-|]+$/.test(stripped) &&
    (/\d/.test(stripped) ||
      (/\bans\b/.test(stripped) &&
        (context?.probability?.lastScalar !== undefined ||
          context?.geometry?.lastScalar !== undefined)) ||
      Object.keys(context?.solutions ?? context?.assignments ?? {}).some(
        (key) => new RegExp(`\\b${key}\\b`).test(stripped),
      )) &&
    !/[xyz].*=/.test(stripped)
  )
    give("mathEngine", 0.9, "عبارة حسابية قابلة للتقييم");
  if (/اشرح.*خطوات|تفصيل اكثر/.test(text) && context?.lastEngine)
    give(context.lastEngine, 0.96, "متابعة للنتيجة السابقة");
  return (
    Object.entries(scores) as [
      EngineId,
      { confidence: number; reason: string },
    ][]
  )
    .map(([engine, value]) => ({ engine, ...value }))
    .sort((a, b) => b.confidence - a.confidence);
}
export function selectEngines(
  candidates: Candidate[],
  text: string,
): EngineId[] {
  let selected = candidates
    .filter((candidate) => candidate.confidence >= 0.9)
    .map((candidate) => candidate.engine);
  for (const engine of [
    "sequences",
    "integrationEngine",
    "calculusEngine",
  ] as EngineId[])
    if (candidates.some((c) => c.engine === engine && c.confidence === 1))
      return [engine];
  if (
    selected.includes("geometryEngine") &&
    candidates.some((c) => c.engine === "geometryEngine" && c.confidence === 1)
  )
    return ["geometryEngine"];
  // Plane applications, Euler and numerical complex algebra are one coherent intent.
  if (selected.includes("complexTools"))
    selected = selected.filter(
      (engine) =>
        ![
          "complexEngine",
          "equationSolver",
          "mathEngine",
          "geometryEngine",
          "matricesEngine",
        ].includes(engine),
    );
  else if (selected.includes("complexEngine"))
    selected = selected.filter(
      (engine) =>
        ![
          "equationSolver",
          "mathEngine",
          "geometryEngine",
          "geometryTools",
          "matricesEngine",
        ].includes(engine) &&
        (!["calculusEngine", "integrationEngine"].includes(engine) ||
          /مشتق|تكامل/.test(text)),
    );
  // A drawing or inverse belongs to its stated domain, not automatically to calculus/matrices.
  if (selected.includes("complexEngine") && /عقدي/.test(text)) {
    if (!/مصفوف|\[\s*\[/.test(text))
      selected = selected.filter((engine) => engine !== "matricesEngine");
    if (!/مشتق|تكامل|[fgh]\(x\)/.test(text))
      selected = selected.filter((engine) => engine !== "calculusEngine");
    if (/المستوي العقدي|المستوى العقدي/.test(text))
      selected = selected.filter((engine) => engine !== "geometryEngine");
  }
  if (selected.includes("probabilityEngine"))
    selected = selected.filter(
      (engine) =>
        ![
          "calculusEngine",
          "matricesEngine",
          "geometryTools",
          "sequences",
        ].includes(engine),
    );
  if (selected.includes("complexEngine") && !/مصفوف/.test(text))
    selected = selected.filter((engine) => engine !== "matricesEngine");
  if (selected.includes("complexEngine") && !selected.includes("complexTools"))
    selected = selected.filter((engine) => engine !== "equationSolver");
  if (selected.includes("complexTools"))
    selected = selected.filter(
      (engine) =>
        !["complexEngine", "equationSolver", "mathEngine"].includes(engine),
    );
  else if (selected.includes("complexEngine"))
    selected = selected.filter((engine) => engine !== "mathEngine");
  if (
    selected.some((engine) =>
      [
        "calculusEngine",
        "limitsEngine",
        "integrationEngine",
        "sequences",
        "matricesEngine",
        "geometryEngine",
        "geometryTools",
        "probabilityEngine",
      ].includes(engine),
    )
  )
    selected = selected.filter(
      (engine) =>
        engine !== "mathEngine" &&
        (engine !== "equationSolver" || /حل المعادلة/.test(text)),
    );
  if (selected.includes("integrationEngine") && /تكامل.*مشتق/.test(text))
    selected = selected.filter((engine) => engine !== "calculusEngine");
  if (selected.includes("geometryTools"))
    selected = selected.filter((engine) => engine !== "geometryEngine");
  return [...new Set(selected)].slice(0, 5);
}
