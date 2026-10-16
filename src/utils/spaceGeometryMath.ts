import { Rational as R } from "./probabilityExact";
import { ClarificationError } from "../solver/types";
import type {
  SpaceVector,
  SpacePlane,
  SpaceLine,
} from "../solver/geometryTypes";
const fail = (
  text = "اكتب أعدادًا وكسورًا وجذورًا حقيقية بسيطة، دون رموز مجهولة أو أوامر.",
) => new ClarificationError(text);
const gcd = (a: bigint, b: bigint): bigint => {
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
};
const ZERO_R = new R(0),
  ONE_R = new R(1);
/** Exact real multiquadratic field: at most three radical primes/eight terms.
 * Decimal lexemes are read as rationals, never reconstructed from Number.
 */
export class G {
  readonly terms: Map<bigint, R>;
  readonly primes: bigint[];
  constructor(terms: Map<bigint, R>, primes: bigint[] = []) {
    this.terms = new Map([...terms].filter(([, c]) => c.n !== 0n));
    this.primes = [...new Set(primes)]
      .filter((p) => [...this.terms.keys()].some((d) => d % p === 0n))
      .sort((a, b) => (a < b ? -1 : 1));
    if (
      this.terms.size > 8 ||
      this.primes.length > 3 ||
      [...this.terms.values()].some(
        (c) => c.n.toString().length > 400 || c.d.toString().length > 400,
      )
    )
      throw fail(
        "تجاوز الحساب حد الجذور أو الكسور الدقيقة؛ بسّط المعطيات أو غيّر مقياسها.",
      );
  }
  static rational(r: R) {
    return new G(new Map([[1n, r]]));
  }
  static integer(n: number | bigint) {
    return G.rational(new R(n));
  }
  static root(r: R): G {
    if (r.n < 0n) throw fail("جذر سالب ليس إحداثيًا حقيقيًا في الفراغ.");
    if (r.n === 0n) return G.integer(0);
    const square = (n: bigint) => {
      let x = n,
        y = (x + 1n) / 2n;
      while (y < x) {
        x = y;
        y = (x + n / x) / 2n;
      }
      return x;
    };
    const a = square(r.n),
      b = square(r.d);
    if (a * a === r.n && b * b === r.d) return G.rational(new R(a, b));
    if (r.n > 1000000n || r.d > 1000000n)
      throw fail("بسّط الجذر: البسط والمقام داخل الجذر البسيط حتى مليون.");
    let coefficient = ONE_R,
      radicand = 1n;
    const primes: bigint[] = [];
    for (const [start, denominator] of [
      [r.n, false],
      [r.d, true],
    ] as const) {
      let n = start;
      for (let p = 2n; p * p <= n; p++) {
        let e = 0;
        while (n % p === 0n) {
          n /= p;
          e++;
        }
        if (!e) continue;
        const factor = p ** BigInt(Math.floor(e / 2));
        coefficient = denominator
          ? coefficient.div(new R(factor))
          : coefficient.mul(new R(factor));
        if (e % 2) {
          radicand *= p;
          primes.push(p);
          if (denominator) coefficient = coefficient.div(new R(p));
        }
      }
      if (n > 1n) {
        radicand *= n;
        primes.push(n);
        if (denominator) coefficient = coefficient.div(new R(n));
      }
    }
    // A prime appearing in both numerator and denominator cannot survive a reduced R.
    return new G(new Map([[radicand, coefficient]]), primes);
  }
  add(v: G) {
    const m = new Map(this.terms);
    for (const [d, c] of v.terms) m.set(d, (m.get(d) || ZERO_R).add(c));
    return new G(m, [...this.primes, ...v.primes]);
  }
  neg() {
    return new G(
      new Map([...this.terms].map(([d, c]) => [d, new R(-c.n, c.d)])),
      this.primes,
    );
  }
  sub(v: G) {
    return this.add(v.neg());
  }
  mul(v: G) {
    const m = new Map<bigint, R>();
    for (const [a, c] of this.terms)
      for (const [b, e] of v.terms) {
        const g = gcd(a, b),
          d = (a / g) * (b / g);
        m.set(d, (m.get(d) || ZERO_R).add(c.mul(e).mul(new R(g))));
      }
    return new G(m, [...this.primes, ...v.primes]);
  }
  inv(): G {
    if (this.zero()) throw fail("القسمة على صفر غير معرّفة.");
    if (this.terms.size === 1) {
      const [d, c] = [...this.terms][0];
      return new G(new Map([[d, ONE_R.div(c.mul(new R(d)))]]), this.primes);
    }
    const p = this.primes[0];
    if (!p) throw fail("تعذّر اختزال العدد الجبري.");
    const conjugate = new G(
      new Map(
        [...this.terms].map(([d, c]) => [
          d,
          d % p === 0n ? new R(-c.n, c.d) : c,
        ]),
      ),
      this.primes,
    );
    const product = this.mul(conjugate);
    if (product.primes.includes(p))
      throw fail("تعذّر توحيد المقام الجذري بأمان.");
    return conjugate.mul(product.inv());
  }
  div(v: G) {
    return this.mul(v.inv());
  }
  pow(n: number): G {
    if (this.zero() && n === 0) throw fail("0^0 غير معرّفة.");
    if (!Number.isSafeInteger(n) || Math.abs(n) > 12)
      throw fail("الأس العددي هنا صحيح بين −١٢ و١٢.");
    if (n < 0) return this.inv().pow(-n);
    let a: G = this,
      b = G.integer(1);
    while (n) {
      if (n % 2) b = b.mul(a);
      n = Math.floor(n / 2);
      if (n) a = a.mul(a);
    }
    return b;
  }
  zero() {
    return this.terms.size === 0;
  }
  eq(v: G) {
    return this.sub(v).zero();
  }
  rational(): R | undefined {
    return this.zero()
      ? ZERO_R
      : this.terms.size === 1 && this.terms.has(1n)
        ? this.terms.get(1n)
        : undefined;
  }
  sign(): number {
    if (this.zero()) return 0;
    const r = this.rational();
    if (r) return r.n < 0n ? -1 : 1;
    const isqrt = (n: bigint) => {
      if (n < 2n) return n;
      let x = n,
        y = (x + 1n) / 2n;
      while (y < x) {
        x = y;
        y = (x + n / x) / 2n;
      }
      return x;
    };
    for (const precision of [16, 40, 96, 200, 384]) {
      const scale = 10n ** BigInt(precision);
      let lo = ZERO_R,
        hi = ZERO_R;
      for (const [d, c] of this.terms) {
        if (d === 1n) {
          lo = lo.add(c);
          hi = hi.add(c);
          continue;
        }
        const n = isqrt(d * scale * scale),
          a = new R(n, scale),
          b = new R(n + 1n, scale);
        lo = lo.add(c.mul(c.n > 0n ? a : b));
        hi = hi.add(c.mul(c.n > 0n ? b : a));
      }
      if (lo.n > 0n) return 1;
      if (hi.n < 0n) return -1;
    }
    throw fail(
      "الفارق الجبري أصغر من حد المقارنة الموثوقة؛ بسّط الجذور أو غيّر المقياس.",
    );
  }
  number() {
    const n = [...this.terms].reduce(
      (s, [d, c]) => s + c.number() * Math.sqrt(Number(d)),
      0,
    );
    if (!Number.isFinite(n)) throw fail("خرج الحساب عن المجال العددي المنتهي.");
    return n;
  }
  text() {
    if (this.zero()) return "0";
    return [...this.terms]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([d, c]) =>
        d === 1n ? `(${c.text()})` : `(${c.text()})*sqrt(${d})`,
      )
      .join("+");
  }
  tex() {
    if (this.zero()) return "0";
    let out = "";
    for (const [d, c] of [...this.terms].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const negative = c.n < 0n,
        a = new R(negative ? -c.n : c.n, c.d);
      const body =
        d === 1n ? a.tex() : `${a.eq(ONE_R) ? "" : a.tex()}\\sqrt{${d}}`;
      out += out
        ? `${negative ? "-" : "+"}${body}`
        : `${negative ? "-" : ""}${body}`;
    }
    return out;
  }
}
export const Z = G.integer(0),
  U = G.integer(1);
type Powers = [number, number, number, number, number];
const C = "00000",
  symbols = ["x", "y", "z", "t", "s"];
export type Polynomial = Map<string, G>;
const constant = (v: G): Polynomial =>
  v.zero() ? new Map() : new Map([[C, v]]);
const plus = (a: Polynomial, b: Polynomial): Polynomial => {
  const m = new Map(a);
  for (const [k, v] of b) {
    const c = (m.get(k) || Z).add(v);
    if (c.zero()) m.delete(k);
    else m.set(k, c);
  }
  return m;
};
const times = (a: Polynomial, b: Polynomial): Polynomial => {
  let m: Polynomial = new Map();
  for (const [ka, va] of a)
    for (const [kb, vb] of b) {
      const p = [...ka].map((c, i) => Number(c) + Number(kb[i]));
      if (p.reduce((s, n) => s + n, 0) > 2)
        throw fail(
          "التحليل الهندسي يدعم المعادلات الخطية ومعادلة الكرة التربيعية فقط.",
        );
      const key = p.join("");
      m = plus(m, new Map([[key, va.mul(vb)]]));
    }
  if (m.size > 32) throw fail("المعادلة طويلة جدًا.");
  return m;
};
const scalarOf = (p: Polynomial): G => {
  if ([...p.keys()].some((k) => k !== C))
    throw fail("المعامل أو الإحداثي يجب أن يكون عددًا حقيقيًا محددًا.");
  return p.get(C) || Z;
};
/** Bounded polynomial parser, including implicit multiplication, with algebraic coefficients. */
export function polynomial(source: string): Polynomial {
  if (!source.trim() || source.length > 500)
    throw fail("اكتب تعبيرًا رياضيًا كاملًا حتى ٥٠٠ محرف.");
  const tokens: string[] = [];
  let i = 0;
  while (i < source.length) {
    if (/\s/.test(source[i])) {
      i++;
      continue;
    }
    const m = source
      .slice(i)
      .match(
        /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|^sqrt\b|^[xyzts]|^[()+*/^\-]/,
      )?.[0];
    if (!m) throw fail();
    tokens.push(m);
    i += m.length;
    if (tokens.length > 260) throw fail("التعبير طويل جدًا.");
  }
  let at = 0,
    depth = 0;
  const primary = (): Polynomial => {
    if (++depth > 32) throw fail("التعبير متداخل أكثر من اللازم.");
    const t = tokens[at++];
    let v: Polynomial;
    if (t === "(") {
      v = expression();
      if (tokens[at++] !== ")") throw fail("الأقواس غير متوازنة.");
    } else if (t === "sqrt") {
      if (tokens[at++] !== "(") throw fail("اكتب الجذر مثل sqrt(3).");
      const r = scalarOf(expression()).rational();
      if (tokens[at++] !== ")" || !r)
        throw fail(
          "الجذر المدخل يجب أن يكون لعدد نسبي غير سالب؛ بسّط الجذور المتداخلة أولًا.",
        );
      v = constant(G.root(r));
    } else if (t && /^(?:\d|\.)/.test(t))
      v = constant(G.rational(R.decimal(t)));
    else if (symbols.includes(t)) {
      const p: Powers = [0, 0, 0, 0, 0];
      p[symbols.indexOf(t)] = 1;
      v = new Map([[p.join(""), U]]);
    } else throw fail("تعبير ناقص أو إشارة في غير موضعها.");
    depth--;
    return v;
  };
  const power = (): Polynomial => {
    let v = primary();
    if (tokens[at] === "^") {
      at++;
      const r = scalarOf(unary()).rational();
      if (!r || r.d !== 1n || r.n > 12n || r.n < -12n)
        throw fail("الأس غير مقبول في هذه الصيغة.");
      const n = Number(r.n);
      if ([...v.keys()].some((k) => k !== C)) {
        if (n < 0 || n > 2)
          throw fail(
            "معادلات المستقيم والمستوي خطية، والكرة من الدرجة الثانية.",
          );
        let out = constant(U);
        for (let j = 0; j < n; j++) out = times(out, v);
        v = out;
      } else v = constant(scalarOf(v).pow(n));
    }
    return v;
  };
  const unary = (): Polynomial => {
    if (tokens[at] === "+" || tokens[at] === "-") {
      const negative = tokens[at++] === "-";
      const v = unary();
      return negative ? times(constant(G.integer(-1)), v) : v;
    }
    return power();
  };
  const product = (): Polynomial => {
    let v = unary();
    while (at < tokens.length) {
      if (tokens[at] === "*" || tokens[at] === "/") {
        const op = tokens[at++],
          b = unary();
        v = op === "*" ? times(v, b) : times(v, constant(scalarOf(b).inv()));
      } else if (
        tokens[at] === "(" ||
        tokens[at] === "sqrt" ||
        /^(?:[xyzts]|\d|\.)/.test(tokens[at])
      )
        v = times(v, unary());
      else break;
    }
    return v;
  };
  const expression = (): Polynomial => {
    let v = product();
    while (tokens[at] === "+" || tokens[at] === "-") {
      const negative = tokens[at++] === "-";
      const b = product();
      v = plus(v, negative ? times(constant(G.integer(-1)), b) : b);
    }
    return v;
  };
  const result = expression();
  if (at !== tokens.length) throw fail("تعبير غير مكتمل أو أقواس غير متوازنة.");
  return result;
}
export const read = (s: string) => scalarOf(polynomial(s));
export type V = [G, G, G];
export const vector = (v: SpaceVector): V => v.map(read) as V;
export const serial = (v: V): SpaceVector =>
  v.map((c) => c.text()) as SpaceVector;
export const add = (a: V, b: V): V => a.map((c, i) => c.add(b[i])) as V;
export const neg = (a: V): V => a.map((c) => c.neg()) as V;
export const sub = (a: V, b: V): V => add(a, neg(b));
export const scale = (a: V, k: G): V => a.map((c) => c.mul(k)) as V;
export const dot = (a: V, b: V): G =>
  a.reduce((s, c, i) => s.add(c.mul(b[i])), Z);
export const cross = (a: V, b: V): V => [
  a[1].mul(b[2]).sub(a[2].mul(b[1])),
  a[2].mul(b[0]).sub(a[0].mul(b[2])),
  a[0].mul(b[1]).sub(a[1].mul(b[0])),
];
export const det = (a: V, b: V, c: V) => dot(a, cross(b, c));
export const zeroV = (v: V) => v.every((c) => c.zero());
export const eqV = (a: V, b: V) => zeroV(sub(a, b));
export const origin = (): V => [Z, Z, Z];
export const vtex = (v: V) =>
  `\\left(${v.map((c) => c.tex()).join(",\\,")}\\right)`;
export function rootTex(v: G): string {
  if (v.zero()) return "0";
  const r = v.rational();
  if (r) {
    try {
      return G.root(r).tex();
    } catch {
      /* Keep the exact unsimplified root. */
    }
  }
  return `\\sqrt{${v.tex()}}`;
}
export const rootExpression = (v: G) => `sqrt(${v.text()})`;
export function linearTex(values: G[], names: string[]): string {
  let s = "";
  values.forEach((v, i) => {
    if (v.zero()) return;
    const negative = v.sign() < 0,
      a = negative ? v.neg() : v;
    const body = names[i]
      ? `${a.eq(U) ? "" : a.terms.size > 1 ? `\\left(${a.tex()}\\right)` : a.tex()}${names[i]}`
      : a.tex();
    s += s ? `${negative ? "-" : "+"}${body}` : `${negative ? "-" : ""}${body}`;
  });
  return s || "0";
}
export const planeValues = (p: SpacePlane) => ({
  n: vector(p.normal),
  d: read(p.offset),
});
export const planeTex = (p: SpacePlane) =>
  linearTex([...vector(p.normal), read(p.offset)], ["x", "y", "z", ""]) + "=0";
export function lineTex(line: SpaceLine, parameter = "t"): string {
  const p = vector(line.point),
    u = vector(line.direction);
  return `\\begin{cases}${p.map((c, i) => `${symbols[i]}=${linearTex([c, u[i]], ["", parameter])}`).join("\\\\")}\\end{cases},\\quad ${parameter}\\in\\mathbb R`;
}
export function planeFromEquation(source: string): SpacePlane {
  const [a, b, ...extra] = source.split("=");
  if (!a || !b || extra.length)
    throw fail("اكتب معادلة المستوي بطرفين وعلامة مساواة واحدة.");
  const p = plus(polynomial(a), times(constant(G.integer(-1)), polynomial(b)));
  if ([...p.keys()].some((k) => ![C, "10000", "01000", "00100"].includes(k)))
    throw fail("المستوي معادلته خطية في x وy وz؛ ليست معادلة كرة أو منحنى.");
  const n: V = [p.get("10000") || Z, p.get("01000") || Z, p.get("00100") || Z];
  if (zeroV(n)) throw fail("المعادلة لا تعرّف مستويًا: الناظم معدوم.");
  return { normal: serial(n), offset: (p.get(C) || Z).text() };
}
export function affineParameter(
  source: string,
  parameter = "t",
): { constant: G; coefficient: G } {
  const p = polynomial(source),
    idx = symbols.indexOf(parameter),
    key = "00000".split("");
  key[idx] = "1";
  if ([...p.keys()].some((k) => k !== C && k !== key.join("")))
    throw fail(
      "كل إحداثي في المستقيم يجب أن يكون من الشكل a+t·u، بوسيط واحد مشترك.",
    );
  return { constant: p.get(C) || Z, coefficient: p.get(key.join("")) || Z };
}
export function sphereFromEquation(source: string) {
  const [a, b, ...extra] = source.split("=");
  if (!a || !b || extra.length) throw fail("اكتب معادلة الكرة كاملة.");
  const p = plus(polynomial(a), times(constant(G.integer(-1)), polynomial(b)));
  if (
    [...p.keys()].some(
      (k) =>
        ![C, "10000", "01000", "00100", "20000", "02000", "00200"].includes(k),
    )
  )
    throw fail("هذه ليست معادلة كرة: لا تقبل حدودًا مختلطة أو وسيطًا.");
  const k = p.get("20000") || Z;
  if (k.zero() || !k.eq(p.get("02000") || Z) || !k.eq(p.get("00200") || Z))
    throw fail("معاملات x² وy² وz² في الكرة متساوية وغير معدومة.");
  const center: V = ["10000", "01000", "00100"].map((key) =>
    (p.get(key) || Z).neg().div(k.mul(G.integer(2))),
  ) as V;
  const r2 = dot(center, center).sub((p.get(C) || Z).div(k));
  if (r2.sign() < 0)
    throw fail("المعادلة لا تمثل كرة حقيقية: مربع نصف القطر سالب.");
  return { center: serial(center), radiusSquared: r2.text() };
}
/** Exact Gauss-Jordan, also gives a nonzero null vector for a dependent family. */
export function eliminate(matrix: G[][], columns = matrix[0]?.length || 0) {
  const a = matrix.map((r) => [...r]),
    pivots: number[] = [];
  let row = 0;
  for (let c = 0; c < columns && row < a.length; c++) {
    const pivot = a.findIndex((r, i) => i >= row && !r[c].zero());
    if (pivot < 0) continue;
    [a[row], a[pivot]] = [a[pivot], a[row]];
    const d = a[row][c];
    a[row] = a[row].map((v) => v.div(d));
    for (let j = 0; j < a.length; j++)
      if (j !== row) {
        const q = a[j][c];
        a[j] = a[j].map((v, k) => v.sub(a[row][k].mul(q)));
      }
    pivots.push(c);
    row++;
  }
  return { matrix: a, pivots, rank: row };
}
export function nullVector(vectors: V[]): G[] {
  const a = [0, 1, 2].map((i) => vectors.map((v) => v[i])),
    r = eliminate(a);
  const free = Array.from({ length: vectors.length }, (_, i) => i).find(
    (i) => !r.pivots.includes(i),
  );
  if (free === undefined) return [];
  const x = vectors.map(() => Z);
  x[free] = U;
  r.pivots.forEach((c, row) => (x[c] = r.matrix[row][free].neg()));
  return x;
}
export function lineIntersection(a: SpaceLine, b: SpaceLine) {
  const p = vector(a.point),
    u = vector(a.direction),
    q = vector(b.point),
    v = vector(b.direction);
  const w = sub(q, p),
    r = eliminate(
      [0, 1, 2].map((i) => [u[i], v[i].neg(), w[i]]),
      2,
    );
  if (r.matrix.some((row) => row[0].zero() && row[1].zero() && !row[2].zero()))
    return undefined;
  if (r.rank < 2) return null;
  const ts = [Z, Z];
  r.pivots.forEach((c, i) => (ts[c] = r.matrix[i][2]));
  return { point: add(p, scale(u, ts[0])), t: ts[0], s: ts[1] };
}
export function bounded(v: G, limit = 1e9): G {
  const n = v.number();
  if (Math.abs(n) > limit || (!v.zero() && n === 0))
    throw fail(
      "المعطيات خارج المقياس المدعوم؛ استعمل أعدادًا منتهية بقيمة مطلقة حتى 10⁹ وغير معدومة عدديًا.",
    );
  if (v.text().length > 500)
    throw fail("الصيغة الدقيقة تتجاوز حد السياق المحفوظ.");
  return v;
}
