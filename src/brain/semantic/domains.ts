import { z } from "zod";

export const symbolKindSchema = z.enum([
  "scalar",
  "natural_number",
  "integer",
  "real_number",
  "complex_number",
  "sequence",
  "function",
  "set",
  "matrix",
  "unknown",
]);
export type SymbolKind = z.infer<typeof symbolKindSchema>;

export const symbolDomainSchema = z
  .object({
    symbol: z.string().trim().min(1).max(80),
    kind: symbolKindSchema.default("unknown"),
    domainLatex: z.string().trim().max(2_000).optional(),
    note: z.string().trim().max(1_000).optional(),
  })
  .strict();
export type SymbolDomain = z.infer<typeof symbolDomainSchema>;

/** Conservative extraction: it records only declarations written explicitly. */
export function inferExplicitDomains(text: string): SymbolDomain[] {
  const entries: SymbolDomain[] = [];
  const add = (symbol: string, kind: SymbolKind, domainLatex: string) => {
    if (!entries.some((entry) => entry.symbol === symbol))
      entries.push({ symbol, kind, domainLatex });
  };
  for (const match of text.matchAll(/([A-Za-z](?:_[A-Za-z0-9{}]+)?)\s*(?:∈|\\in)\s*(?:\\mathbb\s*\{?([RNZC])\}?|([RNZC]))/g)) {
    const domain = match[2] ?? match[3];
    const kind: SymbolKind =
      domain === "N" ? "natural_number" : domain === "Z" ? "integer" : domain === "C" ? "complex_number" : "real_number";
    add(match[1], kind, `\\mathbb{${domain}}`);
  }
  for (const match of text.matchAll(/\(([A-Za-z])\s*_?n\)/g)) add(match[1], "sequence", "");
  for (const match of text.matchAll(/([fgh])\s*\(/g)) add(match[1], "function", "");
  return entries;
}

export interface NumericSamplingDomain {
  minimum: number;
  maximum: number;
  exclusions: number[];
  positiveOnly: boolean;
  nonZero: boolean;
}

/** Parses only simple, explicit numerical restrictions for repeatable tests. */
export function numericSamplingDomain(assumptions: string[]): NumericSamplingDomain {
  const domain: NumericSamplingDomain = {
    minimum: -10,
    maximum: 10,
    exclusions: [],
    positiveOnly: false,
    nonZero: false,
  };
  for (const raw of assumptions) {
    const text = raw.replace(/\s+/g, "");
    if (/(?:>0|\\gt0|موجب)/u.test(text)) {
      domain.positiveOnly = true;
      domain.minimum = Math.max(domain.minimum, 0.001);
    }
    if (/(?:\\neq0|!=0|≠0|غيرصفر)/u.test(text)) domain.nonZero = true;
    const lower = /(?:x|n)(?:>|\\gt)(-?\d+(?:\.\d+)?)/i.exec(text)?.[1];
    const upper = /(?:x|n)(?:<|\\lt)(-?\d+(?:\.\d+)?)/i.exec(text)?.[1];
    if (lower !== undefined) domain.minimum = Math.max(domain.minimum, Number(lower));
    if (upper !== undefined) domain.maximum = Math.min(domain.maximum, Number(upper));
    for (const match of text.matchAll(/(?:x|n)(?:!=|\\neq|≠)(-?\d+(?:\.\d+)?)/gi))
      domain.exclusions.push(Number(match[1]));
  }
  return domain;
}
