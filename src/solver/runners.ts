import type { AngleMode, AppMode } from "../types";
import {
  ClarificationError,
  type EngineId,
  type SolverContext,
  type SolverResult,
  type Verification,
} from "./types";
import {
  extractBounds,
  extractEquation,
  extractExpression,
  extractLimit,
  extractMatrices,
  extractScientific,
  extractSequence,
} from "./extractors";

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
  } = await import("./math");
  if (engine === "mathEngine") {
    const { evaluateMathExpression } = await import("../utils/mathEngine");
    const geometricReference =
      /النتيجة\s+الهندسية\s+السابق(?:ة)?/.test(text) ||
      ((context.lastEngine === "geometryEngine" ||
        context.lastEngine === "geometryTools") &&
        /النتيجة\s+السابق(?:ة)?|\bans\b/.test(text));
    let scalar = geometricReference
      ? context.geometry?.lastScalar
      : context.probability?.lastScalar;
    let exactScalar = geometricReference
      ? context.geometry?.lastScalarExpression
      : context.probability?.lastScalarExact;
    const genericPrevious =
      /النتيجة\s+السابق(?:ة)?|\bans\b/.test(text) &&
      !/الاحتمال\s+السابق|النتيجة\s+الهندسية/.test(text);
    if (
      genericPrevious &&
      (context.lastEngine === "complexEngine" ||
        context.lastEngine === "complexTools")
    ) {
      if (!context.complex?.current || context.complex.ambiguous)
        throw new ClarificationError(
          "النتيجة السابقة ليست عددًا واحدًا محددًا؛ ما العدد المقصود؟",
        );
      const { complexValue, zero } = await import("../utils/complexMath");
      const v = complexValue(context.complex.current),
        prompt = context.lastPrompt || "";
      exactScalar = /طويلة|مقياس|\babs\s*\(/.test(prompt)
        ? v.norm
        : /عمدة|\barg\s*\(/.test(prompt)
          ? v.angle
          : zero(v.i)
            ? v.r
            : v.expression;
      if (!exactScalar)
        throw new ClarificationError(
          "لا توجد قيمة عددية محددة لهذه النتيجة السابقة.",
        );
      scalar = undefined;
    } else if (
      genericPrevious &&
      !geometricReference &&
      context.lastEngine !== "probabilityEngine" &&
      context.lastEngine !== "probabilityTools"
    )
      throw new ClarificationError(
        "النتيجة السابقة ليست متاحة كقيمة واحدة لهذا المسار؛ سمّها أو اكتب قيمتها بدل استعمال قيمة قديمة.",
      );
    const quantitySubstitutions = context.school?.values || {};
    const original = extractScientific(
      text.replace(
        /(?:الاحتمال|النتيجة(?:\s+الهندسية)?)\s+السابق(?:ة)?/g,
        "ans",
      ),
    )
      .replace(/\bans\b/g, exactScalar ? `(${exactScalar})` : "ans")
      .replace(/\b[A-Z]\b/g, (name) =>
        quantitySubstitutions[name] ? `(${quantitySubstitutions[name]})` : name,
      );
    const scope = {
      ...context.assignments,
      ...context.solutions,
      ...(scalar !== undefined ? { ans: scalar } : {}),
    };
    const expression = angularExpression(canonical(original, scope), angleMode);
    const value = evaluateMathExpression(expression, "RAD");
    if (
      (typeof value.result === "number" && !Number.isFinite(value.result)) ||
      (math.isComplex(value.result) &&
        (!Number.isFinite(value.result.re) ||
          !Number.isFinite(value.result.im)))
    )
      throw new ClarificationError(
        "القيمة غير معرفة أو خرجت عن المجال العددي؛ لا تُعرض اللانهاية بديلًا عن قسمة على صفر أو عن تجاوز السعة.",
      );
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
    const { extractLinearSystem } = await import("./extractors/systems");
    const input = extractLinearSystem(text, context);
    const { solveSystem2x2, solveSystem3x3 } = await import(
      "../utils/equationSolver"
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
        "../utils/complexEquations"
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
      "../utils/complexTools"
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
    const { schoolSubstitution } = await import("../utils/schoolAnalysis");
    const substitution = schoolSubstitution(text, context);
    if (substitution)
      return {
        ...result(engine, "calculus", "التحقق بالتعويض"),
        ...substitution,
      };
    const { schoolUniqueRoot } = await import("../utils/schoolAnalysis");
    const proof = schoolUniqueRoot(text, context);
    if (proof)
      return { ...result(engine, "calculus", "وجود حل وحيد"), ...proof };
    const expression = canonical(
      extractExpression(text, context),
      context.assignments,
    );
    const { computeDerivative, buildVariationTableLatex } = await import(
      "../utils/calculusEngine"
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
      const { assigned } = await import("./extractors/probability");
      const { exact } = await import("../utils/probabilityExact");
      const pointExpression = assigned(text, "x_?0|x|عند");
      const point =
        pointExpression === undefined
          ? undefined
          : exact(pointExpression).number();
      if (/مماس/.test(text) && point === undefined)
        throw new ClarificationError(
          "عند أي نقطة تريد المماس؟ أعط فاصلتها بصورة عددية محددة.",
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
      if (point !== undefined) {
        const { scalar, tex, evaluateScalar } = await import(
          "../utils/complexMath"
        );
        const replace = (source: string) =>
            source.replace(/\bx\b/g, `(${exact(pointExpression!).text()})`),
          slope = scalar(replace(derivative)),
          height = scalar(replace(expression));
        const slopeValue = evaluateScalar(slope),
          h = 1e-5 * Math.max(1, Math.abs(point)),
          numeric =
            (Number(math.evaluate(expression, { x: point + h })) -
              Number(math.evaluate(expression, { x: point - h }))) /
            (2 * h);
        out.verification = {
          ...out.verification,
          passed:
            out.verification.passed &&
            Number.isFinite(numeric) &&
            Math.abs(numeric - slopeValue) <=
              2e-5 * Math.max(1, Math.abs(slopeValue)),
          method:
            "مطابقة المشتق بفروق مركزية مستقلة، وفحص قيمته عند نقطة الدراسة المعطاة",
        };
        if (/مماس/.test(text)) {
          const tangent = scalar(
            `(${slope})*(x-(${exact(pointExpression!).text()}))+(${height})`,
          );
          out.finalLatex = `f'(x)=${expressionTex(derivative)}\\qquad y=${tex(tangent)}`;
          out.steps.push({
            title: "معادلة المماس بالقيم الدقيقة",
            latex: `y=f'(a)(x-a)+f(a)=${tex(tangent)}`,
          });
        } else {
          out.finalLatex += `\\qquad f'(${exact(pointExpression!).tex()})=${tex(slope)}`;
          out.decimal = slopeValue;
          out.steps.push({
            title: "التعويض بنقطة الدراسة",
            latex: `f'(${exact(pointExpression!).tex()})=${tex(slope)}`,
          });
        }
      }
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
    const { schoolIntegral } = await import("../utils/schoolAnalysis");
    const derived = await schoolIntegral(text, context);
    if (derived)
      return {
        ...result(engine, "integration", "التكامل المدرسي"),
        ...derived,
      };
    const expression = canonical(
      extractExpression(text, context),
      context.assignments,
    );
    const bounds = extractBounds(text);
    const { solveIntegral } = await import("../utils/integrationEngine");
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
      "../utils/limitsEngine"
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
    const { schoolSequence } = await import("../utils/schoolSequence");
    const schoolAnswer = schoolSequence(text, context);
    if (schoolAnswer)
      return { ...result(engine, "sequences", "المتتالية"), ...schoolAnswer };
    const input = extractSequence(text);
    const { solveSequence } = await import("../utils/sequences");
    const { solution, verification } = solveSequence(input);
    const out = result(engine, "sequences", solution.name);
    out.finalLatex = /مجموع|اجمع/.test(text)
      ? `S = ${numberTex(solution.sumValue!)} \\qquad ${solution.generalTermLatex}`
      : solution.generalTermLatex;
    out.decimal = /مجموع|اجمع/.test(text) ? solution.sumValue : undefined;
    out.verification = /مجموع|اجمع/.test(text)
      ? verification
      : unverified(
          "لم يجر فحص مستقل لهذه الصيغة؛ فحص المجموع لا يكفي للتحقق من كل طلب عن المتتالية.",
        );
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
    const { solveMatrixOperations } = await import("../utils/matricesEngine");
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
    const { schoolSphereTangency } = await import("../utils/schoolAnalysis");
    const tangent = await schoolSphereTangency(text, context);
    if (tangent)
      return { ...result(engine, "geometry", "تماس الكرة"), ...tangent };
    const { extractSpaceRequest } = await import("./extractors/geometry");
    const { solveSpaceRequest } = await import(
      "../utils/spaceGeometryWorkbench"
    );
    return {
      ...result(engine, "geometry", "الهندسة الفراغية"),
      ...solveSpaceRequest(extractSpaceRequest(text, context, angleMode)),
    };
  }
  if (engine === "probabilityEngine" || engine === "probabilityTools") {
    const { extractProbabilityRequest, assigned } = await import(
      "./extractors/probability"
    );
    const { solveProbabilityRequest, solveExactCombinatorics } = await import(
      "../utils/probabilityWorkbench"
    );
    const { exact } = await import("../utils/probabilityExact");
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
    const { schoolComplexExpression } = await import("../utils/schoolComplex");
    const quantity = schoolComplexExpression(text, context);
    if (quantity)
      return {
        ...result(engine, "complex", "قيمة المقدار العقدي"),
        ...quantity,
      };
    const { extractComplexRequest } = await import("./extractors/complex");
    const { solveComplexRequest } = await import("../utils/complexEngine");
    const input = extractComplexRequest(text, context);
    const solved = solveComplexRequest(input, angleMode);
    if (input.measure && input.expression) {
      const { complexValue, zero, evaluateScalar } = await import(
        "../utils/complexMath"
      );
      const v = complexValue(input.expression),
        name =
          input.targetName
            ?.replace(/^z_([A-Z])$/, "z_{$1}")
            .replace(/^z([1-9])$/, "z_{$1}") || "z";
      if (input.measure === "modulus") {
        solved.title = "طويلة العدد العقدي — المقياس";
        solved.finalLatex = `|${name}|=${v.normTex}`;
        solved.decimal = evaluateScalar(v.norm);
      } else {
        solved.title = "عمدة العدد العقدي";
        solved.finalLatex = zero(v.norm)
          ? `\\arg(0)\\ \\text{غير معرّفة}`
          : `\\arg(${name})=${v.angleTex}\\pmod{2\\pi}`;
        solved.decimal = undefined;
        if (zero(v.norm))
          solved.verification = {
            passed: false,
            method: "لا توجد عمدة للعدد0 لفحصها.",
          };
      }
    }
    return { ...result(engine, "complex", "الأعداد العقدية"), ...solved };
  }
  throw new ClarificationError("أي عملية رياضية تريد تنفيذها؟");
}
