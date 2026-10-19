import { math, parseExpression } from "../../solver/math";
import type { ComplexAnswer } from "../../solver/complexTypes";
import { ClarificationError } from "../../solver/types";
import {
  complexValue,
  fromPair,
  scalar,
  zero,
  addPair,
  subtractPair,
  multiplyPair,
  dividePair,
  type Pair,
} from "./complexMath";

/** Degree <= 2, with real OR complex coefficients. No real-only discriminant shortcut. */
export function solveComplexEquation(
  expression: string,
  variable: string,
): ComplexAnswer | null {
  let derivative = parseExpression(expression, {}, variable);
  const derivatives = [derivative];
  for (let order = 1; order <= 3; order++) {
    derivative = math.simplify(math.derivative(derivative, variable));
    derivatives.push(derivative);
  }
  if (math.simplify(derivatives[3]).toString() !== "0") return null;
  const coefficients = derivatives.slice(0, 3).map((node, order) => {
    const atZero = node
      .transform((child) =>
        math.isSymbolNode(child) && child.name === variable
          ? math.parse("0")
          : child,
      )
      .toString();
    const value = complexValue(atZero);
    return order === 2 ? dividePair(value, { r: "2", i: "0" }) : value;
  });
  const [c, b, a] = coefficients;
  const out: ComplexAnswer = {
    title: "حل المعادلة في الأعداد العقدية",
    finalLatex: "",
    steps: [
      {
        title: "مجموعة الحل",
        text: "نعمل في الأعداد العقدية؛ المميز السالب لا يمنع الحل هنا.",
        latex: String.raw`${variable}\in\mathbb C`,
      },
    ],
    visuals: [],
    verification: { passed: false, method: "لم يجر تعويض جذور عددية بعد." },
    contextPatch: { complex: { values: {} } },
  };
  const isZero = (value: Pair) => zero(value.r) && zero(value.i);
  if (isZero(a) && isZero(b)) {
    out.finalLatex = isZero(c)
      ? String.raw`S_{\mathbb C}=\mathbb C`
      : String.raw`S_{\mathbb C}=\varnothing`;
    out.steps.push({
      title: isZero(c) ? "هوية" : "تناقض",
      latex: out.finalLatex,
    });
    return out;
  }
  let roots: Pair[];
  if (isZero(a)) {
    roots = [dividePair({ r: scalar(`-(${c.r})`), i: scalar(`-(${c.i})`) }, b)];
    out.steps.push({
      title: "المعادلة من الدرجة الأولى",
      latex: String.raw`b${variable}+c=0\Longrightarrow ${variable}=-\frac cb`,
    });
  } else {
    const delta = fromPair(
      subtractPair(
        multiplyPair(b, b),
        multiplyPair({ r: "4", i: "0" }, multiplyPair(a, c)),
      ),
    );
    const d = complexValue(`sqrt(${delta.expression})`);
    const minusB = { r: scalar(`-(${b.r})`), i: scalar(`-(${b.i})`) },
      twiceA = multiplyPair({ r: "2", i: "0" }, a);
    roots = [
      dividePair(addPair(minusB, d), twiceA),
      dividePair(subtractPair(minusB, d), twiceA),
    ];
    if (isZero(delta)) roots = roots.slice(0, 1);
    out.steps.push(
      {
        title: "المعاملات العقدية",
        latex: String.raw`\begin{aligned}a&=${fromPair(a).latex}\\b&=${fromPair(b).latex}\\c&=${fromPair(c).latex}\end{aligned}`,
      },
      {
        title: "المميز في المجموعة العقدية",
        latex: String.raw`\Delta=b^2-4ac=${delta.latex}`,
      },
      {
        title: "الجذر العقدي للمميز",
        text:
          zero(delta.i) && delta.re < 0
            ? "نستخدم i²=−1: الجذر التربيعي لمميز سالب عقدي وليس عددًا حقيقيًا."
            : "نبحث عن δ بحيث δ²=Δ، ثم نأخذ الإشارتين في القانون.",
        latex: String.raw`\delta^2=\Delta,\qquad\delta=${d.latex}`,
      },
      {
        title: "القانون العام في الأعداد العقدية",
        latex: String.raw`${variable}_{1,2}=\frac{-b\pm\delta}{2a}`,
      },
    );
  }
  const values = roots.map(fromPair);
  out.finalLatex = String.raw`\begin{aligned}${values.map((root, index) => String.raw`${variable}_{${index + 1}}&=${root.latex}`).join(String.raw`\\[5pt]`)}\end{aligned}`;
  const errors = values.map((root) => {
    const value: unknown = parseExpression(expression, {}, variable).evaluate({
      [variable]: math.complex(root.re, root.im),
    });
    return typeof value === "number"
      ? Math.abs(value)
      : math.isComplex(value)
        ? Math.hypot(value.re, value.im)
        : Infinity;
  });
  const maxError = Math.max(...errors);
  out.verification = {
    passed: errors.length > 0 && maxError < 1e-7,
    samples: errors.length,
    maxError: Number.isFinite(maxError) ? maxError : undefined,
    method: "تعويض كل جذر في المعادلة الأصلية بحساب عقدي عددي مستقل",
  };
  out.contextPatch = { complex: { values: {}, ambiguous: values.length > 1 } };
  out.visuals = [
    {
      kind: "complex",
      title: "صور الجذور في المستوي العقدي",
      points: values.map((value, index) => ({
        re: value.re,
        im: value.im,
        label: `${variable}${index + 1}`,
      })),
    },
  ];
  if (!out.finalLatex)
    throw new ClarificationError("تعذّر تحديد الجذور بهذه الصيغة.");
  return out;
}
