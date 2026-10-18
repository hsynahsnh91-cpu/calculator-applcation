import { SequenceSolution } from '../types/index.js';
import { tex, poly } from './equationSolver.js';

type Step = SequenceSolution['steps'][number];
type Term = SequenceSolution['firstTerms'][number];

// ------------------------------------------------------------- helpers
const aligned = (lines: string[]) => `\\begin{aligned} ${lines.join(' \\\\[6pt] ')} \\end{aligned}`;
const needsParen = (x: number) => x < 0 || tex(x).includes('frac');
const base = (x: number) => (needsParen(x) ? `\\left(${tex(x)}\\right)` : tex(x));
const par = (x: number) => (x < 0 ? `\\left(${tex(x)}\\right)` : tex(x));
const shiftN = (p: number) => (p === 0 ? 'n' : p > 0 ? `n - ${p}` : `n + ${-p}`);
const LIM = '\\lim_{n \\to +\\infty}';

function validateSequence(values: number[], start: number, end: number): void {
  if (!values.every(Number.isFinite)) throw new Error('يجب أن تكون معطيات المتتالية أعداداً منتهية.');
  if (!Number.isInteger(start) || !Number.isInteger(end) || end < 0) throw new Error('رتب الحدود يجب أن تكون أعداداً صحيحة ورتبة المجموع غير سالبة.');
  if (end < start) throw new Error('رتبة نهاية المجموع يجب ألا تقل عن رتبة البداية.');
}

function finiteSum(value: number): number {
  if (!Number.isFinite(value)) throw new Error('مجموع الحدود أكبر من المجال العددي المتاح. جرّب رتبة أصغر للمجموع.');
  return value;
}


function makeTerms(count: number, start: number, f: (n: number) => number): { terms: Term[]; chart: { n: number; value: number }[] } {
  const terms: Term[] = [];
  const chart: { n: number; value: number }[] = [];
  for (let n = start; n < start + count; n++) {
    const v = f(n);
    terms.push({ n, value: v, latex: tex(v) });
    chart.push({ n, value: v });
  }
  return { terms, chart };
}

// c·qⁿ  →  latex   (c=1 : qⁿ ; c=-1 : -qⁿ)
const coefPow = (c: number, q: number, exp: string) => {
  const p = `${base(q)}^{${exp}}`;
  if (c === 1) return p;
  if (c === -1) return `-${p}`;
  return `${tex(c)} \\cdot ${p}`;
};

// ------------------------------------------------------------- arithmetic
export function solveArithmeticSequence(params: { u1: number; r: number; startIndex?: number; calculateSumN?: number }): SequenceSolution {
  const { u1, r, startIndex: p = 1 } = params;
  const N = params.calculateSumN ?? 10;
  validateSequence([u1, r, p, N], p, N);

  const unAt = (n: number) => u1 + (n - p) * r;
  const closed = poly([r, u1 - p * r], ['n', '']);
  const generalLatex = `u_{n} = ${closed}`;

  const { terms, chart } = makeTerms(15, p, unAt);

  const count = N - p + 1;
  const uN = unAt(N);
  const sum = finiteSum((count * (u1 + uN)) / 2);

  let mono: SequenceSolution['monotony'];
  if (r > 0) mono = { type: 'strictly_increasing', title: 'متزايدة تماماً', explanationLatex: `u_{n+1} - u_{n} = r = ${tex(r)} > 0` };
  else if (r < 0) mono = { type: 'strictly_decreasing', title: 'متناقصة تماماً', explanationLatex: `u_{n+1} - u_{n} = r = ${tex(r)} < 0` };
  else mono = { type: 'constant', title: 'ثابتة', explanationLatex: 'u_{n+1} - u_{n} = r = 0' };

  const limVal: number | string = r === 0 ? u1 : r > 0 ? '+infinity' : '-infinity';
  const limTex = r === 0 ? tex(u1) : r > 0 ? '+\\infty' : '-\\infty';

  const steps: Step[] = [
    {
      title: 'عبارة الحد العام',
      text: 'نطبق قانون الحد العام للمتتالية الحسابية:',
      latex: aligned([
        `u_{n} &= u_{${p}} + (${shiftN(p)})\\, r`,
        `u_{n} &= ${tex(u1)} + (${shiftN(p)}) \\cdot ${par(r)}`,
        `u_{n} &= ${closed}`
      ])
    },
    {
      title: `المجموع من n = ${p} إلى n = ${N}`,
      text: `عدد الحدود: $${N} - ${p} + 1 = ${count}$`,
      latex: aligned([
        `u_{${N}} &= ${tex(uN)}`,
        `S &= \\sum_{k=${p}}^{${N}} u_{k} = \\dfrac{${count}}{2}\\left(u_{${p}} + u_{${N}}\\right)`,
        `S &= \\dfrac{${count}}{2}\\left(${tex(u1)} + ${par(uN)}\\right) = ${tex(sum)}`
      ])
    },
    {
      title: 'الرتابة والنهاية',
      text: mono.title + ':',
      latex: aligned([mono.explanationLatex, `${LIM} u_{n} = ${limTex}`])
    }
  ];

  return {
    type: 'arithmetic',
    name: 'متتالية حسابية',
    generalTermLatex: generalLatex,
    firstTerms: terms,
    sumFormulaLatex: `S = \\sum_{k=${p}}^{n} u_{k} = \\dfrac{n - ${p} + 1}{2}\\left(u_{${p}} + u_{n}\\right)`,
    sumValue: sum,
    limit: {
      latex: `${LIM} u_{n} = ${limTex}`,
      value: limVal,
      converges: r === 0,
      explanation: r === 0 ? `المتتالية ثابتة ونهايتها $${tex(u1)}$.` : `الأساس $r = ${tex(r)}$ ${r > 0 ? 'موجب' : 'سالب'} إذن المتتالية متباعدة.`
    },
    monotony: mono,
    boundedness: {
      isBounded: r === 0,
      isBoundedBelow: r >= 0,
      isBoundedAbove: r <= 0,
      lowerBound: r >= 0 ? u1 : undefined,
      upperBound: r <= 0 ? u1 : undefined,
      explanation: r === 0 ? 'محدودة من الأعلى ومن الأسفل.' : r > 0 ? `محدودة من الأسفل بحدها الأول $u_{${p}} = ${tex(u1)}$.` : `محدودة من الأعلى بحدها الأول $u_{${p}} = ${tex(u1)}$.`
    },
    steps,
    chartData: chart
  };
}

// ------------------------------------------------------------- geometric
export function solveGeometricSequence(params: { u1: number; q: number; startIndex?: number; calculateSumN?: number }): SequenceSolution {
  const { u1, q, startIndex: p = 1 } = params;
  const N = params.calculateSumN ?? 10;
  validateSequence([u1, q, p, N], p, N);

  const unAt = (n: number) => u1 === 0 ? 0 : u1 * Math.pow(q, n - p);
  const generalLatex = `u_{n} = ${coefPow(u1, q, shiftN(p))}`;
  const { terms, chart } = makeTerms(15, p, unAt);

  const count = N - p + 1;
  const sum = finiteSum(u1 === 0 ? 0 : q === 1 ? count * u1 : u1 * ((1 - Math.pow(q, count)) / (1 - q)));

  const sumFormula =
    q === 1
      ? `S = \\sum_{k=${p}}^{n} u_{k} = (n - ${p} + 1)\\, u_{${p}}`
      : `S = \\sum_{k=${p}}^{n} u_{k} = u_{${p}} \\cdot \\dfrac{1 - q^{\\,n - ${p} + 1}}{1 - q}`;

  const absLess = Math.abs(q) < 1;
  const converges = absLess || q === 1 || u1 === 0;
  let limVal: number | string;
  let limTex: string;
  let limExp: string;
  if (u1 === 0) {
    limVal = 0; limTex = '0'; limExp = 'الحد الأول معدوم فكل الحدود معدومة.';
  } else if (absLess) {
    limVal = 0; limTex = '0';
    limExp = `بما أن $|q| = ${tex(Math.abs(q))} < 1$ فإن $q^{n} \\to 0$ والمتتالية متقاربة نحو $0$. مجموع الحدود غير المنتهي: $S_{\\infty} = \\dfrac{u_{${p}}}{1 - q} = ${tex(u1 / (1 - q))}$.`;
  } else if (q === 1) {
    limVal = u1; limTex = tex(u1); limExp = `متتالية ثابتة نهايتها $${tex(u1)}$.`;
  } else if (q > 1) {
    limVal = u1 > 0 ? '+infinity' : '-infinity';
    limTex = u1 > 0 ? '+\\infty' : '-\\infty';
    limExp = `بما أن $q = ${tex(q)} > 1$ فإن المتتالية متباعدة.`;
  } else {
    limVal = 'undefined';
    limTex = '\\text{غير موجودة}';
    limExp = `بما أن $q = ${tex(q)} \\leq -1$ فإن إشارة الحدود تتناوب ولا تقبل نهاية.`;
  }

  let mono: SequenceSolution['monotony'];
  const ratioTex = `\\dfrac{u_{n+1}}{u_{n}} = q = ${tex(q)}`;
  if (u1 === 0 || q === 1) mono = { type: 'constant', title: 'ثابتة', explanationLatex: ratioTex };
  else if (q < 0) mono = { type: 'alternating', title: 'متناوبة الإشارة (غير رتيبة)', explanationLatex: ratioTex };
  else if (q === 0) mono = { type: 'constant', title: 'ثابتة ابتداءً من الحد الثاني', explanationLatex: ratioTex };
  else if ((q > 1 && u1 > 0) || (q < 1 && u1 < 0)) mono = { type: 'strictly_increasing', title: 'متزايدة تماماً', explanationLatex: ratioTex };
  else mono = { type: 'strictly_decreasing', title: 'متناقصة تماماً', explanationLatex: ratioTex };

  const steps: Step[] = [
    {
      title: 'عبارة الحد العام',
      text: 'نطبق قانون الحد العام للمتتالية الهندسية:',
      latex: aligned([`u_{n} &= u_{${p}} \\cdot q^{\\,${shiftN(p)}}`, `u_{n} &= ${coefPow(u1, q, shiftN(p))}`])
    },
    {
      title: `المجموع من n = ${p} إلى n = ${N}`,
      text: `عدد الحدود: $${N} - ${p} + 1 = ${count}$`,
      latex:
        q === 1
          ? `S = ${count} \\times ${tex(u1)} = ${tex(sum)}`
          : aligned([
              `S &= u_{${p}} \\cdot \\dfrac{1 - q^{${count}}}{1 - q}`,
              `S &= ${tex(u1)} \\cdot \\dfrac{1 - ${base(q)}^{${count}}}{1 - ${par(q)}}`,
              `S &= ${tex(sum)}`
            ])
    },
    {
      title: 'الرتابة والنهاية',
      text: mono.title + ':',
      latex: aligned([mono.explanationLatex, `${LIM} u_{n} = ${limTex}`])
    }
  ];

  return {
    type: 'geometric',
    name: 'متتالية هندسية',
    generalTermLatex: generalLatex,
    firstTerms: terms,
    sumFormulaLatex: sumFormula,
    sumValue: sum,
    limit: { latex: `${LIM} u_{n} = ${limTex}`, value: limVal, converges, explanation: limExp },
    monotony: mono,
    boundedness: {
      isBounded: Math.abs(q) <= 1 || u1 === 0,
      isBoundedBelow: Math.abs(q) <= 1 || u1 === 0 || (q > 1 && u1 > 0),
      isBoundedAbove: Math.abs(q) <= 1 || u1 === 0 || (q > 1 && u1 < 0),
      explanation: Math.abs(q) <= 1 ? 'محدودة لأن $|q| \\leq 1$.' : 'غير محدودة.'
    },
    steps,
    chartData: chart
  };
}

// ------------------------------------------------------------- u_{n+1} = a·u_n + b
export function solveRecurrenceType1(params: { u0: number; a: number; b: number; calculateSumN?: number }): SequenceSolution {
  const { u0, a, b } = params;
  const N = params.calculateSumN ?? 10;
  validateSequence([u0, a, b, N], 0, N);

  if (a === 1) {
    const s = solveArithmeticSequence({ u1: u0, r: b, startIndex: 0, calculateSumN: N });
    return { ...s, name: 'متتالية حسابية (a = 1)' };
  }

  const l = b / (1 - a);
  const v0 = u0 - l;

  const { terms, chart } = (() => {
    const t: Term[] = [];
    const c: { n: number; value: number }[] = [];
    let cur = u0;
    for (let n = 0; n <= 15; n++) {
      t.push({ n, value: cur, latex: tex(cur) });
      c.push({ n, value: cur });
      cur = a * cur + b;
    }
    return { terms: t, chart: c };
  })();

  const vnLatex = `v_{n} = ${coefPow(v0, a, 'n')}`;
  const lPart = l === 0 ? '' : l > 0 ? ` + ${tex(l)}` : ` - ${tex(-l)}`;
  const unLatex = v0 === 0 ? `u_{n} = ${tex(l)}` : `u_{n} = ${coefPow(v0, a, 'n')}${lPart}`;

  const count = N + 1;
  const sum = finiteSum(v0 === 0 ? count * l : v0 * ((1 - Math.pow(a, count)) / (1 - a)) + count * l);

  const converges = Math.abs(a) < 1 || v0 === 0;
  let limTex: string;
  let limVal: number | string;
  if (converges) { limTex = tex(l); limVal = l; }
  else if (a > 1) { limTex = v0 > 0 ? '+\\infty' : '-\\infty'; limVal = v0 > 0 ? '+infinity' : '-infinity'; }
  else { limTex = '\\text{غير موجودة}'; limVal = 'undefined'; }

  let mono: SequenceSolution['monotony'];
  const diffTex = `u_{n+1} - u_{n} = v_{0}\\,(a - 1)\\,a^{\\,n} = ${tex(v0 * (a - 1))} \\cdot ${base(a)}^{n}`;
  if (v0 === 0) mono = { type: 'constant', title: 'ثابتة', explanationLatex: 'u_{n+1} - u_{n} = 0' };
  else if (a < 0) mono = { type: 'alternating', title: 'غير رتيبة (متذبذبة حول النقطة الصامدة)', explanationLatex: diffTex };
  else if (a === 0) mono = { type: 'constant', title: 'ثابتة ابتداءً من الحد الثاني', explanationLatex: 'u_{n} = l \\quad (n \\geq 1)' };
  else if (v0 * (a - 1) > 0) mono = { type: 'strictly_increasing', title: 'متزايدة تماماً', explanationLatex: diffTex };
  else mono = { type: 'strictly_decreasing', title: 'متناقصة تماماً', explanationLatex: diffTex };

  const steps: Step[] = [
    {
      title: 'النقطة الصامدة l',
      text: 'نحل المعادلة $l = a\\,l + b$:',
      latex: aligned([`l &= ${par(a)}\\, l + ${par(b)}`, `l\\,(1 - ${par(a)}) &= ${tex(b)}`, `l &= \\dfrac{${tex(b)}}{1 - ${par(a)}} = ${tex(l)}`])
    },
    {
      title: 'المتتالية الهندسية المساعدة',
      text: `نعرّف $v_{n} = u_{n} - l$ فنجد أنها هندسية أساسها $q = ${tex(a)}$:`,
      latex: aligned([
        `v_{n+1} &= u_{n+1} - l`,
        `&= a\\,u_{n} + b - l`,
        `&= a\\,\\left(u_{n} - l\\right)`,
        `&= ${par(a)}\\, v_{n}`
      ])
    },
    {
      title: 'عبارة الحد العام',
      text: `الحد الأول: $v_{0} = u_{0} - l = ${tex(u0)} - ${par(l)} = ${tex(v0)}$`,
      latex: aligned([vnLatex.replace('v_{n} =', 'v_{n} &='), `u_{n} &= v_{n} + l`, unLatex.replace('u_{n} =', '&=')])
    },
    {
      title: 'النهاية والتقارب',
      text: converges ? `بما أن $|a| < 1$ فإن $a^{n} \\to 0$ ومنه التقارب نحو النقطة الصامدة.` : 'المتتالية لا تتقارب.',
      latex: `${LIM} u_{n} = ${limTex}`
    },
    {
      title: `المجموع من n = 0 إلى n = ${N}`,
      text: 'نجمع المتتالية الهندسية $v_{n}$ ثم نضيف الثابت $l$:',
      latex: aligned([
        `S &= \\sum_{k=0}^{${N}} u_{k} = v_{0}\\,\\dfrac{1 - a^{${count}}}{1 - a} + ${count}\\, l`,
        `S &= ${tex(sum)}`
      ])
    }
  ];

  return {
    type: 'recurrence1',
    name: 'متتالية تراجعية خطية من الرتبة الأولى',
    generalTermLatex: unLatex,
    firstTerms: terms,
    sumFormulaLatex: `S = \\sum_{k=0}^{n} u_{k} = v_{0}\\,\\dfrac{1 - a^{\\,n+1}}{1 - a} + (n + 1)\\, l`,
    sumValue: sum,
    limit: {
      latex: `${LIM} u_{n} = ${limTex}`,
      value: limVal,
      converges,
      explanation: converges ? `تتقارب نحو النقطة الصامدة $l = ${tex(l)}$.` : 'المتتالية متباعدة.'
    },
    monotony: mono,
    boundedness: {
      isBounded: Math.abs(a) <= 1 || v0 === 0,
      isBoundedBelow: Math.abs(a) <= 1 || v0 === 0 || (a > 1 && v0 > 0),
      isBoundedAbove: Math.abs(a) <= 1 || v0 === 0 || (a > 1 && v0 < 0),
      explanation: Math.abs(a) <= 1 ? `محدودة لأن $|a| \\leq 1$.` : 'غير محدودة.'
    },
    auxiliarySequence: {
      name: 'v_n',
      formulaLatex: vnLatex,
      reason: `متتالية هندسية أساسها $q = ${tex(a)}$ وحدها الأول $v_{0} = ${tex(v0)}$.`
    },
    steps,
    chartData: chart
  };
}
