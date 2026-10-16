import { readSchoolDocument } from "./schoolDocument";
import {
  normalizeMathTypography,
  stripPromptMarkdown,
  normalizeMathDialect,
  splitPromptRequests,
  hasMathInstruction,
} from "./textbook";
import { emptyContext, type ParsedPrompt, type SolverContext } from "./types";

export function normalizeDigits(source: string): string {
  return source
    .replace(/[٠-٩۰-۹]/g, (digit) =>
      String(digit.charCodeAt(0) - (digit <= "٩" ? 0x660 : 0x6f0)),
    )
    .replace(/٫/g, ".")
    .replace(/٬/g, "");
}
const numberWords: Record<string, number> = {
  صفر: 0,
  واحد: 1,
  واحدة: 1,
  اثنان: 2,
  اثنين: 2,
  اتنين: 2,
  اثنتان: 2,
  اثنتين: 2,
  ثلاثة: 3,
  ثلاث: 3,
  تلاتة: 3,
  تلات: 3,
  اربعة: 4,
  اربع: 4,
  خمسة: 5,
  خمس: 5,
  ستة: 6,
  ست: 6,
  سبعة: 7,
  سبع: 7,
  ثمانية: 8,
  ثمان: 8,
  تمانية: 8,
  تسعة: 9,
  تسع: 9,
  عشرة: 10,
  عشر: 10,
  عشرين: 20,
  عشرون: 20,
  ثلاثين: 30,
  ثلاثون: 30,
  تلاتين: 30,
  اربعين: 40,
  اربعون: 40,
  خمسين: 50,
  خمسون: 50,
  ستين: 60,
  ستون: 60,
  سبعين: 70,
  سبعون: 70,
  ثمانين: 80,
  ثمانون: 80,
  تسعين: 90,
  تسعون: 90,
  مئة: 100,
  مائة: 100,
  مية: 100,
};
export function normalizeArabic(source: string): string {
  return normalizeDigits(source)
    .normalize("NFC")
    .replace(/[\u064b-\u065f\u0670ـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي");
}
function spokenNumbers(source: string): string {
  let text = source
    .replace(/احد عشر/g, "11")
    .replace(/اثن[اي] عشر|اتناش/g, "12");
  text = text.replace(
    /(ثلاثة|اربعة|خمسة|ستة|سبعة|ثمانية|تسعة) عشر/g,
    (_, word: string) => String(10 + numberWords[word]),
  );
  const names = Object.keys(numberWords).join("|");
  text = text.replace(
    new RegExp(
      `(^|[^\\u0600-\\u06ff])(${names})\\s+و\\s*(${names})(?=$|[^\\u0600-\\u06ff])`,
      "g",
    ),
    (_, before: string, a: string, b: string) =>
      before +
      (numberWords[a] < 10 && numberWords[b] >= 20
        ? numberWords[a] + numberWords[b]
        : `${a} و${b}`),
  );
  return text.replace(
    new RegExp(`(^|[^\\u0600-\\u06ff])(${names})(?=$|[^\\u0600-\\u06ff])`, "g"),
    (_, before: string, word: string) => before + numberWords[word],
  );
}
function readGroup(text: string, start: number): [string, number] | null {
  while (/\s/.test(text[start] ?? "") && start < text.length) start++;
  if (text[start] !== "{") return null;
  let depth = 1,
    end = start + 1;
  while (end < text.length && depth) {
    if (text[end] === "{") depth++;
    if (text[end] === "}") depth--;
    end++;
  }
  return depth ? null : [text.slice(start + 1, end - 1), end];
}
/** A balanced, deterministic LaTeX decoder, not a language model. */
export function decodeLatex(source: string): string {
  let out = "";
  const implicitFactor = () =>
    /[A-Za-z0-9_)\]}]$/.test(out) && !/\\begin\{[pbvV]?matrix\}\s*$/.test(out);
  const text = source
    .replace(/\^\{\\circ\}|\^\\circ(?![a-zA-Z])|\\degree(?![a-zA-Z])/g, "°")
    .replace(/\\(?:left|right|displaystyle|limits)\b/g, "")
    .replace(/\\[,;! ]/g, " ");
  for (let index = 0; index < text.length; ) {
    const command = text
      .slice(index)
      .match(/^\\(dfrac|tfrac|frac|sqrt|text|mathrm|operatorname)(?![a-zA-Z])/);
    if (!command) {
      out += text[index++];
      continue;
    }
    let next = index + command[0].length;
    let rootIndex = "2";
    if (command[1] === "sqrt" && text[next] === "[") {
      const end = text.indexOf("]", next);
      if (end > next) {
        rootIndex = text.slice(next + 1, end);
        next = end + 1;
      }
    }
    let first = readGroup(text, next);
    if (!first && /frac/.test(command[1])) {
      let at = next;
      while (/\s/.test(text[at] || "") && at < text.length) at++;
      if (/[A-Za-z0-9]/.test(text[at] || "")) first = [text[at], at + 1];
    }
    if (!first && command[1] === "sqrt") {
      let atom = next;
      while (atom < text.length && /\s/.test(text[atom])) atom++;
      if (/[A-Za-z0-9]/.test(text[atom] ?? "")) first = [text[atom], atom + 1];
    }
    if (!first) {
      out += text[index++];
      continue;
    }
    if (/frac/.test(command[1])) {
      let second = readGroup(text, first[1]);
      if (!second) {
        let at = first[1];
        while (/\s/.test(text[at] || "") && at < text.length) at++;
        if (/[A-Za-z0-9]/.test(text[at] || "")) second = [text[at], at + 1];
      }
      if (!second) {
        out += text[index++];
        continue;
      }
      out += `${implicitFactor() ? "*" : ""}((${decodeLatex(first[0])})/(${decodeLatex(second[0])}))`;
      index = second[1];
    } else {
      out +=
        command[1] === "sqrt"
          ? rootIndex === "2"
            ? `${implicitFactor() ? "*" : ""}sqrt(${decodeLatex(first[0])})`
            : `${implicitFactor() ? "*" : ""}((${decodeLatex(first[0])})^(1/(${rootIndex})))`
          : decodeLatex(first[0]);
      index = first[1];
    }
  }
  return out
    .replace(/\\(?:cdot|times)/g, "*")
    .replace(/\\div/g, "/")
    .replace(/\\(?:theta|vartheta)(?![a-zA-Z])/g, "theta")
    .replace(/\\omega(?![a-zA-Z])/g, "omega")
    .replace(/\\mathbb\s*\{([CR])\}/g, "$1")
    .replace(/\\pi(?![a-zA-Z])/g, " pi ")
    .replace(/\\infty(?![a-zA-Z])/g, "∞")
    .replace(/\\Omega(?![a-zA-Z])/g, "Ω")
    .replace(/\\to(?![a-zA-Z])/g, "→")
    .replace(
      /\\(?:sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|arcsin|arccos|arctan|ln|log|exp|abs)(?![a-zA-Z])/g,
      (word) =>
        " " +
        word
          .slice(1)
          .replace("arcsin", "asin")
          .replace("arccos", "acos")
          .replace("arctan", "atan")
          .replace("ln", "log"),
    )
    .replace(/\\(?:quad|qquad|enspace)\b/g, " ")
    .replace(/\\[()[\]]|\$+/g, "")
    .replace(/\^\s*\{([^{}]+)\}/g, "^($1)")
    .replace(/_\{([^{}]+)\}/g, "_$1")
    .replace(
      /\bz_\s*([A-Za-z])\b/g,
      (_, label: string) => `z_${label.toUpperCase()}`,
    )
    .replace(/\bz\s+([A-Z])(?=\s*=)/g, "z_$1");
}
export function normalizePrompt(source: string): string {
  let text = decodeLatex(
    stripPromptMarkdown(normalizeMathTypography(normalizeArabic(source))),
  );
  let notationSuffix = "";
  text = text
    .replace(
      /\\?int_(-?\d+(?:\.\d+)?)\^\(?(-?\d+(?:\.\d+)?)\)?/g,
      (_, lower: string, upper: string) => {
        notationSuffix += ` من ${lower} الي ${upper}`;
        return "تكامل ";
      },
    )
    .replace(
      /\\?lim_([xyz])\s*(?:→|->)\s*([+-]?(?:\d+(?:\.\d+)?|∞))(?:\^\(([+-])\))?/g,
      (_, variable: string, target: string, direction?: string) => {
        notationSuffix += ` عندما ${variable} تؤول الي ${target}${direction === "+" ? " من اليمين" : direction === "-" ? " من اليسار" : ""}`;
        return "نهاية ";
      },
    )
    .replace(/\\int(?![a-zA-Z])/g, "تكامل ")
    .replace(/\\lim(?![a-zA-Z])/g, "نهاية ");
  text += notationSuffix;
  text = spokenNumbers(text)
    .replace(/−|–|—/g, "-")
    .replace(/×|·/g, "*")
    .replace(/÷/g, "/")
    .replace(/π/g, " pi ")
    .replace(/θ/g, "theta")
    .replace(/ω/g, "omega")
    .replace(/\bz_\{?([1-9])\}?/g, "z$1")
    .replace(
      /[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g,
      (power) =>
        `^(${[...power].map((c) => ("⁰¹²³⁴⁵⁶⁷⁸⁹".includes(c) ? "⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(c) : "-")).join("")})`,
    )
    .replace(/√\s*\(/g, " sqrt(")
    .replace(/√\s*([a-zA-Z0-9.]+)/g, " sqrt($1)")
    .replace(
      /(^|[^\u0600-\u06ff])(?:اكسس|اكس|سين)(?=$|[^\u0600-\u06ff])/g,
      "$1x",
    )
    .replace(/(^|[^\u0600-\u06ff])(?:واي|صاد)(?=$|[^\u0600-\u06ff])/g, "$1y")
    .replace(/(^|[^\u0600-\u06ff])زد(?=$|[^\u0600-\u06ff])/g, "$1z")
    .replace(/([xyz])\s*(?:تربيع|مربع)/g, "$1^2")
    .replace(/([xyz])\s*(?:تكعيب|مكعب)/g, "$1^3")
    .replace(/([xyz0-9)])\s*اس\s*(-?\d+)/g, "$1^$2")
    .replace(/زائد/g, "+")
    .replace(/ناقص/g, "-")
    .replace(/بضرب|ضرب/g, "*")
    .replace(/(?:تقسيم|مقسوم علي)/g, "/")
    .replace(/(?:سالب)\s*(?=\d)/g, "-")
    .replace(/(?:موجب)\s*(?=\d)/g, "+")
    .replace(/جذر\s*(\d+)/g, "sqrt($1)")
    .replace(/(?:جا|جيب)\s*\(?\s*(\d+)\s*\)?/g, "sin($1)")
    .replace(/(?:جتا|جيب تمام)\s*\(?\s*(\d+)\s*\)?/g, "cos($1)")
    .replace(/اشتقلي|اشتق لي|مشتقة|مشتقتها|اشتقاق/g, "مشتق")
    .replace(/كامللي|كامل لي|مكاملة|مكامل/g, "تكامل")
    .replace(/نهايتها|نهاياتها|نهايات/g, "نهاية")
    .replace(/بتؤول|بيؤول|يؤول|تقترب|يقترب/g, "تؤول")
    .replace(/مستوى|مستو(?:ٍ|ي)?\b/g, "مستوي")
    .replace(/مركبة|مركب|عقدية|عقدي/g, "عقدي")
    .replace(/سحبنا|سحبناها|انسحبت/g, "سحبت")
    .replace(/سوا|بنفس الوقت/g, "معا")
    .replace(
      /(^|[^\u0600-\u06ff])(?:بدي|عايز|اريد)(?=$|[^\u0600-\u06ff])/g,
      "$1جد",
    );
  text = text
    .replace(/احدا(?=\s+(?:الصندوقين|الصناديق))/g, "احد")
    .replace(
      /\bP_\{?([A-Z](?:[1-8])?)\}?\s*\(\s*([A-Z](?:[1-8])?)\s*\)/g,
      "P($2|$1)",
    )
    .replace(
      /\bP\(\s*([A-Z](?:[1-8])?)\s*\/\s*([A-Z](?:[1-8])?)\s*\)/g,
      "P($1|$2)",
    )
    .replace(/(?:القانون الاحتمالي|التوزيع الاحتمالي)/g, "قانون الاحتمال")
    .replace(/(?:التوقع الرياضي|الامل الرياضي)/g, "الامل الرياضي")
    .replace(/تابعا اصليا|تابع اصلي|دالة اصلية/g, "تابع اصلي")
    .replace(/\.\s*$/g, "");
  return normalizeMathDialect(text).trim();
}
export function parsePrompt(
  source: string,
  previous: SolverContext = emptyContext(),
  plain = false,
): ParsedPrompt {
  const document = plain ? undefined : readSchoolDocument(source);
  if (document) {
    const base = parsePrompt(document.preamble || "", previous, true);
    const legacy = parsePrompt(source, previous, true);
    const parts = document.parts.map((p) => ({
      ...p,
      text: normalizePrompt(p.text),
    }));
    return {
      original: source,
      text: parts.map((p) => p.text).join("\n"),
      requests: legacy.requests,
      context: base.context,
      preamble: normalizePrompt(document.preamble),
      parts,
    };
  }
  let raw = stripPromptMarkdown(
    normalizeMathTypography(normalizeArabic(source)),
  );
  if (/(?:[DLd][1-6]?\s*:|بارامتري|بارامتر|وسيطي)/.test(raw))
    raw = raw.replace(/[؛;](?=\s*[xyz]\s*=)/g, "،");
  if (/جملة|نظام/.test(raw))
    raw = raw.replace(/[؛;](?=\s*(?:[-+(\d]|[xyz])[^؛;\n]*=)/g, "،");
  const context: SolverContext = {
    ...previous,
    assignments: { ...previous.assignments },
  };
  const fragments = splitPromptRequests(raw)
    .map((part) => normalizePrompt(part))
    .filter(Boolean);
  // Keep probability definitions with the next question; later queries consume the
  // validated structured context. Never glue old questions onto new event conditions.
  const requests: string[] = [];
  let pendingDefinitions = "";
  let pendingComplex = "";
  let pendingSpace = "";
  const spaceDefinition = (part: string) =>
    !hasMathInstruction(part) &&
    (/\b[A-Zuvwn]\s*(?:=|:)?\s*\([^()]*,[^()]*,[^()]*\)/.test(part) ||
      /\b[DLdPQR][1-6]?\s*:/.test(part));
  const complexDefinition = (part: string) =>
    /\bz(?:_[A-Z]|[1-9])?\s*=/.test(part) && !hasMathInstruction(part);
  const probabilityDefinition = (part: string) =>
    (!/(?:احسب|جد|هل|افحص|اختبر|ارسم|حول)/.test(part) &&
      /(?:P\s*\([^)]*\)\s*=|(?:^|\s)(?:[XYJpqf]|القيم|التكرارات|الالوان)\s*=\s*\[)/.test(
        part,
      )) ||
    (!/(?:احسب|جد|هل|احتمال|قانون)/.test(part) &&
      /[0-9]|كرتان|كرتين/.test(part) &&
      /كيس|صندوق|سحب|السحب/.test(part));
  for (let part of fragments) {
    if (spaceDefinition(part)) {
      pendingSpace += (pendingSpace ? "\n" : "") + part;
      continue;
    }
    if (pendingSpace) {
      if (
        /شعاع|اشعة|متجه|نقط|مستوي|مستقيم|بعد|مسافة|مركز|ارتباط|استقلال|تعامد|سلمي|كرة|استقامة|استواء|متلاق|تلاقي|مستوية|حجم|تقاطع|مصفوف|احداثيات/.test(
          part,
        )
      )
        part = pendingSpace + "\n" + part;
      else requests.push(pendingSpace);
      pendingSpace = "";
    }
    if (complexDefinition(part)) {
      pendingComplex += (pendingComplex ? "\n" : "") + part;
      continue;
    }
    if (pendingComplex) {
      if (
        /عقدي|اويلر|ديموافر|شكل|صيغة|صورة|اسي|جبري|مثلثي|مرافق|طويلة|عمدة|\bz(?:_[A-Z]|[1-9])?\b/.test(
          part,
        )
      )
        part = pendingComplex + "\n" + part;
      else requests.push(pendingComplex);
      pendingComplex = "";
    }
    if (probabilityDefinition(part)) {
      pendingDefinitions += (pendingDefinitions ? "، " : "") + part;
      continue;
    }
    if (pendingDefinitions) {
      if (
        /احتمال|احصاء|كرات|كرت|السحب|سحب|فضاء|اتحاد|تقاطع|متمم|شرط|استقلال|مستقل|تكرار|متوسط|وسيط|منوال|امل|عزم|تباين|انحراف|مولد|قانون|P\s*\(|[EV]\s*\(/.test(
          part,
        )
      )
        requests.push(pendingDefinitions + "، " + part);
      else requests.push(pendingDefinitions, part);
      pendingDefinitions = "";
    } else requests.push(part);
  }
  if (pendingDefinitions) requests.push(pendingDefinitions);
  if (pendingComplex) requests.push(pendingComplex);
  if (pendingSpace) requests.push(pendingSpace);
  const text = requests.join("\n");
  const initial = requests[0] ?? text;
  const definition = initial.match(
    /\b([fgh])\s*\(\s*([a-z])\s*\)\s*=\s*([^\u0600-\u06ff\n;؛?؟]+?)(?=\s+(?:[و]?[\u0600-\u06ff])|\n|[؛;?؟]|$)/,
  );
  if (definition) {
    context.expression = definition[3].replace(/[،,\s.]+$/, "").trim();
    context.variable = definition[2];
    delete context.derivative;
  }
  for (const assignment of initial.matchAll(
    /\b([a-dkmpqrt])\s*=\s*(-?\d+(?:\.\d+)?)(?=\s|[,،;؛]|$)/g,
  ))
    context.assignments[assignment[1]] = Number(assignment[2]);
  return {
    original: source,
    text,
    requests: requests.length ? requests : [text],
    context,
  };
}
