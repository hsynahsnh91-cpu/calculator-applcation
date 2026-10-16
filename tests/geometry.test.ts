import assert from "node:assert/strict";
import katex from "katex";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { solvePrompt } from "../src/solver/orchestrator";
import {
  emptyContext,
  type SolverAnswer,
  type SolverContext,
} from "../src/solver/types";
import { isConversationTurn } from "../src/solver/validation";
import { isGeometryContext } from "../src/solver/geometryTypes";
import {
  read,
  vector,
  serial,
  G,
  polynomial,
  planeFromEquation,
  sphereFromEquation,
  zeroV,
  cross,
  sub,
} from "../src/utils/spaceGeometryMath";
import { extractSpaceRequest } from "../src/solver/extractors/geometry";
import { normalizePrompt } from "../src/solver/parser";
import { ResultVisuals } from "../src/components/chat/ResultVisuals";
import {
  default as GeometryBoard,
  geometryFormOperations,
  geometryFormExample,
  geometryFormQuestion,
} from "../src/components/geometry/GeometryBoard";
let passed = 0,
  failed = 0;
async function test(name: string, run: () => void | Promise<void>) {
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
          id: "space",
          question: a.question,
          answer: a,
          createdAt: Date.now(),
        }),
      ),
    ),
    "guarded geometry persistence",
  );
  for (const r of a.results) {
    for (const latex of [
      r.finalLatex,
      ...r.steps.map((s) => s.latex),
      ...r.visuals.flatMap((v) =>
        v.kind === "table"
          ? [v.latex]
          : v.kind === "formula-cards"
            ? v.cards.map((c) => c.latex)
            : [],
      ),
    ])
      katex.renderToString(latex, { throwOnError: true, strict: "ignore" });
    assert(!/NaN|Infinity|undefined/.test(r.finalLatex));
    const svg = renderToStaticMarkup(
      createElement(ResultVisuals, { result: r }),
    );
    assert(!/NaN|Infinity|katex-error/.test(svg));
  }
}
async function solved(
  q: string,
  context?: SolverContext,
  mode: "DEG" | "RAD" | "GRAD" = "DEG",
) {
  const a = await solvePrompt(q, { angleMode: mode, context });
  assert.equal(a.unsolved.length, 0, JSON.stringify(a.unsolved));
  assert.equal(a.results.length, 1, JSON.stringify(a.results));
  validate(a);
  return a;
}
async function rejected(q: string, context?: SolverContext) {
  const a = await solvePrompt(q, { angleMode: "DEG", context });
  assert.equal(a.results.length, 0, JSON.stringify(a.results));
  assert(a.unsolved.length);
  validate(a);
  return a;
}
const near = (a: number, b: number) =>
  assert(Math.abs(a - b) < 1e-8 * Math.max(1, Math.abs(b)), `${a} != ${b}`);
const value = (a: SolverAnswer) => Number(a.results[0].decimal);
const ppoint = (a: SolverAnswer, n: string) =>
  a.context.geometry!.points[n].map((x) => read(x).number());

await test("exact real-field arithmetic preserves decimals, radicals, division and sign", () => {
  for (const s of [
    "1/3",
    "sqrt(2)+sqrt(3)",
    "1+sqrt(2)",
    "sqrt(2)+sqrt(3)+sqrt(5)",
    "(1/3+sqrt(3))/(1+sqrt(2))",
  ]) {
    const n = read(s);
    assert(n.mul(n.inv()).eq(G.integer(1)));
    assert(read(n.text()).eq(n));
    katex.renderToString(n.tex(), { throwOnError: true });
  }
  assert(read("0.100000000000000000001-0.1").sign() > 0);
  assert(read("sqrt(2)-1.4142135623730950488").sign() > 0);
  assert(read("1.4142135623730950489-sqrt(2)").sign() > 0);
  assert.throws(() => read("sqrt(-1)"));
  assert.throws(() => read("0^0"));
  assert.throws(() => read("1/0"));
  assert.throws(() => read("sqrt(2)+sqrt(3)+sqrt(5)+sqrt(7)"));
});
await test("polynomial analysis proves linearity and sphere shape instead of sampling two points", () => {
  assert.equal(planeFromEquation("2x-y+2z-5=0").normal.length, 3);
  assert.throws(() => planeFromEquation("x*y+z=0"));
  assert.throws(() => planeFromEquation("x^2+y+z=0"));
  assert.throws(() => planeFromEquation("0x+0y+0z=0"));
  const s = sphereFromEquation("2x^2+2y^2+2z^2-4x-8y-12z+20=0");
  assert(read(s.radiusSquared).eq(read("4")));
  assert.throws(() => sphereFromEquation("x^2+2y^2+z^2=1"));
  assert.throws(() => sphereFromEquation("x^2+y^2+z^2+xy=1"));
  assert.throws(() => sphereFromEquation("x^2+y^2+z^2=-1"));
  assert.throws(() => polynomial("import(1)"));
});
await test("the directed vector and point distance update with actual point coordinates", async () => {
  const a = await solved("جد الشعاع AB حيث A(1,2,3) وB(4,6,3)");
  assert.deepEqual(
    a.context.geometry?.vectors.AB.map((x) => read(x).number()),
    [3, 4, 0],
  );
  near(value(a), 5);
  assert(a.results[0].verification.passed);
  const b = await solved("جد المسافة بين A(1,2,3) وB(1,2,5)", a.context);
  near(value(b), 2);
});
await test("radical coordinates, exact fractional distances and Arabic digits are not rounded away", async () => {
  const a = await solved("جد المسافة بين A(٠,٠,٠) وB(١,√٣,٠)");
  near(value(a), 2);
  const b = await solved("جد بعد A(1/3,0,0) عن المستوي P: x=0");
  assert(b.results[0].finalLatex.includes("\\frac{1}{3}"));
});
await test("spatial basis vectors are not mistaken for the imaginary unit", async () => {
  const a = await solved(
    String.raw`في معلم متعامد متجانس (O; \vec{i},\vec{j},\vec{k})، A(1,2,3) وB(4,6,3)، جد المسافة بين النقطتين`,
  );
  near(value(a), 5);
  assert.equal(a.results[0].engine, "geometryEngine");
});
await test("opposite, subtraction order and scalar multiplication retain vector meaning", async () => {
  const a = await solved("جد نظير الشعاع u=(1,-2,3)");
  assert.deepEqual(
    a.context.geometry!.vectors.w.map((x) => read(x).number()),
    [-1, 2, -3],
  );
  const b = await solved("u=(1,2,3)، v=(2,-1,0)، اطرح v من u");
  assert.deepEqual(
    b.context.geometry!.vectors.w.map((x) => read(x).number()),
    [-1, 3, 3],
  );
  const c = await solved("u=(1,2,3)، اضرب الشعاع u بالعدد k=-2");
  assert.deepEqual(
    c.context.geometry!.vectors.w.map((x) => read(x).number()),
    [-2, -4, -6],
  );
});
await test("norm and cross product have their own valid results", async () => {
  const a = await solved("احسب طويلة الشعاع u=(1,2,2)");
  near(value(a), 3);
  const b = await solved("احسب الجداء الشعاعي للشعاعين u=(1,0,0) وv=(0,1,0)");
  assert.deepEqual(
    b.context.geometry!.vectors.w.map((x) => read(x).number()),
    [0, 0, 1],
  );
});
for (const [u, v, dependent] of [
  [["1", "2", "3"], ["2", "4", "6"], true],
  [["1", "0", "0"], ["0", "1", "0"], false],
  [["0", "0", "0"], ["1", "2", "3"], true],
  [["1", "1", "0"], ["1", "1.000000000000000000001", "0"], false],
] as const)
  await test(`two-vector dependence is exact: ${u}/${v}`, async () => {
    const a = await solved(
      `هل الأشعة u=(${u.join(",")}) وv=(${v.join(",")}) مرتبطة خطيا؟`,
    );
    assert.equal(a.results[0].title.includes("مرتبطة"), dependent);
    assert(a.results[0].verification.passed);
  });
for (const [w, dependent] of [
  [["1", "1", "0"], true],
  [["0", "0", "1"], false],
  [["0", "0", "0"], true],
] as const)
  await test(`three-vector dependence agrees with exact elimination: ${w}`, async () => {
    const a = await solved(
      `ادرس الارتباط الخطي u=(1,0,0)، v=(0,1,0)، w=(${w.join(",")})`,
    );
    assert.equal(a.results[0].title.includes("مرتبطة"), dependent);
    assert(a.results[0].verification.passed);
  });
await test("linear dependence of AB/AC/AD bridges to coplanarity and the determinant matrix", async () => {
  const a = await solved(
    "A(0,0,0)، B(1,0,0)، C(0,1,0)، D(1,1,0)، ادرس ارتباط الأشعة AB وAC وAD خطيا",
  );
  assert(a.results[0].title.includes("مرتبطة"));
  const b = await solved("استنتج استواء النقاط المعطاة", a.context);
  assert(b.results[0].title.includes("مستو"));
  const c = await solved("حول الأشعة AB وAC وAD إلى مصفوفة", b.context);
  assert.deepEqual(c.context.matrix, [
    [1, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
  ]);
  const d = await solved("جد محدد المصفوفة", c.context);
  assert.equal(d.results[0].engine, "matricesEngine");
});
await test("three-point collinearity and repeated-point degeneracy are distinguished", async () => {
  const a = await solved(
    "هل النقاط A(0,0,0) وB(1,2,3) وC(2,4,6) على استقامة واحدة؟",
  );
  assert(a.results[0].title.includes("على استقامة"));
  const b = await solved(
    "هل النقاط A(0,0,0) وB(0,0,0) وC(1,0,0) على استقامة واحدة؟",
  );
  assert(b.results[0].verification.passed);
  const c = await solved(
    "هل النقاط A(0,0,0) وB(1,0,0) وC(0,1,0) على استقامة واحدة؟",
  );
  assert(c.results[0].title.includes("ليست"));
});
await test("coplanar and noncoplanar quadruples produce correct geometric verdicts", async () => {
  const a = await solved(
    "هل النقاط A(0,0,0) وB(1,0,0) وC(0,1,0) وD(1,1,0) مستوية؟",
  );
  assert(a.results[0].title.includes("تقع"));
  const b = await solved(
    "هل النقاط A(0,0,0) وB(1,0,0) وC(0,1,0) وD(0,0,1) مستوية؟",
  );
  assert(b.results[0].title.includes("غير مستوية"));
});
for (const count of [2, 3, 4])
  await test(`barycenter of ${count} points checks the defining balance and grouping`, async () => {
    const points = ["A(0,0,0)", "B(4,0,0)", "C(0,4,0)", "D(0,0,4)"].slice(
      0,
      count,
    );
    const a = await solved(
      `${points.join("، ")}، جد مركز الأبعاد المتناسبة، الأوزان=[${points.map(() => 1).join(",")}]`,
    );
    assert(a.results[0].verification.passed);
    near(ppoint(a, "G")[0], 4 / count);
    assert(a.context.geometry?.inputs?.points.every((n) => n !== "G"));
    if (count >= 3)
      assert(a.results[0].steps.some((s) => s.title.includes("تجميع")));
  });
await test("negative weights are supported while zero total and missing weights clarify", async () => {
  const a = await solved(
    "A(0,0,0)، B(4,0,0)، جد مركز الأبعاد المتناسبة، الأوزان=[-1,2]",
  );
  near(ppoint(a, "G")[0], 8);
  await rejected(
    "A(0,0,0)، B(4,0,0)، جد مركز الأبعاد المتناسبة، الأوزان=[1,-1]",
  );
  await rejected("A(0,0,0)، B(4,0,0)، جد مركز الأبعاد المتناسبة");
});
await test("triangle centroid concurrency is proved and collinear medians are not a unique intersection", async () => {
  const a = await solved(
    "A(0,0,0)، B(3,0,0)، C(0,3,0)، جد مركز الثقل وأثبت تلاقي المتوسطات",
  );
  assert(a.results[0].steps.some((s) => s.latex.includes("وحيد")));
  const b = await solved(
    "A(0,0,0)، B(1,0,0)، C(2,0,0)، جد مركز الثقل وأثبت تلاقي المتوسطات",
  );
  assert(!b.results[0].steps.some((s) => s.latex.includes("في G وحيدًا")));
});
await test("the analytic dot product, zero vector and orthogonality have correct conditions", async () => {
  const a = await solved("احسب الجداء السلمي u=(1,2,3) وv=(2,-1,0)");
  near(value(a), 0);
  assert(a.results[0].verification.passed);
  const b = await solved("احسب الجداء السلمي u=(0,0,0) وv=(2,-1,0)");
  assert(b.results[0].steps.some((s) => s.latex.includes("غير معرّفين")));
});
for (const [angle, unit, expected] of [
  ["60", "درجة", 6],
  ["pi/3", "راديان", 6],
  ["200/3", "غراد", 6],
  ["90", "درجة", 0],
  ["120", "درجة", -6],
] as const)
  await test(`geometric dot respects explicit angle unit: ${angle} ${unit}`, async () => {
    const a = await solved(
      `احسب الجداء السلمي بالصيغة الهندسية، الطويلتان=[3,4]، theta=${angle} ${unit}`,
      undefined,
      "RAD",
    );
    near(value(a), expected);
    assert(!a.results[0].verification.passed);
  });
await test("near-right exact angles never get snapped to an exact zero", async () => {
  const a = await solved(
    "احسب الجداء السلمي بالصيغة الهندسية، الطويلتان=[3,4]، theta=90.000000000000000000001 درجة",
  );
  assert(a.results[0].finalLatex.includes("\\cos"));
  assert.equal(a.context.geometry?.lastScalar, undefined);
  await rejected(
    "احسب الجداء السلمي بالصيغة الهندسية، الطويلتان=[3,4]، theta=180.000000000000000000001 درجة",
  );
  await rejected(
    "احسب الجداء السلمي بالصيغة الهندسية، الطويلتان=[0,4]، theta=60 درجة",
  );
});
await test("a plane from three points and its normal remain reusable after persistence", async () => {
  const a = await solved(
    "جد معادلة المستوي المار بالنقاط A(0,0,0) وB(1,0,0) وC(0,1,0)",
  );
  assert(a.results[0].finalLatex.includes("z=0"));
  const context = JSON.parse(JSON.stringify(a.context));
  const b = await solved("جد ناظم المستوي P", context);
  assert(b.context.geometry?.vectors.n);
  assert(b.results[0].verification.passed);
});
await test("a plane can pass four coplanar points even if the first three are collinear", async () => {
  const a = await solved(
    "جد معادلة المستوي المار بالنقاط A(0,0,0) وB(1,0,0) وC(2,0,0) وD(0,1,0)",
  );
  assert(a.results[0].finalLatex.includes("z=0"));
  assert(a.results[0].verification.passed);
  await rejected(
    "جد معادلة المستوي المار بالنقاط A(0,0,0) وB(1,0,0) وC(0,1,0) وD(0,0,1)",
  );
  await rejected(
    "جد معادلة المستوي المار بالنقاط A(0,0,0) وB(1,0,0) وC(2,0,0)",
  );
});
await test("point-normal planes and perpendicular bisectors use the actual midpoint", async () => {
  const a = await solved(
    "A(1,2,3)، n=(1,0,0)، جد معادلة المستوي من النقطة والناظم n",
  );
  assert(a.results[0].finalLatex.includes("x-1=0"));
  const b = await solved(
    "A(1,2,3)، B(3,4,5)، جد المستوي المنصف العمودي للقطعة",
  );
  assert(
    b.results[0].steps.some((s) =>
      s.latex.includes("I=\\left(2,\\,3,\\,4\\right)"),
    ),
  );
  await rejected("A(1,2,3)، n=(0,0,0)، جد معادلة المستوي من النقطة والناظم n");
});
await test("a line uses one shared parameter and does not silently accept a zero direction", async () => {
  const a = await solved(
    "جد التمثيل البارامتري للمستقيم المار بالنقطتين A(1,2,3) وB(2,4,6)",
  );
  assert(a.results[0].finalLatex.includes("z=3+3t"));
  await rejected(
    "جد التمثيل البارامتري للمستقيم المار بالنقطتين A(1,2,3) وB(1,2,3)",
  );
  await rejected(
    "جد وضع المستقيم D: (x,y,z)=(0,0,0)+t*(0,0,0) والمستوي P: x=1",
  );
});
await test("Cartesian component and LaTeX cases line declarations accept the same single parameter", async () => {
  const a = await solved(
    "جد تقاطع المستقيم D: x=t; y=t; z=t والمستوي P: x+y+z-3=0",
  );
  assert.deepEqual(ppoint(a, "I"), [1, 1, 1]);
  const b = await solved(
    String.raw`جد تقاطع المستقيم D: \begin{cases}x=t\\y=t\\z=t\end{cases} والمستوي P: x+y+z-3=0`,
  );
  assert.deepEqual(ppoint(b, "I"), [1, 1, 1]);
  await rejected("جد تقاطع المستقيم D: x=t, y=s, z=t والمستوي P: x+y+z-3=0");
});
for (const [q, expected] of [
  ["x-y=0", "P\\cap Q=D"],
  ["2x+2y+2z=2", "منطبقان"],
  ["2x+2y+2z=4", "متوازيان"],
] as const)
  await test(`relative planes include constants: ${q}`, async () => {
    const a = await solved(`جد الوضع النسبي للمستويين P: x+y+z=1، Q: ${q}`);
    assert(a.results[0].finalLatex.includes(expected));
    assert(a.results[0].verification.passed);
  });
for (const [plane, expected] of [
  ["x+y+z=3", "D\\cap P"],
  ["x-y=0", "محتوى"],
  ["x-y=1", "مواز"],
] as const)
  await test(`line-plane classification: ${plane}`, async () => {
    const a = await solved(
      `جد وضع المستقيم D: (x,y,z)=(0,0,0)+t*(1,1,1) والمستوي P: ${plane}`,
    );
    assert(a.results[0].finalLatex.includes(expected));
    assert(a.results[0].verification.passed);
  });
for (const [p, u, expected] of [
  ["(2,0,0)", "(2,0,0)", "منطبقان"],
  ["(0,1,0)", "(1,0,0)", "متوازيان"],
  ["(0,0,0)", "(0,1,0)", "متقاطعان"],
  ["(0,1,1)", "(0,1,0)", "متخالفان"],
] as const)
  await test(`line relation ${expected}`, async () => {
    const a = await solved(
      `جد وضع المستقيمين D1: (x,y,z)=(0,0,0)+t*(1,0,0)، D2: (x,y,z)=${p}+s*${u}`,
    );
    assert(a.results[0].finalLatex.includes(expected));
    assert(a.results[0].verification.passed);
  });
await test("orthogonal directions on skew lines are not falsely called intersecting perpendicular lines", async () => {
  const a = await solved(
    "جد الوضع النسبي للمستقيمين D1: (x,y,z)=(0,0,0)+t*(1,0,0)، D2: (x,y,z)=(0,1,1)+s*(0,1,0)",
  );
  assert(a.results[0].steps.some((s) => s.text?.includes("متخالفين")));
});
await test("point-plane distance and orthogonal projection reproduce the original acceptance result", async () => {
  const a = await solved("جد المسافة بين النقطة A(1,2,3) والمستوي 2x-y+2z-5=0");
  near(value(a), 1 / 3);
  assert(a.results[0].verification.passed);
  assert.deepEqual(ppoint(a, "H"), [7 / 9, 19 / 9, 25 / 9]);
  const b = await solved("جد بعد M(1,2,3) عن المستوي P: 2x=2");
  near(value(b), 0);
});
await test("point-line distance checks a perpendicular foot instead of a planar-only formula", async () => {
  const a = await solved(
    "جد بعد M(1,2,3) عن المستقيم D: (x,y,z)=(0,0,0)+t*(1,0,0)",
  );
  near(value(a), Math.sqrt(13));
  assert.deepEqual(ppoint(a, "H"), [1, 0, 0]);
  assert(a.results[0].verification.passed);
});
await test("a named face defines the actual altitude plane of a tetrahedron", async () => {
  const a = await solved(
    "A(0,0,0)، B(1,0,0)، C(0,1,0)، D(0,0,2)، جد بعد D عن المستوي ABC",
  );
  near(value(a), 2);
});
await test("sphere center/radius, diameter, and expanded equation are consistent", async () => {
  const a = await solved("جد معادلة الكرة مركزها K(1,2,3) ونصف قطرها r=2");
  assert(a.results[0].finalLatex.endsWith("=4"));
  assert(a.results[0].verification.passed);
  const b = await solved("جد معادلة الكرة التي قطرها A(0,0,0) وB(2,0,0)");
  assert(b.results[0].finalLatex.includes("x-1"));
  assert(b.results[0].finalLatex.endsWith("=1"));
  const c = await solved("جد مركز ونصف قطر الكرة x^2+y^2+z^2-2x-4y-6z+10=0");
  assert.deepEqual(ppoint(c, "K"), [1, 2, 3]);
  assert(read(c.context.geometry!.sphere!.radiusSquared).eq(read("4")));
  const next = await solved(
    "جد مركز ونصف قطر الكرة x^2+y^2+z^2-2x-4y-6z+10=0",
    b.context,
  );
  assert.deepEqual(next.context.geometry!.inputs!.points, []);
  assert.equal(
    next.results[0].visuals.find((v) => v.kind === "space")?.points.length,
    1,
  );
});
await test("radical radius and zero-radius degeneracy stay exact", async () => {
  const a = await solved(
    "جد معادلة الكرة مركزها K(0,0,0) ونصف قطرها r=sqrt(2)",
  );
  assert(a.results[0].finalLatex.endsWith("=2"));
  const b = await solved("جد مركز ونصف قطر الكرة x^2+y^2+z^2=0");
  assert(b.results[0].title.includes("نقطة"));
  await rejected("جد معادلة الكرة مركزها K(0,0,0) ونصف قطرها r=-2");
  await rejected("جد مركز ونصف قطر الكرة x^2+2y^2+z^2=1");
});
await test("volume ties the mixed product to the point-plane altitude", async () => {
  const a = await solved(
    "احسب حجم رباعي الوجوه A(0,0,0) وB(1,0,0) وC(0,1,0) وD(0,0,1)",
  );
  near(value(a), 1 / 6);
  assert(a.results[0].steps.some((s) => s.title.includes("الارتفاع")));
  assert(a.results[0].verification.passed);
  const b = await solved(
    "احسب حجم متوازي السطوح u=(1,0,0)، v=(0,1,0)، w=(0,0,1)",
  );
  near(value(b), 1);
});
await test("solid inputs produce changed results, not the previous example answer", async () => {
  const a = await solved("احسب حجم مكعب a=3"),
    b = await solved("احسب حجم مكعب a=4", a.context);
  near(value(a), 27);
  near(value(b), 64);
  assert.notEqual(a.results[0].finalLatex, b.results[0].finalLatex);
  await rejected("احسب حجم مكعب a=-3");
  await rejected("احسب حجم اسطوانة r=2");
  const source = await solved("احسب الجداء السلمي u=(1,0,0) وv=(0,1,0)");
  const cube = await solved("احسب حجم مكعب a=3", source.context);
  assert.equal(
    cube.results[0].visuals.find((v) => v.kind === "space")?.points.length,
    0,
  );
  const geometric = await solved(
    "احسب الجداء السلمي بالصيغة الهندسية، الطويلتان=[3,4]، theta=60 درجة",
    source.context,
  );
  assert(!geometric.results[0].visuals.some((v) => v.kind === "space"));
});
await test("geometry scalars bridge to scientific arithmetic without using an older probability", async () => {
  const p = await solved(
    "كيس فيه 3 كرات حمراء و5 بيضاء سحبت كرتان معا، جد احتمال اختلاف اللون",
  );
  const a = await solved("جد بعد M(0,0,1/3) عن المستوي P: z=0", p.context);
  const b = await solved("احسب النتيجة الهندسية السابقة * 3", a.context);
  assert.equal(b.results[0].engine, "mathEngine");
  near(value(b), 1);
});
await test("matrix and line-system bridges retain the source geometry model", async () => {
  const a = await solved(
    "حول الأشعة u=(1,0,0)، v=(0,1,0)، w=(0,0,1) إلى مصفوفة",
  );
  assert.deepEqual(a.context.matrix, [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]);
  const b = await solved("جد محدد المصفوفة", a.context);
  assert.equal(b.results[0].engine, "matricesEngine");
  const c = await solved("ادرس ارتباط الأشعة u وv وw خطيا", b.context);
  assert(c.results[0].title.includes("مستقلة"));
  const d = await solved(
    "اكتب جملة التقاطع للمستقيمين D1: (x,y,z)=(0,0,0)+t*(1,0,0)، D2: (x,y,z)=(0,0,0)+s*(0,1,0)",
  );
  assert(d.context.matrix);
  assert(d.results[0].finalLatex.includes("t"));
});
await test("separate textbook givens and numbered spatial demands share structured context", async () => {
  const a = await solvePrompt(
    "في معلم متعامد متجانس (O; \\vec{i},\\vec{j},\\vec{k})\nA(0,0,0)، B(1,0,0)، C(0,1,0)\n1. جد معادلة المستوي المار بالنقاط\n2. جد ناظم المستوي السابق",
    { angleMode: "DEG" },
  );
  assert.equal(a.unsolved.length, 0, JSON.stringify(a.unsolved));
  assert.equal(a.results.length, 2);
  validate(a);
});
await test("missing named targets, contradictory definitions and incomplete dimensions clarify", async () => {
  await rejected("A(1,2,3)، جد بعد Z عن المستوي P: x=0");
  await rejected("u=(1,2,3)، جد نظير الشعاع v");
  await rejected("u=(1,2,3)، جد نظير الشعاع a");
  await rejected("A(1,2,3)، A(4,5,6)، جد الشعاع AB");
  await rejected("جد بعد A(1,2) عن المستوي P: x+y+z=0");
});
await test("out-of-range values and corrupt saved context/visuals fail safely", async () => {
  await rejected("جد بعد A(1e100,0,0) عن المستوي P: x=0");
  const a = await solved("جد بعد A(1,2,3) عن المستوي P: x=0");
  const copy = JSON.parse(
    JSON.stringify({ id: "g", question: a.question, answer: a, createdAt: 1 }),
  );
  assert(isConversationTurn(copy));
  copy.answer.results[0].visuals.find(
    (v: { kind: string }) => v.kind === "space",
  ).planes[0].normal = [0, 0, 0];
  assert(!isConversationTurn(copy));
  const bad = JSON.parse(
    JSON.stringify({
      id: "bad-solid",
      question: a.question,
      answer: a,
      createdAt: 1,
    }),
  );
  bad.answer.results[0].visuals = [
    {
      kind: "space",
      title: "bad",
      points: [],
      solid: { id: "cube", dimensions: {} },
    },
  ];
  assert(!isConversationTurn(bad));
  assert(!isGeometryContext({ ...a.context.geometry, lastScalar: Infinity }));
  assert(
    !isGeometryContext({
      ...a.context.geometry,
      active: { points: ["Z"], vectors: [], lines: [], planes: [] },
    }),
  );
});
await test("new output names and reconstructed geometry do not reuse an old plane or line", async () => {
  const a = await solved(
    "جد معادلة المستوي P المار بالنقاط A(0,0,0) وB(1,0,0) وC(0,1,0)",
  );
  const b = await solved(
    "جد معادلة المستوي P المار بالنقاط A(0,0,1) وB(1,0,1) وC(0,1,1)",
    a.context,
  );
  assert(b.results[0].finalLatex.includes("z-1=0"));
  const c = await solved(
    "جد معادلة المستوي Q المار بالنقاط A(0,0,0) وB(1,0,0) وC(0,1,0)",
  );
  assert(c.context.geometry!.planes.Q);
  const d = await solved(
    "A(1,2,3)، u=(1,0,0)، جد التمثيل البارامتري للمستقيم D1 المار بالنقطة A وشعاعه الموجه u",
  );
  assert(d.context.geometry!.lines.D1);
  const e = await solved("اكتب التمثيل البارامتري للمستقيم D1", d.context);
  assert.equal(e.results[0].finalLatex, d.results[0].finalLatex);
  assert.deepEqual(e.context.geometry?.inputs?.lines, ["D1"]);
});
await test("projection feet and sphere centers never overwrite differently located source points", async () => {
  const a = await solved("جد بعد H(1,2,3) عن المستوي P: x=0");
  assert.deepEqual(ppoint(a, "H"), [1, 2, 3]);
  assert(a.context.geometry!.active.points.some((n) => n !== "H"));
  assert(a.results[0].verification.passed);
  const b = await solved("جد معادلة الكرة التي قطرها K(0,0,0) وA(2,0,0)");
  assert.deepEqual(ppoint(b, "K"), [0, 0, 0]);
  assert.deepEqual(
    b.context.geometry!.sphere!.center.map((x) => read(x).number()),
    [1, 0, 0],
  );
  assert(b.results[0].verification.passed);
  const c = await solved(
    "G(0,0,0)، A(2,0,0)، جد مركز الأبعاد المتناسبة، الأوزان=[1,1]",
  );
  assert.deepEqual(ppoint(c, "G"), [0, 0, 0]);
});
await test("vector result aliases do not replace an input named w", async () => {
  const a = await solved("جد نظير الشعاع w=(1,2,3)");
  assert.deepEqual(
    a.context.geometry!.vectors.w.map((x) => read(x).number()),
    [1, 2, 3],
  );
  assert.deepEqual(
    a.context.geometry!.vectors.r.map((x) => read(x).number()),
    [-1, -2, -3],
  );
});
await test("a radius with an unrelated point is not enough to assume a sphere center", async () => {
  await rejected("جد معادلة الكرة A(1,2,3)، r=2");
  await rejected("في معلم غير متعامد، جد المسافة بين A(0,0,0) وB(1,1,1)");
  await rejected("في معلم غير متعامد، جد الشعاع AB حيث A(0,0,0) وB(1,1,1)");
});
await test("a plane parallel to a named source plane passes the new point without replacing the source", async () => {
  const a = await solved(
    "A(0,0,2)، P: z=0، جد معادلة مستوي مواز للمستوي P ويمر بالنقطة A",
  );
  assert(a.context.geometry!.planes.P);
  assert(a.context.geometry!.planes.Q);
  assert(a.results[0].finalLatex.includes("z-2=0"));
});
await test("generated follow-up choices remain executable for distance, vectors, intersections and barycenters", async () => {
  for (const q of [
    "جد بعد A(1,2,3) عن المستوي P: x=0",
    "احسب الجداء السلمي u=(1,0,0) وv=(0,1,0)",
    "جد تقاطع المستقيم D: (x,y,z)=(0,0,0)+t*(1,1,1) والمستوي P: x+y+z=3",
    "A(0,0,0)، B(3,0,0)، C(0,3,0)، جد مركز الثقل",
  ]) {
    const a = await solved(q);
    for (const follow of a.suggestions) {
      const b = await solvePrompt(follow, {
        angleMode: "DEG",
        context: a.context,
      });
      assert.equal(
        b.unsolved.length,
        0,
        JSON.stringify({ follow, unsolved: b.unsolved }),
      );
      validate(b);
    }
  }
});
await test("a general pyramid volume can reuse a previously computed altitude without assuming a square base", async () => {
  const a = await solved("احسب حجم هرم مساحة القاعدة area=6 والارتفاع h=3");
  near(value(a), 6);
  assert(!a.results[0].finalLatex.includes("S="));
  const b = await solved("جد بعد M(0,0,1/3) عن المستوي P: z=0");
  const c = await solved(
    "احسب حجم هرم مساحة القاعدة area=9 وارتفاعه البعد السابق",
    b.context,
  );
  near(value(c), 1);
  await rejected("احسب حجم هرم a=3 h=4");
});
await test("a numerically unresolved tiny radius around a distant center does not gain a fake badge", async () => {
  const a = await solved(
    "جد معادلة الكرة مركزها K(1000000000,0,0) ونصف قطرها r=0.001",
  );
  assert(!a.results[0].verification.passed);
});
await test("a large exact barycenter is preserved while its out-of-range drawing is withheld", async () => {
  const a = await solved(
    "A(0,0,0)، B(1,0,0)، جد مركز الأبعاد المتناسبة، الأوزان=[-0.999999999999999999999,1]",
  );
  assert(read(a.context.geometry!.points.G[0]).eq(read("1e21")));
  assert(!a.results[0].visuals.some((v) => v.kind === "space"));
  assert(a.results[0].note?.includes("حُجب الرسم"));
});
await test("the actual board preview accepts normalized Arabic on reopening real geometry answers", async () => {
  for (const q of [
    "A(0,0,0)، B(3,0,0)، C(0,3,0)، جد مركز الأبعاد المتناسبة، الأوزان=[1,1,1]",
    "جد بعد H(1,2,3) عن المستوي P: x=0",
    "احسب حجم هرم مساحة القاعدة area=6 والارتفاع h=3",
    "اكتب التمثيل البارامتري للمستقيم D: (x,y,z)=(0,0,0)+t*(1,2,3)",
  ]) {
    const a = await solved(q);
    const html = renderToStaticMarkup(
      createElement(GeometryBoard, {
        context: a.context.geometry,
        angleMode: "DEG",
        onInsert: () => {},
        onSolve: () => {},
      }),
    );
    assert(!html.includes('role="alert"'), q);
    assert(!html.includes('class="primary-button" disabled'), q);
  }
});
await test("named Greek planes retain their actual mathematical labels in formulas and the diagram", async () => {
  const a = await solved(
    String.raw`جد تقاطع المستويين \alpha: x+y+z=1، \beta: x-y=0`,
  );
  assert(a.results[0].finalLatex.includes("\\alpha\\cap \\beta"));
  const html = renderToStaticMarkup(
    createElement(ResultVisuals, { result: a.results[0] }),
  );
  assert(html.includes("α</text>"));
  assert(html.includes("β</text>"));
});
for (const op of geometryFormOperations)
  for (const sample of [0, 1])
    await test(`form ${op.id}, example ${sample + 1}: actual fields -> solver -> valid result`, async () => {
      const q = geometryFormQuestion(op, geometryFormExample(op, sample));
      const r = extractSpaceRequest(normalizePrompt(q), emptyContext(), "DEG");
      assert(r.operation);
      const a = await solved(q);
      assert.equal(a.results[0].mode, "geometry");
    });
console.log(`\nGeometry regression: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
