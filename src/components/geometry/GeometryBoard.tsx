import { normalizePrompt } from "../../solver/parser";
import { useId, useMemo, useRef, useState } from "react";
import { ArrowUp, BookOpen, FlaskConical } from "lucide-react";
import { Tex, RichText } from "../common/Tex";
import type { GeometryContext, SpaceRequest } from "../../solver/geometryTypes";
import type { AngleMode } from "../../types";
import { extractSpaceRequest } from "../../solver/extractors/geometry";
import { read, vector, zeroV, cross, sub } from "../../utils/spaceGeometryMath";

type Category = "solids" | "vectors" | "points" | "planes" | "lines" | "sphere";
type Form = Record<string, string>;
interface Operation {
  id: string;
  category: Category;
  title: string;
  p?: number;
  v?: number;
  l?: number;
  q?: number;
  formula: string;
}
const tabs: [Category, string][] = [
  ["solids", "المجسمات"],
  ["vectors", "الأشعة"],
  ["points", "النقاط والمراكز"],
  ["planes", "المستويات"],
  ["lines", "المستقيمات"],
  ["sphere", "الكرة"],
];
const operations: Operation[] = [
  {
    id: "solid",
    category: "solids",
    title: "الحجم والمساحة",
    formula: String.raw`V_{\text{هرم}}=\frac13 S_{\text{قاعدة}}h`,
  },
  {
    id: "pyramid-volume",
    category: "solids",
    title: "حجم هرم من مساحة القاعدة والارتفاع",
    formula: String.raw`V=\frac13 S_{\text{قاعدة}}h`,
  },
  {
    id: "tetrahedron",
    category: "solids",
    title: "حجم رباعي الوجوه وارتفاعه",
    p: 4,
    formula: String.raw`V=\frac16|\det(\overrightarrow{AB},\overrightarrow{AC},\overrightarrow{AD})|`,
  },
  {
    id: "parallelepiped",
    category: "solids",
    title: "حجم متوازي السطوح",
    v: 3,
    formula: String.raw`V=|\vec u\cdot(\vec v\times\vec w)|`,
  },
  {
    id: "vector",
    category: "vectors",
    title: "الشعاع الواصل بين نقطتين",
    p: 2,
    formula: String.raw`\overrightarrow{AB}=B-A`,
  },
  {
    id: "opposite",
    category: "vectors",
    title: "نظير شعاع",
    v: 1,
    formula: String.raw`\vec v=-\vec u`,
  },
  {
    id: "add",
    category: "vectors",
    title: "جمع شعاعين",
    v: 2,
    formula: String.raw`(u_1+v_1,u_2+v_2,u_3+v_3)`,
  },
  {
    id: "subtract",
    category: "vectors",
    title: "طرح شعاعين",
    v: 2,
    formula: String.raw`\vec w=\vec u-\vec v`,
  },
  {
    id: "scale",
    category: "vectors",
    title: "ضرب شعاع بعدد",
    v: 1,
    formula: String.raw`k\vec u=(ku_1,ku_2,ku_3)`,
  },
  {
    id: "norm",
    category: "vectors",
    title: "طويلة شعاع",
    v: 1,
    formula: String.raw`\|u\|=\sqrt{u_1^2+u_2^2+u_3^2}`,
  },
  {
    id: "cross",
    category: "vectors",
    title: "الجداء الشعاعي",
    v: 2,
    formula: String.raw`\vec w=\vec u\times\vec v`,
  },
  {
    id: "dot",
    category: "vectors",
    title: "الجداء السلمي والتعامد",
    v: 2,
    formula: String.raw`\vec u\cdot\vec v=xx'+yy'+zz'`,
  },
  {
    id: "geometric-dot",
    category: "vectors",
    title: "الجداء من الطويلتين والزاوية",
    formula: String.raw`\vec u\cdot\vec v=\|u\|\|v\|\cos\theta`,
  },
  {
    id: "dependence2",
    category: "vectors",
    title: "الارتباط الخطي لشعاعين",
    v: 2,
    formula: String.raw`\vec u\times\vec v=\vec0`,
  },
  {
    id: "dependence3",
    category: "vectors",
    title: "الارتباط الخطي لثلاثة أشعة",
    v: 3,
    formula: String.raw`\det(\vec u,\vec v,\vec w)=0`,
  },
  {
    id: "matrix",
    category: "vectors",
    title: "ربط الأشعة بالمصفوفات",
    v: 3,
    formula: String.raw`M=\begin{pmatrix}u_1&u_2&u_3\\v_1&v_2&v_3\\w_1&w_2&w_3\end{pmatrix}`,
  },
  {
    id: "distance",
    category: "points",
    title: "المسافة بين نقطتين",
    p: 2,
    formula: String.raw`d(A,B)=\sqrt{(x_B-x_A)^2+(y_B-y_A)^2+(z_B-z_A)^2}`,
  },
  {
    id: "collinear",
    category: "points",
    title: "استقامة ثلاث نقاط",
    p: 3,
    formula: String.raw`\overrightarrow{AB}\times\overrightarrow{AC}=\vec0`,
  },
  {
    id: "coplanar",
    category: "points",
    title: "استواء أربع نقاط",
    p: 4,
    formula: String.raw`\det(\overrightarrow{AB},\overrightarrow{AC},\overrightarrow{AD})=0`,
  },
  {
    id: "barycenter",
    category: "points",
    title: "مركز الأبعاد والتجميع والتلاقي",
    p: 3,
    formula: String.raw`G=\frac{\sum_i\alpha_iA_i}{\sum_i\alpha_i},\quad\sum_i\alpha_i\ne0`,
  },
  {
    id: "normal",
    category: "planes",
    title: "ناظم مستوٍ من معادلته",
    q: 1,
    formula: String.raw`P:ax+by+cz+d=0,\quad\vec n=(a,b,c)`,
  },
  {
    id: "plane-three",
    category: "planes",
    title: "مستوٍ يمر بثلاث نقاط",
    p: 3,
    formula: String.raw`\vec n=\overrightarrow{AB}\times\overrightarrow{AC}\ne\vec0`,
  },
  {
    id: "plane-normal",
    category: "planes",
    title: "مستوٍ من نقطة وناظم",
    p: 1,
    v: 1,
    formula: String.raw`\vec n\cdot\overrightarrow{AM}=0`,
  },
  {
    id: "bisector",
    category: "planes",
    title: "المستوي المنصف العمودي لقطعة",
    p: 2,
    formula: String.raw`MA^2=MB^2`,
  },
  {
    id: "planes",
    category: "planes",
    title: "تقاطع مستويين أو توازيهما",
    q: 2,
    formula: String.raw`\vec u=\vec n_1\times\vec n_2`,
  },
  {
    id: "distance-plane",
    category: "planes",
    title: "بعد نقطة عن مستوٍ ومسقطها",
    p: 1,
    q: 1,
    formula: String.raw`d(M,P)=\frac{|ax_M+by_M+cz_M+d|}{\sqrt{a^2+b^2+c^2}}`,
  },
  {
    id: "line-existing",
    category: "lines",
    title: "معادلات المستقيم المعطى",
    l: 1,
    formula: String.raw`M=A+t\vec u`,
  },
  {
    id: "line-points",
    category: "lines",
    title: "التمثيل البارامتري من نقطتين",
    p: 2,
    formula: String.raw`M=A+t\overrightarrow{AB}`,
  },
  {
    id: "line-direction",
    category: "lines",
    title: "التمثيل من نقطة واتجاه",
    p: 1,
    v: 1,
    formula: String.raw`M=A+t\vec u,\quad t\in\mathbb R`,
  },
  {
    id: "line-plane",
    category: "lines",
    title: "مستقيم ومستوي: تقاطع أو احتواء",
    l: 1,
    q: 1,
    formula: String.raw`(\vec n\cdot\vec u)t+\vec n\cdot A+d=0`,
  },
  {
    id: "lines",
    category: "lines",
    title: "الأوضاع النسبية لمستقيمين",
    l: 2,
    formula: String.raw`[\overrightarrow{AB},\vec u,\vec v]=0`,
  },
  {
    id: "distance-line",
    category: "lines",
    title: "بعد نقطة عن مستقيم ومسقطها",
    p: 1,
    l: 1,
    formula: String.raw`d(M,D)=\frac{\|\overrightarrow{AM}\times\vec u\|}{\|u\|}`,
  },
  {
    id: "line-system",
    category: "lines",
    title: "جملة الوسيطين وجسر المصفوفات",
    l: 2,
    formula: String.raw`A+t\vec u=B+s\vec v`,
  },
  {
    id: "sphere-center",
    category: "sphere",
    title: "معادلة الكرة من المركز ونصف القطر",
    p: 1,
    formula: String.raw`(x-a)^2+(y-b)^2+(z-c)^2=R^2`,
  },
  {
    id: "sphere-diameter",
    category: "sphere",
    title: "معادلة الكرة من طرفي قطر",
    p: 2,
    formula: String.raw`K=\frac{A+B}{2},\quad R=\frac{AB}{2}`,
  },
  {
    id: "sphere-equation",
    category: "sphere",
    title: "استخراج المركز ونصف القطر",
    formula: String.raw`x^2+y^2+z^2+ax+by+cz+d=0`,
  },
];
const solidLabels = {
  cube: "مكعب",
  cuboid: "متوازي مستطيلات",
  sphere: "كرة",
  cylinder: "أسطوانة قائمة",
  cone: "مخروط قائم",
  pyramid: "هرم رباعي منتظم",
  triangularPrism: "موشور قائم",
};
const dimensionLabels: Record<string, string> = {
  a: "طول الحرف a",
  b: "العرض b",
  c: "الارتفاع c",
  r: "نصف القطر r",
  h: "الارتفاع العمودي h",
  area: "مساحة القاعدة",
  perimeter: "محيط القاعدة",
};
const dims = (solid: string) =>
  solid === "cube"
    ? ["a"]
    : solid === "cuboid"
      ? ["a", "b", "c"]
      : solid === "sphere"
        ? ["r"]
        : solid === "pyramid"
          ? ["a", "h"]
          : solid === "triangularPrism"
            ? ["area", "perimeter", "h"]
            : ["r", "h"];
const solidDemand: Record<string, string> = {
  cube: "احسب حجم ومساحة مكعب",
  cuboid: "احسب حجم ومساحة متوازي مستطيلات",
  sphere: "احسب حجم ومساحة كرة",
  cylinder: "احسب حجم ومساحة اسطوانة",
  cone: "احسب حجم ومساحة مخروط",
  pyramid: "احسب حجم ومساحة هرم رباعي منتظم",
  triangularPrism: "احسب حجم ومساحة موشور قائم",
};
function defaults(): Form {
  const f: Form = {
    count: "3",
    solid: "cube",
    unit: "DEG",
    theta: "60",
    normU: "3",
    normV: "4",
    coefficient: "2",
    radius: "2",
    sphereEquation: "x^2+y^2+z^2-2x-4y-6z+10=0",
    plane0: "2x-y+2z-5=0",
    plane1: "x+y+z-3=0",
    a: "3",
    b: "4",
    c: "5",
    r: "2",
    h: "6",
    area: "6",
    perimeter: "12",
  };
  [
    [1, 2, 3],
    [4, 6, 3],
    [0, 1, 0],
    [0, 0, 1],
  ].forEach((p, i) => {
    f[`pn${i}`] = "ABCD"[i];
    p.forEach((v, k) => (f[`p${i}${k}`] = String(v)));
    f[`weight${i}`] = "1";
  });
  [
    [1, 2, 3],
    [2, -1, 0],
    [0, 0, 1],
  ].forEach((v, i) => v.forEach((c, k) => (f[`v${i}${k}`] = String(c))));
  for (let i = 0; i < 2; i++) {
    [0, i, i].forEach((v, k) => (f[`l${i}p${k}`] = String(v)));
    [i ? 0 : 1, 1, i ? 0 : 1].forEach((v, k) => (f[`l${i}u${k}`] = String(v)));
  }
  return f;
}
function chooseOperation(context?: GeometryContext): string {
  if (!context) return "vector";
  if (context.operation === "plane")
    return context.inputs?.vectors.length ? "plane-normal" : "plane-three";
  if (context.operation === "line")
    return context.inputs?.lines.length
      ? "line-existing"
      : context.inputs?.vectors.length
        ? "line-direction"
        : "line-points";
  if (context.operation === "sphere") return "sphere-center";
  if (context.operation === "vector-arithmetic")
    return context.arithmetic || "opposite";
  if (context.operation === "dependence")
    return (context.inputs?.vectors.length || context.active.vectors.length) ===
      3
      ? "dependence3"
      : "dependence2";
  return operations.some((o) => o.id === context.operation)
    ? context.operation
    : context.operation === "sphere-equation"
      ? "sphere-equation"
      : "vector";
}
function initial(context?: GeometryContext): Form {
  const f = defaults();
  if (!context) return f;
  const input = context.inputs || context.active;
  input.points.slice(0, 4).forEach((name, i) => {
    f[`pn${i}`] = name;
    context.points[name].forEach((c, k) => (f[`p${i}${k}`] = c));
  });
  input.vectors
    .slice(0, 3)
    .forEach((name, i) =>
      context.vectors[name].forEach((c, k) => (f[`v${i}${k}`] = c)),
    );
  input.lines.slice(0, 2).forEach((name, i) => {
    context.lines[name].point.forEach((c, k) => (f[`l${i}p${k}`] = c));
    context.lines[name].direction.forEach((c, k) => (f[`l${i}u${k}`] = c));
  });
  input.planes.slice(0, 2).forEach((name, i) => {
    const p = context.planes[name];
    f[`plane${i}`] =
      `(${p.normal[0]})*x+(${p.normal[1]})*y+(${p.normal[2]})*z+(${p.offset})=0`;
  });
  if (context.weights) {
    f.count = String(context.weights.length);
    context.weights.forEach((w, i) => (f[`weight${i}`] = w));
  }
  if (context.coefficient) f.coefficient = context.coefficient;
  if (context.geometricDot) {
    f.normU = context.geometricDot.norms[0];
    f.normV = context.geometricDot.norms[1];
    f.theta = context.geometricDot.angle;
    f.unit = context.geometricDot.unit;
  }
  if (context.sphere) {
    f.radius = context.radius || `sqrt(${context.sphere.radiusSquared})`;
    const c = context.sphere.center;
    f.sphereEquation = `(x-(${c[0]}))^2+(y-(${c[1]}))^2+(z-(${c[2]}))^2=(${context.sphere.radiusSquared})`;
  }
  if (context.pyramid) {
    f.area = context.pyramid.area;
    f.h = context.pyramid.height;
  } else if (
    context.lastScalarExpression &&
    (context.operation === "distance-plane" ||
      context.operation === "distance-line")
  )
    f.h = context.lastScalarExpression;
  if (context.solid) {
    f.solid = context.solid.id;
    Object.assign(f, context.solid.dimensions);
  }
  return f;
}
const tuple = (f: Form, prefix: string) =>
  `(${[0, 1, 2].map((i) => f[prefix + i]).join(",")})`;
function question(op: Operation, f: Form): string {
  const pc = op.id === "barycenter" ? Number(f.count) : op.p || 0,
    points = Array.from({ length: pc }, (_, i) => f[`pn${i}`]);
  const p = points.map((name, i) => `${name}${tuple(f, "p" + i)}`);
  const vectors = Array.from(
      { length: op.v || 0 },
      (_, i) => `${"uvw"[i]}=${tuple(f, "v" + i)}`,
    ),
    lines = Array.from(
      { length: op.l || 0 },
      (_, i) =>
        `D${i + 1}: (x,y,z)=${tuple(f, "l" + i + "p")}+${i ? "s" : "t"}*${tuple(f, "l" + i + "u")}`,
    ),
    planes = Array.from(
      { length: op.q || 0 },
      (_, i) => `${"PQ"[i]}: ${f["plane" + i]}`,
    );
  const definitions = [...p, ...vectors, ...lines, ...planes].join("، ");
  const demands: Record<string, string> = {
    vector: `جد الشعاع ${points.join("")}`,
    distance: "جد المسافة بين النقطتين",
    opposite: "جد نظير الشعاع u",
    add: "اجمع الشعاعين u وv",
    subtract: "اطرح v من u",
    scale: `جد تضريب الشعاع u بالعدد k=${f.coefficient}`,
    dot: "احسب الجداء السلمي للشعاعين u وv",
    norm: "احسب طويلة الشعاع u",
    cross: "احسب الجداء الشعاعي للشعاعين u وv",
    dependence2: "ادرس الارتباط الخطي للشعاعين u وv",
    dependence3: "ادرس الارتباط الخطي للأشعة u وv وw",
    collinear: "هل النقاط على استقامة واحدة؟",
    coplanar: "هل النقاط الأربع مستوية؟",
    barycenter: `جد مركز الأبعاد المتناسبة وأثبت التلاقي بالتجميع، الأوزان=[${points.map((_, i) => f["weight" + i]).join(",")}]`,
    normal: "جد ناظم المستوي P",
    "plane-three": "جد معادلة المستوي المار بالنقاط المعطاة",
    "plane-normal": "جد معادلة المستوي من النقطة المعطاة والشعاع الناظم u",
    bisector: "جد معادلة المستوي المنصف العمودي للقطعة",
    planes: "جد تقاطع المستويين P وQ ووضعهما النسبي",
    "distance-plane": "جد بعد النقطة عن المستوي P ومسقطها العمودي",
    "line-existing": "اكتب التمثيل البارامتري للمستقيم D1",
    "line-points": "جد التمثيل البارامتري للمستقيم المار بالنقطتين",
    "line-direction":
      "جد التمثيل البارامتري للمستقيم من النقطة والشعاع الموجه u",
    "line-plane": "جد تقاطع المستقيم D1 والمستوي P ووضعهما النسبي",
    lines: "جد الوضع النسبي للمستقيمين D1 وD2",
    "distance-line": "جد بعد النقطة عن المستقيم D1 ومسقطها",
    "line-system": "اكتب جملة التقاطع للوسيطين للمستقيمين D1 وD2",
    matrix: "حول الأشعة المعطاة إلى مصفوفة",
    tetrahedron: "احسب حجم رباعي الوجوه وارتفاعه",
    parallelepiped: "احسب حجم متوازي السطوح",
    "sphere-center": `جد معادلة الكرة مركزها ${points[0]} ونصف قطرها r=${f.radius}`,
    "sphere-diameter": `جد معادلة الكرة التي قطرها ${points.join("")}`,
  };
  if (op.id === "pyramid-volume")
    return `احسب حجم هرم مساحة القاعدة area=${f.area} والارتفاع h=${f.h}`;
  if (op.id === "solid")
    return `${solidDemand[f.solid]}، ${dims(f.solid)
      .map((k) => `${k}=${f[k]}`)
      .join("، ")}`;
  if (op.id === "geometric-dot")
    return `احسب الجداء السلمي بالصيغة الهندسية، الطويلتان=[${f.normU},${f.normV}]، theta=${f.theta} ${f.unit === "DEG" ? "درجة" : f.unit === "RAD" ? "راديان" : "غراد"}`;
  if (op.id === "sphere-equation")
    return `جد مركز ونصف قطر الكرة ${f.sphereEquation}`;
  return `${definitions}، ${demands[op.id]}`;
}
function example(op: Operation, index: number): Form {
  const f = defaults(),
    second = index % 2 === 1;
  const points =
    op.id === "tetrahedron" ||
    op.id === "coplanar" ||
    op.id === "plane-three" ||
    op.id === "barycenter"
      ? [
          [0, 0, 0],
          [second ? 4 : 3, 0, 0],
          [0, second ? 4 : 3, 0],
          [0, 0, second ? 2 : 1],
        ]
      : second
        ? [
            [0, 0, 0],
            [0, 0, 2],
            [1, 2, 3],
            [2, 3, 4],
          ]
        : [
            [1, 2, 3],
            [4, 6, 3],
            [0, 1, 0],
            [0, 0, 1],
          ];
  points.forEach((p, i) => p.forEach((v, k) => (f[`p${i}${k}`] = String(v))));
  if (op.id === "coplanar" && !second) f.p32 = "0";
  if (op.id === "collinear") {
    [
      [0, 0, 0],
      [1, 2, 3],
      [2, 4, second ? 7 : 6],
    ].forEach((p, i) => p.forEach((v, k) => (f[`p${i}${k}`] = String(v))));
  }
  const vectors = op.id.startsWith("dependence")
    ? [
        [1, 0, 0],
        [0, 1, 0],
        [second ? 0 : 1, second ? 0 : 1, second ? 1 : 0],
      ]
    : second
      ? [
          [1, 0, 0],
          [1, 1, 0],
          [0, 0, 1],
        ]
      : [
          [1, 2, 3],
          [2, -1, 0],
          [0, 0, 1],
        ];
  if (op.id === "dependence2") {
    vectors[1] = second ? [0, 1, 0] : [2, 0, 0];
  }
  vectors.forEach((v, i) => v.forEach((c, k) => (f[`v${i}${k}`] = String(c))));
  f.a = second ? "4" : "3";
  f.radius = second ? "3" : "2";
  f.theta = second ? "90" : "60";
  if (op.id === "planes") {
    f.plane0 = "x+y+z=1";
    f.plane1 = second ? "2x+2y+2z=4" : "x-y=0";
  }
  if (op.id === "distance-plane") {
    f.plane0 = second ? "y-2=0" : "2x-y+2z-5=0";
  }
  if (op.id === "line-plane") f.plane0 = second ? "x+y+z+3=0" : "x+y+z-3=0";
  if (op.id === "sphere-equation")
    f.sphereEquation = second
      ? "x^2+y^2+z^2-4x+2y+1=0"
      : "x^2+y^2+z^2-2x-4y-6z+10=0";
  return f;
}
function validateDraft(request: SpaceRequest) {
  if (
    request.pyramid &&
    [request.pyramid.area, request.pyramid.height].some(
      (s) => read(s).sign() <= 0,
    )
  )
    throw Error("مساحة القاعدة والارتفاع العمودي موجبان.");
  if (
    request.solid &&
    Object.values(request.solid.dimensions).some((v) => read(v).sign() <= 0)
  )
    throw Error("كل الأبعاد موجبة؛ لا نبدّل الإشارة أو نحذف بُعدًا.");
  if (request.operation === "barycenter") {
    if (!request.weights || request.weights.length !== request.points.length)
      throw Error("أكمل وزنًا لكل نقطة.");
    if (
      request.weights
        .map(read)
        .reduce((s, v) => s.add(v), read("0"))
        .zero()
    )
      throw Error("مجموع الأوزان صفر؛ غيّر الأوزان لتعريف المركز.");
  }
  for (const l of Object.values(request.model.lines))
    if (zeroV(vector(l.direction)))
      throw Error("شعاع اتجاه المستقيم غير معدوم.");
  if (
    request.operation === "plane" &&
    request.points.length >= 3 &&
    !request.vectors.length
  ) {
    const p = request.points.map((n) => vector(request.model.points[n]));
    if (zeroV(cross(sub(p[1], p[0]), sub(p[2], p[0]))))
      throw Error("النقاط الثلاث مستقيمة؛ لا تعرّف مستويًا وحيدًا.");
  }
  if (
    (request.operation === "plane" || request.operation === "line") &&
    request.vectors.length &&
    zeroV(vector(request.model.vectors[request.vectors[0]]))
  )
    throw Error("الناظم أو شعاع التوجيه غير معدوم.");
}
export {
  operations as geometryFormOperations,
  example as geometryFormExample,
  question as geometryFormQuestion,
};
export default function GeometryBoard({
  context,
  angleMode,
  onInsert,
  onSolve,
  busy = false,
}: {
  context?: GeometryContext;
  angleMode: AngleMode;
  onInsert: (question: string) => void;
  onSolve: (question: string) => void;
  busy?: boolean;
}) {
  const id = useId(),
    refs = useRef<(HTMLButtonElement | null)[]>([]),
    initialOp = chooseOperation(context);
  const [operation, setOperation] = useState(initialOp),
    [category, setCategory] = useState<Category>(
      operations.find((o) => o.id === initialOp)!.category,
    ),
    [form, setForm] = useState<Form>(() => ({
      ...initial(context),
      unit: context?.geometricDot?.unit || angleMode,
      theta:
        context?.geometricDot?.angle ||
        (angleMode === "RAD" ? "pi/3" : angleMode === "GRAD" ? "200/3" : "60"),
    })),
    [exampleIndex, setExampleIndex] = useState(0);
  const op = operations.find((o) => o.id === operation)!,
    set = (key: string, value: string) =>
      setForm((f) => ({ ...f, [key]: value })),
    pointCount = op.id === "barycenter" ? Number(form.count) : op.p || 0;
  const preview = useMemo(() => {
    try {
      for (let i = 0; i < pointCount; i++)
        if (!/^[A-Z][1-4]?$/.test(form["pn" + i]))
          throw Error("اسم النقطة حرف لاتيني كبير، ويمكن إلحاق رقم من1 إلى4.");
      if (
        new Set(Array.from({ length: pointCount }, (_, i) => form["pn" + i]))
          .size !== pointCount
      )
        throw Error("أسماء النقاط مختلفة؛ عدّل الاسم المكرر.");
      const q = question(op, form),
        r = extractSpaceRequest(
          normalizePrompt(q),
          { assignments: {} },
          angleMode,
        );
      validateDraft(r);
      return { question: q, error: "" };
    } catch (e) {
      return {
        question: "",
        error: e instanceof Error ? e.message : "أكمل المعطيات.",
      };
    }
  }, [op, form, pointCount, angleMode]);
  const chooseTab = (tab: Category) => {
    setCategory(tab);
    setOperation(operations.find((o) => o.category === tab)!.id);
  };
  const field = (label: string, key: string) => (
    <label className="space-field" key={key}>
      <span>{label}</span>
      <input
        dir="ltr"
        aria-label={label}
        value={form[key] || ""}
        onChange={(e) => set(key, e.target.value)}
        maxLength={500}
        autoComplete="off"
        spellCheck={false}
      />
    </label>
  );
  const triple = (prefix: string, label: string) => (
    <div className="space-coordinates" dir="ltr">
      {["x", "y", "z"].map((name, i) => (
        <label key={name}>
          <span>{name}</span>
          <input
            dir="ltr"
            aria-label={`${label}: ${name}`}
            value={form[prefix + i] || ""}
            onChange={(e) => set(prefix + i, e.target.value)}
            maxLength={100}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      ))}
    </div>
  );
  return (
    <div className="geometry-board" data-testid="geometry-board">
      <p className="space-board-intro">
        ابنِ المسألة هنا، ثم حلّها أو أدرجها في المحادثة. تغيير أي خانة يغيّر
        السؤال والنتيجة التالية.
      </p>
      <div
        className="space-tabs"
        role="tablist"
        aria-label="أدوات الهندسة الفراغية"
      >
        {tabs.map(([tab, label], i) => (
          <button
            type="button"
            key={tab}
            ref={(e) => {
              refs.current[i] = e;
            }}
            role="tab"
            aria-selected={category === tab}
            tabIndex={category === tab ? 0 : -1}
            id={`${id}-${tab}`}
            aria-controls={`${id}-panel`}
            onClick={() => chooseTab(tab)}
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                e.preventDefault();
                const next =
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? tabs.length - 1
                      : (i + (e.key === "ArrowLeft" ? 1 : -1) + tabs.length) %
                        tabs.length;
                chooseTab(tabs[next][0]);
                refs.current[next]?.focus();
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <section
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-${category}`}
        className="space-board-panel"
      >
        <div className="space-operation-row">
          <label className="space-field">
            <span>المطلوب</span>
            <select
              aria-label="العملية الهندسية"
              value={operation}
              onChange={(e) => setOperation(e.target.value)}
            >
              {operations
                .filter((o) => o.category === category)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            className="space-example"
            onClick={() => {
              setForm(example(op, exampleIndex));
              setExampleIndex((i) => i + 1);
            }}
          >
            <FlaskConical size={15} />
            <span>تحميل مثال {(exampleIndex % 2) + 1}</span>
          </button>
        </div>
        {op.id === "solid" && (
          <>
            <label className="space-field">
              <span>نوع المجسم</span>
              <select
                aria-label="نوع المجسم"
                value={form.solid}
                onChange={(e) => set("solid", e.target.value)}
              >
                {Object.entries(solidLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="space-fields-grid">
              {dims(form.solid).map((k) => field(dimensionLabels[k], k))}
            </div>
          </>
        )}
        {op.id === "pyramid-volume" && (
          <div className="space-fields-grid">
            {field("مساحة القاعدة", "area")}
            {field("الارتفاع العمودي h", "h")}
          </div>
        )}
        {op.id === "barycenter" && (
          <label className="space-field">
            <span>عدد النقاط</span>
            <select
              aria-label="عدد نقاط مركز الأبعاد"
              value={form.count}
              onChange={(e) => set("count", e.target.value)}
            >
              {[2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n} نقاط
                </option>
              ))}
            </select>
          </label>
        )}
        {Array.from({ length: pointCount }, (_, i) => (
          <fieldset className="space-coordinate-card" key={i}>
            <legend>النقطة {form["pn" + i]}</legend>
            <div className="space-point-row">
              <label className="space-name">
                <span>الاسم</span>
                <input
                  dir="ltr"
                  aria-label={`اسم النقطة ${i + 1}`}
                  value={form["pn" + i]}
                  maxLength={2}
                  onChange={(e) => set("pn" + i, e.target.value)}
                />
              </label>
              {triple("p" + i, form["pn" + i])}
            </div>
            {op.id === "barycenter" &&
              field(`وزن ${form["pn" + i]}`, "weight" + i)}
          </fieldset>
        ))}
        {Array.from({ length: op.v || 0 }, (_, i) => (
          <fieldset className="space-coordinate-card" key={i}>
            <legend>
              <Tex math={`\\vec{${"uvw"[i]}}`} className="space-math" />
              {op.id === "plane-normal" ? " — الناظم" : ""}
            </legend>
            {triple("v" + i, "uvw"[i])}
          </fieldset>
        ))}
        {Array.from({ length: op.l || 0 }, (_, i) => (
          <fieldset className="space-coordinate-card" key={i}>
            <legend>المستقيم D{i + 1}</legend>
            <p>نقطة منه</p>
            {triple("l" + i + "p", `نقطة D${i + 1}`)}
            <p>شعاع توجيهه — غير معدوم</p>
            {triple("l" + i + "u", `اتجاه D${i + 1}`)}
          </fieldset>
        ))}
        {Array.from({ length: op.q || 0 }, (_, i) =>
          field(`معادلة المستوي ${"PQ"[i]}`, "plane" + i),
        )}
        {op.id === "scale" && field("المعامل k", "coefficient")}
        {op.id === "sphere-center" && field("نصف قطر الكرة R", "radius")}
        {op.id === "sphere-equation" && field("معادلة الكرة", "sphereEquation")}
        {op.id === "geometric-dot" && (
          <>
            <div className="space-fields-grid">
              {field("طويلة u", "normU")}
              {field("طويلة v", "normV")}
              {field("الزاوية بين الشعاعين", "theta")}
              <label className="space-field">
                <span>وحدة الزاوية</span>
                <select
                  aria-label="وحدة زاوية الجداء"
                  value={form.unit}
                  onChange={(e) => set("unit", e.target.value)}
                >
                  <option value="DEG">درجة</option>
                  <option value="RAD">راديان</option>
                  <option value="GRAD">غراد</option>
                </select>
              </label>
            </div>
          </>
        )}
        <details className="space-guide">
          <summary>
            <BookOpen size={14} />
            القانون وطريقة الدرس
          </summary>
          <Tex math={op.formula} display className="space-math" />
          <p>
            نعمل في معلم متعامد متجانس للصيغ المترية. الأطوال لا تُستنتج من
            الرسم، والشعاع المعدوم لا يحدد اتجاه مستقيم. الكسور والجذور البسيطة
            مقبولة في الخانات.
          </p>
        </details>
        {!preview.error && (
          <details className="space-question-preview">
            <summary>مراجعة السؤال الذي سيُرسل</summary>
            <p data-testid="geometry-question-preview">
              <RichText text={preview.question} autoMath />
            </p>
          </details>
        )}
      </section>
      <div className="space-board-actions">
        {!!preview.error && (
          <p className="space-input-error" role="alert">
            {preview.error}
          </p>
        )}
        <button
          type="button"
          className="primary-button"
          disabled={!!preview.error || busy}
          onClick={() => onSolve(preview.question)}
        >
          <ArrowUp size={16} />
          حل في المحادثة
        </button>
        <button
          type="button"
          className="suggestion-button"
          disabled={!!preview.error}
          onClick={() => onInsert(preview.question)}
        >
          إدراج في السؤال
        </button>
      </div>
    </div>
  );
}
