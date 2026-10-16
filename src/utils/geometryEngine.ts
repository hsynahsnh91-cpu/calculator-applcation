// Solid geometry engine (Syrian curriculum: vectors in space, dot product, lines and planes).
// Exact vector algebra with snapping of famous values; every routine returns the verdict
// together with its worked steps.

export type V3 = [number, number, number];
export interface WorkStep { title: string; explanation: string; latex: string }
export interface Metric { label: string; latex: string }
export type Tone = 'ok' | 'warn' | 'bad' | 'info';
export interface Outcome { verdict: string; verdictLatex?: string; tone: Tone; metrics: Metric[]; steps: WorkStep[] }
export interface Plane { a: number; b: number; c: number; d: number } // a·x + b·y + c·z + d = 0
export interface LineP { P: V3; u: V3 }                               // M = P + t·u
export interface PlaneResult { plane: Plane | null; outcome: Outcome }
export interface LineResult { line: LineP | null; outcome: Outcome }

const EPS = 1e-9;
const isZ = (x: number): boolean => Math.abs(x) < EPS;

const gcd = (a: number, b: number): number => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
};

// ------------------------------------------------------------------ vector algebra
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (k: number, a: V3): V3 => [k * a[0], k * a[1], k * a[2]];
export const norm = (a: V3): number => Math.sqrt(dot(a, a));
export const zeroVec = (a: V3): boolean => a.every(isZ);
// Mixed product [u, v, w] = w·(u×v) = u·(v×w) = determinant of the three vectors as rows
export const mixed = (u: V3, v: V3, w: V3): number => dot(w, cross(u, v));

const clean = (x: number): number => (isZ(x) ? 0 : Math.abs(x - Math.round(x)) < 1e-9 ? Math.round(x) : x);
const cleanV = (a: V3): V3 => [clean(a[0]), clean(a[1]), clean(a[2])];
export const fmt = (x: number): string => String(Number(clean(x).toPrecision(10)));

// ------------------------------------------------------------------ exact LaTeX of numbers
// smallest rational p/q (q ≤ maxDen) equal to x within floating tolerance
function smallRational(x: number, maxDen: number): [number, number] | null {
  for (let q = 1; q <= maxDen; q++) {
    const p = Math.round(x * q);
    if (Math.abs(p / q - x) < 1e-10 * Math.max(1, Math.abs(x))) {
      const g = gcd(p, q) || 1;
      return [p / g, q / g];
    }
  }
  return null;
}

// n = k²·m with m square-free  →  √n = k√m
function squarefree(n: number): [number, number] {
  let k = 1;
  let r = n;
  for (let f = 2; f * f <= r; f++) {
    while (r % (f * f) === 0) {
      r /= f * f;
      k *= f;
    }
  }
  return [k, r];
}

// Exact display: integer, fraction, surd (√2, 2√3, √2/2 …) or a short decimal as last resort
export function texNum(x: number): string {
  const v = clean(x);
  if (v === 0) return '0';
  if (Number.isInteger(v)) return String(v);
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  const r = smallRational(a, 24);
  if (r) return `${sign}\\dfrac{${r[0]}}{${r[1]}}`;
  const t = smallRational(a * a, 64); // a = √(p/q) = √(pq)/q
  if (t) {
    const [k, m] = squarefree(t[0] * t[1]);
    const g = gcd(k, t[1]) || 1;
    const num = k / g;
    const den = t[1] / g;
    const body = `${num === 1 ? '' : num}\\sqrt{${m}}`;
    return `${sign}${den === 1 ? body : `\\dfrac{${body}}{${den}}`}`;
  }
  return `${sign}${String(Number(a.toPrecision(6)))}`;
}

const pr = (x: number): string => (x < 0 ? `\\left(${texNum(x)}\\right)` : texNum(x));
export const vecTex = (a: V3): string => `\\left(${a.map((x) => texNum(x)).join(',\\,')}\\right)`;
const al = (lines: string[]): string => `\\begin{aligned} ${lines.join(' \\\\[6pt] ')} \\end{aligned}`;
const SYM = ['x', 'y', 'z'];

// sum of terms [coefficient, symbol] written as a clean linear expression
function linear(terms: [number, string][]): string {
  let out = '';
  for (const [k, body] of terms) {
    if (isZ(k)) continue;
    const mag = Math.abs(k);
    const core = body === '' ? texNum(mag) : Math.abs(mag - 1) < EPS ? body : `${texNum(mag)}${body}`;
    out = out === '' ? `${k < 0 ? '-' : ''}${core}` : `${out} ${k < 0 ? '-' : '+'} ${core}`;
  }
  return out || '0';
}

export function planeTex(p: Plane): string {
  return `${linear([[p.a, 'x'], [p.b, 'y'], [p.c, 'z'], [p.d, '']])} = 0`;
}

// a(x − x_A) + b(y − y_A) + c(z − z_A) = 0
function pointNormalTex(n: V3, P: V3): string {
  return `${linear(n.map((k, i): [number, string] => [
    k,
    isZ(P[i]) ? SYM[i] : `\\left(${SYM[i]} ${P[i] < 0 ? '+' : '-'} ${texNum(Math.abs(P[i]))}\\right)`
  ]))} = 0`;
}

function paramTex(P0: number, u: number): string {
  if (isZ(u)) return texNum(P0);
  const mag = Math.abs(u);
  const term = `${Math.abs(mag - 1) < EPS ? '' : texNum(mag)}t`;
  if (isZ(P0)) return `${u < 0 ? '-' : ''}${term}`;
  return `${texNum(P0)} ${u < 0 ? '-' : '+'} ${term}`;
}

export function lineSystemTex(P: V3, u: V3): string {
  return `\\begin{cases} x=${paramTex(P[0], u[0])} \\\\ y=${paramTex(P[1], u[1])} \\\\ z=${paramTex(P[2], u[2])} \\end{cases},\\quad t\\in\\mathbb{R}`;
}

// ------------------------------------------------------------------ angles (famous values snapped)
const FAMOUS: [number, string][] = [
  [0, '0'], [30, '\\dfrac{\\pi}{6}'], [45, '\\dfrac{\\pi}{4}'], [60, '\\dfrac{\\pi}{3}'], [90, '\\dfrac{\\pi}{2}'],
  [120, '\\dfrac{2\\pi}{3}'], [135, '\\dfrac{3\\pi}{4}'], [150, '\\dfrac{5\\pi}{6}'], [180, '\\pi']
];
const FAMOUS_COS = [1, Math.sqrt(3) / 2, Math.SQRT1_2, 0.5, 0, -0.5, -Math.SQRT1_2, -Math.sqrt(3) / 2, -1];

export function snapCos(c: number): number {
  const clamped = Math.max(-1, Math.min(1, c));
  for (const f of FAMOUS_COS) if (Math.abs(clamped - f) < 1e-10) return f;
  return clamped;
}

export function snapDeg(deg: number): number {
  const f = FAMOUS.find(([d]) => Math.abs(deg - d) < 1e-6);
  return f ? f[0] : deg;
}

const famousTex = (deg: number): string | null => {
  const f = FAMOUS.find(([d]) => d === deg);
  return f ? f[1] : null;
};

/** θ = 60° = π/3 rad  (famous angles) or θ = 37.5° ≈ 0.6545 rad (others) */
const angleEq = (deg: number): string => {
  const famous = famousTex(deg);
  if (famous) return `${texNum(deg)}^{\\circ} = ${famous}\\ \\text{rad}`;
  const rad = (deg * Math.PI) / 180;
  return `${texNum(deg)}^{\\circ} \\approx ${String(Number(rad.toPrecision(5)))}\\ \\text{rad}`;
};

// ------------------------------------------------------------------ helpers
export const bad = (verdict: string, steps: WorkStep[] = []): Outcome => ({ verdict, tone: 'bad', metrics: [], steps });

// divide a plane equation with integer coefficients by their GCD and fix the sign
function reducePlane(p: Plane): Plane {
  const all = [p.a, p.b, p.c, p.d];
  if (!all.every((x) => Math.abs(x - Math.round(x)) < 1e-9)) return p;
  const ints = all.map((x) => Math.round(x));
  const g = ints.reduce((acc, x) => gcd(acc, x), 0);
  if (g === 0) return p;
  let q = ints.map((x) => x / g);
  const first = q.slice(0, 3).find((x) => x !== 0) ?? 1;
  if (first < 0) q = q.map((x) => -x);
  return { a: q[0], b: q[1], c: q[2], d: q[3] };
}

function planeMetrics(p: Plane): Metric[] {
  return [
    { label: 'متجه الناظم n', latex: `\\vec{n}=${vecTex(cleanV([p.a, p.b, p.c]))}` },
    { label: 'المعادلة العامة', latex: `\\Pi:\\;${planeTex(p)}` }
  ];
}

// ------------------------------------------------------------------ 1) linear dependence
export function linearDependence2(u: V3, v: V3): Outcome {
  const steps: WorkStep[] = [
    {
      title: 'نص الشرط',
      explanation: 'المتجهان غير المعدومين u و v مرتبطان خطياً إذا وُجد λ ∈ ℝ بحيث u = λv، أي أن مركباتهما متناسبة.',
      latex: `u=${vecTex(cleanV(u))},\\qquad v=${vecTex(cleanV(v))}`
    }
  ];
  if (zeroVec(u) || zeroVec(v)) {
    return {
      verdict: 'أحد المتجهين معدوم، فالمتجهان مرتبطان خطياً',
      tone: 'warn',
      metrics: [],
      steps: [...steps, { title: 'المتجه المعدوم', explanation: 'المتجه المعدوم مرتبط خطياً مع أي متجه، لأن 0 = 0·v.', latex: '0 = 0\\cdot v' }]
    };
  }
  steps.push({
    title: 'مقارنة النسب بين المركبات المتناظرة',
    explanation: 'إن كانت النسب بين المركبات المتناظرة متساوية فالمتجهان متوازيان، وإلا فهما غير مرتبطين خطياً.',
    latex: `\\dfrac{${texNum(u[0])}}{${texNum(v[0])}}\\overset{?}{=}\\dfrac{${texNum(u[1])}}{${texNum(v[1])}}\\overset{?}{=}\\dfrac{${texNum(u[2])}}{${texNum(v[2])}}`
  });

  const c = cross(u, v);
  steps.push({
    title: 'الجداء المتجهي u × v',
    explanation: 'الشرط المكافئ: u و v مرتبطان خطياً إذا وفقط إذا كان u × v = 0⃗.',
    latex: `u\\times v=${vecTex(cleanV(c))}`
  });

  if (c.every(isZ)) {
    const i = [0, 1, 2].find((k) => !isZ(v[k])) as number;
    const lambda = u[i] / v[i];
    steps.push({
      title: 'معامل التناسب λ',
      explanation: `نأخذ المركبة غير المعدومة رقم ${i + 1} من v ونحسب λ = u_${i + 1} ÷ v_${i + 1}.`,
      latex: `\\lambda=${texNum(lambda)}`
    });
    return {
      verdict: 'المتجهان مرتبطان خطياً (متوازيان)',
      verdictLatex: `u=${texNum(lambda)}\\,v`,
      tone: 'ok',
      metrics: [{ label: 'معامل التناسب λ', latex: `\\lambda=${texNum(lambda)}` }],
      steps
    };
  }
  steps.push({
    title: 'النتيجة',
    explanation: 'الجداء المتجهي غير معدوم، إذن لا يوجد λ يحقق u = λv.',
    latex: `u\\times v\\neq \\vec{0}`
  });
  return {
    verdict: 'المتجهان غير مرتبطين خطياً (غير متوازيين)',
    tone: 'info',
    metrics: [{ label: 'الجداء المتجهي u × v', latex: vecTex(cleanV(c)) }],
    steps
  };
}

export function linearDependence3(u: V3, v: V3, w: V3): Outcome {
  const d = clean(mixed(u, v, w));
  const rows = `${texNum(u[0])}&${texNum(u[1])}&${texNum(u[2])}\\\\${texNum(v[0])}&${texNum(v[1])}&${texNum(v[2])}\\\\${texNum(w[0])}&${texNum(w[1])}&${texNum(w[2])}`;
  const steps: WorkStep[] = [
    {
      title: 'المحدد المختلط',
      explanation: 'نضع المتجهات الثلاثة أسطراً في مصفوفة 3×3 ونحسب محددها، وهو الجداء المختلط [u, v, w] = u·(v×w).',
      latex: `[u,v,w]=\\begin{vmatrix} ${rows} \\end{vmatrix}`
    },
    {
      title: 'النشر بالنسبة للسطر الأول',
      explanation: 'ننشر المحدد وفق السطر الأول:',
      latex: al([
        `[u,v,w]&=u_{1}(v_{2}w_{3}-v_{3}w_{2})-u_{2}(v_{1}w_{3}-v_{3}w_{1})+u_{3}(v_{1}w_{2}-v_{2}w_{1})`,
        `&=${texNum(d)}`
      ])
    }
  ];
  if (isZ(d)) {
    return {
      verdict: 'المتجهات الثلاثة مرتبطة خطياً: تقع في مستوٍ واحد',
      tone: 'warn',
      metrics: [{ label: 'الجداء المختلط [u, v, w]', latex: `=${texNum(d)}` }],
      steps: [...steps, { title: 'الحكم', explanation: 'المحدد معدوم، فالمتجهات الثلاثة مرتبطة خطياً ولا تشكل أساساً للفضاء.', latex: '[u,v,w]=0' }]
    };
  }
  return {
    verdict: 'المتجهات الثلاثة مستقلة خطياً: تشكل أساساً للفضاء',
    tone: 'ok',
    metrics: [{ label: 'الجداء المختلط [u, v, w]', latex: `=${texNum(d)}` }],
    steps: [...steps, { title: 'الحكم', explanation: 'المحدد غير معدوم، فالمتجهات مستقلة خطياً وتشكل أساساً للفضاء R³.', latex: `[u,v,w]\\neq 0` }]
  };
}

// ------------------------------------------------------------------ 2) dot / cross / distances / angle
export function vectorOps(u: V3, v: V3, P: V3, Q: V3): Outcome {
  const PQ = sub(Q, P);
  const d2 = dot(PQ, PQ);
  const mid = mul(0.5, add(P, Q));
  const dt = dot(u, v);
  const c = cross(u, v);
  const steps: WorkStep[] = [
    { title: 'المتجه PQ', explanation: 'نطرح إحداثيات P من إحداثيات Q: PQ = Q − P.', latex: `\\overrightarrow{PQ}=Q-P=${vecTex(cleanV(PQ))}` },
    { title: 'المسافة PQ', explanation: 'بتطبيق فيثاغورس في الفضاء: PQ = √(x² + y² + z²).', latex: `PQ=\\sqrt{${fmt(d2)}}=${texNum(Math.sqrt(d2))}` },
    { title: 'منتصف القطعة PQ', explanation: 'نأخذ متوسط كل زوج من الإحداثيات المتناظرة.', latex: `M=\\left(\\dfrac{x_{P}+x_{Q}}{2},\\,\\dfrac{y_{P}+y_{Q}}{2},\\,\\dfrac{z_{P}+z_{Q}}{2}\\right)=${vecTex(cleanV(mid))}` },
    {
      title: 'الجداء السلمي u · v',
      explanation: 'مجموع جداءات المركبات المتناظرة، وناتجه عدد حقيقي (وليس متجهاً).',
      latex: `u\\cdot v=${u.map((x, i) => `(${pr(x)})(${pr(v[i])})`).join(' + ')}=${texNum(dt)}`
    },
    {
      title: 'الجداء المتجهي u × v',
      explanation: 'متجه عمودي على u وعلى v معاً، ومعياره يساوي مساحة متوازي الأضلاع المبني على u و v.',
      latex: `u\\times v=${vecTex(cleanV(c))}`
    }
  ];

  const nu = norm(u);
  const nv = norm(v);
  if (nu === 0 || nv === 0) {
    steps.push({ title: 'الزاوية بين المتجهين', explanation: 'لا تُعرَّف الزاوية عند وجود متجه معدوم.', latex: '\\theta\\ \\text{غير معرّفة}' });
    return { verdict: 'أحد المتجهين معدوم: الزاوية غير معرّفة', tone: 'warn', metrics: [], steps };
  }

  const deg = snapDeg((Math.acos(snapCos(dt / (nu * nv))) * 180) / Math.PI);
  const sinV = norm(c) / (nu * nv);
  const area = norm(c);
  steps.push(
    {
      title: 'الزاوية بين المتجهين',
      explanation: 'من تعريف الجداء السلمي: u·v = ‖u‖‖v‖ cos θ.',
      latex: al([
        `\\cos\\theta=\\dfrac{u\\cdot v}{\\|u\\|\\,\\|v\\|}=\\dfrac{${texNum(dt)}}{${texNum(nu)}\\cdot ${texNum(nv)}}=${texNum(snapCos(dt / (nu * nv)))}`,
        `\\theta=${angleEq(deg)}`
      ])
    },
    {
      title: 'تحقق بالجداء المتجهي',
      explanation: 'من الجداء المتجهي: ‖u × v‖ = ‖u‖‖v‖ sin θ، وهذا يؤكد الزاوية.',
      latex: `\\sin\\theta=\\dfrac{\\|u\\times v\\|}{\\|u\\|\\,\\|v\\|}=${texNum(sinV)}`
    },
    {
      title: 'مساحة متوازي الأضلاع والمثلث',
      explanation: 'مساحة متوازي الأضلاع المبني على u و v هي ‖u × v‖، ومساحة المثلث الذي ضلعاه u و v نصفها.',
      latex: al([
        `S_{\\text{متوازي الأضلاع}}=\\|u\\times v\\|=${texNum(area)}`,
        `S_{\\text{المثلث}}=\\dfrac{1}{2}\\|u\\times v\\|=${texNum(area / 2)}`
      ])
    }
  );

  return {
    verdict: 'نتائج عمليات المتجهات',
    verdictLatex: `\\theta=${angleEq(deg)}`,
    tone: 'info',
    metrics: [
      { label: 'المسافة PQ', latex: `PQ=${texNum(Math.sqrt(d2))}` },
      { label: 'الجداء السلمي u·v', latex: `u\\cdot v=${texNum(dt)}` },
      { label: 'الزاوية θ', latex: `\\theta=${angleEq(deg)}` },
      { label: 'مساحة متوازي الأضلاع', latex: `S=${texNum(area)}` }
    ],
    steps
  };
}

// ------------------------------------------------------------------ 3) planes
function buildPlane(A: V3, n: V3, base: WorkStep[]): PlaneResult {
  const raw: Plane = { a: n[0], b: n[1], c: n[2], d: -dot(n, A) };
  const plane = reducePlane(raw);
  const steps: WorkStep[] = [
    ...base,
    {
      title: 'معادلة المستوي بالنقطة والناظم',
      explanation: 'نطبق الصيغة a(x − x_A) + b(y − y_A) + c(z − z_A) = 0 مع النقطة A والناظم n.',
      latex: `${pointNormalTex(n, A)}`
    },
    {
      title: 'الشكل العام',
      explanation: 'نفك الأقواس، فيكون الحد الثابت d = −(a·x_A + b·y_A + c·z_A).',
      latex: `d=-\\left(${pr(n[0])}\\cdot ${pr(A[0])}+${pr(n[1])}\\cdot ${pr(A[1])}+${pr(n[2])}\\cdot ${pr(A[2])}\\right)=${texNum(raw.d)}`
    }
  ];
  const changed = plane.a !== raw.a || plane.b !== raw.b || plane.c !== raw.c || plane.d !== raw.d;
  if (changed) {
    steps.push({
      title: 'تبسيط المعادلة',
      explanation: 'نقسم المعادلة على القاسم المشترك الأكبر لمعاملاتها لتصبح أبسط دون تغيير المستوي.',
      latex: planeTex(plane)
    });
  }
  steps.push({ title: 'معادلة المستوي', explanation: 'المعادلة العامة للمستوي:', latex: `\\Pi:\\;${planeTex(plane)}` });
  return {
    plane,
    outcome: {
      verdict: 'معادلة المستوي',
      verdictLatex: `\\Pi:\\;${planeTex(plane)}`,
      tone: 'ok',
      metrics: planeMetrics(plane),
      steps
    }
  };
}

export function planeFromThreePoints(A: V3, B: V3, C: V3): PlaneResult {
  const AB = sub(B, A);
  const AC = sub(C, A);
  const n = cross(AB, AC);
  // Syrian mark-scheme technique: assume n(a,b,c) and solve the orthogonality system,
  // fixing one coordinate (c = 1 when possible). The cross product is kept as a check.
  const letters = ['a', 'b', 'c'];
  const unknownSystem = `\\begin{cases} \\vec{n}\\cdot\\overrightarrow{AB}=0 \\\\ \\vec{n}\\cdot\\overrightarrow{AC}=0 \\end{cases}`;
  const expanded = [AB, AC].map((vec) => vec.map((coef, i) => `${coef < 0 ? '-' : '+'} ${Math.abs(coef) === 1 ? '' : texNum(Math.abs(coef))}${letters[i]}`).join(' ').replace(/^\+ /, '') + ' = 0');
  let normIdx = -1;
  let sol: V3 | null = null;
  for (const fix of [2, 1, 0]) {
    const cols = [0, 1, 2].filter((c) => c !== fix);
    const det = AB[cols[0]] * AC[cols[1]] - AB[cols[1]] * AC[cols[0]];
    if (Math.abs(det) < 1e-9) continue;
    const rhs = [-AB[fix], -AC[fix]];
    const va = (rhs[0] * AC[cols[1]] - rhs[1] * AC[cols[0]]) / det;
    const vb = (AB[cols[0]] * rhs[1] - AB[cols[1]] * rhs[0]) / det;
    const found: V3 = [0, 0, 0];
    found[cols[0]] = va;
    found[cols[1]] = vb;
    found[fix] = 1;
    sol = cleanV(found);
    normIdx = fix;
    break;
  }
  const systemTex = `\\begin{cases} ${expanded[0]} \\\\ ${expanded[1]} \\end{cases}`;
  const fixTex = normIdx >= 0 ? `\\text{نضع } ${letters[normIdx]} = 1 \\quad \\text{(لأن الجملة محددة الناظم الاتجاه فقط)}` : '';
  const solveTex = sol
    ? `\\vec{n} = \\left(${sol.map((x) => texNum(x)).join(',\\,')}\\right)`
    : `\\vec{n}=\\overrightarrow{AB}\\times\\overrightarrow{AC}=${vecTex(cleanV(n))}`;
  const checkTex = zeroVec(n)
    ? '\\text{الجداء المتجهي معدوم}'
    : `\\text{تحقق: } \\vec{n} \\parallel \\left(\\overrightarrow{AB}\\times\\overrightarrow{AC}\\right), \\quad \\vec{n}\\cdot\\overrightarrow{AB} = ${texNum(dot(sol ?? n, AB))}, \\quad \\vec{n}\\cdot\\overrightarrow{AC} = ${texNum(dot(sol ?? n, AC))}`;

  const base: WorkStep[] = [
    {
      title: 'المتجهان AB و AC',
      explanation: 'نحسب متجهين واقعين في المستوي المطلوب من إحداثيات النقاط الثلاث.',
      latex: al([`\\overrightarrow{AB}=${vecTex(cleanV(AB))}`, `\\overrightarrow{AC}=${vecTex(cleanV(AC))}`])
    },
    {
      title: 'فرض الناظم المجهول n(a,b,c)',
      explanation: 'ناظم المستوي عمودي على كل متجه يقع فيه، فيكون جداؤه السلمي مع AB ومع AC معدوماً. هذه هي الطريقة المطلوبة في السلّم بدل القفز إلى الجداء المتجهي:',
      latex: `${unknownSystem} \\quad \\Longleftrightarrow \\quad ${systemTex}`
    },
    {
      title: fixTex || 'تعيين الناظم',
      explanation: 'نختار قيمة إحدى المركبات (الجملة لا تحدد إلا اتجاه الناظم)، ثم نحل جملة بمعادلتين ومجهولين:',
      latex: sol ? `${fixTex} \\\\[8pt] ${solveTex}` : solveTex
    },
    {
      title: 'التحقق (وهو نفسه ناتج الجداء المتجهي)',
      explanation: 'نتأكد من تعامد الناظم مع المتجهين AB و AC بجداؤهما السلمي، وبذلك نطابق نتيجة الجداء المتجهي AB × AC:',
      latex: checkTex
    }
  ];
  if (zeroVec(n)) {
    return {
      plane: null,
      outcome: bad('النقاط الثلاث على استقامة واحدة، ولا تعيّن مستوياً وحيداً', [
        ...base,
        { title: 'الحكم', explanation: 'الجداء المتجهي معدوم، فالمتجهان AB و AC مرتبطان خطياً والنقاط على مستقيم واحد.', latex: '\\overrightarrow{AB}\\times\\overrightarrow{AC}=\\vec{0}' }
      ])
    };
  }
  return buildPlane(A, n, base);
}

export function planeFromNormal(A: V3, n: V3): PlaneResult {
  if (zeroVec(n)) return { plane: null, outcome: bad('متجه الناظم معدوم، لا يعيّن مستوياً') };
  return buildPlane(A, n, [{ title: 'الناظم المعطى', explanation: 'متجه الناظم عمودي على المستوي.', latex: `\\vec{n}=${vecTex(cleanV(n))}` }]);
}

/** perpendicular bisector plane of segment AB: passes through its midpoint, normal AB */
export function perpendicularBisectorPlane(A: V3, B: V3): PlaneResult {
  const AB = sub(B, A);
  if (zeroVec(AB)) return { plane: null, outcome: bad('النقطتان متطابقتان، فلا تعيّنان قطعة مستقيمة ولا مستوياً محورياً') };
  const M = mul(0.5, add(A, B));
  const base: WorkStep[] = [
    {
      title: 'منتصف القطعة AB',
      explanation: 'المستوي المحوري يمر من منتصف القطعة، فنحسب M بمتوسط الإحداثيات.',
      latex: `M=\\left(\\dfrac{x_{A}+x_{B}}{2},\\,\\dfrac{y_{A}+y_{B}}{2},\\,\\dfrac{z_{A}+z_{B}}{2}\\right)=${vecTex(cleanV(M))}`
    },
    {
      title: 'الناظم هو المتجه AB',
      explanation: 'المستوي المحوري عمودي على القطعة، فناظمه هو متجهها AB = B − A.',
      latex: `\\vec{n}=\\overrightarrow{AB}=${vecTex(cleanV(AB))}`
    }
  ];
  const result = planeFromNormal(M, AB);
  if (!result.plane) return result;
  return {
    plane: result.plane,
    outcome: {
      ...result.outcome,
      verdict: 'المستوي المحوري للقطعة AB',
      steps: [...base, ...result.outcome.steps.slice(1)]
    }
  };
}

export function planeFromDirections(A: V3, u: V3, v: V3): PlaneResult {
  const n = cross(u, v);
  const base: WorkStep[] = [
    {
      title: 'توجيهان في المستوي',
      explanation: 'المستقيمان المارّان بالنقطة A واللذان يعيّنان المستوي لهما متجها التوجيه u و v.',
      latex: al([`\\vec{u}=${vecTex(cleanV(u))}`, `\\vec{v}=${vecTex(cleanV(v))}`])
    },
    {
      title: 'الناظم بالجداء المتجهي',
      explanation: 'الناظم عمودي على u وعلى v معاً: n = u × v.',
      latex: `\\vec{n}=\\vec{u}\\times\\vec{v}=${vecTex(cleanV(n))}`
    }
  ];
  if (zeroVec(n)) {
    return { plane: null, outcome: bad('المتجهان u و v متوازيان، فلا يعيّنان مستوياً', [...base, { title: 'الحكم', explanation: 'u × v = 0، فالتوجيهان مرتبطان خطياً ولا يكفيان لتعيين مستوٍ.', latex: '\\vec{u}\\times\\vec{v}=\\vec{0}' }]) };
  }
  return buildPlane(A, n, base);
}

export function planeFromCoefficients(a: number, b: number, c: number, d: number): PlaneResult {
  const n: V3 = [a, b, c];
  if (zeroVec(n)) return { plane: null, outcome: bad('معاملات x و y و z معدومة كلها، فلا تمثل مستوياً') };
  const plane: Plane = { a, b, c, d };
  return {
    plane,
    outcome: {
      verdict: 'معادلة المستوي المعطاة',
      verdictLatex: `\\Pi:\\;${planeTex(plane)}`,
      tone: 'ok',
      metrics: planeMetrics(plane),
      steps: [
        { title: 'المعادلة المعطاة', explanation: 'المعادلة العامة للمستوي: ax + by + cz + d = 0.', latex: `\\Pi:\\;${planeTex(plane)}` },
        { title: 'متجه الناظم', explanation: 'معاملات x و y و z هي مركبات متجه الناظم n(a, b, c).', latex: `\\vec{n}=${vecTex(cleanV(n))}` }
      ]
    }
  };
}

export function distancePointPlane(P: V3, p: Plane): Outcome {
  const n: V3 = [p.a, p.b, p.c];
  const nn = norm(n);
  if (nn === 0) return bad('المستوي غير معرّف (الناظم معدوم)');
  const num = p.a * P[0] + p.b * P[1] + p.c * P[2] + p.d;
  const dist = Math.abs(num) / nn;
  return {
    verdict: 'المسافة من النقطة إلى المستوي',
    verdictLatex: `d(P,\\Pi)=${texNum(dist)}`,
    tone: 'ok',
    metrics: [{ label: 'المسافة d(P, Π)', latex: `d=${texNum(dist)}` }],
    steps: [
      { title: 'المعادلة', explanation: 'معادلة المستوي المعطى:', latex: `\\Pi:\\;${planeTex(p)}` },
      {
        title: 'تعويض إحداثيات النقطة',
        explanation: 'نعوّض النقطة P(x₀, y₀, z₀) في الطرف الأيسر:',
        latex: `a x_{0}+b y_{0}+c z_{0}+d=${texNum(num)}`
      },
      {
        title: 'قانون المسافة',
        explanation: 'المسافة من نقطة إلى مستوٍ هي القيمة المطلقة مقسومة على معيار الناظم.',
        latex: `d(P,\\Pi)=\\dfrac{|a x_{0}+b y_{0}+c z_{0}+d|}{\\sqrt{a^{2}+b^{2}+c^{2}}}=\\dfrac{${texNum(Math.abs(num))}}{${texNum(nn)}}=${texNum(dist)}`
      }
    ]
  };
}

// ------------------------------------------------------------------ 4) lines
function lineOutcome(A: V3, u: V3, base: WorkStep[]): LineResult {
  const system = lineSystemTex(A, u);
  return {
    line: { P: A, u },
    outcome: {
      verdict: 'التمثيل الوسيطي للمستقيم',
      verdictLatex: system,
      tone: 'ok',
      metrics: [{ label: 'متجه التوجيه u', latex: `\\vec{u}=${vecTex(cleanV(u))}` }],
      steps: [
        ...base,
        {
          title: 'التمثيل الوسيطي',
          explanation: 'كل نقطة M(x, y, z) من المستقيم تُكتب M = A + t·u مع الوسيط t ∈ ℝ:',
          latex: system
        }
      ]
    }
  };
}

export function lineFromPointDirection(A: V3, u: V3): LineResult {
  if (zeroVec(u)) return { line: null, outcome: bad('متجه التوجيه معدوم، لا يعيّن مستقيماً') };
  return lineOutcome(A, u, [{ title: 'النقطة ومتجه التوجيه', explanation: 'المستقيم مُعطى بنقطة A ومتجه توجيه u.', latex: `A=${vecTex(cleanV(A))},\\quad \\vec{u}=${vecTex(cleanV(u))}` }]);
}

export function lineFromTwoPoints(A: V3, B: V3): LineResult {
  const u = sub(B, A);
  if (zeroVec(u)) return { line: null, outcome: bad('النقطتان متطابقتان، فلا يعيّنان مستقيماً') };
  return lineOutcome(A, u, [{ title: 'متجه التوجيه من نقطتين', explanation: 'متجه التوجيه هو AB = B − A.', latex: `\\overrightarrow{AB}=B-A=${vecTex(cleanV(u))}` }]);
}

export function distancePointLine(C: V3, A: V3, u: V3): Outcome {
  if (zeroVec(u)) return bad('متجه التوجيه معدوم');
  const AC = sub(C, A);
  const cr = cross(AC, u);
  const dist = norm(cr) / norm(u);
  return {
    verdict: 'المسافة من النقطة إلى المستقيم',
    verdictLatex: `d(C,L)=${texNum(dist)}`,
    tone: 'ok',
    metrics: [{ label: 'المسافة d(C, L)', latex: `d=${texNum(dist)}` }],
    steps: [
      { title: 'المتجه AC', explanation: 'نصل النقطة C بنقطة A من المستقيم:', latex: `\\overrightarrow{AC}=${vecTex(cleanV(AC))}` },
      { title: 'الجداء المتجهي AC × u', explanation: 'مساحة متوازي الأضلاع المبني على AC و u تساوي ‖AC × u‖.', latex: `\\overrightarrow{AC}\\times\\vec{u}=${vecTex(cleanV(cr))}` },
      {
        title: 'قانون المسافة',
        explanation: 'المسافة = مساحة متوازي الأضلاع ÷ طول القاعدة u.',
        latex: `d(C,L)=\\dfrac{\\|\\overrightarrow{AC}\\times\\vec{u}\\|}{\\|\\vec{u}\\|}=\\dfrac{${texNum(norm(cr))}}{${texNum(norm(u))}}=${texNum(dist)}`
      }
    ]
  };
}

// ------------------------------------------------------------------ 5) relative positions
export function relationPlanes(p1: Plane, p2: Plane): { outcome: Outcome; line: LineP | null } {
  const n1: V3 = [p1.a, p1.b, p1.c];
  const n2: V3 = [p2.a, p2.b, p2.c];
  if (zeroVec(n1) || zeroVec(n2)) return { outcome: bad('أحد المستويين غير معرّف (الناظم معدوم)'), line: null };
  const c = cross(n1, n2);
  const base: WorkStep[] = [
    {
      title: 'ناظما المستويين',
      explanation: 'نقارن الناظمين n₁ و n₂.',
      latex: `\\vec{n}_{1}=${vecTex(cleanV(n1))},\\qquad \\vec{n}_{2}=${vecTex(cleanV(n2))}`
    },
    {
      title: 'الجداء المتجهي للناظمين',
      explanation: 'إذا كان n₁ × n₂ = 0 فالناظمان مرتبطان خطياً، أي أن المستويين متوازيان أو متطابقان.',
      latex: `\\vec{n}_{1}\\times\\vec{n}_{2}=${vecTex(cleanV(c))}`
    }
  ];

  if (c.every(isZ)) {
    const i = [0, 1, 2].find((k) => !isZ(n1[k])) as number;
    const lambda = n2[i] / n1[i];
    const same = Math.abs(p2.d - lambda * p1.d) < 1e-9 * (1 + Math.abs(p2.d));
    return {
      outcome: {
        verdict: same ? 'المستويان متطابقان' : 'المستويان متوازيان تماماً',
        tone: same ? 'ok' : 'warn',
        metrics: [{ label: 'معامل التناسب λ', latex: `\\lambda=${texNum(lambda)}` }],
        steps: [
          ...base,
          { title: 'معامل التناسب بين الناظمين', explanation: 'نجد λ حيث n₂ = λ n₁.', latex: `\\lambda=${texNum(lambda)}` },
          {
            title: 'مقارنة الحدين الثابتين',
            explanation: 'إذا كان d₂ = λ·d₁ فالمستويان متطابقان، وإلا فهما متوازيان تماماً لا يلتقيان.',
            latex: `d_{2}=${texNum(p2.d)},\\qquad \\lambda d_{1}=${texNum(lambda * p1.d)}`
          }
        ]
      },
      line: null
    };
  }

  // intersection line: u = n1 × n2 and a point P from  P = (h1(n2×u) + h2(u×n1)) / |u|²,  hᵢ = −dᵢ
  const h1 = -p1.d;
  const h2 = -p2.d;
  const uu = dot(c, c);
  const P = mul(1 / uu, add(mul(h1, cross(n2, c)), mul(h2, cross(c, n1))));
  return {
    outcome: {
      verdict: 'المستويان متقاطعان وفق مستقيم',
      verdictLatex: lineSystemTex(P, c),
      tone: 'ok',
      metrics: [{ label: 'متجه توجيه المستقيم المشترك', latex: `\\vec{u}=${vecTex(cleanV(c))}` }],
      steps: [
        ...base,
        {
          title: 'اتجاه المستقيم المشترك',
          explanation: 'يتقاطع المستويان وفق مستقيم متجه توجيهه u = n₁ × n₂ (عمودي على الناظمين معاً).',
          latex: `\\vec{u}=\\vec{n}_{1}\\times\\vec{n}_{2}=${vecTex(cleanV(c))}`
        },
        {
          title: 'نقطة من المستقيم المشترك',
          explanation: 'نحل جملة المعادلتين بالصيغة P = (h₁(n₂×u) + h₂(u×n₁)) / ‖u‖² حيث hᵢ = −dᵢ.',
          latex: `P=${vecTex(cleanV(P))}`
        },
        { title: 'التمثيل الوسيطي للمستقيم المشترك', explanation: 'المستقيم الناتج عن تقاطع المستويين:', latex: lineSystemTex(P, c) }
      ]
    },
    line: { P, u: c }
  };
}

export function relationLinePlane(L: LineP, p: Plane): Outcome {
  const n: V3 = [p.a, p.b, p.c];
  const denom = dot(n, L.u);
  const num = dot(n, L.P) + p.d;
  const base: WorkStep[] = [
    {
      title: 'التعويض في معادلة المستوي',
      explanation: 'نعوّض x = x₀ + a·t و y = y₀ + b·t و z = z₀ + c·t في معادلة المستوي فنحصل على معادلة بالوسيط t:',
      latex: `${texNum(p.a)}(x_{0}+at)+${texNum(p.b)}(y_{0}+bt)+${texNum(p.c)}(z_{0}+ct)+${texNum(p.d)}=0`
    },
    {
      title: 'معادلة الوسيط',
      explanation: 'نجمع معاملات t وننقل الحدود الثابتة:',
      latex: `(${texNum(denom)})\\,t=${texNum(-num)}`
    }
  ];

  if (isZ(denom)) {
    if (isZ(num)) {
      return {
        verdict: 'المستقيم محتوى في المستوي: عدد غير منتهٍ من نقاط التقاطع',
        tone: 'info',
        metrics: [],
        steps: [...base, { title: 'الحكم', explanation: 'المعامل والحد الثابت معدومان: المعادلة محققة من أجل كل t، إذن المستقيم كله في المستوي.', latex: '0\\cdot t=0' }]
      };
    }
    return {
      verdict: 'المستقيم يوازي المستوي تماماً: لا توجد نقطة تقاطع',
      tone: 'warn',
      metrics: [],
      steps: [...base, { title: 'الحكم', explanation: 'المعامل معدوم والحد الثابت غير معدوم: المعادلة مستحيلة الحل.', latex: `0\\cdot t=${texNum(-num)}\\neq 0` }]
    };
  }

  // Famous special case first (Syrian baccalaureate): u ∥ n ⇒ the line is perpendicular to the plane.
  const uCrossN = cross(L.u, n);
  const perpendicular = uCrossN.every(isZ);
  const perpendicularStep: WorkStep[] = perpendicular
    ? (() => {
        const i = [0, 1, 2].find((k) => !isZ(n[k])) as number;
        const lambda = L.u[i] / n[i];
        return [{
          title: 'فحص التعامد (حالة خاصة)',
          explanation: 'نقارن متجه توجيه المستقيم بناظم المستوي قبل الحساب: بما أن ناظم المستوي ومتجه توجيه المستقيم مرتبطان خطياً، فإن المستقيم يعامد المستوي في نقطة التقاطع M.',
          latex: `\\vec{u}\\times\\vec{n}=\\vec{0}\\quad\\Longrightarrow\\quad \\vec{u}=${texNum(lambda)}\\,\\vec{n}\\quad\\Longrightarrow\\quad L\\perp\\Pi`
        }];
      })()
    : [{
        title: 'فحص التعامد (حالة خاصة)',
        explanation: 'نقارن متجه توجيه المستقيم بناظم المستوي: الجداء المتجهي غير معدوم، فالمتجهان غير مرتبطين خطياً والمستقيم مائل على المستوي (غير عمودي).',
        latex: `\\vec{u}\\times\\vec{n}=${vecTex(cleanV(uCrossN))}\\neq\\vec{0}`
      }];

  const t = -num / denom;
  const X = add(L.P, mul(t, L.u));
  return {
    verdict: perpendicular ? 'المستقيم يعامد المستوي ويقطعه في نقطة وحيدة' : 'المستقيم يقطع المستوي في نقطة وحيدة',
    verdictLatex: `M=${vecTex(cleanV(X))}`,
    tone: 'ok',
    metrics: [
      { label: 'قيمة الوسيط t', latex: `t=${texNum(t)}` },
      { label: 'نقطة التقاطع M', latex: `M=${vecTex(cleanV(X))}` },
      ...(perpendicular ? [{ label: 'الوضع', latex: `L\\perp\\Pi` }] : [])
    ],
    steps: [
      ...perpendicularStep,
      ...base,
      { title: 'حل معادلة الوسيط', explanation: 'نقسم على المعامل غير المعدوم:', latex: `t=${texNum(t)}` },
      { title: 'إحداثيات نقطة التقاطع', explanation: 'نعوّض t في التمثيل الوسيطي للمستقيم:', latex: `M=A+t\\,\\vec{u}=${vecTex(cleanV(X))}` },
      ...(perpendicular
        ? [{ title: 'الخلاصة', explanation: 'M هي المسقط العمودي لأي نقطة من المستقيم على المستوي، وهي قدم العمود.', latex: `L\\perp\\Pi,\\qquad L\\cap\\Pi=\\{M\\}` }]
        : [])
    ]
  };
}

export function relationLines(L1: LineP, L2: LineP): Outcome {
  const A = L1.P;
  const u = L1.u;
  const B = L2.P;
  const v = L2.u;
  if (zeroVec(u) || zeroVec(v)) return bad('أحد المستقيمين غير معرّف (متجه التوجيه معدوم)');
  const w = sub(B, A);
  const c = cross(u, v);
  const base: WorkStep[] = [
    {
      title: 'اتجاها المستقيمين',
      explanation: 'نقارن متجهي التوجيه u و v:',
      latex: `\\vec{u}=${vecTex(cleanV(u))},\\qquad \\vec{v}=${vecTex(cleanV(v))}`
    },
    {
      title: 'الجداء المتجهي u × v',
      explanation: 'إذا كان u × v = 0 فالمستقيمان متوازيان أو منطبقان.',
      latex: `\\vec{u}\\times\\vec{v}=${vecTex(cleanV(c))}`
    }
  ];

  if (c.every(isZ)) {
    if (cross(w, u).every(isZ)) {
      return {
        verdict: 'المستقيمان منطبقان',
        tone: 'ok',
        metrics: [],
        steps: [...base, { title: 'نقطة مشتركة', explanation: 'AB ∥ u، فالنقطة B تقع على المستقيم الأول، وبما أن v ∥ u فالمستقيمان منطبقان.', latex: `\\overrightarrow{AB}\\times\\vec{u}=\\vec{0}` }]
      };
    }
    return {
      verdict: 'المستقيمان متوازيان (غير منطبقين)',
      tone: 'warn',
      metrics: [],
      steps: [...base, { title: 'الحكم', explanation: 'المتجهان متوازيان، لكن AB ليس موازياً لـ u، فالمستقيمان لا يلتقيان.', latex: `\\overrightarrow{AB}\\times\\vec{u}\\neq \\vec{0}` }]
    };
  }

  const det = dot(w, c);
  const coplanarStep: WorkStep = {
    title: 'شرط التلاقي (الجداء المختلط)',
    explanation: 'المستقيمان يقعان في مستوٍ واحد إذا وفقط إذا كان الجداء المختلط [AB, u, v] = 0.',
    latex: `[\\overrightarrow{AB},\\vec{u},\\vec{v}]=\\overrightarrow{AB}\\cdot(\\vec{u}\\times\\vec{v})=${texNum(det)}`
  };
  if (!isZ(det)) {
    // skew lines: the distance is the projection of AB on the common perpendicular u × v
    const normC = norm(c);
    const dist = Math.abs(det) / normC;
    return {
      verdict: 'المستقيمان غير متلاقيين (متخالفان، ليسا في مستوٍ واحد)',
      verdictLatex: `d(L_{1},L_{2})=${texNum(dist)}`,
      tone: 'info',
      metrics: [
        { label: 'الجداء المختلط', latex: `[\\overrightarrow{AB},\\vec{u},\\vec{v}]=${texNum(det)}` },
        { label: 'البعد بين المستقيمين', latex: `d(L_{1},L_{2})=${texNum(dist)}` }
      ],
      steps: [
        ...base,
        coplanarStep,
        { title: 'الحكم', explanation: 'الجداء المختلط غير معدوم، فالمستقيمان متخالفان لا يلتقيان ولا يتوازيان.', latex: '[\\overrightarrow{AB},\\vec{u},\\vec{v}]\\neq 0' },
        {
          title: 'العمود المشترك',
          explanation: 'المتجه u × v عمودي على المستقيمين معاً، فهو يحمل اتجاه العمود المشترك بينهما.',
          latex: `\\vec{u}\\times\\vec{v}=${vecTex(cleanV(c))},\\qquad \\|\\vec{u}\\times\\vec{v}\\|=${texNum(normC)}`
        },
        {
          title: 'البعد بين المستقيمين المتخالفين',
          explanation: 'البعد يساوي القيمة المطلقة لمسقط المتجه AB على العمود المشترك، أي الجداء المختلط مقسوماً على معيار u × v.',
          latex: `d(L_{1},L_{2})=\\dfrac{\\left|\\overrightarrow{AB}\\cdot(\\vec{u}\\times\\vec{v})\\right|}{\\|\\vec{u}\\times\\vec{v}\\|}=\\dfrac{${texNum(Math.abs(det))}}{${texNum(normC)}}=${texNum(dist)}`
        }
      ]
    };
  }

  // intersection: t·(u×v) = (AB)×v  ⇒  t = ((AB)×v)·(u×v) / |u×v|²
  //               s·(u×v) = (AB)×u  ⇒  s = ((AB)×u)·(u×v) / |u×v|²
  // Mark-scheme method: write the three scalar equations of A + t·u = B + s·v,
  // solve two of them for (t , s) by Cramer, then substitute in the remaining
  // equation — this is the compatibility condition (شرط التوافق) asked in Syria.
  const axis = ['x', 'y', 'z'];
  const signTerm = (coef: number, letter: string): string => {
    if (isZ(coef)) return '';
    const mag = Math.abs(coef);
    const core = `${Math.abs(mag - 1) < EPS ? '' : texNum(mag)}${letter}`;
    return ` ${coef < 0 ? '-' : '+'} ${core}`;
  };
  const eqLines = axis.map((nm, i) => `${nm}:\\; ${texNum(A[i])}${signTerm(u[i], 't')} = ${texNum(B[i])}${signTerm(v[i], 's')}`);
  const stdLines = axis.map((_nm, i) => `${texNum(u[i])}\\,t ${isZ(v[i]) ? '' : `${v[i] > 0 ? '-' : '+'} ${texNum(Math.abs(v[i]))}\\,s`} = ${texNum(w[i])}`);
  let pair: [number, number] | null = null;
  for (const cand of [[0, 1], [0, 2], [1, 2]] as [number, number][]) {
    const det = u[cand[0]] * -v[cand[1]] - u[cand[1]] * -v[cand[0]];
    if (Math.abs(det) > 1e-9) { pair = cand; break; }
  }
  const p = pair ?? [0, 1];
  const det2 = u[p[0]] * -v[p[1]] - u[p[1]] * -v[p[0]];
  const tVal = (-v[p[1]] * w[p[0]] - (-v[p[0]]) * w[p[1]]) / det2;
  const sVal = (u[p[0]] * w[p[1]] - u[p[1]] * w[p[0]]) / det2;
  const thirdIdx = 3 - p[0] - p[1];
  const t = tVal;
  const s = sVal;
  const X = add(A, mul(t, u));
  const Y = add(B, mul(s, v));
  const samePoint = sub(X, Y).every(isZ);
  const lhsThird = u[thirdIdx] * t - v[thirdIdx] * s;
  const checkOk = Math.abs(lhsThird - w[thirdIdx]) < 1e-7 * (1 + Math.abs(w[thirdIdx]));
  const pairLabel = axis[p[0]].toUpperCase() + axis[p[1]].toUpperCase();
  const sysTex = `\\begin{cases} ${eqLines.join(' \\\\ ')} \\end{cases}`;
  const stdTex = `\\begin{cases} (${p[0] + 1})\\; ${stdLines[p[0]]} \\\\ (${p[1] + 1})\\; ${stdLines[p[1]]} \\\\ (${thirdIdx + 1})\\; ${stdLines[thirdIdx]} \\end{cases}`;
  const detTex = `\\Delta = \\begin{vmatrix} ${texNum(u[p[0]])} & ${texNum(-v[p[0]])} \\\\ ${texNum(u[p[1]])} & ${texNum(-v[p[1]])} \\end{vmatrix} = ${texNum(det2)} \\neq 0`;
  const tTex = `t = \\dfrac{\\begin{vmatrix} ${texNum(w[p[0]])} & ${texNum(-v[p[0]])} \\\\ ${texNum(w[p[1]])} & ${texNum(-v[p[1]])} \\end{vmatrix}}{\\Delta} = ${texNum(t)}`;
  const sTex = `s = \\dfrac{\\begin{vmatrix} ${texNum(u[p[0]])} & ${texNum(w[p[0]])} \\\\ ${texNum(u[p[1]])} & ${texNum(w[p[1]])} \\end{vmatrix}}{\\Delta} = ${texNum(s)}`;
  const compatTex = `(${thirdIdx + 1})\\;:\\; ${texNum(u[thirdIdx])}\\cdot\\left(${texNum(t)}\\right) ${isZ(v[thirdIdx]) ? '' : `${v[thirdIdx] > 0 ? '-' : '+'} ${texNum(Math.abs(v[thirdIdx]))}\\cdot\\left(${texNum(s)}\\right)`} = ${texNum(lhsThird)} ${checkOk ? '=' : '\\neq'} ${texNum(w[thirdIdx])}`;
  // If the remaining equation is not satisfied the lines are not coplanar: skew.
  if (!checkOk || !samePoint) {
    const normC = norm(c);
    const dist = Math.abs(dot(w, c)) / normC;
    return {
      verdict: 'المستقيمان متخالفان: المعادلة (3) غير محققة بعد التعويض',
      verdictLatex: `d(L_{1},L_{2})=${texNum(dist)}`,
      tone: 'warn',
      metrics: [{ label: 'البعد بين المستقيمين', latex: `d(L_{1},L_{2})=\\dfrac{\\left|\\overrightarrow{AB}\\cdot(\\vec{u}\\times\\vec{v})\\right|}{\\|\\vec{u}\\times\\vec{v}\\|}=${texNum(dist)}` }],
      steps: [
        ...base,
        { title: 'جملة المعادلات الثلاث', explanation: 'نساوي التمثيلين الوسيطيين مكتوبين بوسيطين مستقلين t و s:', latex: stdTex },
        { title: 'حل المعادلتين المختارتين', explanation: `نحل بالاعتماد على المعادلتين (${p[0] + 1}) و (${p[1] + 1}) حيث المحدد غير معدوم:`, latex: `${detTex} \\\\[6pt] ${tTex} \\\\[6pt] ${sTex}` },
        { title: 'شرط التوافق مع المعادلة المتبقية', explanation: 'نعوّض t و s في المعادلة المتبقية؛ عدم تحققها يعني أن لا نقطة مشتركة وأن المستقيمين ليسا في مستوٍ واحد:', latex: compatTex }
      ]
    };
  }
  return {
    verdict: 'المستقيمان متقاطعان في نقطة',
    verdictLatex: `X=${vecTex(cleanV(X))}`,
    tone: 'ok',
    metrics: [
      { label: 'وسيط المستقيم الأول', latex: `t=${texNum(t)}` },
      { label: 'وسيط المستقيم الثاني', latex: `s=${texNum(s)}` },
      { label: 'نقطة التقاطع X', latex: `X=${vecTex(cleanV(X))}` }
    ],
    steps: [
      ...base,
      coplanarStep,
      {
        title: 'كتابة جملة المعادلات الثلاث بالمعلولين t و s',
        explanation: 'نساوي إحداثيات النقطة العامة في المستقيم الأول مع إحداثيات المستقيم الثاني، فنحصل على ثلاث معادلات (معادلة لكل محور):',
        latex: `A+t\\,\\vec{u}=B+s\\,\\vec{v}\\quad\\Longleftrightarrow\\quad ${sysTex}`
      },
      {
        title: 'تحويل الجملة إلى الصورة القياسية',
        explanation: 'نجمع حدود t في الطرف الأيسر وثوابت الجمل في الطرف الأيمن، ونرقّم المعادلات:',
        latex: stdTex
      },
      {
        title: `اختيار المعادلتين (${p[0] + 1}) و (${p[1] + 1}) وحساب المحدد`,
        explanation: 'نختار زوج المعادلتين اللذين محددهما غير معدوم (المحور ' + pairLabel + ')، ثم نطبق قاعدة كرامر على المجهولين t و s:',
        latex: `${detTex} \\\\[8pt] ${tTex} \\\\[8pt] ${sTex}`
      },
      {
        title: 'شرط التوافق الامتحاني: التعويض في المعادلة المتبقية',
        explanation: `نعوّض قيمي t و s في المعادلة (${thirdIdx + 1}) المتبقية؛ تحققها هو شرط وقوع المستقيمين في مستوٍ واحد ونقطة تقاطع واحدة:`,
        latex: compatTex
      },
      {
        title: 'إحداثيات نقطة التقاطع والتحقق المزدوج',
        explanation: 'نعوّض t في التمثيل الوسيطي للمستقيم الأول و s في تمثيل المستقيم الثاني؛ تطابق النقطتين يُثبت النتيجة:',
        latex: `\\begin{aligned} X &= A+t\\,\\vec{u}=${vecTex(cleanV(X))} \\\\[6pt] Y &= B+s\\,\\vec{v}=${vecTex(cleanV(Y))} \\\\[6pt] X &= Y \\quad \\checkmark \\end{aligned}`
      },
      { title: 'الخلاصة', explanation: 'شرط التوافق محقق، فالمستقيمان يتقاطعان في نقطة وحيدة:', latex: `L_{1}\\cap L_{2}=\\{${vecTex(cleanV(X))}\\}` }
    ]
  };
}

// ------------------------------------------------------------------ 6) volumes
export function tetrahedronVolume(A: V3, B: V3, C: V3, D: V3): Outcome {
  const AB = sub(B, A);
  const AC = sub(C, A);
  const AD = sub(D, A);
  const m = mixed(AB, AC, AD);
  const V = Math.abs(m) / 6;
  const steps: WorkStep[] = [
    {
      title: 'المتجهات الثلاثة من الرأس A',
      explanation: 'نحسب المتجهات AB و AC و AD:',
      latex: al([`\\overrightarrow{AB}=${vecTex(cleanV(AB))}`, `\\overrightarrow{AC}=${vecTex(cleanV(AC))}`, `\\overrightarrow{AD}=${vecTex(cleanV(AD))}`])
    },
    {
      title: 'الجداء المختلط',
      explanation: 'الجداء المختلط للمتجهات الثلاثة هو المحدد الذي أسطره مركبات هذه المتجهات:',
      latex: `[\\overrightarrow{AB},\\overrightarrow{AC},\\overrightarrow{AD}]=\\overrightarrow{AD}\\cdot(\\overrightarrow{AB}\\times\\overrightarrow{AC})=${texNum(m)}`
    },
    {
      title: 'قانون حجم رباعي الوجوه',
      explanation: 'حجم رباعي الوجوه يساوي سدس القيمة المطلقة للجداء المختلط:',
      latex: `V=\\dfrac{1}{6}\\left|[\\overrightarrow{AB},\\overrightarrow{AC},\\overrightarrow{AD}]\\right|=\\dfrac{1}{6}\\left|${texNum(m)}\\right|=${texNum(V)}`
    }
  ];
  if (isZ(m)) {
    return { verdict: 'النقاط الأربع مستوية: حجم رباعي الوجوه معدوم', tone: 'warn', metrics: [], steps: [...steps, { title: 'الحكم', explanation: 'الجداء المختلط معدوم، فالنقاط الأربع تقع في مستوٍ واحد.', latex: 'V=0' }] };
  }
  return {
    verdict: 'حجم رباعي الوجوه ABCD',
    verdictLatex: `V=${texNum(V)}`,
    tone: 'ok',
    metrics: [{ label: 'الحجم V', latex: `V=${texNum(V)}` }],
    steps
  };
}

export function parallelepipedVolume(u: V3, v: V3, w: V3): Outcome {
  const m = mixed(u, v, w);
  const V = Math.abs(m);
  const steps: WorkStep[] = [
    {
      title: 'الأشعة الثلاثة الواصلة من رأس واحد',
      explanation: 'متوازي السطوح مبني على ثلاثة أشعة u و v و w تنطلق من رأس واحد:',
      latex: al([`\\vec{u}=${vecTex(cleanV(u))}`, `\\vec{v}=${vecTex(cleanV(v))}`, `\\vec{w}=${vecTex(cleanV(w))}`])
    },
    {
      title: 'الجداء المختلط',
      explanation: 'نحسب الجداء المختلط [u, v, w] = w·(u×v):',
      latex: `[\\vec{u},\\vec{v},\\vec{w}]=${texNum(m)}`
    },
    {
      title: 'قانون حجم متوازي السطوح',
      explanation: 'حجم متوازي السطوح يساوي القيمة المطلقة للجداء المختلط (بدون قسمة):',
      latex: `V=\\left|[\\vec{u},\\vec{v},\\vec{w}]\\right|=${texNum(V)}`
    }
  ];
  if (isZ(V)) {
    return { verdict: 'الأشعة مرتبطة خطياً: حجم متوازي السطوح معدوم', tone: 'warn', metrics: [], steps: [...steps, { title: 'الحكم', explanation: 'الجداء المختلط معدوم، فالأشعة الثلاثة في مستوٍ واحد.', latex: 'V=0' }] };
  }
  return {
    verdict: 'حجم متوازي السطوح',
    verdictLatex: `V=${texNum(V)}`,
    tone: 'ok',
    metrics: [
      { label: 'الحجم V', latex: `V=${texNum(V)}` },
      { label: 'حجم رباعي الوجوه المبني على الأشعة نفسها', latex: `V'=\\dfrac{1}{6}\\cdot ${texNum(V)}=${texNum(V / 6)}` }
    ],
    steps
  };
}
