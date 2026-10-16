import assert from "node:assert/strict";
import katex from "katex";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { solvePrompt } from "../src/solver/orchestrator";
import { normalizePrompt } from "../src/solver/parser";
import { answerAsText } from "../src/solver/composer";
import { isConversationTurn } from "../src/solver/validation";
import type {
  EngineId,
  SolverAnswer,
  SolverContext,
} from "../src/solver/types";
import {
  complexValue,
  evaluateScalar,
  verifyPair,
} from "../src/utils/complexMath";
import { RichText } from "../src/components/common/Tex";
import { ResultVisuals } from "../src/components/chat/ResultVisuals";
import { math } from "../src/solver/math";

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
  for (const result of answer.results) {
    const expressions = [
      result.finalLatex,
      ...result.steps.map((step) => step.latex),
      ...result.visuals.flatMap((v) =>
        v.kind === "table"
          ? [v.latex]
          : v.kind === "formula-cards"
            ? v.cards.map((card) => card.latex)
            : [],
      ),
    ];
    for (const expression of expressions) {
      assert(!expression.includes("${"), "No escaped interpolation in math");
      katex.renderToString(expression, { throwOnError: true, strict: false });
    }
    const rendered = renderToStaticMarkup(
      createElement(ResultVisuals, { result }),
    );
    assert(!/NaN|Infinity|katex-error/.test(rendered));
  }
  assert(
    isConversationTurn(
      JSON.parse(
        JSON.stringify({
          id: "cx-test",
          question: answer.question,
          answer,
          createdAt: Date.now(),
        }),
      ),
    ),
    "Result, formulas, edges and context must survive guarded persistence",
  );
}
async function solved(
  question: string,
  context?: SolverContext,
  engine: EngineId = "complexEngine",
  mode: "DEG" | "RAD" | "GRAD" = "DEG",
) {
  const answer = await solvePrompt(question, { angleMode: mode, context });
  assert.equal(answer.unsolved.length, 0, JSON.stringify(answer.unsolved));
  assert.deepEqual(
    answer.results.map((r) => r.engine),
    [engine],
  );
  validate(answer);
  return answer;
}
async function clarified(question: string, context?: SolverContext) {
  const answer = await solvePrompt(question, { angleMode: "DEG", context });
  assert.equal(answer.results.length, 0, JSON.stringify(answer.results));
  assert(answer.unsolved.length > 0);
  validate(answer);
  return answer;
}
function current(answer: SolverAnswer) {
  assert(answer.context.complex?.current);
  return complexValue(answer.context.complex.current);
}
function approximately(actual: number, expected: number) {
  assert(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
}

await test("Arabic normalization preserves the name De Moivre, not the spoken بدي prefix", () => {
  assert(normalizePrompt("بسط cos(3theta) بديموافر").includes("بديموافر"));
  assert(normalizePrompt("بدي مشتق سين تربيع").includes("جد مشتق x^2"));
});
await test("all three forms have a principal argument and independent reconstruction", async () => {
  const answer = await solved("اكتب الأشكال الثلاثة للعدد العقدي z=1+i");
  const result = answer.results[0];
  assert(result.verification.passed);
  assert.match(result.finalLatex, /e\^\{i\\theta\}/);
  assert.match(result.finalLatex, /frac\{\\pi\}\{4\}/);
  assert.equal(
    result.visuals.find((v) => v.kind === "formula-cards")?.cards.length,
    3,
  );
});
await test("all quadrants, axes, irrational and rational coordinates preserve their signs", async () => {
  for (const expression of [
    "-1+i",
    "-1-i",
    "1-i",
    "-3",
    "-2i",
    "sqrt(2)+sqrt(2)*i",
    "1/2+i/3",
  ]) {
    const answer = await solved(`اكتب أشكال العدد العقدي z=${expression}`);
    assert(answer.results[0].verification.passed, expression);
    const value = current(answer);
    assert(value.angle);
    const angle = evaluateScalar(value.angle);
    assert(angle > -Math.PI - 1e-12 && angle <= Math.PI + 1e-12);
  }
});
await test("zero has no argument, no division by its norm, and no imaginary invented angle", async () => {
  const answer = await solved("اكتب الأشكال الثلاثة للعدد العقدي z=0");
  assert(!current(answer).angle);
  assert(answer.results[0].steps.some((s) => s.latex.includes("غير معرّفة")));
  assert(answer.results[0].verification.passed);
});
await test("Euler exponential is decomposed into exact real and imaginary pairs", async () => {
  const answer = await solved("احسب e^(i*pi/3) باستخدام قانون أويلر");
  approximately(current(answer).re, 0.5);
  approximately(current(answer).im, Math.sqrt(3) / 2);
  assert(answer.results[0].verification.passed);
});
await test("Euler handles a nonunit coefficient and explicit degrees even under RAD", async () => {
  const answer = await solved(
    "احسب بقانون أويلر theta=60° وr=2",
    undefined,
    "complexEngine",
    "RAD",
  );
  approximately(current(answer).re, 1);
  approximately(current(answer).im, Math.sqrt(3));
});
await test("Euler formula, prerequisites and reverse trigonometric identities are accessible", async () => {
  const answer = await solved("اشرح قانون أويلر");
  assert.match(answer.results[0].finalLatex, /e\^\{i\\theta\}/);
  assert(answer.results[0].steps.some((s) => s.text?.includes("بالراديان")));
  assert(!answer.results[0].verification.passed);
});
await test("Euler rejects a negative magnitude, nonreal angle and missing angle", async () => {
  await clarified("احسب بقانون أويلر theta=60° وr=-2");
  await clarified("احسب بقانون أويلر theta=i وr=2");
  await clarified("احسب بقانون أويلر r=2");
});
await test("algebraic to exponential conversion is not mistaken for an equation", async () => {
  const answer = await solved("حوّل العدد الجبري z=3+4i إلى الشكل الأسي");
  assert.match(answer.results[0].finalLatex, /5e/);
  assert.match(answer.results[0].finalLatex, /arctan/);
});
await test("large powers never expand n+1 or round before exact angle reduction", async () => {
  for (const question of [
    "احسب (1+i)^2024 بديموافر",
    "احسب z^2024 حيث z=1+i",
    "احسب z^n بديموافر حيث z=1+i وn=2024",
    "احسب (((1+i)^2024)) بديموافر",
  ]) {
    const answer = await solved(question);
    assert.match(answer.results[0].finalLatex, /2.*1012/);
    assert(answer.results[0].finalLatex.length < 100);
    assert(answer.results[0].verification.passed);
  }
});
await test("trillion-scale exponents use exact integer arithmetic for rational-pi phases", async () => {
  const answer = await solved("احسب i^999999999997 بديموافر");
  assert.match(answer.results[0].finalLatex, /=i$/);
  assert(answer.results[0].verification.passed);
});
await test("symbolic overflow remains an exact answer without a fabricated numeric badge", async () => {
  const answer = await solved("احسب (3+4i)^1000000 بديموافر");
  assert.match(answer.results[0].finalLatex, /1000000/);
  assert(!answer.results[0].verification.passed);
  assert(answer.results[0].note?.includes("رمزية"));
  assert(!/Infinity|NaN/.test(JSON.stringify(answer)));
});
await test("small powers which exceed the coordinate budget fall back to polar form", async () => {
  const answer = await solved("احسب (10^20+i)^16 بديموافر");
  assert.match(answer.results[0].finalLatex, /z\^\{16\}/);
  assert(answer.results[0].finalLatex.length < 3000);
});
await test("negative, zero, and zero-base powers respect domain restrictions", async () => {
  const inverse = await solved("احسب (1+i)^(-2) بديموافر");
  approximately(current(inverse).re, 0);
  approximately(current(inverse).im, -0.5);
  const identity = await solved("احسب (1+i)^0 بديموافر");
  approximately(current(identity).re, 1);
  await clarified("احسب 0^0 بديموافر");
  await clarified("احسب 0^(-2) بديموافر");
  const zero = await solved("احسب 0^2024 بديموافر");
  assert.match(zero.results[0].finalLatex, /=0$/);
});
await test("missing bases, fractional powers and oversized exponents ask for clarification", async () => {
  await clarified("احسب القوة 2024 بديموافر");
  await clarified("احسب (1+i)^1.5 بديموافر");
  await clarified("احسب i^1000000000001.5 بديموافر");
  await clarified("احسب i^10000000000000 بديموافر");
});
await test("De Moivre expands multiple angles with correctly grouped powers of cosine", async () => {
  const answer = await solved("بسط cos(3theta) وsin(3theta) بديموافر");
  const result = answer.results[0];
  assert(result.verification.passed);
  assert.equal(result.verification.samples, 10);
  assert.match(result.finalLatex, /cos.*right\)\^\{3\}/);
  assert(!/cos\\theta\^\{3\}/.test(result.finalLatex));
});
await test("Euler lowers odd and even sine/cosine powers with correct signs", async () => {
  for (const fn of ["cos", "sin"])
    for (const n of [1, 2, 3, 4, 7, 12]) {
      const answer = await solved(`بسط ${fn}(theta)^${n} باستخدام أويلر`);
      assert(answer.results[0].verification.passed, `${fn}^${n}`);
    }
});
await test("mathematical LaTeX powers and x rather than theta are also typeset", async () => {
  const answer = await solved(String.raw`بسط \cos^{3}\theta باستخدام أويلر`);
  assert.match(answer.results[0].finalLatex, /cos\^\{3\}/);
  const x = await solved("بسط cos(3x) وsin(3x) بديموافر");
  assert.match(x.results[0].finalLatex, /cos x/);
});
await test("unsupported or mixed trigonometric orders do not produce invented identities", async () => {
  await clarified("بسط cos(13theta) بديموافر");
  await clarified("بسط cos(3theta) وsin(4theta) بديموافر");
});
await test("all four complex arithmetic operations are exact and individually checked", async () => {
  const answer = await solved("احسب العمليات الجبرية للعددين z1=3+2i وz2=1-i");
  const result = answer.results[0];
  assert.equal(result.verification.samples, 4);
  assert(result.verification.passed);
  assert.match(result.finalLatex, /4 \+ i/);
  assert.match(result.finalLatex, /2 \+ 3i/);
  assert.match(result.finalLatex, /5 - i/);
  assert.match(result.finalLatex, /frac\{5\}\{2\}i/);
  assert(
    !answer.context.complex?.current,
    "Multiple results must not silently pick the last one",
  );
});
await test("natural Arabic multiplication and explicit operand order work", async () => {
  const product = await solved("اضرب (1+i) و(1-i)");
  approximately(current(product).re, 2);
  const subtraction = await solved("اطرح z1 من z2 حيث z1=3+2i وz2=1-i");
  approximately(current(subtraction).re, -2);
  approximately(current(subtraction).im, -3);
  const division = await solved("اقسم z2 على z1 حيث z1=3+2i وz2=1-i");
  approximately(current(division).re, 1 / 13);
  approximately(current(division).im, -5 / 13);
});
await test("division by zero is clarified; other requested operations survive", async () => {
  await clarified("اقسم العددين العقديين z1=1+i وz2=0");
  const answer = await solved("احسب العمليات الجبرية للعددين z1=1+i وz2=0");
  assert.equal(answer.results[0].verification.samples, 3);
  assert(answer.results[0].note?.includes("الصفر"));
});
await test("conjugate, inverse and direct conj syntax are correct", async () => {
  const conjugate = await solved("جد مرافق العدد العقدي z=3+4i");
  approximately(current(conjugate).im, -4);
  const inverse = await solved("جد مقلوب العدد العقدي 3+4i");
  approximately(current(inverse).re, 3 / 25);
  approximately(current(inverse).im, -4 / 25);
  const direct = await solved("اكتب أشكال العدد العقدي conj(3+4i)");
  approximately(current(direct).im, -4);
});
await test("point and vector representations link to M(x,y) with arrowed geometry", async () => {
  const point = await solved("مثل العدد العقدي z=3+4i");
  assert.match(point.results[0].finalLatex, /M\(3,4\)/);
  const visual = point.results[0].visuals.find((v) => v.kind === "complex");
  assert(visual?.connections?.some((e) => e.arrow));
  assert(point.results[0].verification.passed);
  const points = await solved("مثل النقطتين A(1,2) وB(4,6) في المستوي العقدي");
  assert.match(points.results[0].finalLatex, /overrightarrow\{AB\}.*\(3,4\)/);
});
await test("distance is the norm of the difference, for affixes or ordinary 2D coordinates", async () => {
  for (const question of [
    "احسب المسافة بين z_A=1+2i وz_B=4+6i",
    "احسب المسافة بين A(1,2) وB(4,6)",
    "احسب المسافة بين z1=1+2i وz2=4+6i",
  ]) {
    const answer = await solved(question);
    assert.match(answer.results[0].finalLatex, /AB=.*=5$/);
    assert(answer.results[0].verification.passed);
  }
});
await test("named segment order is explicit and incomplete geometry asks for data", async () => {
  const answer = await solved(
    "احسب المسافة AB في المستوي العقدي z_B=4+6i وz_A=1+2i",
  );
  assert.match(answer.results[0].finalLatex, /^AB=/);
  await clarified("احسب المسافة بين نقطتين عقديتين z_A=1+i");
});
await test("ratio arguments use the requested point names, signs and nonzero guards", async () => {
  const answer = await solved(
    "احسب الزاوية بين z_P=1 وz_Q=-i في المستوي العقدي",
  );
  assert.match(answer.results[0].finalLatex, /z_Q.*z_P/);
  assert(answer.results[0].verification.passed);
  assert.match(answer.results[0].finalLatex, /-\\frac\{\\pi\}\{2\}/);
  await clarified("احسب الزاوية بين z_A=0 وz_B=i في المستوي العقدي");
});
await test("three-point angles use the correct vertex, not the origin", async () => {
  const answer = await solved(
    "احسب زاوية BAC في المستوي العقدي z_A=1+i وz_B=2+i وz_C=1+2i",
  );
  assert.match(answer.results[0].finalLatex, /z_C-z_A.*z_B-z_A/);
  assert(answer.results[0].verification.passed);
  assert.match(answer.results[0].finalLatex, /frac\{\\pi\}\{2\}/);
});
await test("translation is z+b and its displacement is drawn as a vector, not a center", async () => {
  const answer = await solved("انسحاب z=1+i بشعاع b=2-i");
  approximately(current(answer).re, 3);
  approximately(current(answer).im, 0);
  assert(
    answer.results[0].visuals
      .find((v) => v.kind === "complex")
      ?.points.some((p) => p.label === "O"),
  );
});
await test("homothety handles negative and zero real ratios around a nonzero center", async () => {
  const negative = await solved("تحاكي z=2+i مركزه omega=1 ونسبته k=-2");
  approximately(current(negative).re, -1);
  approximately(current(negative).im, -2);
  const zero = await solved("تحاكي z=2+i مركزه omega=1 ونسبته k=0");
  approximately(current(zero).re, 1);
  approximately(current(zero).im, 0);
  await clarified("تحاكي z=1+i مركزه omega=0 ونسبته k=i");
});
await test("rotation handles degree/radian/grad units independently of the setting", async () => {
  for (const [angle, mode] of [
    ["90 درجة", "RAD"],
    ["pi/2", "DEG"],
    ["100 grad", "RAD"],
    ["90 deg", "RAD"],
  ] as const) {
    const answer = await solved(
      `دوران z=1+i حول المبدأ بزاوية ${angle}`,
      undefined,
      "complexEngine",
      mode,
    );
    approximately(current(answer).re, -1);
    approximately(current(answer).im, 1);
    assert(answer.results[0].verification.passed);
    assert(answer.results[0].visuals.find((v) => v.kind === "complex")?.circle);
  }
});
await test("rotation does not mistake the angle fragment for the point", async () => {
  const answer = await solved("دوران z=1+i حول omega=1 بزاوية pi/2");
  approximately(current(answer).re, 0);
  approximately(current(answer).im, 0);
  const centered = await solved("دوران omega=1 وz=2+i بزاوية pi/2");
  approximately(current(centered).re, 0);
  approximately(current(centered).im, 1);
});
await test("an explicit origin overrides an old transformation center", async () => {
  const previous = await solved("تحاكي z=2+i مركزه omega=1 ونسبته k=-2");
  const answer = await solved(
    "دوران z=1+i حول المبدأ بزاوية 90 درجة",
    previous.context,
  );
  approximately(current(answer).re, -1);
  approximately(current(answer).im, 1);
  const next = await solved(
    "دوران حول نفس المركز بزاوية 90 درجة",
    answer.context,
  );
  approximately(current(next).re, -1);
  approximately(current(next).im, -1);
  await clarified("دوران z=1+i حول المبدأ مركزه omega=1 بزاوية 90 درجة");
});
await test("missing transformation data never invent a point, center, angle or coefficient", async () => {
  for (const question of [
    "انسحاب بشعاع b=2-i",
    "دوران z=1+i بزاوية 90°",
    "دوران z=1+i حول المبدأ",
    "تحاكي z=1+i مركزه omega=0",
    "انسحاب z=1+i",
  ])
    await clarified(question);
});
await test("general transformation laws are rendered without fabricated numeric verification", async () => {
  for (const name of ["الانسحاب", "التحاكي", "الدوران"]) {
    const answer = await solved(`اشرح قانون ${name} في المستوي العقدي`);
    assert(!answer.results[0].verification.passed);
  }
});
await test("nth roots use independent repeated squaring, including nontrivial orders", async () => {
  for (const n of [2, 3, 7, 16, 32]) {
    const answer = await solved(`جد جذور العدد العقدي 1+i حيث n=${n}`);
    assert.equal(answer.results[0].verification.samples, n);
    assert(answer.results[0].verification.passed);
    assert.equal(
      answer.results[0].visuals.find((v) => v.kind === "complex")?.points
        .length,
      n,
    );
    assert(answer.results[0].visuals.find((v) => v.kind === "complex")?.circle);
  }
});
await test("zero roots, invalid ranks and ambiguous root follow-ups are safe", async () => {
  const zero = await solved("جد جذور العدد العقدي 0 حيث n=7");
  assert.match(zero.results[0].finalLatex, /w=0/);
  await clarified("جد جذور العدد العقدي 1+i حيث n=33");
  const roots = await solved("جد الجذور التربيعية للعدد العقدي 1+i");
  await clarified("جد مرافقه", roots.context);
});
await test("negative real discriminant is impossible in R, not silently solved in C", async () => {
  const answer = await solved(
    "حل المعادلة x^2+1=0 في الأعداد الحقيقية",
    undefined,
    "equationSolver",
  );
  assert.match(answer.results[0].finalLatex, /varnothing.*مستحيلة الحل/);
  assert(
    answer.results[0].steps.some(
      (s) => s.latex.includes("\\Delta") && s.latex.includes("<0"),
    ),
  );
  assert(!/i\b/.test(answer.results[0].finalLatex));
  assert(!answer.results[0].verification.passed);
  const follow = answer.suggestions.find((s) => s.includes("العقدية"));
  assert(follow);
  assert(!follow.includes("الحقيقية"));
  await solved(follow, answer.context, "complexTools");
});
await test("the real-domain instruction overrides z; C instruction overrides x", async () => {
  const real = await solved(
    "حل المعادلة z^2+1=0 في R",
    undefined,
    "equationSolver",
  );
  assert.match(real.results[0].finalLatex, /مستحيلة الحل/);
  const complex = await solved(
    "حل المعادلة x^2+1=0 في C",
    undefined,
    "complexTools",
  );
  assert(complex.results[0].verification.passed);
  assert.match(complex.results[0].finalLatex, /i/);
});
await test("complex quadratics accept genuinely complex coefficients and discriminants", async () => {
  for (const expression of [
    "z^2+2z+5=0",
    "z^2+(1+i)*z+i=0",
    "z^2+i=0",
    "i*z^2+z+1=0",
  ]) {
    const answer = await solved(
      `حل المعادلة ${expression} في الأعداد العقدية`,
      undefined,
      "complexTools",
    );
    assert(answer.results[0].verification.passed);
    assert(answer.results[0].steps.some((s) => s.latex.includes("\\Delta")));
  }
});
await test("complex linear, double-root, identity, contradiction and real cubic separation", async () => {
  for (const expression of ["i*z+1=0", "z^2+2z+1=0", "z-z=0", "z-z=1"])
    await solved(
      `حل المعادلة ${expression} في الأعداد العقدية`,
      undefined,
      "complexTools",
    );
  const real = await solved(
    "حل المعادلة x^3+1=0 في الأعداد الحقيقية",
    undefined,
    "equationSolver",
  );
  assert(!/i\b/.test(real.results[0].finalLatex));
});
await test("complex follow-ups operate on the latest result and reuse explicitly named points", async () => {
  const forms = await solved("اكتب الأشكال الثلاثة للعدد العقدي z=1+i");
  assert(forms.suggestions.includes("جد مرافقه"));
  const conjugate = await solved("جد مرافقه", forms.context);
  approximately(current(conjugate).im, -1);
  const power = await solved("احسب قوته 2 بديموافر", conjugate.context);
  approximately(current(power).im, -2);
  const distance = await solved("احسب المسافة بين A(1,2) وB(4,6)");
  const angle = await solved(
    "احسب الزاوية بين الشعاعين في المستوي العقدي",
    distance.context,
  );
  assert(angle.results[0].verification.passed);
});
await test("compound complex requests share context and preserve partial successes", async () => {
  const answer = await solvePrompt(
    "اكتب الأشكال الثلاثة للعدد العقدي z=1+i ثم جد مرافقه ثم دوران حول المبدأ",
    { angleMode: "DEG" },
  );
  assert.equal(answer.results.length, 2);
  assert.equal(answer.unsolved.length, 1);
  assert(answer.unsolved[0].message.includes("زاوية"));
  validate(answer);
});
await test("unrelated old points do not contaminate a new two-point question", async () => {
  const previous = await solved(
    "مثل النقطتين A(0,0) وB(1,1) والنقطة C(3,3) في المستوي العقدي",
  );
  const answer = await solved(
    "احسب المسافة بين P(1,2) وQ(4,6)",
    previous.context,
  );
  assert.match(answer.results[0].finalLatex, /^PQ=.*=5$/);
});
await test("geometry follow-ups use the latest active pair, not unrelated cached points", async () => {
  const previous = await solved(
    "مثل النقطتين A(0,0) وB(1,1) والنقطة C(3,3) في المستوي العقدي",
  );
  const distance = await solved(
    "احسب المسافة بين P(1,2) وQ(4,6)",
    previous.context,
  );
  const follow = await solved(
    "احسب المسافة بين النقطتين في المستوي العقدي",
    distance.context,
  );
  assert.match(follow.results[0].finalLatex, /^PQ=.*=5$/);
  await clarified(
    "احسب المسافة بين النقاط في المستوي العقدي",
    previous.context,
  );
});
await test("a single-number plotting follow-up does not draw an old point group", async () => {
  const previous = await solved(
    "مثل النقطتين A(1,2) وB(4,6) في المستوي العقدي",
  );
  const forms = await solved("اكتب أشكال العدد العقدي z=1+i", previous.context);
  const point = await solved("مثله في المستوي العقدي", forms.context);
  assert.match(point.results[0].finalLatex, /M\(1,1\)/);
  const visual = point.results[0].visuals.find((v) => v.kind === "complex");
  assert.equal(visual?.points.length, 2);
  assert(
    visual.points.some((p) => p.label === "M" && p.re === 1 && p.im === 1),
  );
});
await test("pair arithmetic matches independently evaluated expressions over a varied grid", () => {
  for (let a = -3; a <= 3; a++)
    for (let b = -2; b <= 2; b++) {
      for (const expression of [
        `(${a}+${b}*i)*(2-i)`,
        `(${a}+${b}*i)/(2+i)`,
        `exp(i*pi/3)*(${a}+${b}*i)`,
        `sqrt(${a}+${b}*i)`,
      ]) {
        const actual = complexValue(expression),
          expected: unknown = math.evaluate(expression);
        const pair =
          typeof expected === "number"
            ? { re: expected, im: 0 }
            : math.isComplex(expected)
              ? expected
              : { re: NaN, im: NaN };
        approximately(actual.re, pair.re);
        approximately(actual.im, pair.im);
      }
    }
});
await test("nonfinite independent values and overflowing norms never get false badges", () => {
  assert(
    !verifyPair({ r: "1", i: "0" }, { re: Infinity, im: 0 }, "test").passed,
  );
  assert(
    !verifyPair({ r: "0", i: "0" }, { re: 1e308, im: 1e308 }, "test").passed,
  );
  assert(
    verifyPair({ r: "1e308", i: "1e308" }, { re: 1e308, im: 1e308 }, "test")
      .passed,
  );
});
await test("unsupported unary operators and recursive aliases do not fabricate arithmetic", async () => {
  await clarified("اكتب أشكال العدد العقدي 5!+i");
  await clarified("اكتب أشكال العدد العقدي z=z+1");
});
await test("formula cards, circle metadata, edge indices and context are persistence-guarded", async () => {
  const answer = await solved("دوران z=1+i حول المبدأ بزاوية 90°");
  const turn = {
    id: "guard",
    question: answer.question,
    answer,
    createdAt: Date.now(),
  };
  const bad = JSON.parse(JSON.stringify(turn));
  bad.answer.results[0].visuals[0].connections[0].to = 999;
  assert(!isConversationTurn(bad));
  const circle = JSON.parse(JSON.stringify(turn));
  circle.answer.results[0].visuals[0].circle.radius = -1;
  assert(!isConversationTurn(circle));
  const ctx = JSON.parse(JSON.stringify(turn));
  ctx.answer.context.complex.values.z = "i".repeat(901);
  assert(!isConversationTurn(ctx));
});
await test("complex follow-up questions render Greek symbols and functions, not raw theta syntax", () => {
  const html = renderToStaticMarkup(
    createElement(RichText, {
      text: "بسط cos(3theta) وsin(3theta) بديموافر",
      autoMath: true,
    }),
  );
  assert(html.includes('class="katex"'));
  assert(!html.includes("katex-error"));
  assert(html.includes("θ"));
});
await test("copied answers contain valid single-backslash display delimiters", async () => {
  const answer = await solved("اكتب أشكال العدد العقدي z=1+i");
  const text = answerAsText(answer);
  assert(text.includes(String.raw`\[`));
  assert(!text.split("\n").some((line) => line.startsWith(String.raw`\\[`)));
});

console.log(`\nComplex regression: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
