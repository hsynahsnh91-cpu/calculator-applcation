import {
  ClarificationError,
  type SolutionStep,
  type TreeNode,
  type Verification,
  type Visual,
} from "../../solver/types";
import type {
  DiscreteLaw,
  UrnModel,
  UrnQuery,
} from "../../solver/probabilityTypes";
import {
  choose,
  falling,
  factorialExact,
  Rational,
  ZERO,
  ONE,
  sum,
  matches,
  near,
  comparisonTex,
  columns,
} from "./probabilityExact";

export function validateUrn(model: UrnModel) {
  if (
    !model.colors.length ||
    model.colors.length > 8 ||
    model.colors.some(
      (c) =>
        !c.name.trim() ||
        c.name.length > 40 ||
        !Number.isSafeInteger(c.count) ||
        c.count < 0 ||
        c.count > 1000000,
    )
  )
    throw new ClarificationError(
      "أدخل من لون إلى ٨ ألوان، ولكل لون عدد صحيح بين ٠ ومليون.",
    );
  if (
    new Set(model.colors.map((c) => c.name.trim())).size !== model.colors.length
  )
    throw new ClarificationError(
      "لا تكرر اسم اللون؛ اجمع كرات اللون نفسه في خانة واحدة.",
    );
  const n = model.colors.reduce((s, c) => s + c.count, 0);
  if (!n)
    throw new ClarificationError("الصندوق فارغ؛ أضف كرة واحدة على الأقل.");
  if (!Number.isSafeInteger(model.count) || model.count < 1 || model.count > 32)
    throw new ClarificationError(
      "عدد الكرات المسحوبة يجب أن يكون صحيحًا من ١ إلى ٣٢.",
    );
  if (
    !["simultaneous", "successive_without_rep", "successive_with_rep"].includes(
      model.mode,
    )
  )
    throw new ClarificationError("حدّد نمط السحب أولًا.");
  if (model.mode !== "successive_with_rep" && model.count > n)
    throw new ClarificationError(
      "لا يمكن سحب عدد أكبر من محتوى الصندوق دون إعادة.",
    );
  return n;
}
export function urnSpace(model: UrnModel) {
  const n = validateUrn(model),
    r = model.count;
  const total =
    model.mode === "simultaneous"
      ? choose(n, r)
      : model.mode === "successive_without_rep"
        ? falling(n, r)
        : BigInt(n) ** BigInt(r);
  const formula =
    model.mode === "simultaneous"
      ? `\\binom{${n}}{${r}}`
      : model.mode === "successive_without_rep"
        ? `P_{${n}}^{${r}}=\\frac{${n}!}{(${n}-${r})!}`
        : `${n}^{${r}}`;
  const explanation =
    model.mode === "simultaneous"
      ? "سحب معًا: لا نراعي الترتيب، ولا توجد إعادة. الكرات المادية متميزة ولو تشابه لونها."
      : model.mode === "successive_without_rep"
        ? "سحب متتالٍ دون إعادة: نراعي ترتيب السحبات ولا نكرر الكرة."
        : "سحب متتالٍ مع إعادة: نراعي الترتيب، ويمكن تكرار الكرة. العدد قوة n^r، وليس ترتيبًا دون تكرار.";
  return {
    n,
    r,
    total,
    formula,
    step: {
      title: "الفضاء العيني",
      latex: `n(\\Omega)=${formula}=${total}`,
      text: explanation,
    } satisfies SolutionStep,
  };
}
export function colorLaw(model: UrnModel, color: string): DiscreteLaw {
  const { n, r } = urnSpace(model),
    index = model.colors.findIndex((c) => c.name === color);
  if (index < 0)
    throw new ClarificationError(
      "اللون المطلوب غير موجود في بيانات التجربة. اختر لونًا من الصندوق.",
    );
  const a = model.colors[index].count,
    rep = model.mode === "successive_with_rep";
  const lo = rep ? 0 : Math.max(0, r - (n - a)),
    hi = rep ? r : Math.min(r, a);
  const values: string[] = [],
    probabilities: string[] = [];
  for (let k = lo; k <= hi; k++) {
    const p = rep
      ? new Rational(
          choose(r, k) *
            BigInt(a) ** BigInt(k) *
            BigInt(n - a) ** BigInt(r - k),
          BigInt(n) ** BigInt(r),
        )
      : new Rational(choose(a, k) * choose(n - a, r - k), choose(n, r));
    if (p.n !== 0n) {
      values.push(String(k));
      probabilities.push(p.text());
    }
  }
  return { symbol: "X", values, probabilities };
}
/** Independent sequential DP, not a second call to the combination formula. */
function dynamicColorLaw(model: UrnModel, color: string): number[] {
  const n = validateUrn(model),
    a = model.colors.find((c) => c.name === color)!.count;
  let dp = [1];
  for (let t = 0; t < model.count; t++) {
    const next = Array(t + 2).fill(0) as number[];
    for (let k = 0; k < dp.length; k++) {
      if (!dp[k]) continue;
      const denominator = model.mode === "successive_with_rep" ? n : n - t;
      const target = model.mode === "successive_with_rep" ? a : a - k;
      if (target > 0) next[k + 1] += (dp[k] * target) / denominator;
      if (denominator - target > 0)
        next[k] += (dp[k] * (denominator - target)) / denominator;
    }
    dp = next;
  }
  return dp;
}
function smallTree(model: UrnModel): TreeNode | null {
  if (model.count > 3 || model.colors.filter((c) => c.count > 0).length > 4)
    return null;
  const walk = (counts: number[], depth: number): TreeNode[] => {
    if (depth === model.count) return [];
    const total = counts.reduce((a, b) => a + b, 0);
    return counts.flatMap((n, i) => {
      if (!n) return [];
      const next = [...counts];
      if (model.mode !== "successive_with_rep") next[i]--;
      return [
        {
          label: model.colors[i].name,
          probability: new Rational(n, total).text(),
          children: walk(next, depth + 1),
        },
      ];
    });
  };
  return {
    label: "البداية",
    probability: "1",
    children: walk(
      model.colors.map((c) => c.count),
      0,
    ),
  };
}
function pathProbability(
  model: UrnModel,
  test: (sequence: number[]) => boolean,
): Rational | null {
  const active = model.colors.flatMap((c, i) => (c.count ? [i] : []));
  if (active.length ** model.count > 12000) return null;
  let result = ZERO;
  const walk = (counts: number[], sequence: number[], p: Rational) => {
    if (sequence.length === model.count) {
      if (test(sequence)) result = result.add(p);
      return;
    }
    const total = counts.reduce((a, b) => a + b, 0);
    for (const i of active) {
      if (!counts[i]) continue;
      const next = [...counts];
      if (model.mode !== "successive_with_rep") next[i]--;
      walk(next, [...sequence, i], p.mul(new Rational(counts[i], total)));
    }
  };
  walk(
    model.colors.map((c) => c.count),
    [],
    ONE,
  );
  return result;
}
function allDistinct(model: UrnModel): Rational {
  const { n, r, total } = urnSpace(model);
  let coefficients = Array.from({ length: r + 1 }, () => 0n);
  coefficients[0] = 1n;
  for (const color of model.colors)
    for (let k = r; k >= 1; k--)
      coefficients[k] += coefficients[k - 1] * BigInt(color.count);
  return model.mode === "simultaneous"
    ? new Rational(coefficients[r], total)
    : new Rational(
        coefficients[r] * factorialExact(r),
        model.mode === "successive_with_rep" ? BigInt(n) ** BigInt(r) : total,
      );
}
export function calculateUrn(
  model: UrnModel,
  query: UrnQuery,
  options: { verify?: boolean; visuals?: boolean } = {},
) {
  const space = urnSpace(model);
  const steps: SolutionStep[] = [space.step],
    visuals: Visual[] = [];
  let classicalTotal = space.total;
  let namedEvents: Record<string, string> | undefined;
  let law: DiscreteLaw | undefined,
    p: Rational | undefined,
    finalLatex = "",
    verification: Verification = {
      passed: false,
      method: "لا يتوفر مسار تحقق مستقل لهذه الصيغة.",
    };
  const color =
    query.color || model.target || model.colors.find((c) => c.count > 0)!.name;
  if (query.type === "law" || query.type === "color") {
    law = colorLaw(model, color);
    const dp = options.verify === false ? [] : dynamicColorLaw(model, color);
    const errors = law.values.map((x, i) =>
      Math.abs(
        Number(dp[Number(x)] || 0) -
          new RationalValue(law!.probabilities[i]).number(),
      ),
    );
    const error = Math.max(0, ...errors);
    verification = {
      passed:
        error < 1e-10 &&
        near(
          dp.reduce((a, b) => a + b, 0),
          1,
        ),
      samples: law.values.length,
      maxError: error,
      method:
        "مطابقة القانون التوافقي مع برمجة ديناميكية مستقلة لمسارات السحب المتتالي.",
    };
    const a = model.colors.find((c) => c.name === color)!.count;
    steps.push({
      title: `عدد الكرات من اللون ${color}`,
      text: "X يعدّ الكرات من اللون المحدد فقط. القيم ذات الاحتمال صفر لا تدخل في X(Ω).",
      latex:
        model.mode === "successive_with_rep"
          ? `P(X=k)=\\binom{${space.r}}k\\left(\\frac{${a}}{${space.n}}\\right)^k\\left(1-\\frac{${a}}{${space.n}}\\right)^{${space.r}-k}`
          : `P(X=k)=\\frac{\\binom{${a}}k\\binom{${space.n - a}}{${space.r}-k}}{\\binom{${space.n}}{${space.r}}}`,
    });
    if (query.type === "color") {
      const k = query.k ?? 1,
        c = query.comparison ?? "eq";
      if (!Number.isSafeInteger(k) || Math.abs(k) > 1000000)
        throw new ClarificationError(
          "حد الحدث k يجب أن يكون عددًا صحيحًا محدودًا.",
        );
      p = sum(
        law.probabilities
          .filter((_, i) => matches(Number(law!.values[i]), k, c))
          .map((x) => new RationalValue(x)),
      );
      finalLatex = `P(X${comparisonTex[c]}${k})=${p.tex()}`;
      if (query.first) {
        p = new Rational(a, space.n);
        finalLatex = `P(\\text{الأولى من اللون المحدد})=${p.tex()}`;
      }
    }
  } else if (query.type === "ordered") {
    if (model.mode === "simultaneous")
      throw new ClarificationError(
        "السحب معًا لا يملك أولى وثانية. اختر سحبًا متتاليًا أو اطلب تركيب الألوان دون ترتيب.",
      );
    if (space.r < 2 || query.sequence?.length !== 2)
      throw new ClarificationError(
        "حدث الأولى والثانية يحتاج سحبتين على الأقل ولون كل منهما.",
      );
    const indices = query.sequence.map((name) =>
      model.colors.findIndex((c) => c.name === name),
    );
    if (indices.some((i) => i < 0))
      throw new ClarificationError(
        "أحد لوني الحدث غير موجود في بيانات الصندوق.",
      );
    const [a, b] = indices.map((i) => model.colors[i].count),
      without = model.mode !== "successive_with_rep";
    const joint = new Rational(a, space.n).mul(
      new Rational(
        b - (without && indices[0] === indices[1] ? 1 : 0),
        without ? space.n - 1 : space.n,
      ),
    );
    const conditioning =
      query.conditionalOn === "first"
        ? new Rational(a, space.n)
        : new Rational(b, space.n);
    if (query.conditionalOn && conditioning.n === 0n)
      throw new ClarificationError(
        "الشرط المرصود احتماله صفر؛ الاحتمال الشرطي غير معرّف.",
      );
    p = query.conditionalOn ? joint.div(conditioning) : joint;
    if (query.conditionalOn) {
      namedEvents = {
        A: new Rational(
          query.conditionalOn === "first" ? b : a,
          space.n,
        ).text(),
        B: conditioning.text(),
        "A&B": joint.text(),
      };
      steps.push({
        title: "تسمية حدث الهدف والشرط",
        latex:
          query.conditionalOn === "first"
            ? "A=C_2,\\quad B=C_1"
            : "A=C_1,\\quad B=C_2",
      });
    }

    if (query.conditionalOn)
      classicalTotal = conditioning.mul(new Rational(space.total)).n;
    finalLatex = query.conditionalOn
      ? `P(${query.conditionalOn === "first" ? "C_2\\mid C_1" : "C_1\\mid C_2"})=\\frac{${joint.tex()}}{${conditioning.tex()}}=${p.tex()}`
      : `P(C_1\\cap C_2)=${joint.tex()}`;
    steps.push({
      title: "حدثا السحبتين",
      text: `C₁: الأولى ${query.sequence[0]}، C₂: الثانية ${query.sequence[1]}. ${query.conditionalOn ? "الفضاء المشروط يقتصر على الحالات الموافقة للشرط." : "السحبات اللاحقة، إن وُجدت، غير مقيّدة في هذا الحدث."}`,
      latex: `P(C_1\\cap C_2)=\\frac{${a}}{${space.n}}\\cdot\\frac{${Math.max(0, b - (without && indices[0] === indices[1] ? 1 : 0))}}{${without ? space.n - 1 : space.n}}=${joint.tex()}`,
    });
    const check =
      options.verify === false
        ? null
        : pathProbability(
            model,
            (s) => s[0] === indices[0] && s[1] === indices[1],
          );
    if (check) {
      const value = query.conditionalOn ? check.div(conditioning) : check;
      verification = {
        passed: value.eq(p),
        method:
          "جمع مستقل لكل المسارات التي تحقق ترتيب اللونين، ثم التقييد بالشرط عند طلب الاحتمال الشرطي.",
      };
    }
  } else if (query.type === "composition") {
    const composition = query.composition;
    if (
      !composition?.length ||
      new Set(composition.map((c) => c.color)).size !== composition.length ||
      composition.some((c) => !Number.isSafeInteger(c.count) || c.count < 0) ||
      composition.reduce((s, c) => s + c.count, 0) !== space.r
    )
      throw new ClarificationError(
        "حدّد تركيبًا كاملًا: مجموع أعداد الكرات المطلوبة يجب أن يساوي عدد السحبات.",
      );
    if (
      composition.some(
        (c) => !model.colors.some((color) => color.name === c.color),
      )
    )
      throw new ClarificationError("في التركيب لون غير موجود في الصندوق.");
    const counts = model.colors.map(
      (c) => composition.find((item) => item.color === c.name)?.count || 0,
    );
    const numerator = counts.reduce(
      (s, k, i) =>
        s *
        (model.mode === "successive_with_rep"
          ? BigInt(model.colors[i].count) ** BigInt(k)
          : choose(model.colors[i].count, k)),
      1n,
    );
    p =
      model.mode === "successive_with_rep"
        ? new Rational(
            factorialExact(space.r) * numerator,
            counts.reduce((s, k) => s * factorialExact(k), 1n) * space.total,
          )
        : new Rational(numerator, choose(space.n, space.r));
    finalLatex = `P(A)=${p.tex()}`;
    steps.push({
      title: "تركيب الألوان المطلوب",
      text: composition.map((c) => `${c.count} من اللون ${c.color}`).join("، "),
      latex:
        model.mode === "successive_with_rep"
          ? "P(A)=\\frac{r!}{\\prod_j k_j!}\\prod_j\\left(\\frac{n_j}{n}\\right)^{k_j}"
          : "P(A)=\\frac{\\prod_j\\binom{n_j}{k_j}}{\\binom nr}",
    });
    const check =
      options.verify === false
        ? null
        : pathProbability(model, (s) =>
            counts.every((k, i) => s.filter((c) => c === i).length === k),
          );
    if (check)
      verification = {
        passed: check.eq(p),
        method:
          "مطابقة العدّ متعدد الألوان مع جمع المسارات المرتبة التي تحقق التركيب نفسه.",
      };
  } else if (query.type === "count") {
    finalLatex = space.step.latex;
    // A multiplicative sequential count independently checks the factorial identity.
    let sequential = 1n;
    for (let t = 0; t < space.r; t++)
      sequential *= BigInt(
        model.mode === "successive_with_rep" ? space.n : space.n - t,
      );
    verification = {
      passed:
        sequential ===
        (model.mode === "simultaneous"
          ? space.total * factorialExact(space.r)
          : space.total),
      method:
        "مطابقة العدّ بضرب عدد الاختيارات في كل سحبة، وقسمة الترتيبات على r! عند السحب معًا.",
    };
  } else if (
    query.type === "same" ||
    query.type === "different" ||
    query.type === "all-distinct"
  ) {
    const same = sum(
      model.colors.map((c) =>
        model.mode === "successive_with_rep"
          ? new Rational(
              BigInt(c.count) ** BigInt(space.r),
              BigInt(space.n) ** BigInt(space.r),
            )
          : new Rational(choose(c.count, space.r), choose(space.n, space.r)),
      ),
    );
    p =
      query.type === "same"
        ? same
        : query.type === "different"
          ? ONE.sub(same)
          : allDistinct(model);
    steps.push({
      title:
        query.type === "same"
          ? "كل الكرات من لون واحد"
          : query.type === "different"
            ? "ليست كل الكرات من لون واحد"
            : "كل الكرات مختلفة الألوان اثنتين اثنتين",
      text:
        query.type === "different" && space.r > 2
          ? "هذا الحدث يعني لونين على الأقل، ولا يعني أن جميع الألوان مختلفة."
          : "تُحسب الحالات الموافقة بنفس قاعدة عدّ الفضاء العيني.",
      latex:
        query.type === "same"
          ? `P(A)=\\sum_jP(\\text{كلها من اللون }j)=${p.tex()}`
          : query.type === "different"
            ? `P(A)=1-P(\\text{لون واحد})=1-${same.tex()}=${p.tex()}`
            : `P(A)=\\frac{${p.mul(new Rational(space.total)).tex()}}{${space.total}}=${p.tex()}`,
    });
    finalLatex = `P(A)=${p.tex()}`;
    const check =
      options.verify === false
        ? null
        : pathProbability(model, (s) =>
            query.type === "same"
              ? new Set(s).size === 1
              : query.type === "different"
                ? new Set(s).size > 1
                : new Set(s).size === s.length,
          );
    if (check)
      verification = {
        passed: check.eq(p),
        samples: Math.min(12000, model.colors.length ** space.r),
        method:
          "جمع أوزان مسارات مرتبة مستقلة، ثم مطابقتها مع العدّ بالتوافيق.",
      };
  } else {
    if (
      choose(space.r + model.colors.length - 1, model.colors.length - 1) > 100n
    )
      throw new ClarificationError(
        "تعداد كل تراكيب الألوان كبير لهذه التجربة. اختر حدثًا محددًا أو قانون عدد كرات لون معيّن؛ يُحسب مباشرة دون تعداد.",
        ["احسب قانون احتمال عدد الكرات الحمراء"],
      );
    const rows: string[][] = [];
    let totalProbability = ZERO;
    const walk = (index: number, remaining: number, counts: number[]) => {
      if (index === model.colors.length - 1) {
        const all = [...counts, remaining];
        if (
          model.mode !== "successive_with_rep" &&
          all.some((x, i) => x > model.colors[i].count)
        )
          return;
        const numerator = all.reduce(
          (v, k, i) =>
            v *
            (model.mode === "successive_with_rep"
              ? BigInt(model.colors[i].count) ** BigInt(k)
              : choose(model.colors[i].count, k)),
          1n,
        );
        const q =
          model.mode === "successive_with_rep"
            ? new Rational(
                factorialExact(space.r) * numerator,
                all.reduce((v, k) => v * factorialExact(k), 1n) *
                  BigInt(space.n) ** BigInt(space.r),
              )
            : new Rational(numerator, choose(space.n, space.r));
        if (q.n) {
          rows.push([...all.map(String), q.tex()]);
          totalProbability = totalProbability.add(q);
        }
        return;
      }
      for (let k = 0; k <= remaining; k++)
        walk(index + 1, remaining - k, [...counts, k]);
    };
    walk(0, space.r, []);
    if (rows.length > 100)
      throw new ClarificationError(
        "عدد تراكيب الألوان أكبر من حد الجدول (١٠٠). اطلب حدثًا محددًا بدلًا من عرضها كلها.",
      );
    finalLatex = `\\sum_{\\text{تراكيب الألوان}}P= ${totalProbability.tex()}`;
    visuals.push({
      kind: "table",
      title: "تراكيب الألوان (ليست متساوية الاحتمال بالضرورة)",
      latex: columns(rows, [
        ...model.colors.map((_, i) => `n_{${i + 1}}`),
        "P",
      ]),
    });
    steps.push({
      title: "مفتاح الجدول",
      text: model.colors.map((c, i) => `n${i + 1}: ${c.name}`).join("، "),
      latex: `\\sum_jn_j=${space.r}`,
    });
    verification = {
      passed: totalProbability.eq(ONE),
      method:
        "فحص اكتمال التراكيب ومجموع احتمالاتها يساوي ١؛ لا يُعدّ ذلك تحققًا مستقلًا لكل صف.",
    };
    // Normalization alone is not an independent event check.
    verification.passed = false;
  }
  if (p) {
    if (query.complement) {
      p = ONE.sub(p);
      finalLatex = `P(\\overline A)=${p.tex()}`;
    }
    const favorable = p.mul(new Rational(classicalTotal));
    if (favorable.d !== 1n)
      throw new ClarificationError(
        "الحدث لا يتسق مع قاعدة عدّ الفضاء العيني. راجع النمط والحدث.",
      );
    steps.push({
      title: query.conditionalOn
        ? "الفضاء العيني المشروط"
        : "الاحتمال الكلاسيكي",
      text: "الحالات الأولية متساوية الاحتمال؛ لا نفترض تساوي احتمالات الألوان أو تراكيبها.",
      latex: `${query.conditionalOn ? "P(A\\mid B)=\\frac{n(A\\cap B)}{n(B)}" : "P(A)=\\frac{n(A)}{n(\\Omega)}"}=\\frac{${favorable.n}}{${classicalTotal}}=${p.tex()}`,
    });
  }
  const tree = options.visuals === false ? null : smallTree(model);
  if (tree)
    visuals.push({
      kind: "tree",
      title:
        model.mode === "simultaneous"
          ? "شجرة تحقق مرتبة مكافئة للسحب معًا دون إعادة"
          : "شجرة الاحتمالات — نضرب على المسار ونجمع المسارات",
      root: tree,
    });
  return {
    space,
    law,
    p,
    finalLatex,
    steps,
    visuals,
    verification,
    color,
    namedEvents,
  };
}
// Fraction strings produced here contain only reduced integers; avoid reparsing with the AST.
class RationalValue extends Rational {
  constructor(s: string) {
    const [n, d = "1"] = s.split("/");
    super(BigInt(n), BigInt(d));
  }
}
