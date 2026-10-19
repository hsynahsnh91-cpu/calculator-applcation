import assert from "node:assert/strict";
import katex from "katex";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { solvePrompt } from "../../src/core/solver/orchestrator";
import {
  normalizePrompt,
  parsePrompt,
  decodeLatex,
} from "../../src/core/solver/parser";
import {
  emptyContext,
  type SolverAnswer,
  type SolverContext,
  type EngineId,
} from "../../src/core/solver/types";
import { verifyDerivative } from "../../src/core/solver/math";
import { isConversationTurn } from "../../src/core/solver/validation";
import { RichText } from "../../src/components/common/Tex";
import { localDB } from "../../src/app/storage/localDB";

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
    for (const latex of [
      result.finalLatex,
      ...result.steps.map((step) => step.latex),
      ...result.visuals.flatMap((visual) =>
        visual.kind === "table"
          ? [visual.latex]
          : visual.kind === "formula-cards"
            ? visual.cards.map((card) => card.latex)
            : [],
      ),
    ]) {
      katex.renderToString(latex, { throwOnError: true, strict: false });
    }
  }
  assert(
    isConversationTurn(
      JSON.parse(
        JSON.stringify({
          id: "test",
          question: answer.question,
          answer,
          createdAt: Date.now(),
        }),
      ),
    ),
    "Solver output must survive guarded persistence",
  );
}
async function solved(
  question: string,
  engine?: EngineId,
  context?: SolverContext,
) {
  const answer = await solvePrompt(question, { angleMode: "DEG", context });
  assert(answer.results.length > 0, JSON.stringify(answer.unsolved));
  assert.equal(answer.unsolved.length, 0, JSON.stringify(answer.unsolved));
  if (engine)
    assert.deepEqual(
      answer.results.map((result) => result.engine),
      [engine],
    );
  validate(answer);
  return answer;
}
export const acceptance: {
  question: string;
  engine: EngineId;
  final: RegExp;
  decimal?: number;
}[] = [
  {
    question: "جد مشتق f(x)=x^3-3x+1 ونظّم جدول تغيراته",
    engine: "calculusEngine",
    final: /3.*x.*2.*-3/,
  },
  {
    question: "حل المعادلة 2x^2-5x+3=0",
    engine: "equationSolver",
    final: /frac\{3\}\{2\}.*= 1/,
  },
  {
    question: "احسب تكامل x e^x من 0 إلى 1",
    engine: "integrationEngine",
    final: /= 1$/,
    decimal: 1,
  },
  {
    question: "جد نهاية (x^2-1)/(x-1) عندما x تؤول إلى 1",
    engine: "limitsEngine",
    final: /= 2/,
  },
  {
    question: "جد محدد ومقلوب المصفوفة [[1,2],[3,4]]",
    engine: "matricesEngine",
    final: /det A = -2.*A\^\{-1\}/,
  },
  {
    question: "حل المعادلة z^2+2z+5=0 في مجموعة الأعداد العقدية",
    engine: "complexTools",
    final: /-1 \+ 2i.*-1 - 2i/,
  },
  {
    question:
      "كيس فيه 3 كرات حمراء و5 بيضاء سُحبت كرتان معًا، جد احتمال أن تكونا مختلفتي اللون",
    engine: "probabilityEngine",
    final: /frac\{15\}\{28\}/,
    decimal: 15 / 28,
  },
  {
    question: "متتالية حسابية حدها الأول 3 وأساسها 4، جد مجموع أول 20 حدًا",
    engine: "sequences",
    final: /820/,
    decimal: 820,
  },
  {
    question: "جد المسافة بين النقطة A(1,2,3) والمستوي 2x-y+2z-5=0",
    engine: "geometryEngine",
    final: /frac\{1\}\{3\}/,
    decimal: 1 / 3,
  },
  {
    question: "احسب sin(30°)+√2",
    engine: "mathEngine",
    final: /sqrt\{2\}.*frac\{1\}\{2\}/,
    decimal: 0.5 + Math.SQRT2,
  },
];
for (const [index, item] of acceptance.entries())
  await test(`acceptance ${index + 1}: sole input → ${item.engine}`, async () => {
    const answer = await solved(item.question, item.engine);
    assert.match(answer.results[0].finalLatex, item.final);
    assert(answer.results[0].verification.passed);
    if (item.decimal !== undefined)
      assert(Math.abs(Number(answer.results[0].decimal) - item.decimal) < 1e-8);
  });
await test("the ten different questions do not inherit unrelated engines", async () => {
  let context = emptyContext();
  for (const item of acceptance) {
    const answer = await solved(item.question, item.engine, context);
    context = answer.context;
  }
});
await test("Arabic and Persian numerals", async () => {
  await solved("حل المعادلة ٢x^٢-٥x+٣=٠", "equationSolver");
  await solved("حل المعادلة ۲x^۲-۵x+۳=۰", "equationSolver");
});
await test("Syrian spoken variables, powers, and numbers", async () => {
  const answer = await solved(
    "اشتقلي اكس اس تلاتة ناقص ثلاثة اكس زائد واحد",
    "calculusEngine",
  );
  assert.match(answer.results[0].finalLatex, /3.*x.*2.*-3/);
});
await test("spoken scientific arithmetic", async () => {
  const answer = await solved("بدي احسب خمسة زائد جذر اثنين", "mathEngine");
  assert(Math.abs(Number(answer.results[0].decimal) - (5 + Math.SQRT2)) < 1e-8);
});
await test("balanced nested LaTeX normalization", () => {
  assert.match(decodeLatex("\\frac{1+\\sqrt{x}}{x^{2}+1}"), /sqrt\(x\)/);
  assert.match(normalizePrompt("\\(\\frac{x^2-1}{x-1}\\)"), /x\^2-1/);
});
await test("formatted definite integral, limit notation, and degree exponent", async () => {
  const integral = await solved(
    "احسب \\(\\int_{0}^{2} x\\,dx\\)",
    "integrationEngine",
  );
  assert.equal(integral.results[0].decimal, 2);
  const limit = await solved(
    "جد \\(\\lim_{x\\to1} \\frac{x^2-1}{x-1}\\)",
    "limitsEngine",
  );
  assert.match(limit.results[0].finalLatex, /= 2/);
  const trig = await solved(
    "احسب \\(\\sin(30^{\\circ})+\\sqrt{2}\\)",
    "mathEngine",
  );
  assert(Math.abs(Number(trig.results[0].decimal) - 0.5 - Math.SQRT2) < 1e-8);
});
await test("MathLive exponent islands stay valid solver input", async () => {
  const answer = await solved(
    "جد مشتق f(x)=\\(x^{3}\\)-3x+1",
    "calculusEngine",
  );
  assert.match(answer.results[0].finalLatex, /3.*x.*2.*-3/);
});
await test("letter-enumerated compound, shared definition, and propagated derivative", async () => {
  const question =
    "لتكن f(x)=x^2\nأ) جد مشتقتها\nب) احسب تكامل مشتقتها من 0 إلى 1\nج) ارسم المنحنى";
  assert.equal(parsePrompt(question).requests.length, 4);
  const answer = await solved(question);
  assert.deepEqual(
    answer.results.map((result) => result.engine),
    ["calculusEngine", "integrationEngine", "calculusEngine"],
  );
  assert.equal(answer.results[1].decimal, 1);
});
await test("numeric enumeration and partial failures preserve successful parts", async () => {
  const answer = await solvePrompt(
    "1) حل المعادلة x^2-1=0\n2) احسب تكامل 1/x من -1 إلى 1\n3) جد محدد المصفوفة [[1,2],[3,4]]",
    { angleMode: "RAD" },
  );
  assert.equal(answer.results.length, 2);
  assert.equal(answer.unsolved.length, 1);
  assert.deepEqual(
    answer.results.map((result) => result.engine),
    ["equationSolver", "matricesEngine"],
  );
  validate(answer);
});
await test("inline enumerated requests", async () => {
  const answer = await solved("1) حل المعادلة x+1=0 2) احسب 2+2");
  assert.equal(answer.results.length, 2);
});
await test("parallel calculus and integral use the same function", async () => {
  const progress: number[] = [];
  const answer = await solvePrompt(
    "جد مشتق f(x)=x^2 وتكاملها من 0 إلى 1",
    { angleMode: "RAD" },
    (value) => {
      if (value.results) progress.push(value.results.length);
    },
  );
  assert.equal(answer.results.length, 2);
  assert.equal(answer.unsolved.length, 0);
  assert(
    Math.abs(
      Number(
        answer.results.find((result) => result.engine === "integrationEngine")
          ?.decimal,
      ) -
        1 / 3,
    ) < 1e-8,
  );
  assert(progress.includes(2), "Progress must retain all completed engines");
  validate(answer);
});
await test("follow-up curve, primitive, and explanation share context", async () => {
  const first = await solved("جد مشتق f(x)=x^2+1", "calculusEngine");
  const curve = await solved("ارسم المنحنى", "calculusEngine", first.context);
  assert.equal(curve.context.expression, first.context.expression);
  const integral = await solved(
    "أوجد الدالة الأصلية للدالة",
    "integrationEngine",
    curve.context,
  );
  const details = await solved(
    "اشرح الخطوات بتفصيل أكثر",
    "integrationEngine",
    integral.context,
  );
  assert.equal(details.context.expression, first.context.expression);
});
await test("assignments are shared and applied in sequential order", async () => {
  const answer = await solved("a=2؛ احسب a^2؛ a=3؛ احسب a^2");
  assert.deepEqual(
    answer.results.map((result) => Number(result.decimal)),
    [4, 9],
  );
});
await test("assigned polynomial coefficient reaches the equation engine", async () => {
  const answer = await solved("a=2؛ حل المعادلة ax+4=0", "equationSolver");
  assert.match(answer.results[0].finalLatex, /-2/);
});
await test("matrix follow-up reuses its elements", async () => {
  const first = await solved(
    "جد محدد المصفوفة [[1,2],[3,4]]",
    "matricesEngine",
  );
  const second = await solved("جد مقلوبها", "matricesEngine", first.context);
  assert.match(second.results[0].finalLatex, /A\^\{-1\}/);
});
await test("missing urn draw mode asks then resolves from the chosen clarification", async () => {
  const first = await solvePrompt(
    "كيس فيه 3 كرات حمراء و5 بيضاء سحبت كرتان، جد احتمال اختلاف اللون",
    { angleMode: "DEG" },
  );
  assert.equal(first.results.length, 0);
  assert(first.unsolved[0].choices.length);
  const second = await solved(
    "السحب معًا دون إعادة",
    "probabilityEngine",
    first.context,
  );
  assert.match(second.results[0].finalLatex, /frac\{15\}\{28\}/);
});
await test("unclear input asks rather than inventing", async () => {
  const answer = await solvePrompt("ساعدني في هذه المسألة", {
    angleMode: "DEG",
  });
  assert.equal(answer.results.length, 0);
  assert(answer.unsolved[0].choices.length >= 2);
  validate(answer);
});
await test("an incorrect derivative does not receive verification", () => {
  assert.equal(verifyDerivative("x^2", "3*x").passed, false);
});
await test("polynomial poles and redundant outer parentheses preserve correct limits", async () => {
  const even = await solved(
    "جد نهاية 1/x^2 عندما x تؤول إلى 0",
    "limitsEngine",
  );
  assert.match(even.results[0].finalLatex, /infty/);
  assert(!even.results[0].finalLatex.includes("nexists"));
  const odd = await solved("جد نهاية 1/x عندما x تؤول إلى 0", "limitsEngine");
  assert.match(odd.results[0].finalLatex, /nexists/);
  const nested = await solved(
    "جد نهاية (((x^2-1)/(x-1))) عندما x تؤول إلى 1",
    "limitsEngine",
  );
  assert.match(nested.results[0].finalLatex, /= 2/);
  for (const side of ["اليمين", "اليسار"]) {
    const one = await solved(
      `جد نهاية 1/x عندما x تؤول إلى 0 من ${side}`,
      "limitsEngine",
    );
    assert(
      one.results[0].finalLatex.includes(
        side === "اليمين" ? "+\\infty" : "-\\infty",
      ),
    );
  }
});
await test("explicit degrees override RAD; GRAD is respected otherwise", async () => {
  for (const [question, angleMode] of [
    ["احسب sin(30°)", "RAD"],
    ["احسب sin(100)", "GRAD"],
  ] as const) {
    const answer = await solvePrompt(question, { angleMode });
    assert.equal(answer.unsolved.length, 0);
    assert(
      Math.abs(
        Number(answer.results[0].decimal) - (angleMode === "RAD" ? 0.5 : 1),
      ) < 1e-9,
    );
    validate(answer);
  }
});
await test("solids use the extracted pure geometry helper", async () => {
  const answer = await solved("احسب حجم مكعب طول حرفه 3", "geometryTools");
  assert.match(answer.results[0].finalLatex, /27/);
});
await test("binomial, statistics, and combinatorics are accessible through chat", async () => {
  for (const question of [
    "التوزيع الثنائي n=10 p=0.5 k=5",
    "احسب متوسط ووسيط البيانات [1,2,3,4,5]",
    "احسب التوافيق n=5 k=2",
  ])
    await solved(question, "probabilityEngine");
});
await test("complex polar conversion uses the complex engine", async () => {
  const answer = await solved(
    "حول العدد العقدي 3+4i إلى الشكل الأسي",
    "complexEngine",
  );
  assert(answer.results[0].verification.passed);
});
await test("all four RichText delimiter styles are typeset", () => {
  const html = renderToStaticMarkup(
    createElement(RichText, {
      text: "النقطة \\(A\\) والدالة \\[x^2\\] و $x+1$ و $$\\frac{1}{2}$$".replace(
        /\\\\/g,
        "\\",
      ),
    }),
  );
  assert.equal((html.match(/class="katex"/g) ?? []).length, 4);
  assert(!html.includes("katex-error"));
  assert(!html.includes("تعذّر عرض"));
});
await test("plain user-question exponents, radicals, and matrices render as math", () => {
  for (const text of [
    "جد مشتق f(x)=x^3-3x+1",
    "احسب sin(30°)+√2",
    "جد محدد [[1,2],[3,4]]",
  ]) {
    const html = renderToStaticMarkup(
      createElement(RichText, { text, autoMath: true }),
    );
    assert(html.includes('class="katex"'));
    assert(!html.includes("katex-error"));
    assert(!html.includes("تعذّر عرض"));
  }
});
await test("malformed persistence, external image URLs, and nested display trees are rejected", async () => {
  const answer = await solved("احسب 2+2", "mathEngine");
  const good = {
    id: "safe",
    question: answer.question,
    answer,
    createdAt: Date.now(),
  };
  assert(isConversationTurn(good));
  assert(
    !isConversationTurn({
      ...good,
      image: "https://example.invalid/track.png",
    }),
  );
  const broken = structuredClone(good);
  broken.answer.results[0].steps = [null as never];
  assert(!isConversationTurn(broken));
  const unknown = structuredClone(good);
  unknown.answer.results[0].engine = "made-up-engine" as never;
  assert(!isConversationTurn(unknown));
  const map = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => map.set(key, value),
      removeItem: (key: string) => map.delete(key),
    },
  });
  map.set("pro_calc_conversation_v1", JSON.stringify([broken, good]));
  assert.equal(localDB.getConversation().length, 1);
  localDB.saveProfile("  سارة  ");
  assert.equal(localDB.getProfile().name, "سارة");
  map.set("pro_calc_conversation_v1", "{broken json");
  assert.deepEqual(localDB.getConversation(), []);
});
await test("linear systems in two and three variables use the original solvers", async () => {
  for (const question of [
    "حل جملة المعادلات x+y=3، x-y=1",
    "حل جملة المعادلات x+y=3؛ x-y=1",
    "حل الجملة\nx+y+z=6\nx-y=0\ny-z=0",
  ]) {
    const answer = await solved(question, "equationSolver");
    assert(answer.results[0].verification.passed);
    assert.match(answer.results[0].finalLatex, /x = 2/);
  }
});
await test("nonlinear systems ask for clarification rather than being linearized", async () => {
  const answer = await solvePrompt("حل الجملة x^2+y=3، x-y=1", {
    angleMode: "DEG",
  });
  assert.equal(answer.results.length, 0);
  assert(answer.unsolved.length);
});
await test("normal distribution is reachable and does not claim independent verification", async () => {
  const answer = await solved(
    "التوزيع الطبيعي mu=0 sigma=1 x=1",
    "probabilityEngine",
  );
  assert(Math.abs(Number(answer.results[0].decimal) - 0.841345) < 1e-6);
  assert(!answer.results[0].verification.passed);
});
await test("logarithmic and oscillating limits do not turn finite probes into fake answers", async () => {
  const log = await solved(
    "جد نهاية log(x) عندما x تؤول إلى 0",
    "limitsEngine",
  );
  assert(log.results[0].finalLatex.includes("-\\infty"));
  assert(
    log.results[0].steps.some((step) => step.latex.includes(String.raw`u\to0`)),
  );
  for (const side of ["اللانهاية", "ناقص اللانهاية"]) {
    const wave = await solved(
      `جد نهاية sin(x) عندما x تؤول إلى ${side}`,
      "limitsEngine",
    );
    assert(wave.results[0].finalLatex.includes("\\nexists"));
  }
});
await test("verified system results propagate without binding a new function variable", async () => {
  const system = await solved("حل الجملة x+y=3، x-y=1", "equationSolver");
  const value = await solved("احسب x+y", "mathEngine", system.context);
  assert.equal(Number(value.results[0].decimal), 3);
  const derivative = await solved(
    "جد مشتق f(x)=x^2",
    "calculusEngine",
    system.context,
  );
  assert.match(derivative.results[0].finalLatex, /2.*x/);
});
await test("compound LaTeX integrals keep their own bounds", async () => {
  const answer = await solved(String.raw`أ) احسب \(\int_0^1 x\,dx\)
ب) احسب \(\int_0^2 x\,dx\)`);
  assert.deepEqual(
    answer.results.map((result) => result.decimal),
    [0.5, 2],
  );
});
await test("domain endpoints exclude the non-real half-line", async () => {
  const answer = await solved(
    "جد نهايات sqrt(x) عند أطراف المجال",
    "limitsEngine",
  );
  assert(!answer.results[0].finalLatex.includes("-\\infty"));
  assert(answer.results[0].finalLatex.includes("+\\infty"));
});
await test("symbolic confirmation replaces tiny finite probe estimates", async () => {
  const answer = await solved(
    "جد نهاية sin(1/x) عندما x تؤول إلى اللانهاية",
    "limitsEngine",
  );
  assert.match(answer.results[0].finalLatex, / = 0/);
  const unknown = await solvePrompt(
    "جد نهاية x*sin(x) عندما x تؤول إلى اللانهاية",
    { angleMode: "DEG" },
  );
  assert.equal(unknown.results.length, 0);
  assert(unknown.unsolved.length);
});
await test("complex powers, roots, conjugate, and inverse are reachable without sections", async () => {
  const power = await solved("احسب (3+4i)^2", "complexEngine");
  assert(power.results[0].verification.passed);
  assert.match(power.results[0].finalLatex, /-7.*24/);
  const roots = await solved(
    "جد الجذور التكعيبية للعدد العقدي 1+i",
    "complexEngine",
  );
  assert(roots.results[0].verification.passed);
  assert.equal(roots.results[0].verification.samples, 3);
  for (const operation of ["مرافق", "مقلوب"]) {
    const answer = await solved(
      `جد ${operation} العدد العقدي 3+4i`,
      "complexEngine",
    );
    assert(answer.results[0].verification.passed);
  }
  const plane = await solved(
    "ارسم العدد في المستوي العقدي 3+4i",
    "complexEngine",
  );
  assert(plane.results[0].verification.passed);
});
await test("probability parameters never truncate invalid decimals or out-of-domain values", async () => {
  for (const question of [
    "التوزيع الثنائي n=12.5 p=0.5 k=1",
    "التوزيع الثنائي n=10 p=1.1 k=2",
    "التوزيع الطبيعي mu=0 sigma=-1 x=1",
  ]) {
    const answer = await solvePrompt(question, { angleMode: "DEG" });
    assert.equal(answer.results.length, 0);
    assert(answer.unsolved.length);
  }
});
console.log(`\nChat solver: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
