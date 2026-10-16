import assert from "node:assert/strict";
import fs from "node:fs";
import katex from "katex";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RichText } from "../src/components/common/Tex";
import corpus from "./fixtures/matrices-school.json";
import { solvePrompt } from "../src/solver/orchestrator";
import { normalizePrompt } from "../src/solver/parser";
import {
  extractMatrixRequest,
  splitMatrixDemands,
  prepareMatrixContext,
} from "../src/solver/extractors/matrices";
import { isConversationTurn } from "../src/solver/validation";
import {
  emptyContext,
  type SolverContext,
  type SolverAnswer,
} from "../src/solver/types";
import { isMatrixContext } from "../src/solver/matrixTypes";
import { read } from "../src/utils/spaceGeometryMath";
import {
  readMatrix,
  serializeMatrix,
  determinant,
  permutationDeterminant,
  inverse,
  adjugate,
  rowReduce,
  multiplyMatrices,
  identity,
  equalMatrices,
  matrixExpression,
  classify,
} from "../src/utils/matrixExact";
let passed = 0,
  failed = 0;
const records: object[] = [];
async function test(name: string, fn: () => unknown | Promise<unknown>) {
  try {
    await fn();
    passed++;
    console.log("PASS", name);
    records.push({ name, pass: true });
  } catch (e) {
    failed++;
    console.error("FAIL", name, e);
    records.push({ name, pass: false, error: String(e) });
  }
}
function validMath(a: SolverAnswer) {
  for (const r of a.results)
    for (const tex of [
      r.finalLatex,
      ...r.steps.map((s) => s.latex),
      ...r.visuals.flatMap((v) => (v.kind === "table" ? [v.latex] : [])),
    ])
      if (tex)
        katex.renderToString(tex, { throwOnError: true, strict: "ignore" });
  assert(
    isConversationTurn({
      id: a.id,
      question: a.question,
      answer: a,
      createdAt: Date.now(),
    }),
    "persisted display/context guard",
  );
}
async function solve(q: string, context?: SolverContext) {
  const a = await solvePrompt(q, { angleMode: "DEG", context });
  validMath(a);
  return a;
}
async function solved(q: string, context?: SolverContext) {
  const a = await solve(q, context);
  assert.equal(a.unsolved.length, 0, JSON.stringify(a.unsolved));
  assert(a.results.length);
  return a;
}
for (const c of corpus.cases)
  await test(`school ${c.id}: ${c.title}`, async () => {
    const a = await solve(c.question);
    if ("resultCount" in c)
      assert.equal(a.results.length, c.resultCount, JSON.stringify(a.unsolved));
    if (c.expect === "clarify") {
      assert.equal(a.results.length, 0);
      assert(a.unsolved.length > 0);
    } else {
      assert.equal(a.unsolved.length, 0, JSON.stringify(a.unsolved));
      assert(
        a.results.length &&
          a.results.every((r) => r.engine === "matricesEngine"),
      );
      const latex = a.results.map((r) => r.finalLatex).join("\n");
      for (const part of c.contains)
        assert(latex.includes(part), `${part}\n${latex}`);
    }
  });
for (let n = 1; n <= 6; n++)
  await test(`independent exact determinant/inverse/row reduction, order ${n}`, () => {
    const cells = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) =>
        i === j ? String(i + 1) : i < j ? `${i + j + 1}/3` : "0",
      ),
    );
    const a = readMatrix(cells),
      d = determinant(a),
      inv = inverse(a),
      r = rowReduce(a);
    assert(d.eq(permutationDeterminant(a)));
    assert(equalMatrices(multiplyMatrices(a, inv), identity(n)));
    assert(r.verified);
    assert.equal(r.pivots.length, n);
    assert(equalMatrices(r.reduced, identity(n)));
  });
for (let n = 1; n <= 5; n++)
  await test(`dependent exact rational rows, shape ${n + 1}×${n}`, () => {
    const a = readMatrix(
      Array.from({ length: n + 1 }, (_, i) =>
        Array.from({ length: n }, (_, j) => `${(i + 1) * (j + 2)}/7`),
      ),
    );
    const r = rowReduce(a);
    assert(r.verified);
    assert.equal(r.pivots.length, 1);
  });
await test("tiny nonzero determinant is not treated as singular by an epsilon", async () => {
  const a = await solved(
    "جد محدد ومعكوس المصفوفة A=[[1,1],[1,1.00000000000000000001]]",
  );
  assert(a.results[0].finalLatex.includes("100000000000000000000"));
  assert(!a.results[0].finalLatex.includes("لا يوجد"));
  assert(a.results[0].verification.passed);
});
await test("inverse fractions and radicals stay exact through JSON round-trip", async () => {
  const a = await solved("احسب محدد A=[[√2,1/3],[0,√2]]");
  const context = JSON.parse(JSON.stringify(a.context));
  assert(isMatrixContext(context.matrices));
  const b = await solved("جد معكوس المصفوفة A", context);
  assert(b.results[0].verification.passed);
  assert(b.results[0].finalLatex.includes("sqrt{2}"));
});
await test("named matrix result C is the actual operand in the next demand", async () => {
  const a = await solved(
    "A=[[1,2],[3,4]]؛ B=[[2,0],[0,2]]؛ احسب C=A*B ثم احسب محدد المصفوفة C",
  );
  assert.equal(a.results.length, 2);
  assert(a.results[1].finalLatex.includes("C=-8"));
  assert.deepEqual(
    readMatrix(a.context.matrices!.values.C).map((r) =>
      r.map((v) => v.number()),
    ),
    [
      [2, 4],
      [6, 8],
    ],
  );
});
await test("scalar quantities produced by matrices flow to scientific arithmetic", async () => {
  const a = await solved(
    "A=[[1,2],[3,4]]؛ B=[[1,0],[0,3]]؛ احسب S=det(A)+tr(B)",
  );
  const b = await solved("احسب S*3", a.context);
  assert.equal(b.results[0].engine, "mathEngine");
  assert.equal(Number(b.results[0].decimal), 6);
});
await test("single determinant ans flows to scientific engine, not an unrelated probability", async () => {
  const p = await solved(
    "كيس فيه3 حمراء و5 بيضاء، نسحب كرتين معا، احسب احتمال اختلاف اللون",
  );
  const a = await solved("احسب محدد المصفوفة B=[[1,2],[3,4]]", p.context);
  const b = await solved("احسب النتيجة السابقة * 3", a.context);
  assert.equal(b.results[0].engine, "mathEngine");
  assert.equal(Number(b.results[0].decimal), -6);
});
await test("a nonscalar matrix answer never inherits the old determinant ans", async () => {
  const a = await solved("احسب محدد المصفوفة A=[[1,2],[3,4]]");
  const b = await solved("جد منقول المصفوفة A", a.context);
  const c = await solve("احسب ans*2", b.context);
  assert.equal(c.results.length, 0);
  assert(c.unsolved.length);
});
await test("failed matrix demand invalidates scalar ans rather than consuming stale success", async () => {
  const a = await solved("احسب محدد المصفوفة A=[[1,2],[3,4]]");
  const b = await solve("احسب أثر المصفوفة A=[[1,2,3]]", a.context);
  assert(b.unsolved.length);
  const c = await solve("احسب ans*2", b.context);
  assert.equal(c.results.length, 0);
  assert(c.unsolved.length);
});
await test("school source labels, dependent failure and independent success survive", async () => {
  const a = await solve(
    "السؤال الثاني (10 درجات)\nA=[[1,2,3],[4,5,6]]\nالمطلوب:\n1) احسب أثر المصفوفة A\n2) استنتج معكوس المصفوفة A\n3) جد منقول المصفوفة A",
  );
  assert.equal(a.unsolved.length, 2);
  assert.equal(a.results.length, 1);
  assert.equal(a.results[0].school?.label, "3)");
  assert.equal(a.unsolved[1].school?.label, "2)");
});
await test("false square and false identity claims are tested rather than assumed", async () => {
  for (const q of [
    "A=[[1,2,3]]؛ تحقق أن المصفوفة A مربعة",
    "A=[[1,2],[0,1]]؛ تحقق أن المصفوفة A واحدية",
  ])
    assert(
      (await solved(q)).results[0].finalLatex.includes("العبارة غير صحيحة"),
    );
});
await test("a concrete polynomial-matrix identity is actually evaluated, not copied as a given", async () => {
  const a = await solved("A=[[1,2],[3,4]]؛ أثبت أن A^2-5A-2I=0");
  assert(a.results[0].finalLatex.includes("العبارة صحيحة"));
  assert(a.results[0].verification.passed);
  const b = await solved("A=[[1,2],[3,4]]؛ تحقق أن A^2-5A-I=0");
  assert(b.results[0].finalLatex.includes("العبارة غير صحيحة"));
});
await test("proof conclusions cannot define missing matrices", async () => {
  const a = await solve("أثبت أن A=[[1,2],[3,4]]");
  assert.equal(a.results.length, 0);
  assert(a.unsolved.length);
  assert.equal(a.context.matrices?.values.A, undefined);
});
await test("arbitrary matrix proof and symbolic parameters ask for clarification", async () => {
  for (const q of [
    "أثبت أن لكل مصفوفة A معكوس",
    "A=[[1,2],[3,4]]؛ أثبت أن رتبة المصفوفة A تساوي3",
    "احسب محدد المصفوفة A=[[a,2],[3,4]]",
  ])
    assert((await solve(q)).unsolved.length);
});
await test("Gauss records actual row swaps, coefficients and augmented matrices", async () => {
  const a = await solved("حل الجملة بطريقة غاوس: y=2، x+y=3");
  const r = a.results[0];
  assert(r.steps.some((s) => s.latex.includes("leftrightarrow")));
  assert(r.steps.some((s) => s.latex.includes("leftarrow")));
  assert(r.steps.some((s) => s.latex.includes("{cc|c}")));
  assert(r.verification.passed);
});
await test("Cramer replaces each column and independently agrees with Gauss and substitution", async () => {
  const a = await solved("حل الجملة بطريقة كرامر: 2x+y=5، x-y=1");
  const r = a.results[0];
  assert(r.steps.some((s) => s.latex.includes("Delta_{x}")));
  assert(r.steps.some((s) => s.latex.includes("Delta_{y}")));
  assert(r.verification.passed);
  assert.deepEqual(a.context.solutions, { x: 2, y: 1 });
  const b = await solved("حل الجملة السابقة بطريقة غاوس", a.context);
  assert.equal(b.results[0].finalLatex, r.finalLatex);
});
await test("singular systems clear stale named numerical solutions", async () => {
  const a = await solved("حل الجملة بطريقة غاوس: x+y=3، x-y=1");
  const b = await solved("حل الجملة بطريقة غاوس: x+y=2، 2x+2y=4", a.context);
  assert.equal(b.context.solutions, undefined);
  const c = await solved("حل الجملة بطريقة كرامر: x+y=2، 2x+2y=5", a.context);
  assert.equal(c.context.solutions, undefined);
});
await test("geometry-to-matrix bridge retains exact fractions/radicals and both contexts", async () => {
  const a = await solved(
    "حول الأشعة u=(√2,1/3,0)، v=(0,1,0)، w=(0,0,√2) إلى مصفوفة",
  );
  assert(a.context.geometry);
  assert(a.context.matrices);
  assert(readMatrix(a.context.matrices!.values.M)[0][0].eq(read("sqrt(2)")));
  const b = await solved("احسب محدد المصفوفة M", a.context);
  assert(b.results[0].finalLatex.includes("M=2"));
  assert(b.context.geometry);
});
await test("matrix-to-geometry bridge supplies the real named vectors for later dot products", async () => {
  const a = await solved("حول أسطر المصفوفة A=[[1/3,0,0],[3,1,0]] إلى أشعة");
  assert(a.context.matrices);
  const b = await solved("احسب الجداء السلمي للشعاعين u وv", a.context);
  assert.equal(b.results[0].engine, "geometryEngine");
  assert.equal(b.context.geometry?.lastScalar, 1);
});
await test("statistics-to-matrix rectangular bridge is exact and transposable", async () => {
  const a = await solved(
    "القيم=[1/3,2/3,1]، التكرارات=[1,2,3]، حول جدول التكرارات إلى مصفوفة",
  );
  assert(a.context.probability);
  const b = await solved("جد منقول المصفوفة M", a.context);
  assert(b.context.probability);
  assert(b.results[0].finalLatex.includes("frac{1}{3}"));
});
await test("matrix-to-statistics bridge keeps duplicates and never invents frequencies", async () => {
  const a = await solved(
    "حول كل عناصر المصفوفة A=[[1,1],[2,4]] إلى بيانات إحصائية",
  );
  assert.deepEqual(a.context.probability?.statistics?.values, [1, 1, 2, 4]);
  const b = await solved("احسب المتوسط فقط", a.context);
  assert.equal(b.context.probability?.lastScalar, 2);
});
await test("radical statistics bridge asks rather than silently approximating", async () => {
  const a = await solve(
    "حول كل عناصر المصفوفة A=[[√2,1],[2,3]] إلى بيانات إحصائية",
  );
  assert(a.unsolved.length);
});
await test("eigenvalue approximation remains an available unverified supplemental tool", async () => {
  const a = await solved("احسب القيم الذاتية للمصفوفة A=[[1,0],[0,2]]");
  assert(a.results[0].title.includes("تقريبية"));
  assert(!a.results[0].verification.passed);
});
await test("unrelated probability and complex prompts are never swallowed by matrix follow-up", async () => {
  const a = await solved("احسب محدد المصفوفة A=[[1,2],[3,4]]");
  const p = await solved(
    "كيس فيه3 حمراء و5 بيضاء، نسحب كرتين معا، احسب احتمال اختلاف اللون",
    a.context,
  );
  assert.equal(p.results[0].engine, "probabilityEngine");
  const z = await solved("اكتب الأشكال الثلاثة للعدد العقدي z=1+i", a.context);
  assert.equal(z.results[0].engine, "complexEngine");
});
for (const [name, question] of [
  ["missing cell", "احسب محدد A=[[1,],[3,4]]"],
  ["ragged rows", "احسب محدد A=[[1,2],[3]]"],
  ["bad bracket", "احسب محدد A=[[1,2],[3,4]"],
  ["duplicate name", "احسب محدد A=[[1,2],[3,4]] وA=[[2,0],[0,2]]"],
  ["nonfinite", "احسب محدد A=[[Infinity,0],[0,1]]"],
  ["oversized value", "احسب محدد A=[[1e10,0],[0,1]]"],
  ["division by zero", "احسب محدد A=[[1/0,0],[0,1]]"],
  ["unreviewed OCR", "احسب محدد A=[[V3,0],[0,1]]"],
  ["nonreal", "احسب محدد A=[[i,0],[0,1]]"],
  ["unknown second", "A=[[1,2],[3,4]]؛ احسب A*B"],
  ["bad expansion index", "احسب محدد A=[[1,2],[3,4]] بالنشر حسب العمود3"],
  ["fractional power", "A=[[1,2],[3,4]]؛ احسب A^(1/2)"],
  ["oversized power", "A=[[1,2],[3,4]]؛ احسب A^1000000"],
  ["matrix division", "A=[[1,2],[3,4]]؛ B=[[1,0],[0,1]]؛ احسب A/B"],
  ["singular negative power", "A=[[1,2],[2,4]]؛ احسب A^(-1)"],
  ["unsafe expression", "A=[[1,2],[3,4]]؛ احسب A.constructor()"],
] as const)
  await test(`safety: ${name}`, async () => {
    const a = await solve(question);
    assert(a.unsolved.length);
  });
await test("matrix storage guard rejects ragged, huge, malformed and prototype-shaped metadata", () => {
  for (const v of [
    null,
    { values: { A: [["1"], ["2", "3"]] } },
    { values: { A: [["1"]] }, active: "Z" },
    { values: { __proto__: [["1"]] }, active: "__proto__" },
    { values: { A: [["1"]] }, lastScalar: "fetch()" },
    { values: { A: Array.from({ length: 7 }, () => ["1"]) } },
    {
      values: { A: [["1"]] },
      system: {
        coefficients: [
          ["1", "2"],
          ["3", "4"],
        ],
        constants: ["1"],
        variables: ["x", "x"],
      },
    },
  ])
    assert(!isMatrixContext(v), JSON.stringify(v));
});
await test("school method honors the requested column instead of hardcoding the first row", async () => {
  const a = await solved(
    "احسب محدد A=[[1,2,3],[0,4,5],[1,0,6]] بالنشر حسب العمود الثاني",
  );
  assert(a.results[0].steps.some((s) => s.title === "النشر بحسب العمود 2"));
});
await test("raw det/tr abbreviations do not replace the requested Arabic matrix names in final answers", async () => {
  for (const q of [
    "احسب محدد المصفوفة B=[[1,2],[3,4]]",
    "احسب أثر المصفوفة B=[[1,2],[3,4]]",
  ]) {
    const a = await solved(q);
    assert(!/\\det|operatorname\{tr\}|\bdet\b/.test(a.results[0].finalLatex));
    assert(a.results[0].title.includes("B"));
  }
});
await test("the expression parser is bounded and cannot run property access or arbitrary functions", () => {
  const values = {
    A: [
      ["1", "2"],
      ["3", "4"],
    ],
  };
  for (const s of [
    "A.constructor()",
    "import(A)",
    "A[1]",
    "A^100000000",
    "A;process.exit()",
    "sqrt(-1)*A",
  ])
    assert.throws(() => matrixExpression(s, values));
  assert(
    equalMatrices(
      matrixExpression("A^T", values).value as ReturnType<typeof readMatrix>,
      readMatrix([
        ["1", "3"],
        ["2", "4"],
      ]),
    ),
  );
  assert(classify(readMatrix([["0"]])).some((c) => c.name.includes("صفرية")));
  assert.deepEqual(serializeMatrix(adjugate(readMatrix([["0"]]))), [["(1)"]]);
});
await test("extractor normalizes a custom requested determinant method and retains the actual operand", () => {
  const r = extractMatrixRequest(
    normalizePrompt("أحسب محدد B=[[1,2,3],[0,4,5],[1,0,6]] بطريقة ساروس"),
    emptyContext(),
  );
  assert.equal(r.name, "B");
  assert.equal(r.context.active, "B");
  assert.equal(r.determinantMethod, "sarrus");
});
await test("named matrices in the question use mathematical brackets, fractions and radicals", () => {
  for (const text of [
    "لتكن A=[[1,2],[3,4]]",
    "لتكن B=[[1/3,√2],[0,1]]",
    "لتكن A=[[١,٢],[٣,٤]]",
  ]) {
    const html = renderToStaticMarkup(
      createElement(RichText, { text, autoMath: true }),
    );
    assert(html.includes("pmatrix"), html);
    assert(!html.includes("katex-error"));
    assert(!html.includes("تعذّر عرض"));
  }
});
await test("matrix-form AX=B uses the actual RHS column instead of reducing A alone", async () => {
  const a = await solved(
    "لتكن A=[[1,1],[1,-1]] وB=[[3],[1]]، حل الجملة AX=B بطريقة كرامر",
  );
  assert(a.results[0].finalLatex.includes("x=2"));
  assert(a.results[0].finalLatex.includes("y=1"));
});
await test("identities and explicitly zero coefficient columns retain the free unknown", async () => {
  for (const q of [
    "حل الجملة بطريقة غاوس: x+y=2، 0=0",
    "حل الجملة بطريقة غاوس: x=2، y-y=0",
  ]) {
    const a = await solved(q);
    assert(a.results[0].finalLatex.includes("عدد غير منته"));
    assert(a.results[0].verification.passed);
  }
});
await test("inline givens before a bridge verb are not mistaken for a setup-only declaration", async () => {
  for (const demand of [
    "حول أسطر المصفوفة A إلى أشعة",
    "حول كل عناصر المصفوفة A إلى بيانات إحصائية",
  ]) {
    const literal = demand.includes("أشعة")
      ? "[[1,0,0],[0,1,0]]"
      : "[[1,2],[3,4]]";
    const a = await solved(`لتكن المصفوفة A=${literal}، ${demand}`);
    assert(
      a.results[0].contextPatch?.geometry ||
        a.results[0].contextPatch?.probability,
    );
  }
});
await test("a derived coefficient matrix never overwrites the user's previous A", async () => {
  const given = await solved("احسب محدد المصفوفة A=[[9,0],[0,9]]");
  const system = await solved(
    "حل الجملة بطريقة غاوس: x+y=3، x-y=1",
    given.context,
  );
  assert.deepEqual(
    system.context.matrices?.values.A,
    given.context.matrices?.values.A,
  );
  assert.equal(system.context.matrices?.active, "M");
  const repeated = await solved(
    "حل الجملة السابقة بطريقة كرأمر",
    system.context,
  );
  assert.deepEqual(
    Object.keys(repeated.context.matrices!.values),
    Object.keys(system.context.matrices!.values),
    "repeating the method reuses the same coefficient alias",
  );
  const determinant = await solved("احسب محدد المصفوفة A", system.context);
  assert(determinant.results[0].finalLatex.endsWith("=81"));
});
await test("CX=B uses and labels C without renaming it to a different existing A", async () => {
  const given = await solved("احسب محدد المصفوفة A=[[9,0],[0,9]]");
  const a = await solved(
    "C=[[1,1],[1,-1]]، B=[[3],[1]]، حل CX=B بطريقة كرأمر",
    given.context,
  );
  assert(a.results[0].finalLatex.includes("x=2"));
  assert(a.results[0].steps.some((s) => s.latex?.includes("\\Delta=|C|")));
  assert.equal(a.context.matrices?.active, "C");
  assert.deepEqual(
    a.context.matrices?.values.A,
    given.context.matrices?.values.A,
  );
});
await test("compound unary demands bind the actual operand and preserve the requested order", async () => {
  const givens = "لتكن A=[[1,2],[3,4]] وB=[[1,2],[3,7]]، ";
  for (const [demand, names, values] of [
    ["احسب محدد المصفوفة A وأثر المصفوفة B", ["A", "B"], ["=-2", "=8"]],
    ["احسب أثر المصفوفة B ومحدد المصفوفة A", ["B", "A"], ["=8", "=-2"]],
    ["احسب tr(B) وdet(A)", ["B", "A"], ["=8", "=-2"]],
  ] as const) {
    const a = await solved(givens + demand);
    assert.equal(a.results.length, 2);
    a.results.forEach((r, i) => {
      assert(r.title.includes(names[i]));
      assert(r.finalLatex.endsWith(values[i]));
      assert(r.verification.passed);
    });
  }
});
await test("a repeated operation on two named matrices is not deduplicated", async () => {
  const a = await solved(
    "A=[[1,2],[3,4]]؛ B=[[1,2],[3,7]]؛ احسب محدد A ومحدد B وأثر B",
  );
  assert.deepEqual(
    a.results.map((r) => r.title),
    ["محدد المصفوفة A", "محدد المصفوفة B", "أثر المصفوفة B"],
  );
  assert(a.results[0].finalLatex.endsWith("=-2"));
  assert(a.results[1].finalLatex.endsWith("=1"));
  assert(a.results[2].finalLatex.endsWith("=8"));
});
await test("one numbered compound demand keeps its source label for both operands", async () => {
  const a = await solved(
    "السؤال الأول\nA=[[1,2],[3,4]]\nB=[[1,2],[3,7]]\nالمطلوب:\nأ) احسب أثر B ومحدد A\nب) جد منقول B",
  );
  assert.equal(a.results.length, 3);
  assert.deepEqual(
    a.results.map((r) => r.school?.label),
    ["أ)", "أ)", "ب)"],
  );
  assert(a.results[0].finalLatex.endsWith("=8"));
  assert(a.results[1].finalLatex.endsWith("=-2"));
});
await test("a failed determinant does not block a separate explicit trace joined by waw", async () => {
  for (const q of [
    "A=[[1,2,3],[4,5,6]]؛ B=[[1,2],[3,7]]؛ احسب محدد A وأثر B",
    "A=[[1,2,3],[4,5,6]]\nB=[[1,2],[3,7]]\nالمطلوب:\n1) احسب محدد A وأثر B",
  ]) {
    const a = await solve(q);
    assert.equal(a.unsolved.length, 1);
    assert.equal(a.results.length, 1);
    assert.equal(a.results[0].title, "أثر المصفوفة B");
    assert(a.results[0].finalLatex.endsWith("=8"));
  }
});
await test("splitting matrix requests never cuts an arithmetic expression or a nested matrix", async () => {
  for (const q of [
    "احسب S=det(A)+tr(B)",
    "احسب S=det(A) وtr(B)",
    "احسب محدد ومقلوب المصفوفة [[1,2],[3,4]]",
    "احسب det(A+tr(B)*I)",
  ])
    assert.deepEqual(splitMatrixDemands(normalizePrompt(q)), [
      normalizePrompt(q),
    ]);
  for (const demand of ["تحقق أن det(A)=-2 وtr(B)=8", "احسب S=det(A) وtr(B)"]) {
    const a = await solve(`لتكن A=[[1,2],[3,4]] وB=[[1,2],[3,7]]، ${demand}`);
    assert.equal(a.results.length, 0);
    assert.equal(a.unsolved.length, 1);
  }
});
await test("the chosen last cofactor row/column is reflected in real steps", async () => {
  const cells = "A=[[1,2,3],[0,4,5],[1,0,6]]";
  for (const [description, title] of [
    ["العمود الأخير", "العمود 3"],
    ["السطر الأخير", "السطر 3"],
    ["الصف الثاني", "السطر 2"],
    ["العمود 2", "العمود 2"],
  ]) {
    const a = await solved(
      `احسب محدد المصفوفة ${cells} بالنشر حسب ${description}`,
    );
    assert(a.results[0].steps.some((s) => s.title === `النشر بحسب ${title}`));
    assert(a.results[0].verification.passed);
  }
});
await test("an unsupported cofactor index asks rather than silently choosing row one", async () => {
  for (const position of [
    "العمود السابع",
    "العمود الأوسط",
    "السطر",
    "العمود 0",
  ]) {
    const a = await solve(
      `احسب محدد A=[[1,2,3],[0,4,5],[1,0,6]] بالنشر حسب ${position}`,
    );
    assert.equal(a.results.length, 0);
    assert.equal(a.unsolved.length, 1);
  }
});
await test("unit and upper/lower adjective aliases verify the actual elements, including false claims", async () => {
  const unit = await solved("لتكن A=[[1,0],[0,1]]، تحقق أن A مصفوفة وحدة");
  assert(unit.results[0].finalLatex.includes("العبارة صحيحة"));
  const notUnit = await solved("لتكن A=[[1,2],[0,1]]، تحقق أن A مصفوفة وحدة");
  assert(notUnit.results[0].finalLatex.includes("العبارة غير صحيحة"));
  const lower = await solved("لتكن A=[[2,0],[3,4]]، تحقق أن A مثلثية سفلية");
  assert(lower.results[0].finalLatex.includes("العبارة صحيحة"));
});
await test("LaTeX cases/aligned equations retain exact fractions and actual Cramer deltas", async () => {
  const a = await solved(
    String.raw`حل الجملة بطريقة كرامر: \begin{aligned}\frac{1}{2}x+y&=2\\x-y&=1\end{aligned}`,
  );
  assert(a.results[0].finalLatex.includes("x=2"));
  assert(a.results[0].verification.passed);
  assert(a.results[0].steps.some((s) => s.latex?.includes("\\Delta_{x}")));
  assert(
    !normalizePrompt(
      String.raw`\begin{cases}\frac12x+y=2\\x-y=1\end{cases}`,
    ).includes("{cases}*"),
  );
});
await test("Gaussian elimination wording cannot steal a Gaussian probability distribution", async () => {
  const matrix = await solved("احسب محدد A=[[1,2],[3,4]]");
  const system = await solved(
    "حل الجملة بالحذف الغاوسي: x+y=3، x-y=1",
    matrix.context,
  );
  assert.equal(system.results[0].engine, "matricesEngine");
  assert(system.results[0].steps.some((s) => s.latex?.includes("L_{")));
  const normal = await solved(
    "التوزيع الغاوسي mu=0 sigma=1 x=1",
    system.context,
  );
  assert.equal(normal.results[0].engine, "probabilityEngine");
});
await test("an explicitly named k is exact, persisted and reusable without changing its matrix", async () => {
  const a = await solved("لتكن A=[[1,2],[3,4]] وk=1/3، احسب k*A");
  assert.equal(a.context.matrices?.scalarFactor, "(1/3)");
  const b = await solved("احسب k*A", JSON.parse(JSON.stringify(a.context)));
  assert.equal(a.results[0].finalLatex, b.results[0].finalLatex);
  assert(b.results[0].verification.passed);
  assert(
    equalMatrices(
      readMatrix(a.context.matrices!.values.A),
      readMatrix([
        ["1", "2"],
        ["3", "4"],
      ]),
    ),
  );
});
await test("zero and radical k values multiply every element and never become a determinant alias", async () => {
  for (const [factor, cells] of [
    [
      "0",
      [
        ["0", "0"],
        ["0", "0"],
      ],
    ],
    [
      "√2",
      [
        ["sqrt(2)", "2*sqrt(2)"],
        ["3*sqrt(2)", "4*sqrt(2)"],
      ],
    ],
  ] as const) {
    const a = await solved(`لتكن A=[[1,2],[3,4]] وk=${factor}، احسب C=k*A`);
    assert(
      equalMatrices(
        readMatrix(a.context.matrices!.values.C),
        readMatrix(cells.map((r) => [...r])),
      ),
    );
  }
  const determinant = await solved("احسب محدد A=[[1,2],[3,4]]");
  const missing = await solve("احسب k*A", determinant.context);
  assert.equal(missing.results.length, 0);
  assert.equal(missing.unsolved.length, 1);
});
await test("a factor assertion is not harvested as a given and malformed factors do not run code", async () => {
  for (const q of [
    "لتكن A=[[1,2],[3,4]]، تحقق أن k=2",
    "لتكن A=[[1,2],[3,4]] وk=1/0، احسب k*A",
    "لتكن A=[[1,2],[3,4]] وk=globalThis.process.exit()، احسب k*A",
  ]) {
    const a = await solve(q);
    assert.equal(a.results.length, 0);
    assert.equal(a.unsolved.length, 1);
  }
  assert(
    !isMatrixContext({ values: { A: [["1"]] }, scalarFactor: "alert(1)" }),
  );
});
await test("a given exact factor survives the matrix/vector bridge and its return", async () => {
  const a = await solved(
    "لتكن A=[[1,0,0],[0,1,0]] وk=1/3، حول أسطر المصفوفة A إلى أشعة",
  );
  const b = await solved("حول الأشعة u وv إلى مصفوفة", a.context);
  assert.equal(b.context.matrices?.scalarFactor, "(1/3)");
  const c = await solved("احسب k*M", b.context);
  assert(c.results[0].finalLatex.includes("\\frac{1}{3}"));
});
await test("an unrelated coordinate tuple cannot overwrite a previous named matrix when saving k", async () => {
  const a = await solved("احسب محدد A=[[9,0],[0,9]]");
  const context = prepareMatrixContext("A=(1,2,3)، k=1/2", a.context);
  assert.deepEqual(context.matrices?.values.A, a.context.matrices?.values.A);
  assert.equal(context.matrices?.scalarFactor, "(1/2)");
});
await test("preserving the command اضرب does not break spoken multiplication", async () => {
  assert(normalizePrompt("اضرب المصفوفة A بالعدد 2").startsWith("اضرب"));
  assert.equal(normalizePrompt("احسب ٣ ضرب ٤"), "احسب 3 * 4");
  const a = await solved("اضرب المصفوفة A=[[1,2],[3,4]] بالعدد 1/2");
  assert(a.results[0].finalLatex.includes("\\frac{3}{2}"));
  const product = await solved(
    "A=[[1,2],[3,4]]؛ B=[[2,0],[0,2]]؛ اضرب المصفوفة A في المصفوفة B",
  );
  assert(product.results[0].finalLatex.includes("2&4\\\\6&8"));
});

await test("complete LaTeX systems render as one mathematical block instead of two hidden fallback messages", () => {
  for (const text of [
    String.raw`حل الجملة: \begin{cases}س+ص+ع=6\\س-ص=-1\\ص-ع=-1\end{cases}`,
    String.raw`حل الجملة: \begin{aligned}\frac{1}{2}x+y&=2\\x-y&=1\end{aligned}`,
  ]) {
    const html = renderToStaticMarkup(
      createElement(RichText, { text, autoMath: true }),
    );
    assert(!html.includes("تعذّر عرض"));
    assert(!html.includes("data-math-error"));
    assert(!html.includes("katex-error"));
    assert(html.includes("katex-display"));
  }
});
await test("Gauss checks an extra contradictory equation instead of solving only a convenient pair", async () => {
  const a = await solved("حل الجملة بطريقة غاوس: x+y=3، x-y=1، 2x=5");
  assert(a.results[0].finalLatex.includes("varnothing"));
  assert(a.results[0].verification.passed);
  assert.equal(a.context.solutions, undefined);
});
await test("two equations in three unknowns produce the entire verified affine family", async () => {
  const a = await solved("حل الجملة بطريقة غاوس: x+y+z=3، x-y=1");
  assert(a.results[0].finalLatex.includes("غير منته"));
  assert(a.results[0].finalLatex.includes("z=t"));
  assert(a.results[0].verification.passed);
  assert.equal(a.context.solutions, undefined);
});
await test("free parameters never collide with t and s as actual unknown names", async () => {
  const a = await solved("حل الجملة بطريقة غاوس: t+s=2، 2t+2s=4، 3t+3s=6");
  assert(a.results[0].finalLatex.includes("s=r"));
  assert(!a.results[0].finalLatex.includes("s=t"));
  assert(a.results[0].verification.passed);
});
await test("Cramer explicitly refuses a rectangular system rather than inventing a determinant", async () => {
  const a = await solve("حل الجملة بطريقة كرامر: x+y=3، x-y=1، 2x=4");
  assert.equal(a.results.length, 0);
  assert.equal(a.unsolved.length, 1);
  assert(a.unsolved[0].message.includes("مساويًا"));
  assert.deepEqual(a.unsolved[0].choices, ["حل الجملة السابقة بطريقة غاوس"]);
  const b = await solved("حل الجملة السابقة بطريقة غاوس", a.context);
  assert(b.results[0].finalLatex.includes("x=2"));
  assert(b.results[0].finalLatex.includes("y=1"));
});
await test("rectangular CX=B uses the actual RHS, coefficient name and every row", async () => {
  const a = await solved(
    "C=[[1,1],[1,-1],[2,0]]، B=[[3],[1],[4]]، حل CX=B بطريقة غاوس",
  );
  assert(a.results[0].finalLatex.includes("x=2"));
  assert(a.results[0].finalLatex.includes("y=1"));
  assert.equal(a.context.matrices?.active, "C");
  assert(a.results[0].verification.passed);
});
await test("a specifically named augmented operand overrides an unrelated saved system", async () => {
  const a = await solved("حل الجملة بطريقة غاوس: x+y=3، x-y=1");
  const context = {
    ...a.context,
    matrices: {
      ...a.context.matrices!,
      values: {
        ...a.context.matrices!.values,
        M: [
          ["1", "1", "5"],
          ["1", "-1", "1"],
        ],
      },
    },
  };
  const b = await solved(
    "حل الجملة من المصفوفة الموسعة M بطريقة غاوس",
    context,
  );
  assert(b.results[0].finalLatex.includes("x=3"));
  assert(b.results[0].finalLatex.includes("y=2"));
  assert(b.results[0].verification.passed);
});
await test("school-system givens survive a formatted preamble and both requested methods", async () => {
  const a = await solved(
    "السؤال الثاني (10 درجات)\nالجملة: x+y=3، x-y=1\nالمطلوب:\nأ) حل بطريقة غاوس\nب) حل بطريقة كرامر",
  );
  assert.equal(a.results.length, 2);
  assert.deepEqual(
    a.results.map((r) => r.school?.label),
    ["أ)", "ب)"],
  );
  assert(
    a.results.every(
      (r) =>
        r.finalLatex.includes("x=2") &&
        r.finalLatex.includes("y=1") &&
        r.verification.passed,
    ),
  );
});
await test("rectangular-system storage remains bounded and saved t/s solutions stay usable in arithmetic", async () => {
  assert(
    !isMatrixContext({
      values: {},
      system: {
        coefficients: Array.from({ length: 7 }, () => ["1", "1"]),
        constants: Array(7).fill("1"),
        variables: ["x", "y"],
      },
    }),
  );
  assert(
    !isMatrixContext({
      values: {},
      system: {
        coefficients: [
          ["1", "1", "1", "1"],
          ["1", "1", "1", "1"],
        ],
        constants: ["1", "1"],
        variables: ["x", "y", "z", "t"],
      },
    }),
  );
  const a = await solved("حل الجملة بطريقة غاوس: t=1، s=2، t+s=3");
  const b = await solved("احسب t+s", JSON.parse(JSON.stringify(a.context)));
  assert.equal(Number(b.results[0].decimal), 3);
  const named = await solved("احسب محدد المصفوفة A=[[1,2],[3,4]]");
  for (const name of ["A1", "A_{1}"]) {
    const unknown = await solve(`احسب محدد المصفوفة ${name}`, named.context);
    assert.equal(unknown.results.length, 0);
    assert.equal(unknown.unsolved.length, 1);
  }
  const invalid = await solve("حل الجملة بطريقة غاوس: t*s=1، t+s=3", a.context);
  assert.equal(invalid.results.length, 0);
  assert.equal(invalid.context.solutions, undefined);
  assert.equal(invalid.context.matrices?.system, undefined);
  assert.equal(invalid.context.assignments.t, undefined);
});

if (process.env.MATRIX_OUTPUT)
  fs.writeFileSync(
    process.env.MATRIX_OUTPUT,
    JSON.stringify(
      {
        corpus: {
          total: corpus.cases.length,
          completeExpected: corpus.cases.filter((c) => c.expect === "answer")
            .length,
          clarificationExpected: corpus.cases.filter(
            (c) => c.expect === "clarify",
          ).length,
        },
        passed,
        failed,
        results: records,
      },
      null,
      2,
    ) + "\n",
  );
console.log(`\nMatrices regression: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
