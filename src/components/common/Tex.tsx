import React, { useMemo } from "react";
import katex from "katex";

// Global math sanitizer that ensures raw engine symbols like "pi" become \pi,
// infinity becomes \infty, and asterisks become proper mathematical multiplication.
export function cleanMathLatex(s: string): string {
  if (!s) return "";
  return (
    s
      // Standalone pi / PI / Pi -> \pi
      .replace(/(?<![\\a-zA-Z])(?:pi|PI|Pi)(?![a-zA-Z])/g, "\\pi")
      // Standalone Infinity / infinity -> \infty
      .replace(/(?<![\\a-zA-Z])(?:Infinity|infinity)(?![a-zA-Z])/g, "\\infty")
      // Replace raw * with \cdot between variables/numbers, or \times
      .replace(/(?<=[0-9a-zA-Z])\*(?=[0-9a-zA-Z\\{])/g, " \\cdot ")
      .replace(/\*/g, " \\times ")
      .replace(/∞/g, "\\infty")
      .replace(/×\s*10\^([+-]?\d+)/g, "\\times 10^{$1}")
      .replace(
        /(?<![\\a-zA-Z0-9])(-?(?:\d+\.?\d*|\.\d+))[eE]([+-]?\d+)(?![a-zA-Z0-9])/g,
        "$1 \\times 10^{$2}",
      )
      // Fix operator name collisions
      .replace(/\\operatorname\{pi\}/g, "\\pi")
      .replace(/\\operatorname\{Infinity\}/g, "\\infty")
  );
}

// Inline math renderer that is isolated from the surrounding RTL (Arabic) text
export const Tex: React.FC<{
  math: string;
  className?: string;
  display?: boolean;
}> = ({ math, className = "", display = false }) => {
  const { html, failed } = useMemo(() => {
    try {
      const sanitized = cleanMathLatex(math);
      const rendered = katex.renderToString(sanitized, {
        displayMode: display,
        throwOnError: false,
        strict: false,
        trust: false,
        maxExpand: 1000,
        maxSize: 20,
      });
      const failed = rendered.includes('class="katex-error"');
      return {
        html: failed
          ? katex.renderToString("\\text{تعذّر عرض الصيغة الرياضية}", {
              strict: false,
            })
          : rendered,
        failed,
      };
    } catch {
      return {
        html: katex.renderToString("\\text{تعذّر عرض الصيغة الرياضية}", {
          strict: false,
        }),
        failed: true,
      };
    }
  }, [math, display]);

  return (
    <span
      dir="ltr"
      data-math-error={failed || undefined}
      className={`${display ? "block overflow-x-auto max-w-full py-1" : "inline-block align-middle max-w-full overflow-x-auto"} ${className}`}
      style={{ unicodeBidi: "isolate", direction: "ltr" }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

/** Display conversion only; expression evaluation runs in the solver worker. */
function plainMathLatex(value: string): string {
  let text = value
    .trim()
    .replace(/[٠-٩۰-۹]/g, (c) =>
      String(c.charCodeAt(0) - (c <= "٩" ? 0x660 : 0x6f0)),
    )
    .replace(/٫/g, ".")
    .replace(/[−–]/g, "-")
    .replace(/(?<![\\a-zA-Z])theta(?![a-zA-Z])/g, "\\theta")
    .replace(/(?<![\\a-zA-Z])omega(?![a-zA-Z])/g, "\\omega")
    .replace(/√\s*([\d.]+|[a-z])/gi, "\\sqrt{$1}")
    .replace(/°/g, "^{\\circ}")
    .replace(/\b(sin|cos|tan|cot|sec|csc|ln|log|exp)\b/g, "\\$1");
  let start = text.indexOf("sqrt(");
  while (start >= 0) {
    let depth = 1,
      end = start + 5;
    while (end < text.length && depth) {
      if (text[end] === "(") depth++;
      if (text[end] === ")") depth--;
      end++;
    }
    if (depth) break;
    text =
      text.slice(0, start) +
      `\\sqrt{${text.slice(start + 5, end - 1)}}` +
      text.slice(end);
    start = text.indexOf("sqrt(");
  }
  let offset = 0;
  while ((offset = text.indexOf("^(", offset)) >= 0) {
    let depth = 1,
      end = offset + 2;
    while (end < text.length && depth) {
      if (text[end] === "(") depth++;
      if (text[end] === ")") depth--;
      end++;
    }
    if (depth) break;
    text =
      text.slice(0, offset) +
      `^{${text.slice(offset + 2, end - 1)}}` +
      text.slice(end);
    offset++;
  }
  text = text.replace(/\[\s*\[[\s\S]*?\]\s*\]/g, (literal) => {
    const rows = literal
      .replace(/^\[\s*\[/, "")
      .replace(/\]\s*\]$/, "")
      .split(/\]\s*[,،]\s*\[/)
      .map((r) => r.split(/[,،]/).map((c) => c.trim()));
    if (
      !rows.length ||
      rows.length > 6 ||
      !rows[0].length ||
      rows[0].length > 6 ||
      rows.some(
        (r) =>
          r.length !== rows[0].length ||
          r.some(
            (c) =>
              !c ||
              c.length > 500 ||
              !/^[0-9+*/^().{}\\\s-]+$/.test(c.replace(/sqrt|frac/g, "")),
          ),
      )
    )
      return literal;
    return `\\begin{pmatrix}${rows.map((r) => r.map((c) => c.replace(/(?<![\w.])(-?\d+)\/(\d+)(?![\w.])/g, "\\frac{$1}{$2}")).join("&")).join("\\\\")}\\end{pmatrix}`;
  });
  return text;
}
function plainParts(text: string, autoMath: boolean): React.ReactNode {
  const clean = text.replace(/(?<![\\a-zA-Z])(?:pi|PI|Pi)(?![a-zA-Z])/g, "π");
  if (!autoMath) return clean;
  const parts: React.ReactNode[] = [];
  let end = 0;
  for (const match of clean.matchAll(
    /[A-Za-z0-9٠-٩۰-۹√π∞\\\[][A-Za-z0-9٠-٩۰-۹_+\-*/^=()[\]{},.!|°π√∞\\ \t]*/g,
  )) {
    const value = match[0];
    parts.push(clean.slice(end, match.index));
    if (/[=^*/√°\\]|[+\-].*[a-z0-9]|[A-Za-z]\(|\[\s*\[/.test(value)) {
      parts.push(
        <React.Fragment key={match.index}>
          {value.match(/^\s*/)?.[0]}
          <Tex math={plainMathLatex(value)} className="mx-0.5" />
          {value.match(/\s*$/)?.[0]}
        </React.Fragment>,
      );
    } else parts.push(value);
    end = match.index! + value.length;
  }
  parts.push(clean.slice(end));
  return parts;
}
const latexTokens = new RegExp(
  String.raw`(\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|\$[^$\n]+?\$|` +
    ["cases", "aligned", "pmatrix", "bmatrix", "matrix", "vmatrix", "Vmatrix"]
      .map((name) => String.raw`\\begin\{${name}\}[\s\S]*?\\end\{${name}\}`)
      .join("|") +
    ")",
  "g",
);
// Both standard LaTeX delimiters and dollar delimiters, isolated from RTL prose.
export const RichText: React.FC<{
  text: string;
  className?: string;
  autoMath?: boolean;
}> = ({ text, className = "", autoMath = false }) => {
  const tokens = text.split(latexTokens);
  return (
    <span className={className}>
      {tokens.map((part, index) => {
        if (part.startsWith("\\begin{"))
          return <Tex key={index} math={part} display />;
        if (part.startsWith("\\[") && part.endsWith("\\]"))
          return <Tex key={index} math={part.slice(2, -2)} display />;
        if (part.startsWith("\\(") && part.endsWith("\\)"))
          return (
            <Tex key={index} math={part.slice(2, -2)} className="mx-0.5" />
          );
        if (part.startsWith("$$") && part.endsWith("$$"))
          return <Tex key={index} math={part.slice(2, -2)} display />;
        if (part.startsWith("$") && part.endsWith("$") && part.length > 1)
          return (
            <Tex key={index} math={part.slice(1, -1)} className="mx-0.5" />
          );
        return (
          <React.Fragment key={index}>
            {plainParts(part, autoMath)}
          </React.Fragment>
        );
      })}
    </span>
  );
};
