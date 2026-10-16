import {
  ClarificationError,
  type HistogramVisual,
  type SolutionStep,
  type Verification,
  type Visual,
} from "../solver/types";
import type { DiscreteLaw, StatisticsModel } from "../solver/probabilityTypes";
import {
  Rational,
  ZERO,
  ONE,
  exact,
  probability,
  sum,
  near,
  columns,
  approximate,
} from "./probabilityExact";
import { math, parseExpression } from "../solver/math";

export function readLaw(model: DiscreteLaw) {
  if (
    !model.values.length ||
    model.values.length > 100 ||
    model.values.length !== model.probabilities.length
  )
    throw new ClarificationError(
      "اكتب جدولًا كاملًا: X=[القيم] وp=[احتمالاتها]، بعمود احتمال لكل قيمة (حتى ١٠٠ قيمة).",
    );
  const rows = model.values.map((value, i) => ({
    x: exact(value),
    p: probability(model.probabilities[i]),
  }));
  if (
    rows.some(
      (r) => !Number.isFinite(r.x.number()) || Math.abs(r.x.number()) > 1e12,
    )
  )
    throw new ClarificationError(
      "قيم المتحول يجب أن تكون منتهية ولا تتجاوز قيمتها المطلقة 10^12.",
    );
  if (new Set(rows.map((r) => r.x.text())).size !== rows.length)
    throw new ClarificationError(
      "القيم في قانون الاحتمال يجب أن تكون مختلفة؛ اجمع احتمالات القيمة المكررة.",
    );
  if (!sum(rows.map((r) => r.p)).eq(ONE))
    throw new ClarificationError(
      "جدول قانون الاحتمال غير مكتمل أو غير متسق: يجب أن يكون مجموع الاحتمالات ١ تمامًا. لن أطبّع الأعداد تلقائيًا.",
    );
  return rows.filter((row) => row.p.n !== 0n).sort((a, b) => a.x.cmp(b.x));
}
export function lawHistogram(
  values: string[],
  probabilities: number[],
  title = "مخطط أعمدة قانون الاحتمال",
): HistogramVisual {
  const chunk = Math.max(1, Math.ceil(values.length / 50)),
    bins: HistogramVisual["bins"] = [];
  for (let i = 0; i < values.length; i += chunk) {
    bins.push({
      label:
        chunk === 1
          ? values[i]
          : `${values[i]}–${values[Math.min(values.length - 1, i + chunk - 1)]}`,
      value: probabilities.slice(i, i + chunk).reduce((a, b) => a + b, 0),
    });
  }
  return {
    kind: "histogram",
    title,
    bins,
    discrete: true,
    ...(chunk > 1
      ? {
          note: "جُمعت قيم متجاورة في أعمدة العرض فقط؛ كل عمود مجموع احتمالات قيمه. الحساب والجدول لا يتغيران.",
        }
      : {}),
  };
}
export function calculateLaw(
  model: DiscreteLaw,
  moment?: "mean" | "variance" | "sigma" | "second",
) {
  const rows = readLaw(model),
    symbol = model.symbol;
  const mean = sum(rows.map((r) => r.x.mul(r.p))),
    second = sum(rows.map((r) => r.x.pow(2).mul(r.p))),
    variance = second.sub(mean.pow(2));
  if (variance.cmp(ZERO) < 0)
    throw new ClarificationError("نتج تباين سالب؛ راجع قانون الاحتمال.");
  const sigma = variance.sqrtNumber();
  const meanN = rows.reduce((s, r) => s + r.x.number() * r.p.number(), 0),
    varN = rows.reduce(
      (s, r) => s + r.p.number() * (r.x.number() - meanN) ** 2,
      0,
    ),
    sumN = rows.reduce((s, r) => s + r.p.number(), 0);
  const verification: Verification = {
    passed:
      near(sumN, 1) &&
      near(mean.number(), meanN) &&
      near(variance.number(), varN) &&
      (variance.n === 0n || variance.number() > 0),
    samples: rows.length,
    method:
      "فحص مستقل بالمجموع العددي، والتباين المركزي Σp(x−E)² بدل فرق العزمين.",
    maxError: Math.max(
      Math.abs(1 - sumN),
      Math.abs(mean.number() - meanN) / Math.max(1, Math.abs(meanN)),
      Math.abs(variance.number() - varN) / Math.max(1, Math.abs(varN)),
    ),
  };
  const steps: SolutionStep[] = [
    {
      title: "قيم المتحول الفعلية وقانونه",
      text: "أُسقطت القيم ذات الاحتمال صفر من X(Ω). لا نُكمل جدولًا ناقصًا بافتراضات مخفية.",
      latex: `${symbol}(\\Omega)=\\left\\{${rows.map((r) => r.x.tex()).join(",")}\\right\\},\\qquad \\sum_iP(${symbol}=x_i)=1`,
    },
    {
      title: "الأمل الرياضي والعزم الثاني",
      latex: `\\begin{aligned}E(${symbol})&=\\sum_i x_i p_i=${mean.tex()}\\\\E(${symbol}^2)&=\\sum_i x_i^2p_i=${second.tex()}\\end{aligned}`,
    },
    {
      title: "التباين والانحراف المعياري",
      latex: `\\begin{aligned}V(${symbol})&=E(${symbol}^2)-[E(${symbol})]^2=${variance.tex()}\\\\\\sigma_{${symbol}}&=\\sqrt{${variance.tex()}}\\approx ${approximate(sigma)}\\end{aligned}`,
    },
  ];
  const finalLatex =
    moment === "second"
      ? `E(${symbol}^2)=${second.tex()}`
      : moment === "mean"
        ? `E(${symbol})=${mean.tex()}`
        : moment === "variance"
          ? `V(${symbol})=${variance.tex()}`
          : moment === "sigma"
            ? `\\sigma_{${symbol}}=\\sqrt{${variance.tex()}}\\approx ${approximate(sigma)}`
            : `\\begin{aligned}E(${symbol})&=${mean.tex()}\\\\E(${symbol}^2)&=${second.tex()}\\\\V(${symbol})&=${variance.tex()}\\\\\\sigma_{${symbol}}&=\\sqrt{${variance.tex()}}\\approx ${approximate(sigma)}\\end{aligned}`;
  const visuals: Visual[] = [
    {
      kind: "table",
      title: `قانون احتمال ${symbol} — مجموع الاحتمالات ١`,
      latex: columns(
        rows.map((r) => [r.x.tex(), r.p.tex()]),
        ["x_i", `P(${symbol}=x_i)`],
      ),
    },
    lawHistogram(
      rows.map((r) => r.x.text()),
      rows.map((r) => r.p.number()),
    ),
  ];
  const normalized: DiscreteLaw = {
    symbol,
    values: rows.map((r) => r.x.text()),
    probabilities: rows.map((r) => r.p.text()),
  };
  return {
    mean,
    second,
    variance,
    sigma,
    rows,
    finalLatex,
    steps,
    visuals,
    verification,
    normalized,
    scalar:
      moment === "second"
        ? second.n !== 0n && second.number() === 0
          ? undefined
          : second.number()
        : moment === "mean"
          ? mean.n !== 0n && mean.number() === 0
            ? undefined
            : mean.number()
          : moment === "variance"
            ? variance.n !== 0n && variance.number() === 0
              ? undefined
              : variance.number()
            : moment === "sigma"
              ? sigma === 0 && variance.n !== 0n
                ? undefined
                : sigma
              : undefined,
  };
}
export function transformLaw(
  model: DiscreteLaw,
  expression: string,
): DiscreteLaw {
  const variable = model.symbol,
    node = parseExpression(expression, {}, variable);
  // Prove affinity symbolically, rather than guessing it from a few evaluations.
  if (
    math
      .simplify(math.derivative(math.derivative(node, variable), variable))
      .toString() !== "0"
  )
    throw new ClarificationError(
      "جسر المتحول يدعم التحويل الأفيني Y=aX+b فقط. اكتب القانون الجديد مباشرة للتحويل غير الخطي.",
    );
  const b = exact(expression, { [variable]: ZERO }),
    a = exact(expression, { [variable]: ONE }).sub(b),
    source = readLaw(model),
    result = new Map<string, Rational>();
  source.forEach((r) => {
    const x = a.mul(r.x).add(b).text();
    result.set(x, (result.get(x) || ZERO).add(r.p));
  });
  return {
    symbol: variable === "X" ? "Y" : "X",
    values: [...result.keys()],
    probabilities: [...result.values()].map((p) => p.text()),
  };
}
export function generatingPolynomial(model: DiscreteLaw) {
  const rows = readLaw(model);
  if (rows.some((row) => row.x.d !== 1n || row.x.n < 0n || row.x.n > 32n))
    throw new ClarificationError(
      "الدالة المولدة الاحتمالية كثيرة حدود هنا تتطلب قيمًا صحيحة غير سالبة حتى ٣٢.",
    );
  const expression = rows
    .map((r) => `(${r.p.text()})*x^${r.x.text()}`)
    .join("+");
  if (expression.length > 900)
    throw new ClarificationError(
      "كثيرة الحدود المولدة تتجاوز حد سياق الدوال (٩٠٠ محرف). قلّل عدد القيم أو طول الكسور؛ قانون الاحتمال نفسه يبقى متاحًا.",
    );
  return expression;
}
export function calculateStatistics(model: StatisticsModel) {
  if (
    !model.values.length ||
    model.values.length > 500 ||
    model.values.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e12)
  )
    throw new ClarificationError(
      "أدخل من ١ إلى ٥٠٠ قيمة منتهية، بقيمة مطلقة لا تتجاوز 10^12.",
    );
  const freq = model.frequencies || model.values.map(() => 1);
  if (
    freq.length !== model.values.length ||
    freq.some((f) => !Number.isSafeInteger(f) || f < 0 || f > 1000000)
  )
    throw new ClarificationError(
      "التكرارات أعداد صحيحة غير سالبة، ولكل قيمة تكرار واحد لا يتجاوز مليونًا.",
    );
  if (
    model.exactValues &&
    (model.exactValues.length !== model.values.length ||
      model.exactValues.some((v, i) => exact(v).number() !== model.values[i]))
  )
    throw new ClarificationError(
      "القيم الدقيقة لا تطابق بيانات الجدول العددي. أعد إدخال الجدول.",
    );
  const exactData = model.values.map((v, i) =>
    model.exactValues
      ? exact(model.exactValues[i])
      : Rational.decimal(String(v)),
  );
  const entries = new Map<number, number>();
  model.values.forEach((v, i) => {
    if (freq[i]) entries.set(v, (entries.get(v) || 0) + freq[i]);
  });
  const rows = [...entries].sort((a, b) => a[0] - b[0]);
  const n = rows.reduce((s, [, f]) => s + f, 0);
  if (!n || n > 10000000)
    throw new ClarificationError(
      "مجموع التكرارات يجب أن يكون بين ١ و١٠ ملايين.",
    );
  const exactByValue = new Map<number, Rational>();
  model.values.forEach((value, i) => {
    if (exactByValue.has(value) && !exactByValue.get(value)!.eq(exactData[i]))
      throw new ClarificationError(
        "قيم مختلفة أقرب من قدرة التمثيل العددي للرسم. غيّر مقياس البيانات أو استخدم جدول قانون متحول دقيق.",
      );
    exactByValue.set(value, exactData[i]);
  });
  const values = rows.map(([x]) => exactByValue.get(x)!),
    frequencies = rows.map(([, f]) => f);
  const total = sum(values.map((x, i) => x.mul(new Rational(frequencies[i])))),
    mean = total.div(new Rational(n)),
    second = sum(
      values.map((x, i) => x.pow(2).mul(new Rational(frequencies[i]))),
    ).div(new Rational(n)),
    variance = second.sub(mean.pow(2));
  const valueAt = (position: number) => {
    let cumulative = 0;
    for (let i = 0; i < values.length; i++) {
      cumulative += frequencies[i];
      if (position < cumulative) return values[i];
    }
    return values[values.length - 1];
  };
  const median =
    n % 2
      ? valueAt(Math.floor(n / 2))
      : valueAt(n / 2 - 1)
          .add(valueAt(n / 2))
          .div(new Rational(2));
  const maxFrequency = Math.max(...frequencies),
    modes = rows.filter(([, f]) => f === maxFrequency).map(([x]) => x);
  const sample = n > 1 ? variance.mul(new Rational(n, n - 1)) : undefined,
    sigma = variance.sqrtNumber();
  let count = 0,
    meanN = 0,
    m2 = 0;
  for (const [x, f] of rows) {
    const next = count + f,
      delta = x - meanN;
    meanN += (delta * f) / next;
    m2 += (delta * delta * count * f) / next;
    count = next;
  }
  const error = Math.max(
    Math.abs(mean.number() - meanN) / Math.max(1, Math.abs(meanN)),
    Math.abs(variance.number() - m2 / n) / Math.max(1, Math.abs(m2 / n)),
  );
  const verification: Verification = {
    passed: error < 1e-9 && (variance.n === 0n || variance.number() > 0),
    samples: rows.length,
    maxError: error,
    method:
      "مطابقة المتوسط والتباين الدقيقين مع خوارزمية Welford الموزونة المستقلة، دون توسيع جدول التكرارات.",
  };
  const min = rows[0][0],
    max = rows[rows.length - 1][0],
    binCount =
      min === max ? 1 : Math.min(20, Math.max(1, Math.ceil(1 + Math.log2(n)))),
    width = min === max ? 1 : (max - min) / binCount;
  const histogram: HistogramVisual = {
    kind: "histogram",
    title: "المدرج التكراري",
    bins: Array.from({ length: binCount }, (_, i) => ({
      label:
        min === max
          ? String(min)
          : `${approximate(min + i * width)}–${approximate(min + (i + 1) * width)}`,
      start: min === max ? min - 0.5 : min + i * width,
      end: min === max ? min + 0.5 : min + (i + 1) * width,
      value: 0,
    })),
    note:
      min === max
        ? "كل القيم متساوية؛ عُرض عمود واحد متمركز عند القيمة."
        : "فئات متساوية العرض؛ كل فئة تشمل حدها الأيسر ولا تشمل الأيمن، ما عدا الأخيرة فتشمل الطرفين.",
  };
  rows.forEach(([x, f]) => {
    const i =
      min === max ? 0 : Math.min(binCount - 1, Math.floor((x - min) / width));
    histogram.bins[i].value += f;
  });
  const steps: SolutionStep[] = [
    {
      title: "عدد المشاهدات والمتوسط",
      latex: `N=\\sum_i f_i=${n},\\quad \\overline{x}=\\frac{\\sum_i f_ix_i}{N}=\\frac{${total.tex()}}{${n}}=${mean.tex()}`,
    },
    {
      title: "الوسيط والمنوال",
      text:
        modes.length === rows.length && rows.length > 1
          ? "كل القيم لها التكرار نفسه؛ لا يوجد منوال مميز."
          : "حُسب الوسيط من الرتب التراكمية دون تكرار البيانات في الذاكرة.",
      latex: `M_e=${median.tex()}\\qquad ${modes.length === rows.length && rows.length > 1 ? "\\text{لا منوال مميز}" : `M_o=\\{${modes.map((x) => exactByValue.get(x)!.tex()).join(",")}\\}`}`,
    },
    {
      title: "التباين الوصفي وتباين العينة",
      text: "σ² يقسم على N لوصف البيانات، أما s² فيقسم على N−1 عند تقدير تباين المجتمع من عينة.",
      latex: `\\begin{aligned}\\sigma^2&=\\frac{\\sum_i f_ix_i^2}{N}-\\overline{x}^{\,2}=${variance.tex()}\\\\s^2&=${sample ? sample.tex() : "\\text{غير معرّف عند }N=1"}\\\\\\sigma&=\\sqrt{${variance.tex()}}\\approx ${approximate(sigma)}\\end{aligned}`,
    },
  ];
  const visuals: Visual[] = [
    {
      kind: "table",
      title: "جدول التكرارات",
      latex: columns(
        rows.map(([, f], i) => [
          values[i].tex(),
          String(f),
          new Rational(f, n).tex(),
        ]),
        ["x_i", "f_i", "f_i/N"],
      ),
    },
    histogram,
  ];
  return {
    mean,
    median,
    variance,
    sigma,
    total,
    second,
    n,
    sample,
    rows,
    exactValues: values,
    steps,
    visuals,
    verification,
    finalLatex: `\\begin{aligned}\\overline{x}&=${mean.tex()}\\\\M_e&=${median.tex()}\\\\\\sigma^2&=${variance.tex()}\\\\\\sigma&\\approx ${approximate(sigma)}\\end{aligned}`,
  };
}
