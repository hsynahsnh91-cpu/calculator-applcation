import { create, all } from 'mathjs';
import { AngleMode } from '../../../types/index.js';

// Fast instance: plain 64-bit numbers.
// BigNumber with precision 64 is very slow inside a phone WebView,
// and the extra precision is invisible in the results we display.
const math = create(all, { number: 'number' });

// Configure angle mode wrapper
export function evaluateMathExpression(expr: string, angleMode: AngleMode = 'DEG'): {
  result: any;
  decimalStr: string;
  fractionStr: string | null;
  latexStr: string;
  steps: string[];
} {
  const steps: string[] = [];
  try {
    if (!expr || expr.trim() === '') {
      return { result: 0, decimalStr: '0', fractionStr: null, latexStr: '0', steps: [] };
    }

    // Preprocess expression
    if (expr.includes('□')) throw new Error('أكمل الخانات الرياضية الفارغة قبل الحساب.');
    let cleaned = expr
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/π/g, 'pi')
      .replace(/Ans/g, '0')
      .replace(/%/g, '/100');

    // NOTE: angle conversion (DEG / GRAD) is already applied by nodesToMathjs.
    // Applying it again here produced wrong values (e.g. sin(30)), so it is not repeated.
    void angleMode;

    steps.push(`العبارة المدخلة: $${expr}$`);

    const evaluated = math.evaluate(cleaned, {
      deg: Math.PI / 180,
      i: math.complex(0, 1)
    });

    let decimalStr = '';
    let fractionStr: string | null = null;
    let latexStr = '';

    if (evaluated && typeof evaluated === 'object' && 'isComplex' in evaluated) {
      // Complex number
      const re = Number(evaluated.re.toFixed(8));
      const im = Number(evaluated.im.toFixed(8));
      decimalStr = `${re} ${im < 0 ? '-' : '+'} ${Math.abs(im)}i`;
      latexStr = decimalStr;
      steps.push(`العدد المركب الناتج: $${latexStr}$`);
    } else if (typeof evaluated === 'number' || (evaluated && evaluated.isBigNumber)) {
      let num = Number(evaluated);
      if (isNaN(num)) {
        throw new Error('قيمة غير معرّفة (Undefined / NaN)');
      }
      // tan(90°) etc. : floating point gives ~1.6e16 instead of an undefined value
      if (Math.abs(num) > 1e15 && /\b(tan|sec|csc|cot)\(/.test(cleaned)) {
        throw new Error('قيمة غير معرّفة رياضياً (مثل tan 90°)');
      }
      // snap floating noise: 0.49999999999999994 → 0.5 , 1.0000000000000002 → 1
      if (Math.abs(num - Math.round(num)) < 1e-10) num = Math.round(num);
      if (!isFinite(num)) {
        return { result: num, decimalStr: num > 0 ? '+∞' : '-∞', fractionStr: null, latexStr: num > 0 ? '+\\infty' : '-\\infty', steps: ['النتيجة تؤول إلى اللانهاية'] };
      }

      // Format decimal
      if (Math.abs(num) < 1e-12) {
        decimalStr = '0';
      } else if (Math.abs(num) >= 1e12 || Math.abs(num) <= 1e-6) {
        decimalStr = num.toExponential(8).replace('e+', ' × 10^').replace('e-', ' × 10^-');
      } else {
        decimalStr = Number(num.toFixed(10)).toString();
      }

      // Exact form: small rational → surd (√2/2, √3/2, (√6−√2)/4 …) → multiple of π → general fraction
      const exact = recognizeExact(num);
      if (exact) {
        fractionStr = exact.plain;
        latexStr = exact.latex;
      } else {
        fractionStr = decimalToFraction(num);
        latexStr = fractionStr ? fractionToLatex(fractionStr) : decimalStr;
      }
      if (Number.isInteger(num)) {
        fractionStr = null;
        latexStr = String(num);
      }
      
      steps.push(`النتيجة العددية: $${decimalStr}$`);
      if (fractionStr && !fractionStr.startsWith('0') && !fractionStr.includes('.')) {
        steps.push(`الشكل الكسري المضبوط: $${latexStr}$`);
      }
    } else {
      decimalStr = String(evaluated);
      latexStr = String(evaluated);
    }

    // Clean any raw "pi" into \pi for latex and π for display
    latexStr = latexStr.replace(/(?<![\\a-zA-Z])(?:pi|PI|Pi)(?![a-zA-Z])/g, '\\pi');
    decimalStr = decimalStr.replace(/(?<![\\a-zA-Z])(?:pi|PI|Pi)(?![a-zA-Z])/g, 'π');
    if (fractionStr) {
      fractionStr = fractionStr.replace(/(?<![\\a-zA-Z])(?:pi|PI|Pi)(?![a-zA-Z])/g, 'π');
    }

    return {
      result: evaluated,
      decimalStr,
      fractionStr,
      latexStr,
      steps
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '';
    if (/[\u0600-\u06ff]/.test(message)) throw new Error(message);
    if (/undefined symbol|undefined function/i.test(message)) throw new Error('رمز أو دالة غير معرّفة. تحقق من العبارة الرياضية.');
    if (/factorial/i.test(message)) throw new Error('العاملي معرّف للأعداد الصحيحة غير السالبة فقط.');
    throw new Error('خطأ في الصيغة الحسابية. تحقق من الأعداد والعمليات وأكمل الخانات الرياضية.');
  }
}

// ---------- exact value recognition for famous trig / surd values ----------
function smallRational(r: number, maxDen = 24, tol = 1e-11): [number, number] | null {
  for (let q = 1; q <= maxDen; q++) {
    const p = Math.round(r * q);
    if (Math.abs(p / q - r) < tol * Math.max(1, Math.abs(r))) {
      let a = Math.abs(p), b = q;
      while (b) [a, b] = [b, a % b];
      const g = a || 1;
      return [p / g, q / g];
    }
  }
  return null;
}

function fracTex(p: number, q: number, inner = ''): { latex: string; plain: string } {
  const sign = p < 0 ? '-' : '';
  const ap = Math.abs(p);
  const numL = inner ? (ap === 1 ? inner : `${ap}${inner}`) : String(ap);
  const numP = inner ? (ap === 1 ? inner : `${ap}${inner}`) : String(ap);
  if (q === 1) return { latex: `${sign}${numL}`, plain: `${sign}${numP}` };
  return { latex: `${sign}\\dfrac{${numL}}{${q}}`, plain: `${sign}${numP}/${q}` };
}

export function recognizeExact(x: number): { latex: string; plain: string } | null {
  if (!isFinite(x) || Number.isInteger(x)) return null;

  // 1) simple rational  (sin30 = 1/2, cos60 = 1/2 …)
  const r = smallRational(x);
  if (r) return fracTex(r[0], r[1]);

  // 2) rational multiple of a single square root (√2/2, √3/2, √3/3, √3 …)
  for (const k of [2, 3, 5, 6, 7, 10, 11, 13, 15]) {
    const s = smallRational(x / Math.sqrt(k));
    if (s) {
      const t = fracTex(s[0], s[1], `\\sqrt{${k}}`);
      return { latex: t.latex, plain: t.plain.replace(`\\sqrt{${k}}`, `√${k}`) };
    }
  }

  // 3) famous compound surds (15°, 75°, 18°, 36°, 22.5° …)
  const special: [number, string, string][] = [
    [(Math.sqrt(6) - Math.sqrt(2)) / 4, '\\dfrac{\\sqrt{6} - \\sqrt{2}}{4}', '(√6 − √2)/4'],
    [(Math.sqrt(6) + Math.sqrt(2)) / 4, '\\dfrac{\\sqrt{6} + \\sqrt{2}}{4}', '(√6 + √2)/4'],
    [2 - Math.sqrt(3), '2 - \\sqrt{3}', '2 − √3'],
    [2 + Math.sqrt(3), '2 + \\sqrt{3}', '2 + √3'],
    [Math.sqrt(2) - 1, '\\sqrt{2} - 1', '√2 − 1'],
    [Math.sqrt(2) + 1, '\\sqrt{2} + 1', '√2 + 1'],
    [(Math.sqrt(5) - 1) / 4, '\\dfrac{\\sqrt{5} - 1}{4}', '(√5 − 1)/4'],
    [(Math.sqrt(5) + 1) / 4, '\\dfrac{\\sqrt{5} + 1}{4}', '(√5 + 1)/4'],
    [Math.sqrt(2 - Math.sqrt(2)) / 2, '\\dfrac{\\sqrt{2 - \\sqrt{2}}}{2}', '√(2 − √2)/2'],
    [Math.sqrt(2 + Math.sqrt(2)) / 2, '\\dfrac{\\sqrt{2 + \\sqrt{2}}}{2}', '√(2 + √2)/2'],
    [Math.sqrt(6) - Math.sqrt(2), '\\sqrt{6} - \\sqrt{2}', '√6 − √2'],
    [Math.sqrt(6) + Math.sqrt(2), '\\sqrt{6} + \\sqrt{2}', '√6 + √2']
  ];
  for (const [v, l, p] of special) {
    if (Math.abs(Math.abs(x) - v) < 1e-11) {
      return x < 0 ? { latex: `-\\left(${l}\\right)`, plain: `−(${p})` } : { latex: l, plain: p };
    }
  }

  // 4) rational multiple of π (arcsin(1/2) = π/6 in RAD …)
  const pr = smallRational(x / Math.PI, 12);
  if (pr) {
    const t = fracTex(pr[0], pr[1], '\\pi');
    return { latex: t.latex, plain: t.plain.replace('\\pi', 'π') };
  }
  return null;
}

// Decimal to exact Fraction algorithm (Farey / Continued Fractions)
export function decimalToFraction(val: number, maxDenominator: number = 100000): string | null {
  if (Math.abs(val) < 1e-12) return '0';
  if (Number.isInteger(val)) return val.toString();

  const sign = val < 0 ? -1 : 1;
  val = Math.abs(val);

  let h1 = 1, h2 = 0;
  let k1 = 0, k2 = 1;
  let b = val;

  do {
    const a = Math.floor(b);
    let aux = h1;
    h1 = a * h1 + h2;
    h2 = aux;
    aux = k1;
    k1 = a * k1 + k2;
    k2 = aux;
    b = 1 / (b - a);
  } while (Math.abs(val - h1 / k1) > val * 1e-9 && k1 <= maxDenominator && isFinite(b));

  if (k1 <= maxDenominator && k1 > 1) {
    const numerator = sign * h1;
    const denominator = k1;
    return `${numerator}/${denominator}`;
  }

  return null;
}

export function fractionToLatex(fracStr: string): string {
  if (fracStr.includes('/')) {
    const [num, den] = fracStr.split('/');
    const sign = Number(num) < 0 ? '-' : '';
    const absNum = Math.abs(Number(num));
    return `${sign}\\frac{${absNum}}{${den}}`;
  }
  return fracStr;
}

export function baseNConvert(value: number, base: 'BIN' | 'OCT' | 'DEC' | 'HEX'): string {
  const intVal = Math.floor(value);
  if (base === 'BIN') return intVal.toString(2);
  if (base === 'OCT') return intVal.toString(8);
  if (base === 'HEX') return intVal.toString(16).toUpperCase();
  return intVal.toString(10);
}

export { SCIENTIFIC_CONSTANTS } from '../../../app/content/constants.js';
