import type { SolverContext } from "./types";
/** Preserve explicit vector operators before the generic arithmetic decoder loses dot/cross meaning. */
export function preserveSpaceOperators(source: string): string {
  return source.replace(
    /\\(?:vec|overrightarrow)\s*\{\s*([uvwnabcr]|[A-Z]{2})\s*\}\s*(\\cdot|\\times|·|×)\s*\\(?:vec|overrightarrow)\s*\{\s*([uvwnabcr]|[A-Z]{2})\s*\}/g,
    (_, a: string, operator: string, b: string) =>
      `الجداء ${operator === "\\times" || operator === "×" ? "الشعاعي" : "السلمي"} للشعاعين ${a} و${b}`,
  );
}
/** Spatial basis glyphs are not imaginary-unit evidence or separate questions. */
export function spaceNotation(source: string): string {
  return source
    .replace(
      /\\(?:lVert|Vert)\s*([uvwnabcr]|[A-Z]{2})\s*\\(?:rVert|Vert)|‖\s*([uvwnabcr]|[A-Z]{2})\s*‖|\|\|\s*([uvwnabcr]|[A-Z]{2})\s*\|\|/g,
      (_, a: string, b: string, c: string) => `طويلة الشعاع ${a || b || c}`,
    )
    .replace(/\\perp(?![A-Za-z])|⊥|⟂/g, " تعامد ")
    .replace(/\\(?:cdot|times)/g, "*")
    .replace(/ا\*/g, "اضرب")
    .replace(/ال\*/g, "الضرب")
    .replace(
      /\(\s*O\s*[,;؛،]\s*(?:\\vec\s*\{\s*i\s*\}|i)\s*[,;؛،]\s*(?:\\vec\s*\{\s*j\s*\}|j)\s*[,;؛،]\s*(?:\\vec\s*\{\s*k\s*\}|k)\s*\)/g,
      " ",
    )
    .replace(
      /\\(?:overrightarrow|vec)\s*\{\s*([A-Za-z][A-Za-z0-9]?)\s*\}/g,
      "$1",
    )
    .replace(/\\(?:overrightarrow|vec)\s+([uvwn])/g, "$1")
    .replace(/\\Pi(?![A-Za-z])|Π/g, "P")
    .replace(/\\alpha(?![A-Za-z])|α/g, "alpha")
    .replace(/\\beta(?![A-Za-z])|β/g, "beta")
    .replace(/_\{?([1-6])\}?/g, "$1")
    .replace(
      /\\begin\s*\{(cases|aligned|align\*?)\}([\s\S]*?)\\end\s*\{\1\}/g,
      (_, _environment: string, body: string) => body,
    )
    .replace(/\\\\(?:\[[^\]]{0,30}\])?/g, "\n")
    .replace(/&(?=\s*=)|(?<==\s*)&/g, "")
    .replace(/\\(?:in|mathbb)\s*\{?R\}?/g, "");
}
export function isSpaceIntent(
  source: string,
  context?: SolverContext,
): boolean {
  const text = spaceNotation(source);
  if (/\bP\s*\(\s*[A-Z]/.test(text) && !/فراغ|مستوي|ناظم|مستقيم/.test(text))
    return false;
  if (
    /احتمال|السحب|كرات|كرت|كيس|الالوان/.test(text) &&
    !/الهندسة|فراغ|ناظم/.test(text)
  )
    return false;
  if (/(?:النتيجة(?:\s+الهندسية)?|الاحتمال)\s+السابق(?:ة)?|\bans\b/.test(text))
    return false;
  if (
    /مشتق|تكامل|نهاية|متتالية|\b[fgh]\s*\(x\)|محدد المصفوفة|رتبة المصفوفة|منقول المصفوفة/.test(
      text,
    ) &&
    !/فراغ|ناظم|متخالف/.test(text)
  )
    return false;
  if (/مصفوف/.test(text) && !/(?:حول|اكتب|مثل).*مصفوف/.test(text)) return false;
  if (
    context?.geometry &&
    /شعاع|اشعة|متجه|ناظم|ارتباط|سلمي|تعامد|استواء|استقامة|تقاطع/.test(text)
  ) {
    const names = [
      ...Object.keys(context.geometry.points),
      ...Object.keys(context.geometry.vectors),
      ...Object.keys(context.geometry.lines),
      ...Object.keys(context.geometry.planes),
    ];
    if (names.some((n) => new RegExp(`\\b${n}\\b`).test(text))) return true;
  }
  if (
    context?.geometry &&
    /مستقل|مرتبط|ارتباط/.test(text) &&
    !/حدث|احتمال|متغير|متحول/.test(text) &&
    Object.keys(context.geometry.vectors).some((n) =>
      new RegExp(`\\b${n}\\b`).test(text),
    )
  )
    return true;
  const triples =
    /\([^()\n]*[,،;][^()\n]*[,،;][^()\n]*\)|\[[^\[\]\n]*,[^\[\]\n]*,[^\[\]\n]*\]/.test(
      text,
    );
  const strong =
    /فراغ|مجسم|مستوي|مستقيم|شعاع|اشعة|متجه|طويلة|طول القطعة|مركز\s+(?:ال)?ابعاد|مركز (?:ال)?ثقل|مرجح|متوسطات المثلث|ابعاد متناسبة|مركز الثقل|سلمي|ارتباط خطي|استقامة|استواء|مستوية|بارامتري|بارامتر|وسيطي|ناظم|قطر الكرة|معادلة الكرة|كرة.*معادلة|متخالف|متوازي السطوح|رباعي الوجوه/.test(
      text,
    );
  const explicitlyComplex =
    /عقدي|اويلر|ديموافر|\bz_[A-Z]\b/.test(text) ||
    (/\bz[1-9]?\s*=/.test(text) && /\bi\b|(?:\d|\))i\b/.test(text));
  if (explicitlyComplex && !/فراغ|ثلاثي الابعاد/.test(text)) return false;
  return (
    strong ||
    (triples && /\b[uvwn]\s*=\s*[(\[]/.test(text)) ||
    (triples &&
      /شعاع|اشعة|متجه|نقط|نقاط|مستقيم|مستوي|مستوى|بعد|مسافة|تعامد|تواز|كرة|احداثيات/.test(
        text,
      )) ||
    (/\b[DLd][1-6]?\s*:/.test(text) && /[xyz]\s*=|\(x,y,z\)/.test(text)) ||
    ((context?.lastEngine === "geometryEngine" ||
      context?.lastEngine === "geometryTools") &&
      !!context.geometry &&
      /بعد|مسافة|ناظم|الشعاع|الاشعة|مركز|استواء|استقامة|ارسم|المستوي|المستقيم|الكرة|الاسقاط|مسقط|الحجم|مساحة|السابق|الارتباط|تلاقي|جملة التقاطع/.test(
        text,
      ))
  );
}
