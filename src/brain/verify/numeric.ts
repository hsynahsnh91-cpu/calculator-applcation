import { all, create } from "mathjs";
import { numericSamplingDomain } from "../semantic/domains";
import type { NumericRuleInput, NumericVerificationResult } from "./types";

const math = create(all, { number: "number", matrix: "Array" });
const SAFE_EXPRESSION = /^[A-Za-z0-9_+\-*/^().,\s]+$/;
const ALLOWED_FUNCTIONS = new Set(["sin", "cos", "tan", "asin", "acos", "atan", "sqrt", "abs", "log", "ln", "exp"]);

function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Small deterministic PRNG; the seed is stored with evidence for replay. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function expressionIsSafe(expression: string, variables: string[]): boolean {
  if (!SAFE_EXPRESSION.test(expression) || expression.includes("..") || expression.includes("//")) return false;
  const names = expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  return names.every((name) => variables.includes(name) || ALLOWED_FUNCTIONS.has(name) || name === "pi" || name === "e");
}

function finiteValue(expression: string, scope: Record<string, number>): number | undefined {
  try {
    const value = math.evaluate(expression, scope);
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function unable(detail: string, seed: string, samples: number, tolerance: number): NumericVerificationResult {
  return {
    tested: 0,
    evidence: {
      type: "not_automatically_testable",
      method: "لم يُشغّل اختبار عددي لأن صيغة القاعدة أو مجالها غير صالحين للتنفيذ الآمن",
      passed: false,
      createdAt: new Date().toISOString(),
      seed,
      samples,
      tolerance,
      detail,
    },
  };
}

/**
 * Numerical evidence is not a proof. It samples only finite points that meet
 * the explicit simple domain constraints and returns the first counterexample.
 */
export function verifyRuleNumerically(input: NumericRuleInput): NumericVerificationResult {
  const variables = [
    ...new Set(
      input.variables
        .map((value) => value.trim())
        .filter((value) => /^[A-Za-z][A-Za-z0-9_]*$/.test(value)),
    ),
  ];
  const samples = Math.max(1, Math.min(2_000, input.samples ?? 200));
  const seed = input.seed?.trim() || `numeric-${input.left}|${input.right}|${variables.join(",")}`;
  const tolerance = Math.max(1e-12, Math.min(1e-3, input.tolerance ?? 1e-9));
  if (!variables.length) return unable("لا توجد متغيرات حرة معلنة للاختبار العددي.", seed, samples, tolerance);
  if (!expressionIsSafe(input.left, variables) || !expressionIsSafe(input.right, variables))
    return unable("الصيغة تحتوي رموزًا أو أوامر غير مسموحة في الاختبار العددي المحلي.", seed, samples, tolerance);

  const domain = numericSamplingDomain(input.assumptionsLatex ?? []);
  if (!(domain.minimum < domain.maximum))
    return unable("حدود المجال المعلنة لا تترك مجالًا عدديًا للاختبار.", seed, samples, tolerance);
  const random = mulberry32(hashSeed(seed));
  let tested = 0;
  let maxError = 0;
  const attempts = samples * 30;

  for (let attempt = 0; attempt < attempts && tested < samples; attempt++) {
    const scope: Record<string, number> = {};
    for (const variable of variables)
      scope[variable] = domain.minimum + random() * (domain.maximum - domain.minimum);
    if (domain.nonZero && Object.values(scope).some((value) => Math.abs(value) < 1e-7)) continue;
    if (domain.exclusions.some((excluded) => Object.values(scope).some((value) => Math.abs(value - excluded) < 1e-7))) continue;
    const left = finiteValue(input.left, scope);
    const right = finiteValue(input.right, scope);
    if (left === undefined || right === undefined) continue;
    tested++;
    const error = Math.abs(left - right);
    maxError = Math.max(maxError, error);
    const scale = Math.max(1, Math.abs(left), Math.abs(right));
    if (error > tolerance * scale)
      return {
        tested,
        counterexample: scope,
        evidence: {
          type: "numeric_evidence",
          method: "عينات عددية عشوائية حتمية ضمن الفرضيات المعلنة فقط؛ هذا دليل عددي وليس برهانًا",
          passed: false,
          createdAt: new Date().toISOString(),
          seed,
          samples: tested,
          tolerance,
          maxError: error,
          counterexample: scope,
          detail: `وُجد مثال مضاد عند العينة ${tested}: الفرق ${error}.`,
        },
      };
  }
  if (!tested)
    return unable("كل العينات وقعت خارج مجال التعريف أو أعادت قيمًا غير منتهية.", seed, samples, tolerance);
  return {
    tested,
    evidence: {
      type: "numeric_evidence",
      method: "عينات عددية عشوائية حتمية ضمن الفرضيات المعلنة فقط؛ هذا دليل عددي وليس برهانًا",
      passed: tested === samples,
      createdAt: new Date().toISOString(),
      seed,
      samples: tested,
      tolerance,
      maxError,
      detail:
        tested === samples
          ? `لم يظهر مثال مضاد في ${tested} عينة.`
          : `أُنجزت ${tested} عينة فقط قبل بلوغ حد محاولات المجال؛ لا يعد ذلك برهانًا.`,
    },
  };
}
