import { normalizeMathTypography } from "../solver/textbook";

const easternArabicDigits = "٠١٢٣٤٥٦٧٨٩";
const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
const superscripts = "⁰¹²³⁴⁵⁶⁷⁸⁹";

function translateDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (digit) => String(easternArabicDigits.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)));
}

function translateSuperscripts(text: string): string {
  return text.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (value) => {
    const exponent = [...value]
      .map((character) => superscripts.indexOf(character))
      .join("");
    return `^${exponent}`;
  });
}

/**
 * Normalizes only unambiguous OCR typography.  It deliberately does not turn
 * a letter into a number or invent a denominator: scanned books still need an
 * editor and the analyzer receives `needs_review` when text is uncertain.
 */
export function normalizeScannedText(source: string): string {
  const normalized = translateSuperscripts(
    translateDigits(normalizeMathTypography(source)),
  );
  return normalized
    .replace(/[×✕✖]/g, "*")
    .replace(/[÷∕]/g, "/")
    .replace(/[−–—﹣－]/g, "-")
    .replace(/[≤⩽]/g, "<=")
    .replace(/[≥⩾]/g, ">=")
    .replace(/[≠]/g, "!=")
    .replace(/[∕]/g, "/")
    .replace(/[∫]/g, "int")
    .replace(/[∑]/g, "sum")
    .replace(/[πϖ]/g, "pi")
    .replace(/[√]/g, "sqrt")
    .replace(/\b(?:Sqrt|SQRT|sqrt)\s*\(?/g, "sqrt(")
    .replace(/\b(?:ln|In)\s*/g, "ln ")
    .replace(/([A-Za-z0-9)])\s*([⁄/])\s*([A-Za-z0-9(])/g, "$1/$3")
    .replace(/\b([A-Za-z])\s*\^\s*\(?\s*([0-9]+)\s*\)?/g, "$1^$2")
    .replace(/\s*([=+*/^<>])\s*/g, " $1 ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function sortSimpleSum(value: string): string {
  const compact = value.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9_().^*/+\-]+$/.test(compact)) return value;
  const terms = compact.match(/[+-]?[^+-]+/g);
  if (!terms || terms.length < 2 || terms.some((term) => !term)) return compact;
  return terms
    .map((term) => (term.startsWith("+") ? term.slice(1) : term))
    .sort((first, second) => first.localeCompare(second, "en"))
    .join("+")
    .replace(/\+\-/g, "-");
}

/**
 * A stable question form for exact and conservative approximate matching.
 * Equations have their two additive sides sorted only when they are simple
 * symbolic sums; arbitrary prose, functions, and inequalities are untouched.
 */
export function canonicalizeQuestion(source: string): string {
  const text = normalizeScannedText(source)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[\u064b-\u065f\u0670]/g, "")
    .replace(/[،؛]/g, ",")
    .replace(/[×*]/g, "*")
    .replace(/[÷/]/g, "/")
    .replace(/[−–—]/g, "-");
  const canonicalEquations = text.replace(
    /([a-z0-9_().^*/+\-\s]+)=([a-z0-9_().^*/+\-\s]+)/gi,
    (_match, left: string, right: string) => `${sortSimpleSum(left)}=${sortSimpleSum(right)}`,
  );
  return canonicalEquations
    .replace(/\s+/g, "")
    .replace(/["'`“”]/g, "")
    .replace(/\*+/g, "*")
    .trim();
}

/** FNV-1a is sufficient for an index key, never a security primitive. */
export function questionFingerprint(canonicalQuestion: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonicalQuestion.length; index++) {
    hash ^= canonicalQuestion.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `q-${(hash >>> 0).toString(16).padStart(8, "0")}-${canonicalQuestion.length}`;
}

function levenshteinDistance(first: string, second: string): number {
  if (first === second) return 0;
  if (!first.length) return second.length;
  if (!second.length) return first.length;
  const previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  const current = new Array<number>(second.length + 1);
  for (let firstIndex = 1; firstIndex <= first.length; firstIndex++) {
    current[0] = firstIndex;
    const firstCharacter = first.charCodeAt(firstIndex - 1);
    for (let secondIndex = 1; secondIndex <= second.length; secondIndex++) {
      const cost = firstCharacter === second.charCodeAt(secondIndex - 1) ? 0 : 1;
      current[secondIndex] = Math.min(
        current[secondIndex - 1] + 1,
        previous[secondIndex] + 1,
        previous[secondIndex - 1] + cost,
      );
    }
    for (let index = 0; index < previous.length; index++) previous[index] = current[index];
  }
  return previous[second.length];
}

function tokenSimilarity(first: string, second: string): number {
  const firstTokens = new Set(first.split(/[^\p{L}\p{N}_]+/u).filter(Boolean));
  const secondTokens = new Set(second.split(/[^\p{L}\p{N}_]+/u).filter(Boolean));
  if (!firstTokens.size && !secondTokens.size) return 1;
  let intersection = 0;
  firstTokens.forEach((token) => {
    if (secondTokens.has(token)) intersection++;
  });
  return intersection / new Set([...firstTokens, ...secondTokens]).size;
}

/** Conservative score: a long mismatch cannot pass merely by sharing a word. */
export function questionSimilarity(first: string, second: string): number {
  if (first === second) return 1;
  if (!first || !second) return 0;
  const cappedFirst = first.slice(0, 4_000);
  const cappedSecond = second.slice(0, 4_000);
  const edit =
    1 -
    levenshteinDistance(cappedFirst, cappedSecond) /
      Math.max(cappedFirst.length, cappedSecond.length);
  const tokens = tokenSimilarity(cappedFirst, cappedSecond);
  return Math.max(0, Math.min(1, 0.78 * edit + 0.22 * tokens));
}

export function toLatexHint(text: string): string {
  return normalizeScannedText(text)
    .replace(/sqrt\(([^()\n]+)\)/g, "\\sqrt{$1}")
    .replace(/\^([0-9]+)/g, "^{$1}")
    .replace(/<=/g, "\\leq")
    .replace(/>=/g, "\\geq")
    .replace(/!=/g, "\\ne")
    .replace(/\bpi\b/g, "\\pi")
    .replace(/\bint\b/g, "\\int")
    .replace(/\bsum\b/g, "\\sum");
}
