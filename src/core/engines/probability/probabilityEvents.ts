import {
  ClarificationError,
  type SolutionStep,
  type Verification,
  type Visual,
} from "../../solver/types";
import type { JointModel, MixtureModel } from "../../solver/probabilityTypes";
import {
  Rational,
  ZERO,
  ONE,
  probability,
  exact,
  sum,
  near,
  columns,
} from "./probabilityExact";

export function calculateEvents(
  given: Record<string, string>,
  first: string,
  second: string,
  operation: string,
  assumption?: "independent" | "disjoint",
) {
  const data = new Map(
    Object.entries(given).map(([key, value]) => [key, probability(value)]),
  );
  for (const [key, value] of data) {
    if (
      key.endsWith("'") &&
      data.has(key[0]) &&
      !value.add(data.get(key[0])!).eq(ONE)
    )
      throw new ClarificationError(
        "احتمالا الحدث ومتممه متناقضان؛ يجب أن يكون مجموعهما ١.",
      );
    if (/[&+]/.test(key)) {
      const reversed = key[2] + key[1] + key[0];
      if (data.has(reversed) && !value.eq(data.get(reversed)!))
        throw new ClarificationError(
          "تبديل ترتيب الحدثين في الاتحاد أو التقاطع لا يغيّر الاحتمال؛ المعطيات متناقضة.",
        );
    }
  }
  let a = data.get(first),
    b = data.get(second),
    joint = data.get(`${first}&${second}`) || data.get(`${second}&${first}`),
    union = data.get(`${first}+${second}`) || data.get(`${second}+${first}`);
  const conditional = data.get(`${first}|${second}`),
    inverse = data.get(`${second}|${first}`);
  if (!a && data.has(`${first}'`)) a = ONE.sub(data.get(`${first}'`)!);
  if (!b && data.has(`${second}'`)) b = ONE.sub(data.get(`${second}'`)!);
  const requireSame = (
    v: Rational | undefined,
    derived: Rational,
    label: string,
  ) => {
    if (v && !v.eq(derived))
      throw new ClarificationError(
        `معطيات ${label} متناقضة مع باقي الاحتمالات أو الفرض المعلن.`,
      );
    return derived;
  };
  if (conditional && b)
    joint = requireSame(joint, conditional.mul(b), "الاحتمال الشرطي");
  if (inverse && a) joint = requireSame(joint, inverse.mul(a), "الشرطي العكسي");
  if (union && a && b)
    joint = requireSame(joint, a.add(b).sub(union), "الاتحاد");
  if (assumption === "independent" && a && b)
    joint = requireSame(joint, a.mul(b), "الاستقلال");
  if (assumption === "disjoint") joint = requireSame(joint, ZERO, "التنافي");
  if (joint && a && b) {
    const atoms = [
      joint,
      a.sub(joint),
      b.sub(joint),
      ONE.sub(a.add(b).sub(joint)),
    ];
    if (atoms.some((v) => v.cmp(ZERO) < 0) || !sum(atoms).eq(ONE))
      throw new ClarificationError(
        "الاحتمالات متناقضة: يجب أن يقع P(A∩B) بين max(0,P(A)+P(B)−1) وmin(P(A),P(B)).",
      );
  }
  if ((joint && a && joint.cmp(a) > 0) || (joint && b && joint.cmp(b) > 0))
    throw new ClarificationError(
      "احتمال التقاطع لا يمكن أن يتجاوز احتمال أي من الحدثين.",
    );
  if ((conditional && b?.n === 0n) || (inverse && a?.n === 0n))
    throw new ClarificationError(
      "الاحتمال الشرطي على حدث احتماله صفر غير معرّف.",
    );
  const steps: SolutionStep[] = [],
    visuals: Visual[] = [];
  if (assumption)
    steps.push({
      title: "الفرض المعلن",
      text:
        assumption === "independent"
          ? "استخدمت الاستقلال لأنه معطى صراحة؛ لم أستنتجه من الصمت."
          : "التنافي يعني تقاطعًا مستحيلًا، وليس استقلالًا بالضرورة.",
      latex:
        assumption === "independent"
          ? `P(${first}\\cap ${second})=P(${first})P(${second})`
          : `P(${first}\\cap ${second})=0`,
    });
  let result: Rational | undefined,
    finalLatex = "",
    verification: Verification = {
      passed: false,
      method: "صيغة تعليمية أو معطيات لا تكفي لتحقق مستقل.",
    };
  if (operation === "complement") {
    if (!a)
      throw new ClarificationError(`ما احتمال الحدث ${first}؟`, [
        `P(${first})=1/3، احسب احتمال متممه`,
      ]);
    result = ONE.sub(a);
    finalLatex = `P(\\overline{${first}})=1-P(${first})=${result.tex()}`;
    verification = {
      passed: near(result.number() + a.number(), 1),
      method: "فحص جمع احتمالي الحدث ومتممه إلى ١.",
    };
  } else if (operation === "independence") {
    if (!a || !b || !joint)
      throw new ClarificationError(
        "لفحص الاستقلال نحتاج P(A) وP(B) وP(A∩B)، أو شرطًا/اتحادًا يسمح باشتقاق التقاطع. لن أفترض الاستقلال.",
        ["P(A)=1/2، P(B)=1/3، P(A∩B)=1/6، هل الحدثان مستقلان؟"],
      );
    const product = a.mul(b),
      independent = joint.eq(product),
      independentN = near(joint.number(), a.number() * b.number(), 1e-12);
    finalLatex = `P(${first}\\cap ${second})=${joint.tex()}${independent ? "=" : "\\ne"}${product.tex()}=P(${first})P(${second})\\quad\\Longrightarrow\\quad\\text{${independent ? "الحدثان مستقلان" : "الحدثان غير مستقلين"}}`;
    steps.push({
      title: "معيار الاستقلال",
      latex: `P(${first}\\cap ${second})\\mathrel{\\stackrel{?}{=}}P(${first})P(${second})`,
    });
    verification = {
      passed: independent === independentN,
      method:
        "مقارنة الكسر الدقيق مع ضرب عشري مستقل؛ الشارة تؤكد فحص الاستنتاج، ولا تعني أن الحدثين مستقلان.",
    };
  } else if (operation === "conditional") {
    if (!b)
      throw new ClarificationError(`ما احتمال الحدث المشروط به ${second}؟`);
    if (b.n === 0n)
      throw new ClarificationError(
        `P(${second})=0؛ لذلك P(${first}|${second}) غير معرّف، وليس صفرًا.`,
      );
    if (!joint) {
      if (conditional) {
        result = conditional;
        finalLatex = `P(${first}\\mid ${second})=${result.tex()}`;
      } else
        throw new ClarificationError(
          "أعطني احتمال التقاطع أو فرض الاستقلال الصريح لحساب الاحتمال الشرطي.",
        );
    } else {
      result = joint.div(b);
      finalLatex = `P(${first}\\mid ${second})=\\frac{P(${first}\\cap ${second})}{P(${second})}=\\frac{${joint.tex()}}{${b.tex()}}=${result.tex()}`;
      verification = {
        passed: near(result.number() * b.number(), joint.number()),
        method: "ضرب الاحتمال الشرطي في احتمال الشرط واستعادة احتمال التقاطع.",
      };
    }
  } else if (operation === "union" || operation === "intersection") {
    if (!a || !b)
      throw new ClarificationError("حدّد احتمالي الحدثين P(A) وP(B).");
    if (!joint)
      throw new ClarificationError(
        "نحتاج احتمال التقاطع، أو أن تذكر صراحة أن الحدثين متنافيان أو مستقلان. لا يكفي احتمال كل حدث وحده.",
        [
          "P(A)=1/2، P(B)=1/3، الحدثان متنافيان، احسب الاتحاد",
          "P(A)=1/2، P(B)=1/3، الحدثان مستقلان، احسب الاتحاد",
        ],
      );
    result = operation === "intersection" ? joint : a.add(b).sub(joint);
    finalLatex =
      operation === "intersection"
        ? `P(${first}\\cap ${second})=${result.tex()}`
        : `P(${first}\\cup ${second})=P(${first})+P(${second})-P(${first}\\cap ${second})=${result.tex()}`;
  } else {
    if (!a)
      throw new ClarificationError(
        "حدّد الحدث والعملية المطلوبة: متمم، اتحاد، تقاطع، شرط، أم فحص استقلال؟",
      );
    result = a;
    finalLatex = `P(${first})=${a.tex()}`;
  }
  if (joint && a && b) {
    const atoms = [
      joint,
      a.sub(joint),
      b.sub(joint),
      ONE.sub(a.add(b).sub(joint)),
    ];
    visuals.push({
      kind: "table",
      title: "تقسيم الفضاء العيني إلى أحداث متنافية",
      latex: columns(
        [
          [`${first}\\cap ${second}`, atoms[0].tex()],
          [`${first}\\cap\\overline{${second}}`, atoms[1].tex()],
          [`\\overline{${first}}\\cap ${second}`, atoms[2].tex()],
          [`\\overline{${first}}\\cap\\overline{${second}}`, atoms[3].tex()],
        ],
        ["\\text{الجزء}", "P"],
      ),
    });
    if (operation === "union" || operation === "intersection")
      verification = {
        passed:
          near(
            atoms.reduce((s, v) => s + v.number(), 0),
            1,
          ) &&
          near(
            (operation === "union"
              ? atoms[0].add(atoms[1]).add(atoms[2])
              : atoms[0]
            ).number(),
            result!.number(),
          ),
        method:
          "إعادة تركيب الحدث من أجزاء متنافية وفحص عدم السلبية ومجموع الفضاء العيني.",
      };
  }
  steps.push({ title: "القاعدة والحساب", latex: finalLatex });
  const normalized = { ...given };
  if (a) normalized[first] = a.text();
  if (b) normalized[second] = b.text();
  if (joint) normalized[`${first}&${second}`] = joint.text();
  return { result, finalLatex, steps, visuals, verification, normalized };
}
export function calculateMixture(model: MixtureModel, posterior?: number) {
  if (
    !model.weights.length ||
    model.weights.length > 8 ||
    model.weights.length !== model.conditionals.length
  )
    throw new ClarificationError(
      "اكتب q=[أوزان الفروع] وp=[احتمال B داخل كل فرع] بالطول نفسه، حتى ٨ فروع.",
    );
  const weights = model.weights.map(probability),
    conditionals = model.conditionals.map(probability);
  if (!sum(weights).eq(ONE))
    throw new ClarificationError(
      "أوزان الفروع عند الجذر يجب أن يكون مجموعها ١ تمامًا؛ لا أفترض تساوي اختيار الصناديق.",
    );
  const paths = weights.map((q, i) => q.mul(conditionals[i])),
    total = sum(paths);
  if (
    posterior !== undefined &&
    (!Number.isInteger(posterior) ||
      posterior < 1 ||
      posterior > weights.length)
  )
    throw new ClarificationError("رقم فرع بايز خارج الشجرة.");
  if (posterior !== undefined && total.n === 0n)
    throw new ClarificationError(
      "لا يُعرّف شرط بايز لأن الحدث المرصود B احتماله صفر.",
    );
  const result =
      posterior === undefined ? total : paths[posterior - 1].div(total),
    finalLatex =
      posterior === undefined
        ? `P(B)=\\sum_iP(H_i)P(B\\mid H_i)=${result.tex()}`
        : `P(H_{${posterior}}\\mid B)=\\frac{P(H_{${posterior}})P(B\\mid H_{${posterior}})}{\\sum_iP(H_i)P(B\\mid H_i)}=${result.tex()}`;
  const totalN =
    1 -
    weights.reduce(
      (s, q, i) => s + q.number() * (1 - conditionals[i].number()),
      0,
    );
  const check =
    posterior === undefined
      ? totalN
      : (weights[posterior - 1].number() *
          conditionals[posterior - 1].number()) /
        totalN;
  const verification: Verification = {
    passed:
      near(result.number(), check) &&
      weights.every((_, i) =>
        near(conditionals[i].number() + ONE.sub(conditionals[i]).number(), 1),
      ),
    method:
      "تحقق عبر مسارات المتمم، وفحص مجموع الفروع الخارجة عند كل عقدة؛ في بايز تُفحص أيضًا قسمة الوزن المشترك.",
  };
  const steps: SolutionStep[] = [
    {
      title: "تجزئة الفضاء العيني",
      text: "الأحداث Hᵢ متنافية وتغطي الفضاء العيني. q أوزان الاختيار، وp احتمالات B داخل الفروع.",
      latex: `\\sum_iP(H_i)=${sum(weights).tex()},\\qquad P(B\\mid H_i)+P(\\overline B\\mid H_i)=1`,
    },
    {
      title: "ضرب احتمالات المسار",
      latex: columns(
        paths.map((p, i) => [
          `H_{${i + 1}}`,
          weights[i].tex(),
          conditionals[i].tex(),
          p.tex(),
        ]),
        ["\\text{الفرع}", "P(H_i)", "P(B\\mid H_i)", "P(H_i\\cap B)"],
      ),
    },
    {
      title:
        posterior === undefined
          ? "جمع المسارات — الاحتمال الكلي"
          : "قاعدة بايز",
      latex: finalLatex,
    },
  ];
  const visuals: Visual[] = [
    {
      kind: "tree",
      title: "شجرة احتمال كلي — مجموع الفروع عند كل عقدة ١",
      root: {
        label: "البداية",
        probability: "1",
        children: weights.map((q, i) => ({
          label: model.labels?.[i] || `H${i + 1}`,
          probability: q.text(),
          children: [
            { label: "B", probability: conditionals[i].text() },
            { label: "متمم B", probability: ONE.sub(conditionals[i]).text() },
          ],
        })),
      },
    },
  ];
  return { result, total, steps, visuals, verification, finalLatex };
}
export function calculateJoint(model: JointModel) {
  if (
    !model.x.length ||
    !model.y.length ||
    model.x.length > 10 ||
    model.y.length > 10 ||
    model.matrix.length !== model.x.length ||
    model.matrix.some((row) => row.length !== model.y.length)
  )
    throw new ClarificationError("أبعاد جدول J يجب أن تطابق X وY (حتى ١٠×١٠).");
  const x = model.x.map((s) => exact(s)),
    y = model.y.map((s) => exact(s)),
    matrix = model.matrix.map((row) => row.map(probability));
  if (
    new Set(x.map((v) => v.text())).size !== x.length ||
    new Set(y.map((v) => v.text())).size !== y.length
  )
    throw new ClarificationError("قيم كل متحول يجب أن تكون متميزة.");
  if (!sum(matrix.flat()).eq(ONE))
    throw new ClarificationError(
      "مجموع احتمالات الجدول المشترك يجب أن يساوي ١ تمامًا.",
    );
  const px = matrix.map(sum),
    py = y.map((_, j) => sum(matrix.map((row) => row[j])));
  let independent = true,
    independentN = true;
  for (let i = 0; i < x.length; i++)
    for (let j = 0; j < y.length; j++) {
      if (!matrix[i][j].eq(px[i].mul(py[j]))) independent = false;
      if (!near(matrix[i][j].number(), px[i].number() * py[j].number(), 1e-12))
        independentN = false;
    }
  const ex = sum(x.map((v, i) => v.mul(px[i]))),
    ey = sum(y.map((v, i) => v.mul(py[i])));
  const steps: SolutionStep[] = [
    {
      title: "القانونان الهامشيان",
      latex: `p_X(x_i)=\\sum_jp_{ij},\\quad p_Y(y_j)=\\sum_ip_{ij},\\quad \\sum_{ij}p_{ij}=1`,
    },
    {
      title: "معيار استقلال المتحولين",
      text: "يجب تحقق المساواة لكل زوج من القيم، بما فيه الخانات ذات الاحتمال صفر؛ لا تكفي مقارنة الأملين أو معامل ارتباط يساوي صفرًا.",
      latex: `\\forall i,j:\quad p_{ij}\\mathrel{\\stackrel{?}{=}}p_X(x_i)p_Y(y_j)`,
    },
    {
      title: "الأملان الهامشيان",
      latex: `E(X)=${ex.tex()},\\quad E(Y)=${ey.tex()}`,
    },
  ];
  const visuals: Visual[] = [
    {
      kind: "table",
      title: "القانون المشترك والهامشان",
      latex: columns(
        [
          ...matrix.map((row, i) => [
            x[i].tex(),
            ...row.map((p) => p.tex()),
            px[i].tex(),
          ]),
          ["p_Y", ...py.map((p) => p.tex()), "1"],
        ],
        ["X\\backslash Y", ...y.map((v) => v.tex()), "p_X"],
      ),
    },
  ];
  const verification: Verification = {
    passed:
      independent === independentN &&
      near(
        px.reduce((s, p) => s + p.number(), 0),
        1,
      ) &&
      near(
        py.reduce((s, p) => s + p.number(), 0),
        1,
      ),
    samples: x.length * y.length,
    method:
      "فحص جميع الخانات بكسر دقيق وبحاصل ضرب الهامشين عدديًا؛ النتيجة قد تكون عدم استقلال.",
  };
  return {
    steps,
    visuals,
    verification,
    finalLatex: `\\text{${independent ? "المتحولان X وY مستقلان" : "المتحولان X وY غير مستقلين"}}`,
  };
}
