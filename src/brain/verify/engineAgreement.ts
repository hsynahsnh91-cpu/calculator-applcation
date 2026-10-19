import type { SolverAnswer } from "../../core/solver/types";
import type { VerificationEvidence } from "../semantic/statement";

/**
 * Records agreement only when at least two distinct engines actually produced
 * a verified final value. It never upgrades a single engine's assertion.
 */
export function verifyEngineAgreement(answer: SolverAnswer): VerificationEvidence {
  const verified = answer.results.filter((result) => result.verification.passed && result.finalLatex.trim());
  const engines = [...new Set(verified.flatMap((result) => result.engines))];
  const finals = [...new Set(verified.map((result) => result.finalLatex.replace(/\s+/g, "")))];
  const passed = engines.length >= 2 && finals.length === 1;
  return {
    type: "engine_agreement",
    method: "اتفاق محركين مستقلين أو أكثر على الصيغة النهائية المتحققة",
    passed,
    createdAt: new Date().toISOString(),
    detail: passed
      ? `اتفق ${engines.join(" و ")} على النتيجة نفسها.`
      : engines.length < 2
        ? "لم يعمل محركان مستقلان متحققان، لذلك لا يوجد دليل اتفاق محركات."
        : "أعادت المحركات المتحققة صيغًا نهائية مختلفة.",
  };
}
