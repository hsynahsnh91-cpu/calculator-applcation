export type SyrianIntervalKind = "open" | "closed" | "left_closed_right_open" | "left_open_right_closed" | "ambiguous";

export interface SyrianInterval {
  raw: string;
  left: string;
  right: string;
  kind: SyrianIntervalKind;
  reason?: string;
}

/**
 * Syrian textbooks commonly write intervals right-to-left as ]a,b[. The glyph
 * alone is ambiguous when OCR has reordered punctuation, so ambiguous forms
 * deliberately remain unresolved rather than being guessed.
 */
export function parseSyrianInterval(source: string): SyrianInterval | undefined {
  const compact = source.replace(/\s+/g, "");
  const match = /^([\[\]])([^,;]+),([^,;]+)([\[\]])$/u.exec(compact);
  if (!match) return undefined;
  const [, opening, left, right, closing] = match;
  if (opening === "]" && closing === "[") return { raw: source, left, right, kind: "open" };
  if (opening === "[" && closing === "]") return { raw: source, left, right, kind: "closed" };
  if (opening === "[" && closing === "[")
    return { raw: source, left, right, kind: "left_closed_right_open" };
  if (opening === "]" && closing === "]")
    return { raw: source, left, right, kind: "left_open_right_closed" };
  return { raw: source, left, right, kind: "ambiguous", reason: "ترتيب قوسي الفترة غير معروف." };
}

export function intervalNeedsClarification(interval: SyrianInterval | undefined): boolean {
  return Boolean(interval && interval.kind === "ambiguous");
}
