import nerdamer from "nerdamer";
import type { SymbolicVerificationResult } from "./types";

function evidence(passed: boolean, detail: string): SymbolicVerificationResult {
  return {
    evidence: {
      type: "symbolic_equal",
      method: "تبسيط الفرق بالـ nerdamer ثم فحص الصفر الرمزي",
      passed,
      createdAt: new Date().toISOString(),
      detail,
    },
  };
}

/** Symbolic equality is intentionally fail-closed when the CAS cannot parse it. */
export function verifySymbolicEqual(left: string, right: string): SymbolicVerificationResult {
  if (!left.trim() || !right.trim())
    return evidence(false, "لا يوجد طرفان صالحان لإجراء التكافؤ الرمزي.");
  try {
    const expression = nerdamer(`(${left})-(${right})`) as unknown as {
      expand: () => { simplify: () => { text: () => string } };
    };
    const normalizedDifference = expression.expand().simplify().text();
    const passed = normalizedDifference === "0" || normalizedDifference === "0.0";
    return {
      evidence: {
        type: "symbolic_equal",
        method: "تبسيط الفرق بالـ nerdamer ثم فحص الصفر الرمزي",
        passed,
        createdAt: new Date().toISOString(),
        detail: passed
          ? "بُسّط الفرق الرمزي إلى صفر."
          : `بُسّط الفرق إلى ${normalizedDifference} وليس صفرًا.`,
      },
      normalizedDifference,
    };
  } catch {
    return evidence(false, "تعذر على المحلل الرمزي قراءة الطرفين؛ لم تُمنح شارة تحقق.");
  }
}
