export type LatexTokenKind =
  | "command"
  | "word"
  | "number"
  | "lbrace"
  | "rbrace"
  | "lbracket"
  | "rbracket"
  | "superscript"
  | "subscript"
  | "ampersand"
  | "rowbreak"
  | "operator"
  | "delimiter"
  | "whitespace";

export interface LatexToken {
  kind: LatexTokenKind;
  value: string;
  start: number;
  end: number;
}

const operatorCharacters = new Set(["+", "-", "=", "<", ">", "!", "/", "*", ",", ";", ":", "′", "'", "|"]);
const delimiters = new Set(["(", ")", "[", "]", ".", "⟨", "⟩"]);

/**
 * A lossless, bounded tokenizer. Commands and every delimiter retain their
 * original offsets so callers can explain an unknown command precisely.
 */
export function tokenizeLatex(source: string): LatexToken[] {
  const tokens: LatexToken[] = [];
  let index = 0;
  const push = (kind: LatexTokenKind, value: string, start: number, end: number) =>
    tokens.push({ kind, value, start, end });

  while (index < source.length) {
    const start = index;
    const character = source[index];
    if (/\s/u.test(character)) {
      index++;
      while (index < source.length && /\s/u.test(source[index])) index++;
      push("whitespace", source.slice(start, index), start, index);
      continue;
    }
    if (character === "\\") {
      index++;
      if (source[index] === "\\") {
        index++;
        push("rowbreak", "\\\\", start, index);
        continue;
      }
      if (index < source.length && /[A-Za-z]/.test(source[index])) {
        index++;
        while (index < source.length && /[A-Za-z]/.test(source[index])) index++;
        push("command", source.slice(start + 1, index), start, index);
        continue;
      }
      const escaped = source[index] ?? "";
      if (escaped) index++;
      push("command", escaped, start, index);
      continue;
    }
    if (character === "{") {
      index++;
      push("lbrace", character, start, index);
      continue;
    }
    if (character === "}") {
      index++;
      push("rbrace", character, start, index);
      continue;
    }
    if (character === "[") {
      index++;
      push("lbracket", character, start, index);
      continue;
    }
    if (character === "]") {
      index++;
      push("rbracket", character, start, index);
      continue;
    }
    if (character === "^") {
      index++;
      push("superscript", character, start, index);
      continue;
    }
    if (character === "_") {
      index++;
      push("subscript", character, start, index);
      continue;
    }
    if (character === "&") {
      index++;
      push("ampersand", character, start, index);
      continue;
    }
    if (operatorCharacters.has(character)) {
      index++;
      push("operator", character, start, index);
      continue;
    }
    if (delimiters.has(character)) {
      index++;
      push("delimiter", character, start, index);
      continue;
    }
    if (/\d/u.test(character)) {
      index++;
      while (index < source.length && /[\d.,]/u.test(source[index])) index++;
      push("number", source.slice(start, index), start, index);
      continue;
    }
    index++;
    while (
      index < source.length &&
      !/\s/u.test(source[index]) &&
      !"\\{}[]^_&".includes(source[index]) &&
      !operatorCharacters.has(source[index]) &&
      !delimiters.has(source[index]) &&
      !/\d/u.test(source[index])
    )
      index++;
    push("word", source.slice(start, index), start, index);
  }
  return tokens;
}
