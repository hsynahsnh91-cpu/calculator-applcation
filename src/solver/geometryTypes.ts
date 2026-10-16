import type { AngleMode } from "../types";
import type { SolidId } from "../utils/geometryTools";
import type { SolverResult } from "./types";
export type SpaceVector = [string, string, string];
export interface SpaceLine {
  point: SpaceVector;
  direction: SpaceVector;
}
export interface SpacePlane {
  normal: SpaceVector;
  offset: string;
}
export interface SpaceSphere {
  center: SpaceVector;
  radiusSquared: string;
}
export interface SpaceModel {
  points: Record<string, SpaceVector>;
  vectors: Record<string, SpaceVector>;
  lines: Record<string, SpaceLine>;
  planes: Record<string, SpacePlane>;
}
export type SpaceOperation =
  | "vector"
  | "norm"
  | "distance"
  | "vector-arithmetic"
  | "dependence"
  | "collinear"
  | "coplanar"
  | "barycenter"
  | "dot"
  | "geometric-dot"
  | "normal"
  | "plane"
  | "bisector"
  | "line"
  | "planes"
  | "line-plane"
  | "lines"
  | "distance-plane"
  | "distance-line"
  | "sphere"
  | "sphere-diameter"
  | "sphere-equation"
  | "tetrahedron"
  | "parallelepiped"
  | "solid"
  | "pyramid-volume"
  | "matrix"
  | "line-system"
  | "plot"
  | "theory";
export interface SpaceRequest {
  operation: SpaceOperation;
  outputName?: string;
  model: SpaceModel;
  points: string[];
  vectors: string[];
  lines: string[];
  planes: string[];
  weights?: string[];
  coefficient?: string;
  arithmetic?: "add" | "subtract" | "opposite" | "scale" | "cross";
  geometricDot?: { norms: [string, string]; angle: string; unit: AngleMode };
  sphere?: SpaceSphere;
  radius?: string;
  solid?: { id: SolidId; dimensions: Record<string, string> };
  pyramid?: { area: string; height: string };
  showApplication?: boolean;
}
export interface GeometryContext extends SpaceModel {
  operation: SpaceOperation;
  active: {
    points: string[];
    vectors: string[];
    lines: string[];
    planes: string[];
  };
  inputs?: {
    points: string[];
    vectors: string[];
    lines: string[];
    planes: string[];
  };
  arithmetic?: SpaceRequest["arithmetic"];
  coefficient?: string;
  radius?: string;
  weights?: string[];
  geometricDot?: SpaceRequest["geometricDot"];
  sphere?: SpaceSphere;
  solid?: SpaceRequest["solid"];
  pyramid?: { area: string; height: string };
  lastScalar?: number;
  lastScalarExpression?: string;
}
export type SpaceAnswer = Pick<
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
export const emptySpaceModel = (): SpaceModel => ({
  points: {},
  vectors: {},
  lines: {},
  planes: {},
});
const rec = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const expression = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= 500 &&
  /^[0-9eE+*/^().\s-]+$/.test(v.replace(/sqrt|cos|pi/g, ""));
const scalar = expression;

const vec = (v: unknown): v is SpaceVector =>
  Array.isArray(v) && v.length === 3 && v.every(scalar);
const map = (
  v: unknown,
  max: number,
  key: RegExp,
  check: (x: unknown) => boolean,
) =>
  rec(v) &&
  Object.keys(v).length <= max &&
  Object.entries(v).every(([k, x]) => key.test(k) && check(x));
const line = (v: unknown) => rec(v) && vec(v.point) && vec(v.direction);
const plane = (v: unknown) => rec(v) && vec(v.normal) && scalar(v.offset);
const sphere = (v: unknown) =>
  rec(v) && vec(v.center) && scalar(v.radiusSquared);
export const SPACE_OPERATIONS: SpaceOperation[] = [
  "vector",
  "norm",
  "distance",
  "vector-arithmetic",
  "dependence",
  "collinear",
  "coplanar",
  "barycenter",
  "dot",
  "geometric-dot",
  "normal",
  "plane",
  "bisector",
  "line",
  "planes",
  "line-plane",
  "lines",
  "distance-plane",
  "distance-line",
  "sphere",
  "sphere-diameter",
  "sphere-equation",
  "tetrahedron",
  "parallelepiped",
  "solid",
  "pyramid-volume",
  "matrix",
  "line-system",
  "plot",
  "theory",
];
export function spaceSolidDimensions(id: string): string[] {
  return id === "cube"
    ? ["a"]
    : id === "cuboid"
      ? ["a", "b", "c"]
      : id === "sphere"
        ? ["r"]
        : id === "pyramid"
          ? ["a", "h"]
          : id === "triangularPrism"
            ? ["area", "perimeter", "h"]
            : id === "cone" || id === "cylinder"
              ? ["r", "h"]
              : [];
}
export function isGeometryContext(v: unknown): v is GeometryContext {
  if (
    !rec(v) ||
    !SPACE_OPERATIONS.includes(v.operation as SpaceOperation) ||
    !map(v.points, 16, /^[A-Z][1-4]?$/, vec) ||
    !map(v.vectors, 12, /^(?:[a-z]|[A-Z]{2})$/, vec) ||
    !map(v.lines, 6, /^(?:[DLd][1-6]?)$/, line) ||
    !map(v.planes, 6, /^(?:[PQR][1-6]?|Pi[1-6]?|alpha|beta)$/, plane) ||
    !rec(v.active)
  )
    return false;
  for (const key of ["points", "vectors", "lines", "planes"] as const) {
    const names = v.active[key];
    if (
      !Array.isArray(names) ||
      names.length > 16 ||
      !names.every(
        (n) =>
          typeof n === "string" &&
          Object.prototype.hasOwnProperty.call(v[key], n),
      )
    )
      return false;
  }
  if (v.inputs !== undefined) {
    if (!rec(v.inputs)) return false;
    for (const key of ["points", "vectors", "lines", "planes"] as const) {
      const names = v.inputs[key];
      if (
        !Array.isArray(names) ||
        names.length > 16 ||
        !names.every(
          (n) =>
            typeof n === "string" &&
            Object.prototype.hasOwnProperty.call(v[key], n),
        )
      )
        return false;
    }
  }
  if (
    v.arithmetic !== undefined &&
    !["add", "subtract", "opposite", "scale", "cross"].includes(
      String(v.arithmetic),
    )
  )
    return false;
  if (v.coefficient !== undefined && !scalar(v.coefficient)) return false;
  if (v.radius !== undefined && !scalar(v.radius)) return false;
  if (
    v.pyramid !== undefined &&
    (!rec(v.pyramid) || !scalar(v.pyramid.area) || !scalar(v.pyramid.height))
  )
    return false;
  if (
    v.weights !== undefined &&
    (!Array.isArray(v.weights) ||
      v.weights.length < 2 ||
      v.weights.length > 4 ||
      !v.weights.every(scalar))
  )
    return false;
  if (v.sphere !== undefined && !sphere(v.sphere)) return false;
  if (
    v.geometricDot !== undefined &&
    (!rec(v.geometricDot) ||
      !Array.isArray(v.geometricDot.norms) ||
      v.geometricDot.norms.length !== 2 ||
      !v.geometricDot.norms.every(scalar) ||
      !scalar(v.geometricDot.angle) ||
      !["DEG", "RAD", "GRAD"].includes(String(v.geometricDot.unit)))
  )
    return false;
  if (
    v.solid !== undefined &&
    (!rec(v.solid) ||
      ![
        "cube",
        "cuboid",
        "sphere",
        "cylinder",
        "cone",
        "pyramid",
        "triangularPrism",
      ].includes(String(v.solid.id)) ||
      !rec(v.solid.dimensions) ||
      Object.keys(v.solid.dimensions).length > 4 ||
      !spaceSolidDimensions(String(v.solid.id)).every((k) =>
        Object.prototype.hasOwnProperty.call(
          (v.solid as { dimensions: Record<string, unknown> }).dimensions,
          k,
        ),
      ) ||
      !Object.entries(v.solid.dimensions).every(
        ([k, x]) => /^(?:a|b|c|r|h|area|perimeter)$/.test(k) && scalar(x),
      ))
  )
    return false;
  if (
    v.lastScalar !== undefined &&
    (typeof v.lastScalar !== "number" || !Number.isFinite(v.lastScalar))
  )
    return false;
  if (
    v.lastScalarExpression !== undefined &&
    (!scalar(v.lastScalarExpression) || v.lastScalar === undefined)
  )
    return false;
  return true;
}
