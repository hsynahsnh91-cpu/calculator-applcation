import {
  normalizeMathTypography,
  stripPromptMarkdown,
  hasMathInstruction,
  splitPromptRequests,
} from "./textbook";
import type { SchoolDocument, SchoolIntent, SchoolPart } from "./schoolTypes";
export function schoolIntent(source: string): SchoolIntent {
  const s = source
    .normalize("NFC")
    .replace(/[\u064b-\u065fـ]/g, "")
    .replace(/[أإآ]/g, "ا");
  if (/اثبت|بين ان|برهن/.test(s)) return "prove";
  if (/تحقق/.test(s)) return "verify";
  if (/استنتج|بدلالة النتيجة|الطلب السابق|النتيجة السابقة/.test(s))
    return "deduce";
  if (/ادرس|حدد|عين|ناقش/.test(s)) return "study";
  if (/ارسم|مثل|نظم جدول/.test(s)) return "draw";
  if (/اكتب/.test(s)) return "write";
  if (/حل(?:\s|$)/.test(s)) return "solve";
  if (/علل|فسر|ماذا تستنتج|اشرح/.test(s)) return "explain";
  return "compute";
}
function outside(source: string, index: number): boolean {
  const stack: string[] = [];
  let dollar = false;
  for (let i = 0; i < index; i++) {
    const c = source[i];
    if (c === "$" && source[i - 1] !== "\\") dollar = !dollar;
    if (dollar) continue;
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
  return !stack.length && !dollar;
}
/** A document describes source order and labels, not mathematical answers. */
export function readSchoolDocument(source: string): SchoolDocument | undefined {
  if (source.length > 7000) return undefined;
  let raw = normalizeMathTypography(source)
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/^\s*#{1,6}\s+/gm, "");
  const formatted =
    /(?:المطلوب|والمطلوب)\s*[:：]|(?:^|\n)\s*(?:المس[اأ]لة|الس[ؤو]ال|الجزء)\s|(?:^|\n)\s*(?:[0-9٠-٩۰-۹]+|[اأإبجدهـ]|I{1,3}|IV|V)\s*[.)]|(?:^|\n)\s*•/.test(
      raw,
    );
  if (!formatted) return;
  raw = raw
    .replace(
      /^[ \t]*(?:المس[اأ]لة|الس[ؤو]ال)[ \t]+(?:[اأ]ول[ى]?|الأول[ى]?|الاول[ىي]?|الثاني[ةه]?|الثالث[ةه]?|الرابع[ةه]?|الخامس[ةه]?|[0-9٠-٩۰-۹]+)(?:[ \t]*[([][0-9٠-٩۰-۹]+[ \t]*(?:درجة|درجات)[)\]])?[ \t]*[:：]?[ \t]*/gm,
      "",
    )
    .replace(/^\s*[([]\s*[0-9٠-٩۰-۹]+\s*(?:درجة|درجات)\s*[)\]]\s*$/gm, "");
  const heading = /(?:^|\n|[،.])?\s*و?المطلوب\s*[:：]/.exec(raw);
  let preamble = heading ? raw.slice(0, heading.index) : "",
    tail = heading ? raw.slice(heading.index + heading[0].length) : raw;
  const marks = [
    ...tail.matchAll(
      /(?:^|\n|\s)([0-9٠-٩۰-۹]{1,2}\s*[.)]|[اأإبجدهـa-e]\s*[)]|I{1,3}\s*[)]|IV\s*[)]|V\s*[)]|•|الجزء\s+(?:الأول|الاول|الثاني|الثالث)\s*[:：]?)(?=\s|[\u0621-\u064a])/g,
    ),
  ].filter((m) => outside(tail, m.index!));
  const blocks: { label: string; body: string }[] = [];
  if (marks.length) {
    const before = tail.slice(0, marks[0].index).trim();
    if (before) {
      if (hasMathInstruction(before)) blocks.push({ label: "", body: before });
      else preamble += "\n" + before;
    }
    marks.forEach((m, i) =>
      blocks.push({
        label: m[1].trim(),
        body: tail
          .slice(m.index! + m[0].length, marks[i + 1]?.index ?? tail.length)
          .trim(),
      }),
    );
  } else if (heading) blocks.push({ label: "", body: tail.trim() });
  else return;
  const parts: SchoolPart[] = [];
  let parent = "",
    section = "";
  for (const b of blocks) {
    if (/^الجزء/.test(b.label)) {
      section = b.label;
      parent = "";
      if (!b.body) continue;
    }
    const body = stripPromptMarkdown(b.body).trim();
    if (!body) continue;
    if (b.label !== "•" && !/^الجزء/.test(b.label)) parent = b.label;
    const label = [
      section,
      b.label === "•" ? parent : "",
      /^الجزء/.test(b.label) ? "" : b.label,
    ]
      .filter(Boolean)
      .join(" ");
    const chunks = splitPromptRequests(body)
      .map((s) => s.trim())
      .filter(Boolean);
    chunks.forEach((text, i) => {
      const normalized = text.replace(/[أإآ]/g, "ا");
      const setup =
        !hasMathInstruction(normalized) &&
        /نعيد|تجربة جديدة|ليكن|لتكن|نعرف|نضع|نسحب/.test(normalized);
      parts.push({
        label,
        title: text.slice(0, 1000),
        text,
        intent: setup ? "setup" : schoolIntent(text),
        depends:
          i > 0 ||
          /استنتج|النتيجة السابقة|الطلب السابق|الجملة السابقة|المصفوفة السابقة|الارتفاع السابق|البعد السابق|بدلالة/.test(
            normalized,
          ),
        setup,
      });
    });
  }
  return parts.length
    ? { preamble: stripPromptMarkdown(preamble).trim(), parts }
    : undefined;
}
