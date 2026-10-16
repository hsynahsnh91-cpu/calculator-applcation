import { mathInstructionText } from "./textbook";

/** Expand only explicit lists of independent geometric operands, not a proof or formula AST. */
export function splitSpaceDemands(text: string): string[] {
  const demand = mathInstructionText(text),
    at = text.indexOf(demand);
  const plural = demand.match(
    /^(?:احسب|جد|اوجد|عين|اكتب)\s+(احداثيات|مركبات|طويلتي|طويلتا|طويلة|طولي|طول|اطوال|طويلات|ناظمي)\s*(?:الشعاعين|الاشعة|المتجهين|المتجهات|المستويين)?\s+([A-Za-z0-9و\s،,]+)[؟?]?$/,
  );
  if (!plural) return [text];
  const names = plural[2]
    .split(/\s*[,،]\s*|\s+و\s*/)
    .map((n) => n.trim())
    .filter(Boolean);
  const coordinate = /احداثيات|مركبات/.test(plural[1]),
    normal = plural[1] === "ناظمي";
  if (
    names.length < 2 ||
    names.length > 6 ||
    new Set(names).size !== names.length ||
    names.some(
      (n) =>
        !(
          normal
            ? /^(?:[PQR][1-6]?|Pi[1-6]?|alpha|beta)$/
            : coordinate
              ? /^[A-Z]{2}$/
              : /^(?:[uvwnabcr]|[A-Z]{2})$/
        ).test(n),
    )
  )
    return [text];
  return names.map(
    (n, i) =>
      `${i === 0 && at > 0 ? text.slice(0, at) : ""}${normal ? "جد ناظم المستوي" : coordinate ? "جد احداثيات الشعاع" : "احسب طويلة الشعاع"} ${n}`,
  );
}
