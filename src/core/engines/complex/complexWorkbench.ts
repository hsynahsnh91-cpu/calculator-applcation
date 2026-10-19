import type { AngleMode } from "../../../types/index.js";
import type { ComplexAnswer, ComplexRequest } from "../../solver/complexTypes.js";
import {
  ClarificationError,
  type ComplexVisual,
  type SolutionStep,
  type Verification,
} from "../../solver/types.js";
import { math, numberTex, parseExpression } from "../../solver/math.js";
import {
  addPair,
  subtractPair,
  multiplyPair,
  dividePair,
  integerPower,
  complexValue,
  fromPair,
  scalar,
  tex,
  zero,
  pairLatex,
  evaluateScalar,
  piFraction,
  reducedPi,
  independentPower,
  verifyPair,
  type Pair,
  type ComplexValue,
} from "./complexMath.js";

const T = String.raw;
const aligned = (lines: string[]) =>
  T`\begin{aligned}${lines.join(T`\\[5pt]`)}\end{aligned}`;
const step = (title: string, latex: string, text?: string): SolutionStep => ({
  title,
  latex,
  text,
});
const noCheck = (
  method = "هذه صيغة عامة؛ لا توجد معطيات عددية لفحص مستقل.",
): Verification => ({ passed: false, method });
const answer = (title: string): ComplexAnswer => ({
  title,
  finalLatex: "",
  steps: [],
  visuals: [],
  verification: noCheck(),
});
const origin: Pair = { r: "0", i: "0" };
const cartesianPoint = (name: string, value: ComplexValue) =>
  `${name}(${tex(value.r)},${tex(value.i)})`;
function plot(
  out: ComplexAnswer,
  points: { value: ComplexValue; label: string }[],
  connections?: ComplexVisual["connections"],
  circle?: ComplexVisual["circle"],
) {
  if (
    points.some(
      (point) =>
        Math.max(Math.abs(point.value.re), Math.abs(point.value.im)) > 1e12,
    )
  )
    return;
  out.visuals.push({
    kind: "complex",
    title: "التمثيل في المستوي العقدي",
    points: points.map(({ value, label }) => ({
      re: value.re,
      im: value.im,
      label,
    })),
    connections,
    circle,
  });
}
function contextPatch(
  out: ComplexAnswer,
  input: ComplexRequest,
  value?: ComplexValue,
) {
  const values: Record<string, string> = {};
  const activeKeys = input.points.map((point) => `z_${point.name}`);
  const entries = Object.entries(input.values).filter(([key]) => key !== "z");
  const prioritized = [
    ...entries.filter(([key]) => activeKeys.includes(key)),
    ...entries.filter(([key]) => !activeKeys.includes(key)).reverse(),
  ];
  for (const [key, source] of prioritized) {
    if (Object.keys(values).length >= (value ? 11 : 12)) break;
    try {
      const normalized = complexValue(source).expression;
      if (normalized.length <= 900) values[key] = normalized;
    } catch {
      /* An unrelated stale/unsupported alias must not invalidate this completed result. */
    }
  }
  if (value && value.expression.length <= 900) values.z = value.expression;
  else delete values.z;
  out.contextPatch = {
    complex: {
      values,
      pointNames: input.points
        .filter((point) => values[`z_${point.name}`])
        .map((point) => point.name)
        .slice(0, 12),
      current:
        value?.expression.length && value.expression.length <= 900
          ? value.expression
          : undefined,
    },
  };
}
function angleInput(
  source: string,
  unit: AngleMode,
): { expression: string; radians: number; latex: string } {
  let expression = source.replace(/\b(?:rad|grad|deg)\b/g, "").trim();
  const degrees = /°|\bdeg\b/.test(source);
  expression = expression.replace(/°/g, "");
  const actual = degrees
    ? "DEG"
    : /\bgrad\b/.test(source)
      ? "GRAD"
      : /\brad\b/.test(source)
        ? "RAD"
        : /\bpi\b/.test(expression)
          ? "RAD"
          : unit;
  const factor =
    actual === "DEG" ? "pi/180" : actual === "GRAD" ? "pi/200" : "1";
  const value = complexValue(expression);
  if (!zero(value.i))
    throw new ClarificationError(
      "زاوية التحويل عدد حقيقي، وليست عددًا عقديًا.",
    );
  const normalized = scalar(`(${value.r})*(${factor})`);
  let radians = evaluateScalar(normalized);
  const ratio = piFraction(normalized);
  if (ratio) radians = evaluateScalar(reducedPi(ratio));
  if (Math.abs(radians) > 1e12)
    throw new ClarificationError("اختزل الزاوية بترديد 2π قبل الحساب.");
  return { expression: normalized, radians, latex: tex(normalized) };
}
function polar(norm: string, theta: string): ComplexValue {
  const ratio = piFraction(theta),
    angle = ratio ? reducedPi(ratio) : theta;
  const r = scalar(`(${norm})*cos(${angle})`),
    i = scalar(`(${norm})*sin(${angle})`);
  return {
    r,
    i,
    re: evaluateScalar(r),
    im: evaluateScalar(i),
    expression: `(${r})+i*(${i})`,
    norm,
    normTex: tex(norm),
    angle,
    angleTex: tex(angle),
    piRatio: piFraction(angle),
    latex: pairLatex({ r, i }),
  };
}
function complexLabel(name = "z"): string {
  if (/^z_[A-Z]$/.test(name)) return `z_{${name.slice(2)}}`;
  if (/^z[1-9]$/.test(name)) return `z_{${name.slice(1)}}`;
  if (name === "omega") return T`\omega`;
  return /^(?:z|[abcdw])$/.test(name) ? name : "z";
}
function coefficientTex(value: string): string {
  return /\\[A-Za-z]+$/.test(value) ? value + "{}" : value;
}
function exponentialForm(z: ComplexValue): string {
  if (!z.angleTex) return "0";
  const angle = z.angleTex;
  return `${z.normTex === "1" ? "" : coefficientTex(z.normTex)}e^{${angle.startsWith("-") ? "-i" + angle.slice(1) : "i" + angle}}`;
}
function forms(out: ComplexAnswer, z: ComplexValue, input: ComplexRequest) {
  const theta = z.angleTex ?? T`\theta`;
  out.finalLatex = aligned([
    T`z&=${z.latex}`,
    T`z&=${z.normTex}(\cos\theta+i\sin\theta)`,
    T`z&=${coefficientTex(z.normTex)}e^{i\theta}`,
    ...(z.angleTex ? [T`\theta&=${theta}`] : []),
  ]);
  out.steps = [
    step(
      "الشكل الجبري",
      T`z=a+bi=${z.latex}`,
      "الجزء الحقيقي هو الإحداثي الأفقي، والتخيلي هو الإحداثي العمودي.",
    ),
    step(
      "حساب الطويلة",
      T`r=|z|=\sqrt{\left(${tex(z.r)}\right)^2+\left(${tex(z.i)}\right)^2}=${z.normTex}`,
    ),
    step(
      "تعيين العمدة",
      z.angleTex
        ? aligned([
            T`\cos\theta&=\frac{${tex(z.r)}}{${z.normTex}}`,
            T`\sin\theta&=\frac{${tex(z.i)}}{${z.normTex}}`,
            T`\theta&=${theta}\pmod{2\pi}`,
          ])
        : T`z=0\Longrightarrow\arg(z)\text{ غير معرّفة}`,
      z.angleTex
        ? "نحدّد الربع من الإشارتين. العمدة الرئيسية ضمن ]−π،π]؛ العمد الأخرى تختلف بمضاعف 2π."
        : "للصفر طويلة صفر، ولا عمدة محددة له؛ الصيغتان المثلثية والأسية صحيحتان لأي زاوية.",
    ),
    step(
      "قانون أويلر والتحويل إلى الشكل الأسي",
      T`e^{i\theta}=\cos\theta+i\sin\theta`,
      "نستبدل القوس المثلثي بأسّي أويلر. الزاوية في الأس بالراديان.",
    ),
  ];
  out.visuals.push({
    kind: "formula-cards",
    title: "الأشكال الثلاثة للعدد العقدي",
    cards: [
      { label: "الجبري", latex: T`z=${z.latex}` },
      { label: "المثلثي", latex: T`z=${z.normTex}(\cos\theta+i\sin\theta)` },
      {
        label: "الأسي",
        latex: T`z=${coefficientTex(z.normTex)}e^{i\theta}`,
        caption: z.angleTex
          ? T`العمدة: \(${z.angleTex}\)`
          : "العمدة غير محددة للصفر",
      },
    ],
  });
  if (z.angle) {
    const phase = evaluateScalar(z.angle);
    out.verification = verifyPair(
      z,
      {
        re: evaluateScalar(z.norm) * Math.cos(phase),
        im: evaluateScalar(z.norm) * Math.sin(phase),
      },
      "إعادة بناء الإحداثيين من الطويلة والعمدة بواسطة الحساب العددي المستقل",
    );
  } else
    out.verification = verifyPair(
      z,
      { re: 0, im: 0 },
      "مطابقة الجزأين الحقيقي والتخيلي للعدد الصفري",
    );
  const label = complexLabel(input.targetName);
  if (label !== "z") {
    out.finalLatex = out.finalLatex.replace(/\bz\b/g, label);
    out.steps = out.steps.map((s) => ({
      ...s,
      latex: s.latex.replace(/\bz\b/g, label),
    }));
    out.visuals = out.visuals.map((v) =>
      v.kind === "formula-cards"
        ? {
            ...v,
            cards: v.cards.map((c) => ({
              ...c,
              latex: c.latex.replace(/\bz\b/g, label),
            })),
          }
        : v,
    );
  }
  if (input.form && input.form !== "all") {
    const title =
      input.form === "exponential"
        ? "الشكل الأسي"
        : input.form === "trigonometric"
          ? "الشكل المثلثي"
          : "الشكل الجبري";
    const form =
      input.form === "algebraic"
        ? z.latex
        : input.form === "exponential"
          ? exponentialForm(z)
          : !z.angleTex
            ? "0"
            : T`${z.normTex}(\cos(${z.angleTex})+i\sin(${z.angleTex}))`;
    out.title = title + " للعدد العقدي";
    out.finalLatex = `${label}=${form}`;
    out.visuals = out.visuals.filter((v) => v.kind !== "formula-cards");
    out.visuals.unshift({
      kind: "formula-cards",
      title,
      cards: [{ label: title, latex: out.finalLatex }],
    });
    if (input.form === "exponential")
      out.steps.push(step("كتابة الشكل الأسي بالراديان", out.finalLatex));
  }
  if (input.form === "exponential" && input.deriveFrom && input.targetName) {
    try {
      const source = complexValue(input.deriveFrom.expression);
      if (
        zero(scalar(`(${z.r})-(${source.r})`)) &&
        zero(scalar(`(${z.i})+(${source.i})`))
      ) {
        const previous = complexLabel(input.deriveFrom.name);
        out.steps = [
          step(
            "تمييز العدد المرافق",
            T`${label}=${z.latex}=\overline{${previous}}`,
            "الجزآن الحقيقيان متساويان، والجزآن التخيليان متعاكسان؛ لذا نستنتج بالاعتماد على المرافق، لا بافتراض علاقة من الرسم.",
          ),
          step(
            "الاستنتاج من الشكل الأسي السابق",
            T`${label}=\overline{${previous}}=\overline{${exponentialForm(source)}}=${exponentialForm(z)}`,
            "مرافق العدد يملك الطويلة نفسها والعمدة المعاكسة بترديد 2π.",
          ),
        ];
        const conjugateCheck = verifyPair(
          z,
          { re: source.re, im: -source.im },
          "مطابقة المرافق عددياً وإعادة البناء من الطويلة والعمدة",
        );
        out.verification = {
          ...conjugateCheck,
          passed: out.verification.passed && conjugateCheck.passed,
        };
      }
    } catch {
      /* A stale optional derivation hint must not invalidate explicit current data. */
    }
  }
}
function theorem(input: ComplexRequest): ComplexAnswer {
  const euler = input.theorem === "euler",
    demoivre = input.theorem === "demoivre";
  const out = answer(
    euler
      ? "قانون أويلر"
      : demoivre
        ? "دستور ديموافر"
        : input.theorem === "translation"
          ? "قانون الانسحاب"
          : input.theorem === "homothety"
            ? "قانون التحاكي"
            : "قانون الدوران",
  );
  if (euler) {
    out.finalLatex = T`e^{i\theta}=\cos\theta+i\sin\theta`;
    out.steps = [
      step(
        "المتطلبات",
        T`i^2=-1,\quad\theta\in\mathbb{R}`,
        "تُقاس الزاوية في الأس بالراديان.",
      ),
      step("الزاوية المقابلة", T`e^{-i\theta}=\cos\theta-i\sin\theta`),
      step(
        "الجمع والطرح",
        aligned([
          T`\cos\theta&=\frac{e^{i\theta}+e^{-i\theta}}{2}`,
          T`\sin\theta&=\frac{e^{i\theta}-e^{-i\theta}}{2i}`,
        ]),
      ),
    ];
  } else if (demoivre) {
    out.finalLatex = aligned([
      T`z&=r(\cos\theta+i\sin\theta)`,
      T`z^n&=r^n(\cos n\theta+i\sin n\theta)`,
    ]);
    out.steps = [
      step("ربط أويلر بديموافر", T`(re^{i\theta})^n=r^ne^{in\theta}`),
      step(
        "الشروط",
        T`n\in\mathbb{Z},\quad r\ge0`,
        "إذا كان الأس سالبًا يشترط أن يكون العدد غير صفري. نختزل nθ بترديد 2π ولا نوسّع القوى الكبيرة جبريًا.",
      ),
    ];
  } else if (input.theorem === "distance" || input.theorem === "angle") {
    out.title =
      input.theorem === "distance"
        ? "المسافة في المستوي العقدي"
        : "زاوية شعاعين بعمدة النسبة";
    out.finalLatex =
      input.theorem === "distance"
        ? T`AB=|z_B-z_A|`
        : T`(\overrightarrow{OA},\overrightarrow{OB})=\arg\left(\frac{z_B}{z_A}\right)\pmod{2\pi}`;
    out.steps = [
      step("ربط النقط بالأعداد العقدية", T`z=x+iy\longleftrightarrow M(x,y)`),
      step(
        "المتطلبات",
        input.theorem === "distance"
          ? T`z_A,z_B\in\mathbb C`
          : T`z_A\ne0,\quad z_B\ne0`,
        "في الزاوية الموجهة، ترتيب الشعاعين مهم. العمدة الرئيسية ضمن ]−π،π].",
      ),
    ];
  } else {
    out.finalLatex =
      input.theorem === "translation"
        ? T`z'=z+b`
        : input.theorem === "homothety"
          ? T`z'-\omega=k(z-\omega)`
          : T`z'-\omega=e^{i\theta}(z-\omega)`;
    out.steps = [
      step(
        "المعطيات المطلوبة",
        input.theorem === "translation"
          ? T`z,b\in\mathbb C`
          : input.theorem === "homothety"
            ? T`z,\omega\in\mathbb C,\quad k\in\mathbb R`
            : T`z,\omega\in\mathbb C,\quad\theta\in\mathbb R`,
        T`\(z\) لاحقة النقطة الأصلية، و\(\omega\) لاحقة المركز. حدد زاوية الدوران ووحدتها، أو شعاع الانسحاب، أو نسبة التحاكي.`,
      ),
    ];
  }
  return out;
}
function binomial(n: number, k: number) {
  let value = 1;
  for (let j = 1; j <= k; j++) value = (value * (n - j + 1)) / j;
  return value;
}
function coefficients(n: number, second = false): number[] {
  let a = second ? [1] : [1],
    b = second ? [0, 2] : [0, 1];
  if (!n) return a;
  if (n === 1) return b;
  for (let j = 2; j <= n; j++) {
    const next = Array(j + 1).fill(0) as number[];
    b.forEach((c, i) => (next[i + 1] += 2 * c));
    a.forEach((c, i) => (next[i] -= c));
    a = b;
    b = next;
  }
  return b;
}
function polynomialTex(cs: number[], v: string): string {
  const terms: string[] = [];
  for (let p = cs.length - 1; p >= 0; p--) {
    const c = cs[p];
    if (!c) continue;
    terms.push(
      `${c < 0 ? "-" : terms.length ? "+" : ""}${Math.abs(c) === 1 && p ? "" : Math.abs(c)}${p ? `${v}${p > 1 ? `^{${p}}` : ""}` : ""}`,
    );
  }
  return terms.join("") || "0";
}
const fnTex = (fn: string) => (fn === "cos" ? T`\cos` : T`\sin`);
function trig(input: ComplexRequest): ComplexAnswer {
  const n = input.exponent!,
    v = input.variable === "x" ? "x" : T`\theta`,
    out = answer("تبسيط العبارة المثلثية بأويلر وديموافر");
  const rows: string[] = [],
    checks: number[] = [];
  const selected =
    input.trigFunction === "both" ? ["cos", "sin"] : [input.trigFunction!];
  for (const fn of selected) {
    if (input.trigKind === "multiple") {
      const cs = coefficients(fn === "cos" ? n : n - 1, fn === "sin");
      const rhs = polynomialTex(cs, T`\left(\cos ${v}\right)`);
      rows.push(
        T`${fnTex(fn)}(${n}${v})&=${fn === "sin" ? T`\sin ${v}\left(${rhs}\right)` : rhs}`,
      );
      for (const x of [-1.2, -0.3, 0.2, 0.7, 1.4]) {
        const actual =
          cs.reduce((sum, c, p) => sum + c * Math.cos(x) ** p, 0) *
          (fn === "sin" ? Math.sin(x) : 1);
        checks.push(
          Math.abs(actual - (fn === "cos" ? Math.cos(n * x) : Math.sin(n * x))),
        );
      }
    } else {
      const terms: {
        coefficient: number;
        frequency: number;
        fn: "cos" | "sin";
      }[] = [];
      if (fn === "cos") {
        if (n % 2 === 0)
          terms.push({
            coefficient: binomial(n, n / 2) / 2 ** n,
            frequency: 0,
            fn: "cos",
          });
        for (let k = 0; k < n / 2; k++)
          terms.push({
            coefficient: binomial(n, k) / 2 ** (n - 1),
            frequency: n - 2 * k,
            fn: "cos",
          });
      } else if (n % 2 === 0) {
        const m = n / 2;
        terms.push({
          coefficient: binomial(n, m) / 2 ** n,
          frequency: 0,
          fn: "cos",
        });
        for (let k = 0; k < m; k++)
          terms.push({
            coefficient: ((-1) ** (m + k) * binomial(n, k)) / 2 ** (n - 1),
            frequency: n - 2 * k,
            fn: "cos",
          });
      } else {
        const m = (n - 1) / 2;
        for (let k = 0; k <= m; k++)
          terms.push({
            coefficient: ((-1) ** (m + k) * binomial(n, k)) / 2 ** (n - 1),
            frequency: n - 2 * k,
            fn: "sin",
          });
      }
      const rhs = terms
        .map(
          (term, index) =>
            `${term.coefficient < 0 ? "-" : index ? "+" : ""}${tex(String(Math.abs(term.coefficient)))}${term.frequency ? T`${fnTex(term.fn)}(${term.frequency === 1 ? "" : term.frequency}${v})` : ""}`,
        )
        .join("");
      rows.push(T`${fnTex(fn)}^{${n}}${v}&=${rhs}`);
      for (const x of [-1.2, -0.3, 0.2, 0.7, 1.4])
        checks.push(
          Math.abs(
            terms.reduce(
              (sum, t) =>
                sum +
                t.coefficient *
                  (t.fn === "cos"
                    ? Math.cos(t.frequency * x)
                    : Math.sin(t.frequency * x)),
              0,
            ) -
              (fn === "cos" ? Math.cos(x) : Math.sin(x)) ** n,
          ),
        );
    }
  }
  out.finalLatex = aligned(rows);
  out.steps = [
    step(
      "الانطلاق من أويلر",
      aligned([
        T`\cos ${v}&=\frac{e^{i${v}}+e^{-i${v}}}{2}`,
        T`\sin ${v}&=\frac{e^{i${v}}-e^{-i${v}}}{2i}`,
      ]),
    ),
    step(
      "ديموافر وثنائية نيوتن",
      T`(\cos ${v}+i\sin ${v})^{${n}}=\cos(${n}${v})+i\sin(${n}${v})`,
      "نوسع ثم نجمع الحدود الحقيقية والتخيلية. وعند تخفيض القوى نجمع الأسس المتقابلة بواسطة أويلر.",
    ),
    step(
      "المطابقة",
      out.finalLatex,
      "هذه هوية لكل زاوية حقيقية، وليست مساواة تقريبية عند زاوية واحدة.",
    ),
  ];
  const error = Math.max(...checks);
  out.verification = {
    passed: error < 1e-8,
    maxError: error,
    samples: checks.length,
    method: "مطابقة الهوية عند خمس زوايا مستقلة لكل عبارة بعد بناء المعاملات",
  };
  return out;
}
export function solveComplexRequest(
  input: ComplexRequest,
  angleMode: AngleMode,
): ComplexAnswer {
  if (input.operation === "theorem") return theorem(input);
  if (input.operation === "trig") return trig(input);
  if (input.operation === "distance" || input.operation === "angle") {
    const out = answer(
      input.operation === "distance"
        ? "المسافة بين نقطتين"
        : "الزوايا وعمدة النسبة",
    );
    const points = input.points.map((p) => ({
      name: p.name,
      value: complexValue(p.expression),
    }));
    if (input.operation === "distance") {
      const [a, b] = points;
      const difference = fromPair(subtractPair(b.value, a.value));
      out.finalLatex = T`${a.name}${b.name}=|z_${b.name}-z_${a.name}|=${difference.normTex}`;
      out.steps = [
        step(
          "ربط اللاحقة بالنقطة",
          aligned(
            points
              .slice(0, 2)
              .map(
                (p) =>
                  T`z_${p.name}&=${p.value.latex}\longleftrightarrow ${cartesianPoint(p.name, p.value)}`,
              ),
          ),
        ),
        step(
          "لاحقة الشعاع",
          T`z_{\overrightarrow{${a.name}${b.name}}}=z_${b.name}-z_${a.name}=${difference.latex}`,
        ),
        step(
          "الطويلة هي المسافة",
          T`${a.name}${b.name}=\sqrt{\left(${tex(difference.r)}\right)^2+\left(${tex(difference.i)}\right)^2}=${difference.normTex}`,
        ),
      ];
      out.decimal = evaluateScalar(difference.norm);
      out.verification = verifyPair(
        { r: difference.norm, i: "0" },
        {
          re: Math.hypot(b.value.re - a.value.re, b.value.im - a.value.im),
          im: 0,
        },
        "مطابقة طويلة الفرق مع المسافة الإقليدية المحسوبة من الإحداثيات",
      );
      plot(
        out,
        [
          { value: a.value, label: a.name },
          { value: b.value, label: b.name },
        ],
        [{ from: 0, to: 1, label: `${a.name}${b.name}`, arrow: true }],
      );
      contextPatch(out, input);
      return out;
    }
    let a = complexValue(input.expression!),
      b = complexValue(input.second!),
      notation = T`(\overrightarrow{O${points[0]?.name ?? "A"}},\overrightarrow{O${points[1]?.name ?? "B"}})`,
      numerator = `z_${points[1]?.name ?? "B"}`,
      denominator = `z_${points[0]?.name ?? "A"}`;
    if (input.vertex) {
      const [first, center, last] = input.vertex
        .split("")
        .map((name) => points.find((point) => point.name === name));
      if (!first || !center || !last)
        throw new ClarificationError(
          "عرّف لاحقات النقاط الثلاث التي تسمّيها الزاوية.",
        );
      a = fromPair(subtractPair(first.value, center.value));
      b = fromPair(subtractPair(last.value, center.value));
      notation = T`(\overrightarrow{${center.name}${first.name}},\overrightarrow{${center.name}${last.name}})`;
      numerator = T`z_${last.name}-z_${center.name}`;
      denominator = T`z_${first.name}-z_${center.name}`;
    }
    if (zero(a.norm) || zero(b.norm))
      throw new ClarificationError(
        "لا تُعرّف الزاوية إذا كان أحد الشعاعين صفريًا.",
      );
    const ratio = fromPair(dividePair(b, a));
    const theta = input.unsigned ? scalar(`abs(${ratio.angle})`) : ratio.angle!;
    out.finalLatex = aligned([
      T`\widehat{${notation}}&=\arg\left(\frac{${numerator}}{${denominator}}\right)`,
      T`&=${tex(theta)}${input.unsigned ? "" : T`\pmod{2\pi}`}`,
    ]);
    out.steps = [
      step(
        "الشرط",
        T`z_u\ne0,\quad z_v\ne0`,
        "الترتيب مهم: عمدة v/u هي الزاوية الموجهة من u إلى v.",
      ),
      step(
        "حساب النسبة",
        T`q=\frac{${numerator}}{${denominator}}=${ratio.latex}`,
      ),
      step(
        "العمدة والربع",
        T`\theta=${tex(theta)}\approx ${numberTex((evaluateScalar(theta) * 180) / Math.PI)}^{\circ}`,
        input.unsigned
          ? "أُخذت القيمة المطلقة للعمدة الرئيسية للحصول على زاوية غير موجهة."
          : "العمدة الرئيسية ضمن المجال ]−π،π]، والزوايا المكافئة تختلف بمضاعف 2π.",
      ),
    ];
    const cross = a.re * b.im - a.im * b.re,
      dot = a.re * b.re + a.im * b.im,
      independent = Math.atan2(cross, dot);
    out.verification = verifyPair(
      { r: theta, i: "0" },
      { re: input.unsigned ? Math.abs(independent) : independent, im: 0 },
      "مطابقة عمدة النسبة مع atan2 للجداء المتجهي والسلمي",
    );
    plot(
      out,
      points.map((p) => ({ value: p.value, label: p.name })),
      input.vertex
        ? [
            {
              from: points.findIndex((p) => p.name === input.vertex![1]),
              to: points.findIndex((p) => p.name === input.vertex![0]),
              arrow: true,
            },
            {
              from: points.findIndex((p) => p.name === input.vertex![1]),
              to: points.findIndex((p) => p.name === input.vertex![2]),
              arrow: true,
            },
          ]
        : undefined,
    );
    contextPatch(out, input, ratio);
    return out;
  }
  if (
    input.operation === "forms" &&
    input.formTargets &&
    input.formTargets.length > 1
  ) {
    const out = answer("الأشكال المطلوبة للأعداد العقدية"),
      parts: ComplexAnswer[] = [];
    const targets = input.formTargets.map((target) => ({
      ...target,
      value: complexValue(target.expression),
    }));
    for (const target of targets) {
      const part = answer("الشكل المطلوب");
      forms(part, target.value, {
        ...input,
        targetName: target.name,
        formTargets: undefined,
      });
      parts.push(part);
      out.steps.push(
        ...part.steps.map((s) => ({
          ...s,
          title: `العدد ${target.name.replace(/^z_?/, "")} — ${s.title}`,
        })),
      );
      out.visuals.push(...part.visuals);
    }
    out.finalLatex = aligned(parts.map((p) => p.finalLatex));
    out.verification = {
      passed: parts.every((p) => p.verification.passed),
      samples: parts.length,
      method:
        "إعادة بناء مستقلة لكل عدد من طويلته وعمدته؛ لا يكفي تحقق عدد واحد.",
    };
    plot(
      out,
      targets.map((t) => ({
        value: t.value,
        label: t.name.replace(/^z_?/, ""),
      })),
    );
    contextPatch(out, input);
    out.contextPatch!.complex!.ambiguous = true;
    return out;
  }
  let z: ComplexValue;
  if (input.operation === "euler" && input.angle) {
    const angle = angleInput(input.angle, input.angleUnit ?? angleMode),
      r = input.coefficient
        ? complexValue(input.coefficient)
        : fromPair({ r: "1", i: "0" });
    if (!zero(r.i) || r.re < 0)
      throw new ClarificationError("الطويلة r عدد حقيقي غير سالب.");
    z = polar(r.r, angle.expression);
  } else z = complexValue(input.expression!);
  const out = answer("الأشكال الثلاثة للعدد العقدي");
  if (input.operation === "forms" || input.operation === "euler") {
    forms(out, z, input);
    if (input.operation === "euler") {
      out.title = "حل بقانون أويلر";
      out.steps.unshift(
        step(
          "أويلر عند الزاوية المعطاة",
          T`e^{i\theta}=\cos\theta+i\sin\theta`,
        ),
      );
    }
    plot(out, [
      {
        value: z,
        label: input.targetName?.startsWith("z_")
          ? input.targetName.slice(2)
          : "M",
      },
    ]);
    contextPatch(out, input, z);
    return out;
  }
  if (input.operation === "point") {
    if (input.usePoints && input.points.length >= 2) {
      const points = input.points.map((point) => ({
          name: point.name,
          value: complexValue(point.expression),
        })),
        [a, b] = points,
        difference = fromPair(subtractPair(b.value, a.value));
      out.title = "تمثيل النقط والشعاع الواصل بينها";
      out.finalLatex = aligned([
        ...points.map(
          (point) =>
            T`z_${point.name}&=${point.value.latex}\longleftrightarrow ${cartesianPoint(point.name, point.value)}`,
        ),
        T`\overrightarrow{${a.name}${b.name}}&=(${tex(difference.r)},${tex(difference.i)})`,
      ]);
      out.steps = [
        step("ربط اللاحقة بالنقطة", T`z=x+iy\longleftrightarrow M(x,y)`),
        step(
          "لاحقة الشعاع",
          T`z_{\overrightarrow{${a.name}${b.name}}}=z_${b.name}-z_${a.name}=${difference.latex}`,
        ),
      ];
      plot(
        out,
        points.map((point) => ({ value: point.value, label: point.name })),
        [{ from: 0, to: 1, arrow: true, label: `${a.name}${b.name}` }],
      );
      out.verification = verifyPair(
        difference,
        { re: b.value.re - a.value.re, im: b.value.im - a.value.im },
        "مطابقة فرق اللاحقتين مع طرح إحداثيات النقطتين",
      );
      contextPatch(out, input, difference);
      return out;
    }
    const O = fromPair(origin);
    out.title = "تمثيل النقط والأشعة";
    out.finalLatex = aligned([
      T`z&=${z.latex}\longleftrightarrow ${cartesianPoint("M", z)}`,
      T`\overrightarrow{OM}&=(${tex(z.r)},${tex(z.i)})`,
    ]);
    out.steps = [
      step(
        "معنى الإحداثيين",
        T`z=x+iy\longleftrightarrow M(x,y)`,
        "المحور الأفقي للجزء الحقيقي، والعمودي للجزء التخيلي.",
      ),
      step("الشعاع والمسافة عن المبدأ", T`OM=|z|=${z.normTex}`),
    ];
    plot(
      out,
      [
        { value: O, label: "O" },
        { value: z, label: "M" },
      ],
      [{ from: 0, to: 1, arrow: true, label: "OM" }],
    );
    const independent: unknown = parseExpression(input.expression!).evaluate();
    const expected =
      typeof independent === "number"
        ? { re: independent, im: 0 }
        : math.isComplex(independent)
          ? independent
          : { re: NaN, im: NaN };
    out.verification = verifyPair(
      z,
      expected,
      "مقارنة الإحداثيين مع تقييم مستقل لعبارة اللاحقة الأصلية",
    );
    contextPatch(out, input, z);
    return out;
  }
  if (["translation", "homothety", "rotation"].includes(input.operation)) {
    const center = complexValue(input.center ?? "0");
    let transformed: ComplexValue, expected: { re: number; im: number };
    if (input.operation === "translation") {
      const b = complexValue(input.displacement!);
      transformed = fromPair(addPair(z, b));
      expected = { re: z.re + b.re, im: z.im + b.im };
      out.title = "الانسحاب في المستوي العقدي";
      out.finalLatex = T`z'=z+b=${transformed.latex}`;
      out.steps = [
        step("المعطيات", aligned([T`z&=${z.latex}`, T`b&=${b.latex}`])),
        step("نقل الإحداثيين", aligned([T`x'&=x+\Re(b)`, T`y'&=y+\Im(b)`])),
      ];
    } else if (input.operation === "homothety") {
      const k = complexValue(input.coefficient!);
      if (!zero(k.i))
        throw new ClarificationError("نسبة التحاكي k يجب أن تكون حقيقية.");
      transformed = fromPair(
        addPair(center, multiplyPair(k, subtractPair(z, center))),
      );
      expected = {
        re: center.re + k.re * (z.re - center.re),
        im: center.im + k.re * (z.im - center.im),
      };
      out.title = "التحاكي في المستوي العقدي";
      out.finalLatex = aligned([
        T`z'-\omega&=k(z-\omega)`,
        T`z'&=${transformed.latex}`,
      ]);
      out.steps = [
        step(
          "المركز والنسبة",
          aligned([T`\omega&=${center.latex}`, T`k&=${k.latex}`]),
        ),
        step(
          "الابتعاد عن المركز ثم الضرب",
          T`z-\omega=${fromPair(subtractPair(z, center)).latex}`,
        ),
        step(
          "الأثر على الأطوال",
          T`\Omega M'=|k|\,\Omega M`,
          "إذا كانت النسبة سالبة ينعكس الاتجاه، وإذا كانت صفرًا تكون الصورة المركز نفسه.",
        ),
      ];
    } else {
      const angle = angleInput(input.angle!, input.angleUnit ?? angleMode),
        phase = polar("1", angle.expression),
        difference = subtractPair(z, center);
      transformed = fromPair(addPair(center, multiplyPair(phase, difference)));
      const dx = z.re - center.re,
        dy = z.im - center.im;
      expected = {
        re:
          center.re +
          Math.cos(angle.radians) * dx -
          Math.sin(angle.radians) * dy,
        im:
          center.im +
          Math.sin(angle.radians) * dx +
          Math.cos(angle.radians) * dy,
      };
      out.title = "الدوران بقانون أويلر";
      out.finalLatex = aligned([
        T`z'-\omega&=e^{i\theta}(z-\omega)`,
        T`z'&=${transformed.latex}`,
      ]);
      out.steps = [
        step(
          "الزاوية بالراديان",
          T`\theta=${angle.latex}`,
          "الإشارة الموجبة عكس عقارب الساعة. الدرجة الصريحة لها الأولوية على إعداد DEG/RAD/GRAD.",
        ),
        step(
          "قانون أويلر",
          T`e^{i\theta}=\cos\theta+i\sin\theta=${phase.latex}`,
        ),
        step(
          "نقل المركز وإرجاعه",
          aligned([
            T`z-\omega&=${fromPair(difference).latex}`,
            T`z'&=\omega+e^{i\theta}(z-\omega)`,
          ]),
        ),
        step("حفظ المسافة عن المركز", T`|z'-\omega|=|z-\omega|`),
      ];
    }
    out.steps.push(
      step(
        "إحداثيات الصورة",
        T`M'(${tex(transformed.r)},${tex(transformed.i)})`,
      ),
    );
    out.verification = verifyPair(
      transformed,
      expected,
      "مطابقة التحويل العقدي مع التحويل الديكارتي المستقل للإحداثيات",
    );
    plot(
      out,
      [
        { value: center, label: input.operation === "translation" ? "O" : "Ω" },
        { value: z, label: "M" },
        { value: transformed, label: "M′" },
      ],
      [
        { from: 0, to: 1 },
        { from: 0, to: 2 },
        {
          from: 1,
          to: 2,
          arrow: true,
          label: input.operation === "translation" ? "b" : undefined,
        },
      ],
      input.operation === "rotation"
        ? {
            re: center.re,
            im: center.im,
            radius: Math.hypot(z.re - center.re, z.im - center.im),
          }
        : undefined,
    );
    contextPatch(out, input, transformed);
    return out;
  }
  if (input.operation === "arithmetic") {
    const w = complexValue(input.second!),
      operations = input.operator
        ? [input.operator]
        : (["+", "-", "*", "/"] as const);
    const rows: string[] = [],
      checks: Verification[] = [];
    let last: ComplexValue | undefined;
    out.title = "العمليات الجبرية على الأعداد العقدية";
    out.steps = [
      step(
        "العددان المعطيان",
        aligned([T`z_1&=${z.latex}`, T`z_2&=${w.latex}`]),
      ),
    ];
    for (const op of operations) {
      if (op === "/" && zero(w.norm)) {
        out.note = "القسمة على الصفر غير معرّفة؛ بقيت العمليات الأخرى مكتملة.";
        if (operations.length === 1)
          throw new ClarificationError(
            "القسمة على العدد العقدي الصفري غير معرّفة.",
          );
        continue;
      }
      const pair =
        op === "+"
          ? addPair(z, w)
          : op === "-"
            ? subtractPair(z, w)
            : op === "*"
              ? multiplyPair(z, w)
              : dividePair(z, w);
      last = fromPair(pair);
      rows.push(
        op === "/"
          ? T`\frac{z_1}{z_2}&=${last.latex}`
          : T`z_1${op === "*" ? T`\cdot` : op} z_2&=${last.latex}`,
      );
      const first = math.complex(z.re, z.im),
        second = math.complex(w.re, w.im);
      const result: unknown =
        op === "+"
          ? math.add(first, second)
          : op === "-"
            ? math.subtract(first, second)
            : op === "*"
              ? math.multiply(first, second)
              : math.divide(first, second);
      const expected =
        typeof result === "number"
          ? { re: result, im: 0 }
          : math.isComplex(result)
            ? { re: result.re, im: result.im }
            : { re: NaN, im: NaN };
      checks.push(
        verifyPair(
          pair,
          expected,
          "مطابقة الحساب الجبري الرمزي مع حساب عقدي عددي مستقل",
        ),
      );
      out.steps.push(
        step(
          op === "+"
            ? "الجمع"
            : op === "-"
              ? "الطرح"
              : op === "*"
                ? "الضرب باستخدام i²=−1"
                : "القسمة باستعمال المرافق",
          op === "/"
            ? T`\frac{z_1}{z_2}=\frac{z_1\overline{z_2}}{|z_2|^2}`
            : op === "*"
              ? T`(a+bi)(c+di)=(ac-bd)+(ad+bc)i`
              : op === "+"
                ? T`(a+bi)+(c+di)=(a+c)+(b+d)i`
                : T`(a+bi)-(c+di)=(a-c)+(b-d)i`,
        ),
      );
    }
    out.finalLatex = aligned(rows);
    out.verification = {
      passed: checks.length > 0 && checks.every((check) => check.passed),
      method: "مطابقة كل عملية مع تقييم عقدي عددي مستقل",
      samples: checks.length,
      maxError: Math.max(...checks.map((check) => check.maxError ?? Infinity)),
    };
    if (!Number.isFinite(out.verification.maxError))
      delete out.verification.maxError;
    contextPatch(out, input, operations.length === 1 ? last : undefined);
    return out;
  }
  if (input.operation === "conjugate" || input.operation === "inverse") {
    const inverse = input.operation === "inverse",
      pair = inverse
        ? dividePair({ r: "1", i: "0" }, z)
        : { r: z.r, i: scalar(`-(${z.i})`) },
      value = fromPair(pair);
    out.title = inverse ? "مقلوب العدد العقدي" : "مرافق العدد العقدي";
    out.finalLatex = inverse
      ? T`\frac1z=${value.latex}`
      : T`\overline z=${value.latex}`;
    out.steps = [
      step(
        "القاعدة الجبرية",
        inverse
          ? T`\frac1z=\frac{\overline z}{|z|^2},\quad z\ne0`
          : T`\overline{a+bi}=a-bi`,
      ),
      step("التطبيق", out.finalLatex),
    ];
    out.verification = inverse
      ? verifyPair(
          multiplyPair(z, value),
          { re: 1, im: 0 },
          "ضرب العدد في مقلوبه ومطابقة الواحد",
        )
      : verifyPair(
          value,
          { re: z.re, im: -z.im },
          "مطابقة الجزء الحقيقي وعكس إشارة الجزء التخيلي",
        );
    contextPatch(out, input, value);
    return out;
  }
  if (input.operation === "power") {
    const n = input.exponent!;
    out.title = "القوى الكبيرة بدستور ديموافر";
    if (zero(z.norm)) {
      if (n <= 0)
        throw new ClarificationError(
          "صفر أس صفر والأس السالب للصفر غير معرّفين.",
        );
      out.finalLatex = T`0^{${n}}=0`;
      out.verification = verifyPair(
        origin,
        { re: 0, im: 0 },
        "مطابقة قوة الصفر الموجبة",
      );
      contextPatch(out, input, z);
      return out;
    }
    const phase = z.piRatio
        ? reducedPi(z.piRatio, n)
        : scalar(`(${n})*(${z.angle})`),
      phaseTex = tex(phase);
    const square = scalar(`(${z.r})^2+(${z.i})^2`),
      squareRootExact = Number.isInteger(evaluateScalar(z.norm));
    const powerBase = !squareRootExact && n % 2 === 0 ? tex(square) : z.normTex,
      powerExponent = !squareRootExact && n % 2 === 0 ? n / 2 : n;
    let radial = zero(`${z.norm}-1`)
      ? "1"
      : powerExponent === 0
        ? "1"
        : powerExponent === 1
          ? powerBase
          : T`\left(${powerBase}\right)^{${powerExponent}}`;
    let final =
      phase === "0"
        ? radial
        : phase === "pi"
          ? `-${radial}`
          : phase === "(1/2)*pi" || phase === "pi/2"
            ? `${radial === "1" ? "" : radial}i`
            : phase === "(-1/2)*pi" || phase === "-pi/2"
              ? `-${radial === "1" ? "" : radial}i`
              : T`${radial === "1" ? "" : radial}(\cos(${phaseTex})+i\sin(${phaseTex}))`;
    let computed: ComplexValue | undefined;
    if (Math.abs(n) <= 32) {
      try {
        computed = fromPair(integerPower(z, n));
        final = computed.latex;
      } catch (error) {
        if (!(error instanceof ClarificationError))
          throw error; /* Keep the exact polar answer when expansion exceeds the display/numeric budget. */
      }
    }
    out.finalLatex = T`z^{${n}}=${final}`;
    out.steps = [
      step(
        "الطويلة والعمدة",
        aligned([T`r&=${z.normTex}`, T`\theta&=${z.angleTex}`]),
      ),
      step(
        "دستور ديموافر",
        aligned([
          T`z^n&=r^ne^{in\theta}`,
          T`&=r^n(\cos n\theta+i\sin n\theta)`,
        ]),
      ),
      step(
        "اختزال الزاوية",
        z.piRatio
          ? T`${n}\theta\equiv ${phaseTex}\pmod{2\pi}`
          : T`n\theta=${phaseTex}`,
        z.piRatio
          ? "اختُزل مضاعف π بحساب صحيح، دون ضرب زاوية مقربة في أس كبير."
          : "العمدة بقيت رمزية بدقة؛ لم تُستبدل بزاوية مقربة.",
      ),
      step("النتيجة دون توسيع هائل", out.finalLatex),
    ];
    const numericRadial = Math.exp(n * Math.log(evaluateScalar(z.norm)));
    if (Number.isFinite(numericRadial) && numericRadial > 0) {
      const p = evaluateScalar(phase);
      const expected = independentPower(z, n);
      const displayed = computed ?? {
        r: String(numericRadial * Math.cos(p)),
        i: String(numericRadial * Math.sin(p)),
      };
      out.verification = verifyPair(
        displayed,
        expected,
        "مطابقة ديموافر مع رفع مستقل بالتربيع المتكرر",
      );
    } else
      out.note =
        "النتيجة رمزية لتجنّب تجاوز المجال العددي؛ لا شارة تحقق عددي دون مقارنة منتهية.";
    if (computed) {
      plot(out, [{ value: computed, label: "zⁿ" }]);
      contextPatch(out, input, computed);
    } else {
      contextPatch(out, input);
    }
    return out;
  }
  if (input.operation === "roots") {
    const n = input.rootN!;
    out.title = "الجذور النونية للعدد العقدي";
    if (zero(z.norm)) {
      out.finalLatex = T`w^{${n}}=0\Longrightarrow w=0`;
      out.steps = [
        step(
          "الجذر الوحيد المتميز",
          out.finalLatex,
          "تتطابق جميع الجذور في الصفر؛ ليست نقاطًا متمايزة على دائرة.",
        ),
      ];
      out.verification = verifyPair(
        origin,
        { re: 0, im: 0 },
        "تعويض الجذر الصفري",
      );
      contextPatch(out, input, z);
      return out;
    }
    const norm = scalar(`(${z.norm})^(1/${n})`),
      roots: ComplexValue[] = [],
      errors: number[] = [];
    for (let k = 0; k < n; k++) {
      const theta = scalar(`((${z.angle})+2*${k}*pi)/${n}`),
        root = polar(norm, theta);
      roots.push(root);
      const check = verifyPair(
        z,
        independentPower(root, n),
        "رفع عددي مستقل للجذر",
      );
      errors.push(check.maxError ?? Infinity);
    }
    out.finalLatex = aligned(
      roots.map((root, k) => T`w_{${k}}&=${root.latex}`),
    );
    out.steps = [
      step(
        "المعادلة وصيغة الجذور",
        aligned([
          T`w^{${n}}&=${z.latex}`,
          T`w_k&=\sqrt[${n}]{${z.normTex}}e^{i\frac{\theta+2k\pi}{${n}}}`,
          T`k&=0,\ldots,${n - 1}`,
        ]),
      ),
      step(
        "العمدة والتوزع الهندسي",
        aligned([
          T`\theta&=${z.angleTex}`,
          T`\Delta\varphi&=\frac{2\pi}{${n}}`,
        ]),
        "الجذور غير الصفرية نقاط متساوية التباعد على دائرة مركزها المبدأ.",
      ),
    ];
    const error = Math.max(...errors);
    out.verification = {
      passed: errors.length === n && error < 1e-7,
      maxError: Number.isFinite(error) ? error : undefined,
      samples: n,
      method: "رفع كل جذر إلى رتبته ومطابقة العدد الأصلي قبل التقريب",
    };
    plot(
      out,
      roots.map((value, k) => ({ value, label: `w${k}` })),
      undefined,
      { re: 0, im: 0, radius: evaluateScalar(norm) },
    );
    contextPatch(out, input);
    out.contextPatch!.complex!.ambiguous = n > 1;
    return out;
  }
  throw new ClarificationError("حدّد العملية المطلوبة على العدد العقدي.");
}
