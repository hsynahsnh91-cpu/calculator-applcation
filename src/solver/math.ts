import { all, create, type MathNode } from "mathjs";
import type { AngleMode } from "../types/index.js";
import {
  ClarificationError,
  type CurveSeries,
  type Verification,
} from "./types.js";
export const math = create(all, { number: "number" });
const FUNCTIONS = new Set([
  "sin",
  "cos",
  "tan",
  "sec",
  "csc",
  "cot",
  "asin",
  "acos",
  "atan",
  "asec",
  "acsc",
  "acot",
  "sinh",
  "cosh",
  "tanh",
  "asinh",
  "acosh",
  "atanh",
  "sqrt",
  "cbrt",
  "nthRoot",
  "log",
  "log10",
  "exp",
  "abs",
  "sign",
  "floor",
  "ceil",
  "round",
  "factorial",
  "conj",
]);
export function parseExpression(
  source: string,
  scope: Record<string, number> = {},
  variable = "x",
): MathNode {
  if (!source || source.length > 900 || /□|\\placeholder/.test(source))
    throw new ClarificationError(
      "أكمل العبارة الرياضية والخانات الفارغة أولًا.",
    );
  for (const name of Object.keys(scope)) {
    if (/^[a-z]$/.test(name))
      source = source.replace(
        new RegExp(`(?<![A-Za-z_])${name}(?=[xyz(])`, "g"),
        `${name}*`,
      );
  }
  const node = math.parse(
    source
      .replace(/(-?\d+(?:\.\d+)?)\s*°/g, "($1*deg)")
      .replace(/\bln\b/g, "log"),
  );
  let count = 0;
  node.traverse((child) => {
    if (++count > 260)
      throw new ClarificationError(
        "العبارة طويلة جدًا للتحليل الآمن. قسّمها إلى طلبات أصغر.",
      );
    if (
      ![
        "OperatorNode",
        "FunctionNode",
        "ConstantNode",
        "SymbolNode",
        "ParenthesisNode",
      ].includes(child.type)
    )
      throw new ClarificationError(
        "استخدم تعبيرًا رياضيًا فقط، دون أوامر برمجية أو إسناد داخل العبارة.",
      );
    if (math.isFunctionNode(child) && !FUNCTIONS.has(child.fn.toString()))
      throw new ClarificationError(
        "الدالة المكتوبة غير مدعومة. تحقق من اسمها الرياضي.",
      );
    if (
      math.isSymbolNode(child) &&
      child.name !== variable &&
      !["x", "y", "z", "pi", "e", "i", "deg", "Infinity"].includes(
        child.name,
      ) &&
      !(child.name in scope) &&
      !FUNCTIONS.has(child.name)
    )
      throw new ClarificationError(
        `ما قيمة المتغير ${child.name}؟ عرّفه قبل الحساب.`,
      );
    if (
      math.isOperatorNode(child) &&
      child.op === "^" &&
      math.isConstantNode(child.args[1]) &&
      Math.abs(Number(child.args[1].value)) > 10000
    )
      throw new ClarificationError(
        "الأس كبير جدًا للحساب التفاعلي. اختر أسًا أصغر.",
      );
  });
  return node;
}
export function canonical(
  source: string,
  scope: Record<string, number> = {},
  variable = "x",
): string {
  return parseExpression(source, scope, variable)
    .transform((child) =>
      math.isSymbolNode(child) &&
      Object.prototype.hasOwnProperty.call(scope, child.name)
        ? math.parse(String(scope[child.name]))
        : child,
    )
    .toString({ implicit: "show", parenthesis: "auto" })
    .replace(/\s+/g, "");
}
export function expressionTex(source: string): string {
  return math.parse(source).toTex({ parenthesis: "auto" });
}
export function numberTex(value: number): string {
  if (!Number.isFinite(value))
    return value === Infinity
      ? "+\\infty"
      : value === -Infinity
        ? "-\\infty"
        : "\\text{غير معرّف}";
  if (Math.abs(value) < 1e-12) return "0";
  if (Number.isInteger(value)) return String(value);
  const fraction = math.fraction(value);
  if (Number(fraction.d) <= 10000 && Math.abs(Number(fraction) - value) < 1e-11)
    return `${fraction.s < 0 ? "-" : ""}\\frac{${fraction.n}}{${fraction.d}}`;
  return String(Number(value.toPrecision(9))).replace(
    /(-?[\d.]+)e([+-]?\d+)/,
    "$1\\times 10^{$2}",
  );
}
export function matrixTex(matrix: number[][]): string {
  return `\\begin{pmatrix}${matrix.map((row) => row.map(numberTex).join(" & ")).join(" \\\\ ")}\\end{pmatrix}`;
}
export function realFunction(
  expression: string,
  scope: Record<string, number> = {},
): (x: number) => number {
  const compiled = parseExpression(expression, scope).compile();
  return (x) => {
    try {
      const value: unknown = compiled.evaluate({ ...scope, x });
      return typeof value === "number" && Number.isFinite(value) ? value : NaN;
    } catch {
      return NaN;
    }
  };
}
export function sampleCurve(
  expression: string,
  label = "f(x)",
  minimum = -5,
  maximum = 5,
): CurveSeries {
  const f = realFunction(expression);
  const points: CurveSeries["points"] = [];
  for (let index = 0; index <= 160; index++) {
    const x = minimum + ((maximum - minimum) * index) / 160;
    const y = f(x);
    points.push({ x, y: Number.isFinite(y) && Math.abs(y) < 1e6 ? y : null });
  }
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1].y,
      current = points[index].y;
    if (
      previous !== null &&
      current !== null &&
      previous * current < 0 &&
      Math.abs(previous - current) > 30 &&
      Math.abs(f((points[index - 1].x + points[index].x) / 2)) >
        Math.max(Math.abs(previous), Math.abs(current))
    )
      points[index] = { ...points[index], y: null };
  }
  return { label, points };
}
export function angularExpression(expression: string, mode: AngleMode): string {
  let node = parseExpression(expression);
  node = node.transform((child) => {
    if (!math.isFunctionNode(child) || child.args.length !== 1) return child;
    const name = child.fn.toString();
    const argument = child.args[0].toString();
    const explicit =
      child.args[0].filter(
        (part) => math.isSymbolNode(part) && part.name === "deg",
      ).length > 0;
    if (
      ["sin", "cos", "tan", "sec", "csc", "cot"].includes(name) &&
      mode !== "RAD" &&
      !explicit
    )
      return math.parse(
        `${name}((${argument})*pi/${mode === "GRAD" ? 200 : 180})`,
      );
    if (
      ["asin", "acos", "atan", "asec", "acsc", "acot"].includes(name) &&
      mode !== "RAD"
    )
      return math.parse(
        `(${name}(${argument}))*${mode === "GRAD" ? 200 : 180}/pi`,
      );
    return child;
  });
  node = node.transform((child) =>
    math.isSymbolNode(child) && child.name === "deg"
      ? math.parse("pi/180")
      : child,
  );
  return node.toString({ implicit: "show" });
}
export function polynomialCoefficients(
  expression: string,
  variable = "x",
): number[] {
  const node = parseExpression(expression, {}, variable);
  const f = (value: number): number => {
    const result: unknown = node.evaluate({ [variable]: value });
    if (typeof result !== "number" || !Number.isFinite(result))
      throw new ClarificationError(
        "معاملات المعادلة ليست أعدادًا حقيقية منتهية.",
      );
    return result;
  };
  let derivative = node;
  const coefficients: number[] = [];
  for (let degree = 0; degree <= 3; degree++) {
    const value: unknown = derivative.evaluate({ [variable]: 0 });
    if (typeof value !== "number" || !Number.isFinite(value))
      throw new ClarificationError(
        "هذه المعادلة ليست كثيرة حدود حتى الدرجة الثالثة.",
      );
    coefficients.push(value / [1, 1, 2, 6][degree]);
    derivative = math.simplify(math.derivative(derivative, variable));
  }
  if (derivative.toString() !== "0")
    throw new ClarificationError(
      "المعادلات الرمزية المدعومة هنا حتى الدرجة الثالثة. حدّد مجالًا عدديًا إذا كانت المعادلة غير كثيرة حدود.",
    );
  for (const point of [-1.3, 0.7, 2.1])
    if (
      Math.abs(
        f(point) -
          coefficients.reduce((sum, c, degree) => sum + c * point ** degree, 0),
      ) > 1e-7
    )
      throw new ClarificationError("تعذّر التحقق من معاملات المعادلة.");
  while (
    coefficients.length > 1 &&
    Math.abs(coefficients[coefficients.length - 1]) < 1e-12
  )
    coefficients.pop();
  return coefficients.reverse();
}
export function verifyDerivative(
  expression: string,
  derivative: string,
): Verification {
  const f = realFunction(expression),
    df = realFunction(derivative);
  let samples = 0,
    maxError = 0;
  for (const x of [-1.7, -0.4, 0.3, 0.8, 1.3, 2.1]) {
    const h = 1e-5 * Math.max(1, Math.abs(x));
    const central = (f(x + h) - f(x - h)) / (2 * h),
      symbolic = df(x);
    if (!Number.isFinite(central) || !Number.isFinite(symbolic)) continue;
    const error = Math.abs(central - symbolic) / (1 + Math.abs(symbolic));
    maxError = Math.max(maxError, error);
    samples++;
  }
  return {
    passed: samples >= 3 && maxError < 2e-5,
    samples,
    maxError,
    method:
      "مطابقة المشتقة الرمزية بفروق مركزية عددية في نقاط مستقلة من المجال",
  };
}
export function verifyIntegral(
  expression: string,
  lower: number,
  upper: number,
  expected: number,
): Verification {
  const f = realFunction(expression);
  const n = 512,
    h = (upper - lower) / n;
  let sum = f(lower) + f(upper);
  for (let index = 1; index < n; index++)
    sum += (index % 2 ? 4 : 2) * f(lower + index * h);
  const numeric = (sum * h) / 3,
    error = Math.abs(numeric - expected) / (1 + Math.abs(expected));
  return {
    passed: Number.isFinite(numeric) && error < 1e-6,
    maxError: Number.isFinite(error) ? error : undefined,
    samples: n + 1,
    method: "مقارنة نتيجة المحرك الرمزي بتكامل سمبسون مستقل من 512 شريحة",
  };
}
