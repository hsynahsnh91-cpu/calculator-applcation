import type {
  EngineConversion,
  LatexDiagnostic,
  LatexNode,
  LatexSequenceNode,
} from "./ast";
import { printLatex } from "./printer";

interface ConversionState {
  unsupported: string[];
  diagnostics: LatexDiagnostic[];
}

const commandMap: Record<string, string> = {
  pi: "pi",
  infty: "Infinity",
  cdot: "*",
  times: "*",
  div: "/",
  pm: "+/-",
  mp: "-/+",
  leq: "<=",
  geq: ">=",
  le: "<=",
  ge: ">=",
  neq: "!=",
  ne: "!=",
  approx: "~=",
  equiv: "<=>",
  to: "->",
  mapsto: "->",
  sin: "sin",
  cos: "cos",
  tan: "tan",
  cot: "cot",
  sec: "sec",
  csc: "csc",
  arcsin: "asin",
  arccos: "acos",
  arctan: "atan",
  ln: "ln",
  log: "log",
  exp: "exp",
  Re: "re",
  Im: "im",
};

function unsupported(state: ConversionState, label: string, node: LatexNode): void {
  if (!state.unsupported.includes(label)) state.unsupported.push(label);
  state.diagnostics.push({
    code: "unexpected_token",
    message: `لا يمكن تحويل ${label} تلقائيًا إلى صيغة تنفيذ المحرك دون فقدان المعنى.`,
    start: node.start,
    end: node.end,
  });
}

const functionCommands = new Set([
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
]);

function sequenceText(sequence: LatexSequenceNode, state: ConversionState): string {
  const parts: string[] = [];
  for (let index = 0; index < sequence.children.length; index++) {
    const child = sequence.children[index]!;
    // TeX functions normally take the next atom without braces (`\\sin x`).
    // Turning that into `sinx` would silently change it to a new symbol, so we
    // consume exactly one following AST atom and add explicit engine brackets.
    if (child.type === "command" && functionCommands.has(child.name) && !child.args.length) {
      const argument = sequence.children[index + 1];
      if (!argument || argument.type === "operator") {
        unsupported(state, `الدالة \\${child.name} بلا وسيط`, child);
        parts.push(commandMap[child.name] ?? child.name);
        continue;
      }
      parts.push(`${commandMap[child.name] ?? child.name}(${convertNode(argument, state)})`);
      index++;
      continue;
    }
    parts.push(convertNode(child, state));
  }
  return parts.join("");
}

function subscriptText(sequence: LatexSequenceNode, state: ConversionState): string {
  return sequenceText(sequence, state).replace(/\s+/g, "");
}

function convertNode(node: LatexNode, state: ConversionState): string {
  switch (node.type) {
    case "sequence":
      return sequenceText(node, state);
    case "symbol":
    case "number":
    case "operator":
      return node.value;
    case "group":
      return `(${sequenceText(node.body, state)})`;
    case "fraction":
      return `(${sequenceText(node.numerator, state)})/(${sequenceText(node.denominator, state)})`;
    case "root": {
      const radicand = sequenceText(node.radicand, state);
      if (!node.index) return `sqrt(${radicand})`;
      return `(${radicand})^(1/(${sequenceText(node.index, state)}))`;
    }
    case "script": {
      if (node.base.type === "command" && functionCommands.has(node.base.name))
        unsupported(state, `قوة أو دليل للدالة \\${node.base.name}`, node);
      const base = convertNode(node.base, state);
      if (node.subscript && !node.superscript)
        return `${base}_${subscriptText(node.subscript, state)}`;
      if (node.subscript) {
        unsupported(state, "دليل سفلي مع أس", node);
        return `${base}_${subscriptText(node.subscript, state)}${node.superscript ? `^(${sequenceText(node.superscript, state)})` : ""}`;
      }
      return `${base}${node.superscript ? `^(${sequenceText(node.superscript, state)})` : ""}`;
    }
    case "command": {
      if (node.name in commandMap) return commandMap[node.name];
      if (["mathbb", "mathrm", "mathbf", "mathcal", "text", "operatorname"].includes(node.name))
        return node.args[0] ? sequenceText(node.args[0], state) : "";
      if (["overline", "underline", "conj", "overrightarrow", "leftarrow"].includes(node.name)) {
        unsupported(state, `الأمر \\${node.name}`, node);
        return node.args[0] ? sequenceText(node.args[0], state) : "";
      }
      if (["lim", "sum", "prod", "int", "det", "arg", "partial", "nabla"].includes(node.name)) {
        unsupported(state, `الأمر \\${node.name}`, node);
        return node.name;
      }
      if (["forall", "exists", "in", "notin", "cup", "cap", "setminus", "subset", "subseteq", "Rightarrow", "Leftrightarrow", "emptyset"].includes(node.name)) {
        unsupported(state, `العلاقة \\${node.name}`, node);
        return node.name;
      }
      if (["lfloor", "rfloor", "lceil", "rceil", "vert", "mid", "ldots", "dots", "prime"].includes(node.name))
        return node.name === "prime" ? "'" : "";
      unsupported(state, `الأمر \\${node.name}`, node);
      return node.name;
    }
    case "delimiter": {
      const body = sequenceText(node.body, state);
      if ((node.left === "|" || node.left === "\\vert") && (node.right === "|" || node.right === "\\vert"))
        return `abs(${body})`;
      if (node.left === "(" && node.right === ")") return `(${body})`;
      if (node.left === "[" && node.right === "]") return `[${body}]`;
      unsupported(state, "محددات LaTeX", node);
      return body;
    }
    case "environment": {
      if (node.name === "pmatrix" || node.name === "bmatrix" || node.name === "matrix")
        return `[${node.rows.map((row) => `[${row.map((cell) => sequenceText(cell, state)).join(",")}]`).join(",")}]`;
      unsupported(state, `بيئة ${node.name}`, node);
      return node.rows.flat().map((cell) => sequenceText(cell, state)).join(" ");
    }
    case "unknown-command":
      unsupported(state, `الأمر غير المعروف \\${node.name}`, node);
      return node.name;
  }
}

function normalizeMultiplication(expression: string): string {
  return expression
    .replace(/(\d)([A-Za-z])/g, "$1*$2")
    .replace(/([A-Za-z)])(\d)/g, "$1*$2")
    .replace(/\)\(/g, ")*(")
    .replace(/\s+/g, "")
    .replace(/\+Infinity/g, "Infinity");
}

function limitEnginePhrase(ast: LatexSequenceNode, state: ConversionState): string | undefined {
  const [first, second, ...rest] = ast.children;
  if (!first || first.type !== "script" || first.base.type !== "command" || first.base.name !== "lim" || !first.subscript || !second)
    return undefined;
  const condition = normalizeMultiplication(sequenceText(first.subscript, state));
  const body = normalizeMultiplication(convertNode(second, state));
  if (rest.length || !body || !condition.includes("->")) return undefined;
  // The existing router understands this Arabic intent without changing an engine.
  const [variable, target] = condition.split("->", 2);
  if (!variable || !target) return undefined;
  state.unsupported = state.unsupported.filter((entry) => entry !== "الأمر \\lim");
  state.diagnostics = state.diagnostics.filter((entry) => !entry.message.includes("الأمر \\lim"));
  return `جد نهاية ${body} عندما ${variable} تؤول إلى ${target}`;
}

/** Converts only the supported AST subset; callers must inspect `executable`. */
export function latexToEngine(ast: LatexSequenceNode): EngineConversion {
  const state: ConversionState = { unsupported: [], diagnostics: [] };
  const specialLimit = limitEnginePhrase(ast, state);
  const expression = specialLimit ?? normalizeMultiplication(sequenceText(ast, state));
  return {
    expression,
    executable: Boolean(expression) && state.unsupported.length === 0,
    unsupported: state.unsupported,
    diagnostics: state.diagnostics,
  };
}

export function sourceToEngine(source: string, ast: LatexSequenceNode): EngineConversion {
  const conversion = latexToEngine(ast);
  if (conversion.expression) return conversion;
  return { ...conversion, expression: printLatex(ast) || source };
}
