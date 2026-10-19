import {
  type LatexDiagnostic,
  type LatexDocument,
  type LatexEnvironmentNode,
  type LatexNode,
  type LatexSequenceNode,
} from "./ast";
import { tokenizeLatex, type LatexToken } from "./tokenizer";

const SIMPLE_COMMANDS = new Set([
  "pi",
  "infty",
  "to",
  "mapsto",
  "cdot",
  "times",
  "div",
  "pm",
  "mp",
  "leq",
  "geq",
  "le",
  "ge",
  "neq",
  "ne",
  "approx",
  "equiv",
  "Rightarrow",
  "Leftrightarrow",
  "forall",
  "exists",
  "in",
  "notin",
  "cup",
  "cap",
  "setminus",
  "subset",
  "subseteq",
  "emptyset",
  "lfloor",
  "rfloor",
  "lceil",
  "rceil",
  "vert",
  "mid",
  "partial",
  "nabla",
  "ldots",
  "dots",
  "prime",
]);

const FUNCTION_COMMANDS = new Set([
  "sin",
  "cos",
  "tan",
  "cot",
  "sec",
  "csc",
  "arcsin",
  "arccos",
  "arctan",
  "ln",
  "log",
  "exp",
  "det",
  "arg",
  "Re",
  "Im",
  "conj",
]);

const ONE_ARGUMENT_COMMANDS = new Set([
  "mathbb",
  "mathrm",
  "mathbf",
  "mathcal",
  "operatorname",
  "text",
  "overline",
  "underline",
  "leftarrow",
  "overrightarrow",
]);

const SCRIPTED_COMMANDS = new Set(["lim", "sum", "prod", "int"]);

function plainText(node: LatexSequenceNode): string {
  return node.children
    .map((child) => {
      if (child.type === "symbol" || child.type === "number" || child.type === "operator")
        return child.value;
      if (child.type === "command") return child.name;
      if (child.type === "group") return plainText(child.body);
      return "";
    })
    .join("")
    .trim();
}

class LatexParser {
  private readonly tokens: LatexToken[];
  private index = 0;
  readonly diagnostics: LatexDiagnostic[] = [];

  constructor(private readonly source: string) {
    this.tokens = tokenizeLatex(source).filter((token) => token.kind !== "whitespace");
  }

  parse(): LatexDocument {
    const ast = this.sequence(() => false, 0);
    return { source: this.source, ast, diagnostics: this.diagnostics };
  }

  private current(): LatexToken | undefined {
    return this.tokens[this.index];
  }

  private take(): LatexToken | undefined {
    const token = this.current();
    if (token) this.index++;
    return token;
  }

  private diagnostic(
    token: LatexToken | undefined,
    code: LatexDiagnostic["code"],
    message: string,
    hint?: string,
  ): void {
    const start = token?.start ?? this.source.length;
    const end = token?.end ?? start;
    this.diagnostics.push({ code, message, ...(hint ? { hint } : {}), start, end });
  }

  private sequence(stop: (token: LatexToken) => boolean, start: number): LatexSequenceNode {
    const children: LatexNode[] = [];
    while (this.current() && !stop(this.current()!)) {
      const node = this.atom();
      if (!node) {
        const token = this.take();
        this.diagnostic(token, "unexpected_token", "رمز LaTeX في موضع غير متوقع.");
        continue;
      }
      let scripted = node;
      while (this.current()?.kind === "subscript" || this.current()?.kind === "superscript") {
        const marker = this.take()!;
        const value = this.scriptArgument(marker);
        if (!value) continue;
        if (scripted.type === "script") {
          scripted = {
            ...scripted,
            ...(marker.kind === "subscript" ? { subscript: value } : { superscript: value }),
            end: value.end,
          };
        } else {
          scripted = {
            type: "script",
            base: scripted,
            ...(marker.kind === "subscript" ? { subscript: value } : { superscript: value }),
            start: scripted.start,
            end: value.end,
          };
        }
      }
      children.push(scripted);
    }
    const end = children.at(-1)?.end ?? start;
    return { type: "sequence", children, start, end };
  }

  private atom(): LatexNode | undefined {
    const token = this.current();
    if (!token) return undefined;
    if (token.kind === "lbrace") return this.group();
    if (token.kind === "lbracket") {
      this.take();
      return { type: "symbol", value: "[", start: token.start, end: token.end };
    }
    if (token.kind === "rbracket") {
      this.take();
      return { type: "symbol", value: "]", start: token.start, end: token.end };
    }
    if (token.kind === "number") {
      this.take();
      return { type: "number", value: token.value, start: token.start, end: token.end };
    }
    if (token.kind === "word" || token.kind === "delimiter") {
      this.take();
      return { type: "symbol", value: token.value, start: token.start, end: token.end };
    }
    if (token.kind === "operator") {
      this.take();
      return { type: "operator", value: token.value, start: token.start, end: token.end };
    }
    if (token.kind === "command") return this.command();
    return undefined;
  }

  private group(): Extract<LatexNode, { type: "group" }> {
    const open = this.take()!;
    const body = this.sequence((token) => token.kind === "rbrace", open.end);
    const close = this.current();
    if (close?.kind === "rbrace") {
      this.take();
      return { type: "group", body, start: open.start, end: close.end };
    }
    this.diagnostic(open, "missing_closer", "القوس المعقوف المفتوح لا يملك قوس إغلاق.", "أضف } في نهاية المجموعة.");
    return { type: "group", body, start: open.start, end: body.end };
  }

  private groupedArgument(command: LatexToken, name: string): LatexSequenceNode {
    const current = this.current();
    if (current?.kind === "lbrace") {
      const group = this.group();
      return group.body;
    }
    this.diagnostic(
      current ?? command,
      "missing_argument",
      `الأمر \\${name} يحتاج وسيطًا بين { }.` ,
      "ضع التعبير داخل قوسين معقوفين.",
    );
    const fallback = this.atom();
    if (fallback) return { type: "sequence", children: [fallback], start: fallback.start, end: fallback.end };
    return { type: "sequence", children: [], start: command.end, end: command.end };
  }

  private optionalBracketArgument(): LatexSequenceNode | undefined {
    const open = this.current();
    if (open?.kind !== "lbracket") return undefined;
    this.take();
    const body = this.sequence((token) => token.kind === "rbracket", open.end);
    const close = this.current();
    if (close?.kind === "rbracket") {
      this.take();
      return { ...body, start: open.start, end: close.end };
    }
    this.diagnostic(open, "missing_closer", "القوس المربع المفتوح لا يملك إغلاقًا.", "أضف ] في نهاية الدليل.");
    return body;
  }

  private scriptArgument(marker: LatexToken): LatexSequenceNode | undefined {
    if (this.current()?.kind === "lbrace") return (this.group() as Extract<LatexNode, { type: "group" }>).body;
    const atom = this.atom();
    if (!atom) {
      this.diagnostic(marker, "missing_argument", "الأس أو الدليل السفلي بلا قيمة.", "ضع القيمة بعد ^ أو _.");
      return undefined;
    }
    return { type: "sequence", children: [atom], start: atom.start, end: atom.end };
  }

  private command(): LatexNode {
    const token = this.take()!;
    const name = token.value;
    if (name === "frac" || name === "dfrac") {
      const numerator = this.groupedArgument(token, name);
      const denominator = this.groupedArgument(token, name);
      return { type: "fraction", command: name, numerator, denominator, start: token.start, end: denominator.end };
    }
    if (name === "sqrt") {
      const index = this.optionalBracketArgument();
      const radicand = this.groupedArgument(token, name);
      return {
        type: "root",
        ...(index ? { index } : {}),
        radicand,
        start: token.start,
        end: radicand.end,
      };
    }
    if (name === "binom") {
      const upper = this.groupedArgument(token, name);
      const lower = this.groupedArgument(token, name);
      return { type: "command", name, args: [upper, lower], start: token.start, end: lower.end };
    }
    if (name === "left") return this.delimiter(token);
    if (name === "begin") return this.environment(token);
    if (name === "end" || name === "right") {
      this.diagnostic(token, "unexpected_token", `الأمر \\${name} لا يملك بداية مطابقة.`);
      return { type: "unknown-command", name, start: token.start, end: token.end };
    }
    if (SIMPLE_COMMANDS.has(name) || FUNCTION_COMMANDS.has(name) || SCRIPTED_COMMANDS.has(name))
      return { type: "command", name, args: [], start: token.start, end: token.end };
    if (ONE_ARGUMENT_COMMANDS.has(name)) {
      const argument = this.groupedArgument(token, name);
      return { type: "command", name, args: [argument], start: token.start, end: argument.end };
    }
    this.diagnostic(
      token,
      "unknown_command",
      `أمر LaTeX غير معروف: \\${name}.`,
      "راجِع اسم الأمر أو اكتب الرمز بصيغة مدعومة.",
    );
    return { type: "unknown-command", name, start: token.start, end: token.end };
  }

  private delimiter(token: LatexToken): LatexNode {
    const leftToken = this.take();
    if (!leftToken) {
      this.diagnostic(token, "missing_argument", "الأمر \\left يحتاج محددًا بعده.");
      return { type: "unknown-command", name: "left", start: token.start, end: token.end };
    }
    const left = leftToken.kind === "command" ? `\\${leftToken.value}` : leftToken.value;
    const body = this.sequence((candidate) => candidate.kind === "command" && candidate.value === "right", leftToken.end);
    const rightCommand = this.current();
    if (!rightCommand) {
      this.diagnostic(token, "missing_closer", "الأمر \\left لا يملك \\right مطابقًا.");
      return { type: "delimiter", left, right: ".", body, start: token.start, end: body.end };
    }
    this.take();
    const rightToken = this.take();
    if (!rightToken) {
      this.diagnostic(rightCommand, "missing_argument", "الأمر \\right يحتاج محدد إغلاق.");
      return { type: "delimiter", left, right: ".", body, start: token.start, end: rightCommand.end };
    }
    const right = rightToken.kind === "command" ? `\\${rightToken.value}` : rightToken.value;
    return { type: "delimiter", left, right, body, start: token.start, end: rightToken.end };
  }

  private environment(token: LatexToken): LatexNode {
    const nameArgument = this.groupedArgument(token, "begin");
    const name = plainText(nameArgument);
    if (!name) {
      this.diagnostic(token, "malformed_environment", "اسم بيئة LaTeX فارغ.");
      return { type: "unknown-command", name: "begin", start: token.start, end: nameArgument.end };
    }
    const rows: LatexSequenceNode[][] = [];
    let row: LatexSequenceNode[] = [];
    const isEnd = (candidate: LatexToken) => candidate.kind === "command" && candidate.value === "end";
    while (this.current()) {
      if (isEnd(this.current()!)) {
        const endCommand = this.take()!;
        const endName = this.groupedArgument(endCommand, "end");
        const received = plainText(endName);
        if (received !== name)
          this.diagnostic(endCommand, "malformed_environment", `إغلاق البيئة ${received || "فارغ"} لا يطابق ${name}.`);
        if (row.length || !rows.length) rows.push(row);
        const environment: LatexEnvironmentNode = {
          type: "environment",
          name,
          rows,
          start: token.start,
          end: endName.end,
        };
        return environment;
      }
      const cell = this.sequence(
        (candidate) => candidate.kind === "ampersand" || candidate.kind === "rowbreak" || isEnd(candidate),
        this.current()!.start,
      );
      row.push(cell);
      const separator = this.current();
      if (separator?.kind === "ampersand") {
        this.take();
        continue;
      }
      if (separator?.kind === "rowbreak") {
        this.take();
        rows.push(row);
        row = [];
        continue;
      }
      if (!separator) break;
    }
    this.diagnostic(token, "missing_closer", `بيئة ${name} لا تملك \\end{${name}}.`);
    if (row.length || !rows.length) rows.push(row);
    return { type: "environment", name, rows, start: token.start, end: rows.at(-1)?.at(-1)?.end ?? nameArgument.end };
  }
}

export function parseLatex(source: string): LatexDocument {
  return new LatexParser(source.slice(0, 30_000)).parse();
}
