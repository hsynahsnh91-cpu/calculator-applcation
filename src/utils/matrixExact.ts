import { G, read } from "./spaceGeometryMath";
import { ClarificationError, type SolutionStep } from "../solver/types";
import type { MatrixCells } from "../solver/matrixTypes";
export type M = G[][];
const T = String.raw;
export const zero = () => G.integer(0);
export const one = () => G.integer(1);
export const matrixError = (s: string): never => {
  throw new ClarificationError(s);
};
export function readMatrix(cells: MatrixCells): M {
  if (
    !cells.length ||
    cells.length > 6 ||
    !cells[0]?.length ||
    cells[0].length > 6 ||
    cells.some((r) => r.length !== cells[0].length)
  )
    return matrixError(
      "اكتب مصفوفة منتظمة من سطر إلى ستة أسطر ومن عمود إلى ستة أعمدة، دون عنصر ناقص.",
    );
  return cells.map((row) =>
    row.map((cell) => {
      try {
        const v = read(cell);
        if (Math.abs(v.number()) > 1e9)
          return matrixError(
            "قيمة عنصر المصفوفة لا تتجاوز مليارًا؛ غيّر مقياس المعطيات.",
          );
        return v;
      } catch (e) {
        if (e instanceof ClarificationError) throw e;
        return matrixError(
          "أكمل عناصر المصفوفة بأعداد أو كسور أو جذور حقيقية بسيطة.",
        );
      }
    }),
  );
}
export function serializeMatrix(a: M): MatrixCells {
  return a.map((row) =>
    row.map((c) => {
      const s = c.text();
      if (s.length > 500)
        return matrixError(
          "تجاوز عنصر الناتج حد التخزين الدقيق؛ بسّط المعطيات.",
        );
      return s;
    }),
  );
}
export const matrixLatex = (a: M, augmented = false): string =>
  augmented
    ? T`\left[\begin{array}{${"c".repeat(a[0].length - 1)}|c}${a.map((r) => r.map((c) => c.tex()).join("&")).join(T`\\`)}\end{array}\right]`
    : T`\begin{pmatrix}${a.map((r) => r.map((c) => c.tex()).join("&")).join(T`\\`)}\end{pmatrix}`;
export const identity = (n: number): M =>
  Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => G.integer(i === j ? 1 : 0)),
  );
export const transpose = (a: M): M =>
  a[0].map((_, j) => a.map((row) => row[j]));
export const square = (a: M) => {
  if (a.length !== a[0].length)
    return matrixError(
      "هذه العملية تخص مصفوفة مربعة فقط؛ عدد الأسطر يجب أن يساوي عدد الأعمدة.",
    );
  return a.length;
};
export function addMatrices(a: M, b: M, subtract = false): M {
  if (a.length !== b.length || a[0].length !== b[0].length)
    return matrixError(
      "للجمع والطرح يجب أن تتطابق أبعاد المصفوفتين: عدد الأسطر وعدد الأعمدة معًا.",
    );
  return a.map((r, i) =>
    r.map((c, j) => (subtract ? c.sub(b[i][j]) : c.add(b[i][j]))),
  );
}
export const scaleMatrix = (a: M, k: G): M =>
  a.map((r) => r.map((v) => v.mul(k)));
export function multiplyMatrices(a: M, b: M): M {
  if (a[0].length !== b.length)
    return matrixError(
      `لا يمكن الجداء: عدد أعمدة الأولى (${a[0].length}) لا يساوي عدد أسطر الثانية (${b.length}).`,
    );
  return a.map((row) =>
    b[0].map((_, j) => row.reduce((s, v, k) => s.add(v.mul(b[k][j])), zero())),
  );
}
export const equalMatrices = (a: M, b: M): boolean =>
  a.length === b.length &&
  a[0].length === b[0].length &&
  a.every((r, i) => r.every((c, j) => c.eq(b[i][j])));
export const minor = (a: M, i: number, j: number): M =>
  a.filter((_, r) => r !== i).map((r) => r.filter((_, c) => c !== j));
/** Fraction-free Bareiss elimination. No epsilon can change singularity. */
export function determinant(a: M): G {
  const n = square(a);
  if (n === 1) return a[0][0];
  const b = a.map((r) => [...r]);
  let previous = one(),
    sign = one();
  for (let k = 0; k < n - 1; k++) {
    const p = b.findIndex((r, i) => i >= k && !r[k].zero());
    if (p < 0) return zero();
    if (p !== k) {
      [b[p], b[k]] = [b[k], b[p]];
      sign = sign.neg();
    }
    const pivot = b[k][k];
    for (let i = k + 1; i < n; i++) {
      for (let j = k + 1; j < n; j++)
        b[i][j] = b[i][j].mul(pivot).sub(b[i][k].mul(b[k][j])).div(previous);
      b[i][k] = zero();
    }
    previous = pivot;
  }
  return sign.mul(b[n - 1][n - 1]);
}
/** Independent Leibniz determinant, bounded at 6! terms. */
export function permutationDeterminant(a: M): G {
  const n = square(a);
  let sum = zero();
  const visit = (
    order: number[],
    used: number,
    product: G,
    negative: boolean,
  ) => {
    if (order.length === n) {
      sum = sum.add(negative ? product.neg() : product);
      return;
    }
    for (let j = 0; j < n; j++)
      if (!(used & (1 << j)) && !a[order.length][j].zero()) {
        const odd = order.filter((k) => k > j).length % 2 === 1;
        visit(
          [...order, j],
          used | (1 << j),
          product.mul(a[order.length][j]),
          negative !== odd,
        );
      }
  };
  visit([], 0, one(), false);
  return sum;
}
export function adjugate(a: M): M {
  const n = square(a);
  if (n === 1) return [[one()]];
  return transpose(
    a.map((row, i) =>
      row.map((_, j) => {
        const d = determinant(minor(a, i, j));
        return (i + j) % 2 ? d.neg() : d;
      }),
    ),
  );
}
export function inverse(a: M): M {
  const d = determinant(a);
  if (d.zero())
    return matrixError("محدد المصفوفة يساوي صفرًا؛ لا يوجد لها معكوس.");
  return scaleMatrix(adjugate(a), d.inv());
}
export function classify(a: M): { name: string; formula: string }[] {
  const n = a.length,
    m = a[0].length,
    out = [
      {
        name: n === m ? "مصفوفة مربعة" : "مصفوفة مستطيلة غير مربعة",
        formula: `${n}\\times ${m}`,
      },
    ];
  if (a.every((r) => r.every((c) => c.zero())))
    out.push({ name: "مصفوفة صفرية", formula: "a_{ij}=0" });
  if (n === m) {
    const upper = a.every((r, i) => r.every((c, j) => i <= j || c.zero())),
      lower = a.every((r, i) => r.every((c, j) => i >= j || c.zero()));
    if (equalMatrices(a, identity(n)))
      out.push({
        name: "مصفوفة واحدية (مصفوفة الوحدة)",
        formula: `A=I_{${n}}`,
      });
    if (upper)
      out.push({
        name: "مثلثية عليا — ما تحت القطر أصفار",
        formula: "a_{ij}=0\\ (i>j)",
      });
    if (lower)
      out.push({
        name: "مثلثية سفلى — ما فوق القطر أصفار",
        formula: "a_{ij}=0\\ (i<j)",
      });
    if (upper && lower)
      out.push({ name: "مصفوفة قطرية", formula: "a_{ij}=0\\ (i\\ne j)" });
    if (equalMatrices(a, transpose(a)))
      out.push({ name: "مصفوفة متماثلة", formula: "A^T=A" });
  }
  return out;
}
export interface Reduction {
  echelon: M;
  reduced: M;
  pivots: number[];
  transform: M;
  steps: SolutionStep[];
  verified: boolean;
}
/** Record actual elementary line operations, including swaps and all backward reductions. */
export function rowReduce(
  source: M,
  coefficientColumns = source[0].length,
): Reduction {
  const a = source.map((r) => [...r]),
    transform = identity(a.length),
    steps: SolutionStep[] = [],
    pivots: number[] = [];
  const augmented = coefficientColumns < a[0].length;
  const swap = (i: number, j: number) => {
    [a[i], a[j]] = [a[j], a[i]];
    [transform[i], transform[j]] = [transform[j], transform[i]];
    steps.push({
      title: "مبادلة سطرين",
      latex: T`L_{${i + 1}}\leftrightarrow L_{${j + 1}}\qquad ${matrixLatex(a, augmented)}`,
    });
  };
  const scale = (i: number, k: G) => {
    a[i] = a[i].map((c) => c.mul(k));
    transform[i] = transform[i].map((c) => c.mul(k));
    steps.push({
      title: "جعل العنصر المحوري واحدًا",
      latex: T`L_{${i + 1}}\leftarrow \left(${k.tex()}\right)L_{${i + 1}}\qquad ${matrixLatex(a, augmented)}`,
    });
  };
  const subtract = (i: number, j: number, k: G) => {
    a[i] = a[i].map((c, l) => c.sub(k.mul(a[j][l])));
    transform[i] = transform[i].map((c, l) => c.sub(k.mul(transform[j][l])));
    steps.push({
      title: "تصفير عنصر بعملية سطرية",
      latex: T`L_{${i + 1}}\leftarrow L_{${i + 1}}-\left(${k.tex()}\right)L_{${j + 1}}\qquad ${matrixLatex(a, augmented)}`,
    });
  };
  let row = 0;
  for (let col = 0; col < coefficientColumns && row < a.length; col++) {
    const p = a.findIndex((r, i) => i >= row && !r[col].zero());
    if (p < 0) continue;
    if (p !== row) swap(p, row);
    for (let i = row + 1; i < a.length; i++)
      if (!a[i][col].zero()) subtract(i, row, a[i][col].div(a[row][col]));
    pivots.push(col);
    row++;
  }
  const echelon = a.map((r) => [...r]);
  for (let i = pivots.length - 1; i >= 0; i--) {
    const col = pivots[i];
    if (!a[i][col].eq(one())) scale(i, a[i][col].inv());
    for (let r = i - 1; r >= 0; r--)
      if (!a[r][col].zero()) subtract(r, i, a[r][col]);
  }
  const shape =
    pivots.every(
      (c, i) => a[i][c].eq(one()) && a.every((r, j) => i === j || r[c].zero()),
    ) &&
    a
      .slice(pivots.length)
      .every((r) => r.slice(0, coefficientColumns).every((c) => c.zero()));
  return {
    echelon,
    reduced: a,
    pivots,
    steps,
    transform,
    verified:
      shape &&
      !determinant(transform).zero() &&
      equalMatrices(multiplyMatrices(transform, source), a),
  };
}
export function numericMatrix(a: M): number[][] | undefined {
  const v = a.map((r) => r.map((c) => c.number()));
  return v.some((r, i) =>
    r.some((x, j) => !Number.isFinite(x) || (x === 0 && !a[i][j].zero())),
  )
    ? undefined
    : v;
}
/** Bounded arithmetic on named matrices, not eval/Function or arbitrary engine syntax. */
export function matrixExpression(
  source: string,
  values: Record<string, MatrixCells>,
): { value: M | G; latex: string } {
  source = source.replace(/\^\(?[Tt]\)?/g, "^T");
  if (!source || source.length > 300)
    return matrixError("اكتب عبارة مصفوفية محددة بطول لا يتجاوز 300 محرف.");
  const names = Object.keys(values),
    first = names
      .map((n) => readMatrix(values[n]))
      .find((m) => m.length === m[0].length);
  const tokens: string[] = [];
  let scanned = 0;
  while (scanned < source.length) {
    if (/\s/.test(source[scanned])) {
      scanned++;
      continue;
    }
    const s = source
      .slice(scanned)
      .match(
        /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|^sqrt\b|^(?:det|tr|trace|adj|inv)\b|^[A-Z]|^[()+*/^'\-]/,
      )?.[0];
    if (!s)
      return matrixError(
        "استخدم أسماء المصفوفات وعمليات الجمع والطرح والجداء والأسس الصحيحة فقط.",
      );
    tokens.push(s);
    scanned += s.length;
    if (tokens.length > 120)
      return matrixError("العبارة المصفوفية طويلة جدًا.");
  }
  type Value = { value: M | G; latex: string };
  let at = 0,
    depth = 0;
  const atom = (): Value => {
    if (++depth > 20)
      return matrixError("أقواس العبارة المصفوفية متداخلة أكثر من اللازم.");
    const t = tokens[at++];
    let out: Value;
    if (t === "(") {
      out = expression();
      if (tokens[at++] !== ")")
        return matrixError("أقواس العبارة المصفوفية غير متوازنة.");
      out = { ...out, latex: T`\left(${out.latex}\right)` };
    } else if (["sqrt", "det", "tr", "trace", "adj", "inv"].includes(t)) {
      if (tokens[at++] !== "(")
        return matrixError("أكمل أقواس العملية المصفوفية.");
      const argument = expression();
      if (tokens[at++] !== ")")
        return matrixError("أكمل أقواس العملية المصفوفية.");
      if (t === "sqrt") {
        if (!(argument.value instanceof G) || !argument.value.rational())
          return matrixError("الجذر هنا لعدد نسبي غير سالب.");
        const v = G.root(argument.value.rational()!);
        out = { value: v, latex: v.tex() };
      } else {
        if (argument.value instanceof G)
          return matrixError("هذه العملية تحتاج مصفوفة، لا عددًا.");
        const a = argument.value;
        if (t === "det")
          out = {
            value: determinant(a),
            latex: T`\left|${argument.latex}\right|`,
          };
        else if (t === "tr" || t === "trace") {
          square(a);
          out = {
            value: a.reduce((s, r, i) => s.add(r[i]), zero()),
            latex: T`\text{أثر المصفوفة }${argument.latex}`,
          };
        } else if (t === "adj")
          out = {
            value: adjugate(a),
            latex: T`\operatorname{adj}(${argument.latex})`,
          };
        else
          out = {
            value: inverse(a),
            latex: T`\left(${argument.latex}\right)^{-1}`,
          };
      }
    } else if (/^[A-Z]$/.test(t || "")) {
      const a = values[t]
        ? readMatrix(values[t])
        : t === "I" && first
          ? identity(first.length)
          : undefined;
      if (!a)
        return matrixError(`ما عناصر المصفوفة ${t}؟ عرّفها قبل استعمالها.`);
      out = { value: a, latex: t };
    } else if (t && /^(?:\d|\.)/.test(t)) {
      const g = read(t);
      out = { value: g, latex: g.tex() };
    } else return matrixError("العبارة المصفوفية ناقصة.");
    depth--;
    return out;
  };
  const power = (): Value => {
    let a = atom();
    while (tokens[at] === "^" || tokens[at] === "'") {
      if (tokens[at++] === "'" || tokens[at] === "T" || tokens[at] === "t") {
        if (tokens[at - 1] !== "'") at++;
        if (a.value instanceof G) return matrixError("المنقول يحتاج مصفوفة.");
        a = { value: transpose(a.value), latex: T`${a.latex}^{T}` };
        continue;
      }
      const bracket = tokens[at] === "(";
      if (bracket) at++;
      const negative = tokens[at] === "-";
      if (negative) at++;
      const n = Number(tokens[at++]) * (negative ? -1 : 1);
      if (
        (bracket && tokens[at++] !== ")") ||
        !Number.isSafeInteger(n) ||
        n < -1 ||
        n > 12
      )
        return matrixError(
          "الأس المصفوفي صحيح من −1 إلى12؛ لا تُحسب قوى كسرية أو رمزية.",
        );
      if (a.value instanceof G)
        a = { value: a.value.pow(n), latex: T`\left(${a.latex}\right)^{${n}}` };
      else {
        const base = a.value;
        square(base);
        let v = identity(base.length);
        if (n === -1) v = inverse(base);
        else for (let i = 0; i < n; i++) v = multiplyMatrices(v, base);
        a = { value: v, latex: T`\left(${a.latex}\right)^{${n}}` };
      }
    }
    return a;
  };
  const unary = (): Value => {
    if (tokens[at] === "+") {
      at++;
      return unary();
    }
    if (tokens[at] === "-") {
      at++;
      const a = unary();
      return {
        value:
          a.value instanceof G
            ? a.value.neg()
            : scaleMatrix(a.value, one().neg()),
        latex: T`-\left(${a.latex}\right)`,
      };
    }
    return power();
  };
  const product = (): Value => {
    let a = unary();
    while (
      at < tokens.length &&
      (tokens[at] === "*" ||
        tokens[at] === "/" ||
        /^[A-Z]$|^(?:\d|\.)|^\(|^sqrt$/.test(tokens[at]))
    ) {
      const divide = tokens[at] === "/";
      if (tokens[at] === "*" || divide) at++;
      const b = unary();
      let value: M | G;
      if (divide) {
        if (!(b.value instanceof G))
          return matrixError(
            "لا توجد قسمة على مصفوفة؛ حدّد جهة الجداء في معكوسها.",
          );
        value =
          a.value instanceof G
            ? a.value.div(b.value)
            : scaleMatrix(a.value, b.value.inv());
      } else if (a.value instanceof G)
        value =
          b.value instanceof G
            ? a.value.mul(b.value)
            : scaleMatrix(b.value, a.value);
      else
        value =
          b.value instanceof G
            ? scaleMatrix(a.value, b.value)
            : multiplyMatrices(a.value, b.value);
      a = {
        value,
        latex: divide
          ? T`\frac{${a.latex}}{${b.latex}}`
          : T`${a.latex}\,${b.latex}`,
      };
    }
    return a;
  };
  const expression = (): Value => {
    let a = product();
    while (tokens[at] === "+" || tokens[at] === "-") {
      const subtract = tokens[at++] === "-",
        b = product();
      let value: M | G;
      if (a.value instanceof G && b.value instanceof G)
        value = subtract ? a.value.sub(b.value) : a.value.add(b.value);
      else if (!(a.value instanceof G) && !(b.value instanceof G))
        value = addMatrices(a.value, b.value, subtract);
      else
        return matrixError(
          "لا يُجمع عدد مع مصفوفة؛ اكتب العدد مضروبًا في مصفوفة الوحدة إذا كان هذا المقصود.",
        );
      a = { value, latex: `${a.latex}${subtract ? "-" : "+"}${b.latex}` };
    }
    return a;
  };
  const a = expression();
  if (at !== tokens.length)
    return matrixError("العبارة المصفوفية غير مكتملة أو فيها رمز غير مدعوم.");
  return a;
}
