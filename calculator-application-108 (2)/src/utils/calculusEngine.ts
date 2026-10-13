import { create, all } from 'mathjs';
import nerdamer from 'nerdamer';
import { CalculusSolution } from '../types';
import { tex } from './equationSolver';

const math = create(all, { number: 'number' });

const SUP_TO_N: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', 'ˣ': 'x', 'ⁿ': 'n'
};

const DIGITS_TO_SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };

// Convert frac(numerator, denominator) templates without breaking nested parentheses.
function normalizeFractionTemplates(source: string): string {
  let out = '';
  for (let i = 0; i < source.length;) {
    if (!source.startsWith('frac(', i)) {
      out += source[i++];
      continue;
    }
    const start = i + 5;
    let depth = 0;
    let comma = -1;
    let end = -1;
    for (let j = start; j < source.length; j++) {
      const c = source[j];
      if (c === '(') depth++;
      else if (c === ')') {
        if (depth === 0) { end = j; break; }
        depth--;
      } else if (c === ',' && depth === 0 && comma < 0) comma = j;
    }
    if (comma < 0 || end < 0) {
      out += source[i++];
      continue;
    }
    const numerator = source.slice(start, comma).trim() || '1';
    const denominator = source.slice(comma + 1, end).trim() || '1';
    out += `((${numerator})/(${denominator}))`;
    i = end + 1;
  }
  return out;
}

function normalizeIndexedRoots(source: string): string {
  const indices: Record<string, string> = { '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
  let out = '';
  for (let i = 0; i < source.length;) {
    const degree = indices[source[i]];
    if (!degree || source[i + 1] !== '√' || source[i + 2] !== '(') {
      out += source[i++];
      continue;
    }
    const start = i + 3;
    let depth = 0;
    let end = -1;
    for (let j = start; j < source.length; j++) {
      if (source[j] === '(') depth++;
      else if (source[j] === ')') {
        if (depth === 0) { end = j; break; }
        depth--;
      }
    }
    if (end < 0) { out += source[i++]; continue; }
    out += `nthRoot(${source.slice(start, end)},${degree})`;
    i = end + 1;
  }
  return out;
}

// Render empty math boxes with safe temporary values, then restore them as KaTeX boxes.
function preparePreview(source: string): { expression: string; replacements: [string, string][] } {
  let expression = source;
  const replacements: [string, string][] = [];
  let next = 735291;
  const marker = (latex: string) => {
    const number = String(next++);
    replacements.push([number, latex]);
    return number;
  };

  // Templates are e□, 10□, x□, √(□). Replace the empty operand only for parsing.
  expression = expression.replace(/(10|[a-zA-Z0-9.)])□/g, (_m, base: string) => `${base}^(${marker('\\square')})`);
  expression = expression.replace(/([²³⁴⁵⁶⁷⁸⁹])√\(\s*□\s*\)/g, (_m, degree: string) => `nthRoot(${marker('\\square')},${SUP_TO_N[degree]})`);
  expression = expression.replace(/√\(\s*□\s*\)/g, `sqrt(${marker('\\square')})`);
  expression = expression.replace(/□/g, () => marker('\\square'));
  expression = normalizeIndexedRoots(expression);
  expression = normalizeFractionTemplates(expression);
  return { expression, replacements };
}

// Converts the pretty math notation typed by the user (×, ÷, x², √, π) to the engine syntax
export function normalizeExpr(s: string): string {
  return normalizeIndexedRoots(normalizeFractionTemplates(s))
    .replace(/(10|[a-zA-Z0-9.)])□/g, '$1^(1)')
    .replace(/sqrt\(\s*□\s*\)|√\(\s*□\s*\)/g, 'sqrt(1)')
    .replace(/□/g, '1')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻ˣⁿ]+/g, (m) => `^(${m.split('').map((c) => SUP_TO_N[c]).join('')})`)
    .replace(/×|·/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/π/g, 'pi')
    .replace(/√\s*\(/g, 'sqrt(')
    .replace(/√\s*([a-z0-9.]+)/gi, 'sqrt($1)')
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

const N_TO_SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };

// Converts raw typing (*, ^2, pi, sqrt) to pretty math symbols for display in the input
export function prettifyExpr(s: string): string {
  return s
    .replace(/10(\d+)□/g, (_m, digits: string) => `10${digits.split('').map((d) => DIGITS_TO_SUP[d]).join('')}□`)
    .replace(/([ex])([0-9]+)□/g, (_m, base: string, digits: string) => `${base}${digits.split('').map((d) => DIGITS_TO_SUP[d]).join('')}□`)
    // Allow multi-digit exponents to be entered consecutively after the first digit.
    .replace(/(10|[ex])([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)([0-9]+)/g, (_m, base: string, superscript: string, digits: string) => `${base}${superscript}${digits.split('').map((d) => DIGITS_TO_SUP[d]).join('')}`)
    .replace(/\*/g, '×')
    .replace(/\^\(?(-?\d+)\)?/g, (_m, d: string) => d.split('').map((c) => N_TO_SUP[c]).join(''))
    .replace(/\bpi\b/g, 'π')
    .replace(/\bsqrt\(/g, '√(');
}

const texOf = (n: { toTex: (o?: object) => string }) =>
  n.toTex({ parenthesis: 'auto', implicit: 'hide' }).replace(/\\cdot/g, '\\times');

// LaTeX preview of the function, with real × and powers
export function exprToLatex(s: string): string | null {
  try {
    const preview = preparePreview(s);
    let latex = texOf(math.parse(normalizeExpr(preview.expression)));
    for (const [number, box] of preview.replacements) {
      latex = latex.replace(new RegExp(`\\{?${number}\\}?`, 'g'), box);
    }
    return latex.replace(/\\operatorname\{frac\}/g, '\\dfrac');
  } catch {
    return null;
  }
}

const aligned = (lines: string[]) => `\\begin{aligned} ${lines.join(' \\\\[8pt] ')} \\end{aligned}`;

// ============================================================ derivative
export function computeDerivative(expression: string, atX: number = 1): CalculusSolution {
  try {
    const node1 = math.parse(normalizeExpr(expression));
    const f1Tex = texOf(node1);

    // 1st derivative
    const d1 = math.derivative(node1, 'x');
    const simp1 = math.simplify(d1);
    const d1Latex = texOf(simp1);

    // 2nd derivative
    const d2 = math.derivative(simp1, 'x');
    const simp2 = math.simplify(d2);
    const d2Latex = texOf(simp2);

    const compiledF = node1.compile();
    const compiledD1 = simp1.compile();
    const compiledD2 = simp2.compile();

    const fxVal = Number(compiledF.evaluate({ x: atX }));
    const slope = Number(compiledD1.evaluate({ x: atX }));
    if (!isFinite(fxVal) || !isFinite(slope)) {
      throw new Error('الدالة أو مشتقتها غير معرّفة عند هذه النقطة');
    }

    // Tangent equation
    const intercept = fxVal - slope * atX;
    const slopeTex = tex(Number(slope.toFixed(6)));
    const interceptTex = tex(Number(Math.abs(intercept).toFixed(6)));
    const tangentLatex =
      Math.abs(slope) < 1e-12
        ? `y = ${tex(Number(intercept.toFixed(6)))}`
        : `y = ${Math.abs(slope - 1) < 1e-12 ? '' : Math.abs(slope + 1) < 1e-12 ? '-' : slopeTex}x ${Math.abs(intercept) < 1e-12 ? '' : `${intercept >= 0 ? '+' : '-'} ${interceptTex}`}`;

    const steps = [
      {
        title: 'الدالة المعطاة',
        latex: `f(x) = ${f1Tex}`,
        explanation: 'نكتب العبارة بالرموز الرياضية:'
      },
      {
        title: 'المشتقة الأولى',
        latex: aligned([`f'(x) &= \\dfrac{d}{dx}\\left(${f1Tex}\\right)`, `f'(x) &= ${d1Latex}`]),
        explanation: 'نطبق قواعد الاشتقاق: القوة، والجداء، والكسر، والدوال المركبة.'
      },
      {
        title: 'المشتقة الثانية',
        latex: aligned([`f''(x) &= \\dfrac{d}{dx}\\left(${d1Latex}\\right)`, `f''(x) &= ${d2Latex}`]),
        explanation: 'نشتق المشتقة الأولى لدراسة التقعر ونقاط الانعطاف.'
      },
      {
        title: 'إيجاد صورة نقطة التماس',
        latex: `y_{0} = f(x_{0}) = f(${tex(atX)}) = ${tex(Number(fxVal.toFixed(6)))}`,
        explanation: 'نعوّض قيمة x₀ في عبارة الدالة الأصلية للحصول على مرتبة نقطة التماس.'
      },
      {
        title: 'إيجاد معامل توجيه (ميل) المماس',
        latex: `m = f'(x_{0}) = f'(${tex(atX)}) = ${slopeTex}`,
        explanation: 'ميل المماس يساوي قيمة المشتقة الأولى عند النقطة x₀.'
      },
      {
        title: 'التعويض في العلاقة القانونية للمماس',
        latex: aligned([
          `y - y_{0} &= m\\left(x - x_{0}\\right)`,
          `y - \\left(${tex(Number(fxVal.toFixed(6)))}\\right) &= ${slopeTex}\\left(x ${atX < 0 ? '+' : '-'} ${tex(Math.abs(atX))}\\right)`,
          tangentLatex.replace('y =', 'y &=')
        ]),
        explanation: 'نكتب المعادلة وفق الصيغة المعتمدة في السلّم ثم نبسّطها.'
      }
    ];

    // Critical points
    const criticalPoints: { x: number; y: number; type: 'min' | 'max' | 'inflection'; latex: string }[] = [];
    const scanStep = 0.2;
    for (let x = -8; x <= 8; x += scanStep) {
      try {
        const v1 = compiledD1.evaluate({ x });
        const v2 = compiledD1.evaluate({ x: x + scanStep });
        if (isFinite(v1) && isFinite(v2) && v1 * v2 <= 0) {
          let low = x;
          let high = x + scanStep;
          for (let iter = 0; iter < 40; iter++) {
            const mid = (low + high) / 2;
            const vm = compiledD1.evaluate({ x: mid });
            if (Math.abs(vm) < 1e-10) {
              low = mid;
              break;
            }
            if (v1 * vm <= 0) high = mid;
            else low = mid;
          }
          const rootX = Number(low.toFixed(3));
          if (!criticalPoints.some((cp) => Math.abs(cp.x - rootX) < 0.2)) {
            const yVal = compiledF.evaluate({ x: rootX });
            const secondDeriv = compiledD2.evaluate({ x: rootX });
            let type: 'min' | 'max' | 'inflection' = 'min';
            if (secondDeriv < -0.001) type = 'max';
            else if (secondDeriv > 0.001) type = 'min';
            else type = 'inflection';
            criticalPoints.push({ x: rootX, y: Number(yVal.toFixed(3)), type, latex: `(${rootX}, ${Number(yVal.toFixed(3))})` });
          }
        }
      } catch {
        // out of domain
      }
    }

    // Plot
    const plotPoints: { x: number; fx: number; fpx?: number; tangent?: number }[] = [];
    const minPlotX = atX - 6;
    const maxPlotX = atX + 6;
    const pStep = (maxPlotX - minPlotX) / 80;
    for (let x = minPlotX; x <= maxPlotX; x += pStep) {
      try {
        const y = compiledF.evaluate({ x });
        const yp = compiledD1.evaluate({ x });
        const yTang = slope * (x - atX) + fxVal;
        if (isFinite(y) && Math.abs(y) < 1000) {
          plotPoints.push({
            x: Number(x.toFixed(2)),
            fx: y,
            fpx: isFinite(yp) ? yp : undefined,
            tangent: isFinite(yTang) && Math.abs(x - atX) <= 4 ? yTang : undefined
          });
        }
      } catch {
        // ignore
      }
    }

    return {
      mode: 'derivative',
      functionLatex: f1Tex,
      firstDerivativeLatex: d1Latex,
      secondDerivativeLatex: d2Latex,
      tangentLine: { atX, equationLatex: tangentLatex, slope },
      criticalPoints,
      steps,
      plotPoints
    };
  } catch (err: any) {
    throw new Error(err.message || 'خطأ في اشتقاق الدالة');
  }
}

// ============================================================ definite integral
function fmtDec(v: number): string {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e7 || a < 1e-5) {
    const [m, e] = v.toExponential(5).split('e');
    return `${Number(m)} \\times 10^{${Number(e)}}`;
  }
  return String(Number(v.toFixed(6)));
}

function smallFrac(r: number, tol: number): [number, number] | null {
  for (let q = 1; q <= 24; q++) {
    const p = Math.round(r * q);
    if (Math.abs(p / q - r) < tol * Math.max(1, Math.abs(r))) return [p, q];
  }
  return null;
}

// LaTeX of p/q · sym  (sym may be '')
function fracSym(p: number, q: number, sym: string): string {
  let g = Math.abs(p);
  let d = q;
  while (d) [g, d] = [d, g % d];
  g = g || 1;
  p /= g;
  q /= g;
  const s = p < 0 ? '-' : '';
  const ap = Math.abs(p);
  const num = sym ? (ap === 1 ? sym : `${ap}${sym}`) : String(ap);
  return q === 1 ? `${s}${num}` : `${s}\\dfrac{${num}}{${q}}`;
}

export function recognizeIntegralExact(v: number): string | null {
  if (!isFinite(v)) return null;
  if (v === 0) return '0';
  const tol = 2e-9;
  if (Math.abs(v - Math.round(v)) < tol * Math.max(1, Math.abs(v))) return String(Math.round(v));
  const r = smallFrac(v, tol);
  if (r) return fracSym(r[0], r[1], '');
  const syms: [number, string][] = [
    [Math.PI, '\\pi'],
    [Math.PI * Math.PI, '\\pi^{2}'],
    [Math.LN2, '\\ln 2'],
    [Math.log(3), '\\ln 3'],
    [Math.E, 'e'],
    [Math.sqrt(2), '\\sqrt{2}'],
    [Math.sqrt(3), '\\sqrt{3}']
  ];
  for (const [val, s] of syms) {
    const k = smallFrac(v / val, tol);
    if (k) return fracSym(k[0], k[1], s);
  }
  // e − 1, e² …  common results
  const special: [number, string][] = [
    [Math.E - 1, 'e - 1'],
    [1 - 1 / Math.E, '1 - \\dfrac{1}{e}'],
    [Math.E * Math.E - 1, 'e^{2} - 1']
  ];
  for (const [val, s] of special) if (Math.abs(v - val) < tol * Math.max(1, Math.abs(v))) return s;
  return null;
}
export function computeDefiniteIntegral(expression: string, a: number, b: number): CalculusSolution {
  try {
    const node = math.parse(normalizeExpr(expression));
    const compiled = node.compile();
    const fTex = texOf(node);

    function f(x: number): number {
      const val = compiled.evaluate({ x });
      return isFinite(val) ? val : 0;
    }

    // composite Simpson 3/8 (n multiple of 3)
    const n = 3000;
    const h = (b - a) / n;
    let sum = f(a) + f(b);
    for (let i = 1; i < n; i++) {
      const x = a + i * h;
      sum += i % 3 === 0 ? 2 * f(x) : 3 * f(x);
    }
    let integralVal = ((3 * h) / 8) * sum;
    if (Math.abs(integralVal) < 1e-10) integralVal = 0;

    // exact form when recognisable (integer, fraction, kπ, k√m, k·ln2 …)
    const exactTex = recognizeIntegralExact(integralVal);
    const decTex = fmtDec(integralVal);
    const boundsTex = `\\displaystyle\\int_{${tex(a)}}^{${tex(b)}}`;

    const steps = [
      {
        title: 'صياغة التكامل المحدد',
        latex: `I = ${boundsTex} \\left(${fTex}\\right) dx`,
        explanation: `الحد الأدنى للتكامل $a = ${tex(a)}$ والحد الأعلى $b = ${tex(b)}$.`
      },
      {
        title: 'الحساب العددي (قاعدة سمبسون)',
        latex: aligned([`I &\\approx \\dfrac{3h}{8} \\sum_{i=0}^{n} w_{i}\\, f(x_{i})`, `h &= \\dfrac{b - a}{n} = \\dfrac{${tex(b)} - ${a < 0 ? `\\left(${tex(a)}\\right)` : tex(a)}}{${n}}`]),
        explanation: `قُسّم المجال $[${tex(Math.min(a, b))},\\ ${tex(Math.max(a, b))}]$ إلى $n = ${n}$ شريحة.`
      },
      {
        title: 'النتيجة',
        latex: exactTex
          ? aligned([`I &= ${exactTex}`, `I &\\approx ${decTex}`])
          : `I \\approx ${decTex}`,
        explanation: integralVal > 0 ? 'التكامل موجب: المساحة فوق محور الفواصل أكبر.' : integralVal < 0 ? 'التكامل سالب: المساحة تحت محور الفواصل أكبر.' : 'التكامل معدوم: المساحتان فوق وتحت المحور متساويتان.'
      }
    ];

    const plotPoints: { x: number; fx: number }[] = [];
    const minPlotX = Math.min(a, b) - 2;
    const maxPlotX = Math.max(a, b) + 2;
    const pStep = (maxPlotX - minPlotX) / 70;
    for (let x = minPlotX; x <= maxPlotX; x += pStep) {
      try {
        plotPoints.push({ x: Number(x.toFixed(2)), fx: f(x) });
      } catch {
        // ignore
      }
    }

    return {
      mode: 'integral',
      functionLatex: fTex,
      integralValue: {
        definiteValue: integralVal,
        definiteExactLatex: exactTex ?? decTex,
        decimalLatex: decTex,
        lowerLatex: tex(a),
        upperLatex: tex(b)
      },
      steps,
      plotPoints
    };
  } catch (err: any) {
    throw new Error(err.message || 'خطأ في حساب التكامل');
  }
}

// ============================================================ limits
type Side = { v: number; kind: 'finite' | 'inf' | 'undef' };

// scientific-friendly number for LaTeX tables
function fmtN(v: number): string {
  if (!isFinite(v)) return v > 0 ? '+\\infty' : '-\\infty';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-5) {
    const [m, e] = v.toExponential(3).split('e');
    return `${Number(m)} \\times 10^{${Number(e)}}`;
  }
  return String(Number(v.toPrecision(7)));
}

// pretty value of a limit: snaps tiny numerical noise, prefers exact fractions
function valTex(v: number): string {
  if (!isFinite(v)) return v > 0 ? '+\\infty' : '-\\infty';
  let x = v;
  if (Math.abs(x) < 1e-6) return '0';
  if (Math.abs(x - Math.round(x)) < 1e-6) return String(Math.round(x));
  for (let q = 2; q <= 24; q++) {
    const p = Math.round(x * q);
    if (Math.abs(x - p / q) < 2e-7) {
      x = p / q;
      return tex(x);
    }
  }
  return String(Number(x.toPrecision(7)));
}

function computeLHopital(expression: string, targetX: number | 'infinity' | '-infinity'): CalculusSolution {
  const nerdTex = (source: string) => (nerdamer(source) as unknown as { toTeX: () => string }).toTeX();
  const normalized = normalizeExpr(expression);
  const parsed = nerdamer(normalized) as unknown as {
    getNumerator: () => { text: () => string };
    getDenominator: () => { text: () => string };
    toTeX: () => string;
  };
  const functionLatex = parsed.toTeX();
  let numerator = parsed.getNumerator().text();
  let denominator = parsed.getDenominator().text();
  if (denominator === '1') throw new Error('قاعدة لوبيتال تتطلب كسراً؛ الدالة المدخلة ليست مكتوبة على شكل بسط ومقام.');

  const target = targetX === 'infinity' ? 'Infinity' : targetX === '-infinity' ? '-Infinity' : String(targetX);
  const targetLatex = targetX === 'infinity' ? '+\\infty' : targetX === '-infinity' ? '-\\infty' : tex(targetX);
  const value = (expr: string) => nerdamer.limit(expr, 'x', target) as unknown as {
    text: () => string;
    toTeX: () => string;
    numeric: () => { text: () => string };
  };
  const classify = (expr: string): 'zero' | 'infinite' | 'finite' | 'unknown' => {
    try {
      const v = value(expr);
      const t = v.text().replace(/\\s/g, '').toLowerCase();
      if (t === '0' || t === '0.0') return 'zero';
      if (t.includes('infinity') || t === 'inf' || t === '-inf') return 'infinite';
      const n = Number(v.numeric().text());
      if (Number.isFinite(n)) return Math.abs(n) < 1e-12 ? 'zero' : 'finite';
      return 'unknown';
    } catch {
      return 'unknown';
    }
  };

  const steps: CalculusSolution['steps'] = [];
  const nInitial = classify(numerator);
  const dInitial = classify(denominator);
  const indeterminate = (n: string, d: string) => {
    const nc = classify(n);
    const dc = classify(d);
    return (nc === 'zero' && dc === 'zero') || (nc === 'infinite' && dc === 'infinite');
  };

  if (!indeterminate(numerator, denominator)) {
    throw new Error(`لا تنطبق قاعدة لوبيتال: النسبة ليست من الشكل غير المحدد 0/0 أو ∞/∞ (حالة البسط: ${nInitial}، المقام: ${dInitial}).`);
  }

  steps.push({
    title: 'التحقق من الشكل غير المحدد',
    explanation: 'نحسب نهايتي البسط والمقام أولاً؛ لا يجوز استعمال قاعدة لوبيتال إلا في حالتي 0/0 أو ∞/∞.',
    latex: `\\lim_{x\\to ${targetLatex}} \\frac{${nerdTex(numerator)}}{${nerdTex(denominator)}} \\quad\\text{من الشكل } \\frac{0}{0}\\text{ أو }\\frac{\\infty}{\\infty}`
  });

  let finalLimit: ReturnType<typeof value> | null = null;
  for (let i = 0; i < 8; i++) {
    const dn = nerdamer.diff(numerator, 'x') as unknown as { text: () => string; toTeX: () => string };
    const dd = nerdamer.diff(denominator, 'x') as unknown as { text: () => string; toTeX: () => string };
    const nextNumerator = dn.text();
    const nextDenominator = dd.text();
    if (nextDenominator === '0') throw new Error('مشتقة المقام تساوي صفراً؛ لا يمكن متابعة تطبيق قاعدة لوبيتال.');

    steps.push({
      title: `تطبيق قاعدة لوبيتال (المرة ${i + 1})`,
      explanation: 'نشتق البسط والمقام كلٌّ على حدة، ولا نشتق خارج الكسر:',
      latex: `\\lim_{x\\to ${targetLatex}} \\frac{${nerdTex(numerator)}}{${nerdTex(denominator)}} = \\lim_{x\\to ${targetLatex}} \\frac{${dn.toTeX()}}{${dd.toTeX()}}`
    });

    numerator = nextNumerator;
    denominator = nextDenominator;
    if (!indeterminate(numerator, denominator)) {
      finalLimit = value(`(${numerator})/(${denominator})`);
      break;
    }
  }

  if (!finalLimit) throw new Error('بقي الشكل غير محدد بعد 8 تطبيقات. قد تحتاج النهاية إلى طريقة أخرى غير لوبيتال.');

  const finalText = finalLimit.text();
  const finalLatex = finalLimit.toTeX();
  const asNum = Number(finalLimit.numeric().text());
  const kind: 'finite' | 'infinite' | 'dne' = /infinity/i.test(finalText) ? 'infinite' : Number.isFinite(asNum) ? 'finite' : 'dne';
  const result = kind === 'finite' ? valTex(asNum) : kind === 'infinite' ? (finalText.startsWith('-') ? '-\\infty' : '+\\infty') : '\\nexists';
  steps.push({
    title: 'النتيجة النهائية',
    explanation: 'هذه هي نهاية النسبة بعد الوصول إلى حالة غير مبهمة.',
    latex: `\\lim_{x\\to ${targetLatex}} \\frac{${nerdTex(numerator)}}{${nerdTex(denominator)}} = ${finalLatex}`
  });

  return {
    mode: 'limits',
    functionLatex,
    limitValue: {
      target: String(targetX), result, kind, targetLatex, twoSided: false,
      note: `طُبقت قاعدة لوبيتال ${steps.filter((s) => s.title.startsWith('تطبيق')).length} مرة.`
    },
    steps
  };
}

function computeLimitLegacy(expression: string, targetX: number | 'infinity' | '-infinity', useLHopital = false): CalculusSolution {
  try {
    if (useLHopital) return computeLHopital(expression, targetX);
    const node = math.parse(normalizeExpr(expression));
    const compiled = node.compile();
    const fTex = texOf(node);

    const ev = (x: number): number => {
      try {
        const r = compiled.evaluate({ x });
        return typeof r === 'number' ? r : NaN;
      } catch {
        return NaN;
      }
    };

    // estimate the value reached along a sequence of points that approach the target
    function estimate(points: number[]): Side {
      const vals = points.map(ev);
      const last = vals[vals.length - 1];
      if (vals.every((v) => isNaN(v))) return { v: NaN, kind: 'undef' };
      if (!isFinite(last) && !isNaN(last)) return { v: last, kind: 'inf' };
      const ok = vals.filter((v) => isFinite(v));
      if (ok.length < 2) return { v: last, kind: isNaN(last) ? 'undef' : 'finite' };

      // divergence : values keep growing in magnitude
      const first = ok[0];
      const lastOk = ok[ok.length - 1];
      const grows = ok.every((v, i) => i === 0 || Math.abs(v) >= Math.abs(ok[i - 1]) * 0.999) && Math.abs(lastOk) > 10 && Math.abs(lastOk) > 2 * Math.abs(first);
      if (grows) return { v: lastOk > 0 ? Infinity : -Infinity, kind: 'inf' };

      // convergence : the most stable consecutive pair (avoids floating point noise at the end)
      let bestI = ok.length - 1;
      let bestD = Infinity;
      for (let i = 1; i < ok.length; i++) {
        const d = Math.abs(ok[i] - ok[i - 1]) / (1 + Math.abs(ok[i]));
        if (d <= bestD) {
          bestD = d;
          bestI = i;
        }
      }
      return { v: ok[bestI], kind: 'finite' };
    }

    const eps = [1e-2, 1e-3, 1e-4, 1e-5, 1e-6];
    const big = [1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8];

    let left: Side;
    let right: Side;
    let twoSided = true;
    let targetLatex: string;
    let table: { xs: number[]; row: string }[] = [];

    if (targetX === 'infinity') {
      targetLatex = '+\\infty';
      left = right = estimate(big);
      twoSided = false;
    } else if (targetX === '-infinity') {
      targetLatex = '-\\infty';
      left = right = estimate(big.map((x) => -x));
      twoSided = false;
    } else {
      targetLatex = tex(targetX);
      left = estimate(eps.map((e) => targetX - e));
      right = estimate(eps.map((e) => targetX + e));
      table = [
        { xs: [0.1, 0.01, 0.001].map((e) => targetX - e), row: 'left' },
        { xs: [0.1, 0.01, 0.001].map((e) => targetX + e), row: 'right' }
      ];
    }

    // -------- verdict
    let kind: 'finite' | 'infinite' | 'dne' = 'finite';
    let resultLatex = '';
    let note = '';
    const sideTex = (s: Side) => (s.kind === 'undef' ? '\\text{—}' : valTex(s.v));

    if (!twoSided) {
      if (left.kind === 'undef') throw new Error('الدالة غير معرّفة عند اللانهاية');
      if (left.kind === 'inf') {
        kind = 'infinite';
        resultLatex = left.v > 0 ? '+\\infty' : '-\\infty';
        note = 'الدالة غير محدودة: النهاية لا نهائية.';
      } else {
        resultLatex = valTex(left.v);
        note = 'النهاية منتهية: للمنحنى مستقيم مقارب أفقي.';
      }
    } else if (left.kind === 'undef' && right.kind === 'undef') {
      throw new Error('الدالة غير معرّفة في جوار هذه النقطة');
    } else if (left.kind === 'undef' || right.kind === 'undef') {
      const s = left.kind === 'undef' ? right : left;
      kind = s.kind === 'inf' ? 'infinite' : 'finite';
      resultLatex = sideTex(s);
      note = `الدالة معرّفة من ${left.kind === 'undef' ? 'اليمين' : 'اليسار'} فقط، فالنتيجة نهاية من جهة واحدة.`;
    } else if (left.kind === 'inf' && right.kind === 'inf') {
      if (Math.sign(left.v) === Math.sign(right.v)) {
        kind = 'infinite';
        resultLatex = left.v > 0 ? '+\\infty' : '-\\infty';
        note = 'الدالة تتجه نحو اللانهاية من الجهتين: المستقيم x = a مقارب شاقولي.';
      } else {
        kind = 'dne';
        resultLatex = '\\nexists';
        note = 'النهايتان من اليمين واليسار تؤولان إلى ∞ بإشارتين مختلفتين، فلا توجد نهاية.';
      }
    } else if (left.kind === 'inf' || right.kind === 'inf') {
      kind = 'dne';
      resultLatex = '\\nexists';
      note = 'إحدى النهايتين لا نهائية والأخرى منتهية، فلا توجد نهاية.';
    } else if (Math.abs(left.v - right.v) <= 1e-5 * (1 + Math.abs(left.v))) {
      resultLatex = valTex((left.v + right.v) / 2);
      note = 'النهايتان من اليمين واليسار متساويتان، إذن النهاية موجودة.';
    } else {
      kind = 'dne';
      resultLatex = '\\nexists';
      note = 'النهايتان من اليمين واليسار مختلفتان، فلا توجد نهاية.';
    }

    // -------- steps
    const lim = (sub: string) => `\\lim_{x \\to ${sub}}`;
    const steps: CalculusSolution['steps'] = [
      {
        title: 'صياغة النهاية',
        latex: `${lim(targetLatex)} \\left(${fTex}\\right)`,
        explanation: 'ندرس سلوك الدالة عندما يقترب x من القيمة المطلوبة.'
      }
    ];

    if (twoSided && typeof targetX === 'number' && table.length) {
      const hdr = ['0.1', '0.01', '0.001'];
      const mk = (xs: number[]) => xs.map((x) => fmtN(ev(x))).join(' & ');
      steps.push({
        title: 'جدول القيم',
        latex: `\\begin{array}{c|ccc} x \\to ${tex(targetX)}^{-} & ${hdr.map((h) => `${tex(targetX)} - ${h}`).join(' & ')} \\\\ \\hline f(x) & ${mk(table[0].xs)} \\\\[10pt] x \\to ${tex(targetX)}^{+} & ${hdr.map((h) => `${tex(targetX)} + ${h}`).join(' & ')} \\\\ \\hline f(x) & ${mk(table[1].xs)} \\end{array}`,
        explanation: 'نقترب من النقطة من اليسار ومن اليمين ونلاحظ القيم.'
      });
      steps.push({
        title: 'النهاية من كل جهة',
        latex: aligned([`${lim(`${targetLatex}^{-}`)} f(x) &= ${sideTex(left)}`, `${lim(`${targetLatex}^{+}`)} f(x) &= ${sideTex(right)}`]),
        explanation: 'نقارن النهاية من اليسار بالنهاية من اليمين.'
      });
    }
    steps.push({
      title: 'الاستنتاج',
      latex: `${lim(targetLatex)} f(x) = ${resultLatex}`,
      explanation: note
    });

    return {
      mode: 'limits',
      functionLatex: fTex,
      limitValue: {
        target: String(targetX),
        result: resultLatex,
        kind,
        targetLatex,
        leftLatex: twoSided ? sideTex(left) : undefined,
        rightLatex: twoSided ? sideTex(right) : undefined,
        twoSided,
        note
      },
      steps
    };
  } catch (err: any) {
    throw new Error(err.message || 'خطأ في حساب النهاية');
  }
}

// ============================================================================
// محرك النهايات وفق سلالم التصحيح الوزارية السورية
//  · التعويض المباشر عبر الاتصال
//  · تحليل البسط والمقام واختزال العامل المشترك (x − a) في حالة 0/0
//  · مبرهنات النهايات الشهيرة (إبدال بالمكافئ) بدل لوبيتال
//  · إخراج العامل المسيطر ومبرهنات التزايد المقارن عند ±∞
//  · خلاصة المقاربات ودراسة الوضع النسبي للمنحنى بالمقارنة مع المقارب
// ============================================================================
type Coefs = number[] | null;

const stripP = (p: number[]): number[] => {
  const out = [...p];
  while (out.length > 1 && Math.abs(out[out.length - 1]) < 1e-12) out.pop();
  return out.map((c) => (Math.abs(c) < 1e-12 ? 0 : c));
};
const pAdd = (a: number[], b: number[]): number[] => {
  const n = Math.max(a.length, b.length);
  const out = Array.from({ length: n }, (_, i) => (a[i] ?? 0) + (b[i] ?? 0));
  return stripP(out);
};
const pSub = (a: number[], b: number[]): number[] => {
  const n = Math.max(a.length, b.length);
  const out = Array.from({ length: n }, (_, i) => (a[i] ?? 0) - (b[i] ?? 0));
  return stripP(out);
};
const pMul = (a: number[], b: number[]): number[] => {
  const out = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
  return stripP(out);
};
const pEval = (p: number[], x: number): number => p.reduceRight((acc, c) => acc * x + c, 0);
const pDivMod = (a: number[], b: number[]): { q: number[]; r: number[] } => {
  const r = [...a];
  const q = new Array(Math.max(1, a.length - b.length + 1)).fill(0);
  const lead = b[b.length - 1];
  while (r.length >= b.length && Math.abs(r[r.length - 1]) > 1e-12) {
    const k = r.length - b.length;
    const c = r[r.length - 1] / lead;
    q[k] = c;
    for (let i = 0; i < b.length; i++) r[k + i] -= c * b[i];
    r.pop();
    if (r.length === 0) r.push(0);
  }
  return { q: stripP(q), r: stripP(r) };
};

/** coefficient list of a polynomial in x (null when not polynomial) */
function toPoly(node: any, v = 'x'): Coefs {
  if (!node) return null;
  if (node.type === 'ConstantNode') return [Number(node.value)];
  if (node.type === 'SymbolNode') return node.name === v ? [0, 1] : node.name === 'pi' ? [Math.PI] : node.name === 'e' ? [Math.E] : null;
  if (node.type === 'ParenthesisNode') return toPoly(node.args?.[0] ?? node.items?.[0], v);
  if (node.type === 'OperatorNode') {
    const kids: any[] = node.args ?? node.items ?? [];
    if (node.op === '+') {
      let acc: number[] = [0];
      for (const kid of kids) { const p = toPoly(kid, v); if (!p) return null; acc = pAdd(acc, p); }
      return stripP(acc);
    }
    if (node.op === '-') {
      if (kids.length === 1) { const p = toPoly(kids[0], v); return p ? pSub([0], p) : null; }
      let acc = toPoly(kids[0], v);
      if (!acc) return null;
      for (let i = 1; i < kids.length; i++) { const p = toPoly(kids[i], v); if (!p) return null; acc = pSub(acc, p); }
      return stripP(acc);
    }
    if (node.op === '*') {
      let acc: number[] = [1];
      for (const kid of kids) { const p = toPoly(kid, v); if (!p) return null; acc = pMul(acc, p); }
      return stripP(acc);
    }
    if (node.op === '/') {
      const num = toPoly(kids[0], v);
      const den = toPoly(kids[1], v);
      if (!num || !den) return null;
      if (den.length === 1) return stripP(num.map((c) => c / den[0]));
      return null;
    }
    if (node.op === '^') {
      const base = toPoly(kids[0], v);
      const expo = kids[1]?.type === 'ConstantNode' ? Number(kids[1].value) : NaN;
      if (!base || !Number.isInteger(expo) || expo < 0 || expo > 12) return null;
      let acc: number[] = [1];
      for (let i = 0; i < expo; i++) acc = pMul(acc, base);
      return stripP(acc);
    }
  }
  return null;
}

const numTex = (c: number): string => (Math.abs(c - Math.round(c)) < 1e-9 ? String(Math.round(c)) : String(Number(c.toPrecision(6))));

function polyTex(p: number[], v = 'x'): string {
  const terms: string[] = [];
  for (let k = p.length - 1; k >= 0; k--) {
    const c = p[k];
    if (Math.abs(c) < 1e-12) continue;
    const mag = Math.abs(c);
    const coeff = k === 0 ? numTex(mag) : Math.abs(mag - 1) < 1e-12 ? '' : numTex(mag);
    const body = k === 0 ? coeff : k === 1 ? `${coeff}${v}` : `${coeff}${v}^{${k}}`;
    if (terms.length === 0) terms.push(`${c < 0 ? '-' : ''}${body}`);
    else terms.push(`${c < 0 ? '-' : '+'} ${body}`);
  }
  return terms.length ? terms.join(' ') : '0';
}

/** (x − a) factor text */
const xaTex = (a: number): string => (a === 0 ? 'x' : `\\left(x ${a > 0 ? '-' : '+'} ${numTex(Math.abs(a))}\\right)`);
const powerTex = (k: number): string => (k === 0 ? '1' : k === 1 ? 'x' : `x^{${k}}`);

type EqvOut = { text: string; theorems: string[]; zero: boolean };

/** replace vanishing transcendental factors by their equivalents (famous limits) */
function equivalents(node: any, at: number): EqvOut {
  const zeroOf = (n: any): boolean => {
    try {
      const val = Number(n.compile().evaluate({ x: at }));
      return Number.isFinite(val) && Math.abs(val) < 1e-9;
    } catch {
      return false;
    }
  };
  const raw = (n: any): string => (n.toString ? n.toString({ parenthesis: 'all' }) : String(n));

  const walk = (n: any): EqvOut => {
    const zero = zeroOf(n);
    const type = n?.type;
    const kids: any[] = n?.args ?? n?.items ?? [];

    if (type === 'OperatorNode' && n.op === '-') {
      const [A, B] = kids;
      // 1 − cos u  ~  u²/2
      if (B && B.type === 'FunctionNode' && B.fn === 'cos' && zeroOf(B.args[0])) {
        const u = walk(B.args[0]);
        return { text: `((${u.text})^2)/2`, theorems: ['\\lim_{u\\to 0}\\dfrac{1-\\cos u}{u^{2}}=\\dfrac{1}{2}'], zero: true };
      }
      // e^u − 1  ~  u   |   exp(u) − 1  ~  u   |   ln(1+u) ~ u handled below
      if (A && Math.abs(Number(B?.value ?? NaN) - 1) < 1e-12) {
        const isExp = A.type === 'FunctionNode' && A.fn === 'exp';
        const isE = A.type === 'OperatorNode' && A.op === '^' && A.args?.[0]?.type === 'SymbolNode' && A.args[0].name === 'e';
        if (isExp || isE) {
          const u = walk(isExp ? A.args[0] : A.args[1]);
          if (u.zero || zeroOf(isExp ? A.args[0] : A.args[1])) {
            return { text: `(${u.text})`, theorems: ['\\lim_{u\\to 0}\\dfrac{e^{u}-1}{u}=1'], zero: true };
          }
        }
      }
    }

    if (type === 'FunctionNode' && ['sin', 'tan', 'sinh', 'tanh', 'asin', 'atan', 'arcsin', 'arctan'].includes(n.fn)) {
      const inner = kids[0];
      if (inner && zeroOf(inner)) {
        const u = walk(inner);
        return {
          text: `(${u.text})`,
          theorems: [`\\lim_{u\\to 0}\\dfrac{${n.fn === 'asin' || n.fn === 'arcsin' ? '\\arcsin u' : n.fn === 'atan' || n.fn === 'arctan' ? '\\arctan u' : `\\${n.fn} u`}}{u}=1`],
          zero: true
        };
      }
    }

    if (type === 'FunctionNode' && (n.fn === 'log' || n.fn === 'ln') && kids[0]) {
      const inner = kids[0];
      if (inner.type === 'OperatorNode' && inner.op === '+' ) {
        const parts: any[] = inner.args ?? [];
        const one = parts.find((p) => p.type === 'ConstantNode' && Math.abs(Number(p.value) - 1) < 1e-12);
        const rest = parts.find((p) => p !== one);
        if (one && rest && zeroOf(rest)) {
          const u = walk(rest);
          return { text: `(${u.text})`, theorems: ['\\lim_{u\\to 0}\\dfrac{\\ln(1+u)}{u}=1'], zero: true };
        }
      }
    }

    if (type === 'ParenthesisNode') return walk(kids[0]);
    if (type === 'OperatorNode' && ['+', '-', '*'].includes(n.op) && kids.length) {
      const t = kids.map(walk);
      const theorems = [...new Set(t.flatMap((k) => k.theorems))];
      const body = n.op === '*' ? t.map((k) => `(${k.text})`).join('*') : t.map((k) => `(${k.text})`).join(n.op);
      return { text: body || raw(n), theorems, zero };
    }
    if (type === 'OperatorNode' && n.op === '/' && kids.length === 2) {
      const num = walk(kids[0]);
      const den = walk(kids[1]);
      return { text: `((${num.text}))/(${den.text})`, theorems: [...new Set([...num.theorems, ...den.theorems])], zero };
    }
    if (type === 'OperatorNode' && n.op === '^' && kids.length === 2) {
      const base = walk(kids[0]);
      return { text: `((${base.text}))^${raw(kids[1])}`, theorems: base.theorems, zero: base.zero };
    }
    return { text: raw(n), theorems: [], zero };
  };

  return walk(node);
}

const stableAt = (fn: (x: number) => number, xs: number[]): number | null => {
  const vals = xs.map(fn).filter((v) => Number.isFinite(v));
  if (vals.length < 2) return null;
  for (let i = 1; i < vals.length; i++) {
    if (Math.abs(vals[i] - vals[i - 1]) / (1 + Math.abs(vals[i])) < 1e-7) return vals[i];
  }
  return vals[vals.length - 1];
};

interface SyrianLimitResult {
  result: string;
  kind: 'finite' | 'infinite' | 'dne';
  steps: CalculusSolution['steps'];
  leftTex?: string;
  rightTex?: string;
  twoSided: boolean;
  asymptoteLatex?: string;
  positionLatex?: string;
}

function syrianLimit(expression: string, target: number | 'infinity' | '-infinity'): SyrianLimitResult | null {
  const normalized = normalizeExpr(expression);
  if (!normalized.trim()) return null;
  let parsed: any;
  try {
    parsed = math.parse(normalized);
  } catch {
    return null;
  }
  const compile = parsed.compile();
  const f = (x: number): number => {
    try {
      const r = Number(compile.evaluate({ x }));
      return Number.isFinite(r) ? r : r;
    } catch {
      return NaN;
    }
  };
  const steps: CalculusSolution['steps'] = [];
  const lim = (sub: string) => `\\lim_{${sub}}`;
  const xTo = (aTex: string, extra = '') => `x \\to ${aTex}${extra}`;

  // -------------------------------------------------- ±∞ : dominant factor + growth
  if (target !== 'infinity' && target !== '-infinity') {
    const a = target;
    const va = f(a);
    if (Number.isFinite(va)) {
      steps.push({
        title: 'التعويض المباشر (الاتصال)',
        explanation: 'الدالة متصلة عند x₀، فنهايتها تساوي صورتها:',
        latex: `${lim(xTo(tex(a)))} f(x) = f(${tex(a)}) = ${valTex(va)}`
      });
      return { result: valTex(va), kind: 'finite', steps, twoSided: false };
    }
  } else {
    const sign = target === 'infinity' ? 1 : -1;
    const aTex = target === 'infinity' ? '+\\infty' : '-\\infty';
    const top = parsed.type === 'OperatorNode' && parsed.op === '/' ? parsed.args?.[0] : parsed;
    const bot = parsed.type === 'OperatorNode' && parsed.op === '/' ? parsed.args?.[1] : { type: 'ConstantNode', value: 1 };
    const P = toPoly(top);
    const Q = toPoly(bot);
    if (P && Q) {
      const n = P.length - 1;
      const m = Q.length - 1;
      const xn = powerTex(n);
      const xm = powerTex(m);
      const expand = (poly: number[], deg: number): string => {
        const parts: string[] = [numTex(poly[deg] ?? 0)];
        for (let i = deg - 1; i >= 0; i--) {
          const c = poly[i] ?? 0;
          if (Math.abs(c) < 1e-12) continue;
          parts.push(`\\dfrac{${numTex(Math.abs(c))}}{${powerTex(i)}}`);
          parts[parts.length - 1] = `${c < 0 ? '-' : '+'} ${parts[parts.length - 1]}`;
        }
        return parts.join(' ');
      };
      steps.push({
        title: 'إخراج العامل المسيطر',
        explanation: 'نخرج أعلى قوة لـ x عاملاً مشتركاً من البسط ومن المقام لعزل المسيطر:',
        latex: `f(x) = \\dfrac{${xn}\\left(${expand(P, n)}\\right)}{${xm}\\left(${expand(Q, m)}\\right)}`
      });
      steps.push({
        title: 'التبسيط ونهايات الحدود المتبقية',
        explanation: 'بما أن $\\lim\\limits_{x \\to \\pm\\infty}\\dfrac{1}{x^{k}} = 0$ فإن كل الحدود من الرتبة الصغرى تعدم:',
        latex: `\\lim_{${xTo(aTex)}} f(x) = \\lim_{${xTo(aTex)}} \\frac{${xn}}{${xm}} \\cdot \\frac{${numTex(P[n])}}{${numTex(Q[m])}}`
      });
      if (n === m) {
        const val = P[n] / Q[m];
        steps.push({ title: 'النتيجة (حالة التقارب الأفقي)', explanation: 'الدرجتان متساويتان فالنهاية نسبة المعاملين الرئيسيين:', latex: `${lim(xTo(aTex))} f(x) = ${valTex(val)}` });
        return {
          result: valTex(val),
          kind: 'finite',
          steps,
          twoSided: false,
          asymptoteLatex: `\\Delta : y = ${valTex(val)} \\quad \\text{مستقيم مقارب أفقي للمنحنى } C_{f} \\text{ في جوار } ${aTex}`,
          positionLatex: relativePosition(f, val, target)
        };
      }
      if (n < m) {
        steps.push({ title: 'النتيجة', explanation: 'درجة المقام أكبر فالكسر يؤول إلى الصفر:', latex: `${lim(xTo(aTex))} f(x) = 0` });
        return { result: '0', kind: 'finite', steps, twoSided: false, asymptoteLatex: `\\Delta : y = 0 \\quad \\text{مستقيم مقارب أفقي للمنحنى } C_{f} \\text{ في جوار } ${aTex}`, positionLatex: relativePosition(f, 0, target) };
      }
      const deg = n - m;
      const s = Math.sign(P[n] / Q[m]) * (sign < 0 && deg % 2 === 1 ? -1 : 1);
      const resTex = s > 0 ? '+\\infty' : '-\\infty';
      steps.push({ title: 'النتيجة', explanation: 'درجة البسط أكبر، والحد المسيطر يحدد الإشارة:', latex: `${lim(xTo(aTex))} f(x) = ${resTex}` });
      return { result: resTex, kind: 'infinite', steps, twoSided: false };
    }

    // transcendental comparison growth
    const hasExp = /(^|[^a-z])(exp|e\^)/.test(normalized) || /e\^/.test(normalized);
    const hasLn = /(ln|log)\s*\(/.test(normalized);
    const probe = stableAt(f, sign > 0 ? [1e2, 1e3, 1e4, 1e5, 1e6, 1e7] : [-1e2, -1e3, -1e4, -1e5, -1e6, -1e7]);
    if (probe === null) return null;
    const growth = hasExp && hasLn
      ? ['\\lim_{x \\to +\\infty} \\dfrac{\\ln x}{x} = 0 \\quad , \\quad \\lim_{x \\to +\\infty} \\dfrac{e^{x}}{x^{n}} = +\\infty']
      : hasExp
        ? ['\\lim_{x \\to +\\infty} \\dfrac{e^{x}}{x^{n}} = +\\infty \\quad , \\quad \\lim_{x \\to -\\infty} x^{n} e^{x} = 0']
        : hasLn
          ? ['\\lim_{x \\to +\\infty} \\dfrac{\\ln x}{x^{n}} = 0']
          : [];
    if (growth.length) {
      steps.push({
        title: 'مبرهنات التزايد المقارن',
        explanation: 'عند اللانهاية تراتبية النمو معتمدة في المنهاج (اللوغاريتم ≪ القوى ≪ الأسّي):',
        latex: aligned(growth)
      });
    }
    if (Math.abs(probe) > 1e7) {
      const resTex = probe > 0 ? '+\\infty' : '-\\infty';
      steps.push({ title: 'النتيجة', explanation: 'الدالة غير محدودة في جوار اللانهاية:', latex: `${lim(xTo(aTex))} f(x) = ${resTex}` });
      return { result: resTex, kind: 'infinite', steps, twoSided: false };
    }
    const val = valTex(probe);
    steps.push({
      title: 'النتيجة',
      explanation: 'بعد عزل المسيطر تحصل النهاية على الشكل:',
      latex: `${lim(xTo(aTex))} f(x) = ${val}`
    });
    return {
      result: val,
      kind: 'finite',
      steps,
      twoSided: false,
      asymptoteLatex: `\\Delta : y = ${val} \\quad \\text{مستقيم مقارب أفقي للمنحنى } C_{f} \\text{ في جوار } ${aTex}`,
      positionLatex: relativePosition(f, probe, target)
    };
  }

  // -------------------------------------------------- finite a : 0/0 or k/0
  const a = target;
  const aTex = tex(a);
  const top = parsed.type === 'OperatorNode' && parsed.op === '/' ? parsed.args?.[0] : parsed;
  const bot = parsed.type === 'OperatorNode' && parsed.op === '/' ? parsed.args?.[1] : { type: 'ConstantNode', value: 1 };
  const evalAt = (n: any, x: number): number => {
    try {
      return Number(n.compile().evaluate({ x }));
    } catch {
      return NaN;
    }
  };
  const nA = evalAt(top, a);
  const dA = evalAt(bot, a);

  steps.push({
    title: 'التعويض المباشر واختبار الشكل',
    explanation: 'نعوّض $x = a$ في البسط وفي المقام لتحديد طبيعة الصورة:',
    latex: `\\begin{aligned} \\text{البسط} &\\to ${Number.isFinite(nA) ? valTex(nA) : '\\pm\\infty'} \\\\[6pt] \\text{المقام} &\\to ${Number.isFinite(dA) ? valTex(dA) : '\\pm\\infty'} \\end{aligned}`
  });

  // case: denominator vanishes only → vertical asymptote
  if (Number.isFinite(nA) && Math.abs(nA) > 1e-9 && Math.abs(dA) < 1e-9) {
    const left = f(a - 1e-7);
    const right = f(a + 1e-7);
    const sideVal = (v: number) => (!Number.isFinite(v) ? (v > 0 ? '+\\infty' : '-\\infty') : valTex(v));
    const leftTex = sideVal(left);
    const rightTex = sideVal(right);
    const sameSign = left * right > 0;
    const twoSidedInfinite = sameSign && !Number.isFinite(left) && !Number.isFinite(right);
    steps.push({
      title: 'دراسة الإشارة في جوار a',
      explanation: 'ندرس إشارة الدالة عندما تقارب x القيمة a بقيم أصغر وبقيم أكبر:',
      latex: aligned([
        `${lim(xTo(aTex, `,\\; x < ${aTex}`))} f(x) &= ${leftTex}`,
        `${lim(xTo(aTex, `,\\; x > ${aTex}`))} f(x) &= ${rightTex}`
      ])
    });
    const conclusion = twoSidedInfinite
      ? { result: left > 0 ? '+\\infty' : '-\\infty', kind: 'infinite' as const }
      : { result: '\\nexists', kind: 'dne' as const };
    steps.push({
      title: 'خلاصة الوضع النسبي',
      explanation: 'المقام يعدم والبسط لا يعدم، فالخط الشاقولي مقارب للمنحنى:',
      latex: `\\Delta : x = ${aTex} \\quad \\text{مستقيم مقارب شاقولي للمنحنى } C_{f}`
    });
    return { result: conclusion.result, kind: conclusion.kind, steps, twoSided: true, leftTex, rightTex, asymptoteLatex: `\\Delta : x = ${aTex} \\quad \\text{مستقيم مقارب شاقولي للمنحنى } C_{f}` };
  }

  // case 0/0 → cancellation then famous limits
  if (Math.abs(nA) < 1e-9 && Math.abs(dA) < 1e-9) {
    const P = toPoly(top);
    const Q = toPoly(bot);
    if (P && Q) {
      let num = [...P];
      let den = [...Q];
      let cancelled = 0;
      const factor = a === 0 ? [0, 1] : [-a, 1];
      for (let i = 0; i < 12; i++) {
        const rn = pDivMod(num, factor);
        const rd = pDivMod(den, factor);
        if (Math.abs(pEval(rn.r, a)) > 1e-9 || Math.abs(pEval(rd.r, a)) > 1e-9) break;
        num = rn.q;
        den = rd.q;
        cancelled++;
      }
      if (cancelled > 0 && Math.abs(pEval(den, a)) > 1e-9) {
        const val = pEval(num, a) / pEval(den, a);
        steps.push({
          title: `التحليل واختزال العامل المشترك ${xaTex(a)}${cancelled > 1 ? ` (قوة ${cancelled})` : ''}`,
          explanation: 'نكتب البسط والمقام على صورة جداء، ثم نختزل العامل المشترك بعد التأكيد أنه غير معدوم قرب a:',
          latex: aligned([
            `f(x) = \\dfrac{${xaTex(a)}${cancelled > 1 ? `^{${cancelled}}` : ''}\\left(${polyTex(num)}\\right)}{${xaTex(a)}${cancelled > 1 ? `^{${cancelled}}` : ''}\\left(${polyTex(den)}\\right)}`,
            `f(x) = \\dfrac{${polyTex(num)}}{${polyTex(den)}} \\quad (x \\ne ${aTex})`
          ])
        });
        steps.push({
          title: 'التعويض في الصورة المختزلة',
          explanation: 'بعد إزالة حالة عدم التعيين يعوّض مباشرة:',
          latex: `${lim(xTo(aTex))} f(x) = \\dfrac{${valTex(pEval(num, a))}}{${valTex(pEval(den, a))}} = ${valTex(val)}`
        });
        return { result: valTex(val), kind: 'finite', steps, twoSided: false };
      }
    }

    // famous limits route
    const t = equivalents(parsed, a);
    if (t.theorems.length) {
      try {
        const reduced = math.parse(t.text);
        const val = Number(reduced.compile().evaluate({ x: a }));
        if (Number.isFinite(val)) {
          steps.push({
            title: 'الإبدال بالمكافئ (النهايات الشهيرة)',
            explanation: 'نعوّض كل عامل يؤول إلى الصفر بمكافئه المكافئ المبني على المبرهنات التالية:',
            latex: aligned([
              ...t.theorems.map((th) => `${th}`),
              `f(x) \\underset{x \\to ${aTex}}{\\sim} \\left(${t.text.replace(/\*/g, ' \\times ').replace(/\//g, ' \\div ')}\\right)`
            ])
          });
          steps.push({
            title: 'التعويض بعد إزالة عدم التعيين',
            explanation: 'تصبح الصورة مباشرة:',
            latex: `${lim(xTo(aTex))} f(x) = ${valTex(val)}`
          });
          return { result: valTex(val), kind: 'finite', steps, twoSided: false, asymptoteLatex: Math.abs(val) < 1e-12 ? undefined : undefined };
        }
      } catch {
        return null;
      }
    }
    return null;
  }

  // numerator infinite or otherwise undefined → numeric with one-sided wording
  const leftV = stableAt((x) => f(x), [a - 1e-2, a - 1e-4, a - 1e-6, a - 1e-8].map((d) => a + d));
  const rightV = stableAt(f, [a + 1e-2, a + 1e-4, a + 1e-6, a + 1e-8]);
  if (leftV === null && rightV === null) return null;
  const texOfSide = (v: number | null) => (v === null ? '\\text{—}' : Math.abs(v) > 1e9 ? (v > 0 ? '+\\infty' : '-\\infty') : valTex(v));
  const L = leftV ?? rightV!;
  const R = rightV ?? leftV!;
  const same = Math.abs(L - R) <= 1e-5 * (1 + Math.abs(L));
  steps.push({
    title: 'النهاية من الطرفين',
    explanation: 'السلّم المعتمد يطلب كتابتها بقيم أصغر وبقيم أكبر:',
    latex: aligned([
      `${lim(xTo(aTex, `,\\; x < ${aTex}`))} f(x) &= ${texOfSide(leftV)}`,
      `${lim(xTo(aTex, `,\\; x > ${aTex}`))} f(x) &= ${texOfSide(rightV)}`
    ])
  });
  const infiniteSame = !Number.isFinite(L) || Math.abs(L) > 1e9;
  if (same) {
    const res = infiniteSame ? (L > 0 ? '+\\infty' : '-\\infty') : valTex(L);
    steps.push({ title: 'الخلاصة', explanation: 'النهايتان متفقتان:', latex: `${lim(xTo(aTex))} f(x) = ${res}` });
    return {
      result: res,
      kind: infiniteSame ? 'infinite' : 'finite',
      steps,
      twoSided: true,
      leftTex: texOfSide(leftV),
      rightTex: texOfSide(rightV),
      asymptoteLatex: infiniteSame ? `\\Delta : x = ${aTex} \\quad \\text{مستقيم مقارب شاقولي للمنحنى } C_{f}` : undefined
    };
  }
  steps.push({ title: 'الخلاصة', explanation: 'النهايتان مختلفتان، فالنهاية غير موجودة (عدم التعيين بالإشارة):', latex: `${lim(xTo(aTex))} f(x) = \\nexists` });
  return { result: '\\nexists', kind: 'dne', steps, twoSided: true, leftTex: texOfSide(leftV), rightTex: texOfSide(rightV), asymptoteLatex: `\\Delta : x = ${aTex} \\quad \\text{مستقيم مقارب شاقولي للمنحنى } C_{f}` };
}

/** position of the curve w.r.t. its horizontal asymptote, by the sign of f(x) − b */
function relativePosition(f: (x: number) => number, b: number, target: number | 'infinity' | '-infinity'): string | undefined {
  const samples = target === '-infinity' ? [-1e4, -1e5, -1e6, -1e7] : [1e4, 1e5, 1e6, 1e7];
  const signs = samples.map((x) => {
    const v = f(x);
    return Number.isFinite(v) ? Math.sign(v - b) : 0;
  }).filter((s) => s !== 0);
  if (!signs.length) return undefined;
  const allPos = signs.every((s) => s > 0);
  const allNeg = signs.every((s) => s < 0);
  const dTex = `d(x) = f(x) - b`;
  if (allPos) return `${dTex} > 0 \\quad \\text{في جوار } \\pm\\infty \\implies \\text{المنحنى } C_{f} \\text{ يقع فوق المقارب } \\Delta`;
  if (allNeg) return `${dTex} < 0 \\quad \\text{في جوار } \\pm\\infty \\implies \\text{المنحنى } C_{f} \\text{ يقع تحت المقارب } \\Delta`;
  return `${dTex} \\text{ يغير الإشارة} \\implies \\text{المنحنى } C_{f} \\text{ يقطع المقارب } \\Delta`;
}

/** tableau de variation in the Syrian exam format */
export function buildVariationTableLatex(expression: string): string | null {
  try {
    const node = math.parse(normalizeExpr(expression));
    const f = (x: number) => Number(node.compile().evaluate({ x }));
    const d = math.simplify(math.derivative(node, 'x'));
    const df = (x: number) => Number(d.compile().evaluate({ x }));
    const roots: number[] = [];
    let prev = df(-9.95);
    for (let x = -9.9; x <= 9.95; x += 0.05) {
      const cur = df(x);
      if (Number.isFinite(prev) && Number.isFinite(cur) && prev * cur <= 0 && prev !== cur) {
        let lo = x - 0.05;
        let hi = x;
        for (let i = 0; i < 40; i++) {
          const mid = (lo + hi) / 2;
          const vm = df(mid);
          if (!Number.isFinite(vm)) break;
          if (df(lo) * vm <= 0) hi = mid;
          else lo = mid;
        }
        const r = Number(((lo + hi) / 2).toFixed(3));
        if (!roots.some((q) => Math.abs(q - r) < 0.05) && Math.abs(r) < 9.9) roots.push(r);
      }
      prev = cur;
    }
    const breaks: number[] = [];
    for (let x = -9.95; x <= 9.95; x += 0.05) {
      const okHere = Number.isFinite(f(x));
      const okNext = Number.isFinite(f(x + 0.05));
      if (okHere !== okNext && !breaks.some((b) => Math.abs(b - x) < 0.2)) breaks.push(Number(x.toFixed(2)));
    }
    const keys = [...new Set([...roots, ...breaks])].sort((a, b) => a - b);
    const cols = [-Infinity, ...keys, Infinity];
    const rowX = cols.map((c) => (c === -Infinity ? '-\\infty' : c === Infinity ? '+\\infty' : valTex(c)));
    const signRow: string[] = [];
    const fRow: string[] = [];
    for (let i = 0; i < cols.length - 1; i++) {
      const mid = (Number.isFinite(cols[i]) ? cols[i] : cols[i + 1] - 3) + ((Number.isFinite(cols[i + 1]) ? cols[i + 1] : cols[i] + 3) - ((Number.isFinite(cols[i]) ? cols[i] : cols[i + 1] - 3))) / 2;
      const s = df(mid);
      signRow.push(Number.isFinite(s) ? (s > 0 ? '+' : '-') : '\\text{—}');
      fRow.push(Number.isFinite(s) ? (s > 0 ? '\\nearrow' : '\\searrow') : '');
    }
    const cellX = rowX.join(' & ');
    const cellS = [' ', ...signRow.map((s, i) => `${s}${i < signRow.length - 1 ? ' & \\big|\\big| &' : ''}`).join(' '), ' '].join(' ');
    const valueAt = (c: number, side: 'left' | 'right') => {
      if (!Number.isFinite(c)) {
        const lim = syrianLimit(expression, side === 'left' ? '-infinity' : 'infinity');
        return lim ? lim.result : '\\pm\\infty';
      }
      const probe = f(c + (side === 'left' ? -1e-4 : 1e-4));
      return Number.isFinite(probe) ? valTex(probe) : '\\pm\\infty';
    };
    const fCells: string[] = [];
    for (let i = 0; i < cols.length; i++) {
      if (i === 0) fCells.push(valueAt(cols[0], 'right'));
      else if (i === cols.length - 1) fCells.push(valueAt(cols[i], 'left'));
      else {
        const v = Number.isFinite(cols[i]) ? f(cols[i]) : NaN;
        fCells.push(Number.isFinite(v) ? `\\underset{${breaks.includes(cols[i]) ? '' : ''}}{${valTex(v)}}` : '\\text{—}');
      }
    }
    const n = cols.length;
    const spec = `{${'|c'.repeat(n)}|}`;
    return `\\begin{array}${spec}
 \\hline
 \\text{${'x'}} & ${cellX} \\\\ \\hline
 f'(x) & ${cellS} \\\\ \\hline
 f(x) & ${fCells.map((c, i) => (i > 0 && i < n - 1 ? `${c.replace(/^/, '')}` : c)).join(' & ')} \\\\ \\hline
\\end{array}`;
  } catch {
    return null;
  }
}

export function computeLimit(expression: string, targetX: number | 'infinity' | '-infinity', useLHopital = false): CalculusSolution {
  const syllabus = (() => {
    try {
      return syrianLimit(expression, targetX);
    } catch {
      return null;
    }
  })();

  const targetLatex = targetX === 'infinity' ? '+\\infty' : targetX === '-infinity' ? '-\\infty' : tex(targetX as number);
  const usable = !!syllabus && typeof syllabus.result === 'string' && syllabus.result.length > 0 && syllabus.steps.length > 0;

  if (useLHopital) {
    const hop = computeLimitLegacy(expression, targetX, true);
    const warnStep = {
      title: 'تنبيه منهجي مهم',
      explanation: 'قاعدة لوبيتال غير واردة في كتاب المنهاج السوري الحديث؛ اعتمدها للتحقق الشخصي فقط، وأثبت في الامتحان بالنهايات الشهيرة أو بالتحليل والاختزال.',
      latex: '\\text{للتحقق فقط} \\quad \\left(\\text{غير مقرر}\right)'
    };
    return {
      mode: 'limits',
      functionLatex: hop.functionLatex,
      methodUsed: 'النهايات الشهيرة + تحقق بقاعدة لوبيتال',
      limitValue: usable
        ? {
            target: String(targetX),
            result: syllabus!.result,
            kind: syllabus!.kind,
            targetLatex,
            twoSided: syllabus!.twoSided,
            leftLatex: syllabus!.leftTex,
            rightLatex: syllabus!.rightTex,
            asymptoteLatex: syllabus!.asymptoteLatex,
            positionLatex: syllabus!.positionLatex
          }
        : { ...hop.limitValue!, targetLatex },
      steps: [...(usable ? syllabus!.steps : []), warnStep, ...hop.steps]
    };
  }

  if (usable) {
    const s = syllabus!;
    return {
      mode: 'limits',
      functionLatex: texOf(math.parse(normalizeExpr(expression))),
      methodUsed: 'منهجية المنهاج السوري: اتصال، تحليل واختزال، نهايات شهيرة، تزايد مقارن',
      limitValue: {
        target: String(targetX),
        result: s.result,
        kind: s.kind,
        targetLatex: targetX === 'infinity' ? '+\\infty' : targetX === '-infinity' ? '-\\infty' : tex(targetX as number),
        twoSided: s.twoSided,
        leftLatex: s.leftTex,
        rightLatex: s.rightTex,
        asymptoteLatex: s.asymptoteLatex,
        positionLatex: s.positionLatex,
        note: s.twoSided ? 'الصياغة المعتمدة: بقيم أصغر وبقيم أكبر بدل الرموز الجاهزة.' : 'التعليل مبنٍ على مبرهنات المنهاج.'
      },
      steps: s.steps
    };
  }

  const fallback = computeLimitLegacy(expression, targetX, false);
  return {
    ...fallback,
    methodUsed: 'حساب دقيق بالقيم + تحقق رمزي',
    steps: [
      {
        title: 'ملاحظة منهجية',
        explanation: 'لم تكفِ القوالب الجاهزة (التحليل، الاختزال، النهايات الشهيرة) لحسم الشكل؛ اعتمد المحرك التقريب الدقيق مع دراسة الطرفين. أعد صياغة العبارة لتظهر النهاية الشهيرة بوضوح.',
        latex: '\\text{استعن بالمبرهنات: } \\lim_{u \\to 0}\\frac{\\sin u}{u}=1 , \\ \\lim_{u \\to 0}\\frac{1-\\cos u}{u^{2}}=\\frac{1}{2}'
      },
      ...fallback.steps
    ]
  };
}


