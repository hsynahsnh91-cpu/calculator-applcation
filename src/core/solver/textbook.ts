/** Safe, deterministic input cleanup shared by typed questions and reviewed OCR.
 * This does not guess damaged digits, signs, missing roots, or diagram facts.
 */
export function normalizeMathTypography(source: string): string {
  return source
    .replace(/[\u{1d400}-\u{1d7ff}]/gu, (c) => c.normalize("NFKC"))
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
    .replace(/\u00a0|\u202f/g, " ")
    .replace(/[−–—﹣－]/g, "-")
    .replace(/[＋﹢]/g, "+")
    .replace(/[＝﹦]/g, "=")
    .replace(
      /([A-Za-z])([₀₁₂₃₄₅₆₇₈₉]+)/g,
      (_, name: string, sub: string) =>
        `${name}_${[...sub].map((c) => "₀₁₂₃₄₅₆₇₈₉".indexOf(c)).join("")}`,
    )
    .replace(
      /\bz([ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜₓ])/g,
      (_, sub: string) =>
        `z_${"aehijklmnoprstx"["ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜₓ".indexOf(sub)].toUpperCase()}`,
    );
}

export function stripPromptMarkdown(source: string): string {
  return source
    .replace(/^\s*```(?:latex|tex|math)?\s*\n?|\n?\s*```\s*$/gm, "\n")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*[-•]\s+(?=[\u0621-\u064a])/gm, "");
}

/** Whole-word aliases, never substring replacement inside names such as بديموافر. */
export function normalizeMathDialect(source: string): string {
  const aliases: [string, string][] = [
    ["بدي|عايز|عاوز|عاوزه|عاوزة|اريد|ابغي|ابغا|ابي|بغيت|نحب", "جد"],
    ["اكتبلي|اكتب لي|اكتب ليا|نكتب|كتبلي", "اكتب"],
    ["حوللي|حول لي|حول ليا|نحول|حولي|تحويل", "حول"],
    ["احسبلي|احسب لي|احسب ليا|احسب لنا|احسبي|نحسب|حسبلي", "احسب"],
    ["اشتقلي|اشتق لي|اشتق ليا|نشتق|اشتقي", "مشتق"],
    ["حللي|حل لي|حل ليا|نحل", "حل"],
    ["كامللي|كامل لي|كامل ليا|نحسب التكامل", "تكامل"],
    ["طلعلي|طلع لي|طلع ليا|وريني|عطيني|اعطيني", "جد"],
  ];
  let text = source;
  for (const [words, replacement] of aliases)
    text = text.replace(
      new RegExp(
        `(^|[^\\p{L}\\p{N}_])(?:${words})(?=$|[^\\p{L}\\p{N}_])`,
        "gu",
      ),
      `$1${replacement}`,
    );
  return text;
}

const action =
  /(?:^|[^\p{L}\p{N}_])(?:و?(?:اكتب|استنتج|استدل|احسب|جد|اوجد|حل|ادرس|ارسم|مثل|نظم|بسط|اشرح|بين|برهن|حدد|عين|اجمع|اطرح|اضرب|اقسم|مشتق|تكامل|دوران|تحاكي|انسحاب|ازاحة))(?=$|[^\p{L}\p{N}_])/u;
export function hasMathInstruction(text: string): boolean {
  return action.test(text) || /^\s*حول(?=\s|$)/.test(text);
}
/** Only the demand determines the operation; introductory point/representation nouns do not. */
export function mathInstructionText(source: string): string {
  let text = source;
  const heading = /(?:^|\n|[،:])\s*(?:المطلوب|الاسئلة|اسئلة)\s*[:：]/.exec(
    text,
  );
  if (heading) text = text.slice(heading.index + heading[0].length);
  const start = /^\s*حول(?=\s|$)/.test(text) ? null : action.exec(text);
  return (start ? text.slice(start.index).trim() : text).replace(
    /\(\s*O\s*[;؛,،][^()\n]*\)/g,
    " ",
  );
}

/** Preserve separators inside frames, tuples, fractions, matrices and function calls. */
export function splitPromptRequests(source: string): string[] {
  const separator =
    /(?:^|\r?\n)\s*(?:[ا-يa-e]|\d{1,2})\s*[).:：-]\s*|(?:^|\s)[ابجدهـ]\s*[)\]:]\s*|\s+\d{1,2}\s*[).:：-]\s*(?=[\u0600-\u06ff])|\s+ثم\s+|[؛;]\s*|\n(?=\s*(?:جد|احسب|حل|ادرس|ارسم|نظم|اكتب|استنتج|حول))/g;
  const parts: string[] = [];
  let start = 0,
    scanned = 0;
  const stack: string[] = [];
  for (const match of source.matchAll(separator)) {
    const index = match.index!;
    while (scanned < index) {
      const c = source[scanned++];
      if ("([{".includes(c)) stack.push(c);
      else if (")]}".includes(c)) {
        const open = stack[stack.length - 1];
        if (
          (c === ")" && open === "(") ||
          (c === "]" && open === "[") ||
          (c === "}" && open === "{")
        )
          stack.pop();
      }
    }
    if (stack.length) continue;
    parts.push(source.slice(start, index));
    start = index + match[0].length;
    scanned = start;
  }
  parts.push(source.slice(start));
  return parts;
}
