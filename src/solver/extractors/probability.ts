import { mathInstructionText } from "../textbook";
import { ClarificationError, type SolverContext } from "../types";
import type {
  ProbabilityComparison,
  ProbabilityRequest,
  UrnModel,
  UrnQuery,
} from "../probabilityTypes";
import { exact } from "../../utils/probabilityExact";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NUMBER = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?";
const ATOM = `(?:\\([\\d.eE+*/^()%\\s-]+\\)|${NUMBER})\\s*%?`;
const VALUE = `${ATOM}(?:\\s*[+*/^-]\\s*${ATOM})*`;
export function assigned(text: string, names: string): string | undefined {
  const m = text.match(
    new RegExp(
      `(?:^|[\\s,،])(?:و)?(?:${names})(?:\\s*(?:=|:|هو|يساوي)\\s*|\\s+)(${VALUE})(?![\\d.A-Za-z_+*/^-])`,
    ),
  );
  return m?.[1]?.trim();
}
export function splitList(source: string): string[] {
  const out: string[] = [];
  let start = 0,
    depth = 0;
  for (let i = 0; i < source.length; i++) {
    if ("([".includes(source[i])) depth++;
    if (")]".includes(source[i])) depth--;
    if (depth < 0) throw new ClarificationError("أقواس الجدول غير متوازنة.");
    if (
      (source[i] === "," ||
        source[i] === "،" ||
        source[i] === "؛" ||
        source[i] === ";") &&
      depth === 0
    ) {
      out.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (depth !== 0) throw new ClarificationError("أكمل أقواس الجدول.");
  out.push(source.slice(start).trim());
  if (out.some((s) => !s))
    throw new ClarificationError("في الجدول خانة فارغة؛ اكتب كل القيم صراحة.");
  return out;
}
export function namedList(text: string, names: string): string[] | undefined {
  const m = new RegExp(
    `(?:^|[\\s,،])(?:و)?(?:${names})\\s*(?:=|:)\\s*\\[`,
  ).exec(text);
  if (!m) return;
  const start = m.index + m[0].length;
  let depth = 1,
    end = start;
  for (; end < text.length; end++) {
    if (text[end] === "[") depth++;
    if (text[end] === "]" && --depth === 0) break;
    if (text[end] === "]" && depth < 0) break;
  }
  if (depth)
    throw new ClarificationError("أكمل القوس المربع الأخير في الجدول.");
  return splitList(text.slice(start, end));
}
function numeric(text: string, names: string) {
  const value = assigned(text, names);
  return value === undefined ? undefined : exact(value).number();
}
export function comparison(text: string): ProbabilityComparison {
  const explicit = text.match(/(?:X|Y|k|العدد)\s*(>=|<=|≥|≤|>|<|=)\s*[+-]?\d/);
  if (explicit)
    return (
      {
        ">=": "ge",
        "<=": "le",
        "≥": "ge",
        "≤": "le",
        ">": "gt",
        "<": "lt",
        "=": "eq",
      } as Record<string, ProbabilityComparison>
    )[explicit[1]];
  if (/او اكثر|علي الاقل|على الاقل|ليس اقل|لا يقل/.test(text)) return "ge";
  if (/او اقل|علي الاكثر|على الاكثر|لا يزيد/.test(text)) return "le";
  if (/اكبر|اكثر من|تجاوز/.test(text)) return "gt";
  if (/اقل|دون ان يبلغ/.test(text)) return "lt";
  return "eq";
}
const canonicalColors: Record<string, string> = {
  حمر: "حمراء",
  احمر: "حمراء",
  حمرا: "حمراء",
  بيضاء: "بيضاء",
  بيض: "بيضاء",
  ابيض: "بيضاء",
  بيضا: "بيضاء",
  سوداء: "سوداء",
  سود: "سوداء",
  اسود: "سوداء",
  سودا: "سوداء",
  خضراء: "خضراء",
  خضر: "خضراء",
  اخضر: "خضراء",
  زرقاء: "زرقاء",
  زرق: "زرقاء",
  ازرق: "زرقاء",
  صفراء: "صفراء",
  صفر: "صفراء",
  اصفر: "صفراء",
  برتقالية: "برتقالية",
  بنفسجية: "بنفسجية",
};
const COLOR =
  "حمراء|حمر|احمر|حمرا|بيضاء|بيض|ابيض|بيضا|سوداء|سود|اسود|سودا|خضراء|خضر|اخضر|زرقاء|زرق|ازرق|صفراء|صفر|اصفر|برتقالية|بنفسجية";
export const canonicalColor = (s: string) =>
  canonicalColors[s.replace(/^ال/, "")] || s.replace(/^ال/, "").trim();
export function readColors(text: string): UrnModel["colors"] {
  const custom = namedList(text, "الالوان|الوان");
  if (custom)
    return custom.map((item) => {
      const m = item.match(/^([^:]{1,40}):\s*([+-]?\d+(?:\.\d+)?)$/);
      if (!m)
        throw new ClarificationError(
          "اكتب الألوان هكذا: الألوان=[حمراء:3,بيضاء:5].",
        );
      return { name: canonicalColor(m[1].trim()), count: Number(m[2]) };
    });
  const pattern = new RegExp(
    `([+-]?\\d+(?:\\.\\d+)?)\\s*(?:كرات|كر[ةه]|كرت[اين]+)?\\s*(${COLOR})(?![\\u0621-\\u063a\\u0641-\\u064a])`,
    "g",
  );
  const colors: UrnModel["colors"] = [];
  for (const m of text.matchAll(pattern))
    colors.push({ name: canonicalColor(m[2]), count: Number(m[1]) });
  return colors;
}
function drawMode(
  text: string,
  previous?: UrnModel["mode"],
): UrnModel["mode"] | undefined {
  const withRep = /مع (?:ال)?اعادة|مع (?:ال)?ارجاع|بارجاع/.test(text),
    without =
      /دون (?:ال)?اعادة|بدون (?:ال)?اعادة|دون (?:ال)?ارجاع|بدون (?:ال)?ارجاع/.test(
        text,
      ),
    together = /معا|ان واحد|متزامن/.test(text);
  if (withRep && (without || together))
    throw new ClarificationError(
      "ورد نمطان متناقضان للسحب. اختر معًا دون إعادة، أو متتاليًا دون إعادة، أو متتاليًا مع إعادة.",
    );
  if (together) return "simultaneous";
  if (withRep) return "successive_with_rep";
  if (without) {
    if (/متتالي|بالتوالي|علي التوالي|تتابع/.test(text))
      return "successive_without_rep";
    if (previous)
      return previous === "simultaneous" ? previous : "successive_without_rep";
    throw new ClarificationError(
      "دون إعادة لا يحدد الترتيب وحده. هل السحب معًا أم متتاليًا؟",
      ["السحب معًا دون إعادة", "السحب متتاليًا دون إعادة"],
    );
  }
  return;
}
function moment(
  text: string,
): "mean" | "variance" | "sigma" | "second" | undefined {
  const flags: [boolean, "mean" | "variance" | "sigma" | "second"][] = [
    [/انحراف|sigma|σ/.test(text), "sigma"],
    [/تباين|\bV\s*\(/.test(text), "variance"],
    [/العزم الثاني|E\s*\(\s*[XY]\s*\^\s*\(?2/.test(text), "second"],
    [/امل|توقع|E\s*\(\s*[XY]\s*\)/.test(text), "mean"],
  ];
  const selected = flags.filter(([match]) => match);
  return selected.length === 1 ? selected[0][1] : undefined;
}
function eventKey(source: string) {
  const s = source
    .replace(/\\(?:cap|land)/g, "&")
    .replace(/\\(?:cup|lor)/g, "+")
    .replace(/\\mid/g, "|")
    .replace(/\\(?:overline|bar)\s*\{?([A-Z])\}?/g, "$1'")
    .replace(/[∩⋂]/g, "&")
    .replace(/[∪⋃]/g, "+")
    .replace(/\s|[{}]/g, "");
  if (!/^[A-Z](?:[&|+][A-Z]|')?$/.test(s))
    throw new ClarificationError(
      "استخدم رموز أحداث بحرف كبير مثل P(A)، P(A∩B)، P(A|B)، P(A').",
    );
  return s;
}
function readEvents(text: string) {
  const given: Record<string, string> = {};
  const re = new RegExp(
    `P\\s*\\(([^()]+)\\)\\s*=\\s*(${VALUE})(?![\\d.A-Za-z_+*/^-])`,
    "g",
  );
  for (const m of text.matchAll(re)) {
    const key = eventKey(m[1]);
    if (key in given && !exact(given[key]).eq(exact(m[2])))
      throw new ClarificationError("للاحتمال نفسه قيمتان مختلفتان في السؤال.");
    given[key] = m[2];
  }
  return given;
}
function parseUrn(text: string, context: SolverContext): ProbabilityRequest {
  const requestStart = text.search(
      /(?:جد|احسب|ما احتمال|قانون|المتحول|المتغير|احتمال)/,
    ),
    data = requestStart >= 0 ? text.slice(0, requestStart) : text;
  let colors = readColors(data),
    old = context.probability?.urn;
  if (!colors.length && /كيس|صندوق|فيه|يحتوي|الالوان\s*=/.test(text))
    colors = readColors(text);
  // A missing-mode clarification has no solved model yet; take only its data, never append its event text.
  if (
    !colors.length &&
    !old &&
    context.lastEngine === "probabilityEngine" &&
    context.lastPrompt
  ) {
    const prefix = context.lastPrompt.split(
      /(?:جد|احسب|احتمال|قانون|المتحول)/,
    )[0];
    colors = readColors(prefix);
  }
  const n = numeric(text, "n|N");
  if (!colors.length && n !== undefined)
    colors = [{ name: "جميع الكرات", count: n }];
  if (!colors.length) colors = old?.colors || [];
  if (!colors.length)
    throw new ClarificationError(
      "كم كرة من كل لون؟ اكتب أعدادًا صريحة أو افتح لوحة الاحتمالات.",
      [
        "كيس فيه 3 كرات حمراء و5 بيضاء، سحبت كرتان معًا، جد احتمال اختلاف اللون",
      ],
    );
  const drawSource = /سحب|r\s*=/.test(text) ? text : data;
  let count =
    numeric(text, "r") ??
    (/(?:سحبت|سحب|نسحب|السحب)\s*(?:كرتان|كرتين)/.test(drawSource)
      ? 2
      : undefined) ??
    numeric(drawSource, "عدد السحبات|عدد الكرات المسحوبة");
  const numbered = drawSource.match(
    /(?:سحبت|سحب|نسحب|السحب)\s*([+-]?\d+(?:\.\d+)?)\s*(?:كرات|كرة|مرات)?/,
  );
  if (count === undefined && numbered) count = Number(numbered[1]);
  if (
    count === undefined &&
    /(?:سحبت|سحب|نسحب)\s*كر[ةه](?:\s+1)?(?![\u0621-\u063a\u0641-\u064a])/.test(
      drawSource,
    )
  )
    count = 1;
  if (count === undefined && /كرتان|كرتين/.test(data)) count = 2;
  if (
    count === undefined &&
    /(?:سحب|نسحب|سحبت)(?:\s+عشوائيا)?\s*(?:كر[ةه]\s+1|1\s+كر[ةه])/.test(
      drawSource,
    )
  )
    count = 1;
  if (count === undefined) count = old?.count;
  if (count === undefined && context.lastPrompt) {
    const m = context.lastPrompt.match(/(?:سحبت|سحب|نسحب)\s*(\d+)|كرتان|كرتين/);
    if (m) count = m[1] ? Number(m[1]) : 2;
  }
  if (count === undefined)
    throw new ClarificationError(
      "كم كرة سُحبت؟ حدّد r أو اكتب مثلًا: سحب كرتين.",
    );
  const mode =
    drawMode(text, old?.mode) || (count === 1 ? "simultaneous" : old?.mode);
  if (!mode)
    throw new ClarificationError(
      "هل السحب معًا، أم متتاليًا دون إعادة، أم متتاليًا مع إعادة؟",
      [
        "السحب معًا دون إعادة",
        "السحب متتاليًا مع إعادة",
        "السحب متتاليًا دون إعادة",
      ],
    );
  const model: UrnModel = {
    colors,
    count,
    mode,
    ...(old?.target ? { target: old.target } : {}),
  };
  let eventText = requestStart >= 0 ? text.slice(requestStart) : text;
  if (
    !/احتمال|قانون|فضاء|n\s*\(|لون|X\s*[<>=]|امل|تباين|انحراف/.test(eventText)
  ) {
    if (old && context.probability?.urnQuery)
      return { kind: "urn", model, query: { ...context.probability.urnQuery } };
    if (context.lastPrompt) {
      const at = context.lastPrompt.search(/جد|احسب|احتمال|قانون/);
      if (at >= 0) eventText = context.lastPrompt.slice(at);
    }
  }
  eventText = eventText.replace(
    new RegExp(
      `(^|[^\\u0621-\\u063a\\u0641-\\u064a])(?:ال)?(${COLOR})(?=$|[^\\u0621-\\u063a\\u0641-\\u064a])`,
      "g",
    ),
    (_, before: string, name: string) => before + canonicalColor(name),
  );
  const query: UrnQuery = { type: "color" };
  if (/كل الاحداث|جميع الاحتمالات|تراكيب الالوان/.test(eventText))
    query.type = "all-events";
  else if (
    /الفضاء العيني|n\s*\(\s*(?:Ω|omega)\s*\)|حجم (?:فضاء|الفضاء)|عدد (?:الامكانيات|الحالات الكلية)/.test(
      eventText,
    ) &&
    !/احتمال|متحول|قانون/.test(eventText)
  )
    query.type = "count";
  else if (/قانون|متحول|متغير|امل|تباين|انحراف|X\(Ω\)/.test(eventText)) {
    query.type = "law";
    query.moment = moment(eventText);
  } else if (/نفس اللون|لون واحد|متشابه|متماثل/.test(eventText))
    query.type = "same";
  else if (/(?:جميع|كل)[^،.]*مختلف|مختلفة اثنتين/.test(eventText))
    query.type = "all-distinct";
  else if (
    /ليست كلها|ليست جميعها|الا تكون كلها|لونين علي الاقل|لونين على الاقل/.test(
      eventText,
    )
  )
    query.type = "different";
  else if (/مختلف|اختلاف/.test(eventText)) {
    if (count > 2)
      throw new ClarificationError(
        "مع أكثر من كرتين: هل تقصد وجود لونين على الأقل، أم أن كل الكرات مختلفة الألوان اثنتين اثنتين؟",
        [
          "احتمال ألا تكون كلها من لون واحد",
          "احتمال أن تكون جميع الكرات مختلفة الألوان",
        ],
      );
    query.type = "different";
  }
  if (
    query.type === "count" ||
    query.type === "all-events" ||
    query.type === "same" ||
    query.type === "different" ||
    query.type === "all-distinct"
  ) {
    query.complement = /متمم|مكمل/.test(eventText);
    return { kind: "urn", model, query };
  }
  const positions = {
    first: eventText.match(/الاول[يى]|اول سحبة/),
    second: eventText.match(/الثاني[ةه]|ثاني سحبة/),
  };
  const afterPosition = (match: RegExpMatchArray | null) => {
    if (!match || match.index === undefined) return;
    const start = match.index + match[0].length;
    let tail = eventText.slice(start);
    const stop = tail.search(/الاول[يى]|الثاني[ةه]|اول سحبة|ثاني سحبة/);
    if (stop >= 0) tail = tail.slice(0, stop);
    const named = colors.filter((c) => tail.includes(c.name));
    return named.length
      ? named.sort((a, b) => tail.indexOf(a.name) - tail.indexOf(b.name))[0]
          .name
      : undefined;
  };
  const firstColor = afterPosition(positions.first),
    secondColor = afterPosition(positions.second);
  if (firstColor && secondColor) {
    const conditionAt = eventText.search(/شرط|علما|اذا علم|بعد العلم/);
    let conditionalOn: "first" | "second" | undefined;
    if (conditionAt >= 0) {
      const clause = eventText.slice(conditionAt);
      if (
        /الاول[يى]|اول سحبة/.test(clause) &&
        !/الثاني[ةه]|ثاني سحبة/.test(clause)
      )
        conditionalOn = "first";
      else if (
        /الثاني[ةه]|ثاني سحبة/.test(clause) &&
        !/الاول[يى]|اول سحبة/.test(clause)
      )
        conditionalOn = "second";
      else
        throw new ClarificationError(
          "حدّد أي السحبتين هو الشرط المرصود: الأولى أم الثانية؟",
        );
    }
    return {
      kind: "urn",
      model,
      query: {
        type: "ordered",
        sequence: [firstColor, secondColor],
        conditionalOn,
      },
    };
  }
  if (/شرط|علما|اذا علم/.test(eventText))
    throw new ClarificationError(
      "حدّد لون الأولى ولون الثانية والحدث المشروط به، أو اكتب احتمالات الأحداث P(A)، P(B)، P(A∩B).",
    );
  const requestedColors = colors.filter((c) =>
    new RegExp(
      `(?:ال)?${escape(c.name)}(?![\\u0621-\\u063a\\u0641-\\u064a])`,
    ).test(eventText),
  );
  if (requestedColors.length > 1) {
    if (comparison(eventText) !== "eq")
      throw new ClarificationError(
        "الأحداث متعددة الألوان ذات حدود مختلفة تحتاج تحديدًا أدق. اطلب تركيبًا كاملًا بأعداد محددة أو قانون لون واحد.",
      );
    const composition = requestedColors.map((c) => {
      const name = escape(c.name),
        m = eventText.match(
          new RegExp(`(\\d+)\\s*(?:كرات|كر[ةه])?\\s*(?:ال)?${name}`),
        );
      return {
        color: c.name,
        count: m
          ? Number(m[1])
          : new RegExp(`كرتان\\s*(?:ال)?${name}|كرتين\\s*(?:ال)?${name}`).test(
                eventText,
              )
            ? 2
            : new RegExp(`كر[ةه]\\s*(?:ال)?${name}`).test(eventText)
              ? 1
              : NaN,
      };
    });
    if (
      composition.some((c) => !Number.isSafeInteger(c.count)) ||
      composition.reduce((s, c) => s + c.count, 0) !== count
    )
      throw new ClarificationError(
        "ذُكر أكثر من لون. حدّد عدد كل لون في تركيب كامل مجموع أعداده يساوي عدد السحبات؛ لا يكفي عدّ لون واحد هنا.",
      );
    return { kind: "urn", model, query: { type: "composition", composition } };
  }
  const targetMatch = eventText.match(
    /اللون\s*(?:المطلوب|المحدد)?\s*[:=]\s*([^،,؛;\n]+)/,
  );
  const mentions = colors.filter((c) =>
    new RegExp(
      `(?:ال)?${escape(c.name)}(?![\\u0621-\\u063a\\u0641-\\u064a])`,
    ).test(eventText),
  );
  const known = eventText.match(
    new RegExp(`(?:ال)?(${COLOR})(?![\\u0621-\\u063a\\u0641-\\u064a])`),
  );
  const variableColor = text.match(
    new RegExp(
      `\\b[XY]\\b[^؛;\\n]{0,100}?عدد\\s+(?:ال)?كرات\\s+(?:ال)?(${COLOR})`,
    ),
  )?.[1];
  const target = targetMatch
    ? canonicalColor(targetMatch[1].trim().replace(/[.؟?]+$/, ""))
    : mentions.length === 1
      ? mentions[0].name
      : known
        ? canonicalColor(known[1])
        : variableColor
          ? canonicalColor(variableColor)
          : old?.target;
  if (!target)
    throw new ClarificationError(
      "أي لون يعدّه X؟ اختر اللون المطلوب؛ لا أختار لونًا خفيًا. ",
      colors.map((c) => `احسب قانون احتمال عدد الكرات من اللون ${c.name}`),
    );
  query.color = target;
  model.target = target;
  if (query.type === "color") {
    query.comparison = comparison(eventText);
    query.complement = /متمم|مكمل/.test(eventText);
    query.first = /الاول[يى]|اول سحبة/.test(eventText);
    const explicit = eventText.match(
      /(?:X|k|العدد)\s*(?:>=|<=|≥|≤|>|<|=)\s*([+-]?\d+(?:\.\d+)?)/,
    );
    const kSource = eventText.replace(/P\([^)]*\)/g, "");
    const value =
      explicit?.[1] ||
      kSource.match(
        /([+-]?\d+(?:\.\d+)?)\s*(?:كرات|كر[ةه]|من|حمراء|بيضاء|سوداء|خضراء|زرقاء|صفراء|او اكثر|او اقل)/,
      )?.[1] ||
      kSource.match(
        /(?:بالضبط|الاقل|الاكثر|اقل من|اكثر من|اكبر من)\s*([+-]?\d+(?:\.\d+)?)/,
      )?.[1];
    query.k =
      value === undefined
        ? /كلها|جميعها/.test(eventText)
          ? count
          : /كرتان|كرتين/.test(eventText)
            ? 2
            : /كر[ةه](?:\s|$)|واحدة/.test(eventText)
              ? 1
              : undefined
        : Number(value);
    if (query.k === undefined && count === 1) query.k = 1;
    if (query.k === undefined && !query.first)
      throw new ClarificationError(
        "كم كرة من اللون المطلوب، وما المقارنة؟ اكتب مثلًا X=1 أو X≥1 (واحدة أو أكثر) أو X<2 (أقل من اثنتين).",
      );
  }
  return { kind: "urn", model, query };
}
export function extractProbabilityRequest(
  text: string,
  context: SolverContext,
): ProbabilityRequest {
  text = text.replace(/\bp(?=\s*\(\s*[A-Z])/g, "P").replace(/\\%/g, "%");
  const old = context.probability;
  if (/اشرح|وضح|ما هي/.test(text) && !/[0-9\[]|P\s*\(/.test(text))
    return {
      kind: "theorem",
      topic: /فضاء|سحب|عد/.test(text)
        ? "counting"
        : /شرط|بايز|كلي/.test(text)
          ? "conditional"
          : /استقلال|مستقل/.test(text)
            ? "independence"
            : /شجرة|مسار/.test(text)
              ? "tree"
              : /متحول|متغير|تباين|امل/.test(text)
                ? "law"
                : "axioms",
    };
  // Definition lists and event notation take precedence over keywords such as «صندوق» or «تباين».
  const joint = namedList(text, "J|الجدول المشترك");
  if (
    joint ||
    (/استقلال.*(?:متحول|متغير)|(?:المتحولان|المتغيران).*مستقل/.test(text) &&
      old?.joint)
  ) {
    const x = namedList(text, "X") || old?.joint?.x,
      y = namedList(text, "Y") || old?.joint?.y;
    const matrix =
      joint?.map((row) => {
        if (!row.startsWith("[") || !row.endsWith("]"))
          throw new ClarificationError("صفوف J يجب أن تكون بين أقواس مربعة.");
        return splitList(row.slice(1, -1));
      }) || old?.joint?.matrix;
    if (!x || !y || !matrix)
      throw new ClarificationError(
        "اكتب X=[0,1]، Y=[0,1]، J=[[1/4,1/4],[1/4,1/4]] لفحص استقلال المتحولين.",
      );
    return { kind: "joint", model: { x, y, matrix } };
  }
  const weights = namedList(text, "q|اوزان|الاوزان"),
    conditionals = namedList(text, "p|الاحتمالات الشرطية");
  if (
    weights ||
    /احتمال كلي|الاحتمال الكلي|بايز|شجرة انتاج|صندوقان|الصندوق الاول/.test(text)
  ) {
    let q = weights,
      p = conditionals,
      labels: string[] | undefined;
    if (!p && /الصندوق الاول.*الصندوق الثاني/.test(text)) {
      const segments = text.split(/الصندوق\s*(?:الاول|الثاني|الثالث)/).slice(1),
        targetWord = text
          .slice(Math.max(0, text.lastIndexOf("احتمال")))
          .match(new RegExp(COLOR))?.[0];
      if (!targetWord)
        throw new ClarificationError(
          "ما لون الكرة أو الحدث الذي تريد احتماله؟ لا يُختار اللون الأحمر تلقائيًا.",
        );
      const target = canonicalColor(targetWord);
      const boxes = segments.map((s) =>
        readColors(s.split(/احتمال|اختيار|جد|احسب/)[0]),
      );
      if (boxes.length >= 2 && boxes.every((b) => b.length)) {
        p = boxes.map((box) => {
          const n = box.reduce((s, c) => s + c.count, 0),
            a = box.find((c) => c.name === target)?.count || 0;
          if (!n) throw new ClarificationError("أحد الصناديق فارغ.");
          return `${a}/${n}`;
        });
        labels = boxes.map((_, i) => `الصندوق ${i + 1}`);
        if (!q && /بالتساوي|متساوي(?:ة)? الاحتمال/.test(text))
          q = boxes.map(() => `1/${boxes.length}`);
      }
    }
    q = q || old?.mixture?.weights;
    p = p || old?.mixture?.conditionals;
    if (!q || !p)
      throw new ClarificationError(
        "حدّد أوزان اختيار الفروع q واحتمال B في كل فرع p؛ لا أفترض أن الصناديق متساوية الاختيار.",
        [
          "الاحتمال الكلي q=[1/3,2/3]، p=[1/2,1/4]",
          "بايز q=[1/3,2/3]، p=[1/2,1/4]، احسب P(H1|B)",
        ],
      );
    const wantsPosterior = /بايز|P\s*\(\s*H_?\d+\s*\|/.test(text),
      posteriorValue = text.match(/H_?(\d+)/)?.[1] || assigned(text, "h|الفرع");
    if (wantsPosterior && posteriorValue === undefined)
      throw new ClarificationError(
        "أي فرع تريد احتماله بعد وقوع B؟ حدّد مثلًا H1 أو H2.",
        q
          .slice(0, 3)
          .map(
            (_, i) =>
              `بايز q=[${q!.join(",")}]، p=[${p!.join(",")}]، احسب P(H${i + 1}|B)`,
          ),
      );
    const posterior = wantsPosterior ? Number(posteriorValue) : undefined;
    return {
      kind: "mixture",
      model: { weights: q, conditionals: p, labels },
      posterior,
    };
  }
  const totalCases =
    text.match(
      new RegExp(`n\\s*\\(\\s*(?:Ω|omega)\\s*\\)\\s*=\\s*(${VALUE})`),
    )?.[1] || assigned(text, "عدد عناصر الفضاء العيني|عدد الحالات الكلية");
  const favorableMatch = text.match(
      new RegExp(`n\\s*\\(\\s*([A-Z])\\s*\\)\\s*=\\s*(${VALUE})`),
    ),
    favorableCases =
      favorableMatch?.[2] ||
      assigned(text, "عدد الحالات الملائمة|الحالات الملائمة");
  if (totalCases && favorableCases) {
    if (!/متساوي[ةو]? الاحتمال|متساوية في الاحتمال|كلاسيكي/.test(text))
      throw new ClarificationError(
        "هل الحالات الأولية متساوية الاحتمال؟ لا تكفي الأعداد وحدها في تجربة غير متكافئة.",
        [
          `الاحتمال الكلاسيكي: n(Ω)=${totalCases}، n(${favorableMatch?.[1] || "A"})=${favorableCases}، الحالات متساوية الاحتمال، احسب الاحتمال`,
        ],
      );
    return {
      kind: "classical",
      total: totalCases,
      favorable: favorableCases,
      event: favorableMatch?.[1] || "A",
      complement: /متمم|مكمل/.test(text),
    };
  }
  const given = readEvents(text);
  if (
    Object.keys(given).length ||
    (/P\s*\(\s*[A-Z]\s*(?:\)|[∩∪&+|]|\\(?:cap|cup|mid))|اتحاد|تقاطع|متمم|مكمل|الحدثان|الحدثين|مستقلان|متنافي/.test(
      text,
    ) &&
      !/كرات|كرت|ثنائي/.test(text))
  ) {
    const question = mathInstructionText(
      text.slice(
        Math.max(
          text.lastIndexOf("احسب"),
          text.lastIndexOf("جد"),
          text.lastIndexOf("هل"),
          0,
        ),
      ),
    );
    const notation = [...question.matchAll(/P\s*\(([^()]+)\)(?!\s*=)/g)].slice(
        -1,
      )[0]?.[1],
      key = notation ? eventKey(notation) : undefined;
    const names = [
      ...new Set(
        (
          key ||
          question.match(/\b[A-Z]\b/g)?.join("") ||
          Object.keys(given).join("") ||
          Object.keys(old?.events || {}).join("")
        ).match(/[A-Z]/g) || ["A", "B"],
      ),
    ];
    const first = names[0] || "A",
      second = names[1] || "B";
    let operation:
      | "union"
      | "intersection"
      | "conditional"
      | "complement"
      | "independence"
      | "axioms" = "axioms";
    if (/استقلال|مستقل/.test(question)) operation = "independence";
    else if (
      key?.includes("|") ||
      /شرطي|شرط|علما|اذا وقع|بعد وقوع/.test(question)
    )
      operation = "conditional";
    else if (key?.includes("'") || /متمم|مكمل|عدم وقوع/.test(question))
      operation = "complement";
    else if (
      key?.includes("+") ||
      /اتحاد|احدهما علي الاقل|احدهما على الاقل/.test(question)
    )
      operation = "union";
    else if (key?.includes("&") || /تقاطع|وقوعهما معا/.test(question))
      operation = "intersection";
    const merged = Object.keys(given).length ? given : old?.events || {};
    const assumption =
      /متنافي/.test(text) &&
      !/هل|تحقق|اثبت|بين ان|برهن|غير\s*متنافي|ليسا\s*متنافي|ليس[اا]? متنافي/.test(
        text,
      )
        ? "disjoint"
        : /مستقل(?:ان|ين)|مستقلان معطي|بفرض الاستقلال|بفرض استقلال/.test(
              text,
            ) &&
            !/هل|فحص|اختبر|تحقق|اثبت|بين ان|برهن|غير\s*مستقل|ليسا\s*مستقل|ليس[اا]? مستقل/.test(
              text,
            )
          ? "independent"
          : undefined;
    return {
      kind: "events",
      given: merged,
      operation,
      first,
      second,
      assumption,
    };
  }
  const density = /كثاف|منحني|منحنى/.test(text),
    normal =
      /طبيعي|غاوسي/.test(text) ||
      (old?.active === "normal" &&
        /mu|sigma|σ|μ|X\s*[<>]|اقل|اكثر|[EV]\s*\(\s*X|امل|تباين|انحراف|كثاف|منحني|منحنى/.test(
          text,
        ));
  if (normal) {
    const mu = numeric(text, "mu|μ|المتوسط|متوسطه") ?? old?.normal?.mu,
      sigma =
        numeric(text, "sigma|σ|انحرافه|الانحراف المعياري") ??
        old?.normal?.sigma;
    if (mu === undefined || sigma === undefined)
      throw new ClarificationError("حدّد المتوسط μ والانحراف المعياري σ.", [
        "التوزيع الطبيعي mu=0 sigma=1 x=1",
      ]);
    const x =
      numeric(text, "x") ??
      (text.match(
        new RegExp(`X\\s*(?:<=|>=|<|>|≤|≥|=)\\s*(${NUMBER})`),
      )?.[1] !== undefined
        ? Number(
            text.match(
              new RegExp(`X\\s*(?:<=|>=|<|>|≤|≥|=)\\s*(${NUMBER})`),
            )![1],
          )
        : undefined);
    const interval = text.match(
      new RegExp(`(?:بين|من)\\s*(${NUMBER})\\s*(?:و|الي|الى)\\s*(${NUMBER})`),
    );
    return {
      kind: "normal",
      model: { mu, sigma },
      x,
      a: numeric(text, "a") ?? (interval ? Number(interval[1]) : undefined),
      b: numeric(text, "b") ?? (interval ? Number(interval[2]) : undefined),
      greater: />|اكبر|اكثر|فوق/.test(text),
      density,
      point: /P\s*\(\s*X\s*=/.test(text),
      moment: moment(
        text.replace(
          new RegExp(
            `(?:sigma|σ|انحرافه|الانحراف المعياري)\\s*(?:=|:|هو|يساوي)?\\s*${VALUE}`,
            "g",
          ),
          "",
        ),
      ),
    };
  }
  const lawValues = namedList(text, "X|Y"),
    statValues = namedList(text, "القيم|قيم|values"),
    frequencies = namedList(text, "f|التكرارات|تكرارات"),
    probs = namedList(text, "p|P|الاحتمالات");
  if (lawValues && probs) {
    const symbol = /\bY\s*=\s*\[/.test(text) ? "Y" : "X";
    return {
      kind: "law",
      model: { symbol, values: lawValues, probabilities: probs },
      moment: moment(text),
      generator: /مولد/.test(text),
    };
  }
  if (lawValues && !probs && !frequencies)
    throw new ClarificationError(
      "أعطني احتمالات القيم الجديدة p؛ لا يمكن إعادة استخدام قانون سابق لقيم جديدة دون معطيات.",
    );
  const statistic =
    /احصاء|المدرج التكراري|مدرج تكراري|بيانات|متوسط|وسيط|منوال|تكرارات|جدول التكرار/.test(
      text,
    ) ||
    !!statValues ||
    !!frequencies ||
    (old?.active === "statistics" && /تباين|انحراف|مجموع/.test(text));
  if (statistic && !/ثنائي|كرات|كرت|كيس|صندوق|متحول|متغير/.test(text)) {
    const rawList = text.match(/\[([^\[\]]+)\]/)?.[1];
    const list = statValues || (rawList ? splitList(rawList) : undefined);
    const values =
      list?.map((v) => exact(v).number()) || old?.statistics?.values;
    const freq =
      frequencies?.map((v) => exact(v).number()) ||
      (list ? undefined : old?.statistics?.frequencies);
    if (!values)
      throw new ClarificationError("اكتب البيانات أو جدول القيم والتكرارات.", [
        "احسب إحصاء البيانات [1,2,3,4,5]",
        "القيم=[1,2,3]، التكرارات=[2,3,1]، احسب المتوسط والمدرج التكراري",
      ]);
    const metrics: [
      boolean,
      "mean" | "median" | "variance" | "sigma" | "sum",
    ][] = [
      [/متوسط/.test(text), "mean"],
      [/وسيط/.test(text), "median"],
      [/تباين/.test(text), "variance"],
      [/انحراف/.test(text), "sigma"],
      [/مجموع/.test(text), "sum"],
    ];
    const selected = metrics.filter(([requested]) => requested);
    const metric =
      selected.length === 1 && !/احصاء|مدرج|مصفوف|منوال|عينة|عينه/.test(text)
        ? selected[0][1]
        : undefined;
    return {
      kind: "statistics",
      model: {
        values,
        frequencies: freq,
        exactValues: list || old?.statistics?.exactValues,
      },
      matrix: /مصفوف/.test(text),
      metric,
    };
  }
  const binomial =
    /ثنائي|برنولي|\bB\s*\(/.test(text) ||
    (old?.active === "binomial" &&
      /قانون|امل|تباين|انحراف|X\s*[<>=]|k\s*=|مولد/.test(text));
  if (binomial) {
    const b = text.match(
      new RegExp(`\\bB\\s*\\(\\s*(${NUMBER})\\s*,\\s*(${VALUE})\\s*\\)`),
    );
    const n = numeric(text, "n") ?? (b ? Number(b[1]) : old?.binomial?.n),
      p = assigned(text, "p") ?? b?.[2] ?? old?.binomial?.p;
    if (n === undefined || p === undefined)
      throw new ClarificationError(
        "اكتب n عدد المحاولات وp احتمال الحدث في كل محاولة، مع استقلال المحاولات وثبات p.",
        ["التوزيع الثنائي n=10 p=1/2، احسب P(X>=5)"],
      );
    const bound = text.match(
      /(?:X|k)\s*(?:>=|<=|≥|≤|>|<|=)\s*([+-]?\d+(?:\.\d+)?)/,
    );
    return {
      kind: "binomial",
      model: { n, p },
      k: bound ? Number(bound[1]) : numeric(text, "k"),
      comparison: comparison(text),
      moment: moment(text),
      generator: /مولد/.test(text),
    };
  }
  if (
    old?.law &&
    (old.active === "law" ||
      old.active === "urn" ||
      /[EV]\s*\(\s*[XY]|[XY]\s*=/.test(text)) &&
    /قانون|امل|تباين|انحراف|مولد|\b[EV]\s*\(|(?:Y|X)\s*=/.test(text) &&
    !/كرات|كرت|كيس|صندوق|سحب/.test(text)
  ) {
    const transform = text.match(
      /([XY])\s*=\s*([\dXYeE+*/^().\s-]+?)(?=$|[،,؛;\u0600-\u06ff])/,
    );
    const queried = text.match(/\b[EV]\s*\(\s*([XY])/)?.[1];
    if (queried && queried !== old.law.symbol)
      throw new ClarificationError(
        `القانون النشط هو ${old.law.symbol}؛ أعد إعطاء قانون ${queried} أو اطلب ${old.law.symbol}.`,
      );
    return {
      kind: "law",
      model: old.law,
      moment: moment(text),
      transform: transform?.[2]?.trim(),
      generator: /مولد/.test(text),
    };
  }
  if (
    /كرات|كرت|كيس|صندوق|السحب|سحب|الفضاء العيني|n\s*\(\s*(?:Ω|omega)\s*\)/.test(
      text,
    ) ||
    (old?.active === "urn" && /لون|قانون|امل|تباين|انحراف|X\s*[<>=]/.test(text))
  )
    return parseUrn(text, context);
  if (/اشرح|قانون|قواعد|ما هي/.test(text))
    return {
      kind: "theorem",
      topic: /فضاء|سحب|عد/.test(text)
        ? "counting"
        : /شرط/.test(text)
          ? "conditional"
          : /استقلال/.test(text)
            ? "independence"
            : /شجرة|مسار/.test(text)
              ? "tree"
              : /متحول|متغير|تباين|امل/.test(text)
                ? "law"
                : "axioms",
    };
  if (old?.active === "law" && old.law)
    return {
      kind: "law",
      model: old.law,
      moment: moment(text),
      generator: /مولد/.test(text),
    };
  throw new ClarificationError(
    "حدّد نوع المسألة أو افتح لوحة الاحتمالات لبناء سؤال واضح.",
    [
      "كيس فيه 3 كرات حمراء و5 بيضاء، سحب كرتين معًا، احسب احتمال اختلاف اللون",
      "P(A)=1/2، P(B)=1/3، P(A∩B)=1/6، احسب الاتحاد",
      "المتحول X=[0,1,2]، p=[1/4,1/2,1/4]، احسب الأمل والتباين",
    ],
  );
}
