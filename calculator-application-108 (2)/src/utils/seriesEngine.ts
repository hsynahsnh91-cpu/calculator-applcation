/**
 * Exact power-series (Maclaurin) engine for non-elementary integrals.
 *
 * · Coefficients stay exact rationals end to end, so a step never shows 0.041666…
 *   instead of 1/24 (values are snapped to integers/rationals before rendering).
 * · The integrand is recognised from its parsed AST and ONLY the classic
 *   non-elementary shapes are accepted: e^{±x^k} (Gauss type), sin(x)/x,
 *   cos(x)/x, sin(x^k)/cos(x^k) (Fresnel type) and ln(x)/(x±a). Anything else
 *   returns null so the caller keeps its normal path.
 * · Generators use pure rational arithmetic (no CAS recursion), which keeps the
 *   UI responsive on low-end Android WebViews.
 */
import { create, all } from 'mathjs';

const math = create(all, { number: 'number' });

// ------------------------------------------------------------------ exact rationals
export interface Rat { n: number; d: number }

const gcd = (a: number, b: number): number => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
};

export const R = (n: number, d = 1): Rat => {
  if (!Number.isInteger(n) || !Number.isInteger(d) || d === 0) throw new Error('non-integer rational');
  let num = n;
  let den = d;
  if (den < 0) { num = -num; den = -den; }
  const g = gcd(num, den);
  return { n: num / g, d: den / g };
};

const safeR = (n: number, d = 1): Rat | null => {
  try {
    return R(n, d);
  } catch {
    return null;
  }
};

export const rAdd = (a: Rat, b: Rat): Rat => R(a.n * b.d + b.n * a.d, a.d * b.d);
export const rMul = (a: Rat, b: Rat): Rat => R(a.n * b.n, a.d * b.d);
export const rDiv = (a: Rat, b: Rat): Rat => R(a.n * b.d, a.d * b.n);
export const rNeg = (a: Rat): Rat => R(-a.n, a.d);
export const rZero = (a: Rat): boolean => a.n === 0;
export const rNum = (a: Rat): number => a.n / a.d;
const rPow = (a: Rat, k: number): Rat => (k >= 0 ? R(a.n ** k, a.d ** k) : R(a.d ** -k, a.n ** -k));

/** exact LaTeX of a rational — never a decimal */
export const rTex = (a: Rat): string => {
  if (a.n === 0) return '0';
  const sign = a.n < 0 ? '-' : '';
  const n = Math.abs(a.n);
  return a.d === 1 ? `${sign}${n}` : `${sign}\\dfrac{${n}}{${a.d}}`;
};

/** split a coefficient into a separator and an absolute-value body for sums */
const splitSigned = (a: Rat, first: boolean): { sign: string; body: string } => {
  const negative = a.n < 0;
  const mag = R(Math.abs(a.n), a.d);
  const body = mag.d === 1 ? String(mag.n) : `\\dfrac{${mag.n}}{${mag.d}}`;
  return { sign: first ? (negative ? '-' : '') : negative ? ' - ' : ' + ', body };
};

// ------------------------------------------------------------------ series algebra
export interface SeriesTerm {
  c: Rat;
  /** exponent of the variable (may be negative for a shifted quotient) */
  p: number;
  /** 1 when the term carries ln(variable) */
  l: 0 | 1;
}

interface Monomial { c: Rat; m: number }

export type SeriesKind = 'exp' | 'trig' | 'logLinear';

export interface SeriesPlan {
  kind: SeriesKind;
  label: string;
  reason: string;
  /** σ-notation of the expansion */
  sigmaTex: string;
  /** expansion of the integrand */
  terms: SeriesTerm[];
  /** null → converges on ℝ, otherwise |x| < radius is required */
  radius: number | null;
  /** points where the integrand itself is singular */
  singular: number[];
}

const factorial = (k: number): number => {
  let out = 1;
  for (let i = 2; i <= k; i++) out *= i;
  return out;
};

/** e^{g} with g = c·v^m  →  Σ cᵏ v^{mk}/k! */
const expSeries = (g: Monomial, count: number): SeriesTerm[] => {
  const out: SeriesTerm[] = [];
  for (let k = 0; out.length < count && k < count * 3 + 4; k++) {
    const c = safeR(rPow(g.c, k).n, factorial(k) * rPow(g.c, k).d);
    if (!c || rZero(c)) continue;
    out.push({ c, p: g.m * k, l: 0 });
  }
  return out;
};

/** sin(g)/cos(g) with g = c·v^m */
const trigSeries = (g: Monomial, fn: 'sin' | 'cos', count: number): SeriesTerm[] => {
  const out: SeriesTerm[] = [];
  for (let k = 0; out.length < count && k < count * 3 + 4; k++) {
    const parity = fn === 'sin' ? 2 * k + 1 : 2 * k;
    const base = rPow(g.c, parity);
    const c = safeR(base.n * (k % 2 === 0 ? 1 : -1), base.d * factorial(parity));
    if (!c || rZero(c)) continue;
    out.push({ c, p: g.m * parity, l: 0 });
  }
  return out;
};

/** 1/(v + a) = Σ (-1)ⁿ vⁿ / aⁿ⁺¹, valid for |v| < |a| */
const geometricSeries = (a: number, count: number): SeriesTerm[] => {
  const out: SeriesTerm[] = [];
  for (let n = 0; n < count; n++) {
    const c = safeR((-1) ** n, a ** (n + 1));
    if (!c) break;
    out.push({ c, p: n, l: 0 });
  }
  return out;
};

const scaleSeries = (terms: SeriesTerm[], k: Rat): SeriesTerm[] =>
  terms.map((t) => ({ ...t, c: rMul(t.c, k) })).filter((t) => !rZero(t.c));

/** multiplying by c·v^s is only a power shift, so products stay cheap and exact */
const timesMonomial = (terms: SeriesTerm[], mono: Monomial): SeriesTerm[] =>
  scaleSeries(terms, mono.c)
    .map((t) => ({ ...t, p: t.p + mono.m }))
    .filter((t) => Number.isInteger(t.p) && Math.abs(t.p) <= 64);

const logify = (terms: SeriesTerm[]): SeriesTerm[] => terms.map((t) => ({ ...t, l: 1 as const }));

const powerTex = (v: string, p: number): string => (p === 0 ? '' : p === 1 ? v : `${v}^{${p}}`);

/** readable Σ cᵢ v^{pᵢ} ln(v)^{lᵢ} */
export function seriesToTex(terms: SeriesTerm[], v: string): string {
  if (terms.length === 0) return '0';
  let out = '';
  for (const t of terms) {
    const { sign, body } = splitSigned(t.c, out === '');
    const coeff = body === '1' ? (t.p === 0 && t.l === 0 ? '1' : '') : body;
    const piece = `${coeff}${powerTex(v, t.p)}${t.l === 1 ? (t.p === 0 ? `\\ln\\left(${v}\\right)` : `\\,\\ln\\left(${v}\\right)`) : ''}`;
    out += `${sign}${piece || '1'}`;
  }
  return `${out} + \\cdots`;
}

// ------------------------------------------------------------------ AST recognition
type AnyNode = {
  type: string;
  name?: string;
  fn?: string;
  op?: string;
  value?: unknown;
  items?: AnyNode[];
  args?: AnyNode[];
};

const kids = (n: AnyNode): AnyNode[] => n.items ?? n.args ?? [];
const intOf = (n: AnyNode | undefined): number | null =>
  n && n.type === 'ConstantNode' && Number.isInteger(Number(n.value)) ? Number(n.value) : null;

/** c·v^m out of a subtree, built compositionally (never accumulates state) */
function monomial(n: AnyNode | undefined, v: string): Monomial | null {
  if (!n) return null;
  if (n.type === 'ParenthesisNode') return monomial(kids(n)[0], v);
  if (n.type === 'ConstantNode') {
    const k = intOf(n);
    return k === null || k === 0 ? null : { c: R(k), m: 0 };
  }
  if (n.type === 'SymbolNode') return n.name === v ? { c: R(1), m: 1 } : null;
  if (n.type !== 'OperatorNode') return null;
  const parts = kids(n);
  if (n.op === '-') {
    const a = monomial(parts[0], v);
    return a ? { c: rNeg(a.c), m: a.m } : null;
  }
  if (n.op === '*') {
    let acc: Monomial = { c: R(1), m: 0 };
    for (const p of parts) {
      const a = monomial(p, v);
      if (!a) return null;
      acc = { c: rMul(acc.c, a.c), m: acc.m + a.m };
    }
    return acc;
  }
  if (n.op === '/') {
    const a = monomial(parts[0], v);
    const b = monomial(parts[1], v);
    if (!a || !b || b.c.n === 0) return null;
    return { c: rDiv(a.c, b.c), m: a.m - b.m };
  }
  if (n.op === '^') {
    const e = intOf(parts[1]);
    if (e === null || e < 0 || e > 8) return null;
    const base = parts[0];
    if (base?.type === 'SymbolNode' && base.name === v) return { c: R(1), m: e };
    const b = monomial(base, v);
    if (!b || b.m !== 0) return null;
    return { c: rPow(b.c, e), m: 0 };
  }
  return null;
}

interface Factors {
  xPow: number;
  constFactor: Rat;
  fns: { name: 'exp' | 'sin' | 'cos' | 'log'; arg: Monomial }[];
  linear: { a: number; pow: number }[];
  ok: boolean;
}

/** flatten products/quotients into recognised factors; unknown shapes set ok=false */
function collect(n: AnyNode, v: string, acc: Factors, pow: number): void {
  if (!acc.ok) return;
  if (n.type === 'ParenthesisNode') return collect(kids(n)[0], v, acc, pow);

  if (n.type === 'ConstantNode') {
    const k = intOf(n);
    if (k === null || k === 0 || Math.abs(pow) !== 1) { acc.ok = false; return; }
    acc.constFactor = rMul(acc.constFactor, pow === 1 ? R(k) : R(1, k));
    return;
  }
  if (n.type === 'SymbolNode') {
    if (n.name === v) { acc.xPow += pow; return; }
    acc.ok = false;
    return;
  }
  if (n.type === 'FunctionNode' && n.fn) {
    const name = n.fn as 'exp' | 'sin' | 'cos' | 'log';
    const args = n.args ?? [];
    if (pow !== 1 || !['exp', 'sin', 'cos', 'log'].includes(name) || args.length !== 1) { acc.ok = false; return; }
    const arg = monomial(args[0], v);
    if (!arg) { acc.ok = false; return; }
    acc.fns.push({ name, arg });
    return;
  }
  if (n.type === 'OperatorNode') {
    const parts = kids(n);
    if (n.op === '-') {
      if (pow !== 1) { acc.ok = false; return; }
      acc.constFactor = rNeg(acc.constFactor);
      return collect(parts[0], v, acc, 1);
    }
    if (n.op === '*') { parts.forEach((p) => collect(p, v, acc, pow)); return; }
    if (n.op === '/') {
      collect(parts[0], v, acc, pow);
      collect(parts[1], v, acc, -pow);
      return;
    }
    if (n.op === '^') {
      if (pow !== 1) { acc.ok = false; return; }
      const base = parts[0];
      const e = intOf(parts[1]);
      if (base?.type === 'SymbolNode' && base.name === v) {
        if (e === null || Math.abs(e) > 2) { acc.ok = false; return; }
        acc.xPow += e;
        return;
      }
      // e^{anything} is the same as exp(anything): read the exponent as a monomial
      if (base?.type === 'SymbolNode' && base.name === 'e') {
        const arg = monomial(parts[1], v);
        if (!arg) { acc.ok = false; return; }
        acc.fns.push({ name: 'exp', arg });
        return;
      }
      if (base?.type === 'FunctionNode' && e === 1) { collect(base, v, acc, 1); return; }
      acc.ok = false;
      return;
    }
    if (n.op === '+' || n.op === 'add') {
      // only (x + a) in a denominator is supported — the geometric-series factor
      if (pow !== -1) { acc.ok = false; return; }
      const xPart = parts.find((p) => p.type === 'SymbolNode' && p.name === v);
      const others = parts.filter((p) => p !== xPart);
      if (!xPart || others.length !== 1) { acc.ok = false; return; }
      const rest = monomial(others[0], v);
      if (!rest || rest.m !== 0) { acc.ok = false; return; }
      acc.linear.push({ a: rNum(rest.c), pow });
      return;
    }
  }
  acc.ok = false;
}

// ------------------------------------------------------------------ plan builder
/**
 * Recognise a supported non-elementary integrand and build its Maclaurin plan.
 * Returns null for anything outside the accepted classic shapes.
 */
export function planSeriesIntegrand(engineExpression: string, v: string): SeriesPlan | null {
  try {
    if (!engineExpression.trim()) return null;
    const root = math.parse(engineExpression) as unknown as AnyNode;
    const acc: Factors = { xPow: 0, constFactor: R(1), fns: [], linear: [], ok: true };
    collect(root, v, acc, 1);
    if (!acc.ok || acc.fns.length !== 1) return null;
    const k = acc.constFactor;
    const fn = acc.fns[0];

    // 1) e^{±v^m}, m ≥ 2 → Gauss type (ties to erf)
    if (fn.name === 'exp' && acc.linear.length === 0 && fn.arg.m >= 2) {
      const terms = timesMonomial(expSeries(fn.arg, 5), { c: k, m: acc.xPow });
      if (terms.length < 3) return null;
      const inner = `${rTex(fn.arg.c)}\\,${v}^{${fn.arg.m}}`;
      return {
        kind: 'exp',
        label: rNum(fn.arg.c) < 0 ? `دالة غاوس من الرتبة ${fn.arg.m}` : `دالة أسية بأُسّ من الرتبة ${fn.arg.m}`,
        reason: `الدالة $\\exp\\!\\left(${inner}\\right)$ لا تملك دالة أصلية ابتدائية عند الرتبة ${fn.arg.m}، ويُربط تكاملها بدالة الخطأ $\\operatorname{erf}$، لذلك ننشرها بمتسلسلة ماكلورين ونكامل حداً حداً.`,
        sigmaTex: `\\exp\\!\\left(${inner}\\right)=\\sum_{n=0}^{\\infty}\\dfrac{\\left(${rTex(fn.arg.c)}\\right)^{n}\\,${v}^{${fn.arg.m}n}}{n!}`,
        terms,
        radius: null,
        singular: []
      };
    }

    // 2) sin(v)/v , cos(v)/v , sin(v^m) , cos(v^m)
    if ((fn.name === 'sin' || fn.name === 'cos') && acc.linear.length === 0 && (acc.xPow === 0 || acc.xPow === -1)) {
      const overX = acc.xPow === -1;
      const fresnel = fn.arg.m >= 2 && !overX;
      const quotient = fn.arg.m === 1 && overX;
      if (!(fresnel || quotient)) return null;

      if (quotient && fn.name === 'sin') {
        const terms = timesMonomial(trigSeries({ c: R(1), m: 1 }, 'sin', 5).map((t) => ({ ...t, p: t.p - 1 })), { c: k, m: 0 });
        if (terms.length < 3) return null;
        return {
          kind: 'trig',
          label: 'الدالة الجيبية الاعتباطية sinc',
          reason: `الدالة $\\dfrac{\\sin(${v})}{${v}}$ لا تملك دالة أصلية ابتدائية؛ تكاملها هو الدالة $\\operatorname{Si}$، لذا ننشر الجيب ثم نقسم كل حدّ على ${v} قبل التكامل.`,
          sigmaTex: `\\dfrac{\\sin(${v})}{${v}}=\\sum_{n=0}^{\\infty}\\dfrac{(-1)^{n}\\,${v}^{2n}}{(2n+1)!}`,
          terms,
          radius: null,
          singular: [0]
        };
      }
      if (quotient && fn.name === 'cos') {
        const cosTerms = trigSeries({ c: R(1), m: 1 }, 'cos', 5);
        const terms = timesMonomial(cosTerms.map((t) => ({ ...t, p: t.p - 1 })), { c: k, m: 0 });
        if (terms.length < 3) return null;
        return {
          kind: 'trig',
          label: 'النسبة cosine على المتغير',
          reason: `للدالة $\\dfrac{\\cos(${v})}{${v}}$ قطب بسيط عند الصفر، لذا يفصل الحد $1/{v}$ ويظهر حدّ لوغاريتمي في الدالة الأصلية مع متسلسلة قوى متبقية.`,
          sigmaTex: `\\dfrac{\\cos(${v})}{${v}}=\\dfrac{1}{${v}}+\\sum_{n=1}^{\\infty}\\dfrac{(-1)^{n}\\,${v}^{2n-1}}{(2n)!}`,
          terms,
          radius: null,
          singular: [0]
        };
      }

      const raw = trigSeries(fn.arg, fn.name, 5);
      const terms = timesMonomial(raw, { c: k, m: acc.xPow });
      if (terms.length < 3) return null;
      const isSin = fn.name === 'sin';
      return {
        kind: 'trig',
        label: isSin ? 'تكامل فيزنلي للجيب' : 'تكامل فيزنلي لجيب التمام',
        reason: `تكامل $${isSin ? '\\sin' : '\\cos'}\\!\\left(${rTex(fn.arg.c)}\\,${v}^{${fn.arg.m}}\\right)$ لا يُكتب بدوال أولية، وهو من نمط تكاملي فيزنلي، فننشر الدالة على قوى ${v} ثم نكامل حداً حداً.`,
        sigmaTex: `${isSin ? '\\sin' : '\\cos'}\\!\\left(${rTex(fn.arg.c)}\\,${v}^{${fn.arg.m}}\\right)=\\sum_{n=0}^{\\infty}\\dfrac{(-1)^{n}\\,\\left(${rTex(fn.arg.c)}\\right)^{${isSin ? '2n+1' : '2n'}}\\,${v}^{${fn.arg.m}\\cdot${isSin ? '(2n+1)' : '2n'}}}{${isSin ? '(2n+1)!' : '(2n)!'}}`,
        terms,
        radius: null,
        singular: []
      };
    }

    // 3) ln(v)/(v + a)
    if (
      fn.name === 'log' && fn.arg.m === 1 && rNum(fn.arg.c) === 1 &&
      acc.xPow === 0 && acc.linear.length === 1 && acc.linear[0].pow === -1
    ) {
      const a = acc.linear[0].a;
      if (!Number.isInteger(a) || a === 0) return null;
      const terms = timesMonomial(logify(geometricSeries(a, 5)), { c: k, m: 0 });
      if (terms.length < 3) return null;
      return {
        kind: 'logLinear',
        label: 'لوغاريتم على مقدار خطي',
        reason: `الصيغة $\\dfrac{\\ln(${v})}{${v} ${a > 0 ? '+' : '-'} ${Math.abs(a)}}$ لا أولية، لذا يُفكك الكسر إلى متسلسلة هندسية تتقارب عندما $|${v}|<${Math.abs(a)}$، وتُكامل حدود ${v}^{n}\\ln(${v}) بالتجزئة.`,
        sigmaTex: `\\dfrac{\\ln(${v})}{${v} ${a > 0 ? '+' : '-'} ${Math.abs(a)}}=\\ln(${v})\\sum_{n=0}^{\\infty}\\dfrac{(-1)^{n}\\,${v}^{n}}{${Math.abs(a)}^{\\,n+1}}`,
        terms,
        radius: Math.abs(a),
        singular: [0, -a]
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ integration
export interface IntegratedSeries {
  poly: SeriesTerm[];
  logAbs: Rat | null;
  logSq: Rat | null;
}

/** ∫ Σ c v^p ln(v)^l dv term by term, with the p = −1 and log-factor rules */
export function integrateSeries(terms: SeriesTerm[]): IntegratedSeries {
  const poly: SeriesTerm[] = [];
  let logAbs: Rat | null = null;
  let logSq: Rat | null = null;

  for (const t of terms) {
    if (t.p === -1) {
      if (t.l === 0) logAbs = rAdd(logAbs ?? R(0), t.c);
      else {
        const half = safeR(t.c.n, t.c.d * 2);
        if (half) logSq = rAdd(logSq ?? R(0), half);
      }
      continue;
    }
    const q = t.p + 1;
    if (t.l === 0) {
      poly.push({ c: safeR(t.c.n, t.c.d * q) ?? t.c, p: q, l: 0 });
      continue;
    }
    // ∫ v^p ln v dv = v^{p+1}( ln v /(p+1) − 1/(p+1)² )
    poly.push({ c: safeR(t.c.n, t.c.d * q) ?? t.c, p: q, l: 1 });
    const correction = safeR(-t.c.n, t.c.d * q * q);
    if (correction) poly.push({ c: correction, p: q, l: 0 });
  }
  return { poly: poly.filter((t) => !rZero(t.c)).sort((a, b) => a.p - b.p), logAbs, logSq };
}

export function antiderivativeTex(series: IntegratedSeries, v: string): string {
  const chunks: string[] = [];
  const push = (c: Rat, suffix: string, firstAllowed = true) => {
    const { sign, body } = splitSigned(c, chunks.length === 0 && firstAllowed);
    const coeff = body === '1' ? '' : body;
    chunks.push(`${sign}${coeff}${suffix}`);
  };
  if (series.logSq && !rZero(series.logSq)) push(series.logSq, `\\,\\ln^{2}\\left(${v}\\right)`);
  if (series.logAbs && !rZero(series.logAbs)) push(series.logAbs, `\\,\\ln\\left|${v}\\right|`);
  for (const t of series.poly) {
    push(t.c, `${powerTex(v, t.p)}${t.l === 1 ? `\\,\\ln\\left(${v}\\right)` : ''}`, false);
  }
  return `${chunks.join('')} + C`;
}

export interface DefiniteSeriesValue {
  exactTex: string | null;
  decimal: number;
  divergent: boolean;
}

/**
 * Definite value of the integrated series. The exact rational is only claimed when
 * every surviving term is polynomial and both bounds are integers; otherwise the
 * caller must present the decimal as an approximation.
 */
export function evaluateDefiniteSeries(series: IntegratedSeries, a: number, b: number): DefiniteSeriesValue {
  const lo = Math.min(a, b);
  const usesLog = (series.logAbs && !rZero(series.logAbs)) || (series.logSq && !rZero(series.logSq));
  if (usesLog && lo === 0) return { exactTex: null, decimal: NaN, divergent: true };

  let exact = Number.isInteger(a) && Number.isInteger(b) && !usesLog;
  let sum = R(0);
  let decimal = 0;

  if (series.logAbs && !rZero(series.logAbs)) {
    exact = false;
    decimal += rNum(series.logAbs) * (Math.log(Math.abs(b)) - Math.log(Math.abs(a)));
  }
  if (series.logSq && !rZero(series.logSq)) {
    exact = false;
    decimal += rNum(series.logSq) * (Math.log(Math.abs(b)) ** 2 - Math.log(Math.abs(a)) ** 2);
  }

  for (const t of series.poly) {
    if (t.l === 1) {
      exact = false;
      const at = (x: number): number => (x <= 0 ? 0 : x ** t.p * Math.log(x));
      decimal += rNum(t.c) * (at(b) - at(a));
      continue;
    }
    const value = b ** t.p - a ** t.p;
    decimal += rNum(t.c) * value;
    if (exact) {
      if (!Number.isInteger(value)) { exact = false; continue; }
      const part = safeR(t.c.n * value, t.c.d);
      if (!part) { exact = false; continue; }
      sum = rAdd(sum, part);
    }
  }

  return { exactTex: exact ? rTex(sum) : null, decimal, divergent: !Number.isFinite(decimal) };
}

/** geometric-type expansions need the whole interval inside the convergence disc */
export function seriesConvergesOn(plan: SeriesPlan, a: number, b: number): boolean {
  if (plan.radius === null) return true;
  const edge = Math.max(Math.abs(a), Math.abs(b));
  return edge < plan.radius - 1e-12;
}
