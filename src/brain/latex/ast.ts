export type LatexNode =
  | LatexSequenceNode
  | LatexSymbolNode
  | LatexNumberNode
  | LatexOperatorNode
  | LatexGroupNode
  | LatexFractionNode
  | LatexRootNode
  | LatexScriptNode
  | LatexCommandNode
  | LatexDelimiterNode
  | LatexEnvironmentNode
  | LatexUnknownCommandNode;

export interface LatexPosition {
  start: number;
  end: number;
}

export interface LatexSequenceNode extends LatexPosition {
  type: "sequence";
  children: LatexNode[];
}

export interface LatexSymbolNode extends LatexPosition {
  type: "symbol";
  value: string;
}

export interface LatexNumberNode extends LatexPosition {
  type: "number";
  value: string;
}

export interface LatexOperatorNode extends LatexPosition {
  type: "operator";
  value: string;
}

export interface LatexGroupNode extends LatexPosition {
  type: "group";
  body: LatexSequenceNode;
}

export interface LatexFractionNode extends LatexPosition {
  type: "fraction";
  command: "frac" | "dfrac";
  numerator: LatexSequenceNode;
  denominator: LatexSequenceNode;
}

export interface LatexRootNode extends LatexPosition {
  type: "root";
  index?: LatexSequenceNode;
  radicand: LatexSequenceNode;
}

export interface LatexScriptNode extends LatexPosition {
  type: "script";
  base: LatexNode;
  subscript?: LatexSequenceNode;
  superscript?: LatexSequenceNode;
}

export interface LatexCommandNode extends LatexPosition {
  type: "command";
  name: string;
  args: LatexSequenceNode[];
}

export interface LatexDelimiterNode extends LatexPosition {
  type: "delimiter";
  left: string;
  right: string;
  body: LatexSequenceNode;
}

export interface LatexEnvironmentNode extends LatexPosition {
  type: "environment";
  name: string;
  rows: LatexSequenceNode[][];
}

export interface LatexUnknownCommandNode extends LatexPosition {
  type: "unknown-command";
  name: string;
}

export type LatexDiagnosticCode =
  | "unknown_command"
  | "missing_argument"
  | "missing_closer"
  | "unexpected_token"
  | "malformed_environment";

export interface LatexDiagnostic extends LatexPosition {
  code: LatexDiagnosticCode;
  message: string;
  hint?: string;
}

export interface LatexDocument {
  source: string;
  ast: LatexSequenceNode;
  diagnostics: LatexDiagnostic[];
}

export interface EngineConversion {
  expression: string;
  executable: boolean;
  unsupported: string[];
  diagnostics: LatexDiagnostic[];
}

/** Removes source offsets before a round-trip AST comparison. */
export function comparableLatexAst(node: LatexNode): unknown {
  switch (node.type) {
    case "sequence":
      return { type: node.type, children: node.children.map(comparableLatexAst) };
    case "symbol":
    case "number":
    case "operator":
      return { type: node.type, value: node.value };
    case "group":
      return { type: node.type, body: comparableLatexAst(node.body) };
    case "fraction":
      return {
        type: node.type,
        command: node.command,
        numerator: comparableLatexAst(node.numerator),
        denominator: comparableLatexAst(node.denominator),
      };
    case "root":
      return {
        type: node.type,
        ...(node.index ? { index: comparableLatexAst(node.index) } : {}),
        radicand: comparableLatexAst(node.radicand),
      };
    case "script":
      return {
        type: node.type,
        base: comparableLatexAst(node.base),
        ...(node.subscript ? { subscript: comparableLatexAst(node.subscript) } : {}),
        ...(node.superscript ? { superscript: comparableLatexAst(node.superscript) } : {}),
      };
    case "command":
      return { type: node.type, name: node.name, args: node.args.map(comparableLatexAst) };
    case "delimiter":
      return {
        type: node.type,
        left: node.left,
        right: node.right,
        body: comparableLatexAst(node.body),
      };
    case "environment":
      return {
        type: node.type,
        name: node.name,
        rows: node.rows.map((row) => row.map(comparableLatexAst)),
      };
    case "unknown-command":
      return { type: node.type, name: node.name };
  }
}

export function astEquivalent(first: LatexNode, second: LatexNode): boolean {
  return JSON.stringify(comparableLatexAst(first)) === JSON.stringify(comparableLatexAst(second));
}
