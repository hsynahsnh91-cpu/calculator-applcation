import { solveLinear, solveQuadratic, solveCubic } from "../equations/equationSolver";
import type { EquationSolution } from "../../../types";
import { math, parseExpression } from "../../solver/math";
import type { Verification } from "../../solver/types";
export { algebraicSquareRoots, quadrantInfo } from "./complexEngine";
function solvePolynomialRaw(coefficients: number[]): EquationSolution {
  if (coefficients.length === 4)
    return solveCubic(
      coefficients[0],
      coefficients[1],
      coefficients[2],
      coefficients[3],
    );
  if (coefficients.length === 3)
    return solveQuadratic(coefficients[0], coefficients[1], coefficients[2]);
  if (coefficients.length === 2)
    return solveLinear(coefficients[0], coefficients[1]);
  return solveLinear(0, coefficients[0] ?? 0);
}
export function solvePolynomial(
  coefficients: number[],
  domain: "real" | "complex" = "complex",
): EquationSolution {
  const solution = solvePolynomialRaw(coefficients);
  if (domain === "complex") return solution;
  if (
    solution.discriminant &&
    solution.discriminant.value < 0 &&
    coefficients.length === 3
  ) {
    return {
      ...solution,
      roots: [],
      steps: [
        {
          title: "مجموعة الحل المطلوبة",
          description:
            "نحل هنا في الأعداد الحقيقية فقط؛ الحلول العقدية لها طلب مستقل.",
          mathLatex: String.raw`x\in\mathbb R`,
        },
        {
          title: "حساب المميز",
          description:
            "المميز السالب يمنع وجود جذور حقيقية للمعادلة التربيعية.",
          mathLatex: String.raw`\Delta=b^2-4ac=${solution.discriminant.value}<0`,
        },
        {
          title: "مستحيلة الحل في الأعداد الحقيقية",
          description:
            "لا يوجد عدد حقيقي يحقق المعادلة. يمكن طلب حلها في الأعداد العقدية صراحةً.",
          mathLatex: String.raw`S_{\mathbb R}=\varnothing`,
        },
      ],
    };
  }
  const roots = solution.roots.filter((root) => !root.isComplex);
  if (roots.length !== solution.roots.length)
    return {
      ...solution,
      roots,
      steps: [
        {
          title: "المعادلة في الأعداد الحقيقية",
          description: "نحتفظ بالجذور الحقيقية فقط في هذا الطلب.",
          mathLatex: solution.equationLatex,
        },
        ...roots.map((root) => ({
          title: "جذر حقيقي",
          description: "تُفحص قيمته بالتعويض في المعادلة الأصلية.",
          mathLatex: root.exactLatex,
        })),
      ],
    };
  return solution;
}
export function verifyRoots(
  solution: EquationSolution,
  expression: string,
  variable: string,
): Verification {
  const node = parseExpression(expression, {}, variable);
  let checked = 0,
    maxError = 0;
  for (const root of solution.roots) {
    try {
      const value: unknown =
        typeof root.decimal === "number"
          ? root.decimal
          : math.evaluate(String(root.decimal));
      if (typeof value !== "number" && !math.isComplex(value)) continue;
      const residual: unknown = node.evaluate({ [variable]: value });
      const magnitude =
        typeof residual === "number"
          ? Math.abs(residual)
          : math.isComplex(residual)
            ? Math.hypot(residual.re, residual.im)
            : NaN;
      if (!Number.isFinite(magnitude)) continue;
      checked++;
      maxError = Math.max(maxError, magnitude);
    } catch {
      /* Non-numeric solution sets are not labelled as verified roots. */
    }
  }
  return {
    passed: checked > 0 && checked === solution.roots.length && maxError < 1e-6,
    samples: checked,
    maxError,
    method: "تعويض كل جذر في المعادلة الأصلية باستخدام الحساب العددي المستقل",
  };
}
export function complexRootPoints(
  solution: EquationSolution,
): { re: number; im: number; label: string }[] {
  return solution.roots.flatMap((root) => {
    try {
      const value: unknown = math.evaluate(String(root.decimal));
      if (typeof value === "number")
        return [{ re: value, im: 0, label: root.label }];
      if (math.isComplex(value))
        return [{ re: value.re, im: value.im, label: root.label }];
    } catch {
      /* A symbolic set has no single point in the complex plane. */
    }
    return [];
  });
}
