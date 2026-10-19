/**
 * OCR, filenames and accompanying notes are reference material, not authority.
 * This conservative signal is a warning/audit aid, not a classifier that grants
 * trust when it does not match.
 */
const instructionLikePatterns = [
  /(?:ignore|disregard|bypass|override)\s+(?:previous|all|system|instructions?)/i,
  /(?:system\s+prompt|developer\s+message|jailbreak|prompt\s*injection)/i,
  /(?:تجاهل|تخط(?:ى|ي)|اعتمد|انشر|اكشف).{0,80}(?:التعليمات|القواعد|النظام|المفتاح|السر)/u,
  /(?:أنت الآن|غيّر دورك|نفّذ الأمر التالي|تعليمات النظام)/u,
];

/** Returns a generic warning only; untrusted content is never echoed as an instruction. */
export function untrustedContentWarnings(values: Array<string | undefined>): string[] {
  const flagged = values.some((value) => {
    const text = value?.slice(0, 24_000) ?? "";
    return text.length > 0 && instructionLikePatterns.some((pattern) => pattern.test(text));
  });
  return flagged
    ? [
        "رُصدت صياغة تشبه تعليمات داخل بيانات غير موثوقة؛ عولجت كمحتوى مرجعي فقط وتجاهلها النظام كأوامر.",
      ]
    : [];
}
