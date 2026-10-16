import type {
  SolverContext,
  SolverResult,
  SolutionStep,
} from "../solver/types";
import { ClarificationError } from "../solver/types";
import { mathInstructionText } from "../solver/textbook";
import { assigned } from "../solver/extractors/probability";
import { Rational, exact, ONE, ZERO } from "./probabilityExact";
import { polynomial } from "./spaceGeometryMath";
import nerdamer from "nerdamer";
const T = String.raw;
const fail = (s: string) => new ClarificationError(s);
const wrap = (v: Rational) =>
  v.n < 0n || v.d !== 1n ? T`\left(${v.tex()}\right)` : v.tex();
const addTex = (s: string, v: Rational) =>
  v.n === 0n
    ? s
    : `${s}${v.n < 0n ? "-" : "+"}${new Rational(v.n < 0n ? -v.n : v.n, v.d).tex()}`;
const prefix = (s: string) =>
  s
    .match(/^[A-Za-z0-9_+*/^(). \t-]+/)?.[0]
    ?.trim()
    .replace(/[.\s]+$/, "") || "";
type Answer = Pick<
  SolverResult,
  | "title"
  | "finalLatex"
  | "steps"
  | "visuals"
  | "verification"
  | "decimal"
  | "contextPatch"
>;
/** Bounded affine/geometric/arithmetic sequences with exact rational data and explicit induction. */
export function schoolSequence(
  text: string,
  context: SolverContext,
): Answer | undefined {
  const own = /\bu_?[01]\s*=|\bu_n\+1\s*=|\bu\(n\+1\)/.test(text),
    source = (own ? text : (context.school?.sequence || "") + "\n" + text)
      .replace(/u_\{([^}]+)\}/g, "u_$1")
      .replace(/u\(n\+1\)/g, "u_n+1");
  const rawRec = source.match(/\bu_n\+1\s*=\s*/);
  const init = source.match(/\bu_?([01])\s*=\s*/);
  if (!rawRec && !init) return;
  if (!init) throw fail("ما قيمة الحد الابتدائي للمتتالية ورتبته؟");
  const p = Number(init[1]),
    u = exact(prefix(source.slice(init.index! + init[0].length)));
  const demand = mathInstructionText(text);
  const endpoints = demand.match(
    /من\s+(?:الرتبة\s*)?(\d+)\s*(?:الي|الى)\s*(?:الرتبة\s*)?(\d+)/,
  );
  const count = demand.match(/(?:اول|مجموع اول)\s*(\d+)\s*حد/),
    rank = demand.match(/\bu_?(\d+)\b/);
  const end = endpoints
    ? Number(endpoints[2])
    : count
      ? p + Number(count[1]) - 1
      : rank
        ? Number(rank[1])
        : p + 9;
  const start = endpoints ? Number(endpoints[1]) : p;
  if (!Number.isSafeInteger(end) || end < start || start < p || end - p >= 1000)
    throw fail(
      "رتب المتتالية صحيحة، ولا تقل عن رتبة البداية؛ حد الحساب الدقيق1000 حد.",
    );
  let a: Rational, b: Rational, kind: "affine" | "arithmetic" | "geometric";
  if (rawRec) {
    if (p !== 0)
      throw fail(
        "العلاقة التدريجية المدعومة تبدأ هنا بـ u_0؛ حدد الحد عند الرتبة0.",
      );
    const rhs = prefix(source.slice(rawRec.index! + rawRec[0].length)).replace(
      /(?<![A-Za-z_])u_n\b/g,
      "x",
    );
    const poly = polynomial(rhs);
    if ([...poly.keys()].some((k) => k !== "00000" && k !== "10000"))
      throw fail(
        "العلاقات التدريجية المدعومة أفينية فقط؛ لا يولّد التطبيق برهانًا لعلاقة غير خطية.",
      );
    const ar = poly.get("10000")?.rational(),
      br = poly.get("00000")?.rational();
    a = ar || ZERO;
    b = br || ZERO;
    if ((poly.has("10000") && !ar) || (poly.has("00000") && !br))
      throw fail("معاملات هذه المتتالية يجب أن تكون نسبية محددة.");
    kind = "affine";
  } else {
    const ratio = assigned(source, "q|r|اساسها|اساس|فرقها|نسبتها");
    if (!ratio) throw fail("ما أساس المتتالية؟");
    if (/هندسي/.test(source)) {
      a = exact(ratio);
      b = ZERO;
      kind = "geometric";
    } else if (/حسابي/.test(source)) {
      a = ONE;
      b = exact(ratio);
      kind = "arithmetic";
    } else throw fail("هل المتتالية حسابية أم هندسية؟");
  }
  const ell = a.eq(ONE) ? ZERO : b.div(ONE.sub(a)),
    c = u.sub(ell),
    nExp = p === 0 ? "n" : `n-${p}`;
  let formula = a.eq(ONE)
    ? addTex(`${b.tex()}n`, u.sub(b.mul(new Rational(p))))
    : addTex(`${c.eq(ONE) ? "" : wrap(c)}${wrap(a)}^{${nExp}}`, ell);
  if (a.n === 0n)
    formula = u.eq(b)
      ? b.tex()
      : T`\begin{cases}${u.tex()}&n=${p}\\${b.tex()}&n\ge${p + 1}\end{cases}`;
  const expression = a.eq(ONE)
    ? `(${b.text()})*n+(${u.sub(b.mul(new Rational(p))).text()})`
    : `(${c.text()})*(${a.text()})^(n-${p})+(${ell.text()})`;
  const term = (n: number) =>
    a.eq(ONE)
      ? u.add(b.mul(new Rational(n - p)))
      : c.mul(a.pow(n - p)).add(ell);
  const wantsSum = /مجموع|اجمع/.test(demand),
    wantsLimit = /نهاية|تقارب/.test(demand),
    wantsAux = /\bv_n\b/.test(demand),
    induction = /بالتدريج/.test(demand);
  const steps: SolutionStep[] = [
    {
      title: "المعطى ورتبة البداية",
      latex: T`u_{${p}}=${u.tex()},\quad u_{n+1}=(${a.tex()})u_n+(${b.tex()})`,
    },
  ];
  if (!a.eq(ONE)) {
    const aux = [
      ...source.matchAll(/\bv_n\s*=\s*u_n\s*([+-])\s*([\d./]+)/g),
    ].slice(-1)[0];
    if (
      wantsAux &&
      aux &&
      !exact((aux[1] === "-" ? "-" : "") + aux[2]).eq(ell.mul(new Rational(-1)))
    )
      throw fail(
        "التعريف المعطى للمتتالية المساعدة لا يلغي الحد الثابت؛ لا يمكن إثبات هندسيتها بهذا التعريف.",
      );
    steps.push(
      {
        title: "نقطة التوازن والمتتالية المساعدة",
        latex: T`\ell=\frac{b}{1-a}=${ell.tex()},\quad v_n=u_n-(${ell.tex()})`,
      },
      {
        title: "إثبات هندسية المتتالية المساعدة",
        latex: T`\begin{aligned}v_{n+1}&=a u_n+b-\ell\\&=a(u_n-\ell)\\&=(${a.tex()})v_n\end{aligned}`,
        text: "استُعملت المساواة aℓ+b=ℓ، لذلك اختفى الحد الثابت، ولم نستنتج الهندسية من مقارنة حدود قليلة.",
      },
      {
        title: "الرجوع إلى المتتالية الأصلية",
        latex: T`v_n=(${c.tex()})(${a.tex()})^{${nExp}},\quad u_n=${formula}`,
      },
    );
  } else
    steps.push({
      title: "الحالة الحسابية",
      latex: T`u_{n+1}-u_n=${b.tex()},\quad u_n=${formula}`,
    });
  if (induction && a.n === 0n && !u.eq(b))
    throw fail(
      "عند a=0 تختلف رتبة البداية عن الصيغة الثابتة اللاحقة؛ لا يصح إثبات صيغة واحدة بهذه الصورة لكل الرتب.",
    );
  if (induction) {
    const claim = demand.match(/\bu_n\s*=\s*/);
    if (!claim)
      throw fail(
        "برهان التدريج المدعوم هنا للصيغة الصريحة في العلاقة الأفينية؛ ما الصيغة المطلوب إثباتها؟",
      );
    const requested = prefix(demand.slice(claim.index! + claim[0].length));
    if (
      nerdamer(`(${requested})-(${expression})`).expand().simplify().text() !==
      "0"
    )
      throw fail(
        "الصيغة المطلوب إثباتها لا توافق معطيات المتتالية؛ راجعها بدل إثبات عبارة غير صحيحة.",
      );
    steps.push(
      {
        title: "التحقق عند البداية",
        latex: T`u_{${p}}=${term(p).tex()}=${u.tex()}`,
      },
      {
        title: "فرض التدريج",
        latex: T`u_n=${formula}`,
        text: "نفترض صحة الصيغة عند رتبة طبيعية n لا تقل عن رتبة البداية.",
      },
      {
        title: "خطوة الانتقال من n إلى n+1",
        latex: a.eq(ONE)
          ? T`u_{n+1}=u_n+(${b.tex()})=${formula.replace(/n/g, "(n+1)")}`
          : T`\begin{aligned}u_{n+1}&=a\big(ca^{n-${p}}+\ell\big)+b\\&=c a^{n+1-${p}}+(a\ell+b)\\&=c a^{n+1-${p}}+\ell\end{aligned}`,
        text: "بالتعويض بفرض التدريج وبهوية نقطة التوازن نحصل على الصيغة عند الرتبة التالية؛ وبذلك يكتمل البرهان بالتدريج.",
      },
    );
  }
  let finalLatex = T`u_n=${formula}`,
    decimal: number | undefined;
  const length = end - start + 1;
  if (wantsAux && !wantsSum && !wantsLimit && !a.eq(ONE))
    finalLatex = T`v_{n+1}=(${a.tex()})v_n,\quad v_n=(${c.tex()})(${a.tex()})^{${nExp}},\quad u_n=${formula}`;
  if (wantsSum) {
    const total = a.eq(ONE)
      ? term(start)
          .add(term(end))
          .mul(new Rational(length))
          .div(new Rational(2))
      : c
          .mul(a.pow(start - p))
          .mul(ONE.sub(a.pow(length)))
          .div(ONE.sub(a))
          .add(ell.mul(new Rational(length)));
    finalLatex = T`S=\sum_{n=${start}}^{${end}}u_n=${total.tex()}`;
    decimal = Number.isFinite(total.number()) ? total.number() : undefined;
    steps.push({ title: "قانون المجموع والتعويض", latex: finalLatex });
  } else if (wantsLimit) {
    const absA = new Rational(a.n < 0n ? -a.n : a.n, a.d);
    let limit: string;
    if (c.n === 0n) limit = ell.tex();
    else if (a.eq(ONE))
      limit = b.n === 0n ? u.tex() : b.n > 0n ? "+\\infty" : "-\\infty";
    else if (absA.cmp(ONE) < 0) limit = ell.tex();
    else if (a.cmp(ONE) > 0) limit = c.n > 0n ? "+\\infty" : "-\\infty";
    else limit = "\\text{غير موجودة}";
    finalLatex = T`\lim_{n\to+\infty}u_n=${limit}`;
    steps.push({
      title: "النهاية من الصيغة الصريحة",
      latex: finalLatex,
      text: "نستعمل نهاية القوة الهندسية وشروطها، لا آخر حد محسوب.",
    });
  } else if (rank) {
    const value = term(end);
    finalLatex = T`u_{${end}}=${value.tex()}`;
    decimal = value.number();
  }
  let current = u,
    total = ZERO,
    checked = 0,
    valid = true;
  for (let n = p; n <= Math.min(end, p + 999); n++) {
    if (!current.eq(term(n))) valid = false;
    if (n >= start) total = total.add(current);
    checked++;
    current = a.mul(current).add(b);
  }
  if (wantsSum && decimal !== undefined) {
    const expected = Number(decimal);
    valid &&=
      Number.isFinite(expected) &&
      Math.abs(total.number() - expected) <=
        1e-9 * Math.max(1, Math.abs(expected));
  }
  if (a.n === 0n)
    for (const st of steps)
      if (st.latex.includes("v_n="))
        st.latex = T`v_${p}=${c.tex()},\quad v_n=0\ (n\ge${p + 1}),\quad u_n=${formula}`;
  const sourceDefinition = own
    ? source.slice(0, 1800)
    : context.school?.sequence;
  return {
    title: induction
      ? "الصيغة الصريحة وبرهانها بالتدريج"
      : wantsAux
        ? "المتتالية المساعدة والصيغة الصريحة"
        : kind === "arithmetic"
          ? "المتتالية الحسابية"
          : kind === "geometric"
            ? "المتتالية الهندسية"
            : "المتتالية الأفينية",
    finalLatex,
    decimal,
    steps,
    visuals: [],
    verification: {
      passed: valid && checked > 0,
      method: wantsSum
        ? "توليد الحدود وجمعها مستقلًا بالكسر الدقيق ومقارنة المجموع بالصّيغة"
        : "توليد الحدود بالعلاقة التدريجية ومقارنتها بالصّيغة الصريحة؛ الفحص لا يحل محل برهان التدريج",
      samples: checked,
    },
    contextPatch: { school: { ...context.school, sequence: sourceDefinition } },
  };
}
