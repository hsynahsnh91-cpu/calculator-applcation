import assert from "node:assert/strict";
import fs from "node:fs";
import katex from "katex";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import corpus from "./fixtures/space-school.json";
import { solvePrompt } from "../src/solver/orchestrator";
import {
  emptyContext,
  type SolverContext,
  type SolverAnswer,
} from "../src/solver/types";
import { isConversationTurn } from "../src/solver/validation";
import { isGeometryContext } from "../src/solver/geometryTypes";
import { normalizePrompt } from "../src/solver/parser";
import { prepareSpaceContext } from "../src/solver/extractors/geometry";
import { splitSpaceDemands } from "../src/solver/spaceDemands";
import {
  read,
  vector,
  cross,
  zeroV,
  dot,
  sub,
} from "../src/utils/spaceGeometryMath";
import { AnswerBubble } from "../src/components/chat/AnswerBubble";
import {
  geometryFormOperations,
  geometryFormQuestion,
  geometryFormExample,
  geometryFormInitial,
  geometryFormOperation,
} from "../src/components/geometry/GeometryBoard";
let passed = 0,
  failed = 0;
const records: object[] = [],
  answers = new Map<string, SolverAnswer>();
async function test(name: string, fn: () => unknown | Promise<unknown>) {
  try {
    await fn();
    passed++;
    records.push({ name, pass: true });
    console.log("PASS", name);
  } catch (e) {
    failed++;
    records.push({ name, pass: false, error: String(e) });
    console.error("FAIL", name, e);
  }
}
function valid(a: SolverAnswer) {
  assert(
    isConversationTurn(
      JSON.parse(
        JSON.stringify({
          id: a.id,
          question: a.question,
          answer: a,
          createdAt: Date.now(),
        }),
      ),
    ),
  );
  for (const r of a.results) {
    assert(!/NaN|Infinity|undefined/.test(r.finalLatex));
    for (const tex of [r.finalLatex, ...r.steps.map((s) => s.latex)])
      if (tex)
        katex.renderToString(tex, { throwOnError: true, strict: "ignore" });
  }
}
async function solve(q: string, context?: SolverContext) {
  const a = await solvePrompt(q, { angleMode: "DEG", context });
  valid(a);
  return a;
}
async function solved(q: string, context?: SolverContext) {
  const a = await solve(q, context);
  assert.equal(a.unsolved.length, 0, JSON.stringify(a.unsolved));
  assert(a.results.length);
  return a;
}
function tuple(a: SolverAnswer, kind: "points" | "vectors", name: string) {
  return a.context.geometry![kind][name].map((s) => read(s).number());
}
for (const c of corpus.cases)
  await test(`space ${c.id}: ${c.title}`, async () => {
    const a = await solve(c.question);
    answers.set(c.id, a);
    assert.equal(a.results.length, c.resultCount, JSON.stringify(a.unsolved));
    assert.equal(
      a.unsolved.length,
      c.expect === "answer" ? 0 : 1,
      JSON.stringify(a.unsolved),
    );
    const final = a.results.map((r) => r.finalLatex).join("\n");
    for (const needle of c.contains)
      assert(final.includes(needle), `${needle}: ${final}`);
  });
await test("symbolic vector operations and norms use the actual exact coordinates", () => {
  assert.deepEqual(tuple(answers.get("S05")!, "vectors", "w"), [3, 1, 3]);
  assert.deepEqual(tuple(answers.get("S06")!, "vectors", "w"), [-1, 3, 3]);
  assert.deepEqual(tuple(answers.get("S07")!, "vectors", "w"), [0.5, 1, 1.5]);
  assert.equal(answers.get("S03")!.context.geometry!.lastScalar, 7);
});
await test("two requested geometric operands stay distinct and preserve their parent label", async () => {
  const a = await solved(
    "السؤال الثاني\nA(0,0,0)، B(1,0,0)، C(0,1,0)\nالمطلوب:\nأ) احسب إحداثيات الشعاعين AC وAB\nب) احسب طويلة الشعاع AB",
  );
  assert.deepEqual(
    a.results.map((r) => r.school?.label),
    ["أ)", "أ)", "ب)"],
  );
  assert.deepEqual(a.results[0].contextPatch!.geometry!.inputs!.points, [
    "A",
    "C",
  ]);
  assert.deepEqual(a.results[1].contextPatch!.geometry!.inputs!.points, [
    "A",
    "B",
  ]);
  assert.equal(a.results[2].decimal, 1);
});
await test("plural normal requests bind each named plane instead of reusing the first", async () => {
  const a = await solved("P: x=1، Q: 2y+3z=4، جد ناظمي المستويين Q وP");
  assert.equal(a.results.length, 2);
  assert.deepEqual(
    a.results.map((r) => r.contextPatch?.geometry?.inputs?.planes),
    [["Q"], ["P"]],
  );
  assert(a.results[0].finalLatex.includes("3"));
  assert(a.results[1].finalLatex.includes("1"));
});
await test("weighted pairs bind weights by point name, reject duplicate points, and detect zero total weight", async () => {
  const a = await solved(
    "A(0,0,0)، B(3,0,0)، C(100,100,100)، جد مرجح الجملة المثقلة {(B,2),(A,1)}",
  );
  assert.deepEqual(tuple(a, "points", "G"), [2, 0, 0]);
  assert.deepEqual(a.context.geometry?.inputs?.points, ["B", "A"]);
  assert(answers.get("S20")!.unsolved[0].message.includes("مجموع الأوزان صفر"));
  const bad = await solve(
    "A(0,0,0)، B(3,0,0)، جد مركز الأبعاد للجملة {(A,1),(A,2)}",
  );
  assert.equal(bad.results.length, 0);
  assert.equal(bad.unsolved.length, 1);
});
await test("two/three/four-point barycenters retain actual input vertices and exact weighted residuals", () => {
  for (const [id, expected] of [
    ["S19", [-3, 0, 0]],
    ["S21", [1.5, -1.5, 0]],
    ["S22", [1, 1, 1]],
    ["S23", [1, 1, 0]],
    ["S24", [2, 2, 0]],
  ] as const) {
    const a = answers.get(id)!;
    assert.deepEqual(tuple(a, "points", "G"), expected);
    assert(a.results[0].verification.passed);
    assert(!a.context.geometry?.inputs?.points.includes("G"));
  }
});
await test("midpoints are derived from declarations, never manufactured from a requested proof", async () => {
  const given = prepareSpaceContext(
    normalizePrompt("A(0,0,0)، B(2,0,0)، لتكن I منتصف AB"),
    emptyContext(),
  );
  assert.deepEqual(
    given.geometry?.points.I.map((s) => read(s).number()),
    [1, 0, 0],
  );
  assert.equal(given.geometry?.lastScalar, undefined);
  const untouched = prepareSpaceContext(
    normalizePrompt("أثبت أن J منتصف AB"),
    given,
  );
  assert.equal(untouched.geometry?.points.J, undefined);
  const bad = await solve("A(0,0,0)، B(2,0,0)، أثبت أن J منتصف AB");
  assert.equal(bad.results.length, 0);
  assert.equal(bad.unsolved.length, 1);
});
await test("a false basis claim is refuted by rank, not disguised as a scene or an orthonormal basis", async () => {
  const a = await solved(
    "تحقق أن الأشعة u=(1,0,0) وv=(0,1,0) وw=(1,1,0) تشكل أساسا للفراغ",
  );
  assert(a.results[0].finalLatex.includes("مرتبطة"));
  assert(a.results[0].steps.some((s) => s.latex.includes("لا تشكل أساس")));
  assert(a.results[0].verification.passed);
  const unsupported = await solve(
    "u=(1,0,0)، أثبت كل العلاقات الهندسية المطلوبة",
  );
  assert.equal(unsupported.results.length, 0);
  assert.equal(unsupported.unsolved.length, 1);
});
await test("dot-product notation is not a cross product and a false perpendicular claim stays visibly false", async () => {
  const a = await solved(
    String.raw`u=(1,0,0)، v=(0,1,0)، احسب \vec{u}\times\vec{v}`,
  );
  assert.deepEqual(tuple(a, "vectors", "w"), [0, 0, 1]);
  assert(answers.get("S27")!.results[0].finalLatex.includes("غير متعامدين"));
  assert(
    answers
      .get("S30")!
      .results[0].steps.some(
        (s) => s.text?.includes("المعدوم") || s.latex.includes("المعدوم"),
      ),
  );
});
await test("the perpendicular foot satisfies its plane, normal direction and exact distance", () => {
  const a = answers.get("S49")!,
    g = a.context.geometry!,
    m = vector(g.points.M),
    h = vector(g.points.H),
    n = vector(g.planes.P.normal);
  assert(dot(n, h).add(read(g.planes.P.offset)).zero());
  assert(zeroV(cross(sub(m, h), n)));
  assert(read(g.lastScalarExpression!).eq(read("1/3")));
  assert.deepEqual(tuple(a, "points", "M"), [1, 2, 3]);
});
await test("failed geometric parsing cannot leak an earlier height into a numeric follow-up", async () => {
  const good = answers.get("S49")!;
  const bad = await solve(
    "M(1,2,3)، P: 0x+0y+0z=0، احسب بعد M عن المستوي P",
    good.context,
  );
  assert.equal(bad.results.length, 0);
  assert.equal(bad.context.geometry?.lastScalar, undefined);
  const next = await solve("احسب النتيجة الهندسية السابقة * 3", bad.context);
  assert.equal(next.results.length, 0);
  assert.equal(next.unsolved.length, 1);
});
await test("an independent geometry demand survives an earlier matrix failure with all givens and source label", () => {
  const a = answers.get("S62")!;
  assert.equal(a.results[0].school?.label, "ب)");
  assert.equal(a.results[0].decimal, 2);
  assert.equal(a.unsolved[0].school?.label, "أ)");
});
await test("the line-intersection bridge carries all three equations and its actual t/s solution", () => {
  const a = answers.get("S61")!,
    sys = a.context.matrices!.system!;
  assert.equal(sys.coefficients.length, 3);
  assert.deepEqual(sys.variables, ["t", "s"]);
  const [one, two] = [
      a.context.geometry!.lines.D1,
      a.context.geometry!.lines.D2,
    ],
    t = read(String(a.context.solutions!.t)),
    s = read(String(a.context.solutions!.s));
  for (let i = 0; i < 3; i++)
    assert(
      read(one.point[i])
        .add(read(one.direction[i]).mul(t))
        .eq(read(two.point[i]).add(read(two.direction[i]).mul(s))),
    );
  assert(a.results[1].verification.passed);
});
await test("every geometry operation has two meaningfully different solved examples", async () => {
  for (const op of geometryFormOperations) {
    const q1 = geometryFormQuestion(op, geometryFormExample(op, 0)),
      q2 = geometryFormQuestion(op, geometryFormExample(op, 1));
    assert.notEqual(q1, q2, op.id);
    const a = await solved(q1),
      b = await solved(q2);
    assert.notEqual(a.results[0].finalLatex, b.results[0].finalLatex, op.id);
  }
});
await test("loading a solid example preserves the selected solid and changes its real dimensions", async () => {
  const op = geometryFormOperations.find((o) => o.id === "solid")!;
  for (const id of [
    "cube",
    "cuboid",
    "sphere",
    "cylinder",
    "cone",
    "pyramid",
    "triangularPrism",
  ]) {
    const current = { ...geometryFormExample(op, 0), solid: id };
    const one = geometryFormExample(op, 0, current),
      two = geometryFormExample(op, 1, current);
    assert.equal(one.solid, id);
    assert.equal(two.solid, id);
    const a = await solved(geometryFormQuestion(op, one)),
      b = await solved(geometryFormQuestion(op, two));
    assert.notEqual(a.results[0].finalLatex, b.results[0].finalLatex, id);
  }
});
await test("geometric-dot examples preserve radians/grads and their explicit unit beats the global setting", async () => {
  const op = geometryFormOperations.find((o) => o.id === "geometric-dot")!;
  for (const unit of ["RAD", "GRAD"]) {
    const current = { ...geometryFormExample(op, 0), unit };
    for (const i of [0, 1]) {
      const f = geometryFormExample(op, i, current);
      assert.equal(f.unit, unit);
      const a = await solved(geometryFormQuestion(op, f));
      assert(a.results[0].finalLatex.includes(i ? "=0" : "=6"));
    }
  }
});
await test("reopening named plane/line/center answers preserves their output aliases as well as input data", async () => {
  for (const [q, id, name] of [
    [
      "A(1,2,3)، n=(1,0,0)، جد معادلة المستوي Q من النقطة A والشعاع الناظم n",
      "plane-normal",
      "Q",
    ],
    [
      "A(1,2,3)، u=(0,1,0)، جد التمثيل البارامتري للمستقيم L من النقطة A والشعاع الموجه u",
      "line-direction",
      "L",
    ],
    [
      "A(0,0,0)، B(3,0,0)، C(0,3,0)، جد مركز الأبعاد المتناسبة K، الأوزان=[1,1,1]",
      "barycenter",
      "K",
    ],
  ]) {
    const a = await solved(q);
    const f = geometryFormInitial(a.context.geometry);
    const op = geometryFormOperations.find((o) => o.id === id)!;
    const source = geometryFormQuestion(op, f);
    assert(source.includes(name));
    const b = await solved(source, a.context);
    assert(
      b.results[0].finalLatex.includes(name),
      `${id} ${source} => ${b.results[0].finalLatex}`,
    );
  }
});
await test("all six matrix rows can be reopened as vectors and returned without silent truncation", async () => {
  const a = await solved(
    "حول أسطر المصفوفة A=[[1,0,0],[0,1,0],[0,0,1],[1,1,0],[0,1,1],[1,0,1]] إلى أشعة",
  );
  const f = geometryFormInitial(a.context.geometry);
  assert.equal(f.vectorCount, "6");
  assert.equal(geometryFormOperation(a.context.geometry), "matrix");
  const op = geometryFormOperations.find((o) => o.id === "matrix")!;
  const b = await solved(geometryFormQuestion(op, f), a.context);
  assert.equal(
    b.context.matrices!.values[b.context.matrices!.active!].length,
    6,
  );
  assert.equal(b.context.geometry!.inputs!.vectors.length, 6);
});
await test("completed submitted answers contain their final result, steps and actions immediately even with animation enabled", () => {
  const a = answers.get("S49")!;
  const html = renderToStaticMarkup(
    createElement(AnswerBubble, {
      answer: a,
      animate: true,
      saved: false,
      onSave: () => {},
      onFollowUp: () => {},
    }),
  );
  assert(html.includes("final-answer"));
  assert(html.includes("steps-block"));
  assert(html.includes("قانون البعد"));
  assert(html.includes("حفظ في السجل"));
});
await test("geometry splitting stays bounded and never separates a single algebra/proof expression", async () => {
  for (const q of [
    "تحقق أن AB+AC=AD",
    "احسب u+v-w",
    "احسب الجداء السلمي للشعاعين u وv",
    "احسب طويلتي الشعاعين u وu",
  ]) {
    assert.deepEqual(splitSpaceDemands(q), [q]);
  }
  for (const demand of ["احسب طويلة الشعاع u+v", "احسب طويلة الشعاع 2u"]) {
    const a = await solve(`u=(1,0,0)، v=(0,1,0)، ${demand}`);
    assert.equal(a.results.length, 0);
    assert.equal(a.unsolved.length, 1);
  }
});
await test("coordinate declarations remain geometry, not an overwrite of a previous named matrix", async () => {
  const m = await solved("احسب محدد المصفوفة A=[[9,0],[0,9]]");
  const g = await solved(
    "A=(1,2,3)، B=(1,2,5)، احسب المسافة بين النقطتين A وB",
    m.context,
  );
  const next = await solved("احسب محدد المصفوفة A", g.context);
  assert(next.results[0].finalLatex.endsWith("=81"));
  assert.equal(g.results[0].decimal, 2);
});
await test("vector/statistical bridges choose a free matrix alias and reuse it instead of erasing given M", async () => {
  const m = await solved("احسب محدد المصفوفة M=[[9,0],[0,9]]");
  const g = await solved(
    "u=(1,0,0)، v=(0,1,0)، حول الأشعة u وv إلى مصفوفة",
    m.context,
  );
  assert.equal(g.context.matrices?.active, "N");
  assert.deepEqual(g.context.matrices?.values.M, m.context.matrices?.values.M);
  const again = await solved("حول الأشعة u وv إلى مصفوفة", g.context);
  assert.equal(again.context.matrices?.active, "N");
  const stats = await solved(
    "القيم=[1,2,2]، حول جدول التكرارات إلى مصفوفة",
    m.context,
  );
  assert.equal(stats.context.matrices?.active, "N");
  assert.deepEqual(
    stats.context.matrices?.values.M,
    m.context.matrices?.values.M,
  );
  assert(stats.results[0].steps.some((s) => s.latex.includes("N_{i1}")));
  const full = {
    ...m.context,
    matrices: {
      values: Object.fromEntries([..."ABCDEFGHIJKL"].map((n) => [n, [["1"]]])),
      active: "A",
    },
  };
  const limit = await solve(
    "u=(1,0,0)، v=(0,1,0)، حول الأشعة u وv إلى مصفوفة",
    full,
  );
  assert.equal(limit.results.length, 0);
  assert.equal(limit.unsolved.length, 1);
  assert(limit.unsolved[0].message.includes("12"));
  assert.equal(Object.keys(limit.context.matrices!.values).length, 12);
});
await test("real geometry contexts keep valid guards without treating unsupported proof goals as definitions", () => {
  for (const id of ["S01", "S23", "S24", "S49", "S61"]) {
    assert(isGeometryContext(answers.get(id)!.context.geometry));
  }
  assert.equal(answers.get("S68")!.results.length, 0);
  assert.equal(answers.get("S68")!.context.geometry, undefined);
});
await test("probability P(A) definitions remain event data even after a geometric A/B context", async () => {
  const g = answers.get("S01")!;
  const a = await solved(
    "P(A)=1/2، P(B)=1/3، P(A∩B)=1/6، احسب P(A|B)",
    g.context,
  );
  assert.equal(a.results[0].engine, "probabilityEngine");
  assert(a.results[0].finalLatex.includes("1"));
  assert.deepEqual(a.context.geometry?.points.A, g.context.geometry?.points.A);
});
await test("geometric suggestions stop claiming an unchanged line bridge after an equation is edited", async () => {
  const a = answers.get("S61")!;
  assert(a.suggestions.some((s) => s.includes("تقاطع المستقيمين")));
  const b = await solved("حل الجملة بطريقة غاوس: t=1، t-s=0، t=2", a.context);
  assert(b.results[0].finalLatex.includes("varnothing"));
  assert(!b.suggestions.some((s) => s.includes("تقاطع المستقيمين")));
});
await test("a computed vector r remains explicitly addressable after switching the active vector", async () => {
  const a = await solved("u=(1,2,3)، w=(2,-1,0)، اجمع الشعاعين u وw");
  assert.deepEqual(tuple(a, "vectors", "r"), [3, 1, 3]);
  const b = await solved("احسب طويلة الشعاع u", a.context);
  const c = await solved("احسب طويلة الشعاع r", b.context);
  assert.equal(c.context.geometry?.inputs?.vectors[0], "r");
  assert(c.results[0].finalLatex.includes("19"));
  for (const name of ["r1", "r_{1}"]) {
    const missing = await solve(`احسب طويلة الشعاع ${name}`, b.context);
    assert.equal(missing.results.length, 0);
    assert.equal(missing.unsolved.length, 1);
  }
});
if (process.env.SPACE_OUTPUT)
  fs.writeFileSync(
    process.env.SPACE_OUTPUT,
    JSON.stringify(
      {
        corpus: {
          total: corpus.cases.length,
          completeExpected: corpus.cases.filter((c) => c.expect === "answer")
            .length,
          partialExpected: corpus.cases.filter((c) => c.expect === "partial")
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
console.log(`\nSpace school: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
