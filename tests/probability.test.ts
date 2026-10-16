import assert from "node:assert/strict";
import katex from "katex";
import { solvePrompt } from "../src/solver/orchestrator";
import {
  emptyContext,
  type SolverAnswer,
  type SolverContext,
} from "../src/solver/types";
import type { UrnModel } from "../src/solver/probabilityTypes";
import { isProbabilityContext } from "../src/solver/probabilityTypes";
import { isConversationTurn } from "../src/solver/validation";
import { Rational, exact, ONE, sum, near } from "../src/utils/probabilityExact";
import { calculateUrn, colorLaw, urnSpace } from "../src/utils/probabilityUrn";
import {
  calculateLaw,
  calculateStatistics,
} from "../src/utils/probabilityLaws";
import {
  displayBalls,
  probabilityColor,
} from "../src/utils/probabilityPresentation";

let passed = 0,
  failed = 0;
async function test(name: string, run: () => void | Promise<void>) {
  try {
    await run();
    passed++;
    console.log("PASS", name);
  } catch (error) {
    failed++;
    console.error("FAIL", name, error);
  }
}
function validate(answer: SolverAnswer) {
  const copy = JSON.parse(
    JSON.stringify({
      id: "probability-test",
      question: answer.question,
      createdAt: Date.now(),
      answer,
    }),
  );
  assert(
    isConversationTurn(copy),
    "the complete answer must survive guarded JSON persistence",
  );
  for (const result of answer.results) {
    for (const latex of [
      result.finalLatex,
      ...result.steps.map((s) => s.latex),
      ...result.visuals.flatMap((v) =>
        v.kind === "table"
          ? [v.latex]
          : v.kind === "formula-cards"
            ? v.cards.map((c) => c.latex)
            : [],
      ),
    ])
      katex.renderToString(latex, { throwOnError: true, strict: "ignore" });
    assert(!/NaN|Infinity|undefined/.test(result.finalLatex));
  }
}
async function solved(question: string, context?: SolverContext) {
  const answer = await solvePrompt(question, { angleMode: "DEG", context });
  assert.equal(answer.unsolved.length, 0, JSON.stringify(answer.unsolved));
  assert.equal(answer.results.length, 1);
  validate(answer);
  return answer;
}
async function rejected(question: string, context?: SolverContext) {
  const answer = await solvePrompt(question, { angleMode: "DEG", context });
  assert.equal(answer.results.length, 0, JSON.stringify(answer.results));
  assert(answer.unsolved.length);
  validate(answer);
  return answer;
}
function value(answer: SolverAnswer) {
  return Number(answer.results[0].decimal);
}
const urn = (mode: UrnModel["mode"] = "simultaneous", count = 2): UrnModel => ({
  mode,
  count,
  colors: [
    { name: "حمراء", count: 3 },
    { name: "بيضاء", count: 5 },
  ],
  target: "حمراء",
});
const urnQuestion =
  "كيس فيه 3 كرات حمراء و5 بيضاء، سحبت كرتان معًا، جد احتمال اختلاف اللون";

await test("decimal lexemes and large integer fractions never lose precision through Number", () => {
  assert.equal(
    exact("9007199254740993/9007199254740992").text(),
    "9007199254740993/9007199254740992",
  );
  assert.equal(
    exact("0.12345678901234567890123456789").text(),
    "12345678901234567890123456789/100000000000000000000000000000",
  );
  assert.equal(exact("25%+(1/2)^3").text(), "3/8");
  assert.equal(exact("-2^2").text(), "-4");
  assert.equal(exact("2^-2").text(), "1/4");
  assert.equal(exact("2X+1", { X: new Rational(2) }).text(), "5");
});
await test("rational parser rejects code, missing values, division by zero and runaway powers", () => {
  for (const source of [
    "",
    "1/0",
    "0^0",
    "1 2",
    "foo(1)",
    "[1,2]",
    "1;2",
    "2**3",
    "(1+2",
    "10^1000000",
    "(10^500)^500",
  ])
    assert.throws(() => exact(source));
});
for (const [mode, count] of [
  ["simultaneous", 28n],
  ["successive_without_rep", 56n],
  ["successive_with_rep", 64n],
] as const)
  await test(`sample-space count: ${mode}`, () => {
    assert.equal(urnSpace(urn(mode)).total, count);
  });
for (const [mode, p] of [
  ["simultaneous", "15/28"],
  ["successive_without_rep", "15/28"],
  ["successive_with_rep", "15/32"],
] as const)
  await test(`different-colour probability and independent path check: ${mode}`, () => {
    const v = calculateUrn(urn(mode), { type: "different" });
    assert.equal(v.p?.text(), p);
    assert(v.verification.passed);
  });
await test("urn comparator tails are distinct exact events, never renamed success probabilities", () => {
  const base = urn();
  assert.equal(
    calculateUrn(base, {
      type: "color",
      color: "حمراء",
      k: 1,
      comparison: "eq",
    }).p?.text(),
    "15/28",
  );
  assert.equal(
    calculateUrn(base, {
      type: "color",
      color: "حمراء",
      k: 1,
      comparison: "ge",
    }).p?.text(),
    "9/14",
  );
  assert.equal(
    calculateUrn(base, {
      type: "color",
      color: "حمراء",
      k: 1,
      comparison: "lt",
    }).p?.text(),
    "5/14",
  );
  assert.equal(
    calculateUrn(base, {
      type: "color",
      color: "حمراء",
      k: 1,
      comparison: "gt",
    }).p?.text(),
    "3/28",
  );
});
await test("target colour changes work symmetrically", () => {
  const a = calculateUrn(urn(), { type: "color", color: "حمراء", k: 2 }),
    b = calculateUrn(urn(), { type: "color", color: "بيضاء", k: 2 });
  assert.equal(a.p?.text(), "3/28");
  assert.equal(b.p?.text(), "5/14");
  assert.notEqual(probabilityColor("حمراء"), probabilityColor("بيضاء"));
});
await test("zero-probability colour counts are absent from the actual support", () => {
  const law = colorLaw(
    {
      mode: "simultaneous",
      count: 3,
      colors: [
        { name: "حمراء", count: 5 },
        { name: "بيضاء", count: 1 },
      ],
    },
    "حمراء",
  );
  assert.deepEqual(law.values, ["2", "3"]);
  assert(sum(law.probabilities.map((p) => exact(p))).eq(ONE));
  const empty = colorLaw(
    {
      mode: "successive_with_rep",
      count: 4,
      colors: [
        { name: "حمراء", count: 0 },
        { name: "بيضاء", count: 3 },
      ],
    },
    "حمراء",
  );
  assert.deepEqual(empty.values, ["0"]);
  assert.deepEqual(empty.probabilities, ["1"]);
});
await test("simple events avoid exhaustive colour composition enumeration", () => {
  const model: UrnModel = {
    mode: "simultaneous",
    count: 32,
    colors: Array.from({ length: 8 }, (_, i) => ({
      name: "لون" + i,
      count: 1000000,
    })),
    target: "لون0",
  };
  const start = performance.now(),
    result = calculateUrn(model, {
      type: "color",
      color: "لون0",
      k: 5,
      comparison: "ge",
    });
  assert(result.p);
  assert(result.verification.passed);
  assert(performance.now() - start < 1500);
  assert(!result.visuals.some((v) => v.kind === "tree"));
});
await test("same, at least two colours and pairwise distinct are not confused for three balls", () => {
  const model: UrnModel = {
    mode: "simultaneous",
    count: 3,
    colors: [
      { name: "حمراء", count: 2 },
      { name: "بيضاء", count: 2 },
      { name: "زرقاء", count: 2 },
    ],
  };
  const same = calculateUrn(model, { type: "same" }),
    different = calculateUrn(model, { type: "different" }),
    distinct = calculateUrn(model, { type: "all-distinct" });
  assert.equal(same.p?.text(), "0");
  assert.equal(different.p?.text(), "1");
  assert.equal(distinct.p?.text(), "2/5");
  assert(distinct.verification.passed);
});
await test("a varied urn grid matches sequential DP for every target and comparator", () => {
  let samples = 0;
  for (const mode of [
    "simultaneous",
    "successive_without_rep",
    "successive_with_rep",
  ] as const)
    for (let a = 0; a <= 4; a++)
      for (let b = 1; b <= 4; b++)
        for (let count = 1; count <= Math.min(4, a + b); count++) {
          const model: UrnModel = {
            mode,
            count,
            colors: [
              { name: "حمراء", count: a },
              { name: "بيضاء", count: b },
            ],
          };
          for (const comparison of ["eq", "ge", "gt", "le", "lt"] as const) {
            const v = calculateUrn(model, {
              type: "color",
              color: "حمراء",
              k: 2,
              comparison,
            });
            assert(v.verification.passed);
            assert(v.p && v.p.cmp(new Rational(0)) >= 0 && v.p.cmp(ONE) <= 0);
            samples++;
          }
        }
  assert(samples > 900);
});
await test("invalid urn populations and impossible draw models fail closed", () => {
  for (const model of [
    { ...urn(), count: 2.5 },
    { ...urn(), count: 33 },
    { ...urn(), count: 9 },
    { ...urn(), colors: [{ name: "حمراء", count: 0 }] },
    { ...urn(), colors: [{ name: "حمراء", count: -2 }] },
    {
      ...urn(),
      colors: [
        { name: "حمراء", count: 1 },
        { name: "حمراء", count: 2 },
      ],
    },
  ])
    assert.throws(() => urnSpace(model));
});
await test("bounded ball randomization preserves physical counts and never mutates the model", () => {
  const colors = urn().colors,
    copy = JSON.stringify(colors),
    first = displayBalls(colors, () => 0.2),
    second = displayBalls(colors, () => 0.8);
  assert.equal(JSON.stringify(colors), copy);
  assert.equal(first.filter((b) => b.color === 0).length, 3);
  assert.equal(first.filter((b) => b.color === 1).length, 5);
  assert.notDeepEqual(first, second);
  assert.equal(
    displayBalls([
      { name: "حمراء", count: 999999 },
      { name: "بيضاء", count: 1 },
    ]).length,
    80,
  );
});
await test("the original urn chat regression still yields 15/28 with sample space first", async () => {
  const a = await solved(urnQuestion);
  assert(near(value(a), 15 / 28));
  assert.equal(a.results[0].steps[0].title, "الفضاء العيني");
  assert(a.results[0].verification.passed);
});
await test("drawing-mode follow-ups replace the mode without concatenating old conditions", async () => {
  const a = await solved(urnQuestion),
    b = await solved("السحب متتاليًا مع إعادة", a.context);
  assert(near(value(b), 15 / 32));
  assert.equal(b.context.probability?.urn?.mode, "successive_with_rep");
  assert(!b.context.lastPrompt?.includes("كيس"));
  const c = await solved("احتمال أن تكونا من نفس اللون", b.context);
  assert(near(value(c), 17 / 32));
});
await test("urn board serialized questions route through the same exact engine", async () => {
  const a = await solved(
    "تجربة سحب: الألوان=[حمراء:3,بيضاء:5]، r=2، السحب معًا دون إعادة، احسب احتمال X>=1، اللون المطلوب=حمراء",
  );
  assert(near(value(a), 9 / 14));
  assert.equal(a.results.length, 1);
});
await test("a custom colour and replacement mode are not tied to red/white hardcoding", async () => {
  const a = await solved(
    "تجربة سحب: الألوان=[وردية:2,ذهبية:3]، r=2، السحب متتاليًا مع إعادة، احسب احتمال X=2، اللون المطلوب=ذهبية",
  );
  assert(near(value(a), 9 / 25));
});
await test("sample-space-only counting works without inventing an event", async () => {
  for (const [mode, total] of [
    ["معًا", 28],
    ["متتاليًا دون إعادة", 56],
    ["متتاليًا مع إعادة", 64],
  ]) {
    const a = await solved(`n=8 r=2، السحب ${mode}، جد الفضاء العيني`);
    assert(a.results[0].finalLatex.endsWith("=" + total));
  }
});
await test("all colour compositions for two colours and 32 replacement draws stay bounded", async () => {
  const a = await solved(
    "الألوان=[حمراء:3,بيضاء:5]، r=32، السحب متتاليًا مع إعادة، جد جميع الاحتمالات",
  );
  assert(a.results[0].visuals.some((v) => v.kind === "table"));
  assert(!a.results[0].verification.passed);
});
await test("ambiguous multi-colour wording asks rather than choosing an unintended event", async () => {
  await rejected(
    "الألوان=[حمراء:2,بيضاء:2,زرقاء:2]، r=3، السحب معًا، جد احتمال ألوان مختلفة",
  );
});
await test("Urn random-variable laws expose complete support and moments", async () => {
  const a = await solved(
    "كيس فيه 3 كرات حمراء و5 بيضاء، سحب كرتين معًا، احسب قانون احتمال عدد الكرات الحمراء",
  );
  assert(a.results[0].finalLatex.includes("E(X^2)"));
  assert.deepEqual(a.context.probability?.law?.values, ["0", "1", "2"]);
  assert(a.results[0].visuals.some((v) => v.kind === "histogram"));
  assert(a.results[0].verification.passed);
});
await test("large legacy urn limits no longer constrain a simple direct colour event", async () => {
  const a = await solved(
    "الألوان=[حمراء:10000,بيضاء:20000,خضراء:1000]، r=20، السحب معًا، احسب احتمال X>=2، اللون المطلوب=خضراء",
  );
  assert(a.results[0].verification.passed);
});

for (const [op, expected] of [
  ["الاتحاد", 2 / 3],
  ["التقاطع", 1 / 6],
  ["P(A|B)", 1 / 2],
  ["متمم A", 1 / 2],
] as const)
  await test(`basic event algebra: ${op}`, async () => {
    const a = await solved(`P(A)=1/2، P(B)=1/3، P(A∩B)=1/6، احسب ${op}`);
    assert(near(value(a), expected));
    assert(a.results[0].verification.passed);
  });
await test("event definitions separated by semicolons bind to their query", async () => {
  const a = await solved("P(A)=1/2؛ P(B)=1/3؛ P(A∩B)=1/6؛ احسب الاتحاد");
  assert(near(value(a), 2 / 3));
});
await test("classical complements include impossible and certain events", async () => {
  assert.equal(value(await solved("P(A)=0، احسب متمم A")), 1);
  assert.equal(value(await solved("P(A)=1، احسب متمم A")), 0);
});
await test("mutually exclusive events use a zero intersection but are not automatically independent", async () => {
  const a = await solved("P(A)=1/2، P(B)=1/3، الحدثان متنافيان، احسب الاتحاد");
  assert(near(value(a), 5 / 6));
  const b = await solved("هل الحدثان مستقلان؟", a.context);
  assert.match(b.results[0].finalLatex, /غير مستقل/);
  assert(b.results[0].verification.passed);
});
await test("explicit independent-event assumption is honored, not silently inferred", async () => {
  const a = await solved("P(A)=1/2، P(B)=1/3، الحدثان مستقلان، احسب الاتحاد");
  assert(near(value(a), 2 / 3));
  await rejected("P(A)=1/2، P(B)=1/3، احسب الاتحاد");
});
await test("an independence question is not mistaken for an independence assumption", async () => {
  const a = await solved("P(A)=1/2، P(B)=1/3، P(A∩B)=1/4، هل الحدثان مستقلان؟");
  assert.match(a.results[0].finalLatex, /غير مستقل/);
  assert(a.results[0].verification.passed);
});
await test("zero-probability conditioning is undefined, not zero", async () => {
  await rejected("P(A)=1/2، P(B)=0، P(A∩B)=0، احسب P(A|B)");
});
await test("inconsistent event probabilities fail Fréchet bounds and relation checks", async () => {
  for (const q of [
    "P(A)=0.8، P(B)=0.8، P(A∩B)=0.2، احسب الاتحاد",
    "P(A)=1/4، P(B)=1/2، P(A∩B)=1/3، احسب الاتحاد",
    "P(A)=1/2، P(B)=1/3، P(A∩B)=1/5، الحدثان مستقلان، احسب الاتحاد",
    "P(A)=1.1، احسب متمم A",
  ])
    await rejected(q);
});
await test("conditional data derive a joint probability and support the reverse conditional", async () => {
  const a = await solved("P(A)=1/2، P(B)=1/3، P(B|A)=1/4، احسب P(A|B)");
  assert(near(value(a), 3 / 8));
});
await test("union data can derive the intersection without assuming independence", async () => {
  const a = await solved("P(A)=1/2، P(B)=1/3، P(A∪B)=2/3، احسب التقاطع");
  assert(near(value(a), 1 / 6));
});
await test("event follow-ups preserve named events and clear stale numeric results", async () => {
  const a = await solved("P(A)=1/2، P(B)=1/3، P(A∩B)=1/6، احسب الاتحاد"),
    b = await solved("احسب P(B|A)", a.context);
  assert(near(value(b), 1 / 3));
  const c = await solved("احسب متمم B", b.context);
  assert(near(value(c), 2 / 3));
});
await test("LaTeX event notation and fractions normalize correctly", async () => {
  const a = await solved(
    String.raw`P(A)=\frac{1}{2}، P(B)=\frac{1}{3}، P(A\cap B)=\frac{1}{6}، احسب P(A\cup B)`,
  );
  assert(near(value(a), 2 / 3));
});
await test("total-probability tree weights are normalized and path probabilities multiply", async () => {
  const a = await solved("الاحتمال الكلي q=[1/3,2/3]، p=[1/2,1/4]");
  assert(near(value(a), 1 / 3));
  assert(a.results[0].verification.passed);
  const visual = a.results[0].visuals.find((v) => v.kind === "tree");
  assert(visual?.kind === "tree");
  function visit(n: typeof visual.root) {
    if (n.children?.length) {
      assert(sum(n.children.map((c) => exact(c.probability))).eq(ONE));
      n.children.forEach(visit);
    }
  }
  visit(visual.root);
});
await test("Bayes computes posterior weights and reuses a validated mixture", async () => {
  const a = await solved("الاحتمال الكلي q=[1/3,2/3]، p=[1/2,1/4]"),
    b = await solved("بايز، احسب P(H1|B)", a.context);
  assert(near(value(b), 1 / 2));
  assert(b.results[0].verification.passed);
});
await test("different boxes require explicit weights or an explicit equal-selection assumption", async () => {
  const a = await solved(
    "الصندوق الأول فيه 3 حمراء و5 بيضاء، الصندوق الثاني فيه 1 حمراء و3 بيضاء، نختار بالتساوي، احسب احتمال حمراء",
  );
  assert(near(value(a), 5 / 16));
  await rejected(
    "الصندوق الأول فيه 3 حمراء و5 بيضاء، الصندوق الثاني فيه 1 حمراء و3 بيضاء، احسب احتمال حمراء",
  );
});
await test("unnormalized or negative tree weights and impossible Bayes observations fail closed", async () => {
  for (const q of [
    "الاحتمال الكلي q=[1/3,1/3]، p=[1/2,1/4]",
    "الاحتمال الكلي q=[-1,2]، p=[1/2,1/4]",
    "الاحتمال الكلي q=[1/2,1/2]، p=[1.2,1/4]",
    "بايز q=[1/2,1/2]، p=[0,0]، احسب P(H1|B)",
  ])
    await rejected(q);
});

const lawQuestion =
  "المتحول العشوائي X=[0,1,2]، p=[1/4,1/2,1/4]، احسب قانون الاحتمال والأمل والعزم الثاني والتباين والانحراف المعياري";
await test("a complete discrete law exposes E, E2, variance and sigma together", async () => {
  const a = await solved(lawQuestion);
  assert(a.results[0].verification.passed);
  assert.match(a.results[0].finalLatex, /E\(X\).*1/);
  assert.match(a.results[0].finalLatex, /E\(X\^2\)/);
  assert.match(a.results[0].finalLatex, /frac\{1\}\{2\}/);
});
for (const [query, expected] of [
  ["احسب E(X)", 1],
  ["احسب E(X^2)", 1.5],
  ["احسب V(X)", 0.5],
  ["احسب الانحراف المعياري", Math.sqrt(0.5)],
] as const)
  await test(`law moment follow-up: ${query}`, async () => {
    const a = await solved(lawQuestion),
      b = await solved(query, a.context);
    assert(near(value(b), expected));
  });
await test("explicit zero-probability support values are removed, not retained as actual outcomes", async () => {
  const a = await solved("المتحول X=[-1,0,1]، p=[0,1,0]، احسب الأمل والتباين");
  assert.deepEqual(a.context.probability?.law?.values, ["0"]);
});
await test("incomplete, negative, duplicated and nonnormalizable laws are rejected", async () => {
  for (const q of [
    "المتحول X=[0,1]، p=[1/4,1/4]، احسب الأمل",
    "المتحول X=[0,1]، p=[-1,2]، احسب الأمل",
    "المتحول X=[1,1]، p=[1/2,1/2]، احسب الأمل",
    "المتحول X=[0,1,2]، p=[1/2,1/2]، احسب الأمل",
  ])
    await rejected(q);
});
await test("affine transforms aggregate equal output values and update all moments", async () => {
  const a = await solved(lawQuestion),
    b = await solved("احسب قانون Y=2X+1", a.context);
  assert.equal(b.context.probability?.law?.symbol, "Y");
  assert.deepEqual(b.context.probability?.law?.values, ["1", "3", "5"]);
  const c = await solved("احسب V(Y)", b.context);
  assert(near(value(c), 2));
  const d = await solved("احسب قانون Y=0X+7", a.context);
  assert.deepEqual(d.context.probability?.law?.values, ["7"]);
  assert.deepEqual(d.context.probability?.law?.probabilities, ["1"]);
});
await test("nonlinear transforms and missing new law probabilities do not reuse an unrelated old law", async () => {
  const a = await solved(lawQuestion);
  await rejected("احسب قانون Y=X^2", a.context);
  await rejected("المتحول X=[3,4]، احسب الأمل", a.context);
});
await test("a generating polynomial bridges a validated law to the calculus engine", async () => {
  const a = await solved(lawQuestion),
    b = await solved("أنشئ الدالة المولدة الاحتمالية", a.context);
  assert(b.context.expression);
  const c = await solved("جد مشتقة الدالة", b.context);
  assert.equal(c.results[0].engine, "calculusEngine");
  assert(c.results[0].verification.passed);
});
await test("generating-polynomial bridge refuses unsupported support instead of pretending", async () => {
  const a = await solved("المتحول X=[-1,1]، p=[1/2,1/2]، احسب الأمل");
  await rejected("أنشئ الدالة المولدة الاحتمالية", a.context);
});
await test("random-variable independence checks every joint cell against both marginals", async () => {
  const a = await solved(
    "X=[0,1]، Y=[0,1]، J=[[1/4,1/4],[1/4,1/4]]، افحص استقلال المتحولين",
  );
  assert.match(a.results[0].finalLatex, /مستقلان/);
  assert(a.results[0].verification.passed);
});
await test("dependent random variables and structural zeros are not declared independent", async () => {
  const a = await solved(
    "X=[0,1]، Y=[0,1]، J=[[1/2,0],[0,1/2]]، افحص استقلال المتحولين",
  );
  assert.match(a.results[0].finalLatex, /غير مستقل/);
  assert(a.results[0].verification.passed);
});
await test("invalid joint dimensions and total mass are rejected", async () => {
  for (const q of [
    "X=[0,1]، Y=[0,1]، J=[[1/4,1/4]]، افحص استقلال المتحولين",
    "X=[0,1]، Y=[0,1]، J=[[1/2,1/2],[1/2,1/2]]، افحص استقلال المتحولين",
  ])
    await rejected(q);
});

await test("frequency tables use weighted exact statistics and a real histogram", async () => {
  const a = await solved(
    "القيم=[1,2,3]، التكرارات=[2,3,1]، احسب المتوسط والمدرج التكراري",
  );
  assert.match(a.results[0].finalLatex, /frac\{11\}\{6\}/);
  assert(a.results[0].verification.passed);
  const h = a.results[0].visuals.find((v) => v.kind === "histogram");
  assert(h?.kind === "histogram");
  assert.equal(
    h.bins.reduce((s, b) => s + b.value, 0),
    6,
  );
  assert.equal(h.title, "المدرج التكراري");
  assert(!h.discrete);
});
await test("sample and population variance are distinguished; N=1 never yields fake sample variance", () => {
  const v = calculateStatistics({ values: [7] });
  assert.equal(v.variance.text(), "0");
  assert.equal(v.sample, undefined);
  assert(v.steps.some((s) => s.latex.includes("غير معرّف")));
  const w = calculateStatistics({ values: [1, 2, 3] });
  assert.equal(w.variance.text(), "2/3");
  assert.equal(w.sample?.text(), "1");
});
await test("large frequencies do not allocate repeated observations", () => {
  const start = performance.now(),
    v = calculateStatistics({
      values: [-1, 1],
      frequencies: [1000000, 1000000],
    });
  assert.equal(v.mean.text(), "0");
  assert.equal(v.variance.text(), "1");
  assert(v.verification.passed);
  assert(performance.now() - start < 1000);
});
await test("constant and negative data have nonnegative complete histogram bins", async () => {
  for (const data of ["[-5,-5,-5]", "[-10,-5,0,5]"]) {
    const a = await solved("احسب إحصاء البيانات " + data);
    const h = a.results[0].visuals.find((v) => v.kind === "histogram");
    assert(h?.kind === "histogram");
    assert(h.bins.every((b) => b.value >= 0));
    assert(a.results[0].verification.passed);
  }
});
await test("fractional, negative and mismatched frequencies fail closed", async () => {
  for (const q of [
    "القيم=[1,2]، التكرارات=[1.5,2]، احسب الإحصاء",
    "القيم=[1,2]، التكرارات=[-1,2]، احسب الإحصاء",
    "القيم=[1,2]، التكرارات=[1]، احسب الإحصاء",
    "القيم=[1,2]، التكرارات=[0,0]، احسب الإحصاء",
  ])
    await rejected(q);
});
await test("histogram requests are not misrouted to matrix row reduction", async () => {
  const a = await solved("ارسم المدرج التكراري للبيانات [1,2,2,3,4,4]");
  assert.deepEqual(
    a.results.map((r) => r.engine),
    ["probabilityEngine"],
  );
});
await test("frequency tables bridge to matrices and survive subsequent matrix operations", async () => {
  const a = await solved(
    "القيم=[1,2]، التكرارات=[2,3]، حول جدول التكرارات إلى مصفوفة",
  );
  assert.deepEqual(a.context.matrix, [
    [1, 2],
    [2, 3],
  ]);
  const b = await solved("جد محدد المصفوفة", a.context);
  assert.equal(b.results[0].engine, "matricesEngine");
  assert.match(b.results[0].finalLatex, /-1/);
});
await test("a single probability result can be reused in scientific arithmetic", async () => {
  const a = await solved(urnQuestion),
    b = await solved("احسب الاحتمال السابق * 100", a.context);
  assert.equal(b.results[0].engine, "mathEngine");
  assert(near(value(b), 1500 / 28));
});

for (const [cmp, expected] of [
  ["=", 0.3125],
  [">=", 0.8125],
  ["<", 0.1875],
  [">", 0.5],
  ["<=", 0.5],
] as const)
  await test(`binomial tail ${cmp} is explicit and independently verified`, async () => {
    const a = await solved(`التوزيع الثنائي n=5 p=1/2، احسب P(X${cmp}2)`);
    assert(near(value(a), expected));
    assert(a.results[0].verification.passed);
  });
await test("binomial p endpoints and zero trials have actual deterministic support", async () => {
  for (const [n, p, k, expected] of [
    [3, 0, 0, 1],
    [3, 1, 3, 1],
    [3, 1, 2, 0],
    [0, 0.5, 0, 1],
  ]) {
    const a = await solved(`التوزيع الثنائي n=${n} p=${p}، احسب P(X=${k})`);
    assert.equal(value(a), expected);
    assert(a.results[0].verification.passed);
  }
});
await test("large binomial tails are not accumulated from rounded six-decimal rows", async () => {
  const a = await solved("التوزيع الثنائي n=1000 p=0.5، احسب P(X>=500)");
  assert(near(value(a), 0.5126125090891804, 1e-8));
  assert(a.results[0].verification.passed);
});
await test("binomial generating polynomial is reusable by calculus", async () => {
  const a = await solved(
    "التوزيع الثنائي n=5 p=1/3، أنشئ الدالة المولدة الاحتمالية",
  );
  assert(a.context.expression);
  const b = await solved("جد مشتقة الدالة", a.context);
  assert.equal(b.results[0].engine, "calculusEngine");
});
await test("invalid distribution parameters never truncate decimals or round p to an endpoint", async () => {
  for (const q of [
    "التوزيع الثنائي n=12.5 p=.5 k=1",
    "التوزيع الثنائي n=10 p=1.1 k=2",
    "التوزيع الثنائي n=10 p=0.99999999999999999999999999 k=2",
    "التوزيع الطبيعي mu=0 sigma=-1 x=1",
  ])
    await rejected(q);
});
await test("normal curves remain density curves, not frequency histograms", async () => {
  const a = await solved("التوزيع الطبيعي mu=0 sigma=1، احسب P(X<=1)");
  assert(near(value(a), 0.8413447460685429, 1e-6));
  assert(
    a.results[0].visuals.some(
      (v) => v.kind === "curve" && v.title.includes("كثافة"),
    ),
  );
  assert(!a.results[0].verification.passed);
});
await test("normal point probabilities are zero, not cumulative probabilities", async () => {
  const a = await solved("التوزيع الطبيعي mu=0 sigma=1، احسب P(X=1)");
  assert.equal(value(a), 0);
  assert.match(a.results[0].finalLatex, /P\(X=1\)=0/);
});
await test("normal intervals and parameter follow-ups preserve the correct parameters", async () => {
  const a = await solved("التوزيع الطبيعي mu=0 sigma=1 بين -1 و1");
  assert(near(value(a), 0.6826894921370859, 1e-6));
  const b = await solved("التوزيع الطبيعي، احسب P(X>=1)", a.context);
  assert(near(value(b), 0.15865525393145707, 1e-6));
});
await test("counting and theoretical explanations are honest about verification", async () => {
  for (const query of [
    "اشرح الفضاء العيني وأنماط السحب",
    "اشرح قواعد الأحداث",
    "اشرح الاحتمال الشرطي وبايز",
    "اشرح استقلال المتحولين",
    "اشرح شجرة الاحتمالات",
    "اشرح قانون المتحول العشوائي",
  ]) {
    const a = await solved(query);
    assert(!a.results[0].verification.passed);
  }
  const a = await solved("احسب التوافيق n=100 k=30");
  assert(a.results[0].finalLatex.includes("29372339821610944823963760"));
  assert(a.results[0].verification.passed);
});
await test("ordered colour draws compute the joint event rather than a colour-count event", async () => {
  const a = await solved(
    "كيس فيه 3 حمراء و5 بيضاء، سحب كرتين متتاليًا دون إعادة، احسب احتمال أن تكون الأولى حمراء والثانية بيضاء",
  );
  assert(near(value(a), 15 / 56));
  assert(a.results[0].verification.passed);
  assert.equal(a.context.probability?.urnQuery?.type, "ordered");
});
await test("urn conditional events restrict the correct sample space", async () => {
  const a = await solved(
    "كيس فيه 3 حمراء و5 بيضاء، سحب كرتين متتاليًا دون إعادة، احسب احتمال أن تكون الثانية حمراء بشرط أن تكون الأولى بيضاء",
  );
  assert(near(value(a), 3 / 7));
  assert(a.results[0].verification.passed);
  assert(a.results[0].steps.some((s) => s.title === "الفضاء العيني المشروط"));
});
await test("the reverse urn conditional uses the observed second colour", async () => {
  const a = await solved(
    "كيس فيه 3 حمراء و5 بيضاء، سحب كرتين متتاليًا دون إعادة، احسب احتمال أن تكون الأولى حمراء بشرط أن تكون الثانية بيضاء",
  );
  assert(near(value(a), 3 / 7));
});
await test("with replacement, conditioning on the first colour leaves the next marginal unchanged", async () => {
  const a = await solved(
    "كيس فيه 3 حمراء و5 بيضاء، سحب كرتين متتاليًا مع إعادة، احسب احتمال أن تكون الثانية حمراء بشرط أن تكون الأولى بيضاء",
  );
  assert(near(value(a), 3 / 8));
});
await test("conditioning on a zero-count colour and assigning order to simultaneous draws fail closed", async () => {
  await rejected(
    "الألوان=[حمراء:0,بيضاء:5]، r=2، السحب متتاليًا دون إعادة، احسب احتمال أن تكون الثانية بيضاء بشرط أن تكون الأولى حمراء",
  );
  await rejected(
    "الألوان=[حمراء:3,بيضاء:5]، r=2، السحب معًا، احسب احتمال أن تكون الأولى حمراء والثانية بيضاء",
  );
});
await test("one specified draw has its marginal probability, not exactly one colour in the whole sample", async () => {
  const a = await solved(
    "كيس فيه 3 حمراء و5 بيضاء، سحب كرتين متتاليًا دون إعادة، احسب احتمال أن تكون الأولى حمراء",
  );
  assert(near(value(a), 3 / 8));
});
await test("a requested three-colour composition is not reduced to only its first colour", async () => {
  const a = await solved(
    "الألوان=[حمراء:2,بيضاء:2,زرقاء:2]، r=2، السحب معًا، احسب احتمال كرة حمراء وكرة بيضاء",
  );
  assert(near(value(a), 4 / 15));
  assert(a.results[0].verification.passed);
});
await test("complete compositions work for ordered replacement samples and colour aliases", async () => {
  const a = await solved(
    "الألوان=[حمراء:2,بيضاء:3,زرقاء:1]، r=3، السحب متتاليًا مع إعادة، احسب احتمال 2 كرات أحمر و1 كرة أبيض",
  );
  assert(near(value(a), 1 / 6));
  assert(a.results[0].verification.passed);
});
await test("incomplete multiple-colour requests ask instead of silently ignoring a colour", async () => {
  await rejected(
    "الألوان=[حمراء:2,بيضاء:2,زرقاء:2]، r=3، السحب معًا، احسب احتمال كرة حمراء وكرة بيضاء",
  );
});
await test("Arabic punctuation after population colours never deletes the final colour", async () => {
  for (const separator of ["،", "؛", ","]) {
    const q = `كيس فيه 3 حمراء و5 بيضاء${separator} سحب كرتين معًا، احسب احتمال اختلاف اللون`;
    const a = await solved(q);
    assert.equal(a.context.probability?.urn?.colors.length, 2);
    assert(near(value(a), 15 / 28));
  }
});
await test("multi-word custom colours survive the board question bridge", async () => {
  const a = await solved(
    "تجربة سحب: الألوان=[وردي فاتح:2,ذهبي داكن:3]، r=2، السحب معًا، احسب احتمال X=2، اللون المطلوب=ذهبي داكن",
  );
  assert(near(value(a), 3 / 10));
});
await test("classical counts use favorable over total only for equiprobable cases", async () => {
  const a = await solved("الاحتمال الكلاسيكي: n(Ω)=28، n(A)=15، احسب P(A)");
  assert(near(value(a), 15 / 28));
  assert.equal(a.results[0].steps[0].title, "الفضاء العيني");
  await rejected("n(Ω)=28، n(A)=15، احسب P(A)");
});
await test("classical counts cover impossible, certain and complementary events", async () => {
  assert.equal(
    value(await solved("الاحتمال الكلاسيكي n(Ω)=28، n(A)=0، احسب P(A)")),
    0,
  );
  assert.equal(
    value(await solved("الاحتمال الكلاسيكي n(Ω)=28، n(A)=28، احسب P(A)")),
    1,
  );
  const a = await solved("الاحتمال الكلاسيكي n(Ω)=28، n(A)=15، احسب المتمم");
  assert(near(value(a), 13 / 28));
  await rejected("الاحتمال الكلاسيكي n(Ω)=28، n(A)=29، احسب P(A)");
});
await test("a named urn event complement follows the exact event, not a pasted old question", async () => {
  const a = await solved(urnQuestion),
    b = await solved("احسب متمم A", a.context);
  assert(near(value(b), 13 / 28));
  assert.equal(b.context.lastPrompt, "احسب متمم A");
});
await test("negative independence or disjointness statements are not positive assumptions", async () => {
  await rejected("P(A)=1/2، P(B)=1/3، الحدثان غير مستقلين، احسب الاتحاد");
  await rejected("P(A)=1/2، P(B)=1/3، الحدثان غير متنافيين، احسب الاتحاد");
});
await test("complements and symmetric intersections cannot contain contradictory values", async () => {
  await rejected("P(A)=1/2، P(A')=1/3، احسب متمم A");
  await rejected("P(A)=1/2، P(B)=1/3، P(A∩B)=1/6، P(B∩A)=1/5، احسب الاتحاد");
});
await test("equivalent duplicate fractions and arithmetic probability parameters remain valid", async () => {
  const a = await solved("P(A)=1/2، P(A)=0.5، احسب متمم A");
  assert.equal(value(a), 0.5);
  const b = await solved("التوزيع الثنائي n=5 p=1/2+1/4، احسب P(X=5)");
  assert(near(value(b), 0.75 ** 5));
});
await test("Bayes with no requested branch asks rather than silently picking H1", async () => {
  const a = await rejected("بايز q=[1/3,2/3]، p=[1/2,1/4]");
  assert(a.unsolved[0].choices[0].includes("H1"));
  await solved(a.unsolved[0].choices[0], a.context);
});
await test("exact frequency-table fractions retain their lexemes across persistence", async () => {
  const a = await solved("القيم=[1/3,2/3]، التكرارات=[1,2]، احسب المتوسط فقط");
  assert(near(value(a), 5 / 9));
  assert(a.results[0].finalLatex.includes("\\frac{5}{9}"));
  assert.deepEqual(a.context.probability?.statistics?.exactValues, [
    "1/3",
    "2/3",
  ]);
});
await test("scientific reuse retains the exact probability fraction", async () => {
  const a = await solved(urnQuestion);
  assert.equal(a.context.probability?.lastScalarExact, "15/28");
  const b = await solved("احسب الاحتمال السابق * 100", a.context);
  assert.match(b.results[0].finalLatex, /frac\{375\}\{7\}/);
});
await test("underflow cannot turn a positive exact variance into a verified zero deviation", () => {
  const v = calculateLaw({
    symbol: "X",
    values: ["-1e-300", "1e-300"],
    probabilities: ["1/2", "1/2"],
  });
  assert(v.variance.n > 0n);
  assert(v.sigma > 0);
  assert(!v.verification.passed);
});
await test("underflowed binomial tails are approximate and do not gain a fake verification badge", async () => {
  const a = await solved("التوزيع الثنائي n=20 p=1e-30، احسب P(X>=15)");
  assert.equal(value(a), 0);
  assert(!a.results[0].verification.passed);
  assert(a.results[0].note?.includes("الصفر التقريبي"));
});
await test("normal moment follow-ups never reuse an old discrete law", async () => {
  const a = await solved(lawQuestion),
    b = await solved("التوزيع الطبيعي mu=5 sigma=2 x=6", a.context);
  for (const [query, expected] of [
    ["احسب E(X)", 5],
    ["احسب V(X)", 4],
    ["احسب E(X^2)", 29],
  ] as const) {
    const c = await solved(query, b.context);
    assert(near(value(c), expected));
    assert.equal(c.context.probability?.active, "normal");
  }
  const d = await solved("ارسم المنحنى", b.context);
  assert(
    d.results[0].visuals.some(
      (v) => v.kind === "curve" && v.title.includes("كثافة"),
    ),
  );
});
await test("unrepresentable saved law or generating-polynomial size fails safely", async () => {
  await rejected("المتحول X=[0,1]، p=[(1/99)^500,1-(1/99)^500]، احسب الأمل");
  const a = await solved(
    "الألوان=[حمراء:3,بيضاء:5]، r=32، السحب متتاليًا مع إعادة، احسب قانون احتمال عدد الكرات الحمراء",
  );
  await rejected("أنشئ الدالة المولدة الاحتمالية", a.context);
});
await test("probability context validation rejects corrupt saved models and nonfinite visual bins", async () => {
  const a = await solved(lawQuestion);
  assert(isProbabilityContext(a.context.probability));
  assert(!isProbabilityContext({ active: "urn" }));
  assert(
    !isProbabilityContext({ ...a.context.probability, lastScalar: Infinity }),
  );
  assert(
    !isProbabilityContext({
      ...a.context.probability,
      law: { symbol: "X", values: ["alert(1)"], probabilities: ["1"] },
    }),
  );
  const broken = JSON.parse(
    JSON.stringify({
      id: "bad",
      question: a.question,
      createdAt: Date.now(),
      answer: a,
    }),
  );
  broken.answer.results[0].visuals = [
    { kind: "histogram", title: "bad", bins: [{ label: "x", value: -1 }] },
  ];
  assert(!isConversationTurn(broken));
});
await test("unrelated engines are not inherited after probability and statistics turns", async () => {
  let context = (await solved(lawQuestion)).context;
  for (const query of [
    "متتالية حسابية حدها الأول 3 وأساسها 4، جد مجموع أول 20 حدًا",
    "حل المعادلة 2x^2-5x+3=0",
    "احسب المسافة بين P(1,2) وQ(4,6)",
    "جد مشتق f(x)=x^2",
  ]) {
    const a = await solved(query, context);
    assert.notEqual(a.results[0].engine, "probabilityEngine");
    context = a.context;
  }
});

await test("a mixture updates the B binding rather than reusing a different old event B", async () => {
  const a = await solved("P(B)=1/2، احسب متمم B"),
    b = await solved("الاحتمال الكلي q=[1/3,2/3]، p=[1/2,1/4]", a.context),
    c = await solved("احسب متمم B", b.context);
  assert(near(value(c), 2 / 3));
});
await test("ordered conditional urn events expose coherent target and condition bindings", async () => {
  const a = await solved(
      "كيس فيه 3 حمراء و5 بيضاء، سحب كرتين متتاليًا دون إعادة، احسب احتمال أن تكون الثانية حمراء بشرط أن تكون الأولى بيضاء",
    ),
    b = await solved("احسب P(A|B)", a.context);
  assert(near(value(b), 3 / 7));
  assert.deepEqual(a.context.probability?.events, {
    A: "3/8",
    B: "5/8",
    "A&B": "15/56",
  });
});
await test("statistics preserve positive tiny deviation without saving underflowed variance as zero", async () => {
  const a = await solved("القيم=[-1e-200,1e-200]، احسب التباين");
  assert.equal(a.results[0].decimal, undefined);
  assert.equal(a.context.probability?.lastScalar, undefined);
  assert(!a.results[0].verification.passed);
  const b = await solved("احسب الانحراف المعياري", a.context);
  assert(b.results[0].decimal! > 0);
  assert(Math.abs(b.results[0].decimal! / 1e-200 - 1) < 1e-10);
});
console.log(`\nProbability regression: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
