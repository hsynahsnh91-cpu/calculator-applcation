import { bridgeMatrixName, type MatrixContext } from "../solver/matrixTypes";
import type {
  GeometryContext,
  SpaceAnswer,
  SpaceRequest,
  SpaceLine,
  SpacePlane,
  SpaceVector,
} from "../solver/geometryTypes";
import { isGeometryContext } from "../solver/geometryTypes";
import {
  ClarificationError,
  type SolutionStep,
  type Verification,
  type SpaceVisual,
} from "../solver/types";
import {
  G,
  Z,
  U,
  read,
  vector,
  serial,
  add,
  sub,
  scale,
  neg,
  dot,
  cross,
  det,
  zeroV,
  eqV,
  origin,
  vtex,
  rootTex,
  rootExpression,
  linearTex,
  planeTex,
  planeValues,
  lineTex,
  eliminate,
  nullVector,
  lineIntersection,
  bounded,
  polynomial,
  sphereFromEquation,
  type V,
} from "./spaceGeometryMath";
const T = String.raw;
const step = (title: string, latex: string, text?: string): SolutionStep => ({
  title,
  latex,
  text,
});
const aligned = (lines: string[]) =>
  T`\begin{aligned}${lines.join(T`\\[5pt]`)}\end{aligned}`;
const cleanName = (name: string) =>
  name === "alpha"
    ? "\\alpha"
    : name === "beta"
      ? "\\beta"
      : /^Pi[1-6]?$/.test(name)
        ? "\\Pi" + (name.length > 2 ? `_{${name.slice(2)}}` : "")
        : /^[A-Za-z][1-6]$/.test(name)
          ? `${name[0]}_{${name.slice(1)}}`
          : name;
const labelV = (name: string) =>
  name.length === 2 && /^[A-Z]{2}$/.test(name)
    ? T`\overrightarrow{${name}}`
    : T`\vec{${cleanName(name)}}`;
const text = (s: string) => T`\text{${s}}`;
const scalarBound = (v: G) => {
  bounded(v);
  return v;
};
const nonzero = (u: V) => {
  if (zeroV(u))
    throw new ClarificationError(
      "شعاع الاتجاه أو الناظم لا يجوز أن يكون معدومًا. أدخل شعاعًا غير معدوم.",
    );
  return u;
};
const close = (a: number, b: number) =>
  Number.isFinite(a) &&
  Number.isFinite(b) &&
  Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
const numeric = (v: V) => v.map((c) => c.number()) as [number, number, number];
const numericReliable = (v: G) => v.zero() || v.number() !== 0;
const verification = (
  passed: boolean,
  method: string,
  samples = 1,
): Verification => ({ passed, method, samples });
function readV(v: SpaceVector): V {
  return vector(v).map(scalarBound) as V;
}
function checkedLine(v: SpaceLine): SpaceLine {
  readV(v.point);
  nonzero(readV(v.direction));
  return v;
}
function checkedPlane(v: SpacePlane): SpacePlane {
  nonzero(readV(v.normal));
  scalarBound(read(v.offset));
  return v;
}
const pick = <S>(
  map: Record<string, S>,
  names: string[],
  i: number,
  kind: string,
): S => {
  const name = names[i];
  if (!name || !Object.prototype.hasOwnProperty.call(map, name))
    throw new ClarificationError(`حدّد ${kind} المطلوب ومعطياته صراحةً.`);
  return map[name];
};
function planeAt(p: V, n: V): SpacePlane {
  nonzero(n);
  return { normal: serial(n), offset: dot(n, p).neg().text() };
}
function lineAt(p: V, u: V): SpaceLine {
  nonzero(u);
  return { point: serial(p), direction: serial(u) };
}
function evaluatePlane(p: SpacePlane, v: V): G {
  const { n, d } = planeValues(p);
  return dot(n, v).add(d);
}
function sphereTex(center: V, r2: G) {
  return (
    center
      .map((c, i) =>
        c.zero()
          ? `${"xyz"[i]}^2`
          : T`\left(${linearTex([U, c.neg()], ["xyz"[i], ""])}\right)^2`,
      )
      .join("+") + `=${r2.tex()}`
  );
}
function planeCheck(p: SpacePlane, points: V[]): Verification {
  return verification(
    !zeroV(vector(p.normal)) && points.every((v) => evaluatePlane(p, v).zero()),
    "تعويض النقاط في المعادلة وفحص عدم انعدام الناظم",
    points.length,
  );
}
function dependence(vectors: V[]) {
  const crossZero =
    vectors.length === 2
      ? zeroV(cross(vectors[0], vectors[1]))
      : det(vectors[0], vectors[1], vectors[2]).zero();
  const r = eliminate([0, 1, 2].map((i) => vectors.map((v) => v[i])));
  const coefficients = crossZero ? nullVector(vectors) : [];
  const residual = coefficients.length
    ? vectors.reduce((s, v, i) => add(s, scale(v, coefficients[i])), origin())
    : origin();
  return {
    dependent: crossZero,
    rank: r.rank,
    coefficients,
    check: verification(
      crossZero === r.rank < vectors.length &&
        (!crossZero ||
          (!coefficients.every((c) => c.zero()) && zeroV(residual))),
      "مطابقة شرط الجداء الشعاعي/المختلط مع اختزال غاوس الدقيق، ثم تعويض علاقة الارتباط",
      vectors.length,
    ),
  };
}
function plotPlane(name: string, p: SpacePlane) {
  checkedPlane(p);
  const n = numeric(vector(p.normal)),
    length = Math.hypot(...n),
    offset = read(p.offset).number() / length;
  if (!Number.isFinite(offset) || Math.abs(offset) > 1e12) return undefined;
  return {
    label: name,
    normal: n.map((c) => c / length) as [number, number, number],
    offset,
  };
}
function scene(input: SpaceRequest): SpaceVisual {
  const points = input.points.map((name) => ({
    label: name,
    position: numeric(readV(input.model.points[name])),
    latex: vtex(readV(input.model.points[name])),
  }));
  const result: SpaceVisual = {
    kind: "space",
    title: "تصور الهندسة في الفراغ",
    points,
    lines: input.lines.map((name) => ({
      label: name,
      ...(() => {
        const l = checkedLine(input.model.lines[name]);
        return {
          point: numeric(vector(l.point)),
          direction: numeric(vector(l.direction)),
        };
      })(),
    })),
    planes: [],
    segments: [],
  };
  for (const name of input.planes) {
    const p = plotPlane(name, input.model.planes[name]);
    if (p) result.planes!.push(p);
  }
  if (input.vectors.length && input.operation !== "vector") {
    const base = result.points.length;
    result.points.push({ label: "0", position: [0, 0, 0], latex: "(0,0,0)" });
    for (const name of input.vectors) {
      const v = readV(input.model.vectors[name]);
      result.points.push({ label: name, position: numeric(v), latex: vtex(v) });
      result.segments!.push({
        from: base,
        to: result.points.length - 1,
        arrow: true,
      });
    }
  }
  return result;
}
export function solveSpaceRequest(
  input: SpaceRequest,
  previousMatrices?: MatrixContext,
): SpaceAnswer {
  const model = {
    points: { ...input.model.points },
    vectors: { ...input.model.vectors },
    lines: { ...input.model.lines },
    planes: { ...input.model.planes },
  };
  const out: SpaceAnswer = {
    title: "الهندسة الفراغية",
    finalLatex: "",
    steps: [],
    visuals: [],
    verification: verification(false, "لا يتوفر فحص مستقل لهذه الصيغة."),
  };
  const plot = scene(input);
  let scalar: G | undefined,
    scalarExpression: string | undefined,
    scalarValue: number | undefined;
  let activePoints = [...input.points],
    activeVectors = [...input.vectors],
    activeLines = [...input.lines],
    activePlanes = [...input.planes];
  const P = (i: number) => readV(pick(model.points, input.points, i, "النقطة"));
  const V = (i: number) =>
    readV(pick(model.vectors, input.vectors, i, "الشعاع"));
  const L = (i: number) =>
    checkedLine(pick(model.lines, input.lines, i, "المستقيم"));
  const Q = (i: number) =>
    checkedPlane(pick(model.planes, input.planes, i, "المستوي"));
  const freshPoint = (name: string, value?: V) =>
    input.points.includes(name) &&
    (!value || !eqV(vector(input.model.points[name]), value))
      ? ["F", "G", "H", "I", "J", "K", "L", "T"].find(
          (n) => !input.points.includes(n) && n !== name,
        ) || "T"
      : name;
  const addPoint = (name: string, v: V) => {
    const data = serial(v);
    if (data.some((s) => s.length > 500))
      throw new ClarificationError(
        "إحداثيات النتيجة أطول من حد الحفظ؛ بسّط المعطيات.",
      );
    model.points[name] = data;
    if (!plot.points.some((p) => p.label === name))
      plot.points.push({ label: name, position: numeric(v), latex: vtex(v) });
  };
  const addLine = (name: string, l: SpaceLine) => {
    model.lines[name] = l;
    if (!input.lines.includes(name))
      plot.lines?.push({
        label: name,
        point: numeric(vector(l.point)),
        direction: numeric(vector(l.direction)),
      });
  };
  const addPlane = (name: string, p: SpacePlane) => {
    model.planes[name] = p;
    if (!input.planes.includes(name)) {
      const q = plotPlane(name, p);
      if (q) plot.planes?.push(q);
    }
  };
  const setRoot = (squared: G) => {
    scalarExpression = rootExpression(squared);
    const n = squared.number();
    if (n >= 0 && (squared.zero() || n > 0)) scalarValue = Math.sqrt(n);
    else
      out.note =
        "النتيجة الجذرية دقيقة، لكن المقياس لا يسمح بتقريب عددي موثوق؛ لم أستبدلها بصفر.";
  };
  switch (input.operation) {
    case "theory":
      out.title = "دليل الهندسة الفراغية";
      out.finalLatex = T`\overrightarrow{AB}=B-A,\quad d(A,B)=\|\overrightarrow{AB}\|`;
      out.steps = [
        step(
          "المعلم في الفضاء",
          T`M(x,y,z),\quad\overrightarrow{OM}=x\vec i+y\vec j+z\vec k`,
          "الصيغ المترية هنا في معلم متعامد متجانس. في معلم غير متعامد يلزم جدول الجداءات السلمية للأساس.",
        ),
        step(
          "الارتباط والاستقامة والاستواء",
          T`\vec u\times\vec v=\vec0,\qquad\det(\vec u,\vec v,\vec w)=0`,
        ),
        step(
          "مركز الأبعاد المتناسبة",
          T`\sum_i\alpha_i\ne0,\quad G=\frac{\sum_i\alpha_iA_i}{\sum_i\alpha_i}`,
        ),
        step(
          "الجداء السلمي",
          T`\vec u\cdot\vec v=xx'+yy'+zz'=\|u\|\|v\|\cos\theta`,
        ),
        step(
          "بعد نقطة عن مستوٍ",
          T`d(M,P)=\frac{|ax_M+by_M+cz_M+d|}{\sqrt{a^2+b^2+c^2}}`,
        ),
        step("معادلة الكرة", T`(x-a)^2+(y-b)^2+(z-c)^2=R^2`),
      ];
      break;
    case "vector":
    case "distance": {
      const a = P(0),
        b = P(1),
        u = sub(b, a),
        name = input.points[0] + input.points[1],
        s = dot(u, u);
      model.vectors[name.length === 2 ? name : "u"] = serial(u);
      activeVectors = [name.length === 2 ? name : "u"];
      out.title =
        input.operation === "vector"
          ? "إحداثيات شعاع وطويلته"
          : "المسافة بين نقطتين في الفراغ";
      out.finalLatex =
        input.operation === "vector"
          ? aligned([
              T`\overrightarrow{${name}}=${vtex(u)}`,
              T`\|\overrightarrow{${name}}\|=${rootTex(s)}`,
            ])
          : T`d(${input.points.join(",")})=${rootTex(s)}`;
      out.steps = [
        step(
          "طرح الإحداثيات بالترتيب",
          T`\overrightarrow{${name}}=${vtex(b)}-${vtex(a)}=${vtex(u)}`,
          "الشعاع من النقطة الأولى إلى الثانية؛ عكس الاتجاه يغيّر الإشارات ولا يغيّر الطول.",
        ),
        step(
          "فيثاغورس في الفضاء",
          T`d^2=${u.map((c) => T`\left(${c.tex()}\right)^2`).join("+")}=${s.tex()}`,
        ),
      ];
      out.verification = verification(
        eqV(add(a, u), b) &&
          s.eq(
            dot(a, a)
              .add(dot(b, b))
              .sub(dot(a, b).mul(G.integer(2))),
          ),
        "إعادة بناء نقطة الوصول، ومقارنة فيثاغورس بهوية الجداء السلمي",
        3,
      );
      setRoot(s);
      plot.segments?.push({
        from: 0,
        to: 1,
        arrow: input.operation === "vector",
      });
      break;
    }
    case "norm": {
      const v = V(0),
        s = dot(v, v);
      out.title = "طويلة شعاع في الفراغ";
      out.finalLatex = T`\|${labelV(input.vectors[0])}\|=${rootTex(s)}`;
      out.steps = [
        step(
          "فيثاغورس للمركبات",
          T`\|u\|^2=${v.map((c) => T`\left(${c.tex()}\right)^2`).join("+")}=${s.tex()}`,
        ),
      ];
      setRoot(s);
      out.verification = verification(
        (s.zero() || s.number() > 0) &&
          close(Math.sqrt(Math.max(0, s.number())), Math.hypot(...numeric(v))),
        "مطابقة مربع الجداء السلمي مع خوارزمية hypot المستقلة",
        3,
      );
      break;
    }
    case "vector-arithmetic": {
      const a = V(0),
        b =
          input.arithmetic === "add" ||
          input.arithmetic === "subtract" ||
          input.arithmetic === "cross"
            ? V(1)
            : origin();
      const k = read(input.coefficient || "1");
      const value =
        input.arithmetic === "cross"
          ? cross(a, b)
          : input.arithmetic === "opposite"
            ? neg(a)
            : input.arithmetic === "scale"
              ? scale(a, k)
              : input.arithmetic === "subtract"
                ? sub(a, b)
                : add(a, b);
      const name = input.vectors.includes("w") ? "r" : "w";
      model.vectors[name] = serial(value);
      activeVectors = [name];
      out.title = "العمليات على الأشعة في الفراغ";
      out.finalLatex = T`\vec{${name}}=${vtex(value)}`;
      out.steps = [
        step(
          "العمل مركبةً مركبة",
          T`${labelV(input.vectors[0])}=${vtex(a)},\quad\vec{${name}}=${vtex(value)}`,
          input.arithmetic === "opposite"
            ? "نظير الشعاع هو المعاكس −u، وليس مقلوب مركباته."
            : "تُجرى العملية نفسها على المركبات الثلاث.",
        ),
      ];
      out.verification = verification(
        input.arithmetic === "cross"
          ? dot(value, a).zero() &&
              dot(value, b).zero() &&
              dot(value, value).eq(
                dot(a, a).mul(dot(b, b)).sub(dot(a, b).pow(2)),
              )
          : input.arithmetic === "opposite"
            ? zeroV(add(value, a))
            : input.arithmetic === "subtract"
              ? eqV(add(value, b), a)
              : input.arithmetic === "add"
                ? eqV(sub(value, b), a)
                : value.every((c, i) => c.eq(a[i].mul(k))),
        "التحقق من العملية بالعلاقة العكسية أو بتعويض المركبات",
        3,
      );
      break;
    }
    case "dependence":
    case "collinear":
    case "coplanar": {
      const vectors =
        input.operation === "collinear"
          ? [sub(P(1), P(0)), sub(P(2), P(0))]
          : input.operation === "coplanar"
            ? [sub(P(1), P(0)), sub(P(2), P(0)), sub(P(3), P(0))]
            : input.vectors.map((_, i) => V(i));
      if (vectors.length !== 2 && vectors.length !== 3)
        throw new ClarificationError(
          "اختر شعاعين أو ثلاثة لدراسة الارتباط الخطي.",
        );
      const d = dependence(vectors);
      out.title =
        input.operation === "collinear"
          ? d.dependent
            ? "النقاط على استقامة واحدة"
            : "النقاط ليست على استقامة واحدة"
          : input.operation === "coplanar"
            ? d.dependent
              ? "النقاط الأربع تقع في مستوٍ واحد"
              : "النقاط الأربع غير مستوية"
            : d.dependent
              ? "الأشعة مرتبطة خطيًا"
              : "الأشعة مستقلة خطيًا";
      out.finalLatex = text(out.title);
      const matrix = T`\begin{pmatrix}${vectors.map((v) => v.map((c) => c.tex()).join("&")).join(T`\\`)}\end{pmatrix}`;
      out.steps = [
        step(
          "الأشعة الواصلة من أصل مشترك",
          vectors.map((v, i) => T`\vec u_${i + 1}=${vtex(v)}`).join(T`\quad`),
        ),
        step(
          vectors.length === 2 ? "اختبار شعاعين" : "الجداء المختلط",
          vectors.length === 2
            ? T`\vec u_1\times\vec u_2=${vtex(cross(vectors[0], vectors[1]))}`
            : T`\det${matrix}=${det(...(vectors as [V, V, V])).tex()}`,
        ),
        step(
          "الرتبة وتفسير النتيجة",
          T`\operatorname{rank}(M)=${d.rank}`,
          "عندما تنخفض الرتبة لا يعني ذلك أن المستقيم أو المستوي الحامل وحيد، خاصة عند تكرار النقاط.",
        ),
      ];
      if (vectors.length === 3 && input.operation === "dependence")
        out.steps.push(
          step(
            "دلالة الرتبة في فضاء ثلاثي الأبعاد",
            text(
              d.rank === 3
                ? "ثلاثة أشعة مستقلة في الفراغ تشكل أساسًا؛ أما التعامد والتجانس فيحتاجان شروطًا إضافية."
                : "هذه الأشعة لا تشكل أساسًا للفراغ لأن رتبتها أقل من ثلاثة.",
            ),
          ),
        );
      if (d.dependent)
        out.steps.push(
          step(
            "علاقة خطية غير تافهة",
            d.coefficients
              .map((c, i) => T`\left(${c.tex()}\right)\vec u_${i + 1}`)
              .join("+") + T`=\vec0`,
          ),
        );
      if (vectors.some(zeroV))
        out.note =
          "يوجد شعاع معدوم أو نقطتان متطابقتان. الشعاع المعدوم وحده لا يحدد اتجاهًا؛ تفرد الحامل يعتمد على بقية النقاط.";
      out.verification = d.check;
      break;
    }
    case "barycenter": {
      if (
        input.points.length < 2 ||
        input.points.length > 4 ||
        input.weights?.length !== input.points.length
      )
        throw new ClarificationError(
          "اكتب نقطتين إلى أربع نقاط، ومع كل نقطة وزنها الصريح، أو اطلب مركز الثقل بأوزان متساوية.",
        );
      const weights = input.weights.map(read),
        sum = weights.reduce((s, w) => s.add(w), Z);
      if (sum.zero())
        throw new ClarificationError(
          "مجموع الأوزان صفر؛ مركز الأبعاد المتناسبة غير معرّف بهذه الصيغة.",
        );
      const points = input.points.map((_, i) => P(i));
      const g = scale(
          points.reduce((s, p, i) => add(s, scale(p, weights[i])), origin()),
          sum.inv(),
        ),
        target = freshPoint(input.outputName || "G");
      addPoint(target, g);
      activePoints = [target, ...input.points];
      out.title = "مركز الأبعاد المتناسبة";
      out.finalLatex = T`${target}${vtex(g)}`;
      out.steps = [
        step("شرط الوجود", T`S=\sum_i\alpha_i=${sum.tex()}\ne0`),
        step(
          "الإحداثيات الموزونة",
          T`${target}=\frac{\sum_i\alpha_iA_i}{S}=${vtex(g)}`,
        ),
        step(
          "خاصية مركز الأبعاد",
          T`\sum_i\alpha_i\overrightarrow{${target}A_i}=\vec0`,
        ),
      ];
      const residual = points.reduce(
        (s, p, i) => add(s, scale(sub(p, g), weights[i])),
        origin(),
      );
      out.verification = verification(
        zeroV(residual),
        `تعويض إحداثيات المركز في العلاقة الشعاعية ذات الأصل ${target}`,
        points.length,
      );
      if (input.showApplication !== false) {
        if (points.length === 2) {
          const col = zeroV(
            cross(sub(g, points[0]), sub(points[1], points[0])),
          );
          out.steps.push(
            step(
              "استقامة المركز والنقطتين",
              T`\overrightarrow{A_1${target}}\times\overrightarrow{A_1A_2}=${vtex(cross(sub(g, points[0]), sub(points[1], points[0])))}`,
              eqV(points[0], points[1])
                ? "النقطتان متطابقتان؛ المركز موجود، لكن لا يوجد مستقيم حامل وحيد."
                : col
                  ? "المركز يقع على المستقيم الواصل بين النقطتين، وقد يقع خارج القطعة إذا اختلفت إشارتا الوزنين."
                  : "لم يتحقق شرط الاستقامة.",
            ),
          );
        } else {
          const directions: V[] = [];
          let skipped = 0;
          for (let i = 0; i < points.length; i++) {
            const other = sum.sub(weights[i]);
            if (other.zero()) {
              skipped++;
              continue;
            }
            const h = scale(
              points.reduce(
                (s, p, j) => (i === j ? s : add(s, scale(p, weights[j]))),
                origin(),
              ),
              other.inv(),
            );
            const u = sub(h, points[i]);
            if (zeroV(u)) {
              skipped++;
              continue;
            }
            directions.push(u);
            const preferred = "IJKL"[i];
            const name = input.points.includes(preferred)
              ? ["I", "J", "K", "L", "F", "T"].find(
                  (n) =>
                    !input.points.includes(n) &&
                    !plot.points.some((p) => p.label === n),
                ) || "T"
              : preferred;
            addPoint(name, h);
            plot.segments?.push({
              from: plot.points.findIndex((p) => p.label === input.points[i]),
              to: plot.points.length - 1,
              dashed: true,
            });
            out.steps.push(
              step(
                `تجميع النقاط المقابلة للرأس ${input.points[i]}`,
                T`${name}=${vtex(h)},\quad ${target}=\frac{(${weights[i].tex()})${input.points[i]}+(${other.tex()})${name}}{${sum.tex()}}`,
                `خاصية التجميع تثبت انتماء ${target} إلى المستقيم، بدل الاكتفاء بتقاطع مرئي في الرسم.`,
              ),
            );
          }
          const unique = directions.some((u, i) =>
            directions.slice(i + 1).some((v) => !zeroV(cross(u, v))),
          );
          out.steps.push(
            step(
              "تفسير التلاقي",
              text(
                unique
                  ? `المستقيمات المعرّفة تتلاقى في ${target} وحيدًا`
                  : `تحتوي المستقيمات المعرّفة ${target}، لكن قد تتطابق فلا يكون التقاطع نقطة وحيدة`,
              ),
              skipped
                ? "استُبعد تجميع مقامه صفر أو اتجاهه معدوم؛ لا ندّعي وجود مستقيم لم تعرّفه المعطيات."
                : "الأوزان المتساوية تعطي تلاقي المتوسطات في المثلث أو الواصلات مع مراكز الوجوه في رباعي الوجوه.",
            ),
          );
        }
      }
      break;
    }
    case "dot": {
      const u = V(0),
        v = V(1),
        d = dot(u, v);
      scalar = d;
      out.title = "الجداء السلمي والتعامد";
      out.finalLatex = T`${labelV(input.vectors[0])}\cdot${labelV(input.vectors[1])}=${d.tex()}`;
      if (!zeroV(u) && !zeroV(v))
        out.finalLatex = aligned([
          out.finalLatex,
          text(d.zero() ? "الشعاعان متعامدان" : "الشعاعان غير متعامدين"),
        ]);
      out.steps = [
        step(
          "الصيغة التحليلية",
          T`\vec u\cdot\vec v=${u.map((c, i) => T`\left(${c.tex()}\right)\left(${v[i].tex()}\right)`).join("+")}=${d.tex()}`,
        ),
        step(
          "الطويلتان",
          T`\|u\|=${rootTex(dot(u, u))},\quad\|v\|=${rootTex(dot(v, v))}`,
        ),
      ];
      if (zeroV(u) || zeroV(v))
        out.steps.push(
          step(
            "الشعاع المعدوم",
            text("الجداء معدوم، لكن الزاوية واتجاه الشعاع المعدوم غير معرّفين"),
          ),
        );
      else
        out.steps.push(
          step(
            "اختبار التعامد",
            d.zero()
              ? T`\vec u\cdot\vec v=0\Longrightarrow\vec u\perp\vec v`
              : T`\cos\theta=\frac{${d.tex()}}{${rootTex(dot(u, u).mul(dot(v, v)))}}`,
            "للشعاعين غير المعدومين فقط، شرط الجداء المعدوم يعادل تعامد الاتجاهين.",
          ),
        );
      const alt = dot(add(u, v), add(u, v))
        .sub(dot(u, u))
        .sub(dot(v, v))
        .div(G.integer(2));
      const numericDot = numeric(u).reduce(
        (s, c, i) => s + c * numeric(v)[i],
        0,
      );
      out.verification = verification(
        alt.eq(d) && numericReliable(d) && close(d.number(), numericDot),
        "مطابقة الجداء بهوية مربع طويل الجمع ثم جمع مركبات مستقل",
        3,
      );
      break;
    }
    case "geometric-dot": {
      const g = input.geometricDot;
      if (!g) throw new ClarificationError("أدخل الطويلتين والزاوية ووحدتها.");
      const a = bounded(read(g.norms[0])),
        b = bounded(read(g.norms[1]));
      if (a.sign() <= 0 || b.sign() <= 0)
        throw new ClarificationError(
          "لحساب الجداء من زاوية، الطويلتان موجبتان والشعاعان غير معدومين.",
        );
      const hasPi = /\bpi\b/.test(g.angle);
      let angle: G,
        angleText: string,
        numericAngle: number,
        exactDegrees: G | undefined;
      if (hasPi) {
        const p = polynomial(g.angle.replace(/\bpi\b/g, "t"));
        if ([...p.keys()].some((k) => k !== "00010"))
          throw new ClarificationError(
            "اكتب زاوية الراديان كنسبة صريحة من π، مثل pi/3.",
          );
        angle = p.get("00010") || Z;
        numericAngle = angle.number() * Math.PI;
        angleText = angle.eq(U) ? "\\pi" : T`\left(${angle.tex()}\right)\pi`;
        if (g.unit === "RAD") exactDegrees = angle.mul(G.integer(180));
      } else {
        angle = read(g.angle);
        numericAngle = angle.number();
        angleText = angle.tex();
        if (g.unit === "DEG") exactDegrees = angle;
        if (g.unit === "GRAD") exactDegrees = angle.mul(read("9/10"));
      }
      const degrees =
        g.unit === "RAD"
          ? (numericAngle * 180) / Math.PI
          : g.unit === "GRAD"
            ? numericAngle * 0.9
            : numericAngle;
      if (
        !Number.isFinite(degrees) ||
        (exactDegrees
          ? exactDegrees.sign() < 0 ||
            exactDegrees.sub(G.integer(180)).sign() > 0
          : degrees < 0 || degrees > 180)
      )
        throw new ClarificationError(
          "الزاوية بين الشعاعين بين ٠ و١٨٠ درجة، أو ما يكافئها بالوحدة المختارة.",
        );
      const famous = [0, 30, 45, 60, 90, 120, 135, 150, 180],
        values = [
          U,
          G.root(new Rational(3)).div(G.integer(2)),
          G.root(new Rational(2)).div(G.integer(2)),
          U.div(G.integer(2)),
          Z,
          U.div(G.integer(2)).neg(),
          G.root(new Rational(2)).div(G.integer(2)).neg(),
          G.root(new Rational(3)).div(G.integer(2)).neg(),
          U.neg(),
        ];
      const index = exactDegrees
        ? famous.findIndex((d) => exactDegrees!.eq(G.integer(d)))
        : -1;
      const phase =
        g.unit === "DEG"
          ? T`\left(${angleText}\right)^{\circ}`
          : g.unit === "GRAD"
            ? T`\left(${angleText}\right)\,\mathrm{grad}`
            : angleText;
      out.title = "الجداء السلمي بالصيغة الهندسية";
      if (index >= 0) {
        scalar = a.mul(b).mul(values[index]);
        out.finalLatex = T`\vec u\cdot\vec v=${scalar.tex()}`;
      } else {
        scalarExpression = `(${a.text()})*(${b.text()})*cos(${g.unit === "RAD" ? g.angle : `(${g.angle})*pi/${g.unit === "DEG" ? 180 : 200}`})`;
        const nearSpecial = famous.some((d) => Math.abs(d - degrees) < 1e-10);
        if (!nearSpecial)
          scalarValue =
            a.number() * b.number() * Math.cos((degrees * Math.PI) / 180);
        else {
          scalarExpression = undefined;
          out.note =
            "الزاوية قريبة جدًا من قيمة مميزة؛ أبقيت الجداء بصيغته الدقيقة دون تقريبها إلى تلك الزاوية أو إلى الصفر.";
        }
        out.finalLatex =
          T`\vec u\cdot\vec v=(${a.tex()})(${b.tex()})\cos(${phase})` +
          (scalarValue === undefined
            ? ""
            : T`\approx ${Number(scalarValue.toPrecision(10))}`);
      }
      out.steps = [
        step(
          "الصيغة الهندسية",
          T`\vec u\cdot\vec v=\|u\|\|v\|\cos\theta=(${a.tex()})(${b.tex()})\cos(${phase})`,
          "الوحدة المكتوبة أو المختارة مقدمة على إعداد الزاوية العام. هذا حساب من الطويلتين والزاوية، وليس فحصًا مستقلًا لمعطيات إحداثية غير معطاة.",
        ),
      ];
      break;
    }
    case "plane":
    case "bisector":
    case "normal": {
      let p: SpacePlane;
      if (input.operation === "bisector") {
        const a = P(0),
          b = P(1);
        p = planeAt(scale(add(a, b), U.div(G.integer(2))), nonzero(sub(b, a)));
        out.title = "المستوي المنصف العمودي";
      } else if (input.planes.length) {
        p = Q(0);
        out.title = "المستوي وشعاعه الناظم";
      } else if (input.vectors.length) {
        p = planeAt(P(0), V(0));
        if (input.points.some((_, i) => !evaluatePlane(p, P(i)).zero()))
          throw new ClarificationError(
            "النقاط لا تنتمي جميعها إلى المستوي ذي الناظم المعطى.",
          );
        out.title = "معادلة مستوٍ من نقطة وناظم";
      } else if (input.points.length >= 3) {
        let n: V | undefined;
        for (let i = 1; i < input.points.length && !n; i++)
          for (let j = i + 1; j < input.points.length; j++) {
            const candidate = cross(sub(P(i), P(0)), sub(P(j), P(0)));
            if (!zeroV(candidate)) {
              n = candidate;
              break;
            }
          }
        if (!n)
          throw new ClarificationError(
            "النقاط مستقيمة أو متطابقة؛ لا تعرّف مستويًا وحيدًا.",
          );
        p = planeAt(P(0), n);
        if (input.points.some((_, i) => !evaluatePlane(p, P(i)).zero()))
          throw new ClarificationError(
            "النقاط ليست مستوية؛ لا يوجد مستوٍ يمر بها جميعًا.",
          );
        out.title = "المستوي المار بالنقاط المعطاة";
      } else {
        throw new ClarificationError(
          "أدخل ثلاث نقاط غير مستقيمة، أو نقطة وناظم غير معدوم.",
        );
      }
      const n = vector(p.normal),
        base = scale(n, read(p.offset).neg().div(dot(n, n)));
      const name = input.outputName || input.planes[0] || "P";
      addPlane(name, p);
      activePlanes = [name];
      model.vectors.n = serial(n);
      activeVectors = ["n"];
      out.finalLatex =
        input.operation === "normal"
          ? T`\vec n=${vtex(n)}`
          : T`${cleanName(name)}:\quad ${planeTex(p)}`;
      out.steps = [
        step("الناظم غير المعدوم", T`\vec n=${vtex(n)}\ne\vec0`),
        step(
          "شرط الانتماء",
          T`\vec n\cdot\overrightarrow{AM}=0\quad\Longleftrightarrow\quad ${planeTex(p)}`,
        ),
      ];
      const axis: V = n[0].zero() ? [U, Z, Z] : [Z, U, Z],
        u = cross(n, axis),
        v = cross(n, u);
      out.verification = planeCheck(
        p,
        input.points.length >= 3
          ? input.points.map((_, i) => P(i))
          : [base, add(base, u), add(base, v)],
      );
      if (input.operation === "bisector")
        out.steps.push(
          step(
            "مركز القطعة وبعد الطرفين",
            T`I=${vtex(scale(add(P(0), P(1)), U.div(G.integer(2))))},\quad MA^2=MB^2`,
            "المستوي عمودي على AB ويمر بمنتصفها. نقطة A=B لا تعرّف مستويًا منصفًا وحيدًا.",
          ),
        );
      break;
    }
    case "line": {
      const existing =
          input.lines.length && !input.points.length && !input.vectors.length
            ? L(0)
            : undefined,
        p = existing ? vector(existing.point) : P(0),
        u = existing
          ? vector(existing.direction)
          : input.vectors.length
            ? V(0)
            : sub(P(1), p),
        l = lineAt(p, u),
        name = input.outputName || input.lines[0] || "D";
      addLine(name, l);
      activeLines = [name];
      out.title = "التمثيل البارامتري للمستقيم";
      out.finalLatex = T`${cleanName(name)}:\quad ${lineTex(l)}`;
      out.steps = [
        step(
          "نقطة وشعاع توجيه",
          T`M=${vtex(p)}+t${vtex(u)},\quad t\in\mathbb R`,
        ),
        step(
          "اتجاه غير معدوم",
          T`\vec u=${vtex(u)}\ne\vec0`,
          "يستعمل الإحداثي الثالث الوسيط نفسه؛ لا نختار وسيطًا مستقلًا لكل إحداثي.",
        ),
      ];
      out.verification = verification(
        eqV(
          add(p, u),
          vector(l.point).map((c, i) => c.add(vector(l.direction)[i])) as V,
        ) && !zeroV(u),
        "تعويض t=0 وt=1 في التمثيل وفحص اتجاه غير معدوم",
        2,
      );
      break;
    }
    case "planes": {
      const a = Q(0),
        b = Q(1),
        n = vector(a.normal),
        m = vector(b.normal),
        u = cross(n, m);
      out.title = "الأوضاع النسبية لمستويين";
      if (zeroV(u)) {
        const k = n.findIndex((c) => !c.zero()),
          ratio = m[k].div(n[k]);
        const same = read(b.offset).eq(read(a.offset).mul(ratio));
        out.finalLatex = text(
          same ? "المستويان منطبقان" : "المستويان متوازيان ومتمايزان",
        );
        out.steps = [
          step("تناسب الناظمين", T`\vec n_2=(${ratio.tex()})\vec n_1`),
          step(
            "مقارنة الحد الثابت",
            T`d_2=${read(b.offset).tex()},\quad\lambda d_1=${read(a.offset).mul(ratio).tex()}`,
          ),
        ];
        out.verification = verification(
          same === read(b.offset).sub(read(a.offset).mul(ratio)).zero(),
          "فحص تناسب المعادلتين بما فيه الحد الثابت",
          4,
        );
      } else {
        const r = eliminate(
            [
              [...n, read(a.offset).neg()],
              [...m, read(b.offset).neg()],
            ],
            3,
          ),
          p = origin();
        r.pivots.forEach((c, i) => (p[c] = r.matrix[i][3]));
        const l = lineAt(p, u);
        addLine("D", l);
        activeLines = ["D"];
        out.finalLatex = T`${cleanName(input.planes[0])}\cap ${cleanName(input.planes[1])}=D,\qquad ${lineTex(l)}`;
        out.steps = [
          step(
            "اتجاه التقاطع",
            T`\vec u=\vec n_1\times\vec n_2=${vtex(u)}\ne\vec0`,
          ),
          step("حل المعادلتين لاختيار نقطة", T`A=${vtex(p)}`),
        ];
        out.verification = verification(
          [p, add(p, u)].every(
            (v) => evaluatePlane(a, v).zero() && evaluatePlane(b, v).zero(),
          ),
          "تعويض نقطتين من مستقيم التقاطع في المعادلتين، وفحص الناظمين",
          4,
        );
      }
      break;
    }
    case "line-plane": {
      const l = L(0),
        p = Q(0),
        point = vector(l.point),
        u = vector(l.direction),
        n = vector(p.normal),
        den = dot(n, u),
        res = evaluatePlane(p, point);
      out.title = "وضع مستقيم بالنسبة إلى مستوٍ";
      out.steps = [
        step("التعويض بالوسيط", T`(${den.tex()})t+(${res.tex()})=0`),
      ];
      if (den.zero()) {
        out.finalLatex = text(
          res.zero()
            ? "المستقيم محتوى في المستوي"
            : "المستقيم موازٍ للمستوي ولا يقطعه",
        );
        out.verification = verification(
          evaluatePlane(p, add(point, u)).eq(res),
          "تعويض نقطتين مختلفتين وفحص ثبات قيمة معادلة المستوي",
          2,
        );
      } else {
        const t = res.neg().div(den),
          i = add(point, scale(u, t));
        const name = freshPoint("I", i);
        addPoint(name, i);
        activePoints = [name];
        out.finalLatex = T`${cleanName(input.lines[0])}\cap ${cleanName(input.planes[0])}=\{${name}${vtex(i)}\},\quad t=${t.tex()}`;
        out.steps.push(
          step(
            "إحداثيات نقطة التقاطع",
            T`${name}=A+(${t.tex()})\vec u=${vtex(i)}`,
          ),
        );
        out.verification = verification(
          evaluatePlane(p, i).zero() && zeroV(cross(sub(i, point), u)),
          "انتماء نقطة التقاطع إلى المستوي والمستقيم بشرطين مستقلين",
          2,
        );
      }
      break;
    }
    case "lines": {
      const a = L(0),
        b = L(1),
        p = vector(a.point),
        q = vector(b.point),
        u = vector(a.direction),
        v = vector(b.direction),
        w = sub(q, p),
        c = cross(u, v);
      const result = lineIntersection(a, b);
      out.title = "الأوضاع النسبية لمستقيمين في الفراغ";
      const parallel = zeroV(c),
        same = parallel && zeroV(cross(w, u)),
        coplanar = det(w, u, v).zero();
      out.finalLatex = text(
        same
          ? "المستقيمان منطبقان"
          : parallel
            ? "المستقيمان متوازيان ومتمايزان"
            : coplanar
              ? "المستقيمان متقاطعان"
              : "المستقيمان متخالفان",
      );
      out.steps = [
        step("الاتجاهان", T`\vec u\times\vec v=${vtex(c)}`),
        step(
          "شرط الاستواء",
          T`[\overrightarrow{AB},\vec u,\vec v]=${det(w, u, v).tex()}`,
        ),
      ];
      if (result) {
        const name = freshPoint("I", result.point);
        addPoint(name, result.point);
        activePoints = [name];
        out.finalLatex += T`\quad ${name}${vtex(result.point)}`;
        out.steps.push(
          step(
            "حل الوسيطين والتحقق",
            T`t=${result.t.tex()},\quad s=${result.s.tex()},\quad A+t\vec u=B+s\vec v=${vtex(result.point)}`,
          ),
        );
      }
      out.steps.push(
        step(
          "التعامد والتقاطع",
          T`\vec u\cdot\vec v=${dot(u, v).tex()}`,
          dot(u, v).zero()
            ? !parallel && coplanar
              ? "الاتجاهان متعامدان والمستقيمان يتقاطعان، إذًا هما متعامدان عند نقطة التقاطع."
              : "اتجاهان متعامدان لا يكفيان لإثبات تقاطع مستقيمين متخالفين."
            : "الاتجاهان غير متعامدين.",
        ),
      );
      out.verification = verification(
        same
          ? result === null
          : parallel
            ? result === undefined
            : coplanar
              ? !!result &&
                eqV(add(p, scale(u, result.t)), add(q, scale(v, result.s)))
              : result === undefined,
        "مطابقة معيار الجداء المختلط/الشعاعي مع حل جملة الوسيطين بغاؤس",
        3,
      );
      break;
    }
    case "distance-plane": {
      const p = P(0),
        q = Q(0),
        { n, d } = planeValues(q),
        s = dot(n, p).add(d),
        n2 = dot(n, n),
        squared = s.pow(2).div(n2),
        h = sub(p, scale(n, s.div(n2)));
      const footName = freshPoint("H", h);
      addPoint(footName, h);
      activePoints = [input.points[0], footName];
      out.title = "بعد نقطة عن مستوٍ ومسقطها العمودي";
      out.finalLatex = aligned([
        T`d(${cleanName(input.points[0])},${cleanName(input.planes[0])})=${rootTex(squared)}`,
        T`${footName}${vtex(h)}`,
      ]);
      out.steps = [
        step("الناظم والمعطيات", T`\vec n=${vtex(n)},\quad P:${planeTex(q)}`),
        step(
          "قانون البعد",
          T`d=\frac{|ax_M+by_M+cz_M+d|}{\sqrt{a^2+b^2+c^2}}=\frac{|${s.tex()}|}{${rootTex(n2)}}=${rootTex(squared)}`,
        ),
        step(
          "الإسقاط العمودي",
          T`${footName}=M-\frac{a x_M+b y_M+c z_M+d}{a^2+b^2+c^2}\vec n=${vtex(h)}`,
        ),
      ];
      const diff = sub(p, h);
      out.verification = verification(
        evaluatePlane(q, h).zero() &&
          zeroV(cross(diff, n)) &&
          dot(diff, diff).eq(squared),
        "فحص انتماء المسقط وتوازي متجه الإسقاط مع الناظم ومطابقة طوله بالقانون",
        3,
      );
      setRoot(squared);
      plot.segments?.push({
        from: 0,
        to: plot.points.length - 1,
        dashed: true,
      });
      break;
    }
    case "distance-line": {
      const p = P(0),
        l = L(0),
        a = vector(l.point),
        u = vector(l.direction),
        w = sub(p, a),
        t = dot(w, u).div(dot(u, u)),
        h = add(a, scale(u, t)),
        c = cross(w, u),
        squared = dot(c, c).div(dot(u, u));
      const footName = freshPoint("H", h);
      addPoint(footName, h);
      activePoints = [input.points[0], footName];
      out.title = "بعد نقطة عن مستقيم";
      out.finalLatex = aligned([
        T`d(${cleanName(input.points[0])},${cleanName(input.lines[0])})=${rootTex(squared)}`,
        T`${footName}${vtex(h)}`,
      ]);
      out.steps = [
        step(
          "قانون البعد",
          T`d(M,D)=\frac{\|\overrightarrow{AM}\times\vec u\|}{\|\vec u\|}=${rootTex(squared)}`,
        ),
        step(
          "المسقط من شرط التعامد",
          T`t_${footName}=\frac{\overrightarrow{AM}\cdot\vec u}{\|u\|^2}=${t.tex()},\quad ${footName}=A+t_${footName}u=${vtex(h)}`,
        ),
      ];
      out.verification = verification(
        dot(sub(p, h), u).zero() && dot(sub(p, h), sub(p, h)).eq(squared),
        "حساب المسقط بطريقة الجداء السلمي ومقارنة الطول بطريقة الجداء الشعاعي",
        2,
      );
      setRoot(squared);
      plot.segments?.push({
        from: 0,
        to: plot.points.length - 1,
        dashed: true,
      });
      break;
    }
    case "sphere":
    case "sphere-diameter":
    case "sphere-equation": {
      let center: V, r2: G;
      if (input.operation === "sphere-diameter") {
        center = scale(add(P(0), P(1)), U.div(G.integer(2)));
        const d = sub(P(1), P(0));
        r2 = dot(d, d).div(G.integer(4));
      } else {
        if (!input.sphere)
          throw new ClarificationError(
            "أدخل مركز الكرة ونصف قطرها، أو طرفي قطرها، أو معادلتها.",
          );
        center = readV(input.sphere.center);
        r2 = read(input.sphere.radiusSquared);
      }
      if (r2.sign() < 0 || (!r2.zero() && r2.number() === 0))
        throw new ClarificationError(
          "مربع نصف القطر يجب أن يكون غير سالب وممثلًا بدقة كافية.",
        );
      const data = { center: serial(center), radiusSquared: r2.text() };
      input = { ...input, sphere: data };
      const centerName = freshPoint("K", center);
      addPoint(centerName, center);
      activePoints = [centerName, ...input.points];
      out.title = r2.zero()
        ? "كرة منعدمة تختزل إلى نقطة"
        : "المعادلة الديكارتية للكرة";
      out.finalLatex = sphereTex(center, r2);
      const expanded =
        linearTex(
          [
            U,
            U,
            U,
            ...center.map((c) => c.mul(G.integer(-2))),
            dot(center, center).sub(r2),
          ],
          ["x^2", "y^2", "z^2", "x", "y", "z", ""],
        ) + "=0";
      out.steps = [
        step(
          "المركز ونصف القطر",
          T`${centerName}=${vtex(center)},\quad R=${rootTex(r2)}`,
        ),
        step(
          input.operation === "sphere-diameter"
            ? "خاصية القطر"
            : "المعادلة القياسية",
          input.operation === "sphere-diameter"
            ? T`K=\frac{A+B}{2},\quad R^2=\frac{AB^2}{4}=${r2.tex()}`
            : out.finalLatex,
        ),
        step("الشكل الموسع", expanded),
      ];
      out.visuals.push({
        kind: "formula-cards",
        title: "صيغتا معادلة الكرة",
        cards: [
          { label: "المركز ونصف القطر", latex: out.finalLatex },
          { label: "الشكل الموسع", latex: expanded },
        ],
      });
      const r = Math.sqrt(Math.max(0, r2.number())),
        coords = numeric(center);
      let error = 0;
      for (let axis = 0; axis < 3; axis++)
        for (const sign of [-1, 1]) {
          const p = [...coords];
          p[axis] += sign * r;
          const value =
            p.reduce((s, x, i) => s + (x - coords[i]) ** 2, 0) - r2.number();
          error = Math.max(
            error,
            Math.abs(value) / Math.max(1e-300, r2.number()),
          );
        }
      let expansionCheck = false;
      try {
        const plain =
          "x^2+y^2+z^2" +
          center
            .map((c, i) => `+(${c.mul(G.integer(-2)).text()})*${"xyz"[i]}`)
            .join("") +
          `+(${dot(center, center).sub(r2).text()})=0`;
        const recovered = sphereFromEquation(plain);
        expansionCheck =
          eqV(vector(recovered.center), center) &&
          read(recovered.radiusSquared).eq(r2);
      } catch {
        /* An unavailable independent check never earns a badge. */
      }
      out.verification = verification(
        expansionCheck &&
          error < 1e-9 &&
          (r2.zero() ||
            (r > 0 &&
              (Math.max(...coords.map(Math.abs)) * Number.EPSILON) / r < 1e-6)),
        "مطابقة المعادلتين الموسعة والمركزية، وتعويض ست نقاط محورية بفروق مركزية مستقلة",
        6,
      );
      if (input.operation === "sphere-diameter")
        out.verification.passed &&= [P(0), P(1)].every((p) =>
          dot(sub(p, center), sub(p, center)).eq(r2),
        );
      plot.sphere = { center: coords, radius: r };
      break;
    }
    case "tetrahedron":
    case "parallelepiped": {
      const vectors =
        input.operation === "tetrahedron"
          ? [sub(P(1), P(0)), sub(P(2), P(0)), sub(P(3), P(0))]
          : [V(0), V(1), V(2)];
      const d = det(...(vectors as [V, V, V])),
        abs = d.sign() < 0 ? d.neg() : d,
        vol = input.operation === "tetrahedron" ? abs.div(G.integer(6)) : abs;
      scalar = vol;
      out.title =
        input.operation === "tetrahedron"
          ? "حجم رباعي الوجوه"
          : "حجم متوازي السطوح";
      out.finalLatex = T`V=${vol.tex()}`;
      out.steps = [
        step("الجداء المختلط", T`[\vec u,\vec v,\vec w]=${d.tex()}`),
        step(
          "الحجم",
          T`V=${input.operation === "tetrahedron" ? "\\frac16" : ""}\left|${d.tex()}\right|=${vol.tex()}`,
        ),
      ];
      if (input.operation === "tetrahedron") {
        const n = cross(vectors[0], vectors[1]),
          n2 = dot(n, n);
        if (!n2.zero()) {
          const height2 = d.pow(2).div(n2);
          out.steps.push(
            step(
              "الارتفاع وقانون الهرم",
              T`h=${rootTex(height2)},\quad S_{ABC}=\frac{${rootTex(n2)}}2,\quad V=\frac13 S_{ABC}h`,
              "هذا يربط الجداء المختلط بقانون بعد الرأس عن مستوي القاعدة. إذا كانت القاعدة مستقيمة، لا يُعرّف ارتفاع على مستوٍ وحيد منها.",
            ),
          );
        }
        for (let i = 0; i < input.points.length; i++)
          for (let j = i + 1; j < input.points.length; j++)
            plot.segments?.push({ from: i, to: j });
      }
      const m = vectors,
        alternate = m[0][0]
          .mul(m[1][1].mul(m[2][2]).sub(m[1][2].mul(m[2][1])))
          .sub(m[0][1].mul(m[1][0].mul(m[2][2]).sub(m[1][2].mul(m[2][0]))))
          .add(m[0][2].mul(m[1][0].mul(m[2][1]).sub(m[1][1].mul(m[2][0]))));
      out.verification = verification(
        alternate.eq(d),
        "مطابقة التوسع المباشر للمحدد مع الجداء الشعاعي ثم السلمي",
        3,
      );
      if (d.zero())
        out.note =
          "الحجم صفر؛ الأشعة مرتبطة أو النقاط مستوية. لا تعرّف هذه المعطيات مجسمًا غير منعدم.";
      break;
    }
    case "matrix":
    case "line-system": {
      let rows: G[][];
      if (input.operation === "line-system") {
        const a = L(0),
          b = L(1),
          p = vector(a.point),
          q = vector(b.point),
          u = vector(a.direction),
          v = vector(b.direction),
          w = sub(q, p);
        rows = [0, 1, 2].map((i) => [u[i], v[i].neg(), w[i]]);
        out.title = "جملة الوسيطين ومصفوفتها الموسعة";
        out.finalLatex = T`\begin{cases}${rows.map((row) => linearTex(row.slice(0, 2), ["t", "s"]) + "=" + row[2].tex()).join(T`\\`)}\end{cases}`;
      } else {
        rows = input.vectors.length
          ? input.vectors.map((_, i) => V(i))
          : input.points.map((_, i) => P(i));
        out.title = "الإحداثيات كصفوف مصفوفة";
        out.finalLatex = T`M=\begin{pmatrix}${rows.map((row) => row.map((c) => c.tex()).join("&")).join(T`\\`)}\end{pmatrix}`;
      }
      if (!rows.length || rows.length > 6)
        throw new ClarificationError(
          "اختر صفًا إلى ستة صفوف للجسر إلى المصفوفات.",
        );
      const matrix = rows.map((row) =>
        row.map((c) => {
          const n = c.number();
          if (
            !Number.isFinite(n) ||
            Math.abs(n) > 1e6 ||
            (!c.zero() && n === 0)
          )
            throw new ClarificationError(
              "غيّر مقياس الإحداثيات قبل الجسر العددي إلى المصفوفات.",
            );
          return n;
        }),
      );
      const cells = rows.map((r) => r.map((c) => c.text())),
        alias = bridgeMatrixName(previousMatrices?.values, cells);
      if (input.operation === "matrix")
        out.finalLatex = out.finalLatex.replace(/^M=/, `${alias}=`);
      out.contextPatch = {
        matrix,
        matrices: {
          values: {
            ...previousMatrices?.values,
            [alias]: cells,
          },
          active: alias,
          origin: "geometry",
          scalarFactor: previousMatrices?.scalarFactor,
          system:
            input.operation === "line-system"
              ? {
                  coefficients: rows.map((r) =>
                    r.slice(0, -1).map((c) => c.text()),
                  ),
                  constants: rows.map((r) => r[r.length - 1].text()),
                  variables: ["t", "s"],
                }
              : undefined,
        },
      };
      out.steps = [
        step(
          "جسر إلى محرك المصفوفات",
          out.finalLatex,
          `نُقلت الإحداثيات الجبرية الدقيقة إلى المصفوفة ${alias}، دون استبدال مصفوفة مسماة مختلفة. يمكنك طلب المنقول أو الرتبة أو العودة إلى الأشعة. الأعمدة في الجملة هي معامل t ثم معامل s ثم الطرف الأيمن.`,
        ),
      ];
      break;
    }
    case "pyramid-volume": {
      if (!input.pyramid)
        throw new ClarificationError("أدخل مساحة القاعدة والارتفاع العمودي.");
      const area = bounded(read(input.pyramid.area)),
        height = bounded(read(input.pyramid.height));
      if (area.sign() <= 0 || height.sign() <= 0)
        throw new ClarificationError("مساحة القاعدة والارتفاع العمودي موجبان.");
      scalar = area.mul(height).div(G.integer(3));
      out.title = "حجم هرم من مساحة قاعدته وارتفاعه";
      out.finalLatex = T`V=\frac13 S_{\text{قاعدة}}h=${scalar.tex()}`;
      out.steps = [
        step(
          "تمييز المعطيات",
          T`S=${area.tex()},\quad h=${height.tex()}`,
          "لا نفترض شكل القاعدة ولا نحسب مساحة الوجوه دون معطياتها.",
        ),
        step("قانون حجم الهرم", out.finalLatex),
      ];
      break;
    }
    case "solid": {
      const s = input.solid;
      if (!s) throw new ClarificationError("اختر المجسم وأبعاده المطلوبة.");
      const required =
        s.id === "cube"
          ? ["a"]
          : s.id === "cuboid"
            ? ["a", "b", "c"]
            : s.id === "sphere"
              ? ["r"]
              : s.id === "pyramid"
                ? ["a", "h"]
                : s.id === "triangularPrism"
                  ? ["area", "perimeter", "h"]
                  : ["r", "h"];
      if (required.some((k) => !s.dimensions[k]))
        throw new ClarificationError("أكمل كل أبعاد المجسم المطلوبة.");
      const d = Object.fromEntries(
        Object.entries(s.dimensions).map(([k, v]) => [k, bounded(read(v))]),
      );
      for (const v of Object.values(d))
        if (v.sign() <= 0)
          throw new ClarificationError(
            "الأبعاد ومساحة ومحيط القاعدة موجبة، ولا يجوز إدخال قيمة سالبة أو صفر.",
          );
      const pi = T`\pi`,
        timesPi = (v: G) =>
          `${v.terms.size > 1 ? `\\left(${v.tex()}\\right)` : v.tex()}${pi}`,
        a = d.a,
        r = d.r,
        h = d.h;
      let volume: string, area: string, sq: G | undefined;
      const exactVolume = (v: G) => {
        scalar = v;
        return v.tex();
      };
      if (s.id === "cube") {
        volume = exactVolume(a.pow(3));
        area = a.pow(2).mul(G.integer(6)).tex();
        sq = a.pow(2).mul(G.integer(3));
        out.title = "المكعب";
      } else if (s.id === "cuboid") {
        volume = exactVolume(d.a.mul(d.b).mul(d.c));
        area = d.a
          .mul(d.b)
          .add(d.a.mul(d.c))
          .add(d.b.mul(d.c))
          .mul(G.integer(2))
          .tex();
        sq = d.a.pow(2).add(d.b.pow(2)).add(d.c.pow(2));
        out.title = "متوازي المستطيلات";
      } else if (s.id === "pyramid") {
        volume = exactVolume(a.pow(2).mul(h).div(G.integer(3)));
        const slant = h.pow(2).add(a.pow(2).div(G.integer(4)));
        area = T`${a.pow(2).tex()}+(${a.mul(G.integer(2)).tex()})${rootTex(slant)}`;
        out.title = "الهرم الرباعي المنتظم";
      } else if (s.id === "triangularPrism") {
        volume = exactVolume(d.area.mul(h));
        area = d.perimeter
          .mul(h)
          .add(d.area.mul(G.integer(2)))
          .tex();
        out.title = "الموشور القائم";
      } else if (s.id === "sphere") {
        volume = timesPi(r.pow(3).mul(G.integer(4)).div(G.integer(3)));
        area = timesPi(r.pow(2).mul(G.integer(4)));
        out.title = "مساحة الكرة وحجمها";
      } else if (s.id === "cylinder") {
        volume = timesPi(r.pow(2).mul(h));
        area = timesPi(r.mul(h.add(r)).mul(G.integer(2)));
        out.title = "الأسطوانة القائمة";
      } else {
        volume = timesPi(r.pow(2).mul(h).div(G.integer(3)));
        area = T`${pi}(${r.tex()})\left(${r.tex()}+${rootTex(r.pow(2).add(h.pow(2)))}\right)`;
        out.title = "المخروط القائم";
      }
      out.finalLatex = aligned([
        T`V&=${volume}`,
        T`S&=${area}`,
        ...(sq ? [T`d&=${rootTex(sq)}`] : []),
      ]);
      out.steps = [
        step(
          "تمييز الأبعاد",
          Object.entries(d)
            .map(([k, v]) => `${k}=${v.tex()}`)
            .join(T`\quad `),
          s.id === "pyramid"
            ? "هذا هرم رباعي منتظم قاعدته مربعة والارتفاع عمودي، لا هرمًا عامًا بلا معلومات عن القاعدة."
            : s.id === "triangularPrism"
              ? "الحساب لحجم موشور قائم ومساحته، بمعرفة مساحة القاعدة ومحيطها والارتفاع؛ لا نستنتج شكل القاعدة من المساحة وحدها."
              : "الارتفاع العمودي غير الارتفاع المائل؛ لا نستبدل أحدهما بالآخر.",
        ),
        step("الحجم والمساحة", out.finalLatex),
      ];
      plot.solid = {
        id: s.id,
        dimensions: Object.fromEntries(
          Object.entries(d).map(([k, v]) => [k, v.number()]),
        ),
      };
      if (s.id === "triangularPrism")
        out.note =
          "الرسم توضيحي لموشور فقط؛ مساحة القاعدة ومحيطها لا يحددان مثلثًا وحيدًا.";
      break;
    }
    case "plot":
      out.title = "المعطيات الهندسية في الفراغ";
      out.finalLatex = text("تمثيل المعطيات في إسقاط ثنائي الأبعاد");
      out.steps = [
        step(
          "حدود الرسم",
          text("الإسقاط لا يثبت توازيًا أو تعامدًا أو تقاطعًا"),
          "نختبر العلاقات بالإحداثيات والمعادلات، لا بمظهر الرسم وحده.",
        ),
      ];
      break;
  }
  if (!out.finalLatex)
    throw new ClarificationError("حدّد العملية الهندسية المطلوبة.");
  if (scalar) {
    scalarExpression = scalar.text();
    const n = scalar.number();
    if (numericReliable(scalar)) scalarValue = n;
  }
  if (scalarValue !== undefined && Number.isFinite(scalarValue))
    out.decimal = scalarValue;
  const priorities = {
    points: [...activePoints, ...input.points],
    vectors: [...activeVectors, ...input.vectors],
    lines: [...activeLines, ...input.lines],
    planes: [...activePlanes, ...input.planes],
  };
  for (const [key, max] of [
    ["points", 16],
    ["vectors", 12],
    ["lines", 6],
    ["planes", 6],
  ] as const) {
    const names = [
      ...new Set([...priorities[key], ...Object.keys(model[key]).reverse()]),
    ].slice(0, max);
    for (const name of Object.keys(model[key]))
      if (!names.includes(name)) delete model[key][name];
  }
  const context: GeometryContext = {
    ...model,
    operation: input.operation,
    active: {
      points: [...new Set(activePoints)],
      vectors: [...new Set(activeVectors)],
      lines: [...new Set(activeLines)],
      planes: [...new Set(activePlanes)],
    },
    inputs: {
      points: input.points,
      vectors: input.vectors,
      lines: input.lines,
      planes: input.planes,
    },
    arithmetic: input.arithmetic,
    coefficient: input.coefficient,
    radius: input.radius,
    pyramid: input.pyramid,
    weights: input.weights,
    geometricDot: input.geometricDot,
    sphere: input.sphere,
    solid: input.solid,
  };
  if (
    scalarValue !== undefined &&
    Number.isFinite(scalarValue) &&
    scalarExpression &&
    scalarExpression.length <= 500
  ) {
    context.lastScalar = scalarValue;
    context.lastScalarExpression = scalarExpression;
  }
  if (!isGeometryContext(context))
    throw new ClarificationError(
      "المعطيات أو النتيجة تجاوزت حد السياق؛ قلّل عدد الأسماء أو طول الكسور.",
    );
  out.contextPatch = { ...out.contextPatch, geometry: context };
  const drawingInRange =
    plot.points.every((p) =>
      p.position.every((n) => Number.isFinite(n) && Math.abs(n) <= 1e12),
    ) &&
    (plot.lines || []).every((l) =>
      [...l.point, ...l.direction].every(
        (n) => Number.isFinite(n) && Math.abs(n) <= 1e12,
      ),
    ) &&
    (!plot.sphere ||
      (Number.isFinite(plot.sphere.radius) &&
        plot.sphere.radius <= 1e12 &&
        plot.sphere.center.every((n) => Math.abs(n) <= 1e12)));
  if (drawingInRange) {
    if (
      plot.points.length ||
      plot.lines?.length ||
      plot.planes?.length ||
      plot.sphere ||
      plot.solid
    )
      out.visuals.push(plot);
  } else
    out.note =
      (out.note ? out.note + " " : "") +
      "أبقيت النتيجة الدقيقة، وحُجب الرسم لأن إحداثيات النتيجة تتجاوز مقياسه المحدود.";
  return out;
}
// Keep the algebraic field's rational constructor local to this module's numeric constants.
import { Rational } from "./probabilityExact";
