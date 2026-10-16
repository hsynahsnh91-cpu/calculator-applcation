/** JSON-only matrix context shared by the Worker, conversation and on-demand board. */
export type MatrixCells = string[][];
export interface MatrixSystem {
  coefficients: MatrixCells;
  constants: string[];
  variables: string[];
}
export interface MatrixContext {
  values: Record<string, MatrixCells>;
  active?: string;
  lastScalar?: string;
  /** Exact explicitly given real factor k, never inferred from a determinant. */
  scalarFactor?: string;
  system?: MatrixSystem;
  origin?: "matrix" | "geometry" | "statistics" | "system";
}
export const matrixName = (s: string) => /^[A-Z]$/.test(s);
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const scalar = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= 500 &&
  /^[0-9eE+*/^().\s-]+$/.test(v.replace(/sqrt/g, ""));
export function isMatrixCells(v: unknown): v is MatrixCells {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.length <= 6 &&
    v.every(
      (r) =>
        Array.isArray(r) &&
        r.length > 0 &&
        r.length <= 6 &&
        r.length === v[0].length &&
        r.every(scalar),
    )
  );
}
export function isMatrixContext(v: unknown): v is MatrixContext {
  return (
    record(v) &&
    record(v.values) &&
    Object.keys(v.values).length <= 12 &&
    Object.entries(v.values).every(
      ([n, m]) => matrixName(n) && isMatrixCells(m),
    ) &&
    (v.active === undefined ||
      (typeof v.active === "string" &&
        Object.prototype.hasOwnProperty.call(v.values, v.active))) &&
    (v.lastScalar === undefined || scalar(v.lastScalar)) &&
    (v.scalarFactor === undefined || scalar(v.scalarFactor)) &&
    (v.origin === undefined ||
      ["matrix", "geometry", "statistics", "system"].includes(
        String(v.origin),
      )) &&
    (v.system === undefined ||
      (record(v.system) &&
        isMatrixCells(v.system.coefficients) &&
        [2, 3].includes(v.system.coefficients.length) &&
        v.system.coefficients.every(
          (r) => r.length === (v.system as MatrixSystem).coefficients.length,
        ) &&
        Array.isArray(v.system.constants) &&
        v.system.constants.length === v.system.coefficients.length &&
        v.system.constants.every(scalar) &&
        Array.isArray(v.system.variables) &&
        v.system.variables.length === v.system.constants.length &&
        new Set(v.system.variables).size === v.system.variables.length &&
        v.system.variables.every(
          (n) => typeof n === "string" && /^[xyz]$/.test(n),
        )))
  );
}
export type MatrixOperation =
  | "types"
  | "dimensions"
  | "transpose"
  | "trace"
  | "determinant"
  | "inverse"
  | "adjugate"
  | "rank"
  | "echelon"
  | "rref"
  | "expression"
  | "compare"
  | "gauss"
  | "cramer"
  | "eigen"
  | "vectors"
  | "statistics";
export interface MatrixRequest {
  context: MatrixContext;
  name: string;
  operations: MatrixOperation[];
  expression?: string;
  systemName?: string;
  assign?: string;
  comparison?: { left: string; right: string; equal: boolean };
  determinantMethod?: "sarrus" | "expansion";
  expansion?: { axis: "row" | "column"; index: number };
  source: string;
}
