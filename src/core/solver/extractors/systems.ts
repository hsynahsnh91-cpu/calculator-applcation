import { canonical, math, parseExpression } from "../math.js";
import { ClarificationError, type SolverContext } from "../types.js";
import { mathFragments } from "./index.js";

/** Linear systems are extracted as a group, not solved as unrelated equations. */
export function extractLinearSystem(text: string, context: SolverContext) {
  const equations = text
    .split(/[\n،؛;]/)
    .flatMap(mathFragments)
    .filter((part) => part.includes("="));
  if (equations.length < 2 || equations.length > 3)
    throw new ClarificationError(
      "اكتب معادلتين أو ثلاث معادلات خطية، كل واحدة في سطر مستقل.",
    );
  const expressions = equations.map((equation) => {
    const sides = equation.split("=");
    if (sides.length !== 2 || !sides[0] || !sides[1])
      throw new ClarificationError("تحقق من طرفي كل معادلة في الجملة.");
    return canonical(`(${sides[0]})-(${sides[1]})`, context.assignments);
  });
  const variables = ["x", "y", "z"].filter((variable) =>
    expressions.some(
      (expression) =>
        parseExpression(expression).filter(
          (node) => math.isSymbolNode(node) && node.name === variable,
        ).length,
    ),
  );
  if (variables.length !== equations.length)
    throw new ClarificationError(
      "يلزم أن يساوي عدد المجاهيل عدد المعادلات: مجهولان أو ثلاثة.",
    );
  for (const expression of expressions)
    for (const variable of variables) {
      const derivative = math.simplify(
        math.derivative(parseExpression(expression), variable),
      );
      if (
        derivative.filter(
          (node) => math.isSymbolNode(node) && variables.includes(node.name),
        ).length
      )
        throw new ClarificationError("هذه الجملة ليست خطية في المجاهيل.");
    }
  const origin = { x: 0, y: 0, z: 0 };
  const nodes = expressions.map((expression) => parseExpression(expression));
  const evaluate = (index: number, values: Record<string, number>) => {
    const value: unknown = nodes[index].evaluate(values);
    if (typeof value !== "number" || !Number.isFinite(value))
      throw new ClarificationError(
        "يجب أن تكون معاملات الجملة أعدادًا حقيقية منتهية.",
      );
    return value;
  };
  const constants = nodes.map((_, index) => -evaluate(index, origin));
  const matrix = nodes.map((_, index) =>
    variables.map(
      (variable) =>
        evaluate(index, { ...origin, [variable]: 1 }) + constants[index],
    ),
  );
  for (const values of [
    { x: 2, y: -1, z: 0.5 },
    { x: -1, y: 3, z: 2 },
  ]) {
    if (
      nodes.some(
        (_, index) =>
          Math.abs(
            evaluate(index, values) -
              matrix[index].reduce(
                (sum, coefficient, column) =>
                  sum +
                  coefficient *
                    values[variables[column] as keyof typeof values],
                -constants[index],
              ),
          ) > 1e-8,
      )
    ) {
      throw new ClarificationError(
        "هذه الجملة ليست خطية. اكتب معادلات خطية في x وy وz.",
      );
    }
  }
  return { variables, nodes, matrix, constants };
}
