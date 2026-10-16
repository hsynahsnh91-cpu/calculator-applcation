import type { UrnModel } from "./probabilityTypes";
export type SchoolIntent =
  | "compute"
  | "write"
  | "solve"
  | "prove"
  | "deduce"
  | "verify"
  | "study"
  | "draw"
  | "explain"
  | "setup";
export interface SchoolPart {
  label: string;
  title: string;
  text: string;
  intent: SchoolIntent;
  depends: boolean;
  setup: boolean;
}
export interface SchoolDocument {
  preamble: string;
  parts: SchoolPart[];
}
export interface SchoolContext {
  functions?: Record<string, { expression: string; variable: string }>;
  sequence?: string;
  urns?: Record<string, Pick<UrnModel, "colors">>;
  urnOrder?: string[];
  weights?: string[];
  activeUrn?: string;
  experiment?: number;
  randomVariable?: {
    symbol: "X" | "Y";
    color: string;
    urn?: string;
    experiment: number;
  };
  observation?: { color: string; symbol: string };
  values?: Record<string, string>;
}
export interface SchoolResultInfo {
  label: string;
  title: string;
  intent: SchoolIntent;
  showDecimal: boolean;
}
const rec = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const string = (v: unknown, max = 900): v is string =>
  typeof v === "string" && v.length <= max;
export function isSchoolContext(v: unknown): v is SchoolContext {
  if (!rec(v)) return false;
  if (
    v.functions !== undefined &&
    (!rec(v.functions) ||
      Object.keys(v.functions).length > 3 ||
      !Object.entries(v.functions).every(
        ([k, x]) =>
          /^[fgh]$/.test(k) &&
          rec(x) &&
          string(x.expression) &&
          string(x.variable, 1) &&
          /^[a-z]$/.test(String(x.variable)),
      ))
  )
    return false;
  if (v.sequence !== undefined && !string(v.sequence, 1800)) return false;
  if (
    v.urns !== undefined &&
    (!rec(v.urns) ||
      Object.keys(v.urns).length > 8 ||
      !Object.entries(v.urns).every(
        ([k, u]) =>
          /^U[1-8]$/.test(k) &&
          rec(u) &&
          Array.isArray(u.colors) &&
          u.colors.length > 0 &&
          u.colors.length <= 8 &&
          u.colors.every(
            (c) =>
              rec(c) &&
              string(c.name, 40) &&
              typeof c.count === "number" &&
              Number.isSafeInteger(c.count) &&
              c.count >= 0 &&
              c.count <= 1000000,
          ),
      ))
  )
    return false;
  if (
    v.urnOrder !== undefined &&
    (!Array.isArray(v.urnOrder) ||
      v.urnOrder.length > 8 ||
      !v.urnOrder.every(
        (k) =>
          typeof k === "string" &&
          rec(v.urns) &&
          Object.prototype.hasOwnProperty.call(v.urns, k),
      ))
  )
    return false;
  if (
    v.weights !== undefined &&
    (!Array.isArray(v.weights) ||
      v.weights.length > 8 ||
      !v.weights.every(
        (w) => string(w, 500) && /^[0-9eE+*/^().%\s-]+$/.test(w),
      ))
  )
    return false;
  if (
    v.activeUrn !== undefined &&
    (!string(v.activeUrn, 2) ||
      !rec(v.urns) ||
      !Object.prototype.hasOwnProperty.call(v.urns, v.activeUrn))
  )
    return false;
  if (
    v.experiment !== undefined &&
    (typeof v.experiment !== "number" ||
      !Number.isSafeInteger(v.experiment) ||
      v.experiment < 0 ||
      v.experiment > 1000000)
  )
    return false;
  if (
    v.randomVariable !== undefined &&
    (!rec(v.randomVariable) ||
      !["X", "Y"].includes(String(v.randomVariable.symbol)) ||
      !string(v.randomVariable.color, 40) ||
      typeof v.randomVariable.experiment !== "number" ||
      !Number.isSafeInteger(v.randomVariable.experiment) ||
      v.randomVariable.experiment < 0 ||
      (v.randomVariable.urn !== undefined &&
        (!string(v.randomVariable.urn, 2) ||
          !rec(v.urns) ||
          !Object.prototype.hasOwnProperty.call(v.urns, v.randomVariable.urn))))
  )
    return false;
  if (
    v.observation !== undefined &&
    (!rec(v.observation) ||
      !string(v.observation.color, 40) ||
      !string(v.observation.symbol, 1) ||
      !/^[A-Z]$/.test(String(v.observation.symbol)))
  )
    return false;
  if (
    v.values !== undefined &&
    (!rec(v.values) ||
      Object.keys(v.values).length > 12 ||
      !Object.entries(v.values).every(
        ([k, x]) =>
          /^[A-Z]$/.test(k) &&
          string(x) &&
          /^[0-9eE+*/^().\s-]+$/.test(
            x.replace(
              /\b(?:sqrt|exp|sin|cos|tan|log|atan|abs|conj|pi|i|e)\b/g,
              "",
            ),
          ),
      ))
  )
    return false;
  return true;
}
export function isSchoolResultInfo(v: unknown): v is SchoolResultInfo {
  return (
    rec(v) &&
    string(v.label, 100) &&
    string(v.title, 1000) &&
    [
      "compute",
      "write",
      "solve",
      "prove",
      "deduce",
      "verify",
      "study",
      "draw",
      "explain",
      "setup",
    ].includes(String(v.intent)) &&
    typeof v.showDecimal === "boolean"
  );
}
