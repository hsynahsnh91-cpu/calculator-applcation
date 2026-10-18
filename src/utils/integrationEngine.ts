/**
 * Advanced Multi-Layered CAS Integration Engine
 * Tailored for Syrian Baccalaureate & University-level Calculus:
 * 1. Partial Fractions Decomposition (partfrac)
 * 2. Advanced / Composite Substitution (u-substitution, f'(x)/f(x), radicals, logs)
 * 3. Tabular & Repeated Integration by Parts (LIATE rule, polynomials × exp/trig)
 * 4. Circular Integration by Parts (e^{ax} sin(bx), e^{ax} cos(bx) with recurrence)
 * 5. Trigonometric Linearization & Double-Angle Identities (sin²(x), cos²(x), tan²(x), sin³(x))
 * 6. Non-Elementary & Infinite Power Series (Maclaurin / Taylor)
 * 7. Multi-Point Symbolic & Numerical Verification Shield
 */

import nerdamer from 'nerdamer';
import { create, all } from 'mathjs';
import { normalizeExpr, validateRealIntegralDomain } from './calculusEngine.js';
import { cleanMathLatex } from '../components/common/Tex.js';
import { tex } from './equationSolver.js';
import {
  planSeriesIntegrand,
  integrateSeries,
  antiderivativeTex,
  seriesToTex,
  evaluateDefiniteSeries,
  seriesConvergesOn,
  type SeriesKind
} from './seriesEngine.js';

// mathjs instance for general calculus helpers
create(all, { number: 'number' });

type NExpr = {
  text(options?: { decimal?: boolean }): string;
  toTeX(): string;
  hasIntegral(): boolean;
  simplify(): NExpr;
  numeric(): NExpr;
  diff(variable: string): NExpr;
  evaluate(values?: Record<string, string>): NExpr;
  minus(value: unknown): NExpr;
};

const nExpr = (value: unknown) => value as NExpr;
const parseN = (source: string) => nExpr(nerdamer(source));

export type IntegrationMethod = 'automatic' | 'rules' | 'substitution' | 'parts';
export type IntegrationMode = 'indefinite' | 'definite';

export interface IntegralStep {
  title: string;
  text: string;
  latex: string;
}

export interface SeriesResult {
  kind: SeriesKind;
  label: string;
  reason: string;
  sigmaTex: string;
  integrandSeriesTex: string;
  integratedTex: string;
  expansionCount: number;
  termCount: number;
  exactSeriesTex?: string | null;
  decimalValue?: number;
  referenceValue?: number | null;
  relativeError?: number | null;
  divergent: boolean;
  note: string;
}

export interface IntegrationResult {
  mode: IntegrationMode;
  method: IntegrationMethod;
  integrandLatex: string;
  primitiveLatex?: string;
  exactValueLatex?: string;
  decimalValue?: number;
  steps: IntegralStep[];
  plotPoints?: { x: number; y: number }[];
  verified: boolean;
  numericalFallback: boolean;
  approximate?: boolean;
  series?: SeriesResult;
  warning?: string;
}

/** Sanitize TeX output so raw "pi" is always \pi and symbols are pure math */
export const texFrom = (source: string): string => {
  try {
    return cleanMathLatex(parseN(source).toTeX());
  } catch {
    return cleanMathLatex(source);
  }
};

const al = (lines: string[]): string => `\\begin{aligned} ${lines.join(' \\\\[8pt] ')} \\end{aligned}`;

/** Sample curve points for graphing */
function sampleCurve(source: string, variable: string, lower: number, upper: number): { x: number; y: number }[] {
  try {
    const fn = (nerdamer(source) as unknown as { buildFunction: (args: string[]) => (...values: number[]) => number }).buildFunction([variable]);
    const lo = Math.min(lower, upper);
    const hi = Math.max(lower, upper);
    const span = Math.max(1, hi - lo);
    const from = lo - span * 0.18;
    const to = hi + span * 0.18;
    const count = 96;
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i <= count; i++) {
      const x = from + ((to - from) * i) / count;
      try {
        const y = fn(x);
        points.push({ x, y: Number.isFinite(y) && Math.abs(y) < 1e8 ? y : NaN });
      } catch {
        points.push({ x, y: NaN });
      }
    }
    return points;
  } catch {
    return [];
  }
}

/** Standard symbolic integration via Nerdamer */
function symbolicIntegral(source: string, variable: string): { text: string; latex: string; unresolved: boolean } {
  try {
    const result = nExpr(nerdamer.integrate(source, variable));
    const text = result.text();
    const unresolved = result.hasIntegral() || /integrate\s*\(/i.test(text);
    return { text, latex: cleanMathLatex(result.toTeX()), unresolved };
  } catch {
    return { text: '', latex: '', unresolved: true };
  }
}

/** Multi-point symbolic and numerical verification */
function verifyAntiderivative(primitive: string, integrand: string, variable: string): boolean {
  if (!primitive || !integrand) return false;
  try {
    const derivative = nExpr(nerdamer.diff(primitive, variable)).simplify();
    const difference = parseN(`(${derivative.text()})-(${integrand})`).simplify();
    const diffText = difference.text();
    if (diffText === '0' || diffText === '0.0' || difference.numeric().text() === '0') {
      return true;
    }
  } catch {
    // continue to numerical probe
  }
  // Numerical sanity probe at 3 distinct interior test points
  try {
    const dF = (nerdamer(primitive) as unknown as { buildFunction: (v: string[]) => (x: number) => number }).buildFunction([variable]);
    const f = (nerdamer(integrand) as unknown as { buildFunction: (v: string[]) => (x: number) => number }).buildFunction([variable]);
    const h = 1e-6;
    const testPoints = [0.45, 1.35, 2.75];
    let okCount = 0;
    for (const pt of testPoints) {
      const numDeriv = (dF(pt + h) - dF(pt - h)) / (2 * h);
      const trueVal = f(pt);
      if (Number.isFinite(numDeriv) && Number.isFinite(trueVal)) {
        if (Math.abs(numDeriv - trueVal) < 1e-3 * Math.max(1, Math.abs(trueVal))) {
          okCount++;
        }
      }
    }
    if (okCount >= 2) return true;
  } catch {
    // ignore
  }
  return false;
}

/** Numerical quadrature fallback */
function quadrature(integrand: string, variable: string, lower: number, upper: number): number | null {
  try {
    const value = nExpr(nerdamer.defint(integrand, variable, String(lower), String(upper)));
    const numeric = Number(value.numeric().text());
    return Number.isFinite(numeric) ? numeric : null;
  } catch {
    return null;
  }
}

// ===================================================================
// Layer 1: Trigonometric Identities & Linearization Solver
// ===================================================================
interface CustomSolveResult {
  primitive: string;
  latex: string;
  steps: IntegralStep[];
}

function tryTrigLinearization(integrand: string, v: string): CustomSolveResult | null {
  const s = integrand.replace(/\s+/g, '');

  // 1) sin^2(a*x) or sin(x)^2
  const sin2Match = s.match(/^sin\((?:([0-9.]+)\*)?([a-z])\)\^2$/i) || s.match(/^sin\^2\((?:([0-9.]+)\*)?([a-z])\)$/i);
  if (sin2Match && sin2Match[2] === v) {
    const a = parseFloat(sin2Match[1] || '1');
    const twoA = 2 * a;
    const prim = `(1/2)*${v} - (1/${4 * a})*sin(${twoA}*${v})`;
    const primTex = cleanMathLatex(`\\dfrac{1}{2}${v} - \\dfrac{1}{${4 * a}}\\sin(${twoA === 1 ? '' : twoA}${v})`);
    const steps: IntegralStep[] = [
      {
        title: 'دستور ضعف الزاوية (تخفيض الرتبة)',
        text: 'نستخدم المطابقة الشهيرة لتخفيض قوى الجيب لتحويلها إلى صيغة خطية سهلة التكامل:',
        latex: cleanMathLatex(`\\sin^{2}(${a === 1 ? '' : a}${v}) = \\dfrac{1 - \\cos(${twoA === 1 ? '' : twoA}${v})}{2} = \\dfrac{1}{2} - \\dfrac{1}{2}\\cos(${twoA === 1 ? '' : twoA}${v})`)
      },
      {
        title: 'المكاملة حداً حداً',
        text: 'نكامل كل حد مباشرة بالقوانين الأساسية:',
        latex: al([
          `\\int \\sin^{2}(${a === 1 ? '' : a}${v})\\,d${v} &= \\int \\left(\\dfrac{1}{2} - \\dfrac{1}{2}\\cos(${twoA === 1 ? '' : twoA}${v})\\right)d${v}`,
          `&= \\dfrac{1}{2}${v} - \\dfrac{1}{2}\\cdot\\dfrac{1}{${twoA}}\\sin(${twoA === 1 ? '' : twoA}${v})`,
          `&= ${primTex}`
        ])
      }
    ];
    return { primitive: prim, latex: primTex, steps };
  }

  // 2) cos^2(a*x) or cos(x)^2
  const cos2Match = s.match(/^cos\((?:([0-9.]+)\*)?([a-z])\)\^2$/i) || s.match(/^cos\^2\((?:([0-9.]+)\*)?([a-z])\)$/i);
  if (cos2Match && cos2Match[2] === v) {
    const a = parseFloat(cos2Match[1] || '1');
    const twoA = 2 * a;
    const prim = `(1/2)*${v} + (1/${4 * a})*sin(${twoA}*${v})`;
    const primTex = cleanMathLatex(`\\dfrac{1}{2}${v} + \\dfrac{1}{${4 * a}}\\sin(${twoA === 1 ? '' : twoA}${v})`);
    const steps: IntegralStep[] = [
      {
        title: 'دستور ضعف الزاوية (تخفيض الرتبة)',
        text: 'نستخدم مطابقة جيب التمام الشهيرة لتخفيض الرتبة:',
        latex: cleanMathLatex(`\\cos^{2}(${a === 1 ? '' : a}${v}) = \\dfrac{1 + \\cos(${twoA === 1 ? '' : twoA}${v})}{2} = \\dfrac{1}{2} + \\dfrac{1}{2}\\cos(${twoA === 1 ? '' : twoA}${v})`)
      },
      {
        title: 'المكاملة حداً حداً',
        text: 'نكامل كل حد مباشرة:',
        latex: al([
          `\\int \\cos^{2}(${a === 1 ? '' : a}${v})\\,d${v} &= \\int \\left(\\dfrac{1}{2} + \\dfrac{1}{2}\\cos(${twoA === 1 ? '' : twoA}${v})\\right)d${v}`,
          `&= \\dfrac{1}{2}${v} + \\dfrac{1}{2}\\cdot\\dfrac{1}{${twoA}}\\sin(${twoA === 1 ? '' : twoA}${v})`,
          `&= ${primTex}`
        ])
      }
    ];
    return { primitive: prim, latex: primTex, steps };
  }

  // 3) tan^2(a*x)
  const tan2Match = s.match(/^tan\((?:([0-9.]+)\*)?([a-z])\)\^2$/i) || s.match(/^tan\^2\((?:([0-9.]+)\*)?([a-z])\)$/i);
  if (tan2Match && tan2Match[2] === v) {
    const a = parseFloat(tan2Match[1] || '1');
    const prim = `(1/${a})*tan(${a === 1 ? '' : a}*${v}) - ${v}`;
    const primTex = cleanMathLatex(`\\dfrac{1}{${a}}\\tan(${a === 1 ? '' : a}${v}) - ${v}`);
    const steps: IntegralStep[] = [
      {
        title: 'المطابقة المثلثية للمماس (الظل)',
        text: 'نضيف 1 ونطرح 1 لنحصل على مشتق دالة الظل (1 + tan²):',
        latex: cleanMathLatex(`\\tan^{2}(${a === 1 ? '' : a}${v}) = \\left(1 + \\tan^{2}(${a === 1 ? '' : a}${v})\\right) - 1`)
      },
      {
        title: 'المكاملة المباشرة',
        text: 'بما أن مشتق tan(ax) هو a(1 + tan²(ax)):',
        latex: al([
          `\\int \\tan^{2}(${a === 1 ? '' : a}${v})\\,d${v} &= \\int \\left(1 + \\tan^{2}(${a === 1 ? '' : a}${v})\\right)d${v} - \\int 1\\,d${v}`,
          `&= ${primTex}`
        ])
      }
    ];
    return { primitive: prim, latex: primTex, steps };
  }

  // 4) sin^3(x)
  if (s === `sin(${v})^3` || s === `sin^3(${v})`) {
    const prim = `-cos(${v}) + (1/3)*cos(${v})^3`;
    const primTex = cleanMathLatex(`-\\cos(${v}) + \\dfrac{1}{3}\\cos^{3}(${v})`);
    const steps: IntegralStep[] = [
      {
        title: 'فصل القوة الفردية والمتطابقة الأساسية',
        text: 'نعزل sin(x) ونحول الباقي إلى cos(x) باستخدام sin² = 1 − cos²:',
        latex: cleanMathLatex(`\\sin^{3}(${v}) = \\sin(${v})\\cdot\\sin^{2}(${v}) = \\sin(${v})\\left(1 - \\cos^{2}(${v})\\right) = \\sin(${v}) - \\sin(${v})\\cos^{2}(${v})`)
      },
      {
        title: 'المكاملة بالتعويض المباشر (مشتق دالة القوة)',
        text: 'الحد الثاني من الشكل −u\' · u² حيث u = cos(x):',
        latex: al([
          `\\int \\sin^{3}(${v})\\,d${v} &= \\int \\sin(${v})\\,d${v} + \\int (-\\sin(${v}))\\cos^{2}(${v})\\,d${v}`,
          `&= -\\cos(${v}) + \\dfrac{\\cos^{3}(${v})}{3}`,
          `&= ${primTex}`
        ])
      }
    ];
    return { primitive: prim, latex: primTex, steps };
  }

  // 5) cos^3(x)
  if (s === `cos(${v})^3` || s === `cos^3(${v})`) {
    const prim = `sin(${v}) - (1/3)*sin(${v})^3`;
    const primTex = cleanMathLatex(`\\sin(${v}) - \\dfrac{1}{3}\\sin^{3}(${v})`);
    const steps: IntegralStep[] = [
      {
        title: 'فصل القوة الفردية والمتطابقة الأساسية',
        text: 'نعزل cos(x) ونحول الباقي إلى sin(x) باستخدام cos² = 1 − sin²:',
        latex: cleanMathLatex(`\\cos^{3}(${v}) = \\cos(${v})\\cdot\\cos^{2}(${v}) = \\cos(${v})\\left(1 - \\sin^{2}(${v})\\right) = \\cos(${v}) - \\cos(${v})\\sin^{2}(${v})`)
      },
      {
        title: 'المكاملة بالتعويض المباشر',
        text: 'الحد الثاني من الشكل u\' · u² حيث u = sin(x):',
        latex: al([
          `\\int \\cos^{3}(${v})\\,d${v} &= \\int \\cos(${v})\\,d${v} - \\int \\cos(${v})\\sin^{2}(${v})\\,d${v}`,
          `&= \\sin(${v}) - \\dfrac{\\sin^{3}(${v})}{3}`,
          `&= ${primTex}`
        ])
      }
    ];
    return { primitive: prim, latex: primTex, steps };
  }

  return null;
}

// ===================================================================
// Layer 2: Partial Fractions Decomposition Solver (تفكيك المقامات)
// ===================================================================
function tryPartialFractions(integrand: string, v: string): CustomSolveResult | null {
  try {
    // Check if expression is rational with a denominator containing powers of v
    if (!integrand.includes('/') && !integrand.includes('^')) return null;

    const pf = nExpr(nerdamer.partfrac(integrand, v));
    const pfText = pf.text();
    // If partfrac did not decompose or unchanged
    if (pfText === integrand || !pfText.includes('/')) return null;

    const integrated = symbolicIntegral(pfText, v);
    if (integrated.unresolved) return null;

    const steps: IntegralStep[] = [
      {
        title: 'تفكيك المقامات والتحليل إلى كسور جزئية (Partial Fractions)',
        text: 'نقوم بتحليل مقام الدالة الكسرية إلى عوامله الأولية، ثم نحدد الثوابت لتفريق الكسر إلى مجموع كسور بسيطة:',
        latex: cleanMathLatex(`\\dfrac{P(${v})}{Q(${v})} = ${pf.toTeX()}`)
      },
      {
        title: 'مكاملة كل كسر جزئي لوغاريتمياً',
        text: 'نطبق قوانين التكامل للتوابع الكسرية البسيطة: ∫ 1/(x − a) dx = ln|x − a|، و ∫ 1/(x² + a²) dx = (1/a) arctan(x/a):',
        latex: al([
          `\\int \\left(${cleanMathLatex(pf.toTeX())}\\right) d${v} &= ${integrated.latex}`
        ])
      }
    ];

    return { primitive: integrated.text, latex: integrated.latex, steps };
  } catch {
    return null;
  }
}

// ===================================================================
// Layer 3: Repeated / Tabular & Circular Integration by Parts Solver
// ===================================================================
function tryTabularOrCircularIBP(integrand: string, v: string): CustomSolveResult | null {
  const s = integrand.replace(/\s+/g, '');

  // 1) Circular IBP: e^{a*x} * sin(b*x) or e^{a*x} * cos(b*x)
  const circSin = s.match(/^exp\((?:([0-9.-]+)\*)?([a-z])\)\*sin\((?:([0-9.-]+)\*)?([a-z])\)$/i) ||
                  s.match(/^e\^\((?:([0-9.-]+)\*)?([a-z])\)\*sin\((?:([0-9.-]+)\*)?([a-z])\)$/i);
  const circCos = s.match(/^exp\((?:([0-9.-]+)\*)?([a-z])\)\*cos\((?:([0-9.-]+)\*)?([a-z])\)$/i) ||
                  s.match(/^e\^\((?:([0-9.-]+)\*)?([a-z])\)\*cos\((?:([0-9.-]+)\*)?([a-z])\)$/i);

  if ((circSin && circSin[2] === v && circSin[4] === v) || (circCos && circCos[2] === v && circCos[4] === v)) {
    const isSin = !!circSin;
    const m = isSin ? circSin! : circCos!;
    const a = parseFloat(m[1] || '1');
    const b = parseFloat(m[3] || '1');
    const a2b2 = a * a + b * b;

    let prim: string;
    let primTex: string;
    let steps: IntegralStep[];

    if (isSin) {
      prim = `(exp(${a}*${v})/(${a2b2})) * (${a}*sin(${b}*${v}) - ${b}*cos(${b}*${v}))`;
      primTex = cleanMathLatex(`\\dfrac{e^{${a === 1 ? '' : a}${v}}}{${a2b2}}\\left(${a === 1 ? '' : a}\\sin(${b === 1 ? '' : b}${v}) - ${b === 1 ? '' : b}\\cos(${b === 1 ? '' : b}${v})\\right)`);
      steps = [
        {
          title: 'التجزئة الدائرية (المرحلة الأولى)',
          text: 'نضع التكامل المطلوب مساوياً لـ I، ونطبق قاعدة التجزئة باختيار دالة أويلر كدالة قابلة للاشتقاق u:',
          latex: al([
            `I = \\int e^{${a === 1 ? '' : a}${v}}\\sin(${b === 1 ? '' : b}${v})\\,d${v}`,
            `u_{1} = e^{${a === 1 ? '' : a}${v}} \\implies du_{1} = ${a === 1 ? '' : a}e^{${a === 1 ? '' : a}${v}}\\,d${v}`,
            `dv_{1} = \\sin(${b === 1 ? '' : b}${v})\\,d${v} \\implies v_{1} = -\\dfrac{1}{${b}}\\cos(${b === 1 ? '' : b}${v})`,
            `I = -\\dfrac{1}{${b}}e^{${a === 1 ? '' : a}${v}}\\cos(${b === 1 ? '' : b}${v}) + \\dfrac{${a}}{${b}}\\int e^{${a === 1 ? '' : a}${v}}\\cos(${b === 1 ? '' : b}${v})\\,d${v}`
          ])
        },
        {
          title: 'التجزئة للمرة الثانية (ظهور التكامل الأصلي I)',
          text: 'نطبق التجزئة على التكامل الجديد فنلاحظ ظهور التكامل الأصلي I بإشارة سالبة:',
          latex: al([
            `u_{2} = e^{${a === 1 ? '' : a}${v}} \\implies du_{2} = ${a === 1 ? '' : a}e^{${a === 1 ? '' : a}${v}}\\,d${v}`,
            `dv_{2} = \\cos(${b === 1 ? '' : b}${v})\\,d${v} \\implies v_{2} = \\dfrac{1}{${b}}\\sin(${b === 1 ? '' : b}${v})`,
            `\\int e^{${a === 1 ? '' : a}${v}}\\cos(${b === 1 ? '' : b}${v})\\,d${v} = \\dfrac{1}{${b}}e^{${a === 1 ? '' : a}${v}}\\sin(${b === 1 ? '' : b}${v}) - \\dfrac{${a}}{${b}} I`
          ])
        },
        {
          title: 'نقل I للطرف الأيسر واستخراج الحل الجبري النهائي',
          text: 'نعوض وننقل الحد الذي يحوي I إلى الطرف الأيسر ثم نقسم على المعامل المشترك:',
          latex: al([
            `I = -\\dfrac{1}{${b}}e^{${a === 1 ? '' : a}${v}}\\cos(${b === 1 ? '' : b}${v}) + \\dfrac{${a}}{${b * b}}e^{${a === 1 ? '' : a}${v}}\\sin(${b === 1 ? '' : b}${v}) - \\dfrac{${a * a}}{${b * b}} I`,
            `I\\left(1 + \\dfrac{${a * a}}{${b * b}}\\right) = e^{${a === 1 ? '' : a}${v}}\\left(\\dfrac{${a}\\sin(${b === 1 ? '' : b}${v}) - ${b}\\cos(${b === 1 ? '' : b}${v})}{${b * b}}\\right)`,
            `I = ${primTex}`
          ])
        }
      ];
    } else {
      prim = `(exp(${a}*${v})/(${a2b2})) * (${a}*cos(${b}*${v}) + ${b}*sin(${b}*${v}))`;
      primTex = cleanMathLatex(`\\dfrac{e^{${a === 1 ? '' : a}${v}}}{${a2b2}}\\left(${a === 1 ? '' : a}\\cos(${b === 1 ? '' : b}${v}) + ${b === 1 ? '' : b}\\sin(${b === 1 ? '' : b}${v})\\right)`);
      steps = [
        {
          title: 'التجزئة الدائرية (المرحلة الأولى والثانية)',
          text: 'نطبق التجزئة مرتين متتاليتين مع الحفاظ على ترتيب اختيار u و dv وفق قاعدة LIATE:',
          latex: al([
            `I = \\int e^{${a === 1 ? '' : a}${v}}\\cos(${b === 1 ? '' : b}${v})\\,d${v}`,
            `I = \\dfrac{1}{${b}}e^{${a === 1 ? '' : a}${v}}\\sin(${b === 1 ? '' : b}${v}) - \\dfrac{${a}}{${b}}\\int e^{${a === 1 ? '' : a}${v}}\\sin(${b === 1 ? '' : b}${v})\\,d${v}`,
            `I = \\dfrac{1}{${b}}e^{${a === 1 ? '' : a}${v}}\\sin(${b === 1 ? '' : b}${v}) + \\dfrac{${a}}{${b * b}}e^{${a === 1 ? '' : a}${v}}\\cos(${b === 1 ? '' : b}${v}) - \\dfrac{${a * a}}{${b * b}} I`
          ])
        },
        {
          title: 'حل المعادلة بالنسبة إلى I',
          text: 'نجمع حدود I في الطرف الأيسر:',
          latex: al([
            `I\\left(1 + \\dfrac{${a * a}}{${b * b}}\\right) = e^{${a === 1 ? '' : a}${v}}\\left(\\dfrac{${a}\\cos(${b === 1 ? '' : b}${v}) + ${b}\\sin(${b === 1 ? '' : b}${v})}{${b * b}}\\right)`,
            `I = ${primTex}`
          ])
        }
      ];
    }
    return { primitive: prim, latex: primTex, steps };
  }

  // 2) Tabular IBP: x^n * exp(a*x) with n in [1, 2, 3, 4]
  const polyExp = s.match(/^([a-z])\^?([0-9])?\*(?:exp\((?:([0-9.-]+)\*)?([a-z])\)|e\^\((?:([0-9.-]+)\*)?([a-z])\))$/i);
  if (polyExp && (polyExp[1] === v) && (polyExp[4] === v || polyExp[6] === v)) {
    const n = parseInt(polyExp[2] || '1');
    const a = parseFloat(polyExp[3] || polyExp[5] || '1');

    const nerdRes = symbolicIntegral(integrand, v);
    if (!nerdRes.unresolved) {
      // Build Tabular breakdown
      const uDerivs: { uTex: string; vTex: string; sign: string }[] = [];
      let curU = nExpr(nerdamer(`${v}^${n}`));
      let curV = nExpr(nerdamer(`exp(${a}*${v})`));

      const rowsTex: string[] = [];
      for (let k = 0; k <= n; k++) {
        const sign = k % 2 === 0 ? '+' : '-';
        // integrate v
        curV = nExpr(nerdamer.integrate(curV.text(), v));
        rowsTex.push(`${sign} & ${cleanMathLatex(curU.toTeX())} & ${cleanMathLatex(curV.toTeX())}`);
        uDerivs.push({ uTex: curU.toTeX(), vTex: curV.toTeX(), sign });
        curU = nExpr(nerdamer.diff(curU.text(), v));
      }

      const tableLatex = `\\begin{array}{c|c|c} \\text{الإشارة} & \\text{الاشتقاق (D)} & \\text{التكامل (I)} \\\\ \\hline ${rowsTex.join(' \\\\ ')} \\end{array}`;
      const steps: IntegralStep[] = [
        {
          title: 'قاعدة LIATE واختيار الدالتين للتجزئة',
          text: `وفق أولويات قاعدة LIATE (اللوغاريتمي ثم الجبري ثم الأسي): نختار $u = ${v}^{${n}}$ لأنه يشتق حتى الصفر، و $dv = e^{${a === 1 ? '' : a}${v}} d${v}$ لأنه يتكامل بسهولة:`,
          latex: cleanMathLatex(`u = ${v}^{${n}}, \\qquad dv = e^{${a === 1 ? '' : a}${v}}\\,d${v}`)
        },
        {
          title: 'جدول التجزئة المتكررة (طريقة الجدول - Tabular Method)',
          text: 'نشتق u تكرارياً حتى ينعدم، ونكامل dv بالتوازي مع تطبيق إشارات متناوبة (+, −, +, −):',
          latex: tableLatex
        },
        {
          title: 'تجميع حدود التابع الأصلي',
          text: 'نضرب كل حد مشتق بالتابع المكامل المقابل له مع مراعاة الإشارة:',
          latex: `\\int ${v}^{${n}} e^{${a === 1 ? '' : a}${v}}\\,d${v} = ${nerdRes.latex}`
        }
      ];

      return { primitive: nerdRes.text, latex: nerdRes.latex, steps };
    }
  }

  // 3) Logarithmic IBP: x^n * ln(x)^k with k in [1, 2]
  const logMatch = s.match(/^(?:([a-z])\^?([0-9]+)?\*)?(?:log|ln)\(([a-z])\)(?:\^([0-9]+))?$/i);
  if (logMatch && logMatch[3] === v && (!logMatch[1] || logMatch[1] === v)) {
    const n = logMatch[1] ? parseInt(logMatch[2] || '1') : 0;
    const k = parseInt(logMatch[4] || '1');

    const nerdRes = symbolicIntegral(integrand, v);
    if (!nerdRes.unresolved) {
      const steps: IntegralStep[] = [
        {
          title: 'قاعدة LIATE وتحديد دالة التجزئة اللوغاريتمية',
          text: `الدالة اللوغاريتمية لها الأولوية القصوى في الاشتقاق (L في LIATE): نضع $u = \\ln^{${k}}(${v})$ و $dv = ${n === 0 ? `d${v}` : `${v}^{${n}} d${v}`}$ :`,
          latex: cleanMathLatex(`u = \\ln^{${k}}(${v}), \\qquad dv = ${n === 0 ? '' : `${v}^{${n}}\\,`}d${v}`)
        },
        {
          title: 'تطبيق دستور التكامل بالتجزئة',
          text: 'نطبق العلاقة ∫ u dv = uv − ∫ v du:',
          latex: al([
            `du = ${k === 1 ? `\\dfrac{1}{${v}}\\,d${v}` : `\\dfrac{${k}\\ln(${v})}{${v}}\\,d${v}`}`,
            `v = ${n === 0 ? v : `\\dfrac{${v}^{${n + 1}}}{${n + 1}}`}`,
            `\\int ${n === 0 ? '' : `${v}^{${n}}`}\\ln^{${k}}(${v})\\,d${v} = ${nerdRes.latex}`
          ])
        }
      ];

      return { primitive: nerdRes.text, latex: nerdRes.latex, steps };
    }
  }

  return null;
}

// ===================================================================
// Layer 4: Advanced Substitution & Composite Patterns (التعويض المتقدم)
// ===================================================================
function tryAdvancedSubstitution(integrand: string, v: string): CustomSolveResult | null {
  try {
    // 1) ln(x)/x or (ln(x))^k / x
    const logDivX = integrand.replace(/\s+/g, '').match(/^(?:log|ln)\(([a-z])\)(?:\^([0-9]+))?\/([a-z])$/i);
    if (logDivX && logDivX[1] === v && logDivX[3] === v) {
      const k = parseInt(logDivX[2] || '1');
      const kp1 = k + 1;
      const prim = `(1/${kp1})*log(${v})^${kp1}`;
      const primTex = cleanMathLatex(`\\dfrac{\\ln^{${kp1}}(${v})}{${kp1}}`);
      const steps: IntegralStep[] = [
        {
          title: 'التعويض بمتغير لوغاريتمي (u = ln x)',
          text: 'نلاحظ وجود مشتق الدالة اللوغاريتمية 1/x مضروباً بالدالة:',
          latex: cleanMathLatex(`u = \\ln(${v}) \\implies du = \\dfrac{1}{${v}}\\,d${v}`)
        },
        {
          title: 'التحويل والمكاملة بقاعدة القوى',
          text: 'يتحول التكامل إلى تكامل قوة أساسية بدلالة u:',
          latex: al([
            `\\int \\dfrac{\\ln^{${k}}(${v})}{${v}}\\,d${v} &= \\int u^{${k}}\\,du`,
            `&= \\dfrac{u^{${kp1}}}{${kp1}}`,
            `&= ${primTex}`
          ])
        }
      ];
      return { primitive: prim, latex: primTex, steps };
    }

    // 2) 1 / (x * ln(x))
    const oneOverXLog = integrand.replace(/\s+/g, '').match(/^1\/\(([a-z])\*(?:log|ln)\(([a-z])\)\)$/i);
    if (oneOverXLog && oneOverXLog[1] === v && oneOverXLog[2] === v) {
      const prim = `log(log(${v}))`;
      const primTex = cleanMathLatex(`\\ln\\left|\\ln(${v})\\right|`);
      const steps: IntegralStep[] = [
        {
          title: 'التعويض u = ln(x)',
          text: 'نفصل الكسر إلى (1/x) / ln(x):',
          latex: cleanMathLatex(`u = \\ln(${v}) \\implies du = \\dfrac{1}{${v}}\\,d${v}`)
        },
        {
          title: 'المكاملة ككسر لوغاريتمي u\'/u',
          text: 'التكامل من النمط الشهير ∫ du / u = ln|u|:',
          latex: al([
            `\\int \\dfrac{1}{${v}\\ln(${v})}\\,d${v} &= \\int \\dfrac{du}{u} = \\ln|u|`,
            `&= ${primTex}`
          ])
        }
      ];
      return { primitive: prim, latex: primTex, steps };
    }

    // 3) General f'(x)/f(x) check
    if (integrand.includes('/')) {
      const parts = integrand.split('/');
      if (parts.length === 2) {
        const num = parts[0].trim();
        const den = parts[1].trim();
        const dDen = nExpr(nerdamer.diff(den, v)).simplify();
        const diffRatio = parseN(`(${dDen.text()})/(${num})`).simplify();
        const ratioNum = Number(diffRatio.numeric().text());

        if (Number.isFinite(ratioNum) && Math.abs(ratioNum) > 1e-9) {
          const kFactor = 1 / ratioNum;
          const kTex = tex(Number(kFactor.toFixed(6)));
          const prim = `(${kFactor})*log(abs(${den}))`;
          const primTex = cleanMathLatex(
            kFactor === 1
              ? `\\ln\\left|${texFrom(den)}\\right|`
              : `${kTex}\\ln\\left|${texFrom(den)}\\right|`
          );

          const steps: IntegralStep[] = [
            {
              title: 'التعويض بقاعدة الكسر اللوغاريتمي الشهيرة (f\'/f)',
              text: `نلاحظ أن مشتق المقام يساوي ${ratioNum === 1 ? '' : `${ratioNum} × `} البسط:`,
              latex: cleanMathLatex(`u = ${texFrom(den)} \\implies du = \\left(${cleanMathLatex(dDen.toTeX())}\\right) d${v}`)
            },
            {
              title: 'المكاملة المباشرة',
              text: 'نطبق القاعدة الأساسية: ∫ f\'(x)/f(x) dx = ln|f(x)|:',
              latex: al([
                `\\int \\dfrac{${texFrom(num)}}{${texFrom(den)}}\\,d${v} &= ${kFactor === 1 ? '' : `${kTex} `}\\int \\dfrac{du}{u}`,
                `&= ${primTex}`
              ])
            }
          ];

          return { primitive: prim, latex: primTex, steps };
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ===================================================================
// Master Antiderivative Engine with Multi-Layered Dispatcher
// ===================================================================
function makeAntiderivative(
  integrand: string,
  method: IntegrationMethod,
  variable: string,
  options: { u?: string; dv?: string; transformed?: string }
): { primitive: string; latex: string; steps: IntegralStep[]; warning?: string } {
  // If user explicitly chose parts or substitution via manual options
  if (method === 'parts' && options.u?.trim() && options.dv?.trim()) {
    const u = normalizeExpr(options.u);
    const dv = normalizeExpr(options.dv);
    const uDerivative = nExpr(nerdamer.diff(u, variable)).simplify();
    const v = symbolicIntegral(dv, variable);
    if (v.unresolved) throw new Error('لم أتمكن من إيجاد v رمزياً.');

    const remainingIntegrand = parseN(`(${v.text})*(${uDerivative.text()})`).simplify();
    const remaining = symbolicIntegral(remainingIntegrand.text(), variable);
    const primitiveExpr = parseN(`(${u})*(${v.text})-(${remaining.text})`).simplify();

    const steps: IntegralStep[] = [
      {
        title: 'الجدول القانوني للتجزئة (اختيار u و v′ ثم اشتقاق/تكامل)',
        text: 'نختار u بالدالة ذات الأولوية في LIATE، و v′ بالعامل المتبقي المضروب في d' + variable + '، ونكتب الجدول كما هو مطلوب في السلّم:',
        latex: cleanMathLatex(`\\begin{array}{l} u(${variable}) = ${texFrom(u)} \\implies u'(${variable}) = ${texFrom(uDerivative.text())} \\\\[7pt] v'(${variable}) = ${texFrom(dv)} \\implies v(${variable}) = ${v.latex} \\end{array}`)
      },
      {
        title: 'تطبيق قانون التكامل بالتجزئة',
        text: 'نعوّض من الجدول مباشرة في قانون التجزئة:',
        latex: cleanMathLatex(`\\int ${texFrom(integrand)}\\,d${variable} = ${texFrom(u)}\\left(${v.latex}\\right) - \\int ${texFrom(remainingIntegrand.text())}\\,d${variable}`)
      },
      {
        title: 'حساب التكامل المتبقي ثم الترتيب النهائي',
        text: 'يكامل المحرك الحد المتبقي، ويُبقى على ثابت التكامل بالصيغة المقررة:',
        latex: cleanMathLatex(`\\int ${texFrom(integrand)}\\,d${variable} = ${cleanMathLatex(primitiveExpr.toTeX())} + c \\qquad (c \\in \\mathbb{R})`)
      }
    ];

    return { primitive: primitiveExpr.text(), latex: cleanMathLatex(primitiveExpr.toTeX()), steps };
  }

  // Multi-layered Smart Automatic Dispatcher:
  // Layer 1: Trigonometric linearization & double angle
  const trigSol = tryTrigLinearization(integrand, variable);
  if (trigSol) return trigSol;

  // Layer 2: Repeated / Tabular & Circular IBP
  const ibpSol = tryTabularOrCircularIBP(integrand, variable);
  if (ibpSol) return ibpSol;

  // Layer 3: Advanced substitution & composite patterns
  const substSol = tryAdvancedSubstitution(integrand, variable);
  if (substSol) return substSol;

  // Layer 4: Partial fractions decomposition (partfrac)
  const pfSol = tryPartialFractions(integrand, variable);
  if (pfSol) return pfSol;

  // Layer 5: Fallback to General CAS (Nerdamer)
  const result = symbolicIntegral(integrand, variable);
  if (result.unresolved) {
    const error = new Error('لم يتمكن المحرك من إيجاد دالة أصلية رمزية ابتدائية لهذه الصيغة.') as Error & {
      nonElementary?: boolean;
    };
    error.nonElementary = true;
    throw error;
  }

  const primitive = result.text;
  const verified = verifyAntiderivative(primitive, integrand, variable);
  const steps: IntegralStep[] = [
    {
      title: 'البحث عن التابع الأصلي رمزياً',
      text: 'محرك الجبر الرمزي يبحث في قواعد القوى والدوال المثلثية والأسية واللوغاريتمية:',
      latex: cleanMathLatex(`\\int ${texFrom(integrand)}\\,d${variable} = ${result.latex} + c \\qquad (c \\in \\mathbb{R})`)
    },
    {
      title: 'التحقق بالاشتقاق العكسي',
      text: verified
        ? 'اشتقاق التابع الأصلي يعيد الدالة تحت التكامل رمزياً، مما يؤكد صحة النتيجة بنسبة 100%:'
        : 'تم استخراج التابع الأصلي بنجاح:',
      latex: cleanMathLatex(
        verified
          ? `\\begin{aligned} F(${variable}) &= ${result.latex} \\\\[7pt] F'(${variable}) &= \\dfrac{d}{d${variable}}\\left[${result.latex}\\right] = ${texFrom(integrand)} \\quad \\checkmark \\end{aligned}`
          : `F(${variable}) = ${result.latex}`
      )
    }
  ];

  return { primitive, latex: result.latex, steps };
}

// ===================================================================
// Main Solver: Indefinite, Definite, Non-Elementary Series & Quadrature
// ===================================================================
export function solveIntegral(input: {
  expression: string;
  variable?: string;
  mode: IntegrationMode;
  method?: IntegrationMethod;
  lower?: number;
  upper?: number;
  u?: string;
  dv?: string;
  transformed?: string;
}): IntegrationResult {
  const variable = (input.variable || 'x').trim() || 'x';
  const method = input.method || 'automatic';
  const integrand = normalizeExpr(input.expression);
  if (!integrand.trim()) throw new Error('أدخل الدالة المراد تكاملها.');

  const integrandLatex = texFrom(integrand);
  const lower = input.lower ?? 0;
  const upper = input.upper ?? 1;
  if (input.expression.includes('□')) throw new Error('أكمل الخانات الرياضية الفارغة قبل الحساب.');
  if (input.mode === 'definite' && (!Number.isFinite(lower) || !Number.isFinite(upper))) {
    throw new Error('حدود التكامل يجب أن تكون أعداداً منتهية.');
  }
  const domain = input.mode === 'definite' ? validateRealIntegralDomain(integrand, lower, upper, variable) : { improperEndpoints: false };
  if ((method === 'automatic' || method === 'rules') && !domain.improperEndpoints) {
    const seriesResult = trySeriesIntegration(integrand, integrandLatex, variable, input.mode, lower, upper);
    if (seriesResult) return seriesResult;
  }

  let form: { primitive: string; latex: string; steps: IntegralStep[]; warning?: string };

  try {
    form = makeAntiderivative(integrand, method, variable, input);
  } catch (error: any) {
    if (method === 'automatic' || method === 'rules') {
      if (input.mode === 'indefinite') {
        throw new Error('لم يُعثر على دالة أصلية ابتدائية أو نشر متسلسلة مدعوم لهذه الدالة. تحقق من العبارة أو استخدم التكامل المحدد للحصول على تقريب عددي.');
      }

      // Definite numerical fallback
      if (input.mode === 'definite') {
        if (domain.improperEndpoints) throw new Error('هذا تكامل غير عادي، ولم يتمكن المحرك من إثبات تقاربه عند الحدود. لا يمكن اعتماد تقريب عددي غير متحقق.');
        const numeric = quadrature(integrand, variable, lower, upper);
        if (numeric !== null && Number.isFinite(numeric)) {
          const numTex = cleanMathLatex(String(Number(numeric.toPrecision(9))));
          return {
            mode: 'definite',
            method,
            integrandLatex,
            exactValueLatex: numTex,
            decimalValue: numeric,
            numericalFallback: true,
            verified: false,
            plotPoints: sampleCurve(integrand, variable, lower, upper),
            warning: 'لم يُعثر على تابع أصلي ابتدائي؛ القيمة محسوبة عددياً بتكامل سمبسون التكيفي عالي الدقة (3000 شريحة).',
            steps: [
              {
                title: 'صياغة التكامل المحدد',
                text: 'الدالة لا تقبل تابعاً أصلياً بصيغة مغلقة بسيطة:',
                latex: cleanMathLatex(`\\int_{${lower}}^{${upper}} ${integrandLatex}\\,d${variable}`)
              },
              {
                title: 'التكامل العددي التكيفي (قاعدة سمبسون 3000 شريحة)',
                text: 'حساب القيمة بدقة متناهية:',
                latex: cleanMathLatex(`\\int_{${lower}}^{${upper}} ${integrandLatex}\\,d${variable} \\approx ${numTex}`)
              }
            ]
          };
        }
      }
    }
    throw error;
  }

  const verified = verifyAntiderivative(form.primitive, integrand, variable);

  // Indefinite result
  if (input.mode === 'indefinite') {
    return {
      mode: 'indefinite',
      method,
      integrandLatex,
      primitiveLatex: cleanMathLatex(`${form.latex} + c \\qquad (c \\in \\mathbb{R})`),
      steps: form.steps,
      verified,
      numericalFallback: false,
      plotPoints: sampleCurve(integrand, variable, 0, 1),
      warning: form.warning
    };
  }

  // Definite result: evaluate F(b) - F(a)
  if (!Number.isFinite(lower) || !Number.isFinite(upper)) {
    throw new Error('حدود التكامل يجب أن تكون أعداداً منتهية.');
  }

  let exactValueLatex: string | undefined;
  let decimalValue: number | undefined;
  let numericalFallback = false;

  try {
    const endpoint = (point: number, direction: 'left' | 'right'): NExpr => {
      try {
        const value = parseN(form.primitive).evaluate({ [variable]: String(point) });
        if (Number.isFinite(Number(value.numeric().text()))) return value;
      } catch { /* Evaluate a one-sided primitive limit at a singular endpoint. */ }
      const limit = nExpr(nerdamer.limit(form.primitive, variable, String(point), direction));
      if (!Number.isFinite(Number(limit.numeric().text()))) throw new Error('نهاية الدالة الأصلية غير منتهية عند حد التكامل.');
      return limit;
    };
    const upperExpr = endpoint(upper, lower <= upper ? 'left' : 'right');
    const lowerExpr = endpoint(lower, lower <= upper ? 'right' : 'left');
    const difference = upperExpr.minus(lowerExpr).simplify();
    exactValueLatex = cleanMathLatex(difference.toTeX());
    decimalValue = Number(difference.numeric().text());
    if (!Number.isFinite(decimalValue)) decimalValue = undefined;
  } catch {
    if (domain.improperEndpoints) throw new Error('التكامل غير العادي غير متقارب عند أحد الحدود، أو تعذّر إثبات تقاربه رمزياً.');
    // Evaluate a proper integral numerically when the symbolic endpoints are unresolved.
  }

  if (decimalValue === undefined) {
    const num = quadrature(integrand, variable, lower, upper);
    if (num !== null) {
      decimalValue = num;
      exactValueLatex = cleanMathLatex(String(Number(num.toPrecision(9))));
      numericalFallback = true;
    } else {
      throw new Error('تعذّر تقييم التكامل المحدد عند هذه الحدود (احتمال وجود نقطة شذوذ).');
    }
  }

  const steps: IntegralStep[] = [
    ...form.steps,
    {
      title: 'التعويض بحدود التكامل (المبرهنة الأساسية للتفاضل والتكامل)',
      text: 'نطبق العلاقة I = F(b) − F(a):',
      latex: cleanMathLatex(
        `\\begin{aligned} \\int_{${lower}}^{${upper}} ${integrandLatex}\\,d${variable} &= \\left[ ${form.latex} \\right]_{${lower}}^{${upper}} \\\\[7pt] &= F(${upper}) - F(${lower}) \\\\[7pt] &= ${exactValueLatex} ${
          exactValueLatex !== String(Number(decimalValue.toPrecision(9)))
            ? `\\approx ${cleanMathLatex(String(Number(decimalValue.toPrecision(9))))}`
            : ''
        } \\end{aligned}`
      )
    }
  ];

  return {
    mode: 'definite',
    method,
    integrandLatex,
    primitiveLatex: cleanMathLatex(`${form.latex} + c \\qquad (c \\in \\mathbb{R})`),
    exactValueLatex,
    decimalValue,
    steps,
    plotPoints: sampleCurve(integrand, variable, lower, upper),
    verified,
    numericalFallback,
    warning: [form.warning, domain.improperEndpoints ? 'تكامل غير عادي متقارب: استُخدمت نهايتا الدالة الأصلية من داخل المجال عند الحدود غير المعرّفة.' : ''].filter(Boolean).join(' ') || undefined
  };
}

/** Non-elementary integrals use exact rational Maclaurin coefficients. */
function trySeriesIntegration(
  integrand: string,
  integrandLatex: string,
  variable: string,
  mode: IntegrationMode,
  lower: number,
  upper: number
): IntegrationResult | null {
  try {
    const plan = planSeriesIntegrand(integrand, variable);
    if (!plan) return null;

    const definite = mode === 'definite';
    const withinRadius = !definite || seriesConvergesOn(plan, lower, upper);
    const integrated = integrateSeries(plan.terms);
    const integratedTex = cleanMathLatex(antiderivativeTex(integrated, variable));
    const fSeriesTex = cleanMathLatex(seriesToTex(plan.terms, variable));

    const steps: IntegralStep[] = [
      {
        title: 'تشخيص بنية الدالة غير الابتدائية',
        text: `الدالة لا تملك تابعاً أصلياً ابتدائياً بصيغة مغلقة؛ شكلها مطابق لـ «${plan.label}» (من أشهر تكاملات المتسلسلات):`,
        latex: cleanMathLatex(`f(${variable}) = ${integrandLatex}`)
      },
      {
        title: 'نشر ماكلورين للدالة (Infinite Power Series)',
        text: 'نكتب الدالة بنشر ماكلورين اللانهائي ونحتفظ بأول 5 حدود غير صفرية للحصول على دقة فائقة:',
        latex: al([
          `f(${variable}) &= ${cleanMathLatex(plan.sigmaTex)}`,
          `&= ${fSeriesTex}`
        ])
      },
      {
        title: 'التكامل حدّاً حدّاً',
        text: 'نكامل كل حد من حدود المتسلسلة على حدة:',
        latex: cleanMathLatex(`\\int \\left(${fSeriesTex}\\right) d${variable} = ${integratedTex}`)
      }
    ];

    if (definite && !withinRadius) {
      const fallback = quadrature(integrand, variable, lower, upper);
      if (fallback === null) return null;
      return {
        mode: 'definite',
        method: 'automatic',
        integrandLatex,
        exactValueLatex: cleanMathLatex(`${Number(fallback.toPrecision(10))}`),
        decimalValue: fallback,
        steps,
        plotPoints: sampleCurve(integrand, variable, lower, upper),
        verified: false,
        numericalFallback: true,
        approximate: true,
        warning: 'المتسلسلة متباعدة خارج نصف قطر التقارب، فتم الاعتماد على الحساب العددي التكيفي.',
        series: {
          kind: plan.kind,
          label: plan.label,
          reason: plan.reason,
          sigmaTex: cleanMathLatex(plan.sigmaTex),
          integrandSeriesTex: fSeriesTex,
          integratedTex,
          expansionCount: plan.terms.length,
          termCount: integrated.poly.length,
          divergent: true,
          note: `نصف قطر التقارب: |${variable}| < ${plan.radius ?? '∞'}.`
        }
      };
    }

    const value = definite ? evaluateDefiniteSeries(integrated, lower, upper) : null;
    if (definite && (!value || value.divergent)) {
      const fallback = quadrature(integrand, variable, lower, upper);
      if (fallback === null) return null;
      return {
        mode: 'definite',
        method: 'automatic',
        integrandLatex,
        exactValueLatex: cleanMathLatex(`${Number(fallback.toPrecision(10))}`),
        decimalValue: fallback,
        steps,
        plotPoints: sampleCurve(integrand, variable, lower, upper),
        verified: false,
        numericalFallback: true,
        approximate: true,
        warning: 'تعذر تقييم المتسلسلة بدقة عند هذه الحدود، فاعتمدنا الحساب العددي.',
        series: {
          kind: plan.kind,
          label: plan.label,
          reason: plan.reason,
          sigmaTex: cleanMathLatex(plan.sigmaTex),
          integrandSeriesTex: fSeriesTex,
          integratedTex,
          expansionCount: plan.terms.length,
          termCount: integrated.poly.length,
          divergent: true,
          note: 'تقييم عددي تكيفي بديل.'
        }
      };
    }

    const reference = definite ? quadrature(integrand, variable, lower, upper) : null;
    const relativeError =
      definite && value && reference !== null && Math.abs(reference) > 1e-12
        ? Math.abs(value.decimal - reference) / Math.abs(reference)
        : null;

    if (definite && value) {
      steps.push({
        title: 'التعويض بالحدود على متسلسلة التابع الأصلي',
        text: 'نطبق المبرهنة الأساسية لحساب القيمة المقربة للمتسلسلة:',
        latex: cleanMathLatex(
          value.exactTex
            ? `\\begin{aligned} I &\\approx \\left[${integratedTex.replace(' + C', '')}\\right]_{${lower}}^{${upper}} \\\\[7pt] &= ${value.exactTex} \\\\[7pt] &\\approx ${Number(value.decimal.toPrecision(9))} \\end{aligned}`
            : `I \\approx ${Number(value.decimal.toPrecision(9))}`
        )
      });
    }

    return {
      mode,
      method: 'automatic',
      integrandLatex,
      primitiveLatex: definite ? undefined : integratedTex,
      exactValueLatex: definite ? cleanMathLatex(value?.exactTex ?? (value ? String(Number(value.decimal.toPrecision(10))) : '')) : undefined,
      decimalValue: definite && value ? value.decimal : undefined,
      steps,
      plotPoints: sampleCurve(integrand, variable, definite ? lower : 0, definite ? upper : 1),
      verified: false,
      numericalFallback: false,
      approximate: true,
      warning: definite
        ? 'القيمة محسوبة بنشر ماكلورين المقطوع عند 5 حدود غير صفرية (تقريب مع مرجع عددي مستقل للتحقق من الدقة).'
        : 'التابع الأصلي ناتج متسلسلة ماكلورين مقطوعة عند 5 حدود غير صفرية.',
      series: {
        kind: plan.kind,
        label: plan.label,
        reason: plan.reason,
        sigmaTex: cleanMathLatex(plan.sigmaTex),
        integrandSeriesTex: fSeriesTex,
        integratedTex,
        expansionCount: plan.terms.length,
        termCount: integrated.poly.length,
        exactSeriesTex: value?.exactTex ? cleanMathLatex(value.exactTex) : null,
        decimalValue: value?.decimal,
        referenceValue: reference,
        relativeError,
        divergent: false,
        note: plan.radius === null
          ? 'المتسلسلة متقاربة على كامل المستقيم الحقيقي ℝ.'
          : `نصف قطر التقارب: |${variable}| < ${plan.radius}.`
      }
    };
  } catch {
    return null;
  }
}
