import { EquationSolution } from '../../../types/index.js';
import { decimalToFraction, fractionToLatex } from '../scientific/mathEngine.js';

type Root = EquationSolution['roots'][number];
type Step = EquationSolution['steps'][number];

// ---------------------------------------------------------------- helpers
const isInt = (x: number) => Number.isInteger(x);
const gcd = (a: number, b: number): number => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
};

// exact LaTeX of a number (fraction when possible)
export const tex = (x: number): string => {
  if (!isFinite(x)) return '\\infty';
  const f = decimalToFraction(x);
  if (f) return fractionToLatex(f.replace('/', '/'));
  return String(Number(x.toFixed(6)));
};

// number placed between brackets when negative: (-5)
const par = (x: number): string => (x < 0 ? `\\left(${tex(x)}\\right)` : tex(x));

// polynomial in LaTeX: poly([1,-5,6],['x^{2}','x','']) => x^{2} - 5x + 6
export function poly(coefs: number[], vars: string[]): string {
  let out = '';
  coefs.forEach((c, i) => {
    if (c === 0) return;
    const v = vars[i];
    const abs = Math.abs(c);
    const body = abs === 1 && v ? v : `${tex(abs)}${v}`;
    if (!out) out = `${c < 0 ? '-' : ''}${body}`;
    else out += ` ${c < 0 ? '-' : '+'} ${body}`;
  });
  return out || '0';
}

// (x - r)  /  (x + r)  /  x
const xMinus = (r: number): string => {
  if (Math.abs(r) < 1e-12) return 'x';
  return r > 0 ? `\\left(x - ${tex(r)}\\right)` : `\\left(x + ${tex(-r)}\\right)`;
};

const lead = (a: number): string => (a === 1 ? '' : a === -1 ? '-' : par(a));

function simplifyRadical(n: number): [number, number] {
  let k = 1;
  let m = n;
  for (let f = 2; f * f <= m; f++) {
    while (m % (f * f) === 0) {
      m /= f * f;
      k *= f;
    }
  }
  return [k, m];
}

const aligned = (lines: string[]) => `\\begin{aligned} ${lines.join(' \\\\[6pt] ')} \\end{aligned}`;

const fnum = (x: number) => Number(x.toFixed(5));

function buildPlot(f: (x: number) => number, from: number, to: number, roots: { x: number; label: string }[], vertex?: { x: number; y: number; label: string }) {
  const xs: number[] = [];
  const ys: number[] = [];
  const n = 80;
  for (let i = 0; i <= n; i++) {
    const x = from + ((to - from) * i) / n;
    xs.push(x);
    ys.push(f(x));
  }
  return {
    xValues: xs,
    yValues: ys,
    rootPoints: roots.map((r) => ({ x: r.x, y: 0, label: r.label })),
    vertexPoint: vertex
  };
}

// ---------------------------------------------------------------- degree 1
export function solveLinear(a: number, b: number): EquationSolution {
  const eq = `${poly([a, b], ['x', ''])} = 0`;

  if (a === 0) {
    if (b === 0) {
      return {
        type: 'deg1',
        equationLatex: '0 = 0',
        steps: [{ title: 'تحليل المعادلة', description: 'المعادلة محققة من أجل كل الأعداد الحقيقية.', mathLatex: 'S = \\mathbb{R}' }],
        roots: [{ label: 'مجموعة الحلول', exactLatex: 'S = \\mathbb{R}', decimal: 'كل الأعداد الحقيقية' }]
      };
    }
    return {
      type: 'deg1',
      equationLatex: `${tex(b)} = 0`,
      steps: [{ title: 'تناقض رياضي', description: 'المعادلة مستحيلة الحل في $\\mathbb{R}$.', mathLatex: 'S = \\emptyset' }],
      roots: [{ label: 'مجموعة الحلول', exactLatex: 'S = \\emptyset', decimal: 'لا يوجد حل' }]
    };
  }

  const root = -b / a;
  return {
    type: 'deg1',
    equationLatex: eq,
    steps: [
      {
        title: 'نقل الحد الثابت إلى الطرف الآخر',
        description: 'نعزل الحد الذي يحوي المجهول في طرف واحد:',
        mathLatex: aligned([`${poly([a, b], ['x', ''])} &= 0`, `${tex(a)}x &= ${tex(-b)}`])
      },
      {
        title: 'القسمة على معامل x',
        description: `نقسم الطرفين على $a = ${tex(a)}$ (غير معدوم):`,
        mathLatex: aligned([`x &= \\dfrac{${tex(-b)}}{${tex(a)}}`, `x &= ${tex(root)}`])
      },
      {
        title: 'التحقق من الحل',
        description: 'نعوّض القيمة في المعادلة الأصلية:',
        mathLatex: `${tex(a)} \\cdot ${par(root)} ${b < 0 ? '-' : '+'} ${tex(Math.abs(b))} = 0 \\quad \\checkmark`
      }
    ],
    roots: [{ label: 'x', exactLatex: `x = ${tex(root)}`, decimal: root }],
    plotData: buildPlot((x) => a * x + b, root - 5, root + 5, [{ x: root, label: `x = ${fnum(root)}` }])
  };
}

// ---------------------------------------------------------------- degree 2
interface QuadExact {
  r1: string;
  r2: string;
  real: boolean;
}

function quadExact(a: number, b: number, delta: number): QuadExact {
  const dec = (x: number) => String(Number(x.toFixed(6)));
  if (delta >= 0) {
    const sq = Math.sqrt(delta);
    const v1 = (-b + sq) / (2 * a);
    const v2 = (-b - sq) / (2 * a);
    if (isInt(a) && isInt(b) && isInt(delta)) {
      const [k, m] = simplifyRadical(delta);
      if (m === 1) return { r1: tex(v1), r2: tex(v2), real: true };
      const g = gcd(gcd(b, k), 2 * a);
      let B = -b / g;
      const K = k / g;
      let D = (2 * a) / g;
      let s1 = 1;
      if (D < 0) {
        D = -D;
        B = -B;
        s1 = -1;
      }
      const mk = (s: number) => {
        const term = `${K === 1 ? '' : K}\\sqrt{${m}}`;
        const num = B !== 0 ? `${B} ${s > 0 ? '+' : '-'} ${term}` : `${s > 0 ? '' : '-'}${term}`;
        return D === 1 ? num : `\\dfrac{${num}}{${D}}`;
      };
      return { r1: mk(s1), r2: mk(-s1), real: true };
    }
    return { r1: tex(v1), r2: tex(v2), real: true };
  }
  // complex
  const p = -b / (2 * a);
  if (isInt(a) && isInt(b) && isInt(delta)) {
    const [k, m] = simplifyRadical(-delta);
    const g = gcd(k, 2 * Math.abs(a));
    const K = k / g;
    const D = (2 * Math.abs(a)) / g;
    let q: string;
    if (m === 1) {
      const val = K / D;
      q = val === 1 ? '' : tex(val);
    } else {
      const root = `${K === 1 ? '' : K}\\sqrt{${m}}`;
      q = D === 1 ? root : `\\dfrac{${root}}{${D}}`;
    }
    const ps = p === 0 ? '' : tex(p);
    return { r1: `${ps}${ps ? ' + ' : ''}${q}i`, r2: `${ps}${ps ? ' - ' : '-'}${q}i`, real: false };
  }
  const q = Math.sqrt(-delta) / (2 * Math.abs(a));
  return { r1: `${dec(p)} + ${dec(q)}i`, r2: `${dec(p)} - ${dec(q)}i`, real: false };
}

export function solveQuadratic(a: number, b: number, c: number): EquationSolution {
  if (a === 0) return solveLinear(b, c);

  const delta = b * b - 4 * a * c;
  const eq = `${poly([a, b, c], ['x^{2}', 'x', ''])} = 0`;
  const vx = -b / (2 * a);
  const vy = -delta / (4 * a);
  const vertexLatex = `V\\left(${tex(vx)},\\ ${tex(vy)}\\right)`;
  const deltaLatex = `\\Delta = ${delta}`;
  const span = Math.max(4, delta > 0 ? Math.sqrt(delta) / (2 * Math.abs(a)) + 2 : 0);

  const stepCoeffs: Step = {
    title: 'تحديد المعاملات',
    description: 'نقارن المعادلة مع الشكل العام $ax^{2} + bx + c = 0$:',
    mathLatex: `a = ${tex(a)}, \\qquad b = ${tex(b)}, \\qquad c = ${tex(c)}`
  };
  const stepDelta: Step = {
    title: 'حساب المميز Δ',
    description: 'نطبق القانون $\\Delta = b^{2} - 4ac$:',
    mathLatex: aligned([
      '\\Delta &= b^{2} - 4ac',
      `\\Delta &= ${par(b)}^{2} - 4 \\cdot ${par(a)} \\cdot ${par(c)}`,
      `\\Delta &= ${b * b} ${-4 * a * c < 0 ? '-' : '+'} ${Math.abs(4 * a * c)}`,
      `\\Delta &= ${delta}`
    ])
  };
  const vertexStep: Step = {
    title: 'رأس القطع المكافئ',
    description: 'إحداثيات الرأس $V\\left(-\\dfrac{b}{2a},\\ -\\dfrac{\\Delta}{4a}\\right)$:',
    mathLatex: `${vertexLatex}`
  };

  if (delta > 0) {
    const ex = quadExact(a, b, delta);
    const sq = Math.sqrt(delta);
    const x1 = (-b + sq) / (2 * a);
    const x2 = (-b - sq) / (2 * a);
    const rational = isInt(a) && isInt(b) && isInt(delta) && simplifyRadical(delta)[1] === 1;
    const factored = rational || !(isInt(a) && isInt(b))
      ? `f(x) = ${lead(a)}${xMinus(x1)}${xMinus(x2)}`
      : `f(x) \\approx ${lead(a)}${xMinus(Number(x1.toFixed(4)))}${xMinus(Number(x2.toFixed(4)))}`;

    return {
      type: 'deg2',
      equationLatex: eq,
      discriminant: { value: delta, latex: deltaLatex, explanation: 'Δ > 0 : حلان حقيقيان متمايزان' },
      vertex: { x: vx, y: vy, latex: vertexLatex },
      factoredForm: factored,
      steps: [
        stepCoeffs,
        stepDelta,
        {
          title: 'الحكم على إشارة المميز',
          description: 'بما أن $\\Delta > 0$ فللمعادلة حلان حقيقيان متمايزان.',
          mathLatex: `\\Delta = ${delta} > 0`
        },
        {
          title: 'حساب الجذرين',
          description: 'نطبق القانون $x_{1,2} = \\dfrac{-b \\pm \\sqrt{\\Delta}}{2a}$:',
          mathLatex: aligned([
            `x_{1} &= \\dfrac{${tex(-b)} + \\sqrt{${delta}}}{${tex(2 * a)}} = ${ex.r1}`,
            `x_{2} &= \\dfrac{${tex(-b)} - \\sqrt{${delta}}}{${tex(2 * a)}} = ${ex.r2}`
          ])
        },
        {
          title: 'التحقق بعلاقتي فييت',
          description: 'مجموع الجذرين وجداؤهما:',
          mathLatex: aligned([
            `x_{1} + x_{2} &= -\\dfrac{b}{a} = ${tex(-b / a)}`,
            `x_{1} \\cdot x_{2} &= \\dfrac{c}{a} = ${tex(c / a)}`
          ])
        },
        vertexStep
      ],
      roots: [
        { label: 'x₁', exactLatex: `x_{1} = ${ex.r1}`, decimal: x1 },
        { label: 'x₂', exactLatex: `x_{2} = ${ex.r2}`, decimal: x2 }
      ],
      plotData: buildPlot(
        (x) => a * x * x + b * x + c,
        vx - span,
        vx + span,
        [{ x: x1, label: `x₁ = ${fnum(x1)}` }, { x: x2, label: `x₂ = ${fnum(x2)}` }],
        { x: vx, y: vy, label: 'الرأس' }
      )
    };
  }

  if (delta === 0) {
    const x0 = vx;
    return {
      type: 'deg2',
      equationLatex: eq,
      discriminant: { value: 0, latex: deltaLatex, explanation: 'Δ = 0 : حل مضاعف' },
      vertex: { x: vx, y: vy, latex: vertexLatex },
      factoredForm: `f(x) = ${lead(a)}${xMinus(x0)}^{2}`,
      steps: [
        stepCoeffs,
        stepDelta,
        {
          title: 'الحكم على إشارة المميز',
          description: 'بما أن $\\Delta = 0$ فللمعادلة جذر مضاعف وحيد.',
          mathLatex: '\\Delta = 0'
        },
        {
          title: 'حساب الجذر المضاعف',
          description: 'نطبق القانون $x_{0} = -\\dfrac{b}{2a}$:',
          mathLatex: aligned([`x_{0} &= \\dfrac{${tex(-b)}}{${tex(2 * a)}}`, `x_{0} &= ${tex(x0)}`])
        },
        vertexStep
      ],
      roots: [{ label: 'x₀ (جذر مضاعف)', exactLatex: `x_{0} = ${tex(x0)}`, decimal: x0 }],
      plotData: buildPlot((x) => a * x * x + b * x + c, vx - span, vx + span, [{ x: x0, label: `x₀ = ${fnum(x0)}` }], { x: vx, y: vy, label: 'الرأس' })
    };
  }

  const ex = quadExact(a, b, delta);
  const re = -b / (2 * a);
  const im = Math.sqrt(-delta) / (2 * Math.abs(a));
  return {
    type: 'deg2',
    equationLatex: eq,
    discriminant: { value: delta, latex: deltaLatex, explanation: 'Δ < 0 : جذران مركبان مترافقان' },
    vertex: { x: vx, y: vy, latex: vertexLatex },
    steps: [
      stepCoeffs,
      stepDelta,
      {
        title: 'الحكم على إشارة المميز',
        description: 'بما أن $\\Delta < 0$ فلا يوجد حل حقيقي، والحلان مركبان مترافقان في $\\mathbb{C}$.',
        mathLatex: `\\Delta = ${delta} < 0`
      },
      {
        title: 'الجذران المركبان',
        description: 'نستعمل $i^{2} = -1$ أي $\\sqrt{\\Delta} = i\\sqrt{|\\Delta|}$:',
        mathLatex: aligned([
          `z_{1} &= \\dfrac{${tex(-b)} + i\\sqrt{${-delta}}}{${tex(2 * a)}} = ${ex.r1}`,
          `z_{2} &= \\dfrac{${tex(-b)} - i\\sqrt{${-delta}}}{${tex(2 * a)}} = ${ex.r2}`
        ])
      },
      vertexStep
    ],
    roots: [
      { label: 'z₁', exactLatex: `z_{1} = ${ex.r1}`, decimal: `${fnum(re)} + ${fnum(im)}i`, isComplex: true },
      { label: 'z₂', exactLatex: `z_{2} = ${ex.r2}`, decimal: `${fnum(re)} - ${fnum(im)}i`, isComplex: true }
    ],
    plotData: buildPlot((x) => a * x * x + b * x + c, vx - span, vx + span, [], { x: vx, y: vy, label: 'الرأس' })
  };
}

// ---------------------------------------------------------------- degree 3
function findRationalRoot(a: number, b: number, c: number, d: number): number | null {
  if (![a, b, c, d].every(isInt)) return null;
  if (Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d)) > 100000) return null;
  if (d === 0) return 0;
  const divs = (n: number) => {
    const r: number[] = [];
    for (let i = 1; i <= Math.abs(n); i++) if (n % i === 0) r.push(i);
    return r;
  };
  for (const q of divs(a)) {
    for (const p of divs(d)) {
      for (const s of [1, -1]) {
        const P = s * p;
        if (a * P ** 3 + b * P ** 2 * q + c * P * q * q + d * q ** 3 === 0) return P / q;
      }
    }
  }
  return null;
}

export function solveCubic(a: number, b: number, c: number, d: number): EquationSolution {
  if (a === 0) return solveQuadratic(b, c, d);

  const eq = `${poly([a, b, c, d], ['x^{3}', 'x^{2}', 'x', ''])} = 0`;
  const f = (x: number) => a * x ** 3 + b * x ** 2 + c * x + d;
  const shift = -b / (3 * a);
  const infl = { x: shift, y: f(shift), latex: `I\\left(${tex(shift)},\\ ${tex(f(shift))}\\right)` };
  const steps: Step[] = [];
  const roots: Root[] = [];

  const r = findRationalRoot(a, b, c, d);

  if (r !== null) {
    const B = b + a * r;
    const C = c + B * r;
    steps.push({
      title: 'البحث عن جذر ناطق (مبرهنة الجذور الناطقة)',
      description: 'الجذر الناطق $\\dfrac{p}{q}$ حيث $p$ قاسم للحد الثابت و$q$ قاسم لمعامل $x^{3}$. بالتجربة نجد:',
      mathLatex: aligned([`f(${tex(r)}) &= ${tex(a)}\\cdot ${par(r)}^{3} ${b < 0 ? '-' : '+'} ${tex(Math.abs(b))}\\cdot ${par(r)}^{2} ${c < 0 ? '-' : '+'} ${tex(Math.abs(c))}\\cdot ${par(r)} ${d < 0 ? '-' : '+'} ${tex(Math.abs(d))}`, '&= 0 \\quad \\checkmark'])
    });
    steps.push({
      title: 'القسمة التركيبية (جدول هورنر)',
      description: `نقسم كثير الحدود على $\\left(x ${r < 0 ? '+' : '-'} ${tex(Math.abs(r))}\\right)$:`,
      mathLatex: `\\begin{array}{c|cccc} ${tex(r)} & ${tex(a)} & ${tex(b)} & ${tex(c)} & ${tex(d)} \\\\ & & ${tex(a * r)} & ${tex(B * r)} & ${tex(C * r)} \\\\ \\hline & ${tex(a)} & ${tex(B)} & ${tex(C)} & 0 \\end{array}`
    });
    steps.push({
      title: 'التحليل إلى جداء عاملين',
      description: 'ينتج التحليل:',
      mathLatex: `f(x) = ${xMinus(r)}\\left(${poly([a, B, C], ['x^{2}', 'x', ''])}\\right)`
    });

    const qs = solveQuadratic(a, B, C);
    const qd = B * B - 4 * a * C;
    steps.push({
      title: 'حل المعادلة التربيعية المتبقية',
      description: 'نحسب المميز ثم الجذرين:',
      mathLatex: aligned([
        `\\Delta &= ${par(B)}^{2} - 4\\cdot ${par(a)}\\cdot ${par(C)} = ${qd}`,
        ...qs.roots.map((rt, i) => {
          const rest = rt.exactLatex.slice(rt.exactLatex.indexOf('=') + 1).trim();
          return `${rt.isComplex ? 'z' : 'x'}_{${i + 2}} &= ${rest}`;
        })
      ])
    });

    roots.push({ label: 'x₁', exactLatex: `x_{1} = ${tex(r)}`, decimal: r });
    qs.roots.forEach((rt, i) => {
      roots.push({
        label: rt.isComplex ? `z${i === 0 ? '₂' : '₃'}` : `x${i === 0 ? '₂' : '₃'}`,
        exactLatex: rt.exactLatex.replace(/^[xz]_\{(\d|0)\}/, `${rt.isComplex ? 'z' : 'x'}_{${i + 2}}`),
        decimal: rt.decimal,
        isComplex: rt.isComplex
      });
    });
  } else {
    // Cardano
    const p = (3 * a * c - b * b) / (3 * a * a);
    const q = (2 * b ** 3 - 9 * a * b * c + 27 * a * a * d) / (27 * a ** 3);
    const D = (q * q) / 4 + p ** 3 / 27;

    steps.push({
      title: 'التحويل إلى الشكل المختزل (طريقة كاردانو)',
      description: 'نضع $x = t - \\dfrac{b}{3a}$ لحذف حد الدرجة الثانية:',
      mathLatex: aligned([
        `x &= t ${shift >= 0 ? '+' : '-'} ${tex(Math.abs(shift))}`,
        `t^{3} + pt + q &= 0`,
        `p &= \\dfrac{3ac - b^{2}}{3a^{2}} = ${tex(Number(p.toFixed(6)))}`,
        `q &= \\dfrac{2b^{3} - 9abc + 27a^{2}d}{27a^{3}} = ${tex(Number(q.toFixed(6)))}`
      ])
    });
    steps.push({
      title: 'مميز كاردانو',
      description: 'نحسب $D = \\dfrac{q^{2}}{4} + \\dfrac{p^{3}}{27}$:',
      mathLatex: `D = ${fnum(D)}`
    });

    if (Math.abs(D) < 1e-9) {
      if (Math.abs(q) < 1e-9) {
        roots.push({ label: 'x (ثلاثي)', exactLatex: `x_{1} = x_{2} = x_{3} = ${tex(shift)}`, decimal: shift });
      } else {
        const u = Math.cbrt(-q / 2);
        roots.push({ label: 'x₁', exactLatex: `x_{1} \\approx ${fnum(2 * u + shift)}`, decimal: 2 * u + shift });
        roots.push({ label: 'x₂ = x₃ (مضاعف)', exactLatex: `x_{2} = x_{3} \\approx ${fnum(-u + shift)}`, decimal: -u + shift });
      }
      steps.push({ title: 'الحالة D = 0', description: 'للمعادلة جذر مضاعف على الأقل.', mathLatex: 'D = 0' });
    } else if (D > 0) {
      const u = Math.cbrt(-q / 2 + Math.sqrt(D));
      const v = Math.cbrt(-q / 2 - Math.sqrt(D));
      const x1 = u + v + shift;
      const re = -(u + v) / 2 + shift;
      const im = Math.abs(((u - v) * Math.sqrt(3)) / 2);
      steps.push({
        title: 'الحالة D > 0',
        description: 'جذر حقيقي واحد وجذران مركبان مترافقان:',
        mathLatex: aligned([
          't &= \\sqrt[3]{-\\dfrac{q}{2} + \\sqrt{D}} + \\sqrt[3]{-\\dfrac{q}{2} - \\sqrt{D}}',
          `x_{1} &= t ${shift >= 0 ? '+' : '-'} ${tex(Math.abs(shift))} \\approx ${fnum(x1)}`
        ])
      });
      roots.push({ label: 'x₁ (حقيقي)', exactLatex: `x_{1} \\approx ${fnum(x1)}`, decimal: x1 });
      roots.push({ label: 'z₂', exactLatex: `z_{2} \\approx ${fnum(re)} + ${fnum(im)}i`, decimal: `${fnum(re)} + ${fnum(im)}i`, isComplex: true });
      roots.push({ label: 'z₃', exactLatex: `z_{3} \\approx ${fnum(re)} - ${fnum(im)}i`, decimal: `${fnum(re)} - ${fnum(im)}i`, isComplex: true });
    } else {
      const rr = Math.sqrt(-((p / 3) ** 3));
      const phi = Math.acos(Math.max(-1, Math.min(1, -q / (2 * rr))));
      const m = 2 * Math.cbrt(rr);
      const xs = [0, 1, 2].map((k) => m * Math.cos((phi + 2 * Math.PI * k) / 3) + shift);
      steps.push({
        title: 'الحالة D < 0 (الطريقة المثلثية)',
        description: 'ثلاثة جذور حقيقية متمايزة:',
        mathLatex: `x_{k} = 2\\sqrt{-\\dfrac{p}{3}}\\,\\cos\\!\\left(\\dfrac{1}{3}\\arccos\\!\\left(\\dfrac{3q}{2p}\\sqrt{-\\dfrac{3}{p}}\\right) - \\dfrac{2\\pi k}{3}\\right) ${shift >= 0 ? '+' : '-'} ${tex(Math.abs(shift))}`
      });
      xs.forEach((x, i) => roots.push({ label: `x${['₁', '₂', '₃'][i]}`, exactLatex: `x_{${i + 1}} \\approx ${fnum(x)}`, decimal: x }));
    }
  }

  const real = roots.filter((x) => !x.isComplex).map((x) => Number(x.decimal));
  const lo = Math.min(...real, shift) - 3;
  const hi = Math.max(...real, shift) + 3;

  return {
    type: 'deg3',
    equationLatex: eq,
    inflectionPoint: infl,
    steps,
    roots,
    plotData: buildPlot(
      f,
      lo,
      hi,
      real.map((x, i) => ({ x, label: `x${i + 1} = ${fnum(x)}` })),
      { x: shift, y: f(shift), label: 'نقطة الانعطاف' }
    )
  };
}

// ---------------------------------------------------------------- systems
const vmat = (rows: number[][]) => `\\begin{vmatrix} ${rows.map((r) => r.map(tex).join(' & ')).join(' \\\\ ')} \\end{vmatrix}`;

function matrixRank(source: number[][]): number {
  const rows = source.map((row) => [...row]);
  let rank = 0;
  for (let column = 0; column < rows[0].length && rank < rows.length; column++) {
    let pivot = rank;
    for (let row = rank + 1; row < rows.length; row++) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    if (Math.abs(rows[pivot][column]) < 1e-12) continue;
    [rows[rank], rows[pivot]] = [rows[pivot], rows[rank]];
    for (let row = rank + 1; row < rows.length; row++) {
      const factor = rows[row][column] / rows[rank][column];
      for (let col = column; col < rows[row].length; col++) rows[row][col] -= factor * rows[rank][col];
    }
    rank++;
  }
  return rank;
}

export function solveSystem2x2(a1: number, b1: number, c1: number, a2: number, b2: number, c2: number): EquationSolution {
  const D = a1 * b2 - a2 * b1;
  const Dx = c1 * b2 - c2 * b1;
  const Dy = a1 * c2 - a2 * c1;
  const sys = `\\begin{cases} ${poly([a1, b1], ['x', 'y'])} = ${tex(c1)} \\\\ ${poly([a2, b2], ['x', 'y'])} = ${tex(c2)} \\end{cases}`;

  if (D === 0) {
    const inf = matrixRank([[a1, b1], [a2, b2]]) === matrixRank([[a1, b1, c1], [a2, b2, c2]]);
    return {
      type: 'system2',
      equationLatex: sys,
      steps: [
        {
          title: 'المحدد الرئيسي معدوم',
          description: inf ? 'رتبة مصفوفة المعاملات تساوي رتبة المصفوفة الموسعة وتقل عن عدد المجاهيل: عدد غير منته من الحلول.' : 'رتبة المصفوفة الموسعة أكبر من رتبة مصفوفة المعاملات: الجملة مستحيلة.',
          mathLatex: `D = ${vmat([[a1, b1], [a2, b2]])} = 0`
        }
      ],
      roots: [{ label: 'الحل', exactLatex: inf ? '\\text{عدد غير منته من الحلول}' : 'S = \\emptyset', decimal: inf ? 'عدد غير منته من الحلول' : 'مستحيلة الحل' }]
    };
  }

  const x = Dx / D;
  const y = Dy / D;
  return {
    type: 'system2',
    equationLatex: sys,
    steps: [
      {
        title: 'المحدد الرئيسي D',
        description: 'محدد مصفوفة المعاملات:',
        mathLatex: aligned([`D &= ${vmat([[a1, b1], [a2, b2]])}`, `D &= ${par(a1)}\\cdot ${par(b2)} - ${par(a2)}\\cdot ${par(b1)} = ${D}`])
      },
      {
        title: 'المحددان D_x و D_y',
        description: 'نستبدل عمود المجهول بعمود الثوابت:',
        mathLatex: aligned([`D_{x} &= ${vmat([[c1, b1], [c2, b2]])} = ${Dx}`, `D_{y} &= ${vmat([[a1, c1], [a2, c2]])} = ${Dy}`])
      },
      {
        title: 'قاعدة كرامر',
        description: 'نقسم كل محدد فرعي على D:',
        mathLatex: aligned([`x &= \\dfrac{D_{x}}{D} = \\dfrac{${Dx}}{${D}} = ${tex(x)}`, `y &= \\dfrac{D_{y}}{D} = \\dfrac{${Dy}}{${D}} = ${tex(y)}`])
      }
    ],
    roots: [
      { label: 'x', exactLatex: `x = ${tex(x)}`, decimal: x },
      { label: 'y', exactLatex: `y = ${tex(y)}`, decimal: y }
    ]
  };
}

export function solveSystem3x3(matrix: number[][], constants: number[]): EquationSolution {
  const det3 = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

  const col = (i: number) => matrix.map((r, k) => r.map((v, j) => (j === i ? constants[k] : v)));
  const D = det3(matrix);
  const mx = col(0);
  const my = col(1);
  const mz = col(2);
  const Dx = det3(mx);
  const Dy = det3(my);
  const Dz = det3(mz);

  const sys = `\\begin{cases} ${matrix.map((r, i) => `${poly(r, ['x', 'y', 'z'])} = ${tex(constants[i])}`).join(' \\\\ ')} \\end{cases}`;

  if (D === 0) {
    const rankA = matrixRank(matrix);
    const rankAugmented = matrixRank(matrix.map((row, index) => [...row, constants[index]]));
    const compatible = rankA === rankAugmented;
    return {
      type: 'system3',
      equationLatex: sys,
      steps: [
        { title: 'المحدد الرئيسي معدوم', description: 'عندما يكون المحدد معدوماً نقارن رتبة مصفوفة المعاملات بالمصفوفة الموسعة.', mathLatex: `D = ${vmat(matrix)} = 0` },
        { title: 'دراسة توافق الجملة', description: compatible ? 'الرتبتان متساويتان وأصغر من عدد المجاهيل: للجملة عدد غير منته من الحلول.' : 'رتبة المصفوفة الموسعة أكبر من رتبة مصفوفة المعاملات: الجملة مستحيلة.', mathLatex: `\\operatorname{rg}(A) = ${rankA}, \\quad \\operatorname{rg}(A|b) = ${rankAugmented}` }
      ],
      roots: [{ label: 'الحل', exactLatex: compatible ? '\\text{عدد غير منته من الحلول}' : 'S = \\emptyset', decimal: compatible ? 'عدد غير منته من الحلول' : 'مستحيلة الحل' }]
    };
  }

  const x = Dx / D;
  const y = Dy / D;
  const z = Dz / D;
  return {
    type: 'system3',
    equationLatex: sys,
    steps: [
      { title: 'المحدد الرئيسي D', description: 'ننشر بالنسبة للسطر الأول:', mathLatex: `D = ${vmat(matrix)} = ${D}` },
      {
        title: 'المحددات الفرعية',
        description: 'نستبدل عمود كل مجهول بعمود الثوابت:',
        mathLatex: aligned([`D_{x} &= ${vmat(mx)} = ${Dx}`, `D_{y} &= ${vmat(my)} = ${Dy}`, `D_{z} &= ${vmat(mz)} = ${Dz}`])
      },
      {
        title: 'قاعدة كرامر',
        description: 'نقسم كل محدد فرعي على D:',
        mathLatex: aligned([`x &= \\dfrac{D_{x}}{D} = ${tex(x)}`, `y &= \\dfrac{D_{y}}{D} = ${tex(y)}`, `z &= \\dfrac{D_{z}}{D} = ${tex(z)}`])
      }
    ],
    roots: [
      { label: 'x', exactLatex: `x = ${tex(x)}`, decimal: x },
      { label: 'y', exactLatex: `y = ${tex(y)}`, decimal: y },
      { label: 'z', exactLatex: `z = ${tex(z)}`, decimal: z }
    ]
  };
}
