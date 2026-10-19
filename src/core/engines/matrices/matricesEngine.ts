import { MatrixSolution } from '../../../types/index.js';
import { tex } from '../equations/equationSolver.js';
import { eigs } from 'mathjs';

// ---------- Gauss / Gauss–Jordan elimination with every row operation recorded ----------
function gaussElimination(src: number[][]): NonNullable<MatrixSolution['gauss']> {
  const n = src.length;
  const m = src[0].length;
  const A = src.map((r) => [...r]);
  const EPS = 1e-10;
  const clean = () => {
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      if (Math.abs(A[i][j]) < EPS) A[i][j] = 0;
      const r = Math.round(A[i][j]);
      if (Math.abs(A[i][j] - r) < 1e-9) A[i][j] = r;
    }
  };
  const T = (x: number) => tex(Math.abs(x) < EPS ? 0 : x);
  const matTex = () => `\\begin{pmatrix} ${A.map((r) => r.map(T).join(' & ')).join(' \\\\ ')} \\end{pmatrix}`;
  const coef = (k: number) => {
    const a = Math.abs(k);
    const body = a === 1 ? '' : tex(a).includes('frac') ? `${tex(a)}\\,` : tex(a);
    return body;
  };

  const ops: NonNullable<MatrixSolution['gauss']>['ops'] = [];
  const pivots: [number, number][] = [];
  let swaps = 0;
  let row = 0;

  // forward elimination → row echelon form
  for (let col = 0; col < m && row < n; col++) {
    let p = -1;
    for (let i = row; i < n; i++) if (Math.abs(A[i][col]) > EPS) { p = i; break; }
    if (p === -1) continue;
    if (p !== row) {
      [A[p], A[row]] = [A[row], A[p]];
      swaps++;
      clean();
      ops.push({ opLatex: `R_{${row + 1}} \\leftrightarrow R_{${p + 1}}`, matrixLatex: matTex(), phase: 'forward' });
    }
    for (let i = row + 1; i < n; i++) {
      if (Math.abs(A[i][col]) < EPS) continue;
      const f = A[i][col] / A[row][col];
      for (let j = col; j < m; j++) A[i][j] -= f * A[row][j];
      clean();
      ops.push({
        opLatex: `R_{${i + 1}} \\leftarrow R_{${i + 1}} ${f > 0 ? '-' : '+'} ${coef(f)}R_{${row + 1}}`,
        matrixLatex: matTex(),
        phase: 'forward'
      });
    }
    pivots.push([row, col]);
    row++;
  }
  const echelonLatex = matTex();
  const rank = pivots.length;

  // determinant from the echelon form (product of the diagonal × (−1)^swaps)
  let detLatex: string | undefined;
  if (n === m) {
    const diag = Array.from({ length: n }, (_, i) => A[i][i]);
    const det = diag.reduce((p, v) => p * v, 1) * (swaps % 2 ? -1 : 1);
    detLatex = `\\det(A) = ${swaps % 2 ? '-' : ''}${diag.map((d) => (d < 0 ? `\\left(${T(d)}\\right)` : T(d))).join(' \\times ')} = ${T(det)}`;
  }

  // backward phase → reduced row echelon form
  for (let k = pivots.length - 1; k >= 0; k--) {
    const [r, c] = pivots[k];
    const pv = A[r][c];
    if (Math.abs(pv - 1) > EPS) {
      for (let j = c; j < m; j++) A[r][j] /= pv;
      clean();
      const inv = 1 / pv;
      ops.push({ opLatex: `R_{${r + 1}} \\leftarrow ${inv < 0 ? '-' : ''}${tex(Math.abs(inv))}\\, R_{${r + 1}}`, matrixLatex: matTex(), phase: 'backward' });
    }
    for (let i = r - 1; i >= 0; i--) {
      if (Math.abs(A[i][c]) < EPS) continue;
      const f = A[i][c];
      for (let j = c; j < m; j++) A[i][j] -= f * A[r][j];
      clean();
      ops.push({ opLatex: `R_{${i + 1}} \\leftarrow R_{${i + 1}} ${f > 0 ? '-' : '+'} ${coef(f)}R_{${r + 1}}`, matrixLatex: matTex(), phase: 'backward' });
    }
  }

  // Syrian/Arabic notation uses L for lines (L₁, L₂, L₃) and the LaTeX commands
  // must be single-backslash so KaTeX renders arrows instead of a broken line break.
  const BS = String.fromCharCode(92);
  const fixCmd = (s: string): string => {
    let out = s.split('R_{').join('L_{');
    for (const cmd of ['leftrightarrow', 'leftarrow', 'cdot', 'times', ',']) {
      const doubled = `${BS}${BS}${cmd}`;
      while (out.includes(doubled)) out = out.split(doubled).join(`${BS}${cmd}`);
    }
    return out;
  };
  ops.forEach((o) => {
    o.opLatex = fixCmd(o.opLatex);
    o.matrixLatex = fixCmd(o.matrixLatex);
  });
  const fixedEchelon = fixCmd(echelonLatex);
  const fixedRref = fixCmd(matTex());
  const fixedDet = detLatex ? fixCmd(detLatex) : undefined;
  return { ops, echelonLatex: fixedEchelon, rrefLatex: fixedRref, rank, detLatex: fixedDet };
}

export function solveMatrixOperations(matA: number[][], matB?: number[][]): MatrixSolution {
  const size = matA.length;
  if (size < 2 || size > 4 || matA.some((row) => row.length !== size || row.some((value) => !Number.isFinite(value)))) {
    throw new Error('أدخل مصفوفة مربعة من الرتبة 2 أو 3 أو 4 بعناصر عددية منتهية.');
  }
  if (matB && (matB.length !== size || matB.some((row) => row.length !== size || row.some((value) => !Number.isFinite(value))))) {
    throw new Error('يجب أن تكون المصفوفتان من الرتبة نفسها وبعناصر عددية منتهية.');
  }
  const steps: { title: string; latex: string; text?: string }[] = [];

  // Determinant helper
  function calcDet(m: number[][]): number {
    const n = m.length;
    if (n === 1) return m[0][0];
    if (n === 2) return m[0][0] * m[1][1] - m[0][1] * m[1][0];
    if (n === 3) {
      return (
        m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
        m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
        m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
      );
    }
    // Generic row reduction determinant
    let det = 1;
    const temp = m.map(row => [...row]);
    for (let i = 0; i < n; i++) {
      let pivot = i;
      while (pivot < n && Math.abs(temp[pivot][i]) < 1e-9) pivot++;
      if (pivot === n) return 0;
      if (pivot !== i) {
        [temp[i], temp[pivot]] = [temp[pivot], temp[i]];
        det *= -1;
      }
      det *= temp[i][i];
      for (let j = i + 1; j < n; j++) {
        const factor = temp[j][i] / temp[i][i];
        for (let k = i; k < n; k++) temp[j][k] -= factor * temp[i][k];
      }
    }
    return det;
  }

  // Transpose
  const transposeA: number[][] = [];
  for (let c = 0; c < size; c++) {
    transposeA[c] = [];
    for (let r = 0; r < size; r++) {
      transposeA[c][r] = matA[r][c];
    }
  }

  // Trace
  let traceA = 0;
  for (let i = 0; i < size; i++) traceA += matA[i][i];

  // Determinant
  const detA = calcDet(matA);
  const detB = matB ? calcDet(matB) : undefined;

  // Inverse (using cofactor/adjugate)
  let inverseA: number[][] | undefined;
  if (Math.abs(detA) > 1e-9) {
    if (size === 2) {
      inverseA = [
        [matA[1][1] / detA, -matA[0][1] / detA],
        [-matA[1][0] / detA, matA[0][0] / detA]
      ];
    } else {
      // General cofactor inverse
      const adj: number[][] = [];
      for (let r = 0; r < size; r++) {
        adj[r] = [];
        for (let c = 0; c < size; c++) {
          const sub = matA
            .filter((_, ri) => ri !== r)
            .map(row => row.filter((_, ci) => ci !== c));
          const sign = (r + c) % 2 === 0 ? 1 : -1;
          adj[r][c] = sign * calcDet(sub);
        }
      }
      // Transpose of cofactor = adjugate, divided by det
      inverseA = [];
      for (let r = 0; r < size; r++) {
        inverseA[r] = [];
        for (let c = 0; c < size; c++) {
          inverseA[r][c] = adj[c][r] / detA;
        }
      }
    }
  }

  // Eigenvalues for 2x2: λ^2 - tr(A)λ + det(A) = 0
  let eigenvaluesA: (number | string)[] | undefined;
  if (size === 2) {
    const disc = traceA * traceA - 4 * detA;
    if (disc >= 0) {
      const l1 = (traceA + Math.sqrt(disc)) / 2;
      const l2 = (traceA - Math.sqrt(disc)) / 2;
      eigenvaluesA = [Number(l1.toFixed(4)), Number(l2.toFixed(4))];
    } else {
      const re = traceA / 2;
      const im = Math.sqrt(-disc) / 2;
      eigenvaluesA = [`${Number(re.toFixed(3))} + ${Number(im.toFixed(3))}i`, `${Number(re.toFixed(3))} - ${Number(im.toFixed(3))}i`];
    }
  }

  if (size > 2) {
    try {
      const result = eigs(matA);
      const values = Array.isArray(result.values) ? result.values : result.values.toArray();
      eigenvaluesA = values.map((value) => typeof value === 'number' ? Number(value.toPrecision(12)) : String(value));
    } catch {
      steps.push({ title: 'القيم الذاتية', text: 'تعذّر تقريب جذور المعادلة المميزة عددياً لهذه المصفوفة.', latex: '\\det(A - \\lambda I) = 0' });
    }
  }

  // Matrix A + B and A * B
  let sumAB: number[][] | undefined;
  let diffAB: number[][] | undefined;
  let productAB: number[][] | undefined;

  if (matB) {
    sumAB = matA.map((r, ri) => r.map((val, ci) => val + matB[ri][ci]));
    diffAB = matA.map((r, ri) => r.map((val, ci) => val - matB[ri][ci]));

    productAB = [];
    for (let r = 0; r < size; r++) {
      productAB[r] = [];
      for (let c = 0; c < size; c++) {
        let sum = 0;
        for (let k = 0; k < size; k++) {
          sum += matA[r][k] * matB[k][c];
        }
        productAB[r][c] = sum;
      }
    }
  }

  // Format steps (exact fractions, Latin digits)
  const T = (x: number) => tex(Math.abs(x) < 1e-12 ? 0 : x);
  const P = (x: number) => (x < 0 ? `\\left(${T(x)}\\right)` : T(x));
  function matToLatex(m: number[][]): string {
    return `\\begin{pmatrix} ${m.map(row => row.map(T).join(' & ')).join(' \\\\ ')} \\end{pmatrix}`;
  }
  const al = (l: string[]) => `\\begin{aligned} ${l.join(' \\\\[6pt] ')} \\end{aligned}`;

  steps.push({
    title: 'المصفوفة A وأثرها',
    latex: al([`A &= ${matToLatex(matA)}`, `\\operatorname{tr}(A) &= ${Array.from({ length: size }, (_, i) => P(matA[i][i])).join(' + ')} = ${T(traceA)}`]),
    text: `مصفوفة مربعة من الرتبة $${size} \\times ${size}$. الأثر هو مجموع عناصر القطر الرئيسي:`
  });

  steps.push({
    title: 'المحدد',
    latex: size === 2
      ? al([`\\det(A) &= ad - bc`, `&= ${P(matA[0][0])} \\times ${P(matA[1][1])} - ${P(matA[0][1])} \\times ${P(matA[1][0])}`, `&= ${T(detA)}`])
      : size === 3
        ? al([
            `\\det(A) &= a_{11}\\begin{vmatrix} a_{22} & a_{23} \\\\ a_{32} & a_{33} \\end{vmatrix} - a_{12}\\begin{vmatrix} a_{21} & a_{23} \\\\ a_{31} & a_{33} \\end{vmatrix} + a_{13}\\begin{vmatrix} a_{21} & a_{22} \\\\ a_{31} & a_{32} \\end{vmatrix}`,
            `&= ${T(detA)}`
          ])
        : `\\det(A) = ${T(detA)}`,
    text: Math.abs(detA) > 1e-9
      ? (size === 3 ? 'ننشر المحدد بالنسبة للسطر الأول. بما أن المحدد غير معدوم فالمصفوفة قابلة للقلب.' : 'بما أن المحدد غير معدوم فالمصفوفة قابلة للقلب.')
      : 'المحدد معدوم، إذن المصفوفة شاذة وغير قابلة للقلب.'
  });

  steps.push({
    title: 'المنقول',
    latex: `A^{T} = ${matToLatex(transposeA)}`,
    text: 'نبدّل الأسطر بالأعمدة:'
  });

  if (inverseA) {
    steps.push({
      title: 'المصفوفة العكسية',
      latex: size === 2
        ? al([`A^{-1} &= \\dfrac{1}{\\det(A)} \\begin{pmatrix} d & -b \\\\ -c & a \\end{pmatrix}`, `&= \\dfrac{1}{${T(detA)}} ${matToLatex([[matA[1][1], -matA[0][1]], [-matA[1][0], matA[0][0]]])}`, `&= ${matToLatex(inverseA)}`])
        : al([`A^{-1} &= \\dfrac{1}{\\det(A)}\\, \\operatorname{adj}(A)`, `&= ${matToLatex(inverseA)}`]),
      text: 'نضرب مقلوب المحدد في المصفوفة المرافقة:'
    });
  }

  if (eigenvaluesA && size === 2) {
    steps.push({
      title: 'القيم الذاتية',
      latex: al([
        `\\det(A - \\lambda I) &= \\lambda^{2} - \\operatorname{tr}(A)\\,\\lambda + \\det(A) = 0`,
        `\\lambda^{2} ${traceA === 0 ? '' : (traceA > 0 ? '- ' : '+ ') + (Math.abs(traceA) === 1 ? '' : T(Math.abs(traceA))) + '\\lambda'} ${detA === 0 ? '' : (detA > 0 ? '+ ' : '- ') + T(Math.abs(detA))} &= 0`,
        `\\lambda_{1} = ${typeof eigenvaluesA[0] === 'number' ? T(eigenvaluesA[0]) : eigenvaluesA[0]}, &\\quad \\lambda_{2} = ${typeof eigenvaluesA[1] === 'number' ? T(eigenvaluesA[1]) : eigenvaluesA[1]}`
      ]),
      text: 'نحل المعادلة المميزة:'
    });
  }

  if (eigenvaluesA && size > 2) {
    steps.push({
      title: 'القيم الذاتية',
      latex: al(['\\det(A - \\lambda I) = 0', ...eigenvaluesA.map((value, index) => `\\lambda_{${index + 1}} \\approx ${typeof value === 'number' ? T(value) : value}`)]),
      text: 'نحسب جذور المعادلة المميزة عددياً:'
    });
  }

  if (matB && sumAB && diffAB) {
    steps.push({
      title: 'المجموع والفرق',
      latex: al([`A + B &= ${matToLatex(sumAB)}`, `A - B &= ${matToLatex(diffAB)}`]),
      text: 'نجمع أو نطرح العناصر المتقابلة:'
    });
  }

  if (productAB && matB) {
    steps.push({
      title: 'جداء المصفوفتين',
      latex: al([`A \\times B &= ${matToLatex(matA)} \\times ${matToLatex(matB)}`, `&= ${matToLatex(productAB)}`]),
      text: 'كل عنصر هو جداء سطر من A في عمود من B:'
    });
  }

  const gauss = gaussElimination(matA);
  return {
    size,
    detA,
    detB,
    rankA: gauss.rank,
    inverseA,
    transposeA,
    traceA,
    eigenvaluesA,
    productAB,
    sumAB,
    diffAB,
    steps,
    gauss
  };
}
