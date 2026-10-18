import { ClarificationError } from "../solver/types.js";
import type { ProbabilityComparison } from "../solver/probabilityTypes.js";

const MAX_DIGITS = 1200;
const gcd = (a: bigint, b: bigint): bigint => {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a || 1n;
};
export class Rational {
  readonly n: bigint;
  readonly d: bigint;
  constructor(n: bigint | number, d: bigint | number = 1n) {
    let a = BigInt(n),
      b = BigInt(d);
    if (b === 0n) throw new ClarificationError("القسمة على صفر غير معرّفة.");
    if (b < 0n) {
      a = -a;
      b = -b;
    }
    const g = gcd(a, b);
    a /= g;
    b /= g;
    if (a.toString().length > MAX_DIGITS || b.toString().length > MAX_DIGITS)
      throw new ClarificationError(
        "تجاوز الكسر حد الحساب الدقيق؛ صغّر الأعداد أو رتبة التجربة.",
      );
    this.n = a;
    this.d = b;
  }
  add(v: Rational) {
    return new Rational(this.n * v.d + v.n * this.d, this.d * v.d);
  }
  sub(v: Rational) {
    return new Rational(this.n * v.d - v.n * this.d, this.d * v.d);
  }
  mul(v: Rational) {
    const a = gcd(this.n, v.d),
      b = gcd(v.n, this.d);
    return new Rational((this.n / a) * (v.n / b), (this.d / b) * (v.d / a));
  }
  div(v: Rational) {
    return this.mul(new Rational(v.d, v.n));
  }
  pow(n: number): Rational {
    if (!Number.isSafeInteger(n) || Math.abs(n) > 1000)
      throw new ClarificationError(
        "الأس في قيمة الاحتمال يجب أن يكون عددًا صحيحًا لا تتجاوز قيمته المطلقة ١٠٠٠.",
      );
    if (
      n &&
      Math.max(this.n.toString().length, this.d.toString().length) *
        Math.abs(n) >
        MAX_DIGITS + 2
    )
      throw new ClarificationError("الأس يتجاوز حد الكسر الدقيق.");
    return n < 0
      ? new Rational(this.d, this.n).pow(-n)
      : new Rational(this.n ** BigInt(n), this.d ** BigInt(n));
  }
  eq(v: Rational) {
    return this.n === v.n && this.d === v.d;
  }
  cmp(v: Rational) {
    const d = this.n * v.d - v.n * this.d;
    return d < 0n ? -1 : d > 0n ? 1 : 0;
  }
  number() {
    if (this.n === 0n) return 0;
    const sign = this.n < 0n ? -1 : 1,
      n = this.n < 0n ? -this.n : this.n;
    if (n <= 9007199254740991n && this.d <= 9007199254740991n)
      return (sign * Number(n)) / Number(this.d);
    const exponent = n.toString().length - this.d.toString().length,
      scale = 24 - exponent;
    const mantissa =
      scale >= 0
        ? (n * 10n ** BigInt(scale)) / this.d
        : n / (this.d * 10n ** BigInt(-scale));
    return sign * Number(`${mantissa}e${-scale}`);
  }
  sqrtNumber() {
    if (this.n < 0n)
      throw new ClarificationError(
        "الجذر التربيعي لقيمة سالبة ليس عددًا حقيقيًا.",
      );
    if (!this.n) return 0;
    const exponent =
        2 *
        Math.floor((this.n.toString().length - this.d.toString().length) / 2),
      scale = 24 - exponent;
    const mantissa =
      scale >= 0
        ? (this.n * 10n ** BigInt(scale)) / this.d
        : this.n / (this.d * 10n ** BigInt(-scale));
    return Math.sqrt(Number(`${mantissa}e-24`)) * 10 ** (exponent / 2);
  }
  text() {
    return this.d === 1n ? String(this.n) : `${this.n}/${this.d}`;
  }
  tex() {
    return this.d === 1n
      ? String(this.n)
      : `${this.n < 0n ? "-" : ""}\\frac{${this.n < 0n ? -this.n : this.n}}{${this.d}}`;
  }
  static decimal(s: string): Rational {
    const m = s.trim().match(/^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
    if (!m || !(m[2] || m[3]))
      throw new ClarificationError(
        "اكتب عددًا أو كسرًا صحيحًا مثل 0.25 أو 1/4.",
      );
    const exp = Number(m[4] || 0) - (m[3]?.length || 0);
    if (Math.abs(exp) > 300)
      throw new ClarificationError(
        "القيمة العشرية خارج المجال العددي المدعوم.",
      );
    let n = BigInt((m[2] || "0") + (m[3] || "")) * (m[1] === "-" ? -1n : 1n),
      d = 1n;
    if (exp >= 0) n *= 10n ** BigInt(exp);
    else d = 10n ** BigInt(-exp);
    return new Rational(n, d);
  }
}
export const ZERO = new Rational(0),
  ONE = new Rational(1);
/** Bounded rational parser: decimal lexemes never pass through binary Number. */
export function exact(
  source: string,
  scope: Record<string, Rational> = {},
): Rational {
  if (!source.trim() || source.length > 500)
    throw new ClarificationError(
      "أدخل عددًا أو كسرًا بطول لا يتجاوز ٥٠٠ محرف.",
    );
  const tokens: string[] = [];
  let index = 0;
  while (index < source.length) {
    if (/\s/.test(source[index])) {
      index++;
      continue;
    }
    const token = source
      .slice(index)
      .match(
        /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|^[A-Za-z]+|^[()+*/^%\-]/,
      )?.[0];
    if (!token)
      throw new ClarificationError(
        "استخدم أعدادًا وكسورًا وعمليات حسابية فقط، دون أوامر أو دوال.",
      );
    tokens.push(token);
    index += token.length;
    if (tokens.length > 260)
      throw new ClarificationError("تعبير الاحتمال طويل جدًا.");
  }
  let at = 0,
    depth = 0;
  const fail = () =>
    new ClarificationError("قيمة عددية غير مكتملة أو أقواس غير متوازنة.");
  function primary(): Rational {
    if (++depth > 48)
      throw new ClarificationError("تعبير الاحتمال متداخل أكثر من اللازم.");
    const token = tokens[at++];
    let value: Rational;
    if (token === "(") {
      value = expression();
      if (tokens[at++] !== ")") throw fail();
    } else if (token && /^(?:\d|\.)/.test(token))
      value = Rational.decimal(token);
    else if (token && Object.prototype.hasOwnProperty.call(scope, token))
      value = scope[token];
    else
      throw new ClarificationError(
        "اكتب قيمة عددية صريحة؛ الرموز المجهولة والدوال غير مقبولة في الاحتمال.",
      );
    if (tokens[at] === "%") {
      at++;
      value = value.div(new Rational(100));
    }
    depth--;
    return value;
  }
  function power(): Rational {
    let value = primary();
    if (tokens[at] === "^") {
      at++;
      const exponent = unary();
      if (exponent.d !== 1n)
        throw new ClarificationError("يجب أن يكون الأس في الكسر عددًا صحيحًا.");
      if (value.n === 0n && exponent.n === 0n)
        throw new ClarificationError("0^0 ليس قيمة معرّفة لهذا الإدخال.");
      value = value.pow(Number(exponent.n));
    }
    return value;
  }
  function unary(): Rational {
    if (tokens[at] === "+" || tokens[at] === "-") {
      if (++depth > 48) throw fail();
      const minus = tokens[at++] === "-",
        value = unary();
      depth--;
      return minus ? ZERO.sub(value) : value;
    }
    return power();
  }
  function term(): Rational {
    let value = unary();
    while (at < tokens.length) {
      const op = tokens[at];
      if (op === "*" || op === "/") {
        at++;
        const b = unary();
        value = op === "*" ? value.mul(b) : value.div(b);
      } else if (op === "(" || /^[A-Za-z]+$/.test(op)) {
        value = value.mul(unary());
      } else break;
    }
    return value;
  }
  function expression(): Rational {
    let value = term();
    while (tokens[at] === "+" || tokens[at] === "-") {
      const minus = tokens[at++] === "-",
        b = term();
      value = minus ? value.sub(b) : value.add(b);
    }
    return value;
  }
  const result = expression();
  if (at !== tokens.length) throw fail();
  return result;
}
export function probability(source: string): Rational {
  const r = exact(source);
  if (r.cmp(ZERO) < 0 || r.cmp(ONE) > 0)
    throw new ClarificationError(
      "كل احتمال يجب أن ينتمي إلى [0,1]؛ راجع القيم المعطاة.",
    );
  return r;
}
export const sum = (values: Rational[]) =>
  values.reduce((a, b) => a.add(b), ZERO);
export function choose(n: number, k: number): bigint {
  if (
    !Number.isSafeInteger(n) ||
    !Number.isSafeInteger(k) ||
    n < 0 ||
    k < 0 ||
    k > n
  )
    return 0n;
  k = Math.min(k, n - k);
  let r = 1n;
  for (let i = 1; i <= k; i++) r = (r * BigInt(n - k + i)) / BigInt(i);
  return r;
}
export function falling(n: number, k: number): bigint {
  if (k < 0 || k > n) return 0n;
  let r = 1n;
  for (let i = 0; i < k; i++) r *= BigInt(n - i);
  return r;
}
export function factorialExact(n: number): bigint {
  let r = 1n;
  for (let i = 2; i <= n; i++) r *= BigInt(i);
  return r;
}
export const comparisonTex: Record<ProbabilityComparison, string> = {
  eq: "=",
  ge: "\\ge",
  gt: ">",
  le: "\\le",
  lt: "<",
};
export const matches = (x: number, k: number, c: ProbabilityComparison) =>
  c === "eq"
    ? x === k
    : c === "ge"
      ? x >= k
      : c === "gt"
        ? x > k
        : c === "le"
          ? x <= k
          : x < k;
export const approximate = (n: number) =>
  Number.isFinite(n)
    ? Number(n.toPrecision(12)).toString()
    : "\\text{خارج المجال العددي}";
export function near(a: number, b: number, tolerance = 1e-9) {
  return (
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b))
  );
}
export function columns(rows: string[][], headers: string[]) {
  return `\\begin{array}{${"c".repeat(headers.length)}}${headers.join("&")}\\\\\\hline ${rows.map((row) => row.join("&")).join("\\\\")}\\end{array}`;
}
