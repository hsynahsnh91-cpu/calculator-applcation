import type { MathNode } from "mathjs";
import type { SolverContext } from "../solver/types";
import { ClarificationError } from "../solver/types";
import type { ComplexAnswer } from "../solver/complexTypes";
import { mathInstructionText } from "../solver/textbook";
import { mathFragments } from "../solver/extractors";
import { math, expressionTex } from "../solver/math";
import {
  complexValue,
  fromPair,
  scalar,
  tex,
  zero,
  addPair,
  subtractPair,
  multiplyPair,
  dividePair,
  integerPower,
  piFraction,
  reducedPi,
  verifyPair,
  type Pair,
} from "./complexMath";
const T = String.raw;
const clean = (s: string) => s.trim().replace(/[،,.\s]+$/, "");
const nameTex = (s: string) =>
  /^z_[A-Z]$/.test(s)
    ? `z_{${s.slice(2)}}`
    : /^z[1-9]$/.test(s)
      ? `z_{${s.slice(1)}}`
      : s;
/** Evaluate an arithmetic AST over named complex values. The requested method is not a target form. */
export function schoolComplexExpression(
  source: string,
  context: SolverContext,
): ComplexAnswer | undefined {
  const rest = mathInstructionText(source),
    target = rest.match(/\b([A-Z])\s*=\s*/);
  if (
    !target &&
    /زاوية|عمدة|مسافة|طويلة|مرافق|مقلوب|دوران|تحاكي|انسحاب|ارسم|تمثيل|نقط/.test(
      rest,
    )
  )
    return;

  let expression = target
    ? rest
        .slice(target.index! + target[0].length)
        .match(/^[A-Za-z0-9_+*/^().\s-]+/)?.[0]
    : mathFragments(rest).find(
        (s) =>
          !s.includes("=") &&
          /\bz(?:_[A-Z]|[1-9])\b/.test(s) &&
          /[+*/^-]/.test(s),
      );
  if (!expression || !/\bz(?:_[A-Z]|[1-9])\b/.test(expression)) return;
  if (!target && /حول|اكتب.*شكل/.test(rest) && !/مستخدم|باستعمال/.test(rest))
    return;
  expression = clean(expression);
  if (expression.length > 900)
    throw new ClarificationError("المقدار العقدي أطول من حد التحليل.");
  const bindings: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(context.assignments).map(([k, v]) => [k, String(v)]),
    ),
    ...context.complex?.values,
  };
  const tree = math.parse(expression),
    missing = new Set<string>();
  let count = 0;
  let top = tree;
  while (math.isParenthesisNode(top)) top = top.content;
  if (!target && math.isOperatorNode(top) && top.op === "^") return;
  tree.traverse((node) => {
    if (++count > 260) throw new ClarificationError("المقدار طويل جدًا.");
    if (
      ![
        "OperatorNode",
        "FunctionNode",
        "ConstantNode",
        "SymbolNode",
        "ParenthesisNode",
      ].includes(node.type)
    )
      throw new ClarificationError("اكتب مقدارًا رياضيًا فقط.");
    if (
      math.isSymbolNode(node) &&
      ![
        "i",
        "e",
        "pi",
        "sqrt",
        "exp",
        "cos",
        "sin",
        "conj",
        "abs",
        "log",
      ].includes(node.name) &&
      !Object.prototype.hasOwnProperty.call(bindings, node.name)
    )
      missing.add(node.name);
  });
  if (missing.size)
    throw new ClarificationError(
      `ما تعريف ${[...missing].map((n) => `\\(${nameTex(n)}\\)`).join(" و")}؟ أعط الأعداد المطلوبة، ولا تكفي نتيجة سابقة غير مسماة.`,
    );
  const substitute = (s: string) => {
    const out = s.replace(/\b(?:z(?:_[A-Z]|[1-9])?|[a-z])\b/g, (k) =>
      bindings[k] ? `(${bindings[k]})` : k,
    );
    if (out.length > 1800)
      throw new ClarificationError("تجاوز التعويض حد العبارة المحفوظة.");
    return out;
  };
  const exponential = /اسي|موافر|اويلر/.test(rest);
  const steps: ComplexAnswer["steps"] = [
    {
      title: "المعطى والمقدار المطلوب",
      latex: `${target?.[1] || "S"}=${expressionTex(expression)}`,
      text: /استنتج/.test(rest)
        ? "نستعمل الأعداد المسماة المحفوظة من المعطيات أو من حلول الطلب السابق، دون إعادة حل المعادلة."
        : undefined,
    },
  ];
  const peel = (n: MathNode): MathNode =>
    math.isParenthesisNode(n) ? peel(n.content) : n;
  const powerData: (
    n: MathNode,
  ) =>
    | { name: string; exponent: number; value: ReturnType<typeof complexValue> }
    | undefined = (n) => {
    n = peel(n);
    if (!math.isOperatorNode(n) || n.op !== "^") return;
    const base = peel(n.args[0]);
    if (!math.isSymbolNode(base) || !bindings[base.name]) return;
    const p = complexValue(substitute(n.args[1].toString()));
    if (!zero(p.i) || !Number.isSafeInteger(p.re) || Math.abs(p.re) > 64)
      throw new ClarificationError(
        "أس كل حد في المقدار عدد صحيح وقيمته المطلقة حتى64؛ للقوة المفردة الكبيرة استخدم طلب موافر المستقل.",
      );
    return {
      name: base.name,
      exponent: p.re,
      value: complexValue(bindings[base.name]),
    };
  };
  const evaluate = (node: MathNode): Pair => {
    node = peel(node);
    if (math.isOperatorNode(node) && node.args.length === 2) {
      const p = powerData(node);
      if (p && exponential) {
        if (zero(p.value.norm)) {
          if (p.exponent <= 0)
            throw new ClarificationError("قوة الصفر غير معرفة لهذا الأس.");
          return { r: "0", i: "0" };
        }
        const angle = p.value.angle!,
          ratio = piFraction(angle),
          theta = ratio
            ? reducedPi(ratio, p.exponent)
            : scalar(`(${p.exponent})*(${angle})`),
          radius = scalar(`(${p.value.norm})^(${p.exponent})`);
        steps.push({
          title: "الشكل الأسي وتطبيق موافر",
          latex: T`\begin{aligned}${nameTex(p.name)}&=${p.value.normTex}e^{i(${p.value.angleTex})}\\${nameTex(p.name)}^{${p.exponent}}&=(${p.value.normTex})^{${p.exponent}}e^{i(${p.exponent})(${p.value.angleTex})}\end{aligned}`,
          text: "حددنا العمدة من الطويلة والربع، والزاوية في الأس بالراديان.",
        });
        return {
          r: scalar(`(${radius})*cos(${theta})`),
          i: scalar(`(${radius})*sin(${theta})`),
        };
      }
      const a = evaluate(node.args[0]),
        b = evaluate(node.args[1]);
      if (node.op === "+") return addPair(a, b);
      if (node.op === "-") return subtractPair(a, b);
      if (exponential && (node.op === "*" || node.op === "/")) {
        const av = fromPair(a),
          bv = fromPair(b);
        if (node.op === "/" && zero(bv.norm)) return dividePair(a, b);
        if (zero(av.norm) || zero(bv.norm)) return multiplyPair(a, b);
        const phase = scalar(
            `(${av.angle})${node.op === "*" ? "+" : "-"}(${bv.angle})`,
          ),
          radius = scalar(
            `(${av.norm})${node.op === "*" ? "*" : "/"}(${bv.norm})`,
          );
        steps.push({
          title: "جمع أو طرح العمد في الشكل الأسي",
          latex: T`(${av.normTex}e^{i(${av.angleTex})})${node.op === "*" ? "\\cdot" : "/"}(${bv.normTex}e^{i(${bv.angleTex})})=${tex(radius)}e^{i(${tex(phase)})}`,
        });
        return {
          r: scalar(`(${radius})*cos(${phase})`),
          i: scalar(`(${radius})*sin(${phase})`),
        };
      }
      if (node.op === "*") return multiplyPair(a, b);
      if (node.op === "/") return dividePair(a, b);
      if (node.op === "^") {
        const exp = fromPair(b);
        if (!zero(exp.i))
          throw new ClarificationError("الأس يجب أن يكون حقيقيًا صحيحًا.");
        return integerPower(a, exp.re);
      }
    }
    if (exponential && math.isSymbolNode(node) && bindings[node.name]) {
      const v = complexValue(bindings[node.name]);
      if (!zero(v.norm))
        steps.push({
          title: "استعمال الشكل الأسي للعدد المعطى",
          latex: T`${nameTex(node.name)}=${v.normTex}e^{i(${v.angleTex})}`,
        });
      return v;
    }
    return complexValue(substitute(node.toString()));
  };
  let value = fromPair(evaluate(tree));
  const root = peel(tree);
  if (exponential && math.isOperatorNode(root) && root.op === "+") {
    const a = powerData(root.args[0]),
      b = powerData(root.args[1]);
    if (
      a &&
      b &&
      a.exponent === b.exponent &&
      zero(`(${a.value.r})-(${b.value.r})`) &&
      zero(`(${a.value.i})+(${b.value.i})`)
    ) {
      const phase = scalar(`(${a.exponent})*(${a.value.angle || "0"})`),
        r = scalar(`2*(${a.value.norm})^(${a.exponent})*cos(${phase})`);
      value = fromPair({ r, i: "0" });
      steps.push({
        title: "الاستنتاج بالمرافق",
        latex: T`\begin{aligned}${nameTex(b.name)}&=\overline{${nameTex(a.name)}}\\e^{it}+e^{-it}&=2\cos t\\S&=2(${a.value.normTex})^{${a.exponent}}\cos\left(${tex(phase)}\right)=${value.latex}\end{aligned}`,
        text: "فُحص تساوي الجزأين الحقيقيين وتعاكس التخيليين قبل استعمال المرافق؛ لا نفترضه من الرسم.",
      });
    }
  }
  const expanded = substitute(expression),
    node = math.parse(expanded),
    actual: unknown = node.evaluate();
  const expected =
    typeof actual === "number"
      ? { re: actual, im: 0 }
      : math.isComplex(actual)
        ? { re: actual.re, im: actual.im }
        : { re: NaN, im: NaN };
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(context.complex?.values || {})
    .filter(([k]) => k !== "z")
    .slice(-11))
    values[k] = v;
  values.z = value.expression;
  const quantity = target?.[1] || "S";
  steps.push({
    title: "التبسيط والنتيجة",
    latex: `${quantity}=${value.latex}`,
  });
  return {
    title: "قيمة المقدار العقدي",
    finalLatex: `${quantity}=${value.latex}`,
    decimal: zero(value.i) ? value.re : undefined,
    steps,
    visuals: [],
    verification: verifyPair(
      value,
      expected,
      "تقييم المقدار الأصلي كاملًا بحساب عقدي عددي مستقل ومقارنته بطريقة موافر",
    ),
    contextPatch: {
      complex: {
        values,
        current: value.expression,
        ambiguous: false,
        pointNames: context.complex?.pointNames,
      },
      school: {
        ...context.school,
        values: Object.fromEntries(
          Object.entries({
            ...context.school?.values,
            [quantity]: zero(value.i) ? value.r : value.expression,
          }).slice(-12),
        ),
      },
    },
  };
}
