import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import katex from "katex";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { solvePrompt } from "../../src/core/solver/orchestrator";
import {
  decodeLatex,
  parsePrompt,
  normalizePrompt,
} from "../../src/core/solver/parser";
import {
  normalizeMathTypography,
  stripPromptMarkdown,
  splitPromptRequests,
} from "../../src/core/solver/textbook";
import { complexValue } from "../../src/core/engines/complex/complexMath";
import {
  emptyContext,
  type SolverAnswer,
  type SolverContext,
} from "../../src/core/solver/types";
import { isConversationTurn } from "../../src/core/solver/validation";
import { RichText } from "../../src/ui/Tex";

const fixture = JSON.parse(
  readFileSync("tests/fixtures/syrian-complex.json", "utf8"),
) as { question: string };
let passed = 0,
  failed = 0;
async function test(name: string, run: () => unknown | Promise<unknown>) {
  try {
    await run();
    passed++;
    console.log("PASS", name);
  } catch (e) {
    failed++;
    console.error("FAIL", name, e);
  }
}
function validate(a: SolverAnswer) {
  assert(
    isConversationTurn(
      JSON.parse(
        JSON.stringify({
          id: "textbook",
          question: a.question,
          answer: a,
          createdAt: Date.now(),
        }),
      ),
    ),
  );
  for (const r of a.results) {
    for (const latex of [
      r.finalLatex,
      ...r.steps.map((s) => s.latex),
      ...r.visuals.flatMap((v) =>
        v.kind === "formula-cards"
          ? v.cards.map((c) => c.latex)
          : v.kind === "table"
            ? [v.latex]
            : [],
      ),
    ])
      katex.renderToString(latex, { throwOnError: true, strict: "ignore" });
    assert(!/NaN|Infinity|undefined/.test(r.finalLatex));
  }
}
async function solved(q: string, count = 1, context?: SolverContext) {
  const a = await solvePrompt(q, { angleMode: "DEG", context });
  assert.equal(a.unsolved.length, 0, JSON.stringify(a.unsolved));
  assert.equal(a.results.length, count);
  validate(a);
  return a;
}
function near(a: number, b: number) {
  assert(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
}
function expectExponent(
  a: SolverAnswer,
  index = 0,
  label = "z_{A}",
  negative = false,
) {
  const s = a.results[index].finalLatex;
  assert(s.includes(label + "=2e^{" + (negative ? "-i" : "i")));
  assert(s.includes("\\frac{\\pi}{3}"));
  assert(!s.includes("theta"));
  assert(a.results[index].verification.passed);
}

await test("the exact Syrian textbook question solves both named demands without clarification", async () => {
  const a = await solved(fixture.question, 2);
  expectExponent(a);
  expectExponent(a, 1, "z_{C}", true);
  assert.deepEqual(
    a.results.map((r) => r.engine),
    ["complexEngine", "complexEngine"],
  );
  const z = complexValue(a.context.complex!.current!);
  near(z.re, 1);
  near(z.im, -Math.sqrt(3));
  assert(a.context.complex?.values.z_B);
  assert(a.context.complex?.values.z_A);
});
await test("the school method explains modulus and quadrant before writing the exponential", async () => {
  const a = await solved(fixture.question, 2),
    s = a.results[0].steps;
  assert(s.some((s) => s.title.includes("الطويلة") && s.latex.endsWith("=2")));
  assert(
    s.some(
      (s) =>
        s.latex.includes("\\cos\\theta") && s.latex.includes("\\sin\\theta"),
    ),
  );
  assert(s.some((s) => s.text?.includes("الربع")));
  assert(s.some((s) => s.title.includes("بالراديان")));
});
await test("deduction uses conjugacy only after comparing both given real and imaginary parts", async () => {
  const a = await solved(fixture.question, 2);
  assert(a.results[1].steps.some((s) => s.latex.includes("\\overline{z_{A}}")));
  assert(a.results[1].steps.some((s) => s.title.includes("الاستنتاج")));
});
await test("a nonconjugate target is solved without inventing a conjugate relation", async () => {
  const a = await solved(fixture.question.replace("z_{C}=1-i", "z_{C}=2-i"), 2);
  assert(
    !a.results[1].steps.some((s) => s.latex.includes("\\overline{z_{A}}")),
  );
  const z = complexValue(a.context.complex!.current!);
  near(z.re, 2);
  near(z.im, -Math.sqrt(3));
  const previous = await solved("اكتب الشكل الأسي للعدد z_A=1+i");
  const changed = await solved(
    "z_A=2+3i، z_C=1-i، استنتج الشكل الأسي للعدد z_C",
    1,
    previous.context,
  );
  assert(
    !changed.results[0].steps.some((s) =>
      s.latex.includes("\\overline{z_{A}}"),
    ),
  );
});
await test("a semicolon in the reference frame is not a separate unanswered question", () => {
  const p = parsePrompt(fixture.question);
  assert.equal(p.requests.length, 2);
  assert(p.requests[0].includes("(O;"));
  assert.equal(splitPromptRequests("احسب (1+2;3) ثم احسب 4+5").length, 2);
});
await test("Arabic frame separators and whitespace in LaTeX subscripts remain valid", async () => {
  const q = fixture.question
    .replace("(O;", "(O؛")
    .replaceAll("z_{A}", "z_{ A }")
    .replaceAll("z_{C}", "z_{ C }");
  const a = await solved(q, 2);
  expectExponent(a);
  expectExponent(a, 1, "z_{C}", true);
});
await test("separately numbered demands share the same given data without solving the preamble", async () => {
  const q = fixture.question.replace("، ثم استنتج", "\n2. استنتج");
  const a = await solved(q, 2);
  expectExponent(a);
  expectExponent(a, 1, "z_{C}", true);
});
await test("plain text and Unicode OCR-style roots do not concatenate into an unsupported isqrt function", async () => {
  const a = await solved("z_A=1+i√3، اكتب الشكل الأسي للعدد z_A");
  expectExponent(a);
  assert(!normalizePrompt(String.raw`i\sqrt{3}`).includes("isqrt"));
  assert(!normalizePrompt("i√3").includes("isqrt"));
});
await test("adjacent LaTeX fractions and standard unbraced single-token roots keep multiplication", async () => {
  const a = await solved(String.raw`اكتب الشكل الأسي للعدد z_A=1+i\sqrt3`);
  expectExponent(a);
  const b = await solved(String.raw`اكتب الشكل الجبري للعدد z=1+i\frac{1}{2}`);
  near(complexValue(b.context.complex!.current!).im, 0.5);
  const c = await solved(String.raw`اكتب الشكل الجبري للعدد z=2\sqrt{3}i`);
  near(complexValue(c.context.complex!.current!).im, 2 * Math.sqrt(3));
});
await test("Greek pi and escaped trig functions stay separate from an adjacent imaginary unit", async () => {
  const a = await solved(String.raw`اكتب الشكل الجبري للعدد z=i\pi`);
  near(complexValue(a.context.complex!.current!).im, Math.PI);
  const b = await solved(String.raw`اكتب الشكل الجبري للعدد z=1+i\cos(0)`);
  near(complexValue(b.context.complex!.current!).im, 1);
});
await test("safe mathematical typography includes italic letters, actual subscripts and copied bidi marks", async () => {
  const a = await solved("\u2067اكتب الشكل الأسي للعدد 𝑧ₐ＝1＋i√3\u2069");
  expectExponent(a);
  assert.equal(normalizeMathTypography("z₁=2−i"), "z_1=2-i");
});
await test("a requested name wins over the first given point or a stale current number", async () => {
  const a = await solved("اكتب الشكل الأسي للعدد z=7+4i");
  const b = await solved(
    "z_A=2، z_B=1+i√3، اكتب الشكل الأسي للعدد z_B",
    1,
    a.context,
  );
  expectExponent(b, 0, "z_{B}");
});
await test("the exponential form is distinct from the algebraic and trigonometric forms", async () => {
  const a = await solved("اكتب الشكل المثلثي للعدد z_A=1+i√3");
  assert(a.results[0].finalLatex.includes("\\cos("));
  assert(!a.results[0].finalLatex.includes("e^{"));
  const b = await solved("اكتب الشكل الجبري للعدد z_A=1+i√3");
  assert(b.results[0].finalLatex.includes("\\sqrt{3}i"));
  assert(!b.results[0].finalLatex.includes("e^{"));
  const c = await solved("اكتب خطوات أساسية للعدد z=1+i");
  assert.equal(
    c.results[0].visuals.find((v) => v.kind === "formula-cards")?.cards.length,
    3,
  );
});
await test("multiple explicitly named form targets are all solved and no implicit current target is chosen", async () => {
  const a = await solved(
    "z_A=1+i√3، z_B=2، z_C=1-i√3، اكتب z_A وz_C بالشكل الأسي",
  );
  assert(a.results[0].finalLatex.includes("z_{A}=2e^{i"));
  assert(a.results[0].finalLatex.includes("z_{C}=2e^{-i"));
  assert(!a.results[0].finalLatex.includes("z_{B}="));
  assert.equal(a.context.complex?.current, undefined);
  assert(a.context.complex?.ambiguous);
  const b = await solvePrompt("جد مرافقه", {
    angleMode: "DEG",
    context: a.context,
  });
  assert(b.unsolved.length);
});
await test("missing named data still asks rather than reusing the first point or a stale number", async () => {
  const a = await solvePrompt("z_A=1+i√3، اكتب الشكل الأسي للعدد z_C", {
    angleMode: "DEG",
  });
  assert.equal(a.results.length, 0);
  assert(a.unsolved.some((u) => u.message.includes("z_C")));
});
await test("an unsupported root or undefined coefficient still fails closed", async () => {
  for (const q of [
    String.raw`اكتب الشكل الأسي للعدد z_A=1+i\sqrt{t}`,
    String.raw`اكتب الشكل الأسي للعدد z_A=1+i\sqrt{3`,
  ]) {
    const a = await solvePrompt(q, { angleMode: "DEG" });
    assert.equal(a.results.length, 0);
    assert(a.unsolved.length);
  }
});
await test("the real number zero has no fabricated principal angle in an exponential demand", async () => {
  const a = await solved("اكتب الشكل الأسي للعدد z=0");
  assert.equal(a.results[0].finalLatex, "z=0");
  assert(a.results[0].steps.some((s) => s.latex.includes("غير معرّفة")));
});
await test("a coordinate frame does not make an ordinary three-dimensional geometry question complex", async () => {
  const a = await solved("جد المسافة بين A(1,2,3) والمستوي 2x-y+2z-5=0");
  assert.equal(a.results[0].engine, "geometryEngine");
});
const dialects = [
  "بدي اكتب z_A بالشكل الأسي",
  "بدي حوللي z_A للصيغة الأسية",
  "اكتبلي z_A بالصيغة الأسية",
  "عايز z_A بالصورة الأسية",
  "عاوز اكتب z_A في الشكل الأسي",
  "عاوزة اكتب z_A بالشكل الأسي",
  "أبغى z_A بالشكل الأسي",
  "ابي اكتب z_A بالصيغة الأسية",
  "أبغا حول لي z_A للشكل الأسي",
  "بغيت نكتب z_A بالصيغة الأسية",
  "بغيت نحول z_A للشكل الأسي",
  "نحب نحسب z_A بالشكل الأسي",
];
for (const dialect of dialects)
  await test(`equivalent dialect demand: ${dialect}`, async () => {
    const a = await solved(`z_A=1+i√3، ${dialect}`);
    expectExponent(a);
  });
await test("spoken Syrian number words and a root retain the same complex value", async () => {
  const a = await solved(
    "بدي اكتب z_A بالشكل الأسي حيث z_A=واحد زائد i جذر تلاتة",
  );
  expectExponent(a);
});
await test("dialect aliases also work for scientific arithmetic and calculus", async () => {
  for (const prefix of ["عاوز احسبلي", "أبغى احسب لي", "بغيت نحسب"]) {
    const a = await solved(`${prefix} خمسة زائد جذر اتنين`);
    assert.equal(a.results[0].engine, "mathEngine");
    near(a.results[0].decimal!, 5 + Math.SQRT2);
  }
  const b = await solved("نشتق اكس اس تلاتة ناقص ثلاثة اكس زائد واحد");
  assert.equal(b.results[0].engine, "calculusEngine");
});
await test("whole-word dialect cleanup preserves mathematical names and distinct given labels", () => {
  assert(normalizePrompt("بسط cos(3theta) بديموافر").includes("بديموافر"));
  assert(normalizePrompt("بديع").includes("بديع"));
  assert(normalizePrompt("ما بديش").includes("بديش"));
  assert(!normalizeMathTypography("l O v3").includes("sqrt"));
  assert(normalizePrompt("قواعد أساسية").includes("اساسية"));
});
await test("the reviewed OCR preview renders subscripts and radicals but never evaluates the text", () => {
  const text = stripPromptMarkdown(
    normalizeMathTypography("zₐ=1+i√3\n**اكتب** الشكل الأسي"),
  );
  const html = renderToStaticMarkup(
    createElement(RichText, { text, autoMath: true }),
  );
  assert(html.includes("katex"));
  assert(!html.includes("katex-error"));
  assert(!html.includes("2e^"));
  assert(text.includes("z_A="));
});
await test("Markdown cleanup and the LaTeX decoder preserve nested fractions without raw markup operators", () => {
  assert.equal(stripPromptMarkdown("**اكتب** `z_A`"), "اكتب z_A");
  assert(decodeLatex(String.raw`i\frac{1+\sqrt{3}}{2}`).startsWith("i*"));
  assert.equal(emptyContext().lastEngine, undefined);
});
await test("a stale invalid derivation hint never invalidates a correctly specified target", async () => {
  const a = await solved("استنتج الشكل الأسي للعدد z_C=1-i√3", 1, {
    assignments: {},
    lastEngine: "complexEngine",
    complex: { values: { z_A: "unknown" }, current: "unknown" },
  });
  expectExponent(a, 0, "z_{C}", true);
});
await test("pi coefficients keep TeX control words separate from i and the exponential base", async () => {
  const a = await solved(String.raw`اكتب الشكل الأسي للعدد z=i\pi`);
  assert(a.results[0].finalLatex.includes("e^{i"));
  assert(!a.results[0].finalLatex.includes("\\pie"));
  const b = await solved("اكتب الأشكال الثلاثة للعدد العقدي z=pi*i");
  assert(b.results[0].verification.passed);
});
console.log(`\nTextbook regression: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
