import type { LatexDocument, LatexNode, LatexSequenceNode } from "./ast";

function printSequence(sequence: LatexSequenceNode): string {
  const parts = sequence.children.map(printLatex);
  return parts
    .map((part, index) => {
      const next = parts[index + 1] ?? "";
      // A letter command must be delimited before a following literal letter:
      // `\\sin x`, not the distinct command `\\sinx`.
      const needsSpace = /\\[A-Za-z]+$/.test(part) && /^[A-Za-z]/.test(next);
      return `${part}${needsSpace ? " " : ""}`;
    })
    .join("");
}

function braced(sequence: LatexSequenceNode): string {
  return `{${printSequence(sequence)}}`;
}

function printableDelimiter(value: string): string {
  return value.startsWith("\\") ? value : value;
}

/** Emits a canonical, lossless LaTeX form. Unknown commands remain visible. */
export function printLatex(node: LatexNode): string {
  switch (node.type) {
    case "sequence":
      return printSequence(node);
    case "symbol":
    case "number":
    case "operator":
      return node.value;
    case "group":
      return braced(node.body);
    case "fraction":
      return `\\${node.command}${braced(node.numerator)}${braced(node.denominator)}`;
    case "root":
      return `\\sqrt${node.index ? `[${printSequence(node.index)}]` : ""}${braced(node.radicand)}`;
    case "script":
      return `${printLatex(node.base)}${node.subscript ? `_${braced(node.subscript)}` : ""}${node.superscript ? `^${braced(node.superscript)}` : ""}`;
    case "command":
      return `\\${node.name}${node.args.map(braced).join("")}`;
    case "delimiter":
      return `\\left${printableDelimiter(node.left)}${printSequence(node.body)}\\right${printableDelimiter(node.right)}`;
    case "environment":
      return `\\begin{${node.name}}${node.rows
        .map((row) => row.map(printSequence).join("&"))
        .join("\\\\")}\\end{${node.name}}`;
    case "unknown-command":
      return `\\${node.name}`;
  }
}

export function printLatexDocument(document: LatexDocument): string {
  return printLatex(document.ast);
}
