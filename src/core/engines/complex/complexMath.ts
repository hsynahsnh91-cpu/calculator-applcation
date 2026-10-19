import nerdamer from "nerdamer";
import type { MathNode } from "mathjs";
import { math, canonical, parseExpression } from "../../solver/math.js";
import { ClarificationError, type Verification } from "../../solver/types.js";

export interface Pair {
  r: string;
  i: string;
}
export interface ComplexValue extends Pair {
  re: number;
  im: number;
  expression: string;
  latex: string;
  norm: string;
  normTex: string;
  angle?: string;
  angleTex?: string;
  piRatio?: [number, number];
}
export const tex = (source: string) =>
  (nerdamer(source) as unknown as { toTeX(): string }).toTeX();
export function scalar(source: string): string {
  if (source.length > 5000)
    throw new ClarificationError(
      "الصيغة الجبرية طويلة جدًا. استخدم الشكل الأسي أو دستور ديموافر.",
    );
  const parsed = nerdamer(source),
    expanded = parsed.expand();
  let value = expanded.simplify().text();
  // Nerdamer 2 can drop a sqrt(2) factor while simplifying nested radicals.
  // Never trust a rewrite which changes an independently evaluated real value.
  try {
    const expected: unknown = math.evaluate(source);
    if (typeof expected === "number" && Number.isFinite(expected)) {
      const matches = (candidate: string) => {
        const actual: unknown = math.evaluate(candidate);
        return (
          typeof actual === "number" &&
          Number.isFinite(actual) &&
          Math.abs(actual - expected) <= 1e-11 * Math.max(1, Math.abs(expected))
        );
      };
      if (!matches(value)) {
        const fallback = [expanded.text(), parsed.text()].find(matches);
        if (!fallback)
          throw new ClarificationError(
            "تعذّر تبسيط هذه الجذور مع الحفاظ على قيمتها. استخدم صيغة أسية أو معطيات أبسط.",
          );
        value = fallback;
      }
    } else value = expanded.text();
  } catch (error) {
    if (error instanceof ClarificationError) throw error;
    value = expanded.text();
  }
  if (value.length > 5000)
    throw new ClarificationError(
      "استخدم الشكل الأسي لتبقى النتيجة قابلة للعرض.",
    );
  return value;
}
export const zero = (source: string) => scalar(source) === "0";
export const evaluateScalar = (source: string): number => {
  const value = Number(nerdamer(source).evaluate().text({ decimal: true }));
  if (!Number.isFinite(value))
    throw new ClarificationError(
      "خرجت قيمة المعطيات عن النطاق العددي. استخدم قيمًا أصغر أو اكتب القوة بديموافر.",
    );
  return value;
};
export const addPair = (a: Pair, b: Pair): Pair => ({
  r: scalar(`(${a.r})+(${b.r})`),
  i: scalar(`(${a.i})+(${b.i})`),
});
export const subtractPair = (a: Pair, b: Pair): Pair => ({
  r: scalar(`(${a.r})-(${b.r})`),
  i: scalar(`(${a.i})-(${b.i})`),
});
export const multiplyPair = (a: Pair, b: Pair): Pair => ({
  r: scalar(`(${a.r})*(${b.r})-(${a.i})*(${b.i})`),
  i: scalar(`(${a.r})*(${b.i})+(${a.i})*(${b.r})`),
});
export function dividePair(a: Pair, b: Pair): Pair {
  const denominator = scalar(`(${b.r})^2+(${b.i})^2`);
  if (zero(denominator))
    throw new ClarificationError("القسمة على العدد العقدي الصفري غير معرّفة.");
  return {
    r: scalar(`((${a.r})*(${b.r})+(${a.i})*(${b.i}))/(${denominator})`),
    i: scalar(`((${a.i})*(${b.r})-(${a.r})*(${b.i}))/(${denominator})`),
  };
}
export function integerPower(a: Pair, exponent: number): Pair {
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 64)
    throw new ClarificationError(
      "لهذه القوة الكبيرة استخدم دستور ديموافر بدل التوسيع الجبري.",
    );
  if (exponent === 0 && zero(a.r) && zero(a.i))
    throw new ClarificationError("الصفر أس صفر غير معرّف في هذه المسألة.");
  let n = Math.abs(exponent),
    base = a,
    value: Pair = { r: "1", i: "0" };
  while (n) {
    if (n % 2) value = multiplyPair(value, base);
    n = Math.floor(n / 2);
    if (n) base = multiplyPair(base, base);
  }
  return exponent < 0 ? dividePair({ r: "1", i: "0" }, value) : value;
}
const expPair = (a: Pair): Pair => ({
  r: scalar(`exp(${a.r})*cos(${a.i})`),
  i: scalar(`exp(${a.r})*sin(${a.i})`),
});
function sqrtPair(a: Pair): Pair {
  if (zero(a.i))
    return evaluateScalar(a.r) >= 0
      ? { r: scalar(`sqrt(${a.r})`), i: "0" }
      : { r: "0", i: scalar(`sqrt(-(${a.r}))`) };
  const norm = scalar(`sqrt((${a.r})^2+(${a.i})^2)`);
  return {
    r: scalar(`sqrt(((${norm})+(${a.r}))/2)`),
    i: scalar(
      `${evaluateScalar(a.i) < 0 ? "-" : ""}sqrt(((${norm})-(${a.r}))/2)`,
    ),
  };
}
function walk(node: MathNode): Pair {
  if (math.isParenthesisNode(node)) return walk(node.content);
  if (math.isConstantNode(node)) return { r: String(node.value), i: "0" };
  if (math.isSymbolNode(node)) {
    if (node.name === "i") return { r: "0", i: "1" };
    if (["pi", "e"].includes(node.name)) return { r: node.name, i: "0" };
    throw new ClarificationError(
      `ما قيمة ${node.name}؟ عرّف العدد أو الزاوية أولًا.`,
    );
  }
  if (math.isOperatorNode(node)) {
    const a = walk(node.args[0]);
    if (node.args.length === 1) {
      if (node.op === "-")
        return { r: scalar(`-(${a.r})`), i: scalar(`-(${a.i})`) };
      if (node.op === "+") return a;
      throw new ClarificationError(
        "هذه العملية الأحادية غير مدعومة ضمن الحساب العقدي.",
      );
    }
    const b = walk(node.args[1]);
    if (node.op === "+") return addPair(a, b);
    if (node.op === "-") return subtractPair(a, b);
    if (node.op === "*") return multiplyPair(a, b);
    if (node.op === "/") return dividePair(a, b);
    if (node.op === "^") {
      if (zero(a.i) && a.r === "e") return expPair(b);
      if (!zero(b.i))
        throw new ClarificationError(
          "اكتب الأس عددًا صحيحًا، أو استخدم الصيغة e^(i*theta) لأويلر.",
        );
      const exponent = evaluateScalar(b.r);
      if (Number.isInteger(exponent)) return integerPower(a, exponent);
      if (exponent === 0.5) return sqrtPair(a);
      if (zero(a.i) && evaluateScalar(a.r) >= 0)
        return { r: scalar(`(${a.r})^(${b.r})`), i: "0" };
      throw new ClarificationError(
        "لإيجاد الجذور العقدية اكتب رتبة الجذر n صراحةً.",
      );
    }
  }
  if (math.isFunctionNode(node) && node.args.length === 1) {
    const a = walk(node.args[0]),
      name = node.fn.toString();
    if (name === "sqrt") return sqrtPair(a);
    if (name === "exp") return expPair(a);
    if (name === "conj") return { r: a.r, i: scalar(`-(${a.i})`) };
    if (name === "abs")
      return { r: scalar(`sqrt((${a.r})^2+(${a.i})^2)`), i: "0" };
    if (["sin", "cos", "tan", "atan", "log"].includes(name) && zero(a.i)) {
      const value: unknown = math.evaluate(`${name}(${a.r})`);
      if (typeof value !== "number" || !Number.isFinite(value))
        throw new ClarificationError("حجة الدالة خارج مجالها الحقيقي.");
      return { r: scalar(`${name}(${a.r})`), i: "0" };
    }
  }
  throw new ClarificationError(
    "اكتب العدد باستخدام الجمع والضرب والقسمة والجذور أو الشكل الأسي.",
  );
}
export function pairLatex(a: Pair): string {
  if (zero(a.i)) return tex(a.r);
  const imag = tex(a.i),
    negative = evaluateScalar(a.i) < 0;
  const magnitude = negative ? tex(scalar(`-(${a.i})`)) : imag;
  const term = `${magnitude === "1" ? "" : /\\[A-Za-z]+$/.test(magnitude) ? magnitude + " " : magnitude}i`;
  return zero(a.r)
    ? `${negative ? "-" : ""}${term}`
    : `${tex(a.r)} ${negative ? "-" : "+"} ${term}`;
}
export function piFraction(angle: string): [number, number] | undefined {
  const ratio = scalar(`(${angle})/pi`);
  const match = ratio.match(/^(-?\d+)(?:\/(\d+))?$/);
  if (!match) return undefined;
  const n = Number(match[1]),
    d = Number(match[2] ?? 1);
  return Number.isSafeInteger(n) && Number.isSafeInteger(d)
    ? [n, d]
    : undefined;
}
export function reducedPi([n, d]: [number, number], power = 1): string {
  const denominator = BigInt(d),
    period = 2n * denominator;
  let numerator = (BigInt(n) * BigInt(power)) % period;
  if (numerator > denominator) numerator -= period;
  if (numerator <= -denominator) numerator += period;
  return scalar(`(${numerator})*pi/${d}`);
}
export function fromPair(pair: Pair): ComplexValue {
  const r = scalar(pair.r),
    im = scalar(pair.i),
    re = evaluateScalar(r),
    imag = evaluateScalar(im);
  if (Math.max(Math.abs(re), Math.abs(imag)) > 1e150)
    throw new ClarificationError(
      "الإحداثيات كبيرة جدًا للعرض. استخدم صيغة قوة بديموافر.",
    );
  const norm = scalar(`sqrt((${r})^2+(${im})^2)`),
    normTex = tex(norm);
  const value: ComplexValue = {
    r,
    i: im,
    re,
    im: imag,
    norm,
    normTex,
    expression: `(${r})+i*(${im})`,
    latex: pairLatex({ r, i: im }),
  };
  if (zero(norm)) return value;
  const angle = Math.atan2(imag, re);
  for (const [n, d] of [
    [0, 1],
    [1, 6],
    [1, 4],
    [1, 3],
    [1, 2],
    [2, 3],
    [3, 4],
    [5, 6],
    [1, 1],
    [-1, 6],
    [-1, 4],
    [-1, 3],
    [-1, 2],
    [-2, 3],
    [-3, 4],
    [-5, 6],
  ]) {
    if (Math.abs(angle - (n * Math.PI) / d) > 1e-9) continue;
    const theta = `(${n})*pi/${d}`;
    if (
      zero(`(${r})/(${norm})-cos(${theta})`) &&
      zero(`(${im})/(${norm})-sin(${theta})`)
    ) {
      value.angle = scalar(theta);
      value.angleTex = tex(value.angle);
      value.piRatio = [n, d];
      return value;
    }
  }
  if (zero(r)) {
    value.angle = imag > 0 ? "pi/2" : "-pi/2";
    value.angleTex = tex(value.angle);
    value.piRatio = [imag > 0 ? 1 : -1, 2];
    return value;
  }
  const ratio = scalar(`(${im})/(${r})`);
  value.angle = scalar(
    `${re < 0 ? (imag < 0 ? "-pi+" : "pi+") : ""}atan(${ratio})`,
  );
  value.angleTex = tex(value.angle);
  return value;
}
export function complexValue(source: string): ComplexValue {
  source = canonical(source.replace(/°/g, "*pi/180"));
  return fromPair(walk(parseExpression(source)));
}
export function verifyPair(
  value: Pair,
  expected: { re: number; im: number },
  method: string,
): Verification {
  let error = Infinity;
  try {
    const re = evaluateScalar(value.r),
      im = evaluateScalar(value.i);
    if (Number.isFinite(expected.re) && Number.isFinite(expected.im)) {
      const scale = Math.max(
        1,
        Math.abs(re),
        Math.abs(im),
        Math.abs(expected.re),
        Math.abs(expected.im),
      );
      error = Math.hypot(
        re / scale - expected.re / scale,
        im / scale - expected.im / scale,
      );
    }
  } catch {
    /* No finite independent comparison; never award a verification badge. */
  }

  return {
    passed: Number.isFinite(error) && error < 1e-8,
    method,
    maxError: Number.isFinite(error) ? error : undefined,
    samples: 1,
  };
}
export function independentPower(
  value: ComplexValue,
  n: number,
): { re: number; im: number } {
  let base = math.complex(value.re, value.im),
    out = math.complex(1, 0),
    power = Math.abs(n);
  while (power) {
    if (power % 2) out = math.multiply(out, base) as import("mathjs").Complex;
    power = Math.floor(power / 2);
    if (power) base = math.multiply(base, base) as import("mathjs").Complex;
  }
  if (n < 0) out = math.divide(1, out) as import("mathjs").Complex;
  return { re: out.re, im: out.im };
}
