import type { SolverContext, SolverResult, EngineId } from "../solver/types";
import { ClarificationError } from "../solver/types";
import { mathInstructionText } from "../solver/textbook";
import {
  math,
  polynomialCoefficients,
  expressionTex,
  verifyDerivative,
  verifyIntegral,
} from "../solver/math";
import { Rational as R, exact, ZERO, ONE } from "./probabilityExact";
import { scalar, complexValue } from "./complexMath";
const T = String.raw;
const fail = (s: string) => new ClarificationError(s);
type Answer = Pick<
  SolverResult,
  | "title"
  | "finalLatex"
  | "steps"
  | "visuals"
  | "verification"
  | "contextPatch"
  | "decimal"
  | "note"
>;
export function schoolInterval(text: string) {
  const m =
    text.match(
      /(?:المجال|الفترة|الفاصل|مجال|فترة)\s*[\[(\]]\s*([+\-\d./]+)\s*[,،]\s*([+\-\d./]+)\s*[\])\[]/,
    ) || text.match(/بين\s+([+\-\d./]+)\s+و\s*([+\-\d./]+)/);
  if (!m) throw fail("ما طرفا المجال العددي المحدد؟ اكتب مثلًا الفترة (0,1).");
  const a = exact(m[1]),
    b = exact(m[2]);
  if (a.cmp(b) >= 0 || ![a.number(), b.number()].every(Number.isFinite))
    throw fail("طرفا المجال منتهيان ومرتّبان من الأصغر إلى الأكبر.");
  return { a, b };
}
function polynomialR(expression: string) {
  const numbers = polynomialCoefficients(expression);
  if (numbers.some((n) => !Number.isFinite(n) || Math.abs(n) > 1e6))
    throw fail("تجاوزت معاملات كثيرة الحدود مجال البرهان المحدود.");
  const values = numbers.map((n) => exact(String(n))),
    candidate = values
      .map((c, i) => `(${c.text()})*x^${values.length - i - 1}`)
      .join("+");
  if (scalar(`(${expression})-(${candidate})`) !== "0")
    throw fail(
      "لم تُثبت مطابقة كثيرة الحدود بمعاملاتها الدقيقة؛ لا يكفي التقريب العددي.",
    );
  return values;
}
const evalR = (p: R[], x: R) => p.reduce((s, c) => s.mul(x).add(c), ZERO);
function rangeQuadratic(p: R[], a: R, b: R) {
  if (p.length > 3)
    throw fail("فحص الإشارة المدرسي المدعوم هنا حتى الدرجة الثانية.");
  const vals = [evalR(p, a), evalR(p, b)];
  if (p.length === 3 && p[0].n !== 0n) {
    const vertex = p[1].mul(new R(-1)).div(p[0].mul(new R(2)));
    if (vertex.cmp(a) > 0 && vertex.cmp(b) < 0) vals.push(evalR(p, vertex));
  }
  return {
    min: vals.reduce((v, x) => (v.cmp(x) < 0 ? v : x)),
    max: vals.reduce((v, x) => (v.cmp(x) > 0 ? v : x)),
  };
}
function namedFunction(context: SolverContext, name = "f") {
  const fn = context.school?.functions?.[name];
  if (fn)
    return fn.expression.replace(new RegExp(`\\b${fn.variable}\\b`, "g"), "x");
  if (name === "f" && context.expression) return context.expression;
  throw fail(`ما تعريف التابع ${name}؟`);
}
/** Verification is an actual substitution, never a redefinition by the asserted result. */
export function schoolSubstitution(
  text: string,
  context: SolverContext,
): Answer | undefined {
  const demand = mathInstructionText(text);
  if (!/^تحقق/.test(demand)) return;
  const named = demand.match(
    /\b([fgh])\s*\(([^(),]{1,120})\)\s*=\s*([^،؛\n]+)/,
  );
  const point = demand.match(/(?:x\s*=|العدد)\s*([+\-\d./]+)/)?.[1];
  if (!named && !point)
    throw fail("ما التابع وقيمة التعويض والمساواة التي تريد التحقق منها؟");
  const name = named?.[1] || "f",
    source = namedFunction(context, name),
    at = complexValue(named?.[2] || point!),
    expected = complexValue(named ? named[3].replace(/[.\s]+$/, "") : "0");
  if (at.im !== 0 || expected.im !== 0)
    throw fail("مسار التعويض هذا للتابع الحقيقي عند قيمة حقيقية محددة.");
  const actual = complexValue(source.replace(/\bx\b/g, `(${at.expression})`)),
    same =
      scalar(`(${actual.r})-(${expected.r})`) === "0" &&
      scalar(`(${actual.i})-(${expected.i})`) === "0";
  const numeric: unknown = math.evaluate(source, { x: at.re });
  const error =
    typeof numeric === "number"
      ? Math.abs(numeric - actual.re) / Math.max(1, Math.abs(actual.re))
      : Infinity;
  return {
    title: "التحقق بالتعويض في التابع المعطى",
    finalLatex: T`${name}(${at.latex})=${actual.latex}\quad\text{${same ? "المساواة محققة" : "المساواة المدعاة غير صحيحة"}}`,
    steps: [
      {
        title: "المعطى المطلوب فحصه",
        latex: T`${name}(x)=${expressionTex(source)},\quad x=${at.latex}`,
      },
      {
        title: "التعويض الفعلي",
        latex: T`${name}(${at.latex})=${actual.latex}`,
      },
      {
        title: "المقارنة دون تغيير المعطيات",
        latex: T`${actual.latex}${same ? "=" : "\\ne"}${expected.latex}`,
      },
    ],
    visuals: [],
    verification: {
      passed: Number.isFinite(error) && error < 1e-9,
      method:
        "تقييم التابع الأصلي بحساب مستقل ومقارنته بالتعويض الرمزي؛ الشارة تتحقق من الحكم ولو كان رفض المساواة",
      maxError: Number.isFinite(error) ? error : undefined,
      samples: 1,
    },
  };
}
/** IVT proof for a polynomial <= cubic and an algebraically certified derivative sign. */
export function schoolUniqueRoot(
  text: string,
  context: SolverContext,
): Answer | undefined {
  if (!/حل(?:ا)? وحيد|حلا وحيدا|وجود حل وحيد/.test(text)) return;
  const expression = namedFunction(context),
    { a, b } = schoolInterval(text),
    cs = polynomialR(expression),
    fa = evalR(cs, a),
    fb = evalR(cs, b),
    degree = cs.length - 1;
  if (fa.mul(fb).cmp(ZERO) >= 0)
    throw fail(
      "قيمتا الطرفين لا تحققان تبدل الإشارة الصارم؛ لا يمكن تقديم برهان القيم المتوسطة المطلوب بهذه المعطيات.",
    );
  const derivative = cs.slice(0, -1).map((c, i) => c.mul(new R(degree - i))),
    range = rangeQuadratic(derivative.length ? derivative : [ZERO], a, b);
  const increasing = range.min.cmp(ZERO) >= 0 && range.max.cmp(ZERO) > 0,
    decreasing = range.max.cmp(ZERO) <= 0 && range.min.cmp(ZERO) < 0;
  if (!increasing && !decreasing)
    throw fail(
      "لم تُثبت رتابة صارمة على المجال؛ لا يكفي وجود جذر عددي لإثبات أنه وحيد.",
    );
  const df = math.simplify(math.derivative(expression, "x")).toString(),
    check = verifyDerivative(expression, df),
    numeric = [a.number(), b.number()].map((x) =>
      Number(math.evaluate(expression, { x })),
    );
  return {
    title: "وجود حل وحيد بمبرهنة القيم المتوسطة والرتابة",
    finalLatex: T`\exists!\alpha\in\left(${a.tex()},${b.tex()}\right):f(\alpha)=0`,
    steps: [
      {
        title: "المعطى والمجال",
        latex: T`f(x)=${expressionTex(expression)},\quad x\in[${a.tex()},${b.tex()}]`,
      },
      {
        title: "الاستمرار",
        latex: T`f\in\mathcal C([${a.tex()},${b.tex()}])`,
        text: "التابع كثيرة حدود، فهو مستمر على R، ومن ثم على المجال المغلق المعطى.",
      },
      {
        title: "القيم المتوسطة — وجود الحل",
        latex: T`f(${a.tex()})=${fa.tex()},\quad f(${b.tex()})=${fb.tex()},\quad f(${a.tex()})f(${b.tex()})<0`,
        text: "بتطبيق مبرهنة القيم المتوسطة توجد قيمة α داخل المجال المفتوح تحقق f(α)=0.",
      },
      {
        title: "المشتق وإشارته",
        latex: T`f'(x)=${expressionTex(df)},\quad ${range.min.tex()}\le f'(x)\le ${range.max.tex()}`,
        text: "حُصرت كثيرة حدود المشتق بفحص الطرفين ورأس القطع عند وجوده؛ ليس بفحص عينات فقط.",
      },
      {
        title: "الرتابة ووحدانية الحل",
        latex: T`\text{${increasing ? "متزايد تمامًا" : "متناقص تمامًا"}}\Longrightarrow\exists!\alpha`,
        text: "المشتق ذو إشارة واحدة وغير معدوم كليًا، وقد ينعدم عند عدد منتهٍ من النقاط؛ لذلك التابع رتيب تمامًا ولا يمكنه أخذ القيمة0 مرتين.",
      },
    ],
    visuals: [],
    verification: {
      ...check,
      passed:
        check.passed &&
        Math.abs(numeric[0] - fa.number()) < 1e-8 &&
        Math.abs(numeric[1] - fb.number()) < 1e-8,
      method:
        "فحص قيم الطرفين والمشتق بحساب مستقل؛ برهان الوجود والوحدانية قائم على الاستمرار والرتابة",
    },
    contextPatch: { expression, variable: "x", derivative: df },
  };
}
/** Derived curriculum quantities reuse the existing integration engine, not a numeric lookup. */
export async function schoolIntegral(
  text: string,
  context: SolverContext,
): Promise<Answer | undefined> {
  const area = /مساحة.*(?:منحني|منحنى)/.test(text),
    volume = /حجم دوراني|الحجم الدوراني/.test(text),
    mean = /القيمة الوسط[ىي]|القيمة المتوسطة/.test(text);
  if (!area && !volume && !mean) return;
  const { a, b } = schoolInterval(text),
    f = namedFunction(context);
  let integrand = f,
    factor = "1",
    law = "",
    title = "",
    quantity = "A";
  const steps: SolverResult["steps"] = [
    {
      title: "المعطى وحدود التكامل",
      latex: T`f(x)=${expressionTex(f)},\quad a=${a.tex()},\quad b=${b.tex()}`,
    },
  ];
  if (area) {
    const g = context.school?.functions?.g
      ? namedFunction(context, "g")
      : /محور الفواصل|محور x|محور Ox/.test(text)
        ? "0"
        : undefined;
    if (g === undefined)
      throw fail(
        "ما التابع الثاني الذي يحد الحيز، أو هل الحد الثاني هو محور الفواصل؟",
      );
    let difference = `(${f})-(${g})`;
    const range = rangeQuadratic(polynomialR(difference), a, b);
    if (range.min.cmp(ZERO) >= 0) {
    } else if (range.max.cmp(ZERO) <= 0) difference = `-(${difference})`;
    else
      throw fail(
        "يتبدل ترتيب المنحنيين داخل المجال؛ يلزم تقسيمه عند نقاط التقاطع قبل حساب المساحة.",
      );
    integrand = difference;
    law = T`A=\int_a^b|f(x)-g(x)|\,dx`;
    title = "المساحة بين المنحنيين";
    steps.push({
      title: "تعيين التابع الأعلى وإزالة القيمة المطلقة",
      latex: T`g(x)=${expressionTex(g)},\quad |f-g|=${expressionTex(integrand)}`,
      text: "فُحصت إشارة الفرق على المجال جبريًا قبل إزالة القيمة المطلقة.",
    });
  }
  if (volume) {
    if (!/محور الفواصل|محور x|محور Ox/.test(text))
      throw fail(
        "حول أي محور يدور الحيز؟ المسار الحالي يدعم محور الفواصل صراحةً.",
      );
    integrand = `(${f})^2`;
    factor = "pi";
    law = T`V=\pi\int_a^b[f(x)]^2\,dx`;
    title = "الحجم الدوراني حول محور الفواصل";
    quantity = "V";
  }
  if (mean) {
    factor = ONE.div(b.sub(a)).text();
    law = T`M=\frac1{b-a}\int_a^bf(x)\,dx`;
    title = "القيمة الوسطى للتابع";
    quantity = "M";
  }
  const { solveIntegral } = await import("./integrationEngine");
  const v = solveIntegral({
    expression: integrand,
    variable: "x",
    mode: "definite",
    lower: a.number(),
    upper: b.number(),
    method: "automatic",
  });
  if ((v.approximate || v.numericalFallback) && !/تقريب|عدديا/.test(text))
    throw fail(
      "لا يتوفر حساب مدرسي دقيق لهذه الكمية في المسار الحالي؛ هل تريد تقريبًا عدديًا صريحًا؟",
    );
  if (!v.exactValueLatex || v.decimalValue === undefined)
    throw fail("لم يتكون تكامل محدد صالح لهذه الكمية.");
  const nerdamer = (await import("nerdamer")).default;
  const raw = (
      nerdamer.convertFromLaTeX(v.exactValueLatex) as unknown as {
        text(): string;
      }
    ).text(),
    value = complexValue(`(${factor})*(${raw})`),
    check = verifyIntegral(integrand, a.number(), b.number(), v.decimalValue);
  steps.push(
    { title: "القانون المدرسي", latex: law },
    ...v.steps.map((s) => ({ title: s.title, text: s.text, latex: s.latex })),
    { title: "التعويض والنتيجة", latex: `${quantity}=${value.latex}` },
  );
  return {
    title,
    finalLatex: `${quantity}=${value.latex}`,
    decimal: value.re,
    steps,
    visuals: [],
    verification: check,
    contextPatch: {
      expression: f,
      variable: "x",
      school: {
        ...context.school,
        values: Object.fromEntries(
          Object.entries({
            ...context.school?.values,
            [quantity]: value.r,
          }).slice(-12),
        ),
      },
    },
  };
}
export async function schoolSphereTangency(
  text: string,
  context: SolverContext,
): Promise<Answer | undefined> {
  if (!/كرة/.test(text) || !/مماس|تماس/.test(mathInstructionText(text))) return;
  const { extractSpaceRequest } = await import("../solver/extractors/geometry");
  const r = extractSpaceRequest(text, context, "RAD");
  if (!r.sphere || r.planes.length !== 1)
    throw fail("أعط كرة محددة ومستويا واحدا لفحص التماس.");
  const g = await import("./spaceGeometryMath");
  const sphere = r.sphere,
    center = g.vector(sphere.center),
    r2 = g.read(sphere.radiusSquared);
  if (r2.sign() <= 0)
    throw fail("شرط التماس المدعوم لكرة غير منعدمة ذات نصف قطر موجب.");
  const p = r.model.planes[r.planes[0]],
    n = g.vector(p.normal),
    numerator = g.dot(n, center).add(g.read(p.offset)),
    d2 = numerator.pow(2).div(g.dot(n, n)),
    cmp = d2.sub(r2).sign();
  const id =
    r.points.find((k) =>
      r.model.points[k].every((c, i) => g.read(c).eq(center[i])),
    ) || "K";
  r.model.points[id] = sphere.center;
  const { solveSpaceRequest } = await import("./spaceGeometryWorkbench");
  const out = solveSpaceRequest({
    ...r,
    operation: "distance-plane",
    points: [id],
  });
  out.title = "الوضع النسبي للمستوي والكرة";
  out.finalLatex = T`d^2=${d2.tex()},\quad R^2=${r2.tex()}\Longrightarrow\text{${cmp === 0 ? "المستوي مماس للكرة" : cmp < 0 ? "المستوي قاطع للكرة وليس مماسًا" : "المستوي لا يقطع الكرة وليس مماسًا"}}`;
  out.steps.push({
    title: "معيار التماس والمقارنة",
    latex: T`d(K,P)=R\Longleftrightarrow d(K,P)^2=R^2`,
    text: "نصف القطر موجب. مقارنة مربع البعد بمربع نصف القطر تميز التماس عن القطع وعدم التقاطع.",
  });
  const visual = out.visuals.find((v) => v.kind === "space");
  if (visual?.kind === "space")
    visual.sphere = {
      center: center.map((c) => c.number()) as [number, number, number],
      radius: Math.sqrt(r2.number()),
    };
  if (out.contextPatch?.geometry) out.contextPatch.geometry.sphere = sphere;
  return out;
}
export function schoolAnalysisEngine(text: string): EngineId | undefined {
  return /حل(?:ا)? وحيد|حلا وحيدا/.test(text) ? "calculusEngine" : undefined;
}
