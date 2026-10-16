import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { solvePrompt } from "../src/solver/orchestrator";
import { parsePrompt, normalizePrompt } from "../src/solver/parser";
import { isSchoolContext } from "../src/solver/schoolTypes";
import { isConversationTurn } from "../src/solver/validation";
import { AnswerBubble } from "../src/components/chat/AnswerBubble";
import { read as real } from "../src/utils/spaceGeometryMath";
import { complexValue } from "../src/utils/complexMath";
import { exact, ONE, sum } from "../src/utils/probabilityExact";
import type { SolverAnswer, SolverContext } from "../src/solver/types";
let passed = 0,
  failed = 0;
async function test(name: string, f: () => void | Promise<void>) {
  try {
    await f();
    passed++;
    console.log("PASS", name);
  } catch (e) {
    failed++;
    console.error("FAIL", name, e);
  }
}
async function ok(q: string, context?: SolverContext) {
  const a = await solvePrompt(q, { angleMode: "DEG", context });
  assert.equal(a.unsolved.length, 0, JSON.stringify(a.unsolved));
  assert(a.results.length);
  assert(
    isConversationTurn(
      JSON.parse(
        JSON.stringify({ id: "safety", question: q, answer: a, createdAt: 1 }),
      ),
    ),
  );
  return a;
}
async function no(q: string, context?: SolverContext) {
  const a = await solvePrompt(q, { angleMode: "DEG", context });
  assert.equal(a.results.length, 0);
  assert(a.unsolved.length);
  return a;
}
const html = (a: SolverAnswer) =>
  renderToStaticMarkup(
    createElement(AnswerBubble, {
      answer: a,
      animate: false,
      saved: false,
      onFollowUp: () => {},
      onSave: () => {},
    }),
  );
const data = JSON.parse(
  readFileSync("tests/fixtures/curriculum.json", "utf8"),
) as { id: string; prompt: string }[];
await test("school labels preserve Roman and original Arabic numerals while titles and marks are not demands", () => {
  const p = parsePrompt(
    "السؤال الثاني (20 درجة)\nلتكن f(x)=x^2.\nوالمطلوب:\nI) احسب المشتق.\nII) ارسم المنحنى.\n٣) احسب التكامل من0 إلى1.",
  );
  assert.deepEqual(
    p.parts?.map((p) => p.label),
    ["I)", "II)", "٣)"],
  );
  assert(!p.parts?.some((p) => p.text.includes("20 درجة")));
});
await test("both textbook examples preserve their actual source labels and exact answers", async () => {
  const a = await ok(data.find((c) => c.id === "C03")!.prompt);
  assert.equal(a.results[0].school?.label, "3.");
  assert.equal(a.results[0].decimal, 8192);
  const b = await ok(data.find((c) => c.id === "P01")!.prompt);
  assert.deepEqual(
    b.results.map((r) => r.school?.label),
    ["1.", "2.", "3. •", "3. •", "3. •"],
  );
});
await test("new experiment uses original U1 stock and the exact full white-count law", async () => {
  const a = await ok(data.find((c) => c.id === "P01")!.prompt),
    p = a.context.probability!;
  assert.equal(p.urn?.target, "بيضاء");
  assert.equal(
    p.urn?.colors.reduce((n, c) => n + c.count, 0),
    5,
  );
  assert.deepEqual(p.law?.values, ["0", "1", "2"]);
  assert.deepEqual(p.law?.probabilities, ["3/10", "3/5", "1/10"]);
  assert(sum(p.law!.probabilities.map((x) => exact(x))).eq(ONE));
});
await test("named box data never supplies an unmentioned observation colour", async () => {
  await no(
    "U1: 1 حمراء و1 بيضاء.\nU2: 2 حمراء و1 بيضاء.\nنختار عشوائيا أحد الصندوقين.\nالمطلوب:\n1. احسب احتمال الحدث غير المعرف.",
  );
});
await test("a new ordinary urn does not inherit the active named box or its white variable", async () => {
  const a = await ok(data.find((c) => c.id === "P01")!.prompt);
  const b = await ok(
    "الألوان=[ذهبية:1,وردية:1]، r=2، السحب مع اعادة، احسب قانون احتمال عدد الكرات من اللون ذهبية",
    a.context,
  );
  const c = await ok("احسب E(X)", b.context);
  assert.equal(c.results[0].decimal, 1);
  assert(!c.context.school?.activeUrn);
  const events = await ok(
    "P(A)=1/2، P(B)=1/3، P(A∩B)=1/6، احسب P(A|B)",
    c.context,
  );
  assert.equal(events.results[0].decimal, 1 / 2);
});
await test("missing indexed complex data never falls back to a current unlabelled value", async () => {
  const a = await ok("اكتب الشكل الأسي للعدد z=1+i");
  await no("احسب S=z1^12+z2^12 مستخدما الشكل الأسي", a.context);
});
await test("the general aggregate engine handles nonconjugate unequal powers without inventing conjugacy", async () => {
  const a = await ok("z1=1+i، z2=2-i، احسب S=z1^2+z2^3 مستخدما الشكل الأسي");
  const z = complexValue(a.context.school!.values!.S);
  assert.equal(z.re, 2);
  assert.equal(z.im, -9);
  assert(!a.results[0].steps.some((s) => s.title.includes("بالمرافق")));
});
await test("powers outside the documented aggregate bound ask instead of producing an unsafe answer", async () => {
  await no("z1=1+i، z2=1-i، احسب S=z1^65+z2^65 مستخدما الشكل الأسي");
});
await test("a scalar calculated from named complex values can be reused scientifically by its own name", async () => {
  const a = await ok(data.find((c) => c.id === "C03")!.prompt);
  const b = await ok("احسب S/2", a.context);
  assert.equal(Number(b.results[0].decimal), 4096);
});
await test("an incorrect closed form is not given an induction proof or a badge", async () => {
  await no("u_0=1 وu_{n+1}=2u_n+3، أثبت بالتدريج أن u_n=4*2^n-2 لكل n طبيعي");
});
await test("an incorrectly shifted auxiliary sequence is not declared geometric", async () => {
  await no("u_0=1 وu_{n+1}=2u_n+3، نضع v_n=u_n+4، بين أن v_n هندسية");
});
await test("a zero multiplier does not prove a false all-ranks constant formula", async () => {
  await no("u_0=1 وu_{n+1}=0*u_n+3، أثبت بالتدريج أن u_n=3 لكل n طبيعي");
  const a = await ok("u_0=1 وu_{n+1}=0*u_n+3، جد العبارة الصريحة");
  assert(a.results[0].finalLatex.includes("cases"));
});
await test("finding polynomial roots does not replace a missing uniqueness proof", async () => {
  await no("f(x)=x^3-x، أثبت وجود حل وحيد للمعادلة f(x)=0 في الفترة (-2,2)");
});
await test("a crossing curve difference is not integrated as signed area", async () => {
  await no("f(x)=x، g(x)=0، احسب مساحة الحيز بين المنحنيين في الفترة [-1,1]");
});
await test("a plane cutting a sphere is not falsely reported tangent", async () => {
  const a = await ok(
    "K(0,0,1)، P: z=0، كرة مركزها K ونصف قطرها r=2، أثبت أن المستوي P مماس للكرة",
  );
  assert(a.results[0].finalLatex.includes("قاطع"));
});
await test("safe TeX lexical rules do not turn OCR confusables into guessed numbers", async () => {
  assert.equal(normalizePrompt("احسب \\frac12"), "احسب ((1)/(2))");
  await no("z1=1+iVv3، z2=1-iVv3، احسب S=z1^2+z2^2");
});
await test("one visible clarification is shown even when multiple parts remain incomplete", async () => {
  const a = await solvePrompt(
    "المطلوب:\n1. احسب نهاية التابع غير المعرف.\n2. اكتب الشكل الأسي للعدد z2 غير المعرف.",
    { angleMode: "DEG" },
  );
  assert(a.unsolved.length >= 2);
  const s = html(a);
  assert.equal((s.match(/class="clarification-card"/g) || []).length, 1);
  assert(s.includes("school-pending"));
});
await test("unrequested decimals remain collapsed and explicit numeric requests are visible", async () => {
  const a = await ok("جد المسافة بين A(0,0,0) وB(1,1,0)");
  assert(!a.results[0].school?.showDecimal);
  assert(html(a).includes('<details class="answer-decimal"'));
  const b = await ok("احسب عدديا sin(30°)+sqrt(2)");
  assert(b.results[0].school?.showDecimal);
  assert(!html(b).includes('<details class="answer-decimal"'));
});
await test("the source question, labels and deep school state survive guarded persistence", async () => {
  const a = await ok(data.find((c) => c.id === "C03")!.prompt);
  const turn = JSON.parse(
    JSON.stringify({
      id: "persist",
      question: a.question,
      answer: a,
      createdAt: 1,
    }),
  );
  assert(isConversationTurn(turn));
  turn.answer.results[0].school.label = [];
  assert(!isConversationTurn(turn));
  assert(!isSchoolContext({ values: { S: "process.exit(0)" } }));
  assert(
    !isSchoolContext({ urns: { U1: { colors: [{ name: "x", count: -1 }] } } }),
  );
});
await test("a failed dependent part does not consume a stale earlier result while independent parts finish", async () => {
  const old = await ok("اكتب الشكل الأسي للعدد z=1+i");
  const a = await solvePrompt(
    "المطلوب:\n1. احسب S=z3^2+z4^2.\n2. استنتج الشكل الأسي له.\n3. احسب sin(30°).",
    { angleMode: "DEG", context: old.context },
  );
  assert.equal(a.results.length, 1);
  assert(a.unsolved.length >= 2);
  assert.equal(a.results[0].engine, "mathEngine");
  assert(real(String(a.results[0].decimal)).eq(real("1/2")));
});
await test("setup definitions do not consume the budget of twelve actual demands", async () => {
  const text =
    "المطلوب:\n1. ليكن f(x)=x^2.\n2. ليكن g(x)=x+1.\n" +
    Array.from({ length: 12 }, (_, i) => `${i + 3}. احسب ${i}+1.`).join("\n");
  const a = await ok(text);
  assert.equal(a.results.length, 12);
});
await test("a requested tangent point x=1 is not replaced by the old default point0", async () => {
  const a = await ok("f(x)=x^3-3x+1، اكتب معادلة المماس عند x=1");
  assert(a.results[0].finalLatex.replace(/\s/g, "").includes("y=-1"));
  await no("f(x)=x^2، اكتب معادلة المماس");
});
await test("derivatives at rational points and exponential tangents stay exact", async () => {
  const a = await ok("f(x)=x^2، احسب المشتق عند x=1/2");
  assert.equal(a.results[0].decimal, 1);
  const b = await ok("f(x)=e^x، اكتب معادلة المماس عند x=1");
  assert(b.results[0].finalLatex.includes("e"));
  assert(b.results[0].verification.passed);
});
await test("explicit givens after حيث bind the requested quantity instead of requesting them again", async () => {
  const a = await ok("احسب S=z1^4+z2^4 مستخدما الشكل الأسي حيث z1=1+i وz2=1-i");
  assert.equal(a.results[0].decimal, -8);
});
await test("mixture formulas retain nonconsecutive given box identifiers", async () => {
  const a = await ok(
    "U3: 3 حمراء و2 بيضاء.\nU7: 2 حمراء و4 بيضاء.\nنختار عشوائيا أحد الصندوقين ثم نسحب كرة.\nالمطلوب:\n1. احسب احتمال الحمراء.\n2. إذا علمت أن الكرة حمراء احسب احتمال أنها من U7.",
  );
  assert(a.results[1].finalLatex.includes("U_{7}"));
  assert(Math.abs(Number(a.results[1].decimal) - 5 / 14) < 1e-9);
});
await test("an explicitly named Y urn variable retains its symbol and its expectation", async () => {
  const a = await ok(
    "U1: 3 حمراء و2 بيضاء.\nالمطلوب:\n1. نسحب من الصندوق الأول U1 كرتين معا. ليكن Y المتغير العشوائي الذي يدل على عدد الكرات البيضاء.\n• اكتب القانون الاحتمالي للمتغير Y.\n• احسب E(Y).",
  );
  assert.equal(a.results[a.results.length - 1].decimal, 4 / 5);
  assert(a.results[a.results.length - 1].finalLatex.includes("Y"));
  assert.equal(a.context.probability?.law?.symbol, "Y");
});
await test("modulus synonyms and vertical bars request the actual norm rather than generic forms", async () => {
  for (const q of [
    "z=3+4i، احسب المقياس",
    "z=3+4i، احسب |z|",
    "z=3+4i، احسب abs(z)",
  ]) {
    const a = await ok(q);
    assert.equal(a.results[0].decimal, 5);
    assert(a.results[0].finalLatex.includes("|z|=5"));
  }
});
await test("arg notation returns an actual argument and zero never gets a fabricated one", async () => {
  const a = await ok("z=1+i√3، احسب arg(z)");
  assert(a.results[0].finalLatex.includes("\\arg(z)"));
  assert(a.results[0].finalLatex.includes("pi"));
  const b = await ok("z=0، احسب arg(z)");
  assert(b.results[0].finalLatex.includes("غير معرّفة"));
  assert(!b.results[0].verification.passed);
});
await test("named angle ratios still use the geometry operation instead of single-number arg handling", async () => {
  const a = await ok(
    "z_A=0، z_B=1، z_C=i، احسب عمدة النسبة (z_C-z_A)/(z_B-z_A)",
  );
  assert(
    a.results[0].title.includes("زاوية") ||
      a.results[0].finalLatex.includes("pi"),
  );
});
await test("a heading sharing a pasted line with a definition never consumes the given expression", async () => {
  const a = await ok(
    "السؤال الثاني (20 درجة) لتكن f(x)=x^2.\nالمطلوب:\n1. احسب المشتق.",
  );
  assert(a.results[0].finalLatex.includes("2"));
  assert(a.results[0].finalLatex.includes("x"));
  assert.equal(a.context.school?.functions?.f.expression, "x^2");
});
await test("unnamed stock boxes do not default an unspecified observation to red", async () => {
  await no(
    "الصندوق الأول يحتوي 3 حمراء و2 بيضاء، الصندوق الثاني يحتوي 2 حمراء و4 بيضاء، نختار بالتساوي ثم نسحب كرة، احسب الاحتمال الكلي للون غير المعرف",
  );
});
await test("a general sequence formula is not followed by an unrequested sum as its decimal value", async () => {
  const a = await ok(
    "متتالية حسابية حدها الأول 3 وأساسها 4، أوجد عبارة الحد العام",
  );
  assert.equal(a.results[0].decimal, undefined);
  assert(!a.results[0].verification.passed);
});
await test("a generic previous result never reuses an unrelated old probability after complex arithmetic", async () => {
  const p = await ok(
    "كيس فيه 3 حمراء و2 بيضاء، سحبت كرتان معا، احسب احتمال اختلاف اللون",
  );
  const a = await ok(data.find((c) => c.id === "C03")!.prompt, p.context);
  const b = await ok("احسب النتيجة السابقة/2", a.context);
  assert.equal(Number(b.results[0].decimal), 4096);
});
await test("scientific division by zero and overflow do not masquerade as numerical limits", async () => {
  await no("احسب 1/0");
  await no("احسب exp(10000)");
});
await test("verification substitutes the proposed value instead of accepting an asserted equality", async () => {
  const a = await ok("f(x)=x^2-1، تحقق أن f(0)=0");
  assert(a.results[0].finalLatex.includes("غير صحيحة"));
  assert(a.results[0].finalLatex.includes("-1"));
  const b = await ok("f(x)=x^2-1، تحقق أن العدد1 جذر");
  assert(b.results[0].finalLatex.includes("محققة"));
});
await test("proof verbs inside a numbered question are not silently mistaken for definitions", async () => {
  const a = await ok(
    "المطلوب:\n1. ليكن u_0=1 وu_{n+1}=2u_n+3، أثبت بالتدريج أن u_n=4*2^n-3",
  );
  assert(a.results[0].steps.some((s) => s.title.includes("فرض")));
});
await test("a proof conclusion cannot redefine an unknown z and verify its own assertion", async () => {
  await no("برهن أن z=5");
});
await test("an independence proof requires data and never treats the requested conclusion as a given assumption", async () => {
  await no("P(A)=1/2، P(B)=1/3، بيّن أن الحدثين مستقلان");
});
console.log(`\nSchool safety: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
