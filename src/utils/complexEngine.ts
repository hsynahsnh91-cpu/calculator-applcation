import { ComplexSolution } from "../types/index.js";
import { decimalToFraction, fractionToLatex } from "./mathEngine.js";

// ============================================================================
// Syrian mark-scheme extras
//  · quarter-reduction laws (دساتير الإرجاع إلى الربع الأول)
//  · algebraic square roots of a complex number by the strict system
//    u² − v² = x , 2uv = y , u² + v² = |z|
// ============================================================================
const PI_TABLE: [number, string][] = [
  [0, "0"],
  [1 / 6, "\\dfrac{\\pi}{6}"],
  [1 / 4, "\\dfrac{\\pi}{4}"],
  [1 / 3, "\\dfrac{\\pi}{3}"],
  [1 / 2, "\\dfrac{\\pi}{2}"],
  [2 / 3, "\\dfrac{2\\pi}{3}"],
  [3 / 4, "\\dfrac{3\\pi}{4}"],
  [5 / 6, "\\dfrac{5\\pi}{6}"],
  [1, "\\pi"],
];

const snapPiTex = (ratio: number): string => {
  const hit = PI_TABLE.find(([r]) => Math.abs(Math.abs(ratio) - r) < 1e-6);
  if (!hit) return `${Number((ratio * Math.PI).toFixed(4))}`;
  if (hit[1] === "0") return "0";
  return `${ratio < 0 ? "-" : ""}${hit[1]}`;
};

const num = (v: number): string => String(Number(v.toFixed(4)));

/** exact-looking square root: integer, or √n when n is not a perfect square */
const rootTex = (val: number): string => {
  if (val < -1e-12) return "\\text{ممتنع}";
  const rt = Math.sqrt(Math.max(0, val));
  if (Math.abs(rt - Math.round(rt)) < 1e-9) return String(Math.round(rt));
  const asInt = Number(val.toFixed(6));
  if (Math.abs(asInt - Math.round(asInt)) < 1e-9)
    return `\\sqrt{${Math.round(asInt)}}`;
  return `\\sqrt{${num(val)}}`;
};

export interface QuadrantInfo {
  index: 1 | 2 | 3 | 4;
  nameAr: string;
  alphaTex: string;
  thetaTex: string;
  lawTex: string;
}

export function quadrantInfo(a: number, b: number): QuadrantInfo {
  const alpha = Math.atan2(Math.abs(b), Math.abs(a));
  const index: 1 | 2 | 3 | 4 =
    a >= 0 && b >= 0 ? 1 : a < 0 && b >= 0 ? 2 : a < 0 && b < 0 ? 3 : 4;
  const nameAr = [
    "",
    "الربع الأول",
    "الربع الثاني",
    "الربع الثالث",
    "الربع الرابع",
  ][index];
  const alphaTex = snapPiTex(alpha / Math.PI);
  const theta =
    index === 1
      ? alpha
      : index === 2
        ? Math.PI - alpha
        : index === 3
          ? -Math.PI + alpha
          : -alpha;
  const lawTex =
    index === 1
      ? `\\cos\\theta > 0 \\ , \\ \\sin\\theta > 0 \\quad \\Longrightarrow \\quad \\theta = \\alpha = ${alphaTex}`
      : index === 2
        ? `\\cos\\theta < 0 \\ , \\ \\sin\\theta > 0 \\quad \\Longrightarrow \\quad \\theta = \\pi - \\alpha = ${alphaTex === "0" ? "\\pi" : `\\pi - ${alphaTex}`}`
        : index === 3
          ? `\\cos\\theta < 0 \\ , \\ \\sin\\theta < 0 \\quad \\Longrightarrow \\quad \\theta = -\\pi + \\alpha = ${alphaTex === "0" ? "-\\pi" : `-\\pi + ${alphaTex}`}`
          : `\\cos\\theta > 0 \\ , \\ \\sin\\theta < 0 \\quad \\Longrightarrow \\quad \\theta = -\\alpha = ${alphaTex === "0" ? "0" : `-${alphaTex}`}`;
  return {
    index,
    nameAr,
    alphaTex,
    thetaTex: `${snapPiTex(theta / Math.PI)} \\approx ${num(theta)}`,
    lawTex,
  };
}

export interface ComplexStep {
  title: string;
  text: string;
  latex: string;
}
export interface ComplexSqrtResult {
  ok: boolean;
  steps: ComplexStep[];
  roots: string[];
}

/** square roots of z = x + iy solved as a real system (the exam method) */
export function algebraicSquareRoots(x: number, y: number): ComplexSqrtResult {
  const r = Math.hypot(x, y);
  const u2 = (r + x) / 2;
  const v2 = (r - x) / 2;
  const u0 = Math.sqrt(Math.max(0, u2));
  const v0 = Math.sqrt(Math.max(0, v2));
  const sign = y < 0 ? -1 : 1;
  const steps: ComplexStep[] = [
    {
      title: "فرض الجذر على الصورة الجبرية",
      text: "نضع w = u + iv حيث u و v حقيقيان، ثم نربّع الطرفين ونساوي الجزء الحقيقي مثله والجزء التخيلي مثله:",
      latex: `w^{2} = z \\iff (u + iv)^{2} = x + iy \\iff u^{2} - v^{2} + 2uv\\,i = ${num(x)} ${y < 0 ? "-" : "+"} ${num(Math.abs(y))}i`,
    },
    {
      title: "الجملة الصارمة المطلوبة في السلّم",
      text: "نحصل على معادلتين من المساواة، ونضيف معادلة ثالثة من معيار الطرفين حيث u² + v² = |w²| = |z|:",
      latex: `\\begin{cases} u^{2} - v^{2} = ${num(x)} \\\\[6pt] 2uv = ${num(y)} \\\\[6pt] u^{2} + v^{2} = |z| = ${rootTex(r * r) === num(r) ? num(r) : `${rootTex(r * r)} = ${num(r)}`} \\end{cases}`,
    },
    {
      title: "فصل u² و v² بالجمع والطرح",
      text: "بجمع المعادلة الأولى والثالثة نحصل على 2u²، وبطرحهما نحصل على 2v²:",
      latex: `\\begin{aligned} u^{2} &= \\dfrac{|z| + x}{2} = \\dfrac{${num(r)} + (${num(x)})}{2} = ${num(u2)} \\\\[6pt] v^{2} &= \\dfrac{|z| - x}{2} = \\dfrac{${num(r)} - (${num(x)})}{2} = ${num(v2)} \\end{aligned}`,
    },
    {
      title: "تحديد الإشارات بواسطة 2uv = y",
      text:
        y === 0
          ? "الجزء التخيلي معدوم، فالإشارتان تُحدَّدان من إشارة x: إن كان x ≥ 0 فالجذران حقيقيان، وإن كان x < 0 فالجذران تخيليان صرف."
          : `بما أن 2uv = ${num(y)} ${y > 0 ? "> 0" : "< 0"} فإن u و v ${y > 0 ? "متماثلتان في الإشارة" : "متخالفان في الإشارة"}، وهذا يمنع الحلول الدخيلة التي تظهر من التربيع:`,
      latex: `u = \\pm ${rootTex(u2)} \\approx \\pm ${num(u0)}, \\qquad v = ${y < 0 ? "\\mp" : "\\pm"} ${rootTex(v2)} \\approx ${num(v0)}`,
    },
    {
      title: "الجذران التربيعيان مع التحقق",
      text: "نتحقق بتربيع كل جذر، فيجب أن يعود إلى z:",
      latex: `\\left(\\pm\\left(${num(u0)} ${sign * v0 >= 0 ? "+" : "-"} ${num(Math.abs(v0))}i\\right)\\right)^{2} = ${num(x)} ${y < 0 ? "-" : "+"} ${num(Math.abs(y))}i \\quad \\checkmark`,
    },
  ];
  const roots = [
    `${num(u0)} ${v0 >= 0 && sign > 0 ? "+" : sign * v0 >= 0 ? "+" : "-"} ${num(Math.abs(v0))}i`,
    `${num(-u0)} ${sign * v0 >= 0 ? "-" : "+"} ${num(Math.abs(v0))}i`,
  ];
  return { ok: r > 1e-12, steps, roots };
}

export function solveComplexNumber(
  a: number,
  b: number,
  a2?: number,
  b2?: number,
  powerN: number = 3,
  rootN: number = 3,
): ComplexSolution {
  if (![a, b, powerN, rootN].every(Number.isFinite))
    throw new Error("أدخل قيماً عددية منتهية.");
  if (
    !Number.isInteger(powerN) ||
    powerN < 0 ||
    !Number.isInteger(rootN) ||
    rootN < 1
  )
    throw new Error("الأس عدد صحيح غير سالب ورتبة الجذر عدد صحيح موجب.");
  if (rootN > 100)
    throw new Error(
      "لعرض جميع الجذور وبراهينها يجب ألا تتجاوز رتبة الجذر 100.",
    );
  const mod = Math.hypot(a, b);
  if (mod === 0)
    throw new Error(
      "زاوية العدد المركب الصفري ومقلوبه غير معرّفين. أدخل عدداً مركباً غير صفري لدراسة أشكاله وزاويته.",
    );
  if (
    ![2, powerN, powerN + 1].every((power) =>
      Number.isFinite(Math.pow(mod, power)),
    )
  )
    throw new Error(
      "القوة المطلوبة أكبر من المجال العددي المتاح. جرّب أساً أصغر.",
    );
  const argRad = Math.atan2(b, a);
  const argDeg = (argRad * 180) / Math.PI;

  // Fraction representation of angle in terms of pi
  const piRatio = argRad / Math.PI;
  const piFrac = decimalToFraction(piRatio);
  const simplePiFraction =
    piFrac !== null &&
    (!piFrac.includes("/") || Number(piFrac.split("/")[1]) <= 24);
  let piLatex = "0";
  if (piFrac && simplePiFraction) {
    if (piFrac === "1") piLatex = "\\pi";
    else if (piFrac === "-1") piLatex = "-\\pi";
    else if (piFrac.includes("/")) {
      const [num, den] = piFrac.split("/");
      const numAbs = Math.abs(Number(num));
      const s = Number(num) < 0 ? "-" : "";
      piLatex =
        numAbs === 1
          ? `${s}\\frac{\\pi}{${den}}`
          : `${s}\\frac{${numAbs}\\pi}{${den}}`;
    } else {
      piLatex = `${piFrac}\\pi`;
    }
  } else {
    piLatex = `${Number(argRad.toFixed(3))} \\text{ rad}`;
  }

  // Modulus latex
  const modSquared = a * a + b * b;
  const isModSquare = Number.isInteger(Math.sqrt(modSquared));
  const modLatex = isModSquare
    ? Math.sqrt(modSquared).toString()
    : `\\sqrt{${modSquared}}`;

  // Cartesian LaTeX
  const signB = b >= 0 ? "+" : "-";
  const cartesianLatex = `z_1 = ${a} ${signB} ${Math.abs(b)}i`;

  // Polar and Exponential LaTeX
  const polarLatex = `${modLatex} \\left(\\cos\\left(${piLatex}\\right) + i\\sin\\left(${piLatex}\\right)\\right)`;
  const exponentialLatex = `${modLatex} \\cdot e^{i \\left(${piLatex}\\right)}`;

  // Conjugate
  const conjugateLatex = `\\overline{z} = ${a} ${b >= 0 ? "-" : "+"} ${Math.abs(b)}i`;

  // Inverse
  let inverseLatex: string | undefined;
  if (modSquared !== 0) {
    const invA = a / modSquared;
    const invB = -b / modSquared;
    const fA = decimalToFraction(invA);
    const fB = decimalToFraction(Math.abs(invB));
    const lA = fA ? fractionToLatex(fA) : Number(invA.toFixed(4)).toString();
    const lB = fB
      ? fractionToLatex(fB)
      : Number(Math.abs(invB).toFixed(4)).toString();
    inverseLatex = `\\frac{1}{z_1} = ${lA} ${invB >= 0 ? "+" : "-"} ${lB}i`;
  }

  // Powers (De Moivre)
  const powerResults: { n: number; latex: string }[] = [];
  for (const n of [...new Set([2, powerN, powerN + 1])]) {
    const rPow = Math.pow(mod, n);
    const thetaPow = n * argRad;
    const rePow = rPow * Math.cos(thetaPow);
    const imPow = rPow * Math.sin(thetaPow);
    const pSign = imPow >= 0 ? "+" : "-";
    powerResults.push({
      n,
      latex: `z_1^{${n}} = (${modLatex})^{${n}} e^{i(${n} \\times ${piLatex})} = ${Number(rePow.toFixed(3))} ${pSign} ${Number(Math.abs(imPow).toFixed(3))}i`,
    });
  }

  // n-th Roots
  const roots: {
    k: number;
    latex: string;
    polar: string;
    re: number;
    im: number;
  }[] = [];
  const rRoot = Math.pow(mod, 1 / rootN);
  for (let k = 0; k < rootN; k++) {
    const angleK = (argRad + 2 * Math.PI * k) / rootN;
    const reK = rRoot * Math.cos(angleK);
    const imK = rRoot * Math.sin(angleK);
    const sK = imK >= 0 ? "+" : "-";
    const angleKRatio = angleK / Math.PI;
    const fAngleK = decimalToFraction(angleKRatio);
    let aKLatex = `${Number(angleK.toFixed(3))}\\text{ rad}`;
    if (
      fAngleK &&
      (!fAngleK.includes("/") || Number(fAngleK.split("/")[1]) <= 24)
    ) {
      if (fAngleK.includes("/")) {
        const [num, den] = fAngleK.split("/");
        const n = Math.abs(Number(num));
        aKLatex = `${Number(num) < 0 ? "-" : ""}\\dfrac{${n === 1 ? "" : n}\\pi}{${den}}`;
      } else {
        aKLatex =
          fAngleK === "1"
            ? "\\pi"
            : fAngleK === "-1"
              ? "-\\pi"
              : `${fAngleK}\\pi`;
      }
    } else if (Math.abs(angleK) < 1e-12) {
      aKLatex = "0";
    }
    roots.push({
      k,
      latex: `w_{${k}} = ${Number(reK.toFixed(3))} ${sK} ${Number(Math.abs(imK).toFixed(3))}i`,
      polar: `\\sqrt[${rootN}]{${modLatex}} \\cdot e^{i \\left(${aKLatex}\\right)}`,
      re: reK,
      im: imK,
    });
  }

  // ---------------- proofs (shown behind a "البرهان" button) ----------------
  const f = (x: number) => String(Number(x.toFixed(4)));
  const pa = (x: number) => (x < 0 ? `\\left(${f(x)}\\right)` : f(x));
  const al = (lines: string[]) =>
    `\\begin{aligned} ${lines.join(" \\\\[8pt] ")} \\end{aligned}`;

  const proofs = {
    polar: [
      {
        title: "الخطوة 1: حساب الطويلة",
        text: "الطويلة هي المسافة بين النقطة ومبدأ المعلم، ونحسبها بنظرية فيثاغورس:",
        latex: al([
          `|z| &= \\sqrt{a^{2} + b^{2}}`,
          `&= \\sqrt{${pa(a)}^{2} + ${pa(b)}^{2}} = \\sqrt{${f(a * a + b * b)}} = ${f(mod)}`,
        ]),
      },
      {
        title: "الخطوة 2: تعميل الطويلة",
        text: "نُخرج الطويلة كعامل مشترك من الشكل الجبري:",
        latex: al([
          `z &= a + bi = |z|\\left(\\dfrac{a}{|z|} + \\dfrac{b}{|z|}\\,i\\right)`,
          `z &= ${f(mod)}\\left(${f(a / (mod || 1))} + ${f(b / (mod || 1))}\\,i\\right)`,
        ]),
      },
      {
        title: "الخطوة 3: تعيين الزاوية",
        text: "نطابق المعاملين مع cos θ و sin θ فنجد الزاوية:",
        latex: al([
          `\\cos\\theta &= \\dfrac{a}{|z|} = ${f(a / (mod || 1))}`,
          `\\sin\\theta &= \\dfrac{b}{|z|} = ${f(b / (mod || 1))}`,
          `\\theta &= ${piLatex} = ${f(argDeg)}^{\\circ}`,
        ]),
      },
      {
        title: "الخطوة 4: الشكل المثلثي",
        text: "نعوّض الطويلة والزاوية في الصيغة العامة:",
        latex: `z = |z|\\left(\\cos\\theta + i\\sin\\theta\\right) = ${polarLatex}`,
      },
    ],
    exponential: [
      {
        title: "الخطوة 1: دستور أويلر",
        text: "ينص دستور أويلر على أن:",
        latex: `e^{i\\theta} = \\cos\\theta + i\\sin\\theta`,
      },
      {
        title: "الخطوة 2: الانطلاق من الشكل المثلثي",
        text: "كتبنا سابقاً العدد بالشكل المثلثي:",
        latex: `z = ${polarLatex}`,
      },
      {
        title: "الخطوة 3: التعويض",
        text: "نستبدل القوس بدستور أويلر فنحصل على الشكل الأسي:",
        latex: al([`z &= |z|\\, e^{i\\theta}`, `z &= ${exponentialLatex}`]),
      },
    ],
    powers: [
      {
        title: "الخطوة 1: دستور دوموافر",
        text: "لرفع عدد مركب إلى قوة طبيعية n نرفع الطويلة إلى n ونضرب الزاوية في n:",
        latex: `z^{n} = \\left(|z|\\,e^{i\\theta}\\right)^{n} = |z|^{n}\\, e^{i n \\theta} = |z|^{n}\\left(\\cos n\\theta + i\\sin n\\theta\\right)`,
      },
      {
        title: "الخطوة 2: التطبيق على عددنا",
        text: "نعوّض الطويلة والزاوية:",
        latex: al([
          `|z| &= ${f(mod)}, \\quad \\theta = ${piLatex}`,
          ...powerResults.map(
            (p) =>
              `z^{${p.n}} &= ${p.latex.split("=").slice(1).join("=").trim()}`,
          ),
        ]),
      },
    ],
    roots: [
      {
        title: "الخطوة 1: صياغة المسألة",
        text: "نبحث عن الأعداد w التي تحقق:",
        latex: `w^{${rootN}} = z = ${f(mod)}\\, e^{i\\left(${piLatex}\\right)}`,
      },
      {
        title: "الخطوة 2: الطويلة والزاوية للجذر",
        text: "نضع w = r·e^{iφ} فينتج r^n = |z| و nφ = θ + 2kπ:",
        latex: al([
          `r &= \\sqrt[${rootN}]{|z|} = \\sqrt[${rootN}]{${f(mod)}} = ${f(rRoot)}`,
          `\\varphi_{k} &= \\dfrac{\\theta + 2k\\pi}{${rootN}}, \\quad k = 0, 1, \\dots, ${rootN - 1}`,
        ]),
      },
      {
        title: "الخطوة 3: الجذور النونية",
        text: `نعطي k القيم من 0 إلى ${rootN - 1} فنحصل على ${rootN} جذور متمايزة:`,
        latex: al(
          roots.map(
            (r) =>
              `w_{${r.k}} &= ${r.polar} = ${r.latex.split("=").slice(1).join("=").trim()}`,
          ),
        ),
      },
      {
        title: "الخطوة 4: التفسير الهندسي",
        text: "صور الجذور تقع على دائرة مركزها المبدأ، وتشكّل رؤوس مضلع منتظم:",
        latex: `\\text{نصف القطر } r = ${f(rRoot)}, \\quad \\text{الفرق بين زاويتين متتاليتين} = \\dfrac{2\\pi}{${rootN}}`,
      },
    ],
  };

  return {
    z1: { re: a, im: b },
    z2: a2 !== undefined && b2 !== undefined ? { re: a2, im: b2 } : undefined,
    cartesianLatex,
    polarLatex,
    exponentialLatex,
    modulus: mod,
    argumentRad: argRad,
    argumentDeg: argDeg,
    conjugateLatex,
    inverseLatex,
    powerResults,
    roots,
    proofs,
  };
}

// Expanded, pure conversation engine: Euler, algebra, large powers and plane transformations.
export { solveComplexRequest } from "./complexWorkbench.js";
