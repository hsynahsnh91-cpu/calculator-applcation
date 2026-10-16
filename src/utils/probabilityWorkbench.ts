import { isProbabilityContext } from "../solver/probabilityTypes";
import {
  ClarificationError,
  type SolverContext,
  type SolutionStep,
  type Visual,
} from "../solver/types";
import type {
  ProbabilityAnswer,
  ProbabilityContext,
  ProbabilityRequest,
} from "../solver/probabilityTypes";
import {
  Rational,
  ONE,
  probability,
  choose,
  falling,
  factorialExact,
  exact,
  comparisonTex,
  matches,
  approximate,
  near,
  columns,
} from "./probabilityExact";
import { calculateUrn } from "./probabilityUrn";
import {
  calculateLaw,
  calculateStatistics,
  transformLaw,
  generatingPolynomial,
  lawHistogram,
} from "./probabilityLaws";
import {
  calculateEvents,
  calculateJoint,
  calculateMixture,
} from "./probabilityEvents";
import {
  solveNormalDistribution,
  solveBinomialDistribution,
} from "./probabilityEngine";

const unverified = {
  passed: false,
  method: "هذه صيغة تعليمية وليست نتيجة عددية محققة مستقلاً.",
};
export function probabilityTheorem(topic: string): ProbabilityAnswer {
  const cards: Record<string, { title: string; steps: SolutionStep[] }> = {
    counting: {
      title: "الفضاء العيني قبل حساب الاحتمال",
      steps: [
        {
          title: "سحب معًا",
          text: "دون ترتيب ودون إعادة؛ الكرات المادية متميزة.",
          latex: "n(\\Omega)=\\binom nr=\\frac{n!}{r!(n-r)!}",
        },
        {
          title: "سحب متتالٍ دون إعادة",
          text: "الترتيب مهم والتكرار ممنوع.",
          latex: "n(\\Omega)=P_n^r=\\frac{n!}{(n-r)!}",
        },
        {
          title: "سحب متتالٍ مع إعادة",
          text: "الترتيب مهم ويمكن تكرار الكرة؛ لا تسمَّ القوة ترتيبًا دون تكرار.",
          latex: "n(\\Omega)=n^r",
        },
      ],
    },
    axioms: {
      title: "قواعد الأحداث الأساسية",
      steps: [
        {
          title: "الاحتمال الكلاسيكي",
          text: "فقط عندما تكون الحالات الأولية متساوية الاحتمال.",
          latex:
            "P(A)=\\frac{n(A)}{n(\\Omega)},\\quad P(\\varnothing)=0,\\quad P(\\Omega)=1",
        },
        { title: "المتمم", latex: "P(\\overline A)=1-P(A)" },
        { title: "الاتحاد", latex: "P(A\\cup B)=P(A)+P(B)-P(A\\cap B)" },
        {
          title: "التنافي",
          text: "التنافي ليس الاستقلال؛ عند التنافي يكون التقاطع مستحيلًا.",
          latex: "A\\cap B=\\varnothing\\Rightarrow P(A\\cup B)=P(A)+P(B)",
        },
      ],
    },
    conditional: {
      title: "الشرطي والاحتمال الكلي وبايز",
      steps: [
        {
          title: "الاحتمال الشرطي",
          latex: "P(A\\mid B)=\\frac{P(A\\cap B)}{P(B)},\\quad P(B)>0",
        },
        {
          title: "الاحتمال الكلي",
          text: "Hᵢ تجزئة متنافية وكاملة للفضاء العيني.",
          latex: "P(B)=\\sum_iP(H_i)P(B\\mid H_i)",
        },
        {
          title: "بايز",
          latex:
            "P(H_j\\mid B)=\\frac{P(H_j)P(B\\mid H_j)}{\\sum_iP(H_i)P(B\\mid H_i)}",
        },
      ],
    },
    independence: {
      title: "الاستقلال للأحداث وللمتحولات",
      steps: [
        { title: "حدثان مستقلان", latex: "P(A\\cap B)=P(A)P(B)" },
        {
          title: "متحولان مستقلان",
          text: "تجب المساواة لكل زوج من القيم؛ عدم الارتباط وحده لا يكفي.",
          latex: "\\forall x,y:\ P(X=x,Y=y)=P(X=x)P(Y=y)",
        },
      ],
    },
    tree: {
      title: "قراءة شجرة الاحتمالات",
      steps: [
        { title: "عند العقدة", latex: "\\sum_{\\text{فروع خارجة}}p_i=1" },
        { title: "على المسار", latex: "P(A\\cap B)=P(A)P(B\\mid A)" },
        { title: "بين المسارات المتنافية", latex: "P(B)=\\sum_iP(H_i\\cap B)" },
      ],
    },
    law: {
      title: "قانون المتحول العشوائي وعزومه",
      steps: [
        {
          title: "القيم الفعلية",
          latex:
            "X(\\Omega)=\\{x_i:p_i>0\\},\\quad 0\\le p_i\\le1,\\quad\\sum_ip_i=1",
        },
        {
          title: "الأمل والعزم الثاني",
          latex: "E(X)=\\sum_ix_ip_i,\\quad E(X^2)=\\sum_ix_i^2p_i",
        },
        {
          title: "التباين والانحراف المعياري",
          latex: "V(X)=E(X^2)-[E(X)]^2,\\quad\\sigma_X=\\sqrt{V(X)}",
        },
      ],
    },
  };
  const card = cards[topic] || cards.axioms;
  return {
    title: card.title,
    finalLatex: card.steps[0].latex,
    steps: card.steps,
    visuals: [],
    verification: unverified,
  };
}
function patch(
  context: SolverContext,
  active: ProbabilityContext["active"],
  update: Partial<ProbabilityContext>,
  scalar?: number,
  exactScalar?: string,
) {
  const probabilityContext: ProbabilityContext = {
    ...context.probability,
    active,
    ...update,
  };
  if (scalar !== undefined && Number.isFinite(scalar))
    probabilityContext.lastScalar = scalar;
  else delete probabilityContext.lastScalar;
  if (
    exactScalar &&
    scalar !== undefined &&
    Number.isFinite(scalar) &&
    exactScalar.length <= 500
  )
    probabilityContext.lastScalarExact = exactScalar;
  else delete probabilityContext.lastScalarExact;
  if (!isProbabilityContext(probabilityContext))
    throw new ClarificationError(
      "المعطيات أو الكسور المبسطة تجاوزت حد السياق المحفوظ. صغّر الرتبة أو طول الكسور وأعد المحاولة.",
    );
  return { probability: probabilityContext };
}
export function solveProbabilityRequest(
  input: ProbabilityRequest,
  context: SolverContext,
): ProbabilityAnswer {
  if (input.kind === "theorem") return probabilityTheorem(input.topic);
  if (input.kind === "classical") {
    const total = exact(input.total),
      favorable = exact(input.favorable);
    if (
      total.d !== 1n ||
      favorable.d !== 1n ||
      total.n <= 0n ||
      total.n.toString().length > 220 ||
      favorable.n < 0n ||
      favorable.cmp(total) > 0
    )
      throw new ClarificationError(
        "العدّ الكلاسيكي يتطلب عددين صحيحين حتى ٢٢٠ رقمًا: n(Ω)>0 و0≤n(A)≤n(Ω).",
      );
    const base = favorable.div(total),
      p = input.complement ? ONE.sub(base) : base;
    return {
      title: "الاحتمال الكلاسيكي",
      finalLatex: `P(${input.complement ? "\\overline{" + input.event + "}" : input.event})=${p.tex()}`,
      decimal: p.number(),
      steps: [
        {
          title: "الفضاء العيني",
          text: "الحالات الأولية متساوية الاحتمال حسب المعطيات.",
          latex: `n(\\Omega)=${total.tex()}`,
        },
        {
          title: "العدّ والاحتمال",
          latex: `P(${input.event})=\\frac{n(${input.event})}{n(\\Omega)}=\\frac{${favorable.tex()}}{${total.tex()}}=${base.tex()}`,
        },
        ...(input.complement
          ? [
              {
                title: "المتمم",
                latex: `P(\\overline{${input.event}})=1-P(${input.event})=${p.tex()}`,
              },
            ]
          : []),
      ],
      visuals: [],
      verification: {
        passed: near(base.number() + ONE.sub(base).number(), 1),
        method: "فحص حدود العدّ، وجمع احتمالي الحدث ومتممه إلى ١.",
      },
      contextPatch: patch(
        context,
        "events",
        { events: { [input.event]: base.text() } },
        p.number(),
        p.text(),
      ),
    };
  }
  if (input.kind === "urn") {
    const v = calculateUrn(input.model, input.query);
    let finalLatex = v.finalLatex,
      steps = v.steps,
      visuals = v.visuals,
      scalar = v.p?.number(),
      law = v.law,
      exactScalar = v.p?.text();
    if (input.query.type === "law" && law) {
      const value = calculateLaw(law, input.query.moment);
      finalLatex = value.finalLatex;
      steps = [...steps, ...value.steps];
      visuals = [...value.visuals, ...visuals];
      scalar = value.scalar;
      law = value.normalized;
      exactScalar =
        input.query.moment === "mean"
          ? value.mean.text()
          : input.query.moment === "variance"
            ? value.variance.text()
            : input.query.moment === "second"
              ? value.second.text()
              : undefined;
      v.verification = {
        ...v.verification,
        passed: v.verification.passed && value.verification.passed,
      };
    }
    return {
      title:
        input.query.type === "count"
          ? "الفضاء العيني"
          : input.query.type === "law"
            ? `قانون عدد الكرات من اللون ${v.color}`
            : input.query.type === "same"
              ? "احتمال لون واحد"
              : input.query.type === "different"
                ? "احتمال وجود أكثر من لون"
                : "الاحتمال المطلوب",
      finalLatex,
      steps,
      visuals,
      verification: v.verification,
      decimal: scalar,
      contextPatch: patch(
        context,
        "urn",
        {
          urn: input.model,
          urnQuery: input.query,
          ...(v.namedEvents ? { events: v.namedEvents } : {}),
          ...(v.p && !input.query.conditionalOn
            ? {
                events: {
                  A: input.query.complement ? ONE.sub(v.p).text() : v.p.text(),
                },
              }
            : {}),
          ...(law ? { law } : {}),
        },
        scalar,
        exactScalar,
      ),
      note:
        input.model.count > 3
          ? "حُسب الحدث مباشرة. اقتُصر رسم الشجرة التفصيلي على ٣ سحبات و٤ ألوان للحفاظ على الاستجابة؛ عدم رسمها لا يغيّر الحساب."
          : undefined,
    };
  }
  if (input.kind === "law") {
    const model = input.transform
        ? transformLaw(input.model, input.transform)
        : input.model,
      v = calculateLaw(model, input.moment);
    if (input.generator) {
      const expression = generatingPolynomial(v.normalized),
        symbol = model.symbol;
      return {
        title: "الدالة المولدة الاحتمالية — جسر إلى الاشتقاق",
        finalLatex: `G(t)=${v.rows.map((r) => `${r.p.tex()}t^{${r.x.tex()}}`).join("+")}`,
        steps: [
          ...v.steps,
          {
            title: "ربط العزوم بالدالة المولدة",
            text: "حُفظت كثيرة الحدود في سياق الدوال. يمكنك الآن طلب «جد مشتقة الدالة» أو دراسة منحناها، دون نسخ القيم يدويًا.",
            latex: `G(1)=1,\\quad G'(1)=E(${symbol}),\\quad V(${symbol})=G''(1)+G'(1)-[G'(1)]^2`,
          },
        ],
        visuals: [
          {
            kind: "table",
            title: "كثيرة الحدود المولدة",
            latex: `G(t)=${v.rows.map((r) => `${r.p.tex()}t^{${r.x.tex()}}`).join("+")}`,
          },
          ...v.visuals,
        ],
        verification: v.verification,
        contextPatch: {
          ...patch(context, "law", { law: v.normalized }),
          expression,
          variable: "x",
          derivative: undefined,
        },
      };
    }
    return {
      title: input.transform
        ? "قانون المتحول بعد التحويل الأفيني"
        : "قانون المتحول العشوائي وعزومه",
      finalLatex: v.finalLatex,
      steps: v.steps,
      visuals: v.visuals,
      verification: v.verification,
      decimal: v.scalar,
      contextPatch: patch(
        context,
        "law",
        { law: v.normalized },
        v.scalar,
        input.moment === "mean"
          ? v.mean.text()
          : input.moment === "variance"
            ? v.variance.text()
            : input.moment === "second"
              ? v.second.text()
              : undefined,
      ),
    };
  }
  if (input.kind === "events") {
    const v = calculateEvents(
      input.given,
      input.first,
      input.second,
      input.operation,
      input.assumption,
    );
    return {
      title:
        input.operation === "conditional"
          ? "الاحتمال الشرطي"
          : input.operation === "independence"
            ? "فحص استقلال الحدثين"
            : "حساب الأحداث",
      finalLatex: v.finalLatex,
      steps: v.steps,
      visuals: v.visuals,
      verification: v.verification,
      decimal: v.result?.number(),
      contextPatch: patch(
        context,
        "events",
        { events: v.normalized },
        v.result?.number(),
        v.result?.text(),
      ),
    };
  }
  if (input.kind === "mixture") {
    const v = calculateMixture(input.model, input.posterior);
    return {
      title:
        input.posterior === undefined
          ? "الاحتمال الكلي"
          : "الاحتمال الشرطي العكسي — بايز",
      finalLatex: v.finalLatex,
      steps: v.steps,
      visuals: v.visuals,
      verification: v.verification,
      decimal: v.result.number(),
      contextPatch: patch(
        context,
        "mixture",
        { mixture: input.model, events: { B: v.total.text() } },
        v.result.number(),
        v.result.text(),
      ),
    };
  }
  if (input.kind === "joint") {
    const v = calculateJoint(input.model);
    return {
      title: "استقلال المتحولين من القانون المشترك",
      ...v,
      contextPatch: patch(context, "joint", { joint: input.model }),
    };
  }
  if (input.kind === "statistics") {
    const v = calculateStatistics(input.model),
      exactScalarValue =
        input.metric === "mean"
          ? v.mean
          : input.metric === "median"
            ? v.median
            : input.metric === "variance"
              ? v.variance
              : input.metric === "sum"
                ? v.total
                : undefined,
      scalar = exactScalarValue
        ? exactScalarValue.n !== 0n && exactScalarValue.number() === 0
          ? undefined
          : exactScalarValue.number()
        : input.metric === "sigma"
          ? v.sigma === 0 && v.variance.n !== 0n
            ? undefined
            : v.sigma
          : undefined;
    let finalLatex =
      input.metric === "mean"
        ? `\\overline x=${v.mean.tex()}`
        : input.metric === "median"
          ? `M_e=${v.median.tex()}`
          : input.metric === "variance"
            ? `\\sigma^2=${v.variance.tex()}`
            : input.metric === "sigma"
              ? `\\sigma\\approx ${approximate(v.sigma)}`
              : input.metric === "sum"
                ? `\\sum_i f_ix_i=${v.total.tex()}`
                : v.finalLatex;
    const contextPatch: Partial<SolverContext> = patch(
      context,
      "statistics",
      { statistics: input.model },
      scalar,
      exactScalarValue?.text(),
    );
    if (input.matrix) {
      if (v.rows.length > 6)
        throw new ClarificationError(
          "جسر المصفوفات محدود بستة صفوف. اطلب إحصاء الجدول كاملًا أو اختر ست قيم مميزة.",
        );
      contextPatch.matrix = v.rows.map(([x, f]) => [x, f]);
      contextPatch.matrices = {
        values: {
          ...context.matrices?.values,
          M: v.rows.map(([, f], i) => [v.exactValues[i].text(), String(f)]),
        },
        active: "M",
        origin: "statistics",
      };
      finalLatex = `M=\\begin{pmatrix}${v.rows.map(([, f], i) => `${v.exactValues[i].tex()}&${f}`).join("\\\\")}\\end{pmatrix}`;
      v.steps.push({
        title: "الجسر إلى أدوات المصفوفات",
        text: "العمود الأول قيم البيانات والثاني تكراراتها. أصبح هذا الجدول المصفوفة النشطة للطلبات اللاحقة، مثل المنقول أو الرتبة.",
        latex: "M_{i1}=x_i,\\quad M_{i2}=f_i",
      });
    }
    return {
      title: input.matrix
        ? "جدول التكرارات كمصفوفة"
        : "الإحصاء الوصفي والمدرج التكراري",
      finalLatex,
      steps: v.steps,
      visuals: v.visuals,
      verification: v.verification,
      decimal: scalar,
      contextPatch,
    };
  }
  if (input.kind === "binomial") {
    const { n } = input.model,
      pExact = probability(input.model.p),
      p = pExact.number();
    if (
      (p === 0 && !pExact.eq(new Rational(0))) ||
      (p === 1 && !pExact.eq(ONE))
    )
      throw new ClarificationError(
        "p قريب جدًا من طرف المجال ولا يُمثّل بدقة عشرية كافية لهذا التوزيع. استخدم كسرًا أبسط أو نموذج سحب محدودًا.",
      );
    if (!Number.isSafeInteger(n) || n < 0 || n > 1000)
      throw new ClarificationError(
        "عدد المحاولات n يجب أن يكون صحيحًا بين ٠ و١٠٠٠.",
      );
    if (
      input.k !== undefined &&
      (!Number.isSafeInteger(input.k) || Math.abs(input.k) > 1000000)
    )
      throw new ClarificationError(
        "حد الحدث k يجب أن يكون عددًا صحيحًا محدودًا.",
      );
    const v = solveBinomialDistribution(n, p),
      dp = new Float64Array(n + 1);
    dp[0] = 1;
    for (let t = 1; t <= n; t++)
      for (let k = t; k >= 0; k--)
        dp[k] = dp[k] * (1 - p) + (k ? dp[k - 1] * p : 0);
    const primary = v.table.map((row) => row.pmf),
      prob =
        input.k === undefined
          ? undefined
          : primary.reduce(
              (s, q, k) => s + (matches(k, input.k!, input.comparison) ? q : 0),
              0,
            ),
      check =
        input.k === undefined
          ? undefined
          : dp.reduce(
              (s, q, k) => s + (matches(k, input.k!, input.comparison) ? q : 0),
              0,
            );
    let maxError = 0;
    primary.forEach(
      (q, k) => (maxError = Math.max(maxError, Math.abs(q - dp[k]))),
    );
    let finalLatex =
      prob === undefined
        ? `\\begin{aligned}E(X)&=np=${approximate(v.mean)}\\\\E(X^2)&=np(1-p)+(np)^2=${approximate(v.variance + v.mean ** 2)}\\\\V(X)&=np(1-p)=${approximate(v.variance)}\\\\\\sigma_X&\\approx ${approximate(v.stdDev)}\\end{aligned}`
        : `P(X${comparisonTex[input.comparison]}${input.k})\\approx ${approximate(Math.min(1, prob))}`;
    let scalar = prob;
    if (input.moment) {
      scalar =
        input.moment === "mean"
          ? v.mean
          : input.moment === "variance"
            ? v.variance
            : input.moment === "second"
              ? v.variance + v.mean ** 2
              : v.stdDev;
      finalLatex = `${input.moment === "mean" ? "E(X)" : input.moment === "variance" ? "V(X)" : input.moment === "second" ? "E(X^2)" : "\\sigma_X"}=${approximate(scalar)}`;
    }
    const steps: SolutionStep[] = [
      {
        title: "شروط القانون الثنائي",
        text: "n محاولات مستقلة، حدث ثابت الاحتمال p في كل محاولة، وX عدد مرات وقوعه. «أو أكثر / أقل» تصف الحد المطلوب k، ولا تغيّر تعريف p.",
        latex: `X\\sim B(${n},${probability(input.model.p).tex()}),\\quad p+q=1`,
      },
      {
        title: "القانون ومجموعة القيم الفعلية",
        latex: `P(X=k)=\\binom{${n}}k p^k(1-p)^{${n}-k},\\quad X(\\Omega)=${p === 0 ? "\\{0\\}" : p === 1 ? `\\{${n}\\}` : `\\{0,\\ldots,${n}\\}`}`,
      },
      {
        title: "جمع الحد المطلوب",
        text:
          prob === undefined
            ? "يُعرض القانون وعزومه. اختر حدًا مثل X≥3 لطلب احتمال محدد."
            : "حُسبت الاحتمالات دون تقريب صفوف الجدول قبل جمعها. القيم النهائية تقريب عددي.",
        latex:
          prob === undefined
            ? `\\sum_{k=0}^{${n}}P(X=k)\\approx ${approximate(primary.reduce((a, b) => a + b, 0))}`
            : `P(X${comparisonTex[input.comparison]}${input.k})=\\sum_{k${comparisonTex[input.comparison]}${input.k}}P(X=k)\\approx ${approximate(Math.min(1, prob))}`,
      },
    ];
    const visuals: Visual[] = [
      lawHistogram(
        v.table.map((r) => String(r.k)),
        primary,
        "مخطط أعمدة التوزيع الثنائي",
      ),
    ];
    const underflow = primary.some((q) => q === 0) && p > 0 && p < 1;
    if (n <= 32)
      visuals.unshift({
        kind: "table",
        title: "قانون الاحتمال (تقريب عرض فقط)",
        latex: columns(
          v.table
            .filter((row) => (p > 0 && p < 1) || row.pmf > 0)
            .map((row) => [String(row.k), approximate(row.pmf)]),
          ["k", "P(X=k)"],
        ),
      });
    const contextPatch: Partial<SolverContext> = patch(
      context,
      "binomial",
      { binomial: input.model },
      scalar,
    );
    if (input.generator) {
      if (n > 32)
        throw new ClarificationError(
          "جسر كثيرة الحدود محدود بدرجة ٣٢؛ يظل حساب التوزيع الثنائي متاحًا حتى ١٠٠٠ محاولة.",
        );
      const pText = probability(input.model.p).text(),
        qText = ONE.sub(probability(input.model.p)).text();
      contextPatch.expression = `((${qText})+(${pText})*x)^${n}`;
      contextPatch.variable = "x";
      contextPatch.derivative = undefined;
      finalLatex = `G(t)=\\left(${ONE.sub(probability(input.model.p)).tex()}+${probability(input.model.p).tex()}t\\right)^{${n}}`;
      steps.push({
        title: "جسر إلى الاشتقاق",
        text: "كثيرة الحدود هي الدالة النشطة الآن؛ اطلب مشتقتها أو منحناها.",
        latex: "G(1)=1,\\quad G'(1)=E(X)",
      });
    }
    return {
      title: "التوزيع الثنائي",
      finalLatex,
      steps,
      visuals,
      decimal: scalar,
      note: underflow
        ? "بعض كتل الاحتمال أصغر من مجال الأعداد العشرية المتاح؛ الصفر التقريبي في العرض لا يعني أن الحدث مستحيل. القانون الرمزي ومجموعة القيم يظلان المرجع."
        : undefined,
      verification: {
        passed:
          !(underflow && prob === 0) &&
          maxError < 1e-9 &&
          near(
            primary.reduce((a, b) => a + b, 0),
            1,
          ) &&
          (prob === undefined || near(prob, check!)),
        maxError,
        samples: n + 1,
        method:
          "مطابقة صيغة الحدود الثنائية مع التفاف مستقل لمتغيرات برنولي (برمجة ديناميكية)، وفحص مجموع القانون.",
      },
      contextPatch,
    };
  }
  const { mu, sigma } = input.model;
  if (
    !Number.isFinite(mu) ||
    !Number.isFinite(sigma) ||
    sigma <= 0 ||
    sigma ** 2 === 0 ||
    mu + sigma === mu ||
    Math.abs(mu) > 1e12 ||
    sigma > 1e12
  )
    throw new ClarificationError(
      "المتوسط منتهٍ وσ موجب، ولا تتجاوز المقادير 10^12.",
    );
  const v = solveNormalDistribution(mu, sigma, input.x, input.a, input.b),
    scalar = input.moment
      ? input.moment === "mean"
        ? mu
        : input.moment === "variance"
          ? sigma ** 2
          : input.moment === "second"
            ? mu ** 2 + sigma ** 2
            : sigma
      : input.point
        ? 0
        : (v.interval?.pBetween ??
          (input.greater ? v.singleX?.pGreater : v.singleX?.pLess));
  if ((input.a === undefined) !== (input.b === undefined))
    throw new ClarificationError("حدّد طرفي المجال الطبيعي معًا.");
  const finalLatex = input.moment
    ? `${input.moment === "mean" ? "E(X)" : input.moment === "variance" ? "V(X)" : input.moment === "second" ? "E(X^2)" : "\\sigma_X"}=${approximate(scalar!)}`
    : input.point
      ? `P(X=${approximate(input.x!)})=0`
      : input.density
        ? `f(x)=\\frac{1}{${approximate(sigma)}\\sqrt{2\\pi}}e^{-\\frac{(x-${approximate(mu)})^2}{2(${approximate(sigma)})^2}}`
        : (v.interval?.latex ??
          (v.singleX
            ? `P(X${input.greater ? "\\ge" : "\\le"}${approximate(input.x!)})\\approx ${approximate(scalar!)}`
            : `X\\sim N(${approximate(mu)},${approximate(sigma ** 2)})`));
  return {
    title: input.density ? "كثافة التوزيع الطبيعي" : "التوزيع الطبيعي",
    finalLatex,
    decimal: input.density ? undefined : scalar,
    steps: [
      {
        title: "التوحيد المعياري",
        latex: `Z=\\frac{X-(${approximate(mu)})}{${approximate(sigma)}}\\sim N(0,1)`,
      },
      {
        title: "القانون الطبيعي",
        text: "الكثافة ليست احتمال نقطة؛ احتمال نقطة واحدة في قانون مستمر يساوي صفرًا. قيم CDF تقريب عددي.",
        latex: `E(X)=${approximate(mu)},\\quad V(X)=${approximate(sigma ** 2)}`,
      },
    ],
    visuals: [
      {
        kind: "curve",
        title: "منحنى كثافة التوزيع الطبيعي",
        series: [
          {
            label: "f(x)",
            points: v.curvePoints.map((point) => ({
              x: point.x,
              y: point.density,
            })),
          },
        ],
      },
    ],
    verification: {
      passed: false,
      method: "تقريب عددي لدالة التوزيع التراكمي؛ لم يُجرَ تكامل مستقل.",
    },
    contextPatch: patch(
      context,
      "normal",
      { normal: input.model },
      input.density ? undefined : scalar,
    ),
  };
}
export function solveExactCombinatorics(
  n: number,
  k: number | undefined,
  operation: "factorial" | "all" | "combination" | "permutation",
): ProbabilityAnswer {
  if (
    !Number.isSafeInteger(n) ||
    n < 0 ||
    n > 1000000 ||
    (k !== undefined &&
      (!Number.isSafeInteger(k) || k < 0 || k > n || k > 1000)) ||
    (operation === "factorial" && n > 300)
  )
    throw new ClarificationError(
      "استخدم n صحيحًا حتى مليون و0≤k≤min(n,1000)، وللعاملي n≤300.",
    );
  if (operation !== "factorial" && k === undefined)
    throw new ClarificationError("ما قيمة k في عملية العد؟");
  const c = k === undefined ? 0n : choose(n, k),
    a = k === undefined ? 0n : falling(n, k),
    f = operation === "factorial" ? factorialExact(n) : 0n;
  const finalLatex =
    operation === "factorial"
      ? `${n}!=${f}`
      : operation === "combination"
        ? `\\binom{${n}}{${k}}=${c}`
        : operation === "permutation"
          ? `P_{${n}}^{${k}}=${a}`
          : `\\begin{aligned}\\binom{${n}}{${k}}&=${c}\\\\P_{${n}}^{${k}}&=${a}\\end{aligned}`;
  return {
    title: "العدّ الدقيق",
    finalLatex,
    steps: [
      {
        title: "قوانين العد",
        latex:
          "\\binom nk=\\frac{n!}{k!(n-k)!},\\quad P_n^k=\\frac{n!}{(n-k)!}",
      },
    ],
    visuals: [],
    verification:
      operation === "factorial"
        ? unverified
        : {
            passed: a === c * factorialExact(k!),
            method: "مطابقة عدد الترتيبات مع عدد المجموعات مضروبًا في k!.",
          },
  };
}
