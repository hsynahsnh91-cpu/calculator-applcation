import type { MatrixRequest } from "../solver/matrixTypes";
import { isMatrixContext } from "../solver/matrixTypes";
import type {
  SolverContext,
  SolverResult,
  SolutionStep,
} from "../solver/types";
import { emptySpaceModel, type SpaceVector } from "../solver/geometryTypes";
import { G, read } from "./spaceGeometryMath";
import {
  matrixError,
  readMatrix,
  serializeMatrix,
  matrixLatex,
  square,
  zero,
  identity,
  determinant,
  permutationDeterminant,
  adjugate,
  scaleMatrix,
  transpose,
  rowReduce,
  classify,
  equalMatrices,
  multiplyMatrices,
  matrixExpression,
  numericMatrix,
  minor,
  type M,
} from "./matrixExact";
const T = String.raw;
const aligned = (lines: string[]) =>
  T`\begin{aligned}${lines.join(T`\\[6pt]`)}\end{aligned}`;
const step = (title: string, latex: string, text?: string): SolutionStep => ({
  title,
  latex,
  text,
});
const label = (title: string, name: string) => T`\text{${title} }${name}`;
const valueLatex = (v: M | G) => (v instanceof G ? v.tex() : matrixLatex(v));
const same = (a: M | G, b: M | G) =>
  a instanceof G && b instanceof G
    ? a.eq(b)
    : !(a instanceof G) && !(b instanceof G)
      ? equalMatrices(a, b)
      : a instanceof G
        ? a.zero() &&
          !(b instanceof G) &&
          b.every((r) => r.every((c) => c.zero()))
        : b instanceof G &&
          b.zero() &&
          a.every((r) => r.every((c) => c.zero()));
async function independentExpression(
  source: string,
  values: MatrixRequest["context"]["values"],
  actual: M | G,
): Promise<boolean> {
  try {
    const { math } = await import("../solver/math");
    const scope: Record<string, unknown> = {};
    for (const [name, cells] of Object.entries(values)) {
      const a = numericMatrix(readMatrix(cells));
      if (!a) return false;
      scope[name] = math.matrix(a);
    }
    if (!scope.I) {
      const first = Object.values(values).find((v) => v.length === v[0].length);
      if (first) scope.I = math.identity(first.length);
    }
    const expression = source
      .replace(/([A-Z])\^\(?[Tt]\)?/g, "transpose($1)")
      .replace(/([A-Z])(?=[A-Z])/g, "$1*")
      .replace(/\btr\(/g, "trace(");
    const reference: unknown = math.evaluate(expression, scope);
    const close = (x: unknown, g: G) =>
      typeof x === "number" &&
      Number.isFinite(x) &&
      Math.abs(x - g.number()) <=
        1e-10 * Math.max(1e-20, Math.abs(x), Math.abs(g.number()));
    if (actual instanceof G) return close(reference, actual);
    const rows: unknown = math.isMatrix(reference)
      ? reference.toArray()
      : reference;
    return (
      Array.isArray(rows) &&
      rows.length === actual.length &&
      rows.every(
        (r, i) =>
          Array.isArray(r) &&
          r.length === actual[0].length &&
          r.every((c, j) => close(c, actual[i][j])),
      )
    );
  } catch {
    return false;
  }
}
function determinantSteps(
  a: M,
  name: string,
  request: MatrixRequest,
): SolutionStep[] {
  const n = square(a),
    d = determinant(a),
    p = (g: G) => T`\left(${g.tex()}\right)`;
  const title = `محدد المصفوفة ${name}`;
  if (request.determinantMethod === "sarrus") {
    if (n !== 3)
      return matrixError(
        "طريقة ساروس تخص المحدد 3×3 فقط؛ اختر النشر لمقاس آخر.",
      );
    const positive = [0, 1, 2].map((j) =>
      a[0][j].mul(a[1][(j + 1) % 3]).mul(a[2][(j + 2) % 3]),
    );
    const negative = [0, 1, 2].map((j) =>
      a[0][j].mul(a[1][(j + 2) % 3]).mul(a[2][(j + 1) % 3]),
    );
    return [
      step(
        `${title} — طريقة ساروس`,
        aligned([
          T`D_+&=${[0, 1, 2].map((j) => `${p(a[0][j])}${p(a[1][(j + 1) % 3])}${p(a[2][(j + 2) % 3])}`).join("+")}=${positive.reduce((s, g) => s.add(g), zero()).tex()}`,
          T`D_-&=${[0, 1, 2].map((j) => `${p(a[0][j])}${p(a[1][(j + 2) % 3])}${p(a[2][(j + 1) % 3])}`).join("+")}=${negative.reduce((s, g) => s.add(g), zero()).tex()}`,
          T`|${name}|&=D_+-D_-=${d.tex()}`,
        ]),
        "نجمع جداءات الأقطار الثلاثة بالاتجاه الأول، ثم نطرح مجموع الجداءات الثلاثة بالاتجاه المقابل؛ لا نمدّ هذه الطريقة إلى 4×4.",
      ),
    ];
  }
  if (n === 1) return [step(title, T`|${name}|=${a[0][0].tex()}`)];
  if (
    n === 2 &&
    !request.expansion &&
    request.determinantMethod !== "expansion"
  )
    return [
      step(
        title,
        aligned([
          T`|${name}|&=a_{11}a_{22}-a_{12}a_{21}`,
          T`&=${p(a[0][0])}${p(a[1][1])}-${p(a[0][1])}${p(a[1][0])}=${d.tex()}`,
        ]),
        "جداء القطر الرئيسي ناقص جداء القطر الثانوي.",
      ),
    ];
  const expansion = request.expansion || { axis: "row", index: 0 };
  if (
    !Number.isInteger(expansion.index) ||
    expansion.index < 0 ||
    expansion.index >= n
  )
    return matrixError("رقم سطر أو عمود النشر يجب أن يكون ضمن قياس المصفوفة.");
  const lines = Array.from({ length: n }, (_, k) => {
    const i = expansion.axis === "row" ? expansion.index : k,
      j = expansion.axis === "column" ? expansion.index : k;
    const m = minor(a, i, j),
      c = determinant(m);
    return T`C_{${i + 1}${j + 1}}&=(-1)^{${i + j + 2}}\left|${matrixLatex(m)}\right|=${((i + j) % 2 ? c.neg() : c).tex()}`;
  });
  const terms = Array.from({ length: n }, (_, k) => {
    const i = expansion.axis === "row" ? expansion.index : k,
      j = expansion.axis === "column" ? expansion.index : k;
    const c = determinant(minor(a, i, j));
    return `${p(a[i][j])}${p((i + j) % 2 ? c.neg() : c)}`;
  });
  return [
    step(
      `النشر بحسب ${expansion.axis === "row" ? "السطر" : "العمود"} ${expansion.index + 1}`,
      aligned([...lines, T`|${name}|&=${terms.join("+")}=${d.tex()}`]),
      "العامل المرافق هو محدد المصفوفة بعد حذف سطر العنصر وعموده مع إشارة الشطرنج، ثم نضربه بالعنصر ونجمع.",
    ),
  ];
}
function solveSystem(
  request: MatrixRequest,
  out: SolverResult,
  finals: string[],
  checks: boolean[],
) {
  out.contextPatch!.solutions = undefined;
  const system = request.context.system!;
  // A coefficient alias is derived, not permission to overwrite a user's named A.
  const coefficientName =
    request.systemName ||
    Object.entries(request.context.values).find(
      ([, cells]) =>
        JSON.stringify(cells) === JSON.stringify(system.coefficients),
    )?.[0] ||
    [..."AMBCDEFGHJKLNOPQRSTUVWXYZI"].find(
      (n) => !Object.prototype.hasOwnProperty.call(request.context.values, n),
    )!;
  const a = readMatrix(system.coefficients),
    b = system.constants.map(read),
    n = a[0].length,
    square = a.length === n,
    augmented = a.map((r, i) => [...r, b[i]]),
    reduction = rowReduce(augmented, n),
    d = square ? determinant(a) : zero();
  if (request.operations.includes("cramer") && !square)
    return matrixError(
      "كرامر يحتاج عدد المعادلات مساويًا لعدد المجاهيل؛ اختر غاوس للجملة غير المربعة مع فحص جميع معادلاتها.",
    );
  out.title = request.operations.includes("cramer")
    ? "حل الجملة بطريقة كرامر"
    : "حل الجملة بطريقة غاوس";
  out.steps.push(
    step(
      "تمثيل الجملة بمصفوفة موسعة",
      T`${coefficientName}=${matrixLatex(a)},\quad X=\begin{pmatrix}${system.variables.join(T`\\`)}\end{pmatrix},\quad b=${matrixLatex(b.map((v) => [v]))}\qquad [${coefficientName}\mid b]=${matrixLatex(augmented, true)}`,
      `ترتيب أعمدة المجاهيل: ${system.variables.join("، ")}. العمود الأخير هو الطرف الأيمن، ولا يدخل ضمن عدد المجاهيل.`,
    ),
  );
  if (request.operations.includes("cramer")) {
    out.steps.push(
      step("المحدد العام للجملة", T`\Delta=|${coefficientName}|=${d.tex()}`),
    );
    checks.push(d.eq(permutationDeterminant(a)));
  }
  const inconsistent = reduction.reduced.some(
    (r) => r.slice(0, n).every((c) => c.zero()) && !r[n].zero(),
  );
  if (inconsistent || reduction.pivots.length < n) {
    if (request.operations.includes("cramer"))
      out.steps.push(
        step(
          "لماذا لا نقسم على المحدد؟",
          T`\Delta=0`,
          "قاعدة القسمة في كرامر لا تطبق عندما يكون المحدد صفرًا. نستخدم غاوس للتمييز بين انعدام الحل وتعدد الحلول.",
        ),
      );
    out.steps.push(
      ...reduction.steps,
      step("الشكل المدرج المختزل", matrixLatex(reduction.reduced, true)),
    );
    checks.push(reduction.verified);
    if (inconsistent) {
      const row = reduction.reduced.find(
        (r) => r.slice(0, n).every((c) => c.zero()) && !r[n].zero(),
      )!;
      finals.push(T`\mathcal S=\varnothing`);
      out.steps.push(
        step("تناقض في الجملة", T`0=${row[n].tex()}\quad\text{مستحيل}`),
      );
    } else {
      const free = Array.from({ length: n }, (_, i) => i).filter(
        (i) => !reduction.pivots.includes(i),
      );
      const params = ["t", "s", "r", "q", "p"].filter(
          (p) => !system.variables.includes(p),
        ),
        parameter = (i: number) => params[free.indexOf(i)];
      const lines = system.variables.map((v, i) => {
        const pivot = reduction.pivots.indexOf(i);
        return pivot < 0
          ? `${v}=${parameter(i)}`
          : `${v}=${reduction.reduced[pivot][n].tex()}${free.map((j) => (reduction.reduced[pivot][j].zero() ? "" : T`-\left(${reduction.reduced[pivot][j].tex()}\right)${parameter(j)}`)).join("")}`;
      });
      const particular = system.variables.map((_, i) => {
        const pivot = reduction.pivots.indexOf(i);
        return pivot < 0 ? zero() : reduction.reduced[pivot][n];
      });
      const homogeneous = free.map((j) =>
        system.variables.map((_, i) => {
          const pivot = reduction.pivots.indexOf(i);
          return i === j
            ? G.integer(1)
            : pivot < 0
              ? zero()
              : reduction.reduced[pivot][j].neg();
        }),
      );
      checks.push(
        a.every((r, i) =>
          r
            .reduce((sum, c, j) => sum.add(c.mul(particular[j])), zero())
            .eq(b[i]),
        ) &&
          homogeneous.every((v) =>
            a.every((r) =>
              r.reduce((sum, c, j) => sum.add(c.mul(v[j])), zero()).zero(),
            ),
          ),
      );
      finals.push(
        T`\text{عدد غير منته من الحلول}\qquad\begin{cases}${lines.join(T`\\`)}\end{cases}`,
      );
      out.steps.push(
        step(
          "المجاهيل الحرة",
          T`${params.slice(0, free.length).join(",")}\in\mathbb R`,
          "هذه صيغة جميع الحلول، وليست اختيار قيم عددية افتراضية للمجاهيل الحرة.",
        ),
      );
    }
  } else {
    const solution = reduction.pivots.map((_, i) => reduction.reduced[i][n]);
    if (request.operations.includes("cramer")) {
      for (let j = 0; j < n; j++) {
        const replaced = a.map((r, i) => r.map((c, k) => (k === j ? b[i] : c))),
          dj = determinant(replaced);
        out.steps.push(
          step(
            `محدد المجهول ${system.variables[j]}`,
            T`\Delta_{${system.variables[j]}}=\left|${matrixLatex(replaced)}\right|=${dj.tex()}\qquad ${system.variables[j]}=\frac{\Delta_{${system.variables[j]}}}{\Delta}=\frac{${dj.tex()}}{${d.tex()}}=${dj.div(d).tex()}`,
            `استبدلنا العمود ${j + 1} وحده بعمود الطرف الأيمن، وحافظنا على ترتيب بقية الأعمدة.`,
          ),
        );
        checks.push(dj.div(d).eq(solution[j]));
      }
    }
    if (request.operations.includes("gauss"))
      out.steps.push(
        ...reduction.steps,
        step("غاوس — قراءة الحل", matrixLatex(reduction.reduced, true)),
      );
    finals.push(
      system.variables
        .map((v, i) => `${v}=${solution[i].tex()}`)
        .join(T`\qquad `),
    );
    checks.push(
      reduction.verified &&
        a.every((r, i) =>
          r.reduce((s, c, j) => s.add(c.mul(solution[j])), zero()).eq(b[i]),
        ),
    );
    if (
      solution.every(
        (v) => Number.isFinite(v.number()) && (v.zero() || v.number() !== 0),
      )
    )
      out.contextPatch!.solutions = Object.fromEntries(
        system.variables.map((v, i) => [v, solution[i].number()]),
      );
  }
  request.context.origin = "system";
  request.context.values[coefficientName] = system.coefficients;
  request.context.active = coefficientName;
  out.contextPatch!.matrix = numericMatrix(a);
  out.verification.method =
    "فحص تكافؤ العمليات السطرية بضرب مصفوفة التحويل الأصلية، وتعويض الحل الفريد أو الحل الخاص واتجاهات أسرة الحلول في جميع المعادلات؛ مع مطابقة كرامر عند طلبها";
}
export async function solveMatrixRequest(
  request: MatrixRequest,
  context: SolverContext,
): Promise<SolverResult> {
  const out: SolverResult = {
    id: `matrices-${Math.random().toString(36).slice(2, 10)}`,
    engine: "matricesEngine",
    engines: ["matricesEngine"],
    mode: "matrices",
    title: "عمليات المصفوفة",
    finalLatex: "",
    steps: [],
    visuals: [],
    verification: { passed: false, method: "لا يوجد فحص مستقل لهذه العملية" },
    contextPatch: {},
  };
  const finals: string[] = [],
    checks: boolean[] = [],
    name = request.name;
  // A new nonscalar matrix result must never inherit an unrelated old determinant as ans.
  delete request.context.lastScalar;
  if (
    request.operations.includes("gauss") ||
    request.operations.includes("cramer")
  )
    solveSystem(request, out, finals, checks);
  else {
    const a = request.context.values[name]
      ? readMatrix(request.context.values[name])
      : undefined;
    if (a) {
      out.steps.push(
        step(
          `المصفوفة ${name} والمعطيات`,
          `${name}=${matrixLatex(a)}`,
          `عدد الأسطر ${a.length} وعدد الأعمدة ${a[0].length}. لا نغيّر ترتيب الأسطر أو الأعمدة تلقائيًا.`,
        ),
      );
      out.contextPatch!.matrix = numericMatrix(a);
    }
    for (const operation of request.operations) {
      if (!a && !["expression", "compare"].includes(operation))
        return matrixError(`ما عناصر المصفوفة ${name}؟`);
      const m = a!;
      if (operation === "types") {
        out.title = `نوع المصفوفة ${name}`;
        const types = classify(m);
        if (/اثبت|برهن|بين ان|تحقق/.test(request.source)) {
          const tests = [
            ["واحدية|الوحدة|مصفوفة وحدة", "واحدية"],
            ["صفرية", "صفرية"],
            ["مثلثية (?:ال)?(?:عليا|علوية)", "مثلثية عليا"],
            ["مثلثية (?:ال)?(?:سفلي|سفلية)", "مثلثية سفلى"],
            ["قطرية", "قطرية"],
            ["متماثلة|متناظرة", "متماثلة"],
            ["مربعة", "مربعة"],
          ].filter(([pattern]) => new RegExp(pattern).test(request.source));
          if (!tests.length)
            return matrixError(
              "ما النوع الذي تريد التحقق منه؟ حدّد نوعًا مثل الواحدية أو الصفرية أو المثلثية.",
            );
          const actual = tests.every(([, property]) =>
              types.some((t) =>
                property === "مربعة"
                  ? t.name === "مصفوفة مربعة"
                  : t.name.includes(property),
              ),
            ),
            negative = /ليست|غير|لا تكون/.test(request.source);
          const valid = actual !== negative;
          finals.push(
            T`\text{${valid ? "العبارة صحيحة" : "العبارة غير صحيحة"}}`,
          );
        }

        finals.push(
          T`\begin{gathered}${types.map((c) => T`\text{${c.name}}`).join(T`\\[4pt]`)}\end{gathered}`,
        );
        out.steps.push(
          ...types.map((c) => step(c.name, c.formula.replace(/\bA\b/g, name))),
        );
      } else if (operation === "dimensions") {
        out.title = `قياس المصفوفة ${name}`;
        finals.push(T`${name}\in M_{${m.length},${m[0].length}}(\mathbb R)`);
      } else if (operation === "determinant") {
        const d = determinant(m);
        out.title = `محدد المصفوفة ${name}`;
        finals.push(`${label("محدد المصفوفة", name)}=${d.tex()}`);
        out.steps.push(...determinantSteps(m, name, request));
        checks.push(d.eq(permutationDeterminant(m)));
        request.context.lastScalar = d.text();
        out.verification.method =
          "مطابقة المحدد بخوارزمية بارييس وبجمع التبديلات المستقل، دون تقريب أو اختبار صفري بهامش";
      } else if (operation === "trace") {
        square(m);
        const v = m.reduce((s, r, i) => s.add(r[i]), zero());
        out.title = `أثر المصفوفة ${name}`;
        finals.push(`${label("أثر المصفوفة", name)}=${v.tex()}`);
        out.steps.push(
          step(
            out.title,
            T`${label("أثر المصفوفة", name)}=${m.map((r, i) => `\\left(${r[i].tex()}\\right)`).join("+")}=${v.tex()}`,
            "نجمع عناصر القطر الرئيسي فقط، والأثر معرف للمصفوفة المربعة.",
          ),
        );
        checks.push(
          await independentExpression(
            `trace(${name})`,
            request.context.values,
            v,
          ),
        );
        request.context.lastScalar = v.text();
        out.verification.method =
          "فحص عددي مستقل للعمليات المطلوبة بمحرك mathjs؛ النتيجة المعروضة بقيت جبرية دقيقة";
      } else if (operation === "transpose") {
        const v = transpose(m);
        out.title = `منقول المصفوفة ${name}`;
        finals.push(`${name}^T=${matrixLatex(v)}`);
        out.steps.push(
          step(
            out.title,
            T`(${name}^T)_{ij}=${name}_{ji}\qquad ${name}^T=${matrixLatex(v)}`,
            "تصبح الأسطر أعمدة والأعمدة أسطرًا؛ يتبادل عدد الأسطر وعدد الأعمدة.",
          ),
        );
        checks.push(equalMatrices(transpose(v), m));
        out.verification.method =
          "إعادة النقل والتحقق من استرجاع جميع عناصر المصفوفة الأصلية";
      } else if (operation === "adjugate" || operation === "inverse") {
        const n = square(m),
          d = determinant(m),
          adj = adjugate(m);
        out.title =
          operation === "inverse"
            ? `معكوس المصفوفة ${name}`
            : `المصفوفة الملحقة للمصفوفة ${name}`;
        if (operation === "inverse" && d.zero()) {
          finals.push(
            T`\text{لا يوجد معكوس للمصفوفة }${name}\quad (|${name}|=0)`,
          );
          out.steps.push(...determinantSteps(m, name, request));
          checks.push(d.eq(permutationDeterminant(m)));
        } else {
          const v = operation === "inverse" ? scaleMatrix(adj, d.inv()) : adj;
          finals.push(
            `${operation === "inverse" ? name + "^{-1}" : T`\operatorname{adj}(${name})`}=${matrixLatex(v)}`,
          );
          out.steps.push(
            step(
              "العوامل المرافقة ثم المصفوفة الملحقة",
              T`C_{ij}=(-1)^{i+j}|M_{ij}|\qquad \operatorname{adj}(${name})=C^T=${matrixLatex(adj)}`,
              "نحذف سطر العنصر وعموده، ونطبق الإشارة ثم ننقل مصفوفة العوامل المرافقة.",
            ),
          );
          if (operation === "inverse") {
            out.steps.push(
              step(
                `شرط معكوس المصفوفة ${name} وقانونه`,
                T`|${name}|=${d.tex()}\ne0\qquad ${name}^{-1}=\frac{1}{|${name}|}\operatorname{adj}(${name})=${matrixLatex(v)}`,
              ),
            );
            checks.push(
              d.eq(permutationDeterminant(m)) &&
                equalMatrices(multiplyMatrices(m, v), identity(n)) &&
                equalMatrices(multiplyMatrices(v, m), identity(n)),
            );
          } else
            checks.push(
              equalMatrices(
                multiplyMatrices(m, adj),
                scaleMatrix(identity(n), d),
              ) &&
                d.eq(permutationDeterminant(m)) &&
                adj.every((r, i) =>
                  r.every((c, j) =>
                    c.eq(
                      n === 1
                        ? G.integer(1)
                        : (i + j) % 2
                          ? permutationDeterminant(minor(m, j, i)).neg()
                          : permutationDeterminant(minor(m, j, i)),
                    ),
                  ),
                ),
            );
        }
        out.verification.method =
          "فحص المحدد المستقل وعلاقة المصفوفة بالملحقة؛ وفحص جداء المعكوس من الجهتين عندما يكون موجودًا";
      } else if (["rank", "echelon", "rref"].includes(operation)) {
        const r = rowReduce(m);
        out.title =
          operation === "rank"
            ? `الرتبة الجبرية للمصفوفة ${name}`
            : "طريقة غاوس للمصفوفة المدرجة";
        finals.push(
          operation === "rank"
            ? T`\operatorname{rank}(${name})=${r.pivots.length}\quad\text{وقياسها }${m.length}\times${m[0].length}`
            : matrixLatex(operation === "rref" ? r.reduced : r.echelon),
        );
        out.steps.push(
          ...r.steps,
          step(
            "المحاور والرتبة الجبرية",
            T`\operatorname{rank}(${name})=${r.pivots.length}`,
            "عدد الأسطر غير المعدومة بعد الاختزال هو الرتبة الجبرية، وليس قياس المصفوفة m×n.",
          ),
        );
        checks.push(r.verified);
        out.verification.method =
          "ضرب مصفوفة التحويل القابلة للعكس بالمصفوفة الأصلية ومطابقة الشكل المختزل، ثم فحص جميع المحاور";
      } else if (operation === "expression") {
        const expression = request.expression!,
          evaluated = matrixExpression(expression, request.context.values),
          v = evaluated.value;
        out.title = "قيمة العبارة المصفوفية";
        finals.push(
          `${request.assign ? request.assign : evaluated.latex}=${valueLatex(v)}`,
        );
        out.steps.push(
          step(
            "العبارة المطلوبة وشروط الأبعاد",
            `${evaluated.latex}=${valueLatex(v)}`,
            "الجمع والطرح لنفس القياس، والجداء يحتاج تساوي أعمدة الأولى وأسطر الثانية. العدد يضرب كل عنصر؛ ترتيب الجداء محفوظ، وليس تبديليًا عمومًا.",
          ),
        );
        if (/[A-Z]\s*\*?\s*[A-Z]/.test(expression))
          out.steps.push(
            step(
              "حساب كل عنصر من سطر وعمود",
              T`(AB)_{ij}=\sum_{k=1}^{p}a_{ik}b_{kj}`,
              "نضرب عناصر السطر في العناصر المناظرة من العمود ثم نجمع، دون جداء عنصر بعنصر.",
            ),
          );
        checks.push(
          await independentExpression(expression, request.context.values, v),
        );
        if (v instanceof G) {
          request.context.lastScalar = v.text();
          if (request.assign) {
            delete request.context.values[request.assign];
            out.contextPatch!.school = {
              ...context.school,
              values: { ...context.school?.values, [request.assign]: v.text() },
            };
          }
        } else if (request.assign) {
          request.context.values[request.assign] = serializeMatrix(v);
          if (context.school?.values?.[request.assign]) {
            const scalarValues = { ...context.school.values };
            delete scalarValues[request.assign];
            out.contextPatch!.school = {
              ...context.school,
              values: scalarValues,
            };
          }
        }
        out.verification.method =
          "مطابقة عددية مستقلة للعبارة بمحرك mathjs، بعد حسابها جبريًا دون تقريب؛ هذا الفحص ليس برهان هوية رمزية عامة";
      } else if (operation === "compare") {
        const c = request.comparison!,
          l = matrixExpression(c.left, request.context.values),
          r = matrixExpression(c.right, request.context.values),
          eq = same(l.value, r.value),
          valid = eq === c.equal;
        out.title = valid
          ? "العبارة صحيحة للمصفوفات المعطاة"
          : "العبارة غير صحيحة للمصفوفات المعطاة";
        finals.push(
          T`\text{${valid ? "العبارة صحيحة" : "العبارة غير صحيحة"}}\qquad ${l.latex}${eq ? "=" : T`\ne `}${r.latex}`,
        );
        out.steps.push(
          step("حساب الطرف الأول فعليًا", `${l.latex}=${valueLatex(l.value)}`),
          step(
            "حساب الطرف الثاني فعليًا",
            `${r.latex}=${valueLatex(r.value)}`,
            "الحكم ناتج من مقارنة كل عنصر في الطرفين للمصفوفات المحددة. مثال واحد لا يثبت قانونًا لكل المصفوفات.",
          ),
        );
        checks.push(
          await independentExpression(c.left, request.context.values, l.value),
          await independentExpression(c.right, request.context.values, r.value),
        );
        out.verification.method =
          "حساب الطرفين ومطابقتهما بمحرك مستقل ثم مقارنة العناصر، لا افتراض صحة العبارة المطلوبة";
      } else if (operation === "eigen") {
        square(m);
        const { eigs } = await import("mathjs"),
          numeric = numericMatrix(m);
        if (!numeric)
          return matrixError(
            "تعذّر التحويل العددي الموثوق لحساب القيم الذاتية التقريبية.",
          );
        const res = eigs(numeric),
          values = Array.isArray(res.values)
            ? res.values
            : res.values.toArray();
        const { math } = await import("../solver/math");
        out.title = "قيم ذاتية تقريبية — أداة إضافية";
        finals.push(
          T`\lambda\approx\left\{${values.map((v) => math.parse(String(v)).toTex()).join(",")}\right\}`,
        );
        out.steps.push(
          step(
            "المعادلة المميزة",
            T`|${name}-\lambda I|=0`,
            "القيم الذاتية هنا تقريب عددي، وليست ضمن ادعاء تغطية المنهاج أو شارة التحقق الدقيقة.",
          ),
        );
        checks.push(false);
      } else if (operation === "vectors") {
        if (m[0].length !== 3)
          return matrixError(
            "الجسر إلى أشعة الفراغ يحتاج ثلاثة أعمدة تمثل الإحداثيات x وy وz.",
          );
        const names = ["u", "v", "w", "a", "b", "c"].slice(0, m.length),
          cells = serializeMatrix(m);
        out.title = "أسطر المصفوفة كأشعة فراغية";
        finals.push(
          aligned(
            names.map(
              (v, i) =>
                T`\vec{${v}}=\left(${m[i].map((c) => c.tex()).join(",")}\right)`,
            ),
          ),
        );
        const active = { points: [], vectors: names, lines: [], planes: [] };
        out.contextPatch!.geometry = {
          ...emptySpaceModel(),
          operation: "plot",
          vectors: Object.fromEntries(
            names.map((v, i) => [v, cells[i] as SpaceVector]),
          ),
          active,
          inputs: active,
        };
        out.steps.push(
          step(
            "نقل الإحداثيات دون تقريب",
            finals[finals.length - 1],
            "يمكنك الآن طلب الطول أو الجداء السلمي أو الارتباط، أو فتح لوحة الهندسة. لا نفترض أن الأسطر تشكل أساسًا.",
          ),
        );
      } else if (operation === "statistics") {
        const values = m.flat();
        if (values.some((v) => !v.rational()))
          return matrixError(
            "الجسر الإحصائي الحالي يحتاج بيانات نسبية؛ لا نقرّب الجذور أو نعدّ العمود الثاني تكرارات بلا تصريح.",
          );
        out.title = "كل عناصر المصفوفة كبيانات إحصائية";
        out.contextPatch!.probability = {
          active: "statistics",
          statistics: {
            values: values.map((v) => v.number()),
            exactValues: values.map((v) => v.rational()!.text()),
          },
        };
        finals.push(
          T`x_i\in\left\{${values.map((v) => v.tex()).join(",")}\right\}`,
        );
        out.steps.push(
          step(
            "نقل القيم مع تكرار ظهورها",
            finals[finals.length - 1],
            "كل عنصر مشاهدة مستقلة في البيانات؛ لا نعطي عمودًا معنى أوزان أو تكرارات من تلقاء أنفسنا. اطلب المتوسط أو التباين بعد ذلك.",
          ),
        );
      }
    }
  }
  if (request.operations.length !== 1) {
    out.title = `طلبات المصفوفة ${name}`;
    delete request.context.lastScalar;
  }
  if (!isMatrixContext(request.context))
    return matrixError(
      "تجاوز ناتج المصفوفات حدود السياق الآمن؛ بسّط المعطيات.",
    );
  out.contextPatch!.matrices = request.context;
  if (!out.contextPatch!.school) out.contextPatch!.school = context.school;
  out.finalLatex =
    finals.length === 1 ? finals[0] : aligned(finals.map((f) => `${f}`));
  out.verification.passed =
    checks.length === request.operations.length && checks.every(Boolean);
  if (
    request.operations.includes("gauss") ||
    request.operations.includes("cramer") ||
    request.operations.includes("compare")
  )
    out.verification.passed = checks.length > 0 && checks.every(Boolean);
  if (request.operations.length > 1)
    out.verification.method =
      "أُجري لكل عملية مطلوبة فحصها الموضح: محدد مستقل، جداء المعكوس، أو فحص حسابي مستقل بحسب نوعها";
  return out;
}
