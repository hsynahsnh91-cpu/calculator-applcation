export type AppMode = 
  | 'scientific' 
  | 'equations' 
  | 'sequences' 
  | 'calculus' 
  | 'integration'
  | 'limits'
  | 'geometry'
  | 'probability' 
  | 'matrices' 
  | 'complex' 
  | 'reference' 
  | 'history';

export type AngleMode = 'DEG' | 'RAD' | 'GRAD';

export type NumberFormat = 'decimal' | 'fraction' | 'scientific' | 'engineering';

// History Item
export interface HistoryEntry {
  id: string;
  timestamp: number;
  mode: AppMode;
  title: string;
  inputLatex: string;
  resultLatex: string;
  resultDecimal?: string;
  steps?: string[];
  tags?: string[];
  favorite?: boolean;
}

// Natural Math Display Structure
export type MathBoxId = string;

export interface MathBoxItem {
  id: MathBoxId;
  type: 
    | 'text'          // e.g. "3.5", "+", "-"
    | 'fraction'      // numerator box + denominator box
    | 'power'         // base box + exponent box (x^\Box)
    | 'sqrt'          // radicand box
    | 'nroot'         // root index box + radicand box
    | 'subscript'     // base box + sub box (u_n)
    | 'abs'           // inner box
    | 'function'      // function name ("sin", "ln", etc.) + argument box
    | 'integral'      // lower box + upper box + integrand box + var box
    | 'summation'     // lower box (i=1) + upper box + term box
    | 'matrix'        // grid of boxes
    | 'parens';       // inner box
  value?: string;
  numerator?: MathBoxItem[];
  denominator?: MathBoxItem[];
  base?: MathBoxItem[];
  exponent?: MathBoxItem[];
  radicand?: MathBoxItem[];
  rootIndex?: MathBoxItem[];
  sub?: MathBoxItem[];
  inner?: MathBoxItem[];
  fnName?: string;
  arg?: MathBoxItem[];
  lower?: MathBoxItem[];
  upper?: MathBoxItem[];
  integrand?: MathBoxItem[];
  varName?: string;
  rows?: number;
  cols?: number;
  matrixCells?: MathBoxItem[][][];
}

// Equation Solver Types
export type EquationType = 'deg1' | 'deg2' | 'deg3' | 'system2' | 'system3' | 'nonlinear';

export interface EquationSolution {
  type: EquationType;
  equationLatex: string;
  steps: {
    title: string;
    description: string;
    mathLatex: string;
  }[];
  roots: {
    label: string;
    exactLatex: string;
    decimal: number | string;
    isComplex?: boolean;
  }[];
  discriminant?: {
    value: number;
    latex: string;
    explanation: string;
  };
  vertex?: { x: number; y: number; latex: string };
  factoredForm?: string;
  inflectionPoint?: { x: number; y: number; latex: string };
  plotData?: {
    xValues: number[];
    yValues: number[];
    rootPoints: { x: number; y: number; label: string }[];
    vertexPoint?: { x: number; y: number; label: string };
  };
}

// Sequence Solver Types
export type SequenceType = 'arithmetic' | 'geometric' | 'recurrence1' | 'recurrence_homographic' | 'recurrence2' | 'explicit';

export interface SequenceSolution {
  type: SequenceType;
  name: string;
  generalTermLatex: string;
  firstTerms: { n: number; value: number; latex: string }[];
  sumFormulaLatex?: string;
  sumValue?: number;
  sumSteps?: string[];
  limit: {
    latex: string;
    value: number | string; // finite, 'infinity', '-infinity', 'undefined'
    converges: boolean;
    explanation: string;
  };
  monotony: {
    type: 'strictly_increasing' | 'strictly_decreasing' | 'constant' | 'alternating' | 'non_monotonic';
    explanationLatex: string;
    title: string;
  };
  boundedness: {
    isBounded: boolean;
    isBoundedBelow: boolean;
    isBoundedAbove: boolean;
    lowerBound?: number;
    upperBound?: number;
    explanation: string;
  };
  auxiliarySequence?: {
    name: string;
    formulaLatex: string;
    reason: string;
  };
  steps: { title: string; latex: string; text?: string }[];
  chartData: { n: number; value: number }[];
}

// Calculus Types
export type CalculusMode = 'derivative' | 'integral' | 'limits' | 'study';

export interface CalculusSolution {
  mode: CalculusMode;
  functionLatex: string;
  firstDerivativeLatex?: string;
  secondDerivativeLatex?: string;
  steps: { title: string; latex: string; explanation?: string }[];
  criticalPoints?: { x: number; y: number; type: 'min' | 'max' | 'inflection'; latex: string }[];
  tangentLine?: { atX: number; equationLatex: string; slope: number };
  integralValue?: {
    indefiniteLatex?: string;
    definiteValue?: number;
    definiteExactLatex?: string;
    decimalLatex?: string;
    lowerLatex?: string;
    upperLatex?: string;
  };
  variationTableLatex?: string;
  methodUsed?: string;
  limitValue?: {
    target: string;
    result: string;
    stepDetails?: string[];
    asymptoteLatex?: string;
    positionLatex?: string;
    kind?: 'finite' | 'infinite' | 'dne';
    targetLatex?: string;
    leftLatex?: string;
    rightLatex?: string;
    twoSided?: boolean;
    note?: string;
  };
  plotPoints?: { x: number; fx: number; fpx?: number; tangent?: number }[];
}

// Probability & Statistics Types
export type ProbabilitySubmode = 'combinatorics' | 'urn_balls' | 'binomial' | 'poisson' | 'normal' | 'stats';

export interface UrnConfig {
  white: number;
  black: number;
  red: number;
  green: number;
  drawCount: number;
  drawMode: 'simultaneous' | 'successive_without_rep' | 'successive_with_rep';
}

export interface DescriptiveStatsResult {
  n: number;
  sum: number;
  mean: number;
  median: number;
  mode: number[];
  variancePop: number;
  varianceSample: number;
  stdDevPop: number;
  stdDevSample: number;
  min: number;
  max: number;
  range: number;
  q1: number;
  q3: number;
  iqr: number;
  dataSorted: number[];
  histogram: { bin: string; count: number; freq: number }[];
}

// Matrix Types
export interface MatrixSolution {
  size: number;
  detA?: number;
  detB?: number;
  inverseA?: number[][];
  transposeA?: number[][];
  rankA?: number;
  traceA?: number;
  eigenvaluesA?: (number | string)[];
  productAB?: number[][];
  sumAB?: number[][];
  diffAB?: number[][];
  steps: { title: string; latex: string; text?: string }[];
  gauss?: {
    ops: { opLatex: string; matrixLatex: string; phase: 'forward' | 'backward' }[];
    echelonLatex: string;
    rrefLatex: string;
    rank: number;
    detLatex?: string;
  };
}

// Complex Number Types
export interface ComplexSolution {
  z1: { re: number; im: number };
  z2?: { re: number; im: number };
  cartesianLatex: string;
  polarLatex: string;
  exponentialLatex: string;
  modulus: number;
  argumentRad: number;
  argumentDeg: number;
  conjugateLatex: string;
  inverseLatex?: string;
  powerResults?: { n: number; latex: string }[];
  roots?: { k: number; latex: string; polar: string; re: number; im: number }[];
  proofs?: {
    polar: { title: string; latex: string; text?: string }[];
    exponential: { title: string; latex: string; text?: string }[];
    powers: { title: string; latex: string; text?: string }[];
    roots: { title: string; latex: string; text?: string }[];
  };
}
