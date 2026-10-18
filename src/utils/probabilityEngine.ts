import { erf as mathErf } from 'mathjs';
import { DescriptiveStatsResult } from '../types/index.js';
// exact arithmetic helpers reused by the random-variable module

// Safe LaTeX for any number: huge values become a × 10^b instead of "1.5e+306"
// (raw exponent strings made KaTeX render empty/!white boxes! and froze the UI)
export function numToLatex(v: number): string {
  if (!isFinite(v)) throw new Error('الناتج كبير جداً ولا يمكن تمثيله بدقة. جرّب قيمة أصغر للعدد n.');
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v);
  const [m, e] = v.toExponential(6).split('e');
  return `${Number(m)} \\times 10^{${Number(e)}}`;
}

// Factorial n!
export function factorial(n: number): number {
  if (n < 0 || !Number.isInteger(n)) throw new Error('العاملي معرف فقط للأعداد الطبيعية (0, 1, 2, ...)');
  if (n > 170) throw new Error('القيمة كبيرة جداً: أكبر عاملي يمكن حسابه بدقة هو ‎170!‎');
  if (n === 0 || n === 1) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) {
    res *= i;
  }
  return res;
}

// Permutations P(n, k) = A_n^k
export function permutations(n: number, k: number): number {
  if (n < 0 || k < 0 || k > n || !Number.isSafeInteger(n) || !Number.isSafeInteger(k)) {
    throw new Error('شروط التراتيب: n ≥ k ≥ 0 وأعداد صحيحة');
  }
  if (k === 0) return 1;
  let res = 1;
  for (let i = 0; i < k; i++) {
    res *= (n - i);
    if (!Number.isFinite(res)) throw new Error('الناتج أكبر من المجال العددي المدعوم. جرّب قيماً أصغر.');
  }
  return res;
}

// Combinations C(n, k) = \binom{n}{k}
export function combinations(n: number, k: number): number {
  if (n < 0 || k < 0 || k > n || !Number.isSafeInteger(n) || !Number.isSafeInteger(k)) {
    throw new Error('شروط التوافيق: n ≥ k ≥ 0 وأعداد صحيحة');
  }
  if (k === 0 || k === n) return 1;
  const effK = Math.min(k, n - k);
  // Integer arithmetic keeps all urn counts exact before converting to Number.
  let result = 1n;
  for (let i = 1; i <= effK; i++) {
    result = result * BigInt(n - effK + i) / BigInt(i);
    if (!Number.isFinite(Number(result))) throw new Error('الناتج أكبر من المجال العددي المدعوم. جرّب قيماً أصغر.');
  }
  return Number(result);
}

function gcdInt(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

// safe combinations: returns 0 when k > n instead of throwing
function safeComb(n: number, k: number): number {
  return k < 0 || k > n ? 0 : combinations(n, k);
}
function safePerm(n: number, k: number): number {
  return k < 0 || k > n ? 0 : permutations(n, k);
}

// ===================================================================
// Urn / Ball Drawing Solver — any number of colours, every event listed
// ===================================================================
export type DrawMode = 'simultaneous' | 'successive_without_rep' | 'successive_with_rep';

export interface UrnColor {
  name: string;
  count: number;
}

export interface UrnEvent {
  id: string;
  group: string;          // Arabic group title used to organise the cards
  eventTitle: string;
  description: string;
  favorableCount: number;
  probabilityDec: number;
  probabilityFracLatex: string;
  stepLatex: string;
}

export interface UrnResult {
  totalBalls: number;
  drawCount: number;
  drawMode: DrawMode;
  omegaCount: number;
  omegaFormulaLatex: string;
  drawModeTitle: string;
  colors: UrnColor[];
  events: UrnEvent[];
  /** kept for backward compatibility with the history */
  probabilities: UrnEvent[];
}

// Count of favourable outcomes when the draw contains exactly k_i balls of colour i (vector ks)
// simultaneous           : Π C(n_i, k_i)
// successive w/o return  : (p! / Π k_i!) · Π A(n_i, k_i)
// successive with return : (p! / Π k_i!) · Π n_i^{k_i}
function countOutcomes(ks: number[], ns: number[], p: number, mode: DrawMode): number {
  let prod = 1;
  for (let i = 0; i < ns.length; i++) {
    const k = ks[i];
    const n = ns[i];
    if (k === 0) continue;
    if (mode === 'simultaneous') prod *= safeComb(n, k);
    else if (mode === 'successive_without_rep') prod *= safePerm(n, k);
    else prod *= Math.pow(n, k);
    if (prod === 0) return 0;
  }
  if (mode === 'simultaneous') return prod;
  // arrangements of the colour pattern among the p positions (multinomial)
  let multi = factorial(p);
  for (const k of ks) multi /= factorial(k);
  return Math.round(prod * multi);
}

// LaTeX for the favourable count of one colour vector
function outcomesLatex(ks: number[], ns: number[], p: number, mode: DrawMode): string {
  const parts: string[] = [];
  for (let i = 0; i < ns.length; i++) {
    const k = ks[i];
    if (k === 0) continue;
    if (mode === 'simultaneous') parts.push(`\\binom{${ns[i]}}{${k}}`);
    else if (mode === 'successive_without_rep') parts.push(`A_{${ns[i]}}^{${k}}`);
    else parts.push(`${ns[i]}^{${k}}`);
  }
  const body = parts.length ? parts.join(' \\times ') : '1';
  if (mode === 'simultaneous') return body;
  const denom = ks.filter((k) => k > 1).map((k) => `${k}!`).join('\\,');
  const multinomial = denom ? `\\dfrac{${p}!}{${denom}}` : (ks.filter((k) => k > 0).length > 1 ? `${p}!` : '');
  return multinomial ? `${multinomial} \\times ${body}` : body;
}

// all integer vectors (k_1..k_m) with Σk = p and 0 ≤ k_i ≤ cap_i
function compositions(m: number, p: number, caps: number[]): number[][] {
  const out: number[][] = [];
  const cur: number[] = new Array(m).fill(0);
  let visited = 0;
  const rec = (i: number, left: number) => {
    if (++visited > 10000 || out.length >= 500) throw new Error('عدد توزيعات الألوان كبير جداً لعرض جميع الأحداث. قلل عدد الألوان أو عدد الكرات المسحوبة.');
    if (left > caps.slice(i).reduce((sum, count) => sum + count, 0)) return;
    if (i === m - 1) {
      if (left <= caps[i]) {
        cur[i] = left;
        out.push([...cur]);
      }
      return;
    }
    for (let k = 0; k <= Math.min(left, caps[i]); k++) {
      cur[i] = k;
      rec(i + 1, left - k);
    }
  };
  rec(0, p);
  return out;
}

export function solveUrnExperiment(
  colorsIn: UrnColor[],
  drawCount: number,
  drawMode: DrawMode
): UrnResult {
  if (colorsIn.length > 50) throw new Error('لعرض جميع الأحداث يجب ألا يتجاوز عدد الألوان 50.');
  if (!Number.isSafeInteger(drawCount) || colorsIn.some((color) => !Number.isSafeInteger(color.count) || color.count < 0)) throw new Error('عدد الكرات وعدد مرات السحب يجب أن يكونا عددين صحيحين غير سالبين.');
  const colors = colorsIn
    .map((c, i) => ({ name: (c.name || '').trim() || `لون ${i + 1}`, count: Math.max(0, Math.floor(c.count || 0)) }))
    .filter((c) => c.count > 0);
  const m = colors.length;
  const ns = colors.map((c) => c.count);
  const total = ns.reduce((a, b) => a + b, 0);
  const p = Math.floor(drawCount);

  if (!Number.isSafeInteger(total)) throw new Error('إجمالي عدد الكرات أكبر من المجال الصحيح الآمن.');
  if (total === 0) throw new Error('يجب أن يحتوي الصندوق على كرة واحدة على الأقل');
  if (p <= 0) throw new Error('يجب سحب كرة واحدة على الأقل');
  if (drawMode !== 'successive_with_rep' && p > total) {
    throw new Error(`لا يمكن سحب ${p} كرات من صندوق يحتوي على ${total} كرات دون إعادة`);
  }
  if (p > 12) throw new Error('لعرض جميع الأحداث بدقة تامة يجب ألا يتجاوز عدد الكرات المسحوبة 12');

  let omegaCount = 0;
  let omegaFormulaLatex = '';
  let drawModeTitle = '';
  if (drawMode === 'simultaneous') {
    drawModeTitle = 'سحب في آن واحد أو معاً (توافيق)';
    omegaCount = combinations(total, p);
    omegaFormulaLatex = `\\operatorname{Card}(\\Omega) = \\binom{${total}}{${p}} = ${omegaCount}`;
  } else if (drawMode === 'successive_without_rep') {
    drawModeTitle = 'سحب تتالي دون إعادة (تراتيب)';
    omegaCount = permutations(total, p);
    omegaFormulaLatex = `\\operatorname{Card}(\\Omega) = A_{${total}}^{${p}} = ${omegaCount}`;
  } else {
    drawModeTitle = 'سحب متتالٍ مع إعادة (ترتيب وتكرار مسموح)';
    omegaCount = Math.pow(total, p);
    omegaFormulaLatex = `\\operatorname{Card}(\\Omega) = ${total}^{${p}} = ${omegaCount}`;
  }
  if (omegaCount > 9e15 || !isFinite(omegaCount)) {
    throw new Error('الأعداد كبيرة جداً: لضمان دقة تامة يجب أن يكون عدد الإمكانيات أقل من 9×10^15');
  }

  const frac = (fav: number): { dec: number; fracLatex: string } => {
    if (omegaCount === 0 || fav === 0) return { dec: 0, fracLatex: '0' };
    const g = gcdInt(fav, omegaCount);
    const n = fav / g;
    const d = omegaCount / g;
    return { dec: fav / omegaCount, fracLatex: d === 1 ? String(n) : `\\dfrac{${n}}{${d}}` };
  };
  const push = (ev: Omit<UrnEvent, 'probabilityDec' | 'probabilityFracLatex'>) => {
    const f = frac(ev.favorableCount);
    events.push({ ...ev, probabilityDec: f.dec, probabilityFracLatex: f.fracLatex });
  };
  const caps = drawMode === 'successive_with_rep' ? ns.map(() => p) : ns;
  const allPatterns = compositions(m, p, caps);
  const cnt = (ks: number[]) => countOutcomes(ks, ns, p, drawMode);
  const ltx = (ks: number[]) => outcomesLatex(ks, ns, p, drawMode);
  const vec = (i: number, k: number) => ns.map((_, j) => (j === i ? k : 0));
  const events: UrnEvent[] = [];
  let letter = 0;
  const L = () => { const index = letter++; return String.fromCharCode(65 + index % 26) + '′'.repeat(Math.floor(index / 26)); };

  // ---- 1) each colour : exactly k, none, at least one, all of that colour
  colors.forEach((c, i) => {
    const n = c.count;
    const others = total - n;
    const nameTex = `\\text{${c.name}}`;

    // exactly k of this colour, k = 1..p
    for (let k = 1; k <= Math.min(p, caps[i]); k++) {
      // favourable = ways(k of colour i) × ways(p−k of the others as one block)
      let fav = 0;
      let latex = '';
      if (drawMode === 'simultaneous') {
        fav = safeComb(n, k) * safeComb(others, p - k);
        latex = `\\dfrac{\\binom{${n}}{${k}} \\times \\binom{${others}}{${p - k}}}{${omegaCount}}`;
      } else if (drawMode === 'successive_without_rep') {
        fav = safeComb(p, k) * safePerm(n, k) * safePerm(others, p - k);
        latex = `\\dfrac{\\binom{${p}}{${k}} \\times A_{${n}}^{${k}} \\times A_{${others}}^{${p - k}}}{${omegaCount}}`;
      } else {
        fav = safeComb(p, k) * Math.pow(n, k) * Math.pow(others, p - k);
        latex = `\\dfrac{\\binom{${p}}{${k}} \\times ${n}^{${k}} \\times ${others}^{${p - k}}}{${omegaCount}}`;
      }
      const id = L();
      push({
        id,
        group: `كرات ${c.name}`,
        eventTitle: `${id}: سحب ${k === 1 ? 'كرة واحدة' : `${k} كرات`} ${c.name} بالضبط`,
        description: k === p ? `كل الكرات المسحوبة ${c.name}` : `${k} من ${c.name} والباقي (${p - k}) من الألوان الأخرى`,
        favorableCount: fav,
        stepLatex: `P(${id}) = ${latex} = ${frac(fav).fracLatex}`
      });
    }

    // none of this colour
    let noneFav = 0;
    let noneLatex = '';
    if (drawMode === 'simultaneous') { noneFav = safeComb(others, p); noneLatex = `\\dfrac{\\binom{${others}}{${p}}}{${omegaCount}}`; }
    else if (drawMode === 'successive_without_rep') { noneFav = safePerm(others, p); noneLatex = `\\dfrac{A_{${others}}^{${p}}}{${omegaCount}}`; }
    else { noneFav = Math.pow(others, p); noneLatex = `\\dfrac{${others}^{${p}}}{${omegaCount}}`; }
    const idNone = L();
    push({
      id: idNone,
      group: `كرات ${c.name}`,
      eventTitle: `${idNone}: عدم سحب أي كرة ${c.name}`,
      description: `كل الكرات المسحوبة من الألوان الأخرى (${others} كرة)`,
      favorableCount: noneFav,
      stepLatex: `P(${idNone}) = ${noneLatex} = ${frac(noneFav).fracLatex}`
    });

    // at least one of this colour (complement)
    const atLeast = omegaCount - noneFav;
    const idAL = L();
    push({
      id: idAL,
      group: `كرات ${c.name}`,
      eventTitle: `${idAL}: سحب كرة ${c.name} واحدة على الأقل`,
      description: `نستعمل الحدث المعاكس: $P(${idAL}) = 1 - P(${idNone})$`,
      favorableCount: atLeast,
      stepLatex: `P(${idAL}) = 1 - P(${idNone}) = 1 - \\dfrac{${noneFav}}{${omegaCount}} = \\dfrac{${atLeast}}{${omegaCount}} = ${frac(atLeast).fracLatex}`
    });
    void nameTex;
  });

  // ---- 2) all balls same colour (any colour)
  if (m > 1) {
    const parts = colors.map((_, i) => cnt(vec(i, p)));
    const favSame = parts.reduce((a, b) => a + b, 0);
    const idS = L();
    push({
      id: idS,
      group: 'أحداث مشتركة بين الألوان',
      eventTitle: `${idS}: كل الكرات المسحوبة من نفس اللون`,
      description: `كلها ${colors.map((c) => c.name).join('، أو كلها ')}`,
      favorableCount: favSame,
      stepLatex: `P(${idS}) = \\dfrac{${colors.map((_, i) => ltx(vec(i, p))).join(' + ')}}{${omegaCount}} = \\dfrac{${favSame}}{${omegaCount}} = ${frac(favSame).fracLatex}`
    });

    // ---- 3) at least two different colours (complement of same colour)
    const favDiff = omegaCount - favSame;
    const idD = L();
    push({
      id: idD,
      group: 'أحداث مشتركة بين الألوان',
      eventTitle: `${idD}: الكرات المسحوبة ليست كلها من نفس اللون`,
      description: `الحدث المعاكس للحدث ${idS}: لونان مختلفان على الأقل`,
      favorableCount: favDiff,
      stepLatex: `P(${idD}) = 1 - P(${idS}) = \\dfrac{${favDiff}}{${omegaCount}} = ${frac(favDiff).fracLatex}`
    });

    // ---- 4) every colour present (only when p ≥ m)
    if (p >= m) {
      const allPresent = allPatterns.filter((ks) => ks.every((k) => k > 0));
      const favAll = allPresent.reduce((s, ks) => s + cnt(ks), 0);
      const idE = L();
      push({
        id: idE,
        group: 'أحداث مشتركة بين الألوان',
        eventTitle: `${idE}: سحب كرة واحدة على الأقل من كل لون`,
        description: `تظهر جميع الألوان (${colors.map((c) => c.name).join('، ')}) في السحب`,
        favorableCount: favAll,
        stepLatex: `P(${idE}) = \\dfrac{${allPresent.length <= 4 ? allPresent.map((ks) => ltx(ks)).join(' + ') : favAll}}{${omegaCount}} = ${frac(favAll).fracLatex}`
      });
    }

    // ---- 5) every colour pattern (full distribution)
    for (const ks of allPatterns) {
      const nonZero = ks.map((k, i) => ({ k, i })).filter((x) => x.k > 0);
      if (nonZero.length < 2) continue; // single-colour patterns already listed above
      const fav = cnt(ks);
      const idP = L();
      push({
        id: idP,
        group: 'توزيع الألوان في السحب',
        eventTitle: `${idP}: ${nonZero.map((x) => `${x.k} ${colors[x.i].name}`).join(' + ')}`,
        description: 'عدد الكرات من كل لون بالضبط',
        favorableCount: fav,
        stepLatex: `P(${idP}) = \\dfrac{${ltx(ks)}}{${omegaCount}} = \\dfrac{${fav}}{${omegaCount}} = ${frac(fav).fracLatex}`
      });
    }
  }

  // ---- 6) order-specific event for successive draws (first ball colour)
  if (drawMode !== 'simultaneous' && m > 1) {
    colors.forEach((c) => {
      const fav = drawMode === 'successive_with_rep'
        ? c.count * Math.pow(total, p - 1)
        : c.count * safePerm(total - 1, p - 1);
      const idF = L();
      push({
        id: idF,
        group: 'أحداث مرتبطة بالترتيب',
        eventTitle: `${idF}: الكرة الأولى ${c.name}`,
        description: 'في السحب المتتالي يُؤخذ ترتيب الكرات بعين الاعتبار',
        favorableCount: fav,
        stepLatex: drawMode === 'successive_with_rep'
          ? `P(${idF}) = \\dfrac{${c.count} \\times ${total}^{${p - 1}}}{${omegaCount}} = ${frac(fav).fracLatex}`
          : `P(${idF}) = \\dfrac{${c.count} \\times A_{${total - 1}}^{${p - 1}}}{${omegaCount}} = ${frac(fav).fracLatex}`
      });
    });
  }

  return {
    totalBalls: total,
    drawCount: p,
    drawMode,
    omegaCount,
    omegaFormulaLatex,
    drawModeTitle,
    colors,
    events,
    probabilities: events
  };
}

// Binomial Distribution B(n, p)
// ============================================================================
// المتغير العشوائي المرفق بتجربة السحب (كما يطلب السلّم السوري)
// X = عدد الكرات المسحوبة من لون محدد
// ============================================================================
export interface RandomVariableResult {
  colorName: string;
  values: { k: number; pTex: string; pVal: number }[];
  tableTex: string;
  lawName: string;
  lawTex: string;
  mean: number;
  expectation: number;
  variance: number;
  sigma: number;
  eTex: string;
  evTex: string;
  sigmaTex: string;
  checks: { title: string; text: string; latex: string }[];
}

const reduceFrac = (num: number, den: number): [number, number] => {
  if (den === 0) return [0, 1];
  let n = num;
  let d = den;
  if (d < 0) { n = -n; d = -d; }
  const g = gcdInt(Math.abs(n), d) || 1;
  return [n / g, d / g];
};

const fracTex = (num: number, den: number): string => {
  const [n, d] = reduceFrac(num, den);
  if (n === 0) return '0';
  if (d === 1) return String(n);
  const sign = n < 0 ? '-' : '';
  return `${sign}\\dfrac{${Math.abs(n)}}{${d}}`;
};

export function randomVariableOfDraw(
  colors: UrnColor[],
  drawCount: number,
  drawMode: DrawMode,
  colorIndex: number
): RandomVariableResult | null {
  try {
    const idx = Math.min(Math.max(colorIndex, 0), colors.length - 1);
    const chosen = colors[idx];
    if (!chosen) return null;
    const nC = chosen.count;
    const total = colors.reduce((s, c) => s + c.count, 0);
    const others = total - nC;
    const p = drawCount;
    if (total <= 0 || p <= 0) return null;

    let omega = 0;
    if (drawMode === 'simultaneous') omega = combinations(total, p);
    else if (drawMode === 'successive_without_rep') omega = permutations(total, p);
    else omega = Math.pow(total, p);
    if (omega <= 0 || omega > 9e15) return null;

    const maxK = drawMode === 'successive_with_rep' ? p : Math.min(p, nC);
    const values: RandomVariableResult['values'] = [];
    const checks: RandomVariableResult['checks'] = [];
    let sumP = 0;
    let mean = 0;
    let ex2 = 0;

    const fav = (k: number): number => {
      if (drawMode === 'simultaneous') return safeComb(nC, k) * safeComb(others, p - k);
      if (drawMode === 'successive_without_rep') return safeComb(p, k) * safePerm(nC, k) * safePerm(others, p - k);
      return safeComb(p, k) * Math.pow(nC, k) * Math.pow(others, p - k);
    };

    for (let k = 0; k <= maxK; k++) {
      const f = fav(k);
      sumP += f / omega;
      mean += (k * f) / omega;
      ex2 += ((k * k * f) / omega);
      values.push({ k, pTex: fracTex(f, omega), pVal: f / omega });
    }

    const variance = Math.max(0, ex2 - mean * mean);
    const sigma = Math.sqrt(variance);

    const lawName = drawMode === 'successive_with_rep'
      ? 'قانون برنولي (سحب مع إعادة) — توزيع ثنائي الحدين'
      : drawMode === 'simultaneous'
        ? 'توزيع فوقهندسي (سحب في آن واحد أو معاً)'
        : 'توزيع فوقهندسي (سحب تتالٍ دون إعادة)';

    const cols = values.map((v) => v.k);
    const header = cols.map((c) => String(c)).join(' & ');
    const probs = values.map((v) => v.pTex).join(' & ');
    const tableTex = `\\begin{array}{|c|${'c'.repeat(values.length)}|}\\hline \\textbf{x}_{i} & ${header} \\\\ \\hline P(X = x_{i}) & ${probs} \\\\ \\hline \\end{array}`;

    // closed-form law for the probability of each value (written as a formula)
    const lawTex = drawMode === 'successive_with_rep'
      ? `P(X = k) = \\binom{${p}}{k}\\left(\\dfrac{${nC}}{${total}}\\right)^{k}\\left(\\dfrac{${others}}{${total}}\\right)^{${p}-k}`
      : drawMode === 'simultaneous'
        ? `P(X = k) = \\dfrac{\\binom{${nC}}{k}\\binom{${others}}{${p}-k}}{\\binom{${total}}{${p}}}`
        : `P(X = k) = \\dfrac{\\binom{${p}}{k}\\, A_{${nC}}^{k}\\, A_{${others}}^{${p}-k}}{A_{${total}}^{${p}}}`;

    checks.push({
      title: 'التحقق من مجموع الاحتمالات',
      text: 'لا بد أن يكون مجموع كل الاحتمالات يساوي 1، وإلا كان الجدول ناقصاً:',
      latex: `\\sum_{k=0}^{${maxK}} P(X = k) = ${Number(sumP.toFixed(6))} \\quad ${Math.abs(sumP - 1) < 1e-6 ? '\\checkmark' : '\\text{ناقص! راجع المعطيات}'}`
    });

    if (drawMode === 'successive_with_rep') {
      const q = nC / total;
      checks.push({
        title: 'التحقق بقانون التوزيع الثنائي',
        text: 'لأن السحب مع إعادة فإن X يتبع قانون برنولي، ويمكن حساب الأمل والتباين مباشرة:',
        latex: `E(X) = ${p} \\times ${fracTex(nC, total)} = ${Number((p * q).toFixed(6))} \\ , \\ V(X) = ${p}\\,q(1-q) = ${Number((p * q * (1 - q)).toFixed(6))}`
      });
    } else if (total > 1) {
      const hyper = (p * nC) / total;
      const hyperV = p * (nC / total) * (1 - nC / total) * ((total - p) / (total - 1));
      checks.push({
        title: 'التحقق بقانون التوزيع فوقهندسي',
        text: 'عند السحب دون إعادة نستخدم الصيغ المعلومة للتوزيع فوقهندسي للمقارنة:',
        latex: `E(X) = ${p}\\cdot\\dfrac{${nC}}{${total}} = ${Number(hyper.toFixed(6))} \\ , \\ V(X) = ${Number(hyperV.toFixed(6))}`
      });
    }

    return {
      colorName: chosen.name || `اللون ${idx + 1}`,
      values,
      tableTex,
      lawName,
      lawTex,
      mean,
      expectation: mean,
      variance,
      sigma,
      eTex: `E(X) = \\sum_{k} x_{k}\\,P(X = x_{k}) = ${values.filter((v) => v.k !== 0).map((v) => `${v.k}\\cdot${v.pTex}`).join(' + ') || '0'} = ${Number(mean.toFixed(6))}`,
      evTex: `V(X) = E(X^{2}) - \\left(E(X)\\right)^{2} = ${Number(ex2.toFixed(6))} - \\left(${Number(mean.toFixed(6))}\\right)^{2} = ${Number(variance.toFixed(6))}`,
      sigmaTex: `\\sigma(X) = \\sqrt{V(X)} = \\sqrt{${Number(variance.toFixed(6))}} = ${Number(sigma.toFixed(6))}`,
      checks
    };
  } catch {
    return null;
  }
}

export function solveBinomialDistribution(n: number, p: number, k?: number): {
  n: number;
  p: number;
  q: number;
  mean: number;
  variance: number;
  stdDev: number;
  pk?: { k: number; pVal: number; latex: string };
  table: { k: number; pmf: number; cdf: number }[];
} {
  if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error('الاحتمال p يجب أن يكون بين 0 و 1');
  if (n < 0 || !Number.isInteger(n)) throw new Error('عدد المحاولات n يجب أن يكون عددًا صحيحًا غير سالب');
  if (n > 1000) throw new Error('لعرض التوزيع كاملاً يجب ألا يتجاوز عدد المحاولات 1000.');
  if (k !== undefined && (!Number.isInteger(k) || k < 0 || k > n)) throw new Error('عدد النجاحات k يجب أن يكون عدداً صحيحاً بين 0 و n.');
  const logFact = [0];
  for (let index = 1; index <= n; index++) logFact[index] = logFact[index - 1] + Math.log(index);
  const probabilityAt = (index: number) => p === 0 ? (index === 0 ? 1 : 0) : p === 1 ? (index === n ? 1 : 0)
    : Math.exp(logFact[n] - logFact[index] - logFact[n - index] + index * Math.log(p) + (n - index) * Math.log1p(-p));

  const q = 1 - p;
  const mean = n * p;
  const variance = n * p * q;
  const stdDev = Math.sqrt(variance);

  const table: { k: number; pmf: number; cdf: number }[] = [];
  let cumulative = 0;

  for (let i = 0; i <= n; i++) {
    const pmf = probabilityAt(i);
    cumulative += pmf;
    table.push({
      k: i,
      pmf,
      cdf: Math.min(1, cumulative)
    });
  }

  let pkData: { k: number; pVal: number; latex: string } | undefined;
  if (k !== undefined && k >= 0 && k <= n) {
    const pVal = probabilityAt(k);
    const latex = `P(X = ${k}) = \\binom{${n}}{${k}} (${p})^{${k}} (${Number(q.toFixed(4))})^{${n - k}} = ${Number(pVal.toFixed(6))}`;
    pkData = { k, pVal, latex };
  }

  return {
    n,
    p,
    q,
    mean,
    variance,
    stdDev,
    pk: pkData,
    table
  };
}

// Standard Normal Distribution Error Function erf
export function erf(x: number): number {
  // high-precision (~1e-16) implementation from mathjs
  return mathErf(x);
}

// Normal Cumulative Distribution Function Phi(z)
export function standardNormalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

// Normal Distribution Solver
export function solveNormalDistribution(mu: number, sigma: number, xVal?: number, aVal?: number, bVal?: number): {
  mu: number;
  sigma: number;
  singleX?: {
    x: number;
    z: number;
    pLess: number;
    pGreater: number;
    latex: string;
  };
  interval?: {
    a: number;
    b: number;
    zA: number;
    zB: number;
    pBetween: number;
    latex: string;
  };
  curvePoints: { x: number; density: number }[];
} {
  if (![mu, sigma, xVal ?? 0, aVal ?? 0, bVal ?? 0].every(Number.isFinite)) throw new Error('أدخل قيماً عددية منتهية للتوزيع الطبيعي.');
  if (sigma <= 0) throw new Error('الانحراف المعياري σ يجب أن يكون أكبر تماماً من 0');
  if (aVal !== undefined && bVal !== undefined && aVal > bVal) throw new Error('يجب ألا يتجاوز الحد السفلي a الحد العلوي b.');

  // Generate density curve points
  const curvePoints: { x: number; density: number }[] = [];

  for (let index = 0; index <= 100; index++) {
    const z = -4 + index * 0.08;
    const x = mu + z * sigma;
    const density = (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * z * z);
    if (![x, density].every(Number.isFinite)) throw new Error('معلمات التوزيع الطبيعي تتجاوز المجال العددي المتاح. جرّب قيماً ضمن مجال أصغر.');
    curvePoints.push({ x, density });
  }

  let singleXData;
  if (xVal !== undefined) {
    const z = (xVal - mu) / sigma;
    const pLess = standardNormalCdf(z);
    const pGreater = 1 - pLess;
    singleXData = {
      x: xVal,
      z: Number(z.toFixed(4)),
      pLess: Number(pLess.toFixed(6)),
      pGreater: Number(pGreater.toFixed(6)),
      latex: `Z = \\frac{${xVal} - ${mu}}{${sigma}} = ${Number(z.toFixed(4))} \\implies P(X \\le ${xVal}) = \\Phi(${Number(z.toFixed(4))}) = ${Number(pLess.toFixed(6))}`
    };
  }

  let intervalData;
  if (aVal !== undefined && bVal !== undefined) {
    const zA = (aVal - mu) / sigma;
    const zB = (bVal - mu) / sigma;
    const pBetween = Math.max(0, standardNormalCdf(zB) - standardNormalCdf(zA));
    intervalData = {
      a: aVal,
      b: bVal,
      zA: Number(zA.toFixed(4)),
      zB: Number(zB.toFixed(4)),
      pBetween: Number(pBetween.toFixed(6)),
      latex: `P(${aVal} \\le X \\le ${bVal}) = \\Phi(${Number(zB.toFixed(4))}) - \\Phi(${Number(zA.toFixed(4))}) = ${Number(pBetween.toFixed(6))}`
    };
  }

  return {
    mu,
    sigma,
    singleX: singleXData,
    interval: intervalData,
    curvePoints
  };
}

// Descriptive Statistics Engine
export function computeDescriptiveStats(numbers: number[]): DescriptiveStatsResult {
  if (numbers.length === 0) throw new Error('يجب إدخال قيم عددية لحساب الإحصاء');
  if (!numbers.every(Number.isFinite)) throw new Error('يجب أن تكون جميع القيم الإحصائية أعداداً منتهية.');

  const sorted = [...numbers].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / n;

  // Median
  let median = 0;
  if (n % 2 === 1) {
    median = sorted[Math.floor(n / 2)];
  } else {
    median = (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  }

  // Mode
  const counts: Record<number, number> = {};
  let maxCount = 0;
  for (const v of sorted) {
    counts[v] = (counts[v] || 0) + 1;
    if (counts[v] > maxCount) maxCount = counts[v];
  }
  const mode: number[] = [];
  if (maxCount > 1) {
    for (const [k, count] of Object.entries(counts)) {
      if (count === maxCount) mode.push(Number(k));
    }
  }

  // Variance & StdDev
  const ss = sorted.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0);
  const variancePop = ss / n;
  const varianceSample = n > 1 ? ss / (n - 1) : 0;
  const stdDevPop = Math.sqrt(variancePop);
  const stdDevSample = Math.sqrt(varianceSample);

  // Quartiles
  function getMedianOfSub(arr: number[]): number {
    if (arr.length === 0) return 0;
    const len = arr.length;
    if (len % 2 === 1) return arr[Math.floor(len / 2)];
    return (arr[len / 2 - 1] + arr[len / 2]) / 2;
  }

  const half = Math.floor(n / 2);
  const lowerHalf = sorted.slice(0, half);
  const upperHalf = n % 2 === 1 ? sorted.slice(half + 1) : sorted.slice(half);

  const q1 = n === 1 ? sorted[0] : getMedianOfSub(lowerHalf);
  const q3 = n === 1 ? sorted[0] : getMedianOfSub(upperHalf);
  const iqr = q3 - q1;

  const min = sorted[0];
  const max = sorted[n - 1];
  const range = max - min;

  // Histogram bins (Sturges' formula)
  const numBins = range === 0 ? 1 : Math.max(3, Math.min(10, Math.ceil(1 + Math.log2(n))));
  const binWidth = range === 0 ? 1 : range / numBins;
  const histogram: { bin: string; count: number; freq: number }[] = [];

  for (let i = 0; i < numBins; i++) {
    const bStart = min + i * binWidth;
    const bEnd = i === numBins - 1 ? max : min + (i + 1) * binWidth;
    const count = sorted.filter(v => i === numBins - 1 ? (v >= bStart && v <= bEnd) : (v >= bStart && v < bEnd)).length;
    histogram.push({
      bin: `[${Number(bStart.toFixed(1))}, ${Number(bEnd.toFixed(1))}${i === numBins - 1 ? ']' : '['}`,
      count,
      freq: Number((count / n).toFixed(4))
    });
  }

  return {
    n,
    sum: Number(sum.toFixed(4)),
    mean: Number(mean.toFixed(4)),
    median: Number(median.toFixed(4)),
    mode,
    variancePop: Number(variancePop.toFixed(4)),
    varianceSample: Number(varianceSample.toFixed(4)),
    stdDevPop: Number(stdDevPop.toFixed(4)),
    stdDevSample: Number(stdDevSample.toFixed(4)),
    min,
    max,
    range: Number(range.toFixed(4)),
    q1: Number(q1.toFixed(4)),
    q3: Number(q3.toFixed(4)),
    iqr: Number(iqr.toFixed(4)),
    dataSorted: sorted,
    histogram
  };
}
