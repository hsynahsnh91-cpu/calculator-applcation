import type { SolverResult } from "./types.js";

export type ComplexOperation =
  | "forms"
  | "euler"
  | "power"
  | "roots"
  | "conjugate"
  | "inverse"
  | "arithmetic"
  | "point"
  | "distance"
  | "angle"
  | "translation"
  | "homothety"
  | "rotation"
  | "trig"
  | "theorem";
export interface ComplexRequest {
  operation: ComplexOperation;
  form?: "algebraic" | "trigonometric" | "exponential" | "all";
  targetName?: string;
  formTargets?: { name: string; expression: string }[];
  deriveFrom?: { name: string; expression: string };
  expression?: string;
  second?: string;
  operator?: "+" | "-" | "*" | "/";
  values: Record<string, string>;
  points: { name: string; expression: string }[];
  exponent?: number;
  rootN?: number;
  center?: string;
  displacement?: string;
  coefficient?: string;
  angle?: string;
  angleUnit?: "DEG" | "RAD" | "GRAD";
  vertex?: string;
  unsigned?: boolean;
  usePoints?: boolean;
  trigFunction?: "cos" | "sin" | "both";
  trigKind?: "multiple" | "power";
  variable?: string;
  theorem?:
    | "euler"
    | "demoivre"
    | "translation"
    | "homothety"
    | "rotation"
    | "distance"
    | "angle";
}
export type ComplexAnswer = Pick<
  SolverResult,
  | "title"
  | "finalLatex"
  | "steps"
  | "visuals"
  | "verification"
  | "contextPatch"
  | "decimal"
  | "note"
>;
export const COMPLEX_EXPLICIT =
  /عقدي|اويلر|اولر|د[يو]\s*موا?فر|ديموافر|ℂ|¢|\bC\b|\bi\b|(?:\d|\))i\b|\bz(?:_?[A-Z]|[1-9])?\b/;
export const COMPLEX_ACTION =
  /شكل|صيغة|صيغ|اسي|جبري|مثلثي|مرافق|مقلوب|قوة|قوته|قوي|قوى|جذور|جذر|مثله|تمثيل|انسحاب|تحاكي|دوران|زاوية|عمدة|طويلة|مسافة|اجمع|اطرح|اقسم/;
export function isComplexIntent(text: string, followUp = false): boolean {
  const plane3D =
    /جملة|نظام/.test(text) ||
    (/مستوي|مستقيم|نقطة|النقط/.test(text) &&
      /\([^()]*,[^()]*,[^()]*\)/.test(text));
  const explicit =
    COMPLEX_EXPLICIT.test(text) &&
    (!plane3D || /عقدي|اويلر|اولر|\bi\b|(?:\d|\))i\b|ℂ|¢/.test(text));
  const plane2D =
    /مسافة|نقطة|النقط|شعاع|متجه/.test(text) &&
    /\(\s*-?[\d.]+\s*,\s*-?[\d.]+\s*\)/.test(text);
  return (
    explicit ||
    plane2D ||
    (followUp &&
      COMPLEX_ACTION.test(text) &&
      !/مصفوف|مشتق|تكامل|متتالي|احتمال/.test(text))
  );
}
