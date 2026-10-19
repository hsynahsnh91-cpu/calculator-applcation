import { decodeLatex } from "./parser.js";
import type { AngleMode, AppMode } from "../../types/index.js";
import {
  ClarificationError,
  type EngineId,
  type SolverContext,
  type SolverResult,
  type Verification,
} from "./types.js";
import {
  extractBounds,
  extractEquation,
  extractExpression,
  extractLimit,
  extractMatrices,
  extractPoints,
  extractScientific,
  extractSequence,
  mathFragments,
  numericMatch,
  requireValue,
} from "./extractors/index.js";

const unverified = (
  method = "لا تتوفر مطابقة عددية مستقلة لهذه النتيجة",
): Verification => ({ passed: false, method });
function result(engine: EngineId, mode: AppMode, title: string): SolverResult {
  return {
    id: `${engine}-${Math.random().toString(36).slice(2, 9)}`,
    engine,
    engines: [engine],
    mode,
    title,
    finalLatex: "",
    steps: [],
    visuals: [],
    verification: unverified(),
  };
}
export async function runEngine(
  engine: EngineId,
  text: string,
  context: SolverContext,
  angleMode: AngleMode,
): Promise<SolverResult> {
  const {
    math,
    canonical,
    expressionTex,
    numberTex,
    matrixTex,
    parseExpression,
    polynomialCoefficients,
    angularExpression,
    sampleCurve,
    verifyDerivative,
    verifyIntegral,
  } = await import("./math.js");
  if (engine === "mathEngine") {
    const { evaluateMathExpression } = await import("../engines/scientific/mathEngine.js");
    const scalar = context.probability?.lastScalar;
    const original = extractScientific(
      text.replace(/(?:الاحتمال|النتيجة)\s+السابق(?:ة)?/g, "ans"),
    ).replace(
      /\bans\b/g,
      context.probability?.lastScalarExact
        ? `(${context.probability.lastScalarExact})`
        : "ans",
    );
    const scope = {
      ...context.assignments,
      ...context.solutions,
      ...(scalar !== undefined ? { ans: scalar } : {}),
    };
    const expression = angularExpression(canonical(original, scope), angleMode);
    const value = evaluateMathExpression(expression, "RAD");
    const out = result(engine, "scientific", "قيمة العبارة");
    out.finalLatex = value.latexStr;
    out.decimal = value.decimalStr;
    out.steps = [
      {
        title: "العبارة المعطاة",
        latex: expressionTex(canonical(original, scope)),
      },
    ];
    if (/\b(sin|cos|tan)\b/.test(original))
      out.steps.push({
        title: "توحيد الزوايا إلى الراديان",
        text: `وحدة الزوايا المختارة ${angleMode}، وإشارة الدرجة الصريحة لها الأولوية.`,
        latex: `${expressionTex(canonical(original, scope))} = ${expressionTex(expression)}`,
      });
    const nerdamer = (await import("nerdamer")).default;
    try {
      const exact = nerdamer(expression) as unknown as {
        simplify(): { toTeX(): string; numeric(): { text(): string } };
      };
      const simplified = exact.simplify();
      const second = Number(simplified.numeric().text());
      if (typeof value.result === "number" && Number.isFinite(second)) {
        const error = Math.abs(second - value.result);
        out.verification = {
          passed: error < 1e-9 * (1 + Math.abs(second)),
          maxError: error,
          method: "مطابقة التقييم بين mathjs وnerdamer بعد توحيد وحدة الزاوية",
        };
        if (out.verification.passed) out.finalLatex = simplified.toTeX();
      }
    } catch {
      /* A correct numeric result remains visible without a verification badge. */
    }
    out.steps.push({
      title: "الحساب والتبسيط",
      latex: `${expressionTex(expression)} = ${out.finalLatex}`,
    });
    return out;
  }
  if (engine === "equationSolver" && /جملة|نظام/.test(text)) {
    const { extractLinearSystem } = await import("./extractors/systems.js");
    const input = extractLinearSystem(text, context);
    const { solveSystem2x2, solveSystem3x3 } = await import(
      "../engines/equations/equationSolver.js"
    );
    const [a, b] = input.matrix;
    const solution =
      input.variables.length === 2
        ? solveSystem2x2(
            a[0],
            a[1],
            input.constants[0],
            b[0],
            b[1],
            input.constants[1],
          )
        : solveSystem3x3(input.matrix, input.constants);
    const rename = (latex: string) =>
      latex.replace(
        /\b[xyz]\b/g,
        (variable) =>
          input.variables[["x", "y", "z"].indexOf(variable)] ?? variable,
      );
    const out = result(engine, "equations", "حل الجملة الخطية");
    out.finalLatex = solution.roots
      .map((root) => rename(root.exactLatex))
      .join(" \\qquad ");
    out.steps = [
      { title: "الجملة المعطاة", latex: rename(solution.equationLatex) },
      ...solution.steps.map((step) => ({
        title: step.title,
        text: step.description,
        latex: rename(step.mathLatex),
      })),
    ];
    const assignments: Record<string, number> = {};
    solution.roots.forEach((root, index) => {
      if (typeof root.decimal === "number" && Number.isFinite(root.decimal))
        assignments[input.variables[index]] = root.decimal;
    });
    if (Object.keys(assignments).length === input.variables.length) {
      const errors = input.nodes.map((node) =>
        Math.abs(Number(node.evaluate({ ...assignments }))),
      );
      const error = Math.max(...errors);
      out.verification = {
        passed: Number.isFinite(error) && error < 1e-8,
        maxError: Number.isFinite(error) ? error : undefined,
        method: "تعويض الحل في كل معادلة من الجملة الأصلية",
        samples: input.nodes.length,
      };
      out.contextPatch = {
        solutions: out.verification.passed ? assignments : {},
      };
    }
    return out;
  }
  if (engine === "equationSolver" || engine === "complexTools") {
    const extracted = extractEquation(text);
    const variable = extracted.variable;
    const expression = canonical(
      extracted.expression,
      context.assignments,
      variable,
    );
    if (engine === "complexTools") {
      const { solveComplexEquation } = await import(
        "../engines/complex/complexEquations.js"
      );
      const solved = solveComplexEquation(expression, variable);
      if (solved)
        return {
          ...result(engine, "complex", "حل المعادلة في الأعداد العقدية"),
          ...solved,
        };
    }
    const coefficients = polynomialCoefficients(expression, variable);
    const { solvePolynomial, verifyRoots, complexRootPoints } = await import(
      "../engines/complex/complexTools.js"
    );
    const solution = solvePolynomial(
      coefficients,
      engine === "equationSolver" ? "real" : "complex",
    );
    const out = result(
      engine,
      engine === "complexTools" ? "complex" : "equations",
      engine === "complexTools"
        ? "حل المعادلة في الأعداد العقدية"
        : "حل المعادلة",
    );
    out.engines =
      engine === "complexTools"
        ? ["equationSolver", "complexTools"]
        : ["equationSolver"];
    out.finalLatex = solution.roots.length
      ? solution.roots
          .map((root) => root.exactLatex.replace(/\bx\b/g, variable))
          .join(" \\qquad ")
      : String.raw`\begin{aligned}${solution.discriminant ? String.raw`\Delta&=${numberTex(solution.discriminant.value)}<0\\[4pt]` : ""}S_{\mathbb R}&=\varnothing\\[4pt]&\text{مستحيلة الحل}\end{aligned}`;
    out.decimal = solution.roots.length
      ? solution.roots
          .map(
            (root) => `${root.label.replace("x", variable)} = ${root.decimal}`,
          )
          .join("، ")
      : undefined;
    out.steps = solution.steps.map((step) => ({
      title: step.title,
      text: step.description,
      latex: step.mathLatex.replace(/\bx\b/g, variable),
    }));
    out.verification = verifyRoots(solution, expression, variable);
    const points = complexRootPoints(solution);
    if (engine === "complexTools")
      out.visuals.push({
        kind: "complex",
        title: "صور الجذور في المستوي العقدي",
        points,
      });
    else if (solution.plotData)
      out.visuals.push({
        kind: "curve",
        title: "منحنى الطرف الأيسر للمعادلة",
        series: [
          {
            label: "f(x)",
            points: solution.plotData.xValues.map((x, i) => ({
              x,
              y: Number.isFinite(solution.plotData!.yValues[i])
                ? solution.plotData!.yValues[i]
                : null,
            })),
          },
          {
            label: "الجذور الحقيقية",
            dots: true,
            points: points
              .filter((point) => point.im === 0)
              .map((point) => ({ x: point.re, y: 0 })),
          },
        ],
      });
    out.contextPatch = {
      expression: expression.replace(new RegExp(`\\b${variable}\\b`, "g"), "x"),
      variable: "x",
    };
    return out;
  }
  if (engine === "calculusEngine") {
    const expression = canonical(
      extractExpression(text, context),
      context.assignments,
    );
    const { computeDerivative, buildVariationTableLatex } = await import(
      "../engines/calculus/calculusEngine.js"
    );
    const plotOnly =
      /ارسم|رسم المنحني|رسم المنحنى/.test(text) && !/مشتق|تغير|مماس/.test(text);
    const out = result(
      engine,
      "calculus",
      plotOnly ? "رسم منحنى الدالة" : "المشتقة ودراسة التغيرات",
    );
    const derivative = math
      .simplify(math.derivative(parseExpression(expression), "x"))
      .toString();
    out.contextPatch = { expression, variable: "x", derivative };
    if (plotOnly) {
      out.finalLatex = `y = ${expressionTex(expression)}`;
      out.steps = [
        {
          title: "مجال الرسم",
          text: "هذا تمثيل عددي على المجال المبين، وليس إثباتًا لسلوك الدالة خارج الرسم.",
          latex: "-5 \\le x \\le 5",
        },
      ];
    } else {
      const point = numericMatch(
        text,
        "(?:عند|x_?0\\s*=)\\s*(-?\\d+(?:\\.\\d+)?)",
      );
      let atX =
        point ??
        [0, 1, 2, -1, 0.5, 3].find((x) => {
          try {
            const f: unknown = math.evaluate(expression, { x });
            const d: unknown = math.evaluate(derivative, { x });
            return (
              typeof f === "number" &&
              Number.isFinite(f) &&
              typeof d === "number" &&
              Number.isFinite(d)
            );
          } catch {
            return false;
          }
        });
      if (atX === undefined)
        throw new ClarificationError("حدد نقطة من مجال الدالة لدراسة مشتقتها.");
      const solution = computeDerivative(expression, atX);
      out.finalLatex = `f'(x) = ${solution.firstDerivativeLatex}`;
      if (/مماس/.test(text))
        out.finalLatex += `\\qquad ${solution.tangentLine?.equationLatex ?? ""}`;
      out.steps = solution.steps
        .filter((step) =>
          /مماس|تماس|التعويض/.test(step.title) ? /مماس/.test(text) : true,
        )
        .map((step) => ({
          title: step.title,
          text: step.explanation,
          latex: step.latex,
        }));
      out.verification = verifyDerivative(expression, derivative);
      const table = buildVariationTableLatex(expression);
      if (table)
        out.visuals.push({
          kind: "table",
          title: "جدول التغيرات",
          latex: table,
        });
    }
    out.visuals.push({
      kind: "curve",
      title: "منحنى الدالة ومشتقتها",
      series: [
        sampleCurve(expression, "f(x)"),
        ...(plotOnly
          ? []
          : [{ ...sampleCurve(derivative, "f′(x)"), color: "#a5b4fc" }]),
      ],
    });
    return out;
  }
  if (engine === "integrationEngine") {
    const expression = canonical(
      extractExpression(text, context),
      context.assignments,
    );
    const bounds = extractBounds(text);
    const { solveIntegral } = await import("../engines/integration/integrationEngine.js");
    const mode = bounds.lower === undefined ? "indefinite" : "definite";
    const solution = solveIntegral({
      expression,
      mode,
      method: "automatic",
      ...bounds,
    });
    const out = result(
      engine,
      "integration",
      mode === "definite" ? "قيمة التكامل المحدد" : "الدالة الأصلية",
    );
    out.finalLatex =
      mode === "definite"
        ? `\\int_{${numberTex(bounds.lower!)}}^{${numberTex(bounds.upper!)}} ${solution.integrandLatex}\\,dx = ${solution.exactValueLatex}`
        : `\\int ${solution.integrandLatex}\\,dx = ${solution.primitiveLatex ?? solution.series?.integratedTex}`;
    out.decimal = solution.decimalValue;
    out.steps = solution.steps.map((step) => ({
      title: step.title,
      text: step.text,
      latex: step.latex,
    }));
    out.verification =
      mode === "definite" && solution.decimalValue !== undefined
        ? verifyIntegral(
            expression,
            bounds.lower!,
            bounds.upper!,
            solution.decimalValue,
          )
        : {
            passed: solution.verified,
            method: "إعادة اشتقاق الدالة الأصلية ومقارنتها بالدالة تحت التكامل",
          };
    if (solution.plotPoints?.length)
      out.visuals.push({
        kind: "curve",
        title:
          mode === "definite"
            ? "الدالة على مجال التكامل وما حوله"
            : "منحنى الدالة تحت التكامل",
        series: [
          {
            label: "f(x)",
            points: solution.plotPoints.map((point) => ({
              x: point.x,
              y: Number.isFinite(point.y) ? point.y : null,
            })),
          },
        ],
      });
    out.note = solution.warning;
    out.contextPatch = { expression, variable: "x" };
    return out;
  }
  if (engine === "limitsEngine") {
    const expression = canonical(
      extractExpression(text, context),
      context.assignments,
    );
    const request = extractLimit(text);
    const { solveLimit, realDomainEndpoints, verifyFiniteLimit } = await import(
      "../engines/limits/limitsEngine.js"
    );
    const targets = request.endpoints
      ? realDomainEndpoints(expression)
      : [request.target];
    if (targets[0] === undefined)
      throw new ClarificationError("إلى أي قيمة يؤول x؟", [
        `جد نهاية ${expression} عندما x تؤول إلى 0`,
        `جد نهايات ${expression} عند أطراف المجال`,
      ]);
    const out = result(engine, "limits", "النهاية وسلوك الدالة");
    const lines: string[] = [],
      warnings: string[] = [];
    const checks: Verification[] = [];
    for (const target of targets) {
      if (target === undefined) continue;
      try {
        const solution = solveLimit(expression, target, request.direction);
        const suffix =
          request.direction === "left"
            ? "^{-}"
            : request.direction === "right"
              ? "^{+}"
              : "";
        const targetTex =
          target === "infinity"
            ? "+\\infty"
            : target === "-infinity"
              ? "-\\infty"
              : numberTex(target);
        lines.push(
          `\\lim_{x\\to ${targetTex}${suffix}} ${expressionTex(expression)} = ${solution.limitValue?.result ?? "\\nexists"}`,
        );
        out.steps.push(
          ...solution.steps.map((step) => ({
            title: step.title,
            text: step.explanation,
            latex: step.latex,
          })),
        );
        if (
          typeof target === "number" &&
          solution.limitValue?.kind === "finite"
        )
          checks.push(
            verifyFiniteLimit(
              expression,
              target,
              solution.limitValue.result,
              request.direction,
            ),
          );
      } catch (error) {
        if (!request.endpoints) throw error;
        warnings.push(
          error instanceof Error && /[\u0600-\u06ff]/.test(error.message)
            ? error.message
            : "تعذّر حساب نهاية أحد أطراف المجال.",
        );
      }
    }
    if (!lines.length)
      throw new ClarificationError(
        warnings[0] ?? "حدّد طرف المجال وجهة الاقتراب.",
      );
    if (warnings.length) out.note = [...new Set(warnings)].join(" ");
    if (
      checks.length === targets.length &&
      checks.every((check) => check.passed)
    )
      out.verification = {
        passed: true,
        method: "مطابقة جميع النهايات المنتهية بفحص عددي مستقل",
        samples: checks.reduce((sum, check) => sum + (check.samples ?? 0), 0),
        maxError: Math.max(...checks.map((check) => check.maxError ?? 0)),
      };
    out.finalLatex = `\\begin{aligned}${lines.join(" \\\\ ")}\\end{aligned}`;
    out.contextPatch = { expression, variable: "x" };
    return out;
  }
  if (engine === "sequences") {
    const input = extractSequence(text);
    const { solveSequence } = await import("../engines/sequences/sequences.js");
    const { solution, verification } = solveSequence(input);
    const out = result(engine, "sequences", solution.name);
    out.finalLatex = /مجموع|اجمع/.test(text)
      ? `S = ${numberTex(solution.sumValue!)} \\qquad ${solution.generalTermLatex}`
      : solution.generalTermLatex;
    out.decimal = solution.sumValue;
    out.verification = verification;
    out.steps = solution.steps.map((step) => ({
      title: step.title,
      text: step.text,
      latex: step.latex,
    }));
    out.visuals = [
      {
        kind: "table",
        title: "الحدود الأولى",
        latex: `\\begin{array}{c|${"c".repeat(Math.min(8, solution.firstTerms.length))}} n & ${solution.firstTerms
          .slice(0, 8)
          .map((term) => term.n)
          .join("&")}\\\\ u_n & ${solution.firstTerms
          .slice(0, 8)
          .map((term) => numberTex(term.value))
          .join("&")}\\end{array}`,
      },
      {
        kind: "curve",
        title: "تمثيل حدود المتتالية",
        series: [
          {
            label: "uₙ",
            dots: true,
            points: solution.chartData.map((point) => ({
              x: point.n,
              y: Number.isFinite(point.value) ? point.value : null,
            })),
          },
        ],
      },
    ];
    return out;
  }
  if (engine === "matricesEngine") {
    const [matrix, second] = extractMatrices(text, context);
    const { solveMatrixOperations } = await import("../engines/matrices/matricesEngine.js");
    const solution = solveMatrixOperations(matrix, second);
    const out = result(engine, "matrices", "عمليات المصفوفة");
    const finals: string[] = [];
    if (/محدد/.test(text) || !/مقلوب|منقول|رتبة|جداء|ضرب|ذاتي/.test(text))
      finals.push(`\\det A = ${numberTex(solution.detA!)}`);
    if (/مقلوب/.test(text))
      finals.push(
        solution.inverseA
          ? `A^{-1} = ${matrixTex(solution.inverseA)}`
          : "\\det A=0 \\implies \\text{لا يوجد مقلوب}",
      );
    if (/منقول/.test(text))
      finals.push(`A^{T} = ${matrixTex(solution.transposeA!)}`);
    if (/رتبة/.test(text))
      finals.push(`\\operatorname{rg}(A)=${solution.rankA}`);
    if (/جداء|ضرب/.test(text)) {
      if (!solution.productAB)
        throw new ClarificationError("ما المصفوفة الثانية لحساب الجداء؟");
      finals.push(`AB=${matrixTex(solution.productAB)}`);
    }
    if (/ذاتي/.test(text))
      finals.push(`\\lambda \\in \\{${solution.eigenvaluesA?.join(",")}\\}`);
    out.finalLatex = `\\begin{aligned}${finals.join("\\\\[6pt]")}\\end{aligned}`;
    out.steps = solution.steps.map((step) => ({
      title: step.title,
      text: step.text,
      latex: step.latex,
    }));
    const independent = math.det(matrix);
    let error = Math.abs(independent - (solution.detA ?? NaN));
    if (solution.inverseA) {
      const product = math.multiply(matrix, solution.inverseA) as number[][];
      error = Math.max(
        error,
        ...product.flatMap((row, i) =>
          row.map((value, j) => Math.abs(value - (i === j ? 1 : 0))),
        ),
      );
    }
    out.verification = {
      passed:
        !/منقول|رتبة|جداء|ضرب|ذاتي/.test(text) &&
        Number.isFinite(error) &&
        error < 1e-7,
      maxError: Number.isFinite(error) ? error : undefined,
      method:
        "مطابقة المحدد بمحرك mathjs والتحقق من حاصل ضرب المصفوفة بمقلوبها؛ لا تشمل الشارة عمليات أخرى",
    };
    if (solution.gauss)
      out.visuals.push({
        kind: "table",
        title: "الشكل المدرج المختزل",
        latex: solution.gauss.rrefLatex,
      });
    out.contextPatch = { matrix };
    return out;
  }
  if (engine === "geometryEngine" || engine === "geometryTools") {
    const geometry = await import("../engines/geometry/geometryEngine.js");
    const tools = await import("../engines/geometry/geometryTools.js");
    const points = extractPoints(text);
    const out = result(engine, "geometry", "نتيجة الهندسة الفراغية");
    if (engine === "geometryTools") {
      const id: import("../engines/geometry/geometryTools.js").SolidId = /مكعب/.test(text)
        ? "cube"
        : /متوازي مستطيلات/.test(text)
          ? "cuboid"
          : /اسطوان/.test(text)
            ? "cylinder"
            : /مخروط/.test(text)
              ? "cone"
              : /هرم/.test(text)
                ? "pyramid"
                : /موشور/.test(text)
                  ? "triangularPrism"
                  : "sphere";
      const dimensions: Record<string, number> = {};
      const symbols =
        id === "cube"
          ? ["a"]
          : id === "cuboid"
            ? ["a", "b", "c"]
            : id === "sphere"
              ? ["r"]
              : id === "pyramid"
                ? ["a", "h"]
                : id === "triangularPrism"
                  ? ["area", "perimeter", "h"]
                  : ["r", "h"];
      for (const symbol of symbols) {
        const arabic =
          symbol === "r"
            ? "نصف قطر(?:ها|ه)?"
            : symbol === "h"
              ? "ارتفاع(?:ها|ه)?"
              : symbol === "a"
                ? "(?:حرف(?:ه|ها)?|ضلعه|طول(?:ه|ها)?)"
                : symbol === "area"
                  ? "مساحة القاعدة"
                  : symbol === "perimeter"
                    ? "محيط القاعدة"
                    : symbol;
        dimensions[symbol] = requireValue(
          numericMatch(
            text,
            `(?:${symbol}\\s*=|${arabic}\\s*(?:يساوي|=)?)\\s*(-?\\d+(?:\\.\\d+)?)`,
          ),
          `ما قيمة ${symbol} للمجسم؟`,
        );
      }
      const solution = tools.solidSolution(id, dimensions);
      out.finalLatex = solution.metrics
        .map((metric) => metric.latex)
        .join("\\qquad ");
      out.steps = solution.steps.map((step) => ({
        title: step.title,
        text: step.explanation,
        latex: step.latex,
      }));
      return out;
    }
    const planeText = mathFragments(text).find(
      (part) => part.includes("=") && /[xyz]/.test(part),
    );
    let plane: import("../engines/geometry/geometryEngine.js").Plane | undefined;
    if (planeText) {
      const [left, right] = planeText.split("=");
      const source = canonical(`(${left})-(${right})`);
      const node = parseExpression(source);
      const f = (x: number, y: number, z: number) =>
        Number(node.evaluate({ x, y, z }));
      const d = f(0, 0, 0);
      plane = { a: f(1, 0, 0) - d, b: f(0, 1, 0) - d, c: f(0, 0, 1) - d, d };
      for (const [x, y, z] of [
        [2, -1, 3],
        [-1, 2, 0.5],
      ])
        if (
          Math.abs(
            f(x, y, z) - (plane.a * x + plane.b * y + plane.c * z + plane.d),
          ) > 1e-8
        )
          throw new ClarificationError(
            "معادلة المستوي يجب أن تكون خطية في x وy وz.",
          );
    }
    let outcome: import("../engines/geometry/geometryEngine.js").Outcome;
    if (/مسافة/.test(text) && plane && points[0]) {
      outcome = geometry.distancePointPlane(points[0].value, plane);
      const projected = tools.projectPointOntoPlane(points[0].value, plane);
      const independent = geometry.norm(
        geometry.sub(points[0].value, projected),
      );
      const residual = Math.abs(
        plane.a * projected[0] +
          plane.b * projected[1] +
          plane.c * projected[2] +
          plane.d,
      );
      const shown = outcome.verdictLatex?.split("=").pop();
      const expected = shown ? Number(math.evaluate(decodeLatex(shown))) : NaN;
      const error = Math.max(residual, Math.abs(independent - expected));
      out.verification = {
        passed: error < 1e-8 && Number.isFinite(independent),
        maxError: Number.isFinite(error) ? error : undefined,
        method:
          "إسقاط النقطة عموديًا على المستوي، وفحص انتماء المسقط وطول متجه الإسقاط",
      };
      out.decimal = independent;
      out.engines = ["geometryEngine", "geometryTools"];
    } else if (/مسافة/.test(text) && points.length >= 2) {
      const distance = geometry.norm(
        geometry.sub(points[0].value, points[1].value),
      );
      out.finalLatex = `d(${points[0].name},${points[1].name})=${numberTex(distance)}`;
      out.decimal = distance;
      out.steps = [
        {
          title: "قانون المسافة في الفضاء",
          latex: `d=\\sqrt{(x_B-x_A)^2+(y_B-y_A)^2+(z_B-z_A)^2}=${numberTex(distance)}`,
        },
      ];
      return out;
    } else if (/مستوي/.test(text) && points.length >= 3)
      outcome = geometry.planeFromThreePoints(
        points[0].value,
        points[1].value,
        points[2].value,
      ).outcome;
    else if (/مستقيم/.test(text) && points.length >= 2)
      outcome = geometry.lineFromTwoPoints(
        points[0].value,
        points[1].value,
      ).outcome;
    else if (/حجم|رباعي/.test(text) && points.length >= 4)
      outcome = geometry.tetrahedronVolume(
        points[0].value,
        points[1].value,
        points[2].value,
        points[3].value,
      );
    else if (points.length >= 2 && /متجه|جداء|تعامد|تواز/.test(text))
      outcome = geometry.vectorOps(
        points[0].value,
        points[1].value,
        [0, 0, 0],
        [0, 0, 0],
      );
    else
      throw new ClarificationError(
        "اكتب إحداثيات النقاط ومعادلة المستوي أو اتجاه المستقيم.",
        [
          "جد المسافة بين النقطة A(1,2,3) والمستوي 2x-y+2z-5=0",
          "جد معادلة المستوي المار بالنقط A(0,0,0) وB(1,0,0) وC(0,1,0)",
        ],
      );
    if (outcome.tone === "bad") throw new ClarificationError(outcome.verdict);
    out.finalLatex =
      outcome.verdictLatex ??
      outcome.metrics.map((metric) => metric.latex).join("\\qquad ");
    out.title = outcome.verdict;
    out.steps = outcome.steps.map((step) => ({
      title: step.title,
      text: step.explanation,
      latex: step.latex,
    }));
    return out;
  }
  if (engine === "probabilityEngine" || engine === "probabilityTools") {
    const { extractProbabilityRequest, assigned } = await import(
      "./extractors/probability.js"
    );
    const { solveProbabilityRequest, solveExactCombinatorics } = await import(
      "../engines/probability/probabilityWorkbench.js"
    );
    const { exact } = await import("../engines/probability/probabilityExact.js");
    const out = result(engine, "probability", "الاحتمالات والإحصاء");
    out.engines = ["probabilityEngine", "probabilityTools"];
    if (
      /توافيق|تراتيب|عاملي/.test(text) &&
      !/سحب|كرات|كرت|كيس|صندوق/.test(text)
    ) {
      const n = assigned(text, "n"),
        k = assigned(text, "k");
      if (n === undefined)
        throw new ClarificationError("ما قيمة n في عملية العد؟");
      return {
        ...out,
        ...solveExactCombinatorics(
          exact(n).number(),
          k === undefined ? undefined : exact(k).number(),
          /عاملي/.test(text)
            ? "factorial"
            : /توافيق/.test(text)
              ? "combination"
              : "permutation",
        ),
      };
    }
    return {
      ...out,
      ...solveProbabilityRequest(
        extractProbabilityRequest(text, context),
        context,
      ),
    };
  }
  if (engine === "complexEngine") {
    const { extractComplexRequest } = await import("./extractors/complex.js");
    const { solveComplexRequest } = await import("../engines/complex/complexEngine.js");
    const input = extractComplexRequest(text, context);
    return {
      ...result(engine, "complex", "الأعداد العقدية"),
      ...solveComplexRequest(input, angleMode),
    };
  }
  throw new ClarificationError("أي عملية رياضية تريد تنفيذها؟");
}
