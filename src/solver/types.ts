import type {
  SchoolContext,
  SchoolPart,
  SchoolResultInfo,
} from "./schoolTypes";
import type { AngleMode, AppMode } from "../types";
import type { ProbabilityContext } from "./probabilityTypes";
import type { GeometryContext } from "./geometryTypes";
import type { MatrixContext } from "./matrixTypes";

export const ENGINE_LABELS = {
  mathEngine: "الحساب العلمي",
  equationSolver: "المعادلات",
  sequences: "المتتاليات",
  calculusEngine: "الاشتقاق والتغيرات",
  limitsEngine: "النهايات",
  integrationEngine: "التكامل",
  geometryEngine: "الهندسة الفراغية",
  geometryTools: "المجسمات والمتجهات",
  matricesEngine: "المصفوفات",
  probabilityEngine: "الاحتمالات والإحصاء",
  probabilityTools: "التجارب والشجرة",
  complexEngine: "الأعداد العقدية",
  complexTools: "المعادلات العقدية",
} as const;
export type EngineId = keyof typeof ENGINE_LABELS;
export interface Candidate {
  engine: EngineId;
  confidence: number;
  reason: string;
}
export interface SolverContext {
  expression?: string;
  variable?: string;
  derivative?: string;
  lastEngine?: EngineId;
  lastPrompt?: string;
  assignments: Record<string, number>;
  solutions?: Record<string, number>;
  matrix?: number[][];
  matrices?: MatrixContext;
  probability?: ProbabilityContext;
  geometry?: GeometryContext;
  school?: SchoolContext;
  complex?: {
    values: Record<string, string>;
    current?: string;
    ambiguous?: boolean;
    pointNames?: string[];
  };
}
export const emptyContext = (): SolverContext => ({ assignments: {} });
export interface ParsedPrompt {
  parts?: SchoolPart[];
  preamble?: string;
  original: string;
  text: string;
  requests: string[];
  context: SolverContext;
}
export interface SolutionStep {
  title: string;
  text?: string;
  latex: string;
}
export interface Verification {
  passed: boolean;
  method: string;
  samples?: number;
  maxError?: number;
}
export interface CurveSeries {
  label: string;
  points: { x: number; y: number | null }[];
  color?: string;
  dots?: boolean;
}
export interface CurveVisual {
  kind: "curve";
  title: string;
  series: CurveSeries[];
}
export interface TableVisual {
  kind: "table";
  title: string;
  latex: string;
}
export interface FormulaCardsVisual {
  kind: "formula-cards";
  title: string;
  cards: { label: string; latex: string; caption?: string }[];
}
export interface ComplexVisual {
  kind: "complex";
  title: string;
  points: { re: number; im: number; label: string }[];
  circle?: { re: number; im: number; radius: number };
  connections?: { from: number; to: number; arrow?: boolean; label?: string }[];
}
export interface TreeNode {
  label: string;
  probability: string;
  children?: TreeNode[];
}
export interface TreeVisual {
  kind: "tree";
  title: string;
  root: TreeNode;
}
export interface HistogramVisual {
  kind: "histogram";
  title: string;
  bins: { label: string; value: number; start?: number; end?: number }[];
  density?: boolean;
  discrete?: boolean;
  color?: string;
  note?: string;
}
export interface SpaceVisual {
  kind: "space";
  title: string;
  points: {
    position: [number, number, number];
    label: string;
    latex?: string;
  }[];
  lines?: {
    point: [number, number, number];
    direction: [number, number, number];
    label: string;
  }[];
  planes?: {
    normal: [number, number, number];
    offset: number;
    label: string;
  }[];
  segments?: { from: number; to: number; arrow?: boolean; dashed?: boolean }[];
  sphere?: { center: [number, number, number]; radius: number };
  solid?: {
    id: import("../utils/geometryTools").SolidId;
    dimensions: Record<string, number>;
  };
}
export type Visual =
  | SpaceVisual
  | CurveVisual
  | HistogramVisual
  | TableVisual
  | ComplexVisual
  | TreeVisual
  | FormulaCardsVisual;
export interface SolverResult {
  school?: SchoolResultInfo;
  id: string;
  engine: EngineId;
  engines: EngineId[];
  mode: AppMode;
  title: string;
  finalLatex: string;
  decimal?: number | string;
  steps: SolutionStep[];
  visuals: Visual[];
  verification: Verification;
  contextPatch?: Partial<SolverContext>;
  note?: string;
}
export interface UnsolvedPart {
  school?: SchoolResultInfo;
  request: string;
  engine?: EngineId;
  message: string;
  choices: string[];
}
export interface SolverAnswer {
  id: string;
  question: string;
  intro: string;
  results: SolverResult[];
  unsolved: UnsolvedPart[];
  suggestions: string[];
  candidates: Candidate[];
  context: SolverContext;
  elapsedMs: number;
}
export interface SolverProgress {
  stage: "analyzing" | "running" | "verifying";
  engines: EngineId[];
  results?: SolverResult[];
}
export interface SolveOptions {
  angleMode: AngleMode;
  context?: SolverContext;
}
export interface ConversationTurn {
  id: string;
  question: string;
  answer: SolverAnswer;
  createdAt: number;
  image?: string;
}
export class ClarificationError extends Error {
  constructor(
    message: string,
    public choices: string[] = [],
  ) {
    super(message);
    this.name = "ClarificationError";
  }
}
export type WorkerRequest = {
  id: string;
  question: string;
  options: SolveOptions;
};
export type WorkerReply =
  | { id: string; type: "progress"; progress: SolverProgress }
  | { id: string; type: "answer"; answer: SolverAnswer }
  | { id: string; type: "error"; message: string };
