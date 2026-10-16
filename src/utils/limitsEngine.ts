import nerdamer from "nerdamer";
import { computeLimit } from "./calculusEngine";
import {
  math,
  numberTex,
  polynomialCoefficients,
  canonical,
  realFunction,
} from "../solver/math";
import type { CalculusSolution } from "../types";
import { ClarificationError, type Verification } from "../solver/types";

export function solveLimit(
  expression: string,
  target: number | "infinity" | "-infinity",
  direction?: "left" | "right",
): CalculusSolution {
  expression = canonical(expression);
  const node = math.parse(expression);
  const answer = (
    latex: string,
    kind: "finite" | "infinite" | "dne",
    title: string,
    explanation: string,
    proof: string,
  ): CalculusSolution => ({
    mode: "limits",
    functionLatex: node.toTex(),
    limitValue: { target: String(target), result: latex, kind },
    steps: [{ title, explanation, latex: proof }],
  });
  const polynomialSign = (coefficients: number[]) =>
    Math.sign(coefficients[0]) *
    (target === "-infinity" && (coefficients.length - 1) % 2 ? -1 : 1);
  if (
    math.isFunctionNode(node) &&
    ["log", "sqrt"].includes(node.fn.toString()) &&
    node.args.length === 1
  ) {
    try {
      const coefficients = polynomialCoefficients(node.args[0].toString());
      const log = node.fn.toString() === "log";
      if (typeof target === "number" && log) {
        const arg = node.args[0].compile();
        if (Math.abs(Number(arg.evaluate({ x: target }))) < 1e-12) {
          const h = 1e-5 * Math.max(1, Math.abs(target));
          const left = Number(arg.evaluate({ x: target - h })) > 0,
            right = Number(arg.evaluate({ x: target + h })) > 0;
          if (
            (direction === "left" && !left) ||
            (direction === "right" && !right) ||
            (!left && !right)
          )
            throw new ClarificationError(
              "اللوغاريتم غير معرّف من الجهة المطلوبة على الأعداد الحقيقية.",
            );
          return answer(
            String.raw`-\infty`,
            "infinite",
            "نهاية اللوغاريتم عند الصفر الموجب",
            "نقترب داخل مجال التعريف فقط؛ حجة اللوغاريتم موجبة وتؤول إلى الصفر.",
            String.raw`u\to0^{+}\implies \ln(u)\to-\infty`,
          );
        }
      } else if (typeof target !== "number" && coefficients.length > 1) {
        if (polynomialSign(coefficients) < 0)
          throw new ClarificationError(
            "هذا الطرف خارج مجال التعريف الحقيقي للدالة. حدّد طرفًا من مجالها.",
          );
        return answer(
          String.raw`+\infty`,
          "infinite",
          log ? "اللوغاريتم عند اللانهاية" : "الجذر عند اللانهاية",
          "كثير الحدود داخل الدالة يؤول إلى اللانهاية الموجبة.",
          log
            ? String.raw`u\to+\infty\implies \ln(u)\to+\infty`
            : String.raw`u\to+\infty\implies \sqrt{u}\to+\infty`,
        );
      }
    } catch (error) {
      if (error instanceof ClarificationError) throw error;
    }
  }
  if (typeof target !== "number" && /^(sin|cos)\(x\)$/.test(expression)) {
    const sine = expression.startsWith("sin"),
      sign = target === "-infinity" ? "-" : "";
    return answer(
      String.raw`\nexists`,
      "dne",
      "التذبذب وعدم وجود نهاية",
      "نأخذ n عددًا طبيعيًا يؤول إلى اللانهاية. المتتاليتان أدناه تتجهان إلى الطرف المطلوب، وتعطيان قيمتين مختلفتين.",
      sine
        ? String.raw`\sin(${sign}2n\pi)=0,\quad \sin(\frac{\pi}{2}${sign || "+"}2n\pi)=1`
        : String.raw`\cos(${sign}2n\pi)=1,\quad \cos(\pi${sign || "+"}2n\pi)=-1`,
    );
  }
  if (!direction || typeof target !== "number") {
    const solution = computeLimit(expression, target);
    const knownProof = solution.steps.some((step) =>
      /التحليل واختزال|الإبدال بالمكافئ|إخراج العامل المسيطر/.test(step.title),
    );
    const continuous =
      solution.steps.some(
        (step) => step.title === "التعويض المباشر (الاتصال)",
      ) && !/floor|ceil|round|sign/.test(expression);
    const needsSymbolicConfirmation =
      !knownProof &&
      !continuous &&
      (solution.limitValue?.kind === "finite" || typeof target !== "number");
    if (!needsSymbolicConfirmation) return solution;
    // Legacy finite probes are hints only. Confirm symbolically, then use separate real probes.
    try {
      const exact = nerdamer.limit(
        expression,
        "x",
        target === "infinity"
          ? "Infinity"
          : target === "-infinity"
            ? "-Infinity"
            : String(target),
      ) as unknown as {
        text(): string;
        numeric(): { text(): string };
        toTeX(): string;
      };
      const text = exact.text(),
        value = Number(exact.numeric().text());
      const infinite = /^-?(?:Inf|Infinity)$/i.test(text);
      const f = realFunction(expression);
      const points =
        typeof target === "number"
          ? [target - 1e-5, target - 1e-7, target + 1e-5, target + 1e-7]
          : target === "infinity"
            ? [100, 200, 1e4, 1e6, 1e8]
            : [-100, -200, -1e4, -1e6, -1e8];
      const values = points.map(f).filter(Number.isFinite).slice(-3);
      const matches = infinite
        ? values.every(
            (sample) =>
              Math.sign(sample) === (text.startsWith("-") ? -1 : 1) &&
              Math.abs(sample) > 1e4,
          )
        : Number.isFinite(value) &&
          values.every(
            (sample) =>
              Math.abs(sample - value) / (1 + Math.abs(value)) < 0.005,
          );
      if (values.length < 2 || !matches) throw new Error("unconfirmed");
      const latex = infinite
        ? text.startsWith("-")
          ? String.raw`-\infty`
          : String.raw`+\infty`
        : exact.toTeX();
      return answer(
        latex,
        infinite ? "infinite" : "finite",
        "حساب رمزي وفحص تقارب مستقل",
        "حُسبت النهاية رمزيًا ثم قورنت بقيم حقيقية قرب الطرف؛ لم تُعرض آخر عينة عددية بوصفها نهاية.",
        latex,
      );
    } catch {
      throw new ClarificationError(
        "تعذّر تأكيد النهاية رمزيًا وعدديًا. حدّد جهة الاقتراب أو بسّط الصيغة؛ لم تُعتمد قيمة تخمينية.",
      );
    }
  }
  const result = nerdamer.limit(
    expression,
    "x",
    String(target),
    direction,
  ) as unknown as {
    text(): string;
    numeric(): { text(): string };
    toTeX(): string;
  };
  const text = result.text(),
    value = Number(result.numeric().text()),
    infinite = /^-?(?:Inf|Infinity)$/i.test(text);
  const latex = infinite
    ? text.startsWith("-")
      ? String.raw`-\infty`
      : String.raw`+\infty`
    : result.toTeX();
  if (
    !infinite &&
    (!Number.isFinite(value) ||
      !verifyFiniteLimit(expression, target, latex, direction).passed)
  )
    throw new ClarificationError(
      "تعذّر تأكيد النهاية من الجهة المطلوبة؛ لم تُعتمد قيمة تخمينية.",
    );
  return answer(
    latex,
    infinite ? "infinite" : "finite",
    "النهاية الأحادية",
    `نقترب من ${direction === "left" ? "اليسار" : "اليمين"} فقط.`,
    String.raw`\lim_{x\to ${numberTex(target)}^{${direction === "left" ? "-" : "+"}}}${node.toTex()}=${latex}`,
  );
}
export function realDomainEndpoints(
  expression: string,
): (number | "infinity" | "-infinity")[] {
  const points: number[] = [];
  let unresolved = false;
  const node = math.parse(canonical(expression));
  node.traverse((child) => {
    const base =
      math.isOperatorNode(child) && child.op === "/"
        ? child.args[1]
        : math.isOperatorNode(child) &&
            child.op === "^" &&
            Number(child.args[1].toString()) < 0
          ? child.args[0]
          : math.isFunctionNode(child) &&
              ["sqrt", "log"].includes(child.fn.toString())
            ? child.args[0]
            : null;
    if (!base) return;
    try {
      const coefficients = polynomialCoefficients(base.toString());
      if (coefficients.length === 2)
        points.push(-coefficients[1] / coefficients[0]);
      if (coefficients.length === 3) {
        const [a, b, c] = coefficients,
          delta = b * b - 4 * a * c;
        if (delta >= 0)
          points.push(
            (-b - Math.sqrt(delta)) / (2 * a),
            (-b + Math.sqrt(delta)) / (2 * a),
          );
      }
    } catch {
      unresolved = true;
    }
  });
  if (unresolved)
    throw new ClarificationError(
      "تعذّر تحديد جميع حدود مجال التعريف رمزيًا. حدّد طرف المجال الذي تريد نهايته.",
    );
  const f = realFunction(expression);
  const candidates: (number | "infinity" | "-infinity")[] = [
    "-infinity",
    ...[...new Set(points)].sort((a, b) => a - b),
    "infinity",
  ];
  return candidates.filter((point) => {
    if (typeof point === "number") {
      const h = 1e-5 * Math.max(1, Math.abs(point));
      return [f(point - h), f(point + h)].some(Number.isFinite);
    }
    const sign = point === "infinity" ? 1 : -1;
    return [10, 100, 1000].some((distance) =>
      Number.isFinite(f(sign * distance)),
    );
  });
}
export function verifyFiniteLimit(
  expression: string,
  target: number,
  expectedLatex: string,
  direction?: "left" | "right",
): Verification {
  let expected = NaN;
  try {
    const from = nerdamer.convertFromLaTeX(expectedLatex) as unknown as {
      numeric(): { text(): string };
    };
    expected = Number(from.numeric().text());
  } catch {
    /* Infinite/nonexistent limits are not verified by finite probes. */
  }
  const f = realFunction(expression);
  const h = 1e-6 * Math.max(1, Math.abs(target));
  const values =
    direction === "left"
      ? [f(target - h)]
      : direction === "right"
        ? [f(target + h)]
        : [f(target - h), f(target + h)];
  const error = Math.max(
    ...values.map(
      (value) => Math.abs(value - expected) / (1 + Math.abs(expected)),
    ),
  );
  return {
    passed: Number.isFinite(error) && error < 1e-4,
    samples: values.length,
    maxError: Number.isFinite(error) ? error : undefined,
    method:
      "مطابقة النهاية الرمزية بقيم عددية قريبة من الجهة المطلوبة؛ فحص مساعد وليس برهانًا عامًا",
  };
}
