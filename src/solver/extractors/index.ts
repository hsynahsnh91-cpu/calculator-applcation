import { ClarificationError, type SolverContext } from "../types";

const NUMBER = "-?\\d+(?:\\.\\d+)?";
export function numericMatch(
  text: string,
  pattern: string,
): number | undefined {
  const found = text.match(new RegExp(`${pattern}(?![\\d.eE+*/^-])`, "i"));
  const value = found?.[1] === undefined ? undefined : Number(found[1]);
  return value !== undefined && Number.isFinite(value) ? value : undefined;
}
export function requireValue(
  value: number | undefined,
  question: string,
  choices: string[] = [],
): number {
  if (value === undefined) throw new ClarificationError(question, choices);
  return value;
}
export function mathFragments(text: string): string[] {
  return (text.match(/[A-Za-z0-9_+\-*/^=()[\]{},.!|°∞\s]+/g) ?? [])
    .map((value) => value.trim().replace(/^[,.:\s]+|[,.:\s]+$/g, ""))
    .filter(
      (value) =>
        (/[0-9xyz]/i.test(value) || /^(?:e|i|pi)$/.test(value)) &&
        !/^\d+[).]?$/.test(value),
    );
}
export function extractExpression(
  text: string,
  context: SolverContext,
  preferPrevious = true,
): string {
  const definition = text.match(
    /[fgh]\s*\(\s*([a-z])\s*\)\s*=\s*([^\u0600-\u06ff\n؛;؟?]+)/,
  );
  let value = definition?.[2]?.trim().replace(/[،,.\s]+$/, "");
  if (!value) {
    const fragments = mathFragments(text).filter(
      (fragment) => !/^\[/.test(fragment) && /[a-zA-Z+*/^()-]/.test(fragment),
    );
    value = fragments.sort((a, b) => b.length - a.length)[0];
  }
  if (value) {
    value = value
      .replace(/\b(?:dx|dt|du)\b\s*$/, "")
      .replace(/(?:[xyz]\s*(?:->|→)\s*[-+\w]+).*$/, "")
      .trim();
    if (value.includes("=") && !definition) value = value.split("=")[0].trim();
  }
  if (/تكامل.*مشتق|مشتق.*السابقة/.test(text) && context.derivative)
    return context.derivative;
  if (value && /[a-zA-Z]/.test(value)) return value;
  if (preferPrevious && context.expression) return context.expression;
  if (value) return value;
  throw new ClarificationError("ما عبارة الدالة التي تريد دراستها؟", [
    "جد مشتق f(x)=x^3-3x+1",
    "احسب تكامل x^2 من 0 إلى 1",
  ]);
}
export function extractEquation(text: string): {
  expression: string;
  variable: string;
} {
  const equation = mathFragments(text).find(
    (part) => part.includes("=") && /[xyz]/.test(part),
  );
  if (!equation)
    throw new ClarificationError(
      "اكتب المعادلة كاملة مع الطرفين وعلامة المساواة.",
      ["حل المعادلة 2x^2-5x+3=0", "حل المعادلة z^2+2z+5=0 في الأعداد العقدية"],
    );
  const [left, right, extra] = equation.split("=");
  if (!left || !right || extra)
    throw new ClarificationError(
      "هل تقصد معادلة واحدة أم جملة معادلات؟ اكتب كل معادلة في سطر.",
    );
  const variable = /\bz|z\^/.test(equation)
    ? "z"
    : /x/.test(equation)
      ? "x"
      : "y";
  return { expression: `(${left.trim()})-(${right.trim()})`, variable };
}
export function extractBounds(text: string): {
  lower?: number;
  upper?: number;
} {
  const pair = text.match(
    new RegExp(`من\\s*(${NUMBER})\\s*(?:الي|الى|إلى|و|to)\\s*(${NUMBER})`),
  );
  if (pair) return { lower: Number(pair[1]), upper: Number(pair[2]) };
  const latex = text.match(
    /(?:int|∫)_\{?(-?\d+(?:\.\d+)?)\}?\^\{?\(?(-?\d+(?:\.\d+)?)\)?\}?/,
  );
  if (latex) return { lower: Number(latex[1]), upper: Number(latex[2]) };
  if (/من\s|بين\s|محدد/.test(text))
    throw new ClarificationError("ما الحد السفلي والحد العلوي للتكامل؟", [
      "احسب تكامل x^2 من 0 إلى 1",
    ]);
  return {};
}
export function extractLimit(text: string): {
  target?: number | "infinity" | "-infinity";
  direction?: "left" | "right";
  endpoints: boolean;
} {
  const direction = /يمين|موجب/.test(text)
    ? "right"
    : /يسار|سالب/.test(text)
      ? "left"
      : undefined;
  if (/اطراف|طرفي المجال|اللانهايتين/.test(text))
    return { endpoints: true, direction };
  const infinity = text.match(
    /(?:تؤول\s*(?:الي|الى)?|→|->|عند)\s*([+-]?)\s*(?:∞|لانهاية|اللانهاية|infinity|inf)/i,
  );
  if (infinity)
    return {
      target: infinity[1] === "-" ? "-infinity" : "infinity",
      endpoints: false,
      direction,
    };
  const match = text.match(
    new RegExp(`(?:تؤول\\s*(?:الي|الى)?|→|->|عند)\\s*(${NUMBER})`),
  );
  return {
    target: match ? Number(match[1]) : undefined,
    direction,
    endpoints: false,
  };
}
export function extractMatrices(
  text: string,
  context: SolverContext,
): number[][][] {
  const matrices: number[][][] = [];
  for (const match of text.matchAll(/\[\s*\[[\s\S]*?\]\s*\]/g)) {
    try {
      const value: unknown = JSON.parse(match[0]);
      if (
        Array.isArray(value) &&
        value.length &&
        value.every(
          (row: unknown) =>
            Array.isArray(row) &&
            row.every(
              (cell: unknown) =>
                typeof cell === "number" && Number.isFinite(cell),
            ),
        )
      )
        matrices.push(value as number[][]);
    } catch {
      /* A malformed matrix asks for clarification below. */
    }
  }
  for (const match of text.matchAll(
    /\\begin\{[pbv]?matrix\}([\s\S]*?)\\end\{[pbv]?matrix\}/g,
  )) {
    const matrix = match[1]
      .split(/\\\\/)
      .map((row) => row.split("&").map((cell) => Number(cell.trim())));
    if (matrix.every((row) => row.every(Number.isFinite)))
      matrices.push(matrix);
  }
  if (!matrices.length && context.matrix) matrices.push(context.matrix);
  if (!matrices.length)
    throw new ClarificationError(
      "اكتب عناصر المصفوفة على شكل صفوف داخل أقواس.",
      ["جد محدد ومقلوب المصفوفة [[1,2],[3,4]]"],
    );
  return matrices;
}
export type SequenceInput =
  | {
      kind: "arithmetic";
      first: number;
      ratio: number;
      count: number;
      start: number;
    }
  | {
      kind: "geometric";
      first: number;
      ratio: number;
      count: number;
      start: number;
    }
  | {
      kind: "recurrence";
      first: number;
      a: number;
      b: number;
      count: number;
      start: number;
    };
export function extractSequence(text: string): SequenceInput {
  const first = numericMatch(
    text,
    `(?:حدها الاول|الحد الاول|اول حد|u_?1|u\\(1\\))\\s*(?:هو|يساوي|=|:)??\\s*(${NUMBER})`,
  );
  const ratio = numericMatch(
    text,
    `(?:اساسها|اساس|فرقها|نسبتها|r|q)\\s*(?:هو|يساوي|=|:)??\\s*(${NUMBER})`,
  );
  const count =
    numericMatch(text, `(?:اول|مجموع(?: اول)?)\\s*(${NUMBER})\\s*(?:حد|حدا)`) ??
    numericMatch(text, `(?:n|N)\\s*=\\s*(${NUMBER})`);
  const wantsSum = /مجموع|اجمع|جمع الحدود/.test(text);
  const n = count ?? (wantsSum ? undefined : 10);
  const end = requireValue(n, "كم حدًا تريد جمعه؟", [
    "متتالية حسابية حدها الأول 3 وأساسها 4، جد مجموع أول 20 حدًا",
  ]);
  if (/تراجع|u_?\{?n\+1|u\(n\+1\)/.test(text)) {
    const initial =
      numericMatch(
        text,
        `(?:u_?0|u\\(0\\)|حدها الاول)\\s*=??\\s*(${NUMBER})`,
      ) ?? first;
    const a = numericMatch(text, `(?:a)\\s*=\\s*(${NUMBER})`);
    const b = numericMatch(text, `(?:b)\\s*=\\s*(${NUMBER})`);
    return {
      kind: "recurrence",
      first: requireValue(initial, "ما قيمة الحد الابتدائي u₀؟"),
      a: requireValue(a, "اكتب معامل التراجع a في uₙ₊₁ = a uₙ + b."),
      b: requireValue(b, "ما قيمة الثابت b في علاقة التراجع؟"),
      count: end,
      start: 0,
    };
  }
  return {
    kind: /هندسي/.test(text) ? "geometric" : "arithmetic",
    first: requireValue(first, "ما الحد الأول للمتتالية؟"),
    ratio: requireValue(ratio, "ما أساس المتتالية؟"),
    count: end,
    start: 1,
  };
}
export function extractPoints(
  text: string,
): { name: string; value: [number, number, number] }[] {
  const out: { name: string; value: [number, number, number] }[] = [];
  const pattern = new RegExp(
    `([A-Z])?\\s*\\(\\s*(${NUMBER})\\s*,\\s*(${NUMBER})\\s*,\\s*(${NUMBER})\\s*\\)`,
    "g",
  );
  for (const point of text.matchAll(pattern))
    out.push({
      name: point[1] ?? String.fromCharCode(65 + out.length),
      value: [Number(point[2]), Number(point[3]), Number(point[4])],
    });
  return out;
}
export interface UrnInput {
  colors: { name: string; count: number }[];
  count: number;
  mode: "simultaneous" | "successive_without_rep" | "successive_with_rep";
}
export function extractUrn(text: string): UrnInput {
  const colors: UrnInput["colors"] = [];
  const pattern =
    /(\d+)\s*(?:كرات|كر[ةه]|كرت[اين]+)?\s*(حمراء|حمر|احمر|حمرا|بيضاء|بيض|ابيض|بيضا|سوداء|سود|اسود|سودا|خضراء|خضر|اخضر|زرقاء|زرق|ازرق|صفراء|صفر|اصفر)/g;
  for (const color of text.matchAll(pattern))
    colors.push({ count: Number(color[1]), name: color[2] });
  const count = /كرتان|كرتين/.test(text)
    ? 2
    : /كر[ةه] واحدة/.test(text)
      ? 1
      : numericMatch(text, "(?:سحبت|سحب|نسحب)\\s*(\\d+)");
  if (!colors.length)
    throw new ClarificationError("كم كرة من كل لون، وكم كرة سُحبت؟", [
      "كيس فيه 3 كرات حمراء و5 بيضاء سُحبت كرتان معًا، جد احتمال اختلاف اللون",
    ]);
  return {
    colors,
    count: requireValue(count, "كم كرة سُحبت من الكيس؟"),
    mode: /دون اعادة|بدون اعادة/.test(text)
      ? "successive_without_rep"
      : /مع اعادة|مع الارجاع/.test(text)
        ? "successive_with_rep"
        : /معا|معا|ان واحد/.test(text)
          ? "simultaneous"
          : (() => {
              throw new ClarificationError(
                "هل السحب معًا أم متتاليًا؟ وهل تعاد الكرة؟",
                [
                  "السحب معًا دون إعادة",
                  "السحب متتاليًا مع إعادة",
                  "السحب متتاليًا دون إعادة",
                ],
              );
            })(),
  };
}
export function extractScientific(text: string): string {
  const stripped = text
    .replace(
      /(?:احسبلي|احسب|جد|قيمة|كم|يساوي|نتيجة|درجة|راديان|غراد|جراد|لي|بالتفصيل|عدديا|تقريبا|تقريبي|تقريب)/g,
      "",
    )
    .trim();
  if (/[\u0600-\u06ff]/.test(stripped) || !stripped)
    throw new ClarificationError("هل تقصد حساب قيمة عددية أم حل معادلة؟", [
      "احسب sin(30°)+√2",
      "حل المعادلة 2x+3=7",
    ]);
  return stripped;
}
